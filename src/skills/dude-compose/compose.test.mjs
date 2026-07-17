// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  cmdAdd,
  cmdRemove,
  cmdList,
  cmdStatus,
  cmdVerify,
  readProfile,
  isMainModule,
} from './compose.mjs';
import { inventoryDigest } from '../dude-engine/lib/profile.mjs';

/**
 * Build a throwaway bundle root with a minimal `.github/` and a small pack
 * catalog. Returns the root dir (caller removes it).
 * @returns {string}
 */
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-'));
  // minimal .github
  for (const d of ['agents', 'skills', 'instructions', 'prompts']) {
    fs.mkdirSync(path.join(root, '.github', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.dude', 'metadata'), { recursive: true });
  // catalog: pack "demo" with one agent + one skill
  const demo = path.join(root, 'library', 'packs', 'demo');
  fs.mkdirSync(path.join(demo, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(demo, 'skills', 'dude-pack-demo-helper'), { recursive: true });
  fs.writeFileSync(path.join(demo, 'pack.md'), '---\nname: demo\ndescription: "demo pack"\n---\n# Demo\n');
  fs.writeFileSync(
    path.join(demo, 'agents', 'dude-pack-demo-worker.agent.md'),
    '---\nname: demo-worker\n---\n# Worker\n'
  );
  fs.writeFileSync(
    path.join(demo, 'skills', 'dude-pack-demo-helper', 'SKILL.md'),
    '---\nname: dude-pack-demo-helper\ndescription: "helper"\n---\n# Helper\n'
  );
  return root;
}

/** @param {string} root */
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * A bundle root with an empty `.github/` and an empty local catalog (no packs).
 * @returns {string}
 */
function bareRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-root-'));
  for (const d of ['agents', 'skills', 'instructions', 'prompts']) {
    fs.mkdirSync(path.join(root, '.github', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.dude', 'metadata'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'packs'), { recursive: true });
  return root;
}

/**
 * A throwaway "upstream" tree containing a single skill-only pack at
 * `library/packs/<name>/`. Returns the tree root (caller removes it).
 * @param {string} name
 * @returns {string}
 */
function upstreamWith(name) {
  const up = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-upstream-'));
  const pk = path.join(up, 'library', 'packs', name);
  fs.mkdirSync(path.join(pk, 'skills', `dude-pack-${name}-s`), { recursive: true });
  fs.writeFileSync(path.join(pk, 'pack.md'), `---\nname: ${name}\ndescription: "x"\n---\n# ${name}\n`);
  fs.writeFileSync(
    path.join(pk, 'skills', `dude-pack-${name}-s`, 'SKILL.md'),
    `---\nname: dude-pack-${name}-s\ndescription: "s"\n---\n# S\n`
  );
  return up;
}

/** @param {string} sourceRepo @returns {string} a seeded bundle-manifest.md body */
function manifestBody(sourceRepo) {
  const json = JSON.stringify(
    { source_repo: sourceRepo, source_ref: 'main', installed_ref: 'main' },
    null,
    2
  );
  return `# Bundle Manifest\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

/** @param {unknown} profile @returns {string} */
function profileBody(profile) {
  return `# Install Profile\n\n\`\`\`json\n${JSON.stringify(profile, null, 2)}\n\`\`\`\n`;
}

/** @param {string} file */
function hashFileArtifact(file) {
  return crypto
    .createHash('sha256')
    .update('file\0\0')
    .update(fs.readFileSync(file))
    .update('\0')
    .digest('hex');
}

/**
 * Capture exact file bytes and directory shape without following links.
 * @param {string} root
 * @param {string[]} relativePaths
 * @returns {Array<{ path: string, type: string, bytes?: string, target?: string }>}
 */
function snapshotRecursiveBytes(root, relativePaths) {
  /** @type {Array<{ path: string, type: string, bytes?: string, target?: string }>} */
  const snapshot = [];
  /** @param {string} relativePath */
  function visit(relativePath) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        snapshot.push({ path: relativePath, type: 'missing' });
        return;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      snapshot.push({ path: relativePath, type: 'symlink', target: fs.readlinkSync(absolutePath) });
      return;
    }
    if (stat.isDirectory()) {
      snapshot.push({ path: relativePath, type: 'directory' });
      for (const name of fs.readdirSync(absolutePath).sort()) {
        visit(path.posix.join(relativePath, name));
      }
      return;
    }
    if (stat.isFile()) {
      snapshot.push({ path: relativePath, type: 'file', bytes: fs.readFileSync(absolutePath).toString('base64') });
      return;
    }
    snapshot.push({ path: relativePath, type: 'other' });
  }
  for (const relativePath of [...relativePaths].sort()) visit(relativePath);
  return snapshot;
}

/** @param {string} root */
function snapshotComposeMutationBytes(root) {
  return snapshotRecursiveBytes(root, ['.github', '.dude/metadata']);
}

/**
 * Add a small prompt-only pack to a catalog.
 * @param {string} library
 * @param {string} name
 * @param {string} promptName
 */
function addPromptPack(library, name, promptName) {
  const pack = path.join(library, name);
  const namespacedPrompt = promptName.startsWith(`dude-pack-${name}-`)
    ? promptName
    : `dude-pack-${name}-${promptName}`;
  fs.mkdirSync(path.join(pack, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'pack.md'), `---\nname: ${name}\ndescription: "prompt pack"\n---\n# ${name}\n`);
  fs.writeFileSync(
    path.join(pack, 'prompts', namespacedPrompt),
    `---\ndescription: "${name} prompt"\n---\n# ${name}\n`,
  );
}

test('add installs artifacts and records the profile', () => {
  const root = scaffold();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(r.ok, true, r.error);
    assert.ok(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')));
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper/SKILL.md')));

    const profile = readProfile(root);
    assert.deepEqual(profile.enabled_packs, ['demo']);
    assert.ok(profile.installed.demo);
    assert.equal(profile.installed.demo.files.length, 2);
  } finally {
    cleanup(root);
  }
});

test('add and remove succeed with canonical ideas present', () => {
  const root = scaffold();
  try {
    const library = path.join(root, 'library', 'packs');
    const ideaPath = path.join(root, '.dude/ideas/compose.md');
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.writeFileSync(ideaPath, '# Canonical idea\n');

    const added = cmdAdd({ root, library, name: 'demo', force: false });

    assert.equal(added.ok, true, added.error);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), true);
    assert.ok(readProfile(root).installed.demo);

    const removed = cmdRemove({ root, name: 'demo' });

    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), false);
    assert.equal(readProfile(root).installed.demo, undefined);
    assert.equal(fs.readFileSync(ideaPath, 'utf8'), '# Canonical idea\n');
  } finally {
    cleanup(root);
  }
});

test('add and remove ignore recursively empty legacy intake roots', () => {
  const root = scaffold();
  try {
    const library = path.join(root, 'library', 'packs');
    const rootBrief = path.join(root, 'brief/recursively/empty');
    const dudeBrief = path.join(root, '.dude/brief/also/empty');
    fs.mkdirSync(rootBrief, { recursive: true });
    fs.mkdirSync(dudeBrief, { recursive: true });

    const added = cmdAdd({ root, library, name: 'demo', force: false });
    const removed = cmdRemove({ root, name: 'demo' });

    assert.equal(added.ok, true, added.error);
    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(rootBrief), true);
    assert.equal(fs.existsSync(dudeBrief), true);
  } finally {
    cleanup(root);
  }
});

test('add and remove refuse a symlinked metadata directory before any write', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const root = scaffold();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-metadata-link-'));
  try {
    const metadataDir = path.join(root, '.dude/metadata');
    fs.rmSync(metadataDir, { recursive: true, force: true });
    fs.symlinkSync(outside, metadataDir, 'dir');

    const added = cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    const removed = cmdRemove({ root, name: 'demo' });

    assert.equal(added.ok, false);
    assert.match(added.error || '', /symbolic link/);
    assert.equal(removed.ok, false);
    assert.match(removed.error || '', /symbolic link/);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), false);
    assert.deepEqual(fs.readdirSync(outside), [], 'no writes into the external metadata target');
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('add rejects a symlinked canonical profile without changing its external target', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const root = scaffold();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-profile-link-'));
  try {
    const externalProfile = path.join(outside, 'profile.md');
    const content = profileBody({ enabled_packs: [], installed: {} });
    fs.writeFileSync(externalProfile, content);
    fs.symlinkSync(externalProfile, path.join(root, '.dude/metadata/profile.md'));

    const result = cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /symbolic link/);
    assert.equal(fs.readFileSync(externalProfile, 'utf8'), content);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), false);
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('add is idempotent when already installed', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(r.ok, true);
    assert.equal(r.result.alreadyInstalled, true);
  } finally {
    cleanup(root);
  }
});

test('list reports installed flag', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    let r = cmdList({ root, library: lib });
    assert.equal(r.result.packs.find((/** @type {any} */ p) => p.name === 'demo').installed, false);
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    r = cmdList({ root, library: lib });
    assert.equal(r.result.packs.find((/** @type {any} */ p) => p.name === 'demo').installed, true);
  } finally {
    cleanup(root);
  }
});

test('remove deletes exactly what was installed and clears the profile', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdRemove({ root, name: 'demo' });
    assert.equal(r.ok, true, r.error);
    assert.ok(!fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')));
    assert.ok(!fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper')));

    const profile = readProfile(root);
    assert.deepEqual(profile.enabled_packs, []);
    assert.equal(profile.installed.demo, undefined);
  } finally {
    cleanup(root);
  }
});

const inventorylessRemovalScenarios = [
  {
    name: 'namespace artifacts with no profile',
    profileStatus: 'absent',
    /** @param {string} root */
    arrange(root) {
      const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
      assert.equal(added.ok, true, added.error);
      fs.rmSync(path.join(root, '.dude/metadata/profile.md'));
    },
  },
  {
    name: 'readable files-only legacy profile',
    profileStatus: 'valid',
    /** @param {string} root */
    arrange(root) {
      const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
      assert.equal(added.ok, true, added.error);
      const profile = readProfile(root);
      delete profile.installed.demo.inventory;
      fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));
    },
  },
];

for (const scenario of inventorylessRemovalScenarios) {
  test(`remove refuses ${scenario.name} without mutating artifacts or profile`, () => {
    const root = scaffold();
    try {
      // Arrange
      scenario.arrange(root);
      const statusBefore = cmdStatus({ root });
      const diagnosis = cmdVerify({ root, library: path.join(root, 'missing-catalog') });
      assert.equal(statusBefore.ok, true, statusBefore.error);
      assert.equal(diagnosis.result.profile.status, scenario.profileStatus);
      const before = snapshotComposeMutationBytes(root);

      // Act
      const result = cmdRemove({ root, name: 'demo' });

      // Assert
      assert.equal(result.ok, false, `${scenario.name}: removal must require a complete current inventory`);
      assert.equal(result.code, 2);
      assert.match(result.error || '', /complete.*inventory|inventory.*(?:incomplete|required|missing)/i);
      assert.deepEqual(snapshotComposeMutationBytes(root), before);
      assert.deepEqual(cmdStatus({ root }), statusBefore);
    } finally {
      cleanup(root);
    }
  });
}

const incompleteInventoryScenarios = [
  {
    name: 'missing installed artifact hash',
    /** @param {any} profile */
    mutate(profile) {
      delete profile.installed.demo.inventory.artifacts[0].installed_sha256;
    },
  },
  {
    name: 'missing artifact records',
    /** @param {any} profile */
    mutate(profile) {
      delete profile.installed.demo.inventory.artifacts;
    },
  },
  {
    name: 'extra file without matching artifact evidence',
    /** @param {any} profile @param {string} root */
    mutate(profile, root) {
      const extraPath = '.github/agents/dude-pack-demo-extra.agent.md';
      fs.writeFileSync(path.join(root, ...extraPath.split('/')), '# Extra\n');
      profile.installed.demo.files.push(extraPath);
      profile.installed.demo.inventory.artifacts.push({});
    },
  },
];

for (const scenario of incompleteInventoryScenarios) {
  test(`remove refuses incomplete inventory without mutation: ${scenario.name}`, () => {
    const root = scaffold();
    try {
      // Arrange
      const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
      assert.equal(added.ok, true, added.error);
      const profile = readProfile(root);
      scenario.mutate(profile, root);
      fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));
      const readableProfile = readProfile(root);
      assert.equal(readableProfile.installed.demo.inventory, undefined, 'fixture must downgrade to readable incomplete evidence');
      const before = snapshotComposeMutationBytes(root);

      // Act
      const result = cmdRemove({ root, name: 'demo' });

      // Assert
      assert.equal(result.ok, false, `${scenario.name}: removal must require a complete current inventory`);
      assert.equal(result.code, 2);
      assert.match(result.error || '', /complete.*inventory|inventory.*(?:incomplete|required|missing)/i);
      assert.deepEqual(snapshotComposeMutationBytes(root), before);
    } finally {
      cleanup(root);
    }
  });
}

const unrelatedPackEvidenceScenarios = [
  {
    name: 'a second pack carries legacy-incomplete inventory',
    /** @param {string} root @param {string} library */
    arrange(root, library) {
      addPromptPack(library, 'beta', 'beta.prompt.md');
      assert.equal(cmdAdd({ root, library, name: 'beta', force: false }).ok, true);
      const profile = /** @type {any} */ (readProfile(root));
      assert.ok(profile.installed.beta.inventory, 'fixture requires beta to install a current inventory');
      delete profile.installed.beta.inventory.artifacts[0].installed_sha256;
      fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));
    },
  },
  {
    name: 'a second pack carries a files-only legacy entry',
    /** @param {string} root @param {string} library */
    arrange(root, library) {
      addPromptPack(library, 'beta', 'beta.prompt.md');
      assert.equal(cmdAdd({ root, library, name: 'beta', force: false }).ok, true);
      const profile = /** @type {any} */ (readProfile(root));
      delete profile.installed.beta.inventory;
      fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));
    },
  },
  {
    name: 'the profile carries an enabled-only ghost pack',
    /** @param {string} root */
    arrange(root) {
      const profile = readProfile(root);
      profile.enabled_packs.push('ghost');
      fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));
    },
  },
];

for (const scenario of unrelatedPackEvidenceScenarios) {
  test(`remove refuses when the profile contains unrelated non-current pack evidence: ${scenario.name}`, () => {
    const root = bareRoot();
    const library = path.join(root, 'library', 'packs');
    try {
      // Arrange
      addPromptPack(library, 'alpha', 'alpha.prompt.md');
      assert.equal(cmdAdd({ root, library, name: 'alpha', force: false }).ok, true, 'fixture must install the selected pack');
      scenario.arrange(root, library);
      const statusBefore = cmdStatus({ root });
      assert.equal(statusBefore.ok, true, statusBefore.error);
      const before = snapshotComposeMutationBytes(root);

      // Act
      const result = cmdRemove({ root, name: 'alpha' });

      // Assert
      assert.equal(result.ok, false, `${scenario.name}: removing the selected pack must not rewrite unrelated non-current evidence`);
      assert.equal(result.code, 2);
      assert.deepEqual(snapshotComposeMutationBytes(root), before, `${scenario.name}: every artifact and profile byte must be unchanged`);
      assert.deepEqual(cmdStatus({ root }), statusBefore, `${scenario.name}: status must remain readable and unchanged`);
    } finally {
      cleanup(root);
    }
  });
}

test('remove fails closed on malformed profile JSON without deleting installed files', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    const added = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const profilePath = path.join(root, '.dude/metadata/profile.md');
    const malformed = '# Install Profile\n\n```json\n{"enabled_packs": [\n```\n';
    fs.writeFileSync(profilePath, malformed);

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /profile.*malformed JSON/i);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), malformed);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), true);
    assert.equal(fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper')), true);
  } finally {
    cleanup(root);
  }
});

test('remove rejects traversal in a profile path without deleting outside the workspace', () => {
  const root = scaffold();
  const outsideName = `dude-compose-outside-${path.basename(root)}.txt`;
  const outside = path.resolve(root, '..', '..', outsideName);
  try {
    fs.writeFileSync(outside, 'keep me\n');
    const profile = {
      enabled_packs: ['demo'],
      installed: {
        demo: {
          files: [`../../${outsideName}`],
          installed_at: '2026-07-09T00:00:00.000Z',
        },
      },
    };
    fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /unsafe|approved pack installation root|traversal/i);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep me\n');
  } finally {
    fs.rmSync(outside, { force: true });
    cleanup(root);
  }
});

test('remove rejects a symlinked profile target without touching its destination', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const root = scaffold();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-profile-outside-'));
  try {
    const lib = path.join(root, 'library', 'packs');
    const added = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const installedSkill = path.join(root, '.github/skills/dude-pack-demo-helper');
    fs.rmSync(installedSkill, { recursive: true, force: true });
    fs.writeFileSync(path.join(outside, 'keep.md'), '# Keep\n');
    fs.symlinkSync(outside, installedSkill);

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /symbolic link/);
    assert.equal(fs.readFileSync(path.join(outside, 'keep.md'), 'utf8'), '# Keep\n');
    assert.equal(fs.lstatSync(installedSkill).isSymbolicLink(), true);
  } finally {
    cleanup(outside);
    cleanup(root);
  }
});

test('remove rejects a profile path not owned by the local pack catalog', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    const added = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const projectInstruction = path.join(root, '.github/instructions/project.instructions.md');
    fs.writeFileSync(projectInstruction, '# Project-owned\n');
    const profile = readProfile(root);
    profile.installed.demo.files.push('.github/instructions/project.instructions.md');
    fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /not declared by|not owned by.*demo/i);
    assert.equal(fs.readFileSync(projectInstruction, 'utf8'), '# Project-owned\n');
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), true);
  } finally {
    cleanup(root);
  }
});

test('remove rejects a hostile profile claim on the core instruction', () => {
  const root = scaffold();
  try {
    const coreInstruction = path.join(root, '.github/instructions/dude.instructions.md');
    fs.writeFileSync(coreInstruction, '# Core\n');
    fs.writeFileSync(
      path.join(root, '.dude/metadata/profile.md'),
      profileBody({
        enabled_packs: ['demo'],
        installed: {
          demo: {
            files: ['.github/instructions/dude.instructions.md'],
            installed_at: '2026-07-10T00:00:00.000Z',
          },
        },
      }),
    );

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /reserved.*core|core.*instruction/i);
    assert.equal(fs.readFileSync(coreInstruction, 'utf8'), '# Core\n');
  } finally {
    cleanup(root);
  }
});

test('remove rejects a stale profile claim on a project prompt', () => {
  const root = scaffold();
  try {
    const projectPrompt = path.join(root, '.github/prompts/deploy.prompt.md');
    fs.writeFileSync(projectPrompt, '# Project deploy prompt\n');
    fs.writeFileSync(
      path.join(root, '.dude/metadata/profile.md'),
      profileBody({
        enabled_packs: ['demo'],
        installed: {
          demo: {
            files: ['.github/prompts/deploy.prompt.md'],
            installed_at: '2026-07-10T00:00:00.000Z',
          },
        },
      }),
    );

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /not owned.*dude-pack-demo-\* namespace/i);
    assert.equal(fs.readFileSync(projectPrompt, 'utf8'), '# Project deploy prompt\n');
  } finally {
    cleanup(root);
  }
});

test('remove rejects a forged exact inventory claim on a project prompt', () => {
  const root = scaffold();
  try {
    const projectPrompt = path.join(root, '.github/prompts/deploy.prompt.md');
    fs.writeFileSync(projectPrompt, '# Project deploy prompt\n');
    const contentSha = hashFileArtifact(projectPrompt);
    const inventory = {
      version: 1,
      pack: 'demo',
      source: { type: 'library', location: path.join(root, 'missing-catalog'), ref: '' },
      manifest_sha256: '0'.repeat(64),
      artifacts: [{
        path: '.github/prompts/deploy.prompt.md',
        kind: 'prompts',
        source: 'prompts/deploy.prompt.md',
        source_sha256: contentSha,
        installed_sha256: contentSha,
      }],
      digest: '',
    };
    inventory.digest = inventoryDigest(inventory);
    fs.writeFileSync(
      path.join(root, '.dude/metadata/profile.md'),
      profileBody({
        enabled_packs: ['demo'],
        installed: {
          demo: {
            files: ['.github/prompts/deploy.prompt.md'],
            installed_at: '2026-07-10T00:00:00.000Z',
            inventory,
          },
        },
      }),
    );

    const result = cmdRemove({ root, name: 'demo' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /not owned by pack 'demo'|namespace/i);
    assert.equal(fs.readFileSync(projectPrompt, 'utf8'), '# Project deploy prompt\n');
  } finally {
    cleanup(root);
  }
});

test('profile validation rejects one pack claiming another pack namespace', () => {
  const root = bareRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    addPromptPack(library, 'alpha', 'alpha.prompt.md');
    addPromptPack(library, 'beta', 'beta.prompt.md');
    assert.equal(cmdAdd({ root, library, name: 'alpha', force: false }).ok, true);
    assert.equal(cmdAdd({ root, library, name: 'beta', force: false }).ok, true);
    const profile = readProfile(root);
    const alphaPath = profile.installed.alpha.files[0];
    const betaInventory = profile.installed.beta.inventory;
    assert.ok(betaInventory);
    profile.installed.beta.files[0] = alphaPath;
    betaInventory.artifacts[0].path = alphaPath;
    betaInventory.artifacts[0].source = 'prompts/alpha.prompt.md';
    betaInventory.digest = inventoryDigest(betaInventory);
    fs.writeFileSync(path.join(root, '.dude/metadata/profile.md'), profileBody(profile));

    const result = cmdRemove({ root, name: 'alpha' });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /not owned by pack 'beta'.*dude-pack-beta-\* namespace/);
    assert.ok(fs.existsSync(path.join(root, alphaPath)));
  } finally {
    cleanup(root);
  }
});

test('add rejects a missing catalog pack', () => {
  const root = scaffold();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'nope', force: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  } finally {
    cleanup(root);
  }
});

test('add rejects an artifact outside the pack namespace', () => {
  const root = scaffold();
  try {
    // Add a stray agent that does not carry the dude-pack-demo- prefix.
    fs.writeFileSync(
      path.join(root, 'library/packs/demo/agents/dude-pack-other-x.agent.md'),
      '---\nname: x\n---\n# X\n'
    );
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /namespace/);
  } finally {
    cleanup(root);
  }
});

test('add rejects a loose prompt outside the pack namespace', () => {
  const root = scaffold();
  try {
    fs.mkdirSync(path.join(root, 'library/packs/demo/prompts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'library/packs/demo/prompts/deploy.prompt.md'), '# Loose prompt\n');

    const result = cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /approved namespace.*demo/i);
    assert.equal(fs.existsSync(path.join(root, '.github/prompts/deploy.prompt.md')), false);
  } finally {
    cleanup(root);
  }
});

test('add rejects a hyphen-prefix pack-name collision', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    // Install "demo", then create catalog pack "demo-extra" and try to add it.
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const extra = path.join(lib, 'demo-extra');
    fs.mkdirSync(path.join(extra, 'skills', 'dude-pack-demo-extra-s'), { recursive: true });
    fs.writeFileSync(path.join(extra, 'pack.md'), '---\nname: demo-extra\n---\n# E\n');
    fs.writeFileSync(
      path.join(extra, 'skills', 'dude-pack-demo-extra-s', 'SKILL.md'),
      '---\nname: dude-pack-demo-extra-s\ndescription: "x"\n---\n# S\n'
    );
    const r = cmdAdd({ root, library: lib, name: 'demo-extra', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /collide/);
  } finally {
    cleanup(root);
  }
});

test('add refuses to overwrite an existing destination without --force', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    fs.writeFileSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md'), 'pre-existing\n');
    const r = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /already exists/);
  } finally {
    cleanup(root);
  }
});

test('status reflects installed packs', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdStatus({ root });
    assert.deepEqual(r.result.enabled_packs, ['demo']);
  } finally {
    cleanup(root);
  }
});

test('add fetches from an explicit --source when absent locally', () => {
  const root = bareRoot();
  const up = upstreamWith('remote');
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'remote', force: false, source: up });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.origin, `source ${up}`);
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-remote-s/SKILL.md')));
    assert.deepEqual(readProfile(root).enabled_packs, ['remote']);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('alternate --library inventory is bound to that exact catalog and removes safely', () => {
  const root = bareRoot();
  const alternate = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-library-'));
  try {
    addPromptPack(alternate, 'altpack', 'alt-action.prompt.md');
    const rootPack = path.join(root, 'library/packs/altpack');
    fs.mkdirSync(path.join(rootPack, 'skills/dude-pack-altpack-wrong'), { recursive: true });
    fs.writeFileSync(path.join(rootPack, 'pack.md'), '---\nname: altpack\n---\n# Wrong catalog\n');
    fs.writeFileSync(path.join(rootPack, 'skills/dude-pack-altpack-wrong/SKILL.md'), '# Wrong\n');

    const added = cmdAdd({ root, library: alternate, name: 'altpack', force: false });
    assert.equal(added.ok, true, added.error);
    const profile = readProfile(root);
    assert.equal(profile.installed.altpack.inventory?.source.type, 'library');
    assert.equal(profile.installed.altpack.inventory?.source.location, fs.realpathSync(alternate));

    const removed = cmdRemove({ root, name: 'altpack' });
    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(path.join(root, '.github/prompts/dude-pack-altpack-alt-action.prompt.md')), false);
  } finally {
    cleanup(root);
    cleanup(alternate);
  }
});

test('release removal uses persisted exact inventory when its catalog is absent', () => {
  const root = bareRoot();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-release-source-'));
  try {
    addPromptPack(path.join(source, 'library', 'packs'), 'portable', 'portable-action.prompt.md');
    const added = cmdAdd({
      root,
      library: path.join(root, 'missing-library'),
      name: 'portable',
      force: false,
      source,
    });
    assert.equal(added.ok, true, added.error);
    assert.ok(readProfile(root).installed.portable.inventory);
    cleanup(source);
    fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });

    const removed = cmdRemove({ root, name: 'portable' });

    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(path.join(root, '.github/prompts/dude-pack-portable-portable-action.prompt.md')), false);
  } finally {
    cleanup(root);
    cleanup(source);
  }
});

test('add fetches via the bundle manifest source when absent locally', () => {
  const root = bareRoot();
  const up = upstreamWith('fromman');
  try {
    fs.writeFileSync(path.join(root, '.dude/metadata/bundle-manifest.md'), manifestBody(up));
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'fromman', force: false });
    assert.equal(r.ok, true, r.error);
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-fromman-s/SKILL.md')));
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('list falls back to the manifest upstream source when no local catalog', () => {
  const root = bareRoot();
  const up = upstreamWith('remotelist');
  try {
    // a released core ships no local library/ at all
    fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, '.dude/metadata/bundle-manifest.md'), manifestBody(up));
    const r = cmdList({ root, library: path.join(root, 'library', 'packs') });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.origin, `source ${up}`);
    const found = r.result.packs.find((/** @type {any} */ p) => p.name === 'remotelist');
    assert.ok(found, 'remote pack listed via upstream fallback');
    assert.equal(found.installed, false);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('list does not fetch under --no-fetch when no local catalog', () => {
  const root = bareRoot();
  const up = upstreamWith('nope');
  try {
    fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, '.dude/metadata/bundle-manifest.md'), manifestBody(up));
    const r = cmdList({ root, library: path.join(root, 'library', 'packs'), fetch: false });
    assert.equal(r.ok, true);
    assert.equal(r.result.origin, 'local');
    assert.equal(r.result.packs.length, 0);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('add normalizes CRLF/trailing-ws in a fetched pack (not the local catalog)', () => {
  const root = bareRoot();
  const up = upstreamWith('crlfy');
  try {
    // give the upstream skill CRLF + trailing whitespace + no final newline
    const upSkill = path.join(up, 'library/packs/crlfy/skills/dude-pack-crlfy-s/SKILL.md');
    fs.writeFileSync(upSkill, '---\r\nname: dude-pack-crlfy-s\r\ndescription: "s"  \r\n---\r\n# S');
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'crlfy', force: false, source: up });
    assert.equal(r.ok, true, r.error);
    const installed = fs.readFileSync(path.join(root, '.github/skills/dude-pack-crlfy-s/SKILL.md'), 'utf8');
    assert.ok(!installed.includes('\r'), 'installed copy has no CR');
    assert.ok(!/[ \t]\n/.test(installed), 'installed copy has no trailing ws');
    assert.ok(installed.endsWith('\n'), 'installed copy has a final newline');
    // the upstream source must be left untouched
    assert.ok(fs.readFileSync(upSkill, 'utf8').includes('\r'), 'source keeps its CRLF');
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('add --no-fetch refuses to fetch a pack absent from the local catalog', () => {
  const root = bareRoot();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'ghost', force: false, fetch: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.error || '', /not found in catalog/);
  } finally {
    cleanup(root);
  }
});

test('mid-add copy failure rolls back installed files and profile', () => {
  const root = scaffold();
  const originalCopyFileSync = fs.copyFileSync;
  let destinationCopies = 0;
  try {
    fs.copyFileSync = (source, destination, ...args) => {
      if (String(destination).startsWith(path.join(root, '.github'))) {
        destinationCopies += 1;
        if (destinationCopies === 2) throw new Error('injected destination copy failure');
      }
      return originalCopyFileSync(source, destination, ...args);
    };

    const result = cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /rolled back.*injected destination copy failure/i);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper')), false);
    assert.equal(fs.existsSync(path.join(root, '.dude/metadata/profile.md')), false);
  } finally {
    fs.copyFileSync = originalCopyFileSync;
    cleanup(root);
  }
});

test('profile-write failure rolls back all installed files and prior profile', () => {
  const root = scaffold();
  const profilePath = path.join(root, '.dude/metadata/profile.md');
  const originalProfile = profileBody({ enabled_packs: [], installed: {} });
  fs.writeFileSync(profilePath, originalProfile);
  const originalRenameSync = fs.renameSync;
  try {
    fs.renameSync = (source, destination) => {
      if (String(source).includes('profile.md.tmp-') && destination === profilePath) {
        throw new Error('injected profile replacement failure');
      }
      return originalRenameSync(source, destination);
    };

    const result = cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /rolled back.*injected profile replacement failure/i);
    assert.equal(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper')), false);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), originalProfile);
  } finally {
    fs.renameSync = originalRenameSync;
    cleanup(root);
  }
});

test('remove restores exact artifacts and profile when profile replacement fails', () => {
  const root = scaffold();
  const profilePath = path.join(root, '.dude/metadata/profile.md');
  const originalRenameSync = fs.renameSync;
  const originalRmSync = fs.rmSync;
  /** @type {Set<string>} */
  const deletedArtifacts = new Set();
  try {
    // Arrange
    const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const artifactPaths = new Set(
      readProfile(root).installed.demo.files.map((relativePath) => path.join(root, ...relativePath.split('/'))),
    );
    const before = snapshotComposeMutationBytes(root);
    fs.rmSync = (target, options) => {
      const absoluteTarget = path.resolve(String(target));
      if (artifactPaths.has(absoluteTarget) && fs.existsSync(absoluteTarget)) deletedArtifacts.add(absoluteTarget);
      return originalRmSync(target, options);
    };
    fs.renameSync = (source, destination) => {
      if (String(source).includes('profile.md.tmp-') && destination === profilePath) {
        throw new Error('injected removal profile replacement failure');
      }
      return originalRenameSync(source, destination);
    };

    // Act
    const result = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error || '', /rolled back.*injected removal profile replacement failure/i);
    assert.deepEqual([...deletedArtifacts].sort(), [...artifactPaths].sort(), 'all artifacts were deleted before profile replacement');
    assert.deepEqual(snapshotComposeMutationBytes(root), before);
  } finally {
    fs.renameSync = originalRenameSync;
    fs.rmSync = originalRmSync;
    cleanup(root);
  }
});

test('remove restores exact artifacts and profile when a later artifact deletion fails', () => {
  const root = scaffold();
  const originalRmSync = fs.rmSync;
  /** @type {string[]} */
  const deletionAttempts = [];
  let injected = false;
  try {
    // Arrange
    const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const artifactPaths = readProfile(root).installed.demo.files
      .map((relativePath) => path.join(root, ...relativePath.split('/')));
    assert.ok(artifactPaths.length > 1, 'fixture requires a later artifact deletion');
    const before = snapshotComposeMutationBytes(root);
    fs.rmSync = (target, options) => {
      const absoluteTarget = path.resolve(String(target));
      if (artifactPaths.includes(absoluteTarget)) {
        deletionAttempts.push(absoluteTarget);
        if (!injected && absoluteTarget === artifactPaths[1]) {
          injected = true;
          throw new Error('injected later artifact deletion failure');
        }
      }
      return originalRmSync(target, options);
    };

    // Act
    const result = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(injected, true, 'fixture must fail the later artifact deletion');
    assert.deepEqual(deletionAttempts.slice(0, 2), artifactPaths, 'an earlier artifact was deleted first');
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error || '', /rolled back.*injected later artifact deletion failure/i);
    assert.deepEqual(snapshotComposeMutationBytes(root), before);
  } finally {
    fs.rmSync = originalRmSync;
    cleanup(root);
  }
});

test('remove leaves no profile transaction residue when profile backup cleanup fails after rollback', () => {
  const root = scaffold();
  const originalRmSync = fs.rmSync;
  let injected = false;
  try {
    // Arrange
    const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const before = snapshotComposeMutationBytes(root);
    fs.rmSync = (target, options) => {
      if (!injected && /profile\.md\.backup-/.test(String(target))) {
        injected = true;
        throw new Error('injected profile backup cleanup failure');
      }
      return originalRmSync(target, options);
    };

    // Act
    const result = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(injected, true, 'fixture must intercept the profile backup cleanup');
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error || '', /injected profile backup cleanup failure/i);
    const residue = fs
      .readdirSync(path.join(root, '.dude/metadata'))
      .filter((name) => /^profile\.md\.(backup|tmp)-/.test(name));
    assert.deepEqual(residue, [], 'no profile.md.backup-* or profile.md.tmp-* residue may remain after rollback');
    assert.deepEqual(snapshotComposeMutationBytes(root), before);
  } finally {
    fs.rmSync = originalRmSync;
    cleanup(root);
  }
});

test('remove backs up every artifact before the first deletion', () => {
  const root = scaffold();
  const originalCopyFileSync = fs.copyFileSync;
  let injected = false;
  let firstArtifactExistedAtSecondBackup = false;
  let secondArtifactExistedAtSecondBackup = false;
  try {
    // Arrange
    const added = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const files = readProfile(root).installed.demo.files;
    assert.equal(files.length, 2, 'fixture requires exactly two installed artifacts');
    const firstArtifactAbs = path.join(root, ...files[0].split('/'));
    const secondArtifactAbs = path.join(root, ...files[1].split('/'));
    const before = snapshotComposeMutationBytes(root);
    fs.copyFileSync = (source, destination, ...args) => {
      if (!injected && String(source).startsWith(`${secondArtifactAbs}${path.sep}`)) {
        injected = true;
        firstArtifactExistedAtSecondBackup = fs.existsSync(firstArtifactAbs);
        secondArtifactExistedAtSecondBackup = fs.existsSync(secondArtifactAbs);
        throw new Error('injected second artifact backup failure');
      }
      return originalCopyFileSync(source, destination, ...args);
    };

    // Act
    const result = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(injected, true, 'fixture must fail while backing up the second artifact');
    assert.equal(secondArtifactExistedAtSecondBackup, true, 'the second artifact must still exist when its backup is attempted');
    assert.equal(firstArtifactExistedAtSecondBackup, true, 'every artifact must be backed up before the first deletion');
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error || '', /injected second artifact backup failure/i);
    assert.deepEqual(snapshotComposeMutationBytes(root), before);
  } finally {
    fs.copyFileSync = originalCopyFileSync;
    cleanup(root);
  }
});

test('legitimate prompt pack add and remove uses exact inventory', () => {
  const root = bareRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    addPromptPack(library, 'prompted', 'prompted-action.prompt.md');
    const added = cmdAdd({ root, library, name: 'prompted', force: false });
    assert.equal(added.ok, true, added.error);
    const entry = readProfile(root).installed.prompted;
    assert.equal(entry.inventory?.artifacts[0].path, '.github/prompts/dude-pack-prompted-prompted-action.prompt.md');

    const removed = cmdRemove({ root, name: 'prompted' });
    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(path.join(root, '.github/prompts/dude-pack-prompted-prompted-action.prompt.md')), false);
  } finally {
    cleanup(root);
  }
});

test('verify reports OK for a clean pack and FAIL for a broken one', () => {
  const root = bareRoot();
  try {
    fs.writeFileSync(path.join(root, '.dude/metadata/bundle-manifest.md'), manifestBody('https://github.com/x/y'));
    const lib = path.join(root, 'library', 'packs');
    // clean skill-only pack
    const good = path.join(lib, 'good');
    fs.mkdirSync(path.join(good, 'skills', 'dude-pack-good-s'), { recursive: true });
    fs.writeFileSync(path.join(good, 'pack.md'), '---\nname: good\ndescription: "g"\n---\n# good\n');
    fs.writeFileSync(
      path.join(good, 'skills', 'dude-pack-good-s', 'SKILL.md'),
      '---\nname: dude-pack-good-s\ndescription: "s"\n---\n# S\n'
    );
    // broken pack: unbackticked reference to a nonexistent agent handle
    const bad = path.join(lib, 'bad');
    fs.mkdirSync(path.join(bad, 'skills', 'dude-pack-bad-s'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'pack.md'), '---\nname: bad\ndescription: "b"\n---\n# bad\n');
    fs.writeFileSync(
      path.join(bad, 'skills', 'dude-pack-bad-s', 'SKILL.md'),
      '---\nname: dude-pack-bad-s\ndescription: "s"\n---\n# S\n\nRoute to @dude-nonexistent-agent for help.\n'
    );

    const r = cmdVerify({ root, library: lib });
    assert.equal(r.result.verified.length, 2);
    const goodRes = r.result.verified.find((/** @type {any} */ v) => v.name === 'good');
    const badRes = r.result.verified.find((/** @type {any} */ v) => v.name === 'bad');
    assert.equal(goodRes.failures, 0, JSON.stringify(goodRes));
    assert.ok(badRes.failures > 0, JSON.stringify(badRes));
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  } finally {
    cleanup(root);
  }
});

test('verify surfaces incomplete-inventory removal authorization failure', () => {
  const root = scaffold();
  const originalRenameSync = fs.renameSync;
  let injected = false;
  let injectedProfileReadable = false;
  try {
    // Arrange
    fs.renameSync = (source, destination) => {
      const renamed = originalRenameSync(source, destination);
      const destinationPath = String(destination);
      const verificationRoot = path.dirname(path.dirname(path.dirname(destinationPath)));
      if (!injected
        && String(source).includes('profile.md.tmp-')
        && path.basename(destinationPath) === 'profile.md'
        && path.basename(verificationRoot).startsWith('dude-verify-demo-')) {
        const profile = readProfile(verificationRoot);
        delete profile.installed.demo.inventory.artifacts[0].installed_sha256;
        fs.writeFileSync(destinationPath, profileBody(profile));
        injected = true;
        injectedProfileReadable = readProfile(verificationRoot).installed.demo.inventory === undefined;
      }
      return renamed;
    };

    // Act
    const result = cmdVerify({ root, library: path.join(root, 'library', 'packs') });

    // Assert
    assert.equal(injected, true, 'fixture must intercept the temporary install profile');
    assert.equal(injectedProfileReadable, true, 'fixture must leave readable incomplete inventory evidence');
    const verification = result.result.verified.find((/** @type {any} */ entry) => entry.name === 'demo');
    assert.ok(verification);
    assert.match(
      verification.error || '',
      /complete.*inventory|inventory.*(?:incomplete|required|missing)/i,
      'verify must surface the temporary removal authorization failure',
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  } finally {
    fs.renameSync = originalRenameSync;
    cleanup(root);
  }
});

test('isMainModule matches a direct run whose path contains spaces', () => {
  // Real files in a spaced temp dir, so realpath resolution succeeds and the
  // macOS `/tmp` -> `/private/tmp` symlink is normalized on both sides.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude main mod '));
  try {
    const scriptPath = path.join(dir, 'compose.mjs');
    const otherPath = path.join(dir, 'other.mjs');
    fs.writeFileSync(scriptPath, '');
    fs.writeFileSync(otherPath, '');
    const url = pathToFileURL(scriptPath).href; // file://... with %20 for spaces
    assert.equal(isMainModule(url, scriptPath), true);
    assert.equal(isMainModule(url, otherPath), false);
    assert.equal(isMainModule(url, undefined), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('remove tolerates the host editor injected model: frontmatter on an installed agent', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    const added = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    const agentPath = path.join(root, '.github/agents/dude-pack-demo-worker.agent.md');

    // VS Code injects a per-agent model: line (plus an adjacent blank) into an
    // installed agent when it dispatches that agent as a subagent. The recorded
    // installed_sha256 is the model-less hash, so parity must still match.
    fs.writeFileSync(agentPath, '---\nname: demo-worker\nmodel: Claude Sonnet 4.5\n\n---\n# Worker\n');

    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(agentPath), false, 'injected model: did not block deletion');

    let leftovers = 0;
    for (const e of fs.readdirSync(path.join(root, '.github/agents'))) {
      if (e.startsWith('dude-pack-demo-')) leftovers += 1;
    }
    assert.equal(leftovers, 0);
    assert.equal(removed.code, 0);
    assert.equal(readProfile(root).installed.demo, undefined);
  } finally {
    cleanup(root);
  }
});

test('remove parity still catches a genuine non-model change to an installed agent', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    assert.equal(cmdAdd({ root, library: lib, name: 'demo', force: false }).ok, true);
    const agentPath = path.join(root, '.github/agents/dude-pack-demo-worker.agent.md');

    // A real content change (not the editor's model: key) must still drift, even
    // when an injected model: line is present alongside it.
    fs.writeFileSync(
      agentPath,
      '---\nname: demo-worker\ndescription: "tampered"\nmodel: Claude Sonnet 4.5\n---\n# Worker\n',
    );
    const before = snapshotComposeMutationBytes(root);

    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, false);
    assert.match(removed.error || '', /no longer matches pack "demo" inventory; refusing deletion/);
    assert.equal(fs.existsSync(agentPath), true, 'tampered agent preserved');
    assert.deepEqual(snapshotComposeMutationBytes(root), before, 'all installed artifacts and profile bytes are unchanged');
  } finally {
    cleanup(root);
  }
});

test('add records identical source and installed hashes for a model-less agent', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    assert.equal(cmdAdd({ root, library: lib, name: 'demo', force: false }).ok, true);
    const inventory = readProfile(root).installed.demo.inventory;
    assert.ok(inventory);
    const agent = inventory.artifacts.find(
      (/** @type {any} */ a) => a.path === '.github/agents/dude-pack-demo-worker.agent.md',
    );
    assert.ok(agent);
    // A model-less agent normalizes to a strict no-op, so the recorded hashes
    // match the pre-change `file\0..\0` framing exactly. This guards the frozen
    // profile.md hashes against any drift from the .agent.md normalization.
    assert.equal(agent.source_sha256, agent.installed_sha256);
    const expected = hashFileArtifact(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md'));
    assert.equal(agent.installed_sha256, expected);
  } finally {
    cleanup(root);
  }
});

test('remove treats duplicate installed-agent model: keys as drift while tolerating a single injected key', () => {
  // T032 (FR-028 / plan section 15) compose parity. `hashArtifact` normalizes a
  // single well-formed host-injected model: key back to the recorded model-less
  // hash. But TWO well-formed keys are drift: over-stripping both collapses the
  // bytes onto the recorded model-less hash and silently deletes a drifted agent.
  // Parity must refuse, exactly as it does for a genuine non-model change.

  // Control — a single well-formed injected key stays tolerated (existing behavior).
  const tolerated = scaffold();
  try {
    const lib = path.join(tolerated, 'library', 'packs');
    assert.equal(cmdAdd({ root: tolerated, library: lib, name: 'demo', force: false }).ok, true);
    const agentPath = path.join(tolerated, '.github/agents/dude-pack-demo-worker.agent.md');
    fs.writeFileSync(agentPath, '---\nname: demo-worker\nmodel: Claude Sonnet 4.5\n---\n# Worker\n');
    const removed = cmdRemove({ root: tolerated, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assert.equal(fs.existsSync(agentPath), false, 'single injected key normalizes to the recorded model-less hash');
  } finally {
    cleanup(tolerated);
  }

  // Drift — duplicate well-formed keys must NOT collapse onto the model-less
  // hash; parity surfaces the mismatch and preserves the agent as a leftover.
  const drift = scaffold();
  try {
    const lib = path.join(drift, 'library', 'packs');
    assert.equal(cmdAdd({ root: drift, library: lib, name: 'demo', force: false }).ok, true);
    const agentPath = path.join(drift, '.github/agents/dude-pack-demo-worker.agent.md');
    fs.writeFileSync(
      agentPath,
      '---\nname: demo-worker\nmodel: Claude Sonnet 4.5\nmodel: Claude Opus 4.1\n---\n# Worker\n',
    );
    const before = snapshotComposeMutationBytes(drift);

    const removed = cmdRemove({ root: drift, name: 'demo' });
    assert.equal(removed.ok, false, 'duplicate model: keys are drift, not a tolerated single injected key');
    assert.match(removed.error || '', /no longer matches pack "demo" inventory; refusing deletion/);
    assert.equal(fs.existsSync(agentPath), true, 'drifted agent preserved as a leftover, not deleted');
    assert.deepEqual(
      snapshotComposeMutationBytes(drift),
      before,
      'all installed artifacts and profile bytes are unchanged',
    );
  } finally {
    cleanup(drift);
  }
});

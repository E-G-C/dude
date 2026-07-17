// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} start */
function findRepositoryRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'scripts/prompt-audit.mjs'))
      && fs.existsSync(path.join(current, 'library/packs/authoring/pack.md'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error('repository root not found');
    current = parent;
  }
}

const repositoryRoot = findRepositoryRoot(testDirectory);
const sourceRuntimePath = path.join(
  repositoryRoot,
  'library/packs/authoring/skills/dude-pack-authoring-prompt-audit/prompt-audit.mjs',
);
const installedRuntimePath = path.join(
  repositoryRoot,
  '.github/skills/dude-pack-authoring-prompt-audit/prompt-audit.mjs',
);
const wrapperPath = path.join(repositoryRoot, 'scripts/prompt-audit.mjs');
const engineProfilePath = path.join(repositoryRoot, 'src/skills/dude-engine/lib/profile.mjs');
const engineTextPath = path.join(repositoryRoot, 'src/skills/dude-engine/lib/text.mjs');

const sourceRuntime = await import(pathToFileURL(sourceRuntimePath).href);
const repositoryWrapper = await import(pathToFileURL(wrapperPath).href);
const { inventoryDigest: canonicalInventoryDigest } = await import(pathToFileURL(engineProfilePath).href);
const { normalizeString } = await import(pathToFileURL(engineTextPath).href);
const {
  METRIC_KIND,
  PromptAuditError,
  auditProfiles,
  compareAudits,
  computeInventoryDigest,
  runCli,
} = sourceRuntime;

const POSIX_SKIP = process.platform === 'win32' ? 'requires POSIX permissions or symbolic links' : false;
const canonicalTemporaryDirectory = fs.realpathSync(os.tmpdir());
const ALIAS_SKIP_CODES = new Set(['EACCES', 'ENOSYS', 'ENOTSUP', 'EPERM']);
const PRIVATE_DOGFOOD_PLACEHOLDER = '# Private dogfood guidance\n';

/** @param {string | Buffer} value */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** @param {string} root @param {string} relativePath @param {string | Buffer} content */
function write(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

/** @param {string} source @param {string} destination */
function copyTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source).sort()) {
      copyTree(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

/** @param {string} absolutePath */
function hashArtifact(absolutePath) {
  const hash = crypto.createHash('sha256');
  /** @param {string} current @param {string} relative */
  function visit(current, relative) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link in fixture: ${current}`);
    if (stat.isDirectory()) {
      hash.update(`directory\0${relative}\0`);
      for (const entry of fs.readdirSync(current).sort()) {
        visit(path.join(current, entry), relative ? `${relative}/${entry}` : entry);
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`unsupported fixture artifact: ${current}`);
    hash.update(`file\0${relative}\0`);
    hash.update(fs.readFileSync(current));
    hash.update('\0');
  }
  visit(absolutePath, '');
  return hash.digest('hex');
}

function emptyInstallProfile() {
  return '# Install Profile\n\n```json\n{\n  "enabled_packs": [],\n  "installed": {}\n}\n```\n';
}

function defaultManifest() {
  return {
    schema_version: 1,
    metric: METRIC_KIND,
    profile_order: ['alpha'],
    profiles: {
      alpha: {
        kind: 'release-source',
        activation_assumption: 'Fixture alpha loads one core source.',
        members: ['src/a.md'],
      },
    },
    dogfood_guidance: {
      kind: 'dogfood-guidance',
      activation_assumption: 'Fixture dogfood reads project guidance separately.',
      members: ['.github/skills/project/SKILL.md'],
    },
    parity: {
      core_source_root: 'src',
      core_generated_root: '.github',
      pack_catalog_root: 'library/packs',
      install_profile: '.dude/metadata/profile.md',
    },
  };
}

/** @param {{ content?: string, manifest?: Record<string, any> }} [options] */
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-'));
  const content = options.content ?? 'A\u{1f600}\u00e9\n';
  write(root, 'src/a.md', content);
  write(root, '.github/a.md', content);
  write(root, '.github/skills/project/SKILL.md', 'Project guidance.\n');
  write(root, '.dude/metadata/profile.md', emptyInstallProfile());
  write(root, 'profiles.json', `${JSON.stringify(options.manifest ?? defaultManifest(), null, 2)}\n`);
  return {
    root,
    profilesPath: path.join(root, 'profiles.json'),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** @param {Record<string, any>} profile @param {string} root @param {string} [relativePath] */
function writeInstallProfile(profile, root, relativePath = '.dude/metadata/profile.md') {
  write(root, relativePath, `# Install Profile\n\n\`\`\`json\n${JSON.stringify(profile, null, 2)}\n\`\`\`\n`);
}

/**
 * @param {string} root
 * @param {{ sourceType?: 'library'|'source', normalized?: boolean, catalogRoot?: string, installProfile?: string, packName?: string, skillName?: string }} [options]
 */
function installPackFixture(root, options = {}) {
  const packName = options.packName ?? 'demo';
  const skillName = options.skillName ?? 'dude-pack-demo-tool';
  const sourceType = options.sourceType ?? 'library';
  const sourceLocation = sourceType === 'library'
    ? path.join(root, options.catalogRoot ?? 'library/packs')
    : path.join(root, 'persisted-origin');
  const packRoot = sourceType === 'library'
    ? path.join(sourceLocation, packName)
    : path.join(sourceLocation, 'library/packs', packName);
  const sourceArtifact = path.join(packRoot, 'skills', skillName);
  const installedArtifact = path.join(root, '.github/skills', skillName);
  const manifest = `---\nname: ${packName}\ndescription: "Fixture pack."\nprovides:\n  agents: []\n  skills: [${skillName}]\nrequires:\n  tools: []\nhooks: []\n---\n\n# Fixture\n`;
  const rawSkill = options.normalized
    ? `---\r\nname: ${skillName}  \r\ndescription: "Fixture tool."\r\n---\r\n\r\n# Tool  `
    : `---\nname: ${skillName}\ndescription: "Fixture tool."\n---\n\n# Tool\n`;
  write(packRoot, 'pack.md', manifest);
  write(sourceArtifact, 'SKILL.md', rawSkill);
  fs.mkdirSync(installedArtifact, { recursive: true });
  write(installedArtifact, 'SKILL.md', options.normalized ? normalizeString(rawSkill) : rawSkill);

  const inventory = {
    version: 1,
    pack: packName,
    source: {
      type: sourceType,
      location: sourceLocation,
      ref: sourceType === 'source' ? 'fixture-ref' : '',
    },
    manifest_sha256: sha256(fs.readFileSync(path.join(packRoot, 'pack.md'))),
    artifacts: [{
      path: `.github/skills/${skillName}`,
      kind: 'skills',
      source: `skills/${skillName}`,
      source_sha256: hashArtifact(sourceArtifact),
      installed_sha256: hashArtifact(installedArtifact),
    }],
    digest: '',
  };
  inventory.digest = canonicalInventoryDigest(inventory);
  const profile = {
    enabled_packs: [packName],
    installed: {
      [packName]: {
        files: [`.github/skills/${skillName}`],
        installed_at: '2026-01-01T00:00:00.000Z',
        inventory,
      },
    },
  };
  writeInstallProfile(profile, root, options.installProfile);
  return { packName, skillName, packRoot, sourceArtifact, installedArtifact, inventory, profile };
}

/** @param {Record<string, any>} report */
function auditEnvelope(report) {
  return { ok: true, command: 'audit', report };
}

/** @param {Record<string, any>} report @param {{ name?: string, version?: string, encoding?: string }} [identity] */
function tokenizerManifest(report, identity = {}) {
  const distinct = new Map();
  for (const record of [...report.profiles, report.dogfood_guidance]) {
    for (const input of record.inputs) distinct.set(input.path, input.sha256);
  }
  return {
    schema_version: 1,
    kind: 'prompt-audit-tokenizer-results',
    tokenizer: {
      name: identity.name ?? 'fixture-tokenizer',
      version: identity.version ?? '1.0.0',
      encoding: identity.encoding ?? 'fixture-encoding',
    },
    inputs: [...distinct]
      .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
      .map(([inputPath, contentSha], index) => ({
        path: inputPath,
        content_sha256: contentSha,
        tokens: index + 1,
      })),
  };
}

/** @param {string} root @param {Record<string, any>} manifest @param {string} [name] */
function writeTokenizerManifest(root, manifest, name = 'tokenizer-results.json') {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const resultsPath = write(root, name, content);
  return { path: resultsPath, sha256: sha256(content) };
}

/** @param {string} expectedCode */
function hasCode(expectedCode) {
  return (error) => {
    assert.ok(error instanceof PromptAuditError, String(error));
    assert.equal(error.code, expectedCode);
    return true;
  };
}

function outputSink() {
  let value = '';
  return {
    stream: {
      write(chunk) {
        value += String(chunk);
        return true;
      },
    },
    read() {
      return value;
    },
  };
}

/**
 * @param {import('node:test').TestContext} suite
 * @param {string} target
 * @param {string} alias
 * @param {'dir'|'file'} [type]
 */
function createStaticAlias(suite, target, alias, type = 'dir') {
  try {
    fs.symlinkSync(target, alias, type);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ALIAS_SKIP_CODES.has(String(error.code))) {
      suite.skip(`symbolic-link fixture unavailable: ${String(error.code)}`);
      return false;
    }
    throw error;
  }
}

/** @param {string} alias */
function removeStaticAlias(alias) {
  try {
    fs.unlinkSync(alias);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
}

/**
 * @param {{ realpath?: string, lstat?: string, open?: string }} targets
 * @param {() => Promise<void>} operation
 */
async function observePathAccess(targets, operation) {
  const expected = Object.fromEntries(
    Object.entries(targets).map(([kind, target]) => [kind, path.resolve(target)]),
  );
  const calls = { realpath: 0, lstat: 0, open: 0 };
  const originalRealpath = fs.realpathSync;
  const originalLstat = fs.lstatSync;
  const originalOpen = fs.openSync;
  fs.realpathSync = function patchedRealpath(target, options) {
    if (typeof target === 'string' && expected.realpath === path.resolve(target)) calls.realpath += 1;
    return originalRealpath.call(fs, target, options);
  };
  fs.lstatSync = function patchedLstat(target, options) {
    if (typeof target === 'string' && expected.lstat === path.resolve(target)) calls.lstat += 1;
    return originalLstat.call(fs, target, options);
  };
  fs.openSync = function patchedOpen(target, flags, mode) {
    if (typeof target === 'string' && expected.open === path.resolve(target)) calls.open += 1;
    return originalOpen.call(fs, target, flags, mode);
  };
  try {
    await operation();
  } finally {
    fs.realpathSync = originalRealpath;
    fs.lstatSync = originalLstat;
    fs.openSync = originalOpen;
  }
  return calls;
}

/** @param {string[]} args @param {string} expectedCode */
async function assertCliFailure(args, expectedCode) {
  const stdout = outputSink();
  const stderr = outputSink();
  const exitCode = await runCli([...args, '--json'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(exitCode, 2);
  const payload = JSON.parse(stdout.read() || stderr.read());
  assert.equal(payload.error.code, expectedCode);
}

/** @param {string} root */
function snapshot(root) {
  /** @type {Record<string, { kind: string, sha256?: string, mode: number, mtime: string }>} */
  const result = {};
  /** @param {string} current @param {string} relative */
  function visit(current, relative) {
    const stat = fs.lstatSync(current, { bigint: true });
    result[relative || '.'] = {
      kind: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file',
      ...(stat.isFile() ? { sha256: sha256(fs.readFileSync(current)) } : {}),
      mode: Number(stat.mode),
      mtime: String(stat.mtimeNs),
    };
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) {
        visit(path.join(current, entry), relative ? `${relative}/${entry}` : entry);
      }
    }
  }
  visit(root, '');
  return result;
}

/**
 * Trigger one persistent replacement when the audit opens tokenizer result data.
 * @param {string} resultsPath
 * @param {() => void} mutate
 * @param {() => void} restore
 * @param {() => Promise<void>} operation
 */
async function withPersistentReplacement(resultsPath, mutate, restore, operation) {
  const originalOpen = fs.openSync;
  const canonicalResultsPath = path.join(
    fs.realpathSync(path.dirname(resultsPath)),
    path.basename(resultsPath),
  );
  let changed = false;
  fs.openSync = function patchedOpen(target, flags, mode) {
    if (!changed && typeof target === 'string' && path.resolve(target) === canonicalResultsPath) {
      changed = true;
      mutate();
    }
    return originalOpen.call(fs, target, flags, mode);
  };
  try {
    await operation();
    assert.equal(changed, true, 'replacement hook did not run');
  } finally {
    fs.openSync = originalOpen;
    restore();
  }
}

test('repeated source audits are deterministic, exact, and non-mutating', async () => {
  const current = fixture();
  try {
    const before = snapshot(current.root);
    const first = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const second = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    assert.deepEqual(second, first);
    assert.equal(first.profiles[0].inputs[0].code_points, 4);
    assert.equal(first.profiles[0].inputs[0].utf8_bytes, 8);
    assert.deepEqual(first.tokenizer, {
      status: 'unavailable',
      reason: 'no tokenizer results supplied',
    });
    const comparison = compareAudits(auditEnvelope(first), auditEnvelope(second));
    assert.equal(comparison.comparable, true);
    assert.deepEqual(snapshot(current.root), before);
  } finally {
    current.cleanup();
  }
});

test('alternate declared parity roots audit and self-compare successfully', async () => {
  const manifest = defaultManifest();
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles.alpha.members = ['source/a.md'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads one source-pack skill.',
    members: ['catalog/demo/skills/dude-pack-demo-tool/SKILL.md'],
  };
  manifest.parity = {
    core_source_root: 'source',
    core_generated_root: 'generated',
    pack_catalog_root: 'catalog',
    install_profile: 'state/profile.md',
  };
  const current = fixture({ manifest });
  try {
    write(current.root, 'source/a.md', 'Alternate core source.\n');
    write(current.root, 'generated/a.md', 'Alternate core source.\n');
    installPackFixture(current.root, {
      catalogRoot: 'catalog',
      installProfile: 'state/profile.md',
    });
    const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    assert.deepEqual(report.profile_manifest, {
      path: 'profiles.json',
      sha256: sha256(fs.readFileSync(current.profilesPath)),
      ...manifest.parity,
    });
    assert.deepEqual(report.prerequisites.core_source_generated.checks, [{
      source: 'source/a.md',
      generated: 'generated/a.md',
      sha256: sha256('Alternate core source.\n'),
    }]);
    assert.deepEqual(report.prerequisites.profile_source_packs.map((pack) => pack.name), ['demo']);
    assert.equal(compareAudits(auditEnvelope(report), auditEnvelope(report)).comparable, true);
  } finally {
    current.cleanup();
  }
});

test('distinct core parity roots are required', async (suite) => {
  await suite.test('fresh audit rejects equal roots without emitting a report', async () => {
    const manifest = defaultManifest();
    manifest.parity.core_generated_root = manifest.parity.core_source_root;
    const current = fixture({ manifest });
    try {
      const stdout = outputSink();
      const exitCode = await runCli(['audit', '--json'], {
        stdout: stdout.stream,
        defaultRoot: current.root,
        defaultProfilesPath: current.profilesPath,
      });
      const result = JSON.parse(stdout.read());
      assert.equal(exitCode, 2);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'E_PROFILE_SCHEMA');
      assert.match(result.error.message, /core_source_root.*core_generated_root.*distinct/);
      assert.equal(Object.hasOwn(result, 'report'), false);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('detached self-comparison rejects equal roots before tautological parity', async () => {
    const current = fixture();
    try {
      const crafted = auditEnvelope(await auditProfiles({
        root: current.root,
        profilesPath: current.profilesPath,
      }));
      crafted.report.profile_manifest.core_generated_root =
        crafted.report.profile_manifest.core_source_root;
      crafted.report.prerequisites.core_source_generated.checks[0].generated =
        crafted.report.prerequisites.core_source_generated.checks[0].source;
      assert.throws(
        () => compareAudits(crafted, crafted),
        (error) => {
          assert.ok(hasCode('E_COMPARE_REPORT')(error));
          assert.match(error.message, /core_source_root.*core_generated_root.*distinct/);
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });
});

test('parity-root report evidence is exact and frozen across comparisons', async (suite) => {
  const current = fixture();
  try {
    const canonical = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    const invalidCases = [
      {
        name: 'missing parity-root declaration',
        mutate(value) { delete value.report.profile_manifest.core_source_root; },
      },
      {
        name: 'extra parity-root declaration',
        mutate(value) { value.report.profile_manifest.extra_root = 'extra'; },
      },
      {
        name: 'malformed parity-root declaration',
        mutate(value) { value.report.profile_manifest.core_source_root = '../source'; },
      },
    ];
    for (const invalidCase of invalidCases) {
      await suite.test(invalidCase.name, () => {
        const changed = structuredClone(canonical);
        invalidCase.mutate(changed);
        assert.throws(() => compareAudits(changed, changed), hasCode('E_COMPARE_REPORT'));
      });
    }

    await suite.test('normalized parity-root declaration drift', () => {
      const changed = structuredClone(canonical);
      changed.report.profile_manifest.core_generated_root = 'generated';
      changed.report.prerequisites.core_source_generated.checks[0].generated = 'generated/a.md';
      assert.equal(compareAudits(changed, changed).comparable, true);
      assert.throws(
        () => compareAudits(canonical, changed),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });
  } finally {
    current.cleanup();
  }
});

test('profile schema, order, membership, parity, and static path safety fail closed', async (suite) => {
  await suite.test('unknown profile field', async () => {
    const manifest = defaultManifest();
    manifest.unexpected = true;
    const current = fixture({ manifest });
    try {
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_PROFILE_SCHEMA'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('profile object order mismatch', async () => {
    const manifest = defaultManifest();
    manifest.profile_order = ['beta', 'alpha'];
    manifest.profiles.beta = {
      kind: 'release-source',
      activation_assumption: 'Fixture beta.',
      members: ['src/a.md'],
    };
    const current = fixture({ manifest });
    try {
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_PROFILE_ORDER'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('duplicate and traversal members', async () => {
    for (const members of [['src/a.md', 'src/a.md'], ['../outside.md']]) {
      const manifest = defaultManifest();
      manifest.profiles.alpha.members = members;
      const current = fixture({ manifest });
      try {
        await assert.rejects(
          auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
          (error) => error instanceof PromptAuditError
            && ['E_PROFILE_MEMBERSHIP', 'E_INPUT_UNSAFE'].includes(error.code),
        );
      } finally {
        current.cleanup();
      }
    }
  });

  await suite.test('core source/generated mismatch', async () => {
    const current = fixture();
    try {
      write(current.root, '.github/a.md', 'drift\n');
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_CORE_PARITY'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('symbolic link input', { skip: POSIX_SKIP }, async () => {
    const current = fixture();
    try {
      write(current.root, 'target.md', 'A\n');
      fs.rmSync(path.join(current.root, 'src/a.md'));
      fs.symlinkSync('../target.md', path.join(current.root, 'src/a.md'));
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_INPUT_SYMLINK'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('unreadable input', { skip: POSIX_SKIP }, async () => {
    const current = fixture();
    const input = path.join(current.root, 'src/a.md');
    try {
      fs.chmodSync(input, 0o000);
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_INPUT_UNREADABLE'),
      );
    } finally {
      fs.chmodSync(input, 0o600);
      current.cleanup();
    }
  });
});

test('data-only tokenizer results require exact bytes, schema, coverage, hashes, and safe counts', async (suite) => {
  const current = fixture();
  try {
    const unavailable = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const validManifest = tokenizerManifest(unavailable);
    const valid = writeTokenizerManifest(current.root, validManifest);
    const available = await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
      tokenizerResults: valid,
    });
    assert.deepEqual(available.tokenizer, {
      status: 'available',
      results_sha256: valid.sha256,
      identity_sha256: sha256(JSON.stringify(validManifest.tokenizer)),
      ...validManifest.tokenizer,
    });
    assert.equal(Number.isSafeInteger(available.profiles[0].totals.tokens), true);
    assert.equal(Number.isSafeInteger(available.dogfood_guidance.totals.tokens), true);

    await suite.test('result file pin mismatch', async () => {
      await assert.rejects(
        auditProfiles({
          root: current.root,
          profilesPath: current.profilesPath,
          tokenizerResults: { ...valid, sha256: '0'.repeat(64) },
        }),
        hasCode('E_TOKENIZER_HASH'),
      );
    });

    const invalidCases = [
      {
        name: 'unknown top-level key',
        mutate(value) { value.extra = true; },
        code: 'E_TOKENIZER_SCHEMA',
      },
      {
        name: 'missing input',
        mutate(value) { value.inputs.pop(); },
        code: 'E_TOKENIZER_COVERAGE',
      },
      {
        name: 'extra input',
        mutate(value) { value.inputs.push({ path: 'extra.md', content_sha256: '0'.repeat(64), tokens: 1 }); },
        code: 'E_TOKENIZER_COVERAGE',
      },
      {
        name: 'duplicate input',
        mutate(value) { value.inputs.splice(1, 0, structuredClone(value.inputs[0])); },
        code: 'E_TOKENIZER_COVERAGE',
      },
      {
        name: 'unsorted input',
        mutate(value) { value.inputs.reverse(); },
        code: 'E_TOKENIZER_COVERAGE',
      },
      {
        name: 'content hash mismatch',
        mutate(value) { value.inputs[0].content_sha256 = '0'.repeat(64); },
        code: 'E_TOKENIZER_CONTENT',
      },
      {
        name: 'unsafe count',
        mutate(value) { value.inputs[0].tokens = Number.MAX_SAFE_INTEGER + 1; },
        code: 'E_TOKENIZER_SCHEMA',
      },
      {
        name: 'unknown nested key',
        mutate(value) { value.inputs[0].extra = true; },
        code: 'E_TOKENIZER_SCHEMA',
      },
    ];
    for (const invalidCase of invalidCases) {
      await suite.test(invalidCase.name, async () => {
        const manifest = structuredClone(validManifest);
        invalidCase.mutate(manifest);
        const config = writeTokenizerManifest(current.root, manifest, `invalid-${invalidCase.name.replaceAll(' ', '-')}.json`);
        await assert.rejects(
          auditProfiles({
            root: current.root,
            profilesPath: current.profilesPath,
            tokenizerResults: config,
          }),
          hasCode(invalidCase.code),
        );
      });
    }
  } finally {
    current.cleanup();
  }
});

test('comparison accepts changed result-file hashes under one tokenizer identity', async () => {
  const current = fixture({ content: 'before\n' });
  try {
    const beforeUnavailable = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const beforeConfig = writeTokenizerManifest(current.root, tokenizerManifest(beforeUnavailable), 'tokens-before.json');
    const before = await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
      tokenizerResults: beforeConfig,
    });

    write(current.root, 'src/a.md', 'after with more text\n');
    write(current.root, '.github/a.md', 'after with more text\n');
    const afterUnavailable = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const afterConfig = writeTokenizerManifest(current.root, tokenizerManifest(afterUnavailable), 'tokens-after.json');
    const after = await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
      tokenizerResults: afterConfig,
    });
    assert.notEqual(before.tokenizer.results_sha256, after.tokenizer.results_sha256);
    assert.equal(before.tokenizer.identity_sha256, after.tokenizer.identity_sha256);
    const comparison = compareAudits(auditEnvelope(before), auditEnvelope(after));
    assert.deepEqual(comparison.profiles[0].changed_inputs, ['src/a.md']);
    assert.notEqual(comparison.aggregate.delta.tokens, null);
  } finally {
    current.cleanup();
  }
});

test('exact report validation rejects envelope, key, prerequisite, tokenizer, and arithmetic contradictions', async (suite) => {
  const current = fixture();
  try {
    const unavailableReport = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const unavailable = auditEnvelope(unavailableReport);
    const tokenConfig = writeTokenizerManifest(current.root, tokenizerManifest(unavailableReport));
    const available = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
      tokenizerResults: tokenConfig,
    }));

    const cases = [
      {
        name: 'bare report',
        value() { return structuredClone(unavailable.report); },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'failure envelope',
        value() { return { ok: false, command: 'audit', error: { code: 'E_TEST' } }; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'extra envelope key',
        value() { const value = structuredClone(unavailable); value.extra = true; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'extra report key',
        value() { const value = structuredClone(unavailable); value.report.extra = true; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'missing nested key',
        value() { const value = structuredClone(unavailable); delete value.report.claim_limits.describes; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'unknown input key',
        value() { const value = structuredClone(unavailable); value.report.profiles[0].inputs[0].extra = true; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'unavailable tokenizer with non-null tokens',
        value() { const value = structuredClone(unavailable); value.report.profiles[0].inputs[0].tokens = 1; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'available tokenizer with null tokens',
        value() { const value = structuredClone(available); value.report.profiles[0].inputs[0].tokens = null; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'invalid top prerequisite',
        value() { const value = structuredClone(unavailable); value.report.prerequisites.status = 'fail'; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'invalid prerequisite child',
        value() { const value = structuredClone(unavailable); value.report.prerequisites.core_source_generated.status = 'fail'; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'invalid record prerequisite',
        value() { const value = structuredClone(unavailable); value.report.profiles[0].prerequisites.core_source_generated = 'not-applicable'; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'bad profile total',
        value() { const value = structuredClone(unavailable); value.report.profiles[0].totals.code_points += 1; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'bad aggregate',
        value() { const value = structuredClone(unavailable); value.report.aggregate.utf8_bytes += 1; return value; },
        code: 'E_COMPARE_REPORT',
      },
      {
        name: 'bad definition hash',
        value() { const value = structuredClone(unavailable); value.report.profiles[0].definition_sha256 = '0'.repeat(64); return value; },
        code: 'E_COMPARE_REPORT',
      },
    ];
    for (const invalidCase of cases) {
      await suite.test(invalidCase.name, () => {
        assert.throws(() => compareAudits(unavailable, invalidCase.value()), hasCode(invalidCase.code));
      });
    }

    await suite.test('unchanged dogfood SHA with changed counts', () => {
      const changed = structuredClone(unavailable);
      changed.report.dogfood_guidance.inputs[0].code_points += 1;
      changed.report.dogfood_guidance.totals.code_points += 1;
      assert.throws(() => compareAudits(unavailable, changed), hasCode('E_COMPARE_COUNT_DRIFT'));
    });
  } finally {
    current.cleanup();
  }
});

test('comparison rejects forged or omitted prerequisite evidence', async (suite) => {
  const manifest = defaultManifest();
  manifest.profiles.alpha.members = ['src/a.md', 'src/b.md'];
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads one source-pack skill.',
    members: ['library/packs/demo/skills/dude-pack-demo-tool/SKILL.md'],
  };
  const current = fixture({ manifest });
  try {
    write(current.root, 'src/b.md', 'Second core input.\n');
    write(current.root, '.github/b.md', 'Second core input.\n');
    installPackFixture(current.root);
    const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
    const canonical = auditEnvelope(report);

    /** @param {string} name @param {(value: Record<string, any>) => void} mutate */
    async function rejects(name, mutate) {
      await suite.test(name, () => {
        const changed = structuredClone(canonical);
        mutate(changed);
        assert.throws(
          () => compareAudits(canonical, changed),
          (error) => error instanceof PromptAuditError,
        );
      });
    }

    await rejects('forged core check SHA', (value) => {
      value.report.prerequisites.core_source_generated.checks[0].sha256 = '0'.repeat(64);
    });
    await rejects('wrong core input hash', (value) => {
      value.report.profiles[0].inputs[0].sha256 = '0'.repeat(64);
    });
    await rejects('wrong generated counterpart path', (value) => {
      value.report.prerequisites.core_source_generated.checks[0].generated = '.github/arbitrary.md';
    });
    await rejects('omitted core check in incomplete self-comparison', (value) => {
      value.report.prerequisites.core_source_generated.checks.pop();
      assert.throws(
        () => compareAudits(value, value),
        (error) => error instanceof PromptAuditError,
      );
    });
    await rejects('extra core prerequisite evidence', (value) => {
      value.report.prerequisites.core_source_generated.checks.push({
        source: 'src/extra.md',
        generated: '.github/extra.md',
        sha256: '1'.repeat(64),
      });
    });
    await rejects('record core applicability disagrees with inputs', (value) => {
      value.report.profiles[0].prerequisites.core_source_generated = 'not-applicable';
    });
    await rejects('top-level core applicability disagrees with inputs', (value) => {
      value.report.prerequisites.core_source_generated.status = 'not-applicable';
    });

    await rejects('fabricated persisted-source location', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].source_identity.location = '/fabricated/source';
    });
    await rejects('fabricated persisted-source identity', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].source_identity.ref = 'fabricated-ref';
    });
    await rejects('fabricated inventory digest', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].inventory_digest = '2'.repeat(64);
    });
    await rejects('wrong enabled-pack manifest hash', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].manifest_sha256 = '3'.repeat(64);
    });
    await rejects('wrong enabled-pack artifact count', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].artifact_count += 1;
    });
    await rejects('forged install-profile hash', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.profile_sha256 = '4'.repeat(64);
    });
    await rejects('duplicate enabled-pack evidence', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.enabled_packs.push('demo');
      value.report.prerequisites.enabled_pack_source_installed.packs.push(
        structuredClone(value.report.prerequisites.enabled_pack_source_installed.packs[0]),
      );
    });
    await rejects('enabled-pack membership drifts with internally matching applicability', (value) => {
      value.report.prerequisites.enabled_pack_source_installed.enabled_packs = [];
      value.report.prerequisites.enabled_pack_source_installed.packs = [];
      value.report.prerequisites.profile_source_packs[0].installed_parity = 'not-applicable';
      value.report.profiles[1].prerequisites.source_packs[0].installed = 'not-applicable';
    });

    await rejects('omitted top-level and record source-pack evidence', (value) => {
      value.report.prerequisites.profile_source_packs = [];
      value.report.profiles[1].prerequisites.source_packs = [];
    });
    await rejects('omitted record source-pack evidence', (value) => {
      value.report.profiles[1].prerequisites.source_packs = [];
    });
    await rejects('extra top-level source-pack evidence', (value) => {
      value.report.prerequisites.profile_source_packs.push({
        name: 'extra',
        source_status: 'pass',
        manifest_sha256: '5'.repeat(64),
        artifact_count: 1,
        installed_parity: 'not-applicable',
      });
    });
    await rejects('duplicate top-level source-pack evidence', (value) => {
      value.report.prerequisites.profile_source_packs.push(
        structuredClone(value.report.prerequisites.profile_source_packs[0]),
      );
    });
    await rejects('extra record source-pack evidence', (value) => {
      value.report.profiles[0].prerequisites.source_packs.push({
        name: 'demo',
        source: 'pass',
        installed: 'pass',
      });
    });
    await rejects('record source-pack applicability disagrees with top-level evidence', (value) => {
      value.report.profiles[1].prerequisites.source_packs[0].installed = 'not-applicable';
    });
    await rejects('wrong source-pack manifest hash', (value) => {
      value.report.prerequisites.profile_source_packs[0].manifest_sha256 = '6'.repeat(64);
    });
    await rejects('wrong source-pack artifact count', (value) => {
      value.report.prerequisites.profile_source_packs[0].artifact_count += 1;
    });
    await suite.test('enabled and source-pack manifest contradiction fails self-comparison', () => {
      const changed = structuredClone(canonical);
      changed.report.prerequisites.profile_source_packs[0].manifest_sha256 = '7'.repeat(64);
      assert.throws(() => compareAudits(changed, changed), hasCode('E_COMPARE_REPORT'));
    });
    await suite.test('enabled and source-pack artifact-count contradiction fails self-comparison', () => {
      const changed = structuredClone(canonical);
      changed.report.prerequisites.profile_source_packs[0].artifact_count += 1;
      assert.throws(() => compareAudits(changed, changed), hasCode('E_COMPARE_REPORT'));
    });
    await suite.test('record source-pack projection contradiction fails self-comparison', () => {
      const changed = structuredClone(canonical);
      changed.report.profiles[1].prerequisites.source_packs[0].source = 'not-applicable';
      assert.throws(() => compareAudits(changed, changed), hasCode('E_COMPARE_REPORT'));
    });
    await rejects('dogfood claims core applicability', (value) => {
      value.report.dogfood_guidance.prerequisites.core_source_generated = 'pass';
    });
    await rejects('dogfood claims source-pack applicability', (value) => {
      value.report.dogfood_guidance.prerequisites.source_packs.push({
        name: 'demo',
        source: 'pass',
        installed: 'pass',
      });
    });

    await suite.test('enabled pack evidence drift without linked profile input change', () => {
      const changed = structuredClone(canonical);
      const enabledPack = changed.report.prerequisites.enabled_pack_source_installed.packs[0];
      const profilePack = changed.report.prerequisites.profile_source_packs[0];
      enabledPack.manifest_sha256 = '7'.repeat(64);
      profilePack.manifest_sha256 = enabledPack.manifest_sha256;
      assert.throws(
        () => compareAudits(canonical, changed),
        (error) => error instanceof PromptAuditError,
      );
    });

    await suite.test('counted input change without an inventory linkage', () => {
      const changed = structuredClone(canonical);
      changed.report.profiles[1].inputs[0].sha256 = '8'.repeat(64);
      assert.throws(
        () => compareAudits(canonical, changed),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });

    await suite.test('core prompt counts may change with only linked core evidence changing', async () => {
      const sourcePath = path.join(current.root, 'src/a.md');
      const generatedPath = path.join(current.root, '.github/a.md');
      const originalContent = fs.readFileSync(sourcePath);
      try {
        write(current.root, 'src/a.md', 'Expanded core prompt content.\n');
        write(current.root, '.github/a.md', 'Expanded core prompt content.\n');
        const changedReport = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
        assert.deepEqual(
          changedReport.prerequisites.enabled_pack_source_installed,
          report.prerequisites.enabled_pack_source_installed,
        );
        assert.deepEqual(
          changedReport.prerequisites.profile_source_packs,
          report.prerequisites.profile_source_packs,
        );
        assert.notEqual(
          changedReport.prerequisites.core_source_generated.checks[0].sha256,
          report.prerequisites.core_source_generated.checks[0].sha256,
        );
        const comparison = compareAudits(canonical, auditEnvelope(changedReport));
        assert.deepEqual(comparison.profiles[0].changed_inputs, ['src/a.md']);
      } finally {
        fs.writeFileSync(sourcePath, originalContent);
        fs.writeFileSync(generatedPath, originalContent);
      }
    });

    await suite.test('prompt counts may change while prerequisite evidence remains unchanged', async () => {
      write(current.root, '.github/skills/project/SKILL.md', 'Expanded project guidance.\n');
      const changedReport = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      assert.deepEqual(changedReport.prerequisites, report.prerequisites);
      const comparison = compareAudits(canonical, auditEnvelope(changedReport));
      assert.deepEqual(comparison.dogfood_guidance.changed_inputs, ['.github/skills/project/SKILL.md']);
      assert.notEqual(comparison.dogfood_guidance.delta.code_points, 0);
    });
  } finally {
    current.cleanup();
  }
});

test('linked enabled pack drift obeys the manifest inventory profile truth table', async () => {
  const manifest = defaultManifest();
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads two source-pack skills.',
    members: [
      'library/packs/alpha/skills/dude-pack-alpha-tool/SKILL.md',
      'library/packs/beta/skills/dude-pack-beta-tool/SKILL.md',
    ],
  };
  const current = fixture({ manifest });
  try {
    const alpha = installPackFixture(current.root, {
      normalized: true,
      packName: 'alpha',
      skillName: 'dude-pack-alpha-tool',
    });
    const beta = installPackFixture(current.root, {
      normalized: true,
      packName: 'beta',
      skillName: 'dude-pack-beta-tool',
    });
    const packs = [alpha, beta];
    const profile = {
      enabled_packs: packs.map((pack) => pack.packName),
      installed: Object.fromEntries(packs.map((pack) => [
        pack.packName,
        pack.profile.installed[pack.packName],
      ])),
    };
    const persistProfile = () => writeInstallProfile(profile, current.root);
    const updateArtifact = (pack, description) => {
      const changedSkill = `---\r\nname: ${pack.skillName}  \r\ndescription: "${description}"\r\n---\r\n\r\n# Updated Tool  `;
      write(pack.sourceArtifact, 'SKILL.md', changedSkill);
      write(pack.installedArtifact, 'SKILL.md', normalizeString(changedSkill));
      pack.inventory.artifacts[0].source_sha256 = hashArtifact(pack.sourceArtifact);
      pack.inventory.artifacts[0].installed_sha256 = hashArtifact(pack.installedArtifact);
      pack.inventory.digest = canonicalInventoryDigest(pack.inventory);
    };
    const packEvidence = (envelope, packName) => envelope.report.prerequisites
      .enabled_pack_source_installed.packs.find((pack) => pack.name === packName);
    const driftState = (baseline, changed, packName) => {
      const baselineEnabled = baseline.report.prerequisites.enabled_pack_source_installed;
      const changedEnabled = changed.report.prerequisites.enabled_pack_source_installed;
      const baselinePack = packEvidence(baseline, packName);
      const changedPack = packEvidence(changed, packName);
      assert.ok(baselinePack);
      assert.ok(changedPack);
      return [
        baselinePack.manifest_sha256 !== changedPack.manifest_sha256,
        baselinePack.inventory_digest !== changedPack.inventory_digest,
        baselineEnabled.profile_sha256 !== changedEnabled.profile_sha256,
      ].map((changedBit) => changedBit ? '1' : '0').join('');
    };

    persistProfile();
    const baseline = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));

    updateArtifact(alpha, 'Updated alpha fixture tool.');
    persistProfile();
    const artifactOnly = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    assert.equal(driftState(baseline, artifactOnly, 'alpha'), '011');
    assert.equal(
      packEvidence(baseline, 'beta').inventory_digest,
      packEvidence(artifactOnly, 'beta').inventory_digest,
    );
    assert.equal(
      packEvidence(baseline, 'beta').manifest_sha256,
      packEvidence(artifactOnly, 'beta').manifest_sha256,
    );

    fs.appendFileSync(path.join(alpha.packRoot, 'pack.md'), '\nUpdated fixture manifest.\n');
    alpha.inventory.manifest_sha256 = sha256(fs.readFileSync(path.join(alpha.packRoot, 'pack.md')));
    alpha.inventory.digest = canonicalInventoryDigest(alpha.inventory);
    persistProfile();
    const manifestAndInventory = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    assert.equal(driftState(baseline, manifestAndInventory, 'alpha'), '111');

    updateArtifact(beta, 'Updated beta fixture tool.');
    persistProfile();
    const twoInventoryChanges = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    assert.notEqual(
      packEvidence(baseline, 'alpha').inventory_digest,
      packEvidence(twoInventoryChanges, 'alpha').inventory_digest,
    );
    assert.notEqual(
      packEvidence(baseline, 'beta').inventory_digest,
      packEvidence(twoInventoryChanges, 'beta').inventory_digest,
    );

    const profileOnly = structuredClone(baseline);
    profileOnly.report.prerequisites.enabled_pack_source_installed.profile_sha256 = artifactOnly
      .report.prerequisites.enabled_pack_source_installed.profile_sha256;

    const inventoryOnly = structuredClone(artifactOnly);
    inventoryOnly.report.prerequisites.enabled_pack_source_installed.profile_sha256 = baseline
      .report.prerequisites.enabled_pack_source_installed.profile_sha256;

    const manifestOnly = structuredClone(manifestAndInventory);
    packEvidence(manifestOnly, 'alpha').inventory_digest = packEvidence(baseline, 'alpha').inventory_digest;
    manifestOnly.report.prerequisites.enabled_pack_source_installed.profile_sha256 = baseline
      .report.prerequisites.enabled_pack_source_installed.profile_sha256;

    const manifestAndProfile = structuredClone(manifestAndInventory);
    packEvidence(manifestAndProfile, 'alpha').inventory_digest = packEvidence(baseline, 'alpha').inventory_digest;

    const manifestAndInventoryOnly = structuredClone(manifestAndInventory);
    manifestAndInventoryOnly.report.prerequisites.enabled_pack_source_installed.profile_sha256 = baseline
      .report.prerequisites.enabled_pack_source_installed.profile_sha256;

    const cases = [
      { state: '000', expected: 'accept', report: structuredClone(baseline) },
      { state: '011', expected: 'accept', report: artifactOnly },
      { state: '111', expected: 'accept', report: manifestAndInventory },
      { state: '001', expected: 'reject', report: profileOnly },
      { state: '010', expected: 'reject', report: inventoryOnly },
      { state: '100', expected: 'reject', report: manifestOnly },
      { state: '101', expected: 'reject', report: manifestAndProfile },
      { state: '110', expected: 'reject', report: manifestAndInventoryOnly },
    ];
    for (const currentCase of cases) {
      assert.equal(driftState(baseline, currentCase.report, 'alpha'), currentCase.state);
      if (currentCase.expected === 'accept') {
        assert.doesNotThrow(
          () => compareAudits(baseline, currentCase.report),
          `state ${currentCase.state} should be accepted`,
        );
      } else {
        assert.throws(
          () => compareAudits(baseline, currentCase.report),
          hasCode('E_COMPARE_PREREQUISITES'),
          `state ${currentCase.state} should fail closed`,
        );
      }
    }

    assert.doesNotThrow(
      () => compareAudits(baseline, twoInventoryChanges),
      'two linked enabled-pack inventory changes should share one profile hash change',
    );
  } finally {
    current.cleanup();
  }
});

test('enabled inventory drift requires containing profile hash coherence', async (suite) => {
  const manifest = defaultManifest();
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads one source-pack skill.',
    members: ['library/packs/demo/skills/dude-pack-demo-tool/SKILL.md'],
  };
  const current = fixture({ manifest });
  try {
    const installed = installPackFixture(current.root, { normalized: true });
    const baseline = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    const changedSkill = '---\r\nname: dude-pack-demo-tool  \r\ndescription: "Updated fixture tool."\r\n---\r\n\r\n# Updated Tool  ';
    write(installed.sourceArtifact, 'SKILL.md', changedSkill);
    write(installed.installedArtifact, 'SKILL.md', normalizeString(changedSkill));
    fs.appendFileSync(path.join(installed.packRoot, 'pack.md'), '\nUpdated fixture manifest.\n');
    installed.inventory.manifest_sha256 = sha256(fs.readFileSync(path.join(installed.packRoot, 'pack.md')));
    installed.inventory.artifacts[0].source_sha256 = hashArtifact(installed.sourceArtifact);
    installed.inventory.artifacts[0].installed_sha256 = hashArtifact(installed.installedArtifact);
    installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
    writeInstallProfile(installed.profile, current.root);
    const changed = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    const baselineEnabled = baseline.report.prerequisites.enabled_pack_source_installed;
    const changedEnabled = changed.report.prerequisites.enabled_pack_source_installed;

    assert.notEqual(baselineEnabled.profile_sha256, changedEnabled.profile_sha256);
    assert.notEqual(
      baselineEnabled.packs[0].inventory_digest,
      changedEnabled.packs[0].inventory_digest,
    );
    assert.notEqual(
      baselineEnabled.packs[0].manifest_sha256,
      changedEnabled.packs[0].manifest_sha256,
    );

    await suite.test('coherent fresh audit update compares successfully', () => {
      const comparison = compareAudits(baseline, changed);
      assert.deepEqual(
        comparison.profiles[1].changed_inputs,
        ['library/packs/demo/skills/dude-pack-demo-tool/SKILL.md'],
      );
    });

    await suite.test('stale profile hash rejects otherwise coherent current evidence', () => {
      const invalid = structuredClone(changed);
      invalid.report.prerequisites.enabled_pack_source_installed.profile_sha256 = baselineEnabled.profile_sha256;
      assert.throws(
        () => compareAudits(baseline, invalid),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });

    await suite.test('stale inventory digest rejects changed manifest and profile evidence', () => {
      const invalid = structuredClone(changed);
      invalid.report.prerequisites.enabled_pack_source_installed.packs[0].inventory_digest = baselineEnabled.packs[0].inventory_digest;
      assert.throws(
        () => compareAudits(baseline, invalid),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });

    await suite.test('manifest drift with unchanged profile hash fails', () => {
      const invalid = structuredClone(changed);
      const invalidEnabled = invalid.report.prerequisites.enabled_pack_source_installed;
      invalidEnabled.profile_sha256 = baselineEnabled.profile_sha256;
      invalidEnabled.packs[0].inventory_digest = baselineEnabled.packs[0].inventory_digest;
      assert.throws(
        () => compareAudits(baseline, invalid),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });

    await suite.test('inventory digest drift with unchanged profile hash fails', () => {
      const invalid = structuredClone(changed);
      const invalidEnabled = invalid.report.prerequisites.enabled_pack_source_installed;
      invalidEnabled.profile_sha256 = baselineEnabled.profile_sha256;
      invalidEnabled.packs[0].manifest_sha256 = baselineEnabled.packs[0].manifest_sha256;
      invalid.report.prerequisites.profile_source_packs[0].manifest_sha256 = baselineEnabled.packs[0].manifest_sha256;
      assert.throws(
        () => compareAudits(baseline, invalid),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });

    await suite.test('profile hash drift without linked enabled evidence fails closed', () => {
      const invalid = structuredClone(baseline);
      invalid.report.prerequisites.enabled_pack_source_installed.profile_sha256 = changedEnabled.profile_sha256;
      assert.throws(
        () => compareAudits(baseline, invalid),
        hasCode('E_COMPARE_PREREQUISITES'),
      );
    });
  } finally {
    current.cleanup();
  }
});

test('fresh enabled profiled pack content changes allow only linked mutable evidence', async (suite) => {
  const manifest = defaultManifest();
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads one source-pack skill.',
    members: ['library/packs/demo/skills/dude-pack-demo-tool/SKILL.md'],
  };
  const current = fixture({ manifest });
  try {
    const installed = installPackFixture(current.root, { normalized: true });
    const baselineReport = await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    });
    const changedSkill = '---\r\nname: dude-pack-demo-tool  \r\ndescription: "Updated fixture tool."\r\n---\r\n\r\n# Updated Tool  ';
    write(installed.sourceArtifact, 'SKILL.md', changedSkill);
    write(installed.installedArtifact, 'SKILL.md', normalizeString(changedSkill));
    fs.appendFileSync(path.join(installed.packRoot, 'pack.md'), '\nUpdated fixture manifest.\n');
    installed.inventory.manifest_sha256 = sha256(fs.readFileSync(path.join(installed.packRoot, 'pack.md')));
    installed.inventory.artifacts[0].source_sha256 = hashArtifact(installed.sourceArtifact);
    installed.inventory.artifacts[0].installed_sha256 = hashArtifact(installed.installedArtifact);
    installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
    writeInstallProfile(installed.profile, current.root);
    const currentReport = await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    });
    const baseline = auditEnvelope(baselineReport);
    const changed = auditEnvelope(currentReport);
    const packInputPath = 'library/packs/demo/skills/dude-pack-demo-tool/SKILL.md';
    assert.notEqual(
      baselineReport.prerequisites.enabled_pack_source_installed.profile_sha256,
      currentReport.prerequisites.enabled_pack_source_installed.profile_sha256,
    );
    assert.notEqual(
      baselineReport.prerequisites.enabled_pack_source_installed.packs[0].inventory_digest,
      currentReport.prerequisites.enabled_pack_source_installed.packs[0].inventory_digest,
    );
    assert.notEqual(
      baselineReport.prerequisites.enabled_pack_source_installed.packs[0].manifest_sha256,
      currentReport.prerequisites.enabled_pack_source_installed.packs[0].manifest_sha256,
    );
    assert.notEqual(
      installed.inventory.artifacts[0].source_sha256,
      installed.inventory.artifacts[0].installed_sha256,
    );

    await suite.test('coherent source and installed refresh compares successfully', () => {
      const comparison = compareAudits(baseline, changed);
      assert.deepEqual(comparison.profiles[1].changed_inputs, [packInputPath]);
    });

    const invariantCases = [
      {
        name: 'source identity drift with linked content',
        mutate(value) {
          value.report.prerequisites.enabled_pack_source_installed.packs[0].source_identity.ref = 'changed-ref';
        },
      },
      {
        name: 'pack name drift with linked content',
        mutate(value) {
          const enabled = value.report.prerequisites.enabled_pack_source_installed;
          enabled.enabled_packs[0] = 'renamed';
          enabled.packs[0].name = 'renamed';
          value.report.prerequisites.profile_source_packs[0].installed_parity = 'not-applicable';
          value.report.profiles[1].prerequisites.source_packs[0].installed = 'not-applicable';
        },
      },
      {
        name: 'pack status drift with linked content',
        mutate(value) {
          value.report.prerequisites.profile_source_packs[0].source_status = 'not-applicable';
        },
      },
      {
        name: 'artifact count drift with linked content',
        mutate(value) {
          value.report.prerequisites.enabled_pack_source_installed.packs[0].artifact_count += 1;
          value.report.prerequisites.profile_source_packs[0].artifact_count += 1;
        },
      },
    ];
    for (const invariantCase of invariantCases) {
      await suite.test(invariantCase.name, () => {
        const invalid = structuredClone(changed);
        invariantCase.mutate(invalid);
        assert.throws(
          () => compareAudits(baseline, invalid),
          (error) => error instanceof PromptAuditError,
        );
      });
    }
  } finally {
    current.cleanup();
  }
});

test('fresh profiled-but-uninstalled pack drift compares coherently', async (suite) => {
  const manifest = defaultManifest();
  const packName = 'demo';
  const skillName = 'dude-pack-demo-tool';
  const packInputPath = `library/packs/${packName}/skills/${skillName}/SKILL.md`;
  manifest.profile_order = ['alpha', 'pack-profile'];
  manifest.profiles['pack-profile'] = {
    kind: 'release-source',
    activation_assumption: 'Fixture pack profile loads one uninstalled source-pack skill.',
    members: [packInputPath],
  };
  const current = fixture({ manifest });
  try {
    installPackFixture(current.root, {
      packName: 'control',
      skillName: 'dude-pack-control-tool',
    });
    const packRoot = path.join(current.root, 'library/packs', packName);
    const sourceArtifact = path.join(packRoot, 'skills', skillName);
    write(packRoot, 'pack.md', `---\nname: ${packName}\ndescription: "Uninstalled fixture pack."\nprovides:\n  agents: []\n  skills: [${skillName}]\nrequires:\n  tools: []\nhooks: []\n---\n\n# Fixture\n`);
    write(sourceArtifact, 'SKILL.md', `---\nname: ${skillName}\ndescription: "Uninstalled fixture tool."\n---\n\n# Tool\n`);

    const baseline = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    write(sourceArtifact, 'SKILL.md', `---\nname: ${skillName}\ndescription: "Updated uninstalled fixture tool."\n---\n\n# Updated Tool\n`);
    fs.appendFileSync(path.join(packRoot, 'pack.md'), '\nUpdated fixture manifest.\n');
    const changed = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    const sourcePack = (envelope) => envelope.report.prerequisites.profile_source_packs
      .find((pack) => pack.name === packName);
    const baselinePack = sourcePack(baseline);
    const changedPack = sourcePack(changed);
    assert.ok(baselinePack);
    assert.ok(changedPack);
    for (const envelope of [baseline, changed]) {
      const pack = sourcePack(envelope);
      assert.ok(pack);
      assert.equal(pack.source_status, 'pass');
      assert.equal(pack.installed_parity, 'not-applicable');
      assert.equal(pack.artifact_count, 1);
      assert.equal(
        envelope.report.prerequisites.enabled_pack_source_installed.enabled_packs.includes(packName),
        false,
      );
    }
    assert.notEqual(baselinePack.manifest_sha256, changedPack.manifest_sha256);
    assert.equal(baselinePack.name, changedPack.name);
    assert.deepEqual(baseline.report.profile_manifest, changed.report.profile_manifest);
    assert.deepEqual(baseline.report.profile_order, changed.report.profile_order);
    assert.deepEqual(
      baseline.report.profiles.map((profile) => ({
        name: profile.name,
        members: profile.inputs.map((input) => input.path),
        definition_sha256: profile.definition_sha256,
      })),
      changed.report.profiles.map((profile) => ({
        name: profile.name,
        members: profile.inputs.map((input) => input.path),
        definition_sha256: profile.definition_sha256,
      })),
    );
    assert.deepEqual(
      baseline.report.prerequisites.enabled_pack_source_installed,
      changed.report.prerequisites.enabled_pack_source_installed,
    );
    assert.deepEqual(
      baseline.report.prerequisites.core_source_generated,
      changed.report.prerequisites.core_source_generated,
    );
    assert.equal(baseline.report.prerequisites.status, changed.report.prerequisites.status);
    assert.deepEqual(
      baseline.report.profiles.map((profile) => profile.prerequisites),
      changed.report.profiles.map((profile) => profile.prerequisites),
    );
    assert.deepEqual(
      baseline.report.dogfood_guidance.prerequisites,
      changed.report.dogfood_guidance.prerequisites,
    );

    await suite.test('coherent source member and manifest refresh compares successfully', () => {
      const comparison = compareAudits(baseline, changed);
      assert.deepEqual(comparison.profiles[1].changed_inputs, [packInputPath]);
    });

    /**
     * @param {string} name
     * @param {Record<string, any>} candidate
     * @param {(value: Record<string, any>) => void} mutate
     */
    async function rejectsPrerequisiteDrift(name, candidate, mutate) {
      await suite.test(name, () => {
        const invalid = structuredClone(candidate);
        mutate(invalid);
        assert.throws(
          () => compareAudits(baseline, invalid),
          hasCode('E_COMPARE_PREREQUISITES'),
        );
      });
    }

    await rejectsPrerequisiteDrift('manifest drift without same-pack counted input drift', baseline, (value) => {
      sourcePack(value).manifest_sha256 = changedPack.manifest_sha256;
    });
    await rejectsPrerequisiteDrift('counted member drift with stale source-pack manifest evidence', changed, (value) => {
      sourcePack(value).manifest_sha256 = baselinePack.manifest_sha256;
    });
    await rejectsPrerequisiteDrift('installed applicability drift away from not-applicable', changed, (value) => {
      const enabled = value.report.prerequisites.enabled_pack_source_installed;
      const pack = sourcePack(value);
      enabled.enabled_packs.push(packName);
      enabled.packs.push({
        name: packName,
        source_identity: {
          type: 'library',
          location: path.join(current.root, 'library/packs'),
          ref: '',
        },
        manifest_sha256: pack.manifest_sha256,
        inventory_digest: '8'.repeat(64),
        artifact_count: pack.artifact_count,
        source_status: 'pass',
        installed_status: 'pass',
      });
      enabled.profile_sha256 = '9'.repeat(64);
      pack.installed_parity = 'pass';
      value.report.profiles[1].prerequisites.source_packs[0].installed = 'pass';
    });
    await rejectsPrerequisiteDrift('source-pack artifact count drift', changed, (value) => {
      sourcePack(value).artifact_count += 1;
    });
    await rejectsPrerequisiteDrift('unrelated enabled-pack identity drift', changed, (value) => {
      value.report.prerequisites.enabled_pack_source_installed.packs[0].source_identity.ref = 'drifted-ref';
    });

    const strictCases = [
      {
        name: 'source-pack name drift',
        code: 'E_COMPARE_REPORT',
        mutate(value) {
          sourcePack(value).name = 'renamed';
          value.report.profiles[1].prerequisites.source_packs[0].name = 'renamed';
        },
      },
      {
        name: 'source-pack status drift',
        code: 'E_COMPARE_REPORT',
        mutate(value) {
          sourcePack(value).source_status = 'not-applicable';
          value.report.profiles[1].prerequisites.source_packs[0].source = 'not-applicable';
        },
      },
      {
        name: 'profile membership drift',
        code: 'E_COMPARE_MEMBERSHIP',
        mutate(value) {
          const profile = value.report.profiles[1];
          profile.inputs[0].path = `library/packs/${packName}/skills/${skillName}/README.md`;
          profile.definition_sha256 = sha256(JSON.stringify({
            name: profile.name,
            kind: profile.kind,
            activation_assumption: profile.activation_assumption,
            members: profile.inputs.map((input) => input.path),
          }));
        },
      },
      {
        name: 'profile order drift',
        code: 'E_COMPARE_PROFILE_ORDER',
        mutate(value) {
          value.report.profile_order.reverse();
          value.report.profiles.reverse();
        },
      },
      {
        name: 'profile definition drift',
        code: 'E_COMPARE_DEFINITION',
        mutate(value) {
          const profile = value.report.profiles[1];
          profile.activation_assumption = 'Changed activation assumption.';
          profile.definition_sha256 = sha256(JSON.stringify({
            name: profile.name,
            kind: profile.kind,
            activation_assumption: profile.activation_assumption,
            members: profile.inputs.map((input) => input.path),
          }));
        },
      },
    ];
    for (const strictCase of strictCases) {
      await suite.test(strictCase.name, () => {
        const invalid = structuredClone(changed);
        strictCase.mutate(invalid);
        assert.throws(() => compareAudits(baseline, invalid), hasCode(strictCase.code));
      });
    }
  } finally {
    current.cleanup();
  }
});

test('enabled packs outside counted profiles require complete evidence equality', async () => {
  const current = fixture();
  try {
    installPackFixture(current.root);
    const baseline = auditEnvelope(await auditProfiles({
      root: current.root,
      profilesPath: current.profilesPath,
    }));
    const changed = structuredClone(baseline);
    changed.report.prerequisites.enabled_pack_source_installed.packs[0].inventory_digest = '7'.repeat(64);
    assert.throws(
      () => compareAudits(baseline, changed),
      hasCode('E_COMPARE_PREREQUISITES'),
    );
  } finally {
    current.cleanup();
  }
});

test('enabled profile source and actual installed inventory stay coherent', async (suite) => {
  function profiledManifest(packNames = ['demo']) {
    const manifest = defaultManifest();
    manifest.profile_order = ['alpha', 'pack-profile'];
    manifest.profiles['pack-profile'] = {
      kind: 'release-source',
      activation_assumption: 'Fixture pack profile loads enabled source-pack skills.',
      members: packNames.map((packName) =>
        `library/packs/${packName}/skills/dude-pack-${packName}-tool/SKILL.md`),
    };
    return manifest;
  }

  function externalProfiledFixture() {
    const current = fixture({ manifest: profiledManifest() });
    const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
    copyTree(installed.packRoot, path.join(current.root, 'library/packs/demo'));
    return { current, installed };
  }

  /** @param {ReturnType<typeof fixture>} current @param {string[]} packNames */
  function installEnabledPackFixtures(current, packNames) {
    const installedPacks = packNames.map((packName) => installPackFixture(current.root, {
      packName,
      skillName: `dude-pack-${packName}-tool`,
    }));
    writeInstallProfile({
      enabled_packs: packNames,
      installed: Object.fromEntries(installedPacks.map((installed) => [
        installed.packName,
        installed.profile.installed[installed.packName],
      ])),
    }, current.root);
    return installedPacks;
  }

  /** @param {() => Promise<unknown>} operation @param {{ missing: string[], extra: string[] }} details */
  async function rejectsInventoryParity(operation, details) {
    await assert.rejects(operation, (error) => {
      assert.ok(hasCode('E_PACK_PARITY')(error));
      assert.deepEqual(error.details, details);
      return true;
    });
  }

  await suite.test('byte-identical external and catalog projections allow normalized installed output', async () => {
    const { current, installed } = externalProfiledFixture();
    try {
      write(current.root, '.github/skills/dude-pack-unrelated-tool/SKILL.md', '# Unrelated namespace.\n');
      assert.notEqual(
        installed.inventory.artifacts[0].source_sha256,
        installed.inventory.artifacts[0].installed_sha256,
      );
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      assert.deepEqual(
        Object.keys(report.prerequisites.enabled_pack_source_installed).sort(),
        ['enabled_packs', 'packs', 'profile_path', 'profile_sha256', 'status'],
      );
      assert.equal(
        Object.hasOwn(report.prerequisites.enabled_pack_source_installed, 'verifiedPacks'),
        false,
      );
      assert.deepEqual(report.prerequisites.profile_source_packs, [{
        name: 'demo',
        source_status: 'pass',
        manifest_sha256: installed.inventory.manifest_sha256,
        artifact_count: 1,
        installed_parity: 'pass',
      }]);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('counted catalog source divergence from persisted identity is rejected', async () => {
    const { current } = externalProfiledFixture();
    try {
      write(
        current.root,
        'library/packs/demo/skills/dude-pack-demo-tool/SKILL.md',
        '---\nname: dude-pack-demo-tool\ndescription: "Divergent catalog tool."\n---\n\n# Divergent\n',
      );
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        (error) => {
          assert.ok(hasCode('E_PACK_PARITY')(error));
          assert.equal(
            error.message,
            "pack 'demo' profile catalog source differs from its persisted source identity",
          );
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('extra matching installed artifact omitted from inventory is rejected', async () => {
    const { current } = externalProfiledFixture();
    try {
      const extraPath = '.github/prompts/dude-pack-demo-unlisted.prompt.md';
      write(current.root, extraPath, '# Unlisted prompt.\n');
      await rejectsInventoryParity(
        () => auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        { missing: [], extra: [extraPath] },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('missing inventory-listed installed artifact is rejected', async () => {
    const { current, installed } = externalProfiledFixture();
    try {
      fs.rmSync(installed.installedArtifact, { recursive: true });
      const missingPath = '.github/skills/dude-pack-demo-tool';
      await rejectsInventoryParity(
        () => auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        { missing: [missingPath], extra: [] },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('matching skill file is rejected before installed hashing', async () => {
    const { current, installed } = externalProfiledFixture();
    try {
      fs.rmSync(installed.installedArtifact, { recursive: true });
      fs.writeFileSync(installed.installedArtifact, 'not a skill directory\n');
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        (error) => {
          assert.ok(hasCode('E_PACK_PARITY')(error));
          assert.match(error.message, /skills artifact has the wrong type/);
          assert.deepEqual(error.details, { path: '.github/skills/dude-pack-demo-tool' });
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('matching non-skill directory is rejected before installed hashing', async () => {
    const current = fixture({ manifest: profiledManifest() });
    try {
      const installed = installPackFixture(current.root);
      const sourcePath = 'prompts/dude-pack-demo-extra.prompt.md';
      const installedPath = `.github/${sourcePath}`;
      write(installed.packRoot, sourcePath, '# Fixture prompt.\n');
      write(current.root, installedPath, '# Fixture prompt.\n');
      installed.inventory.artifacts.push({
        path: installedPath,
        kind: 'prompts',
        source: sourcePath,
        source_sha256: hashArtifact(path.join(installed.packRoot, ...sourcePath.split('/'))),
        installed_sha256: hashArtifact(path.join(current.root, ...installedPath.split('/'))),
      });
      installed.inventory.artifacts.sort((first, second) => first.path.localeCompare(second.path));
      installed.profile.installed.demo.files = installed.inventory.artifacts.map((artifact) => artifact.path);
      installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
      writeInstallProfile(installed.profile, current.root);
      fs.rmSync(path.join(current.root, ...installedPath.split('/')));
      fs.mkdirSync(path.join(current.root, ...installedPath.split('/')));
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        (error) => {
          assert.ok(hasCode('E_PACK_PARITY')(error));
          assert.match(error.message, /prompts artifact has the wrong type/);
          assert.deepEqual(error.details, { path: installedPath });
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('matching top-level symbolic link is rejected', async (currentTest) => {
    const { current } = externalProfiledFixture();
    try {
      const target = write(current.root, 'symlink-target.md', '# Target.\n');
      const link = path.join(current.root, '.github/prompts/dude-pack-demo-linked.prompt.md');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      try {
        fs.symlinkSync(target, link);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error
          && ['EACCES', 'ENOSYS', 'ENOTSUP', 'EPERM'].includes(error.code)) {
          currentTest.skip(`symbolic links are unavailable on this platform (${error.code})`);
          return;
        }
        throw error;
      }
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_INPUT_SYMLINK'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('hyphen-prefix enabled pack names are rejected deterministically', async () => {
    const current = fixture({ manifest: profiledManifest(['demo', 'demo-extra']) });
    try {
      const demo = installPackFixture(current.root, {
        packName: 'demo',
        skillName: 'dude-pack-demo-tool',
      });
      const demoExtra = installPackFixture(current.root, {
        packName: 'demo-extra',
        skillName: 'dude-pack-demo-extra-tool',
      });
      writeInstallProfile({
        enabled_packs: ['demo', 'demo-extra'],
        installed: {
          demo: demo.profile.installed.demo,
          'demo-extra': demoExtra.profile.installed['demo-extra'],
        },
      }, current.root);
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        (error) => {
          assert.ok(hasCode('E_INSTALL_PROFILE')(error));
          assert.match(error.message, /'demo'.*'demo-extra'/);
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('detached self-comparison rejects hyphen-prefix enabled pack names', async () => {
    const current = fixture();
    try {
      installEnabledPackFixtures(current, ['demo', 'demography']);
      const valid = auditEnvelope(await auditProfiles({
        root: current.root,
        profilesPath: current.profilesPath,
      }));
      assert.equal(compareAudits(valid, structuredClone(valid)).comparable, true);
      assert.deepEqual(valid.report.prerequisites.profile_source_packs, []);

      const forged = structuredClone(valid);
      const enabled = forged.report.prerequisites.enabled_pack_source_installed;
      enabled.enabled_packs[1] = 'demo-extra';
      enabled.packs[1].name = 'demo-extra';
      assert.throws(
        () => compareAudits(forged, structuredClone(forged)),
        (error) => {
          assert.ok(hasCode('E_COMPARE_REPORT')(error));
          assert.match(error.message, /'demo'.*'demo-extra'.*ambiguous namespace prefix/);
          return true;
        },
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('non-colliding near-prefix enabled pack names remain valid', async () => {
    const current = fixture({ manifest: profiledManifest(['demo', 'demography']) });
    try {
      installEnabledPackFixtures(current, ['demo', 'demography']);
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      assert.deepEqual(
        report.prerequisites.enabled_pack_source_installed.enabled_packs,
        ['demo', 'demography'],
      );
      assert.deepEqual(
        report.prerequisites.enabled_pack_source_installed.packs.map((pack) => pack.name),
        ['demo', 'demography'],
      );
      assert.deepEqual(
        report.prerequisites.profile_source_packs.map((pack) => pack.name),
        ['demo', 'demography'],
      );
      const envelope = auditEnvelope(report);
      assert.equal(compareAudits(envelope, structuredClone(envelope)).comparable, true);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('longer-prefix stray installed artifact belongs to the enabled prefix inventory', async () => {
    const { current } = externalProfiledFixture();
    try {
      const extraPath = '.github/skills/dude-pack-demo-extra-tool';
      write(current.root, `${extraPath}/SKILL.md`, '# Stray longer-prefix skill.\n');
      await rejectsInventoryParity(
        () => auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        { missing: [], extra: [extraPath] },
      );
    } finally {
      current.cleanup();
    }
  });

  const existingParityCases = [
    {
      name: 'profile files mismatch remains rejected',
      mutate(current, installed) {
        installed.profile.installed.demo.files = [];
        writeInstallProfile(installed.profile, current.root);
      },
    },
    {
      name: 'installed content mismatch remains rejected',
      mutate(_current, installed) {
        fs.appendFileSync(path.join(installed.installedArtifact, 'SKILL.md'), '\nchanged installed bytes\n');
      },
    },
    {
      name: 'source hash mismatch remains rejected',
      mutate(current, installed) {
        fs.appendFileSync(path.join(installed.sourceArtifact, 'SKILL.md'), '\nchanged source bytes\n');
        fs.rmSync(path.join(current.root, 'library/packs/demo'), { recursive: true });
        copyTree(installed.packRoot, path.join(current.root, 'library/packs/demo'));
      },
    },
  ];
  for (const parityCase of existingParityCases) {
    await suite.test(parityCase.name, async () => {
      const { current, installed } = externalProfiledFixture();
      try {
        parityCase.mutate(current, installed);
        await assert.rejects(
          auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
          hasCode('E_PACK_PARITY'),
        );
      } finally {
        current.cleanup();
      }
    });
  }
});

test('persisted source parity follows inventory identity and allows normalized installed bytes', async (suite) => {
  await suite.test('normalized source-origin hashes differ and independently pass', async () => {
    const current = fixture();
    try {
      const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
      assert.notEqual(
        installed.inventory.artifacts[0].source_sha256,
        installed.inventory.artifacts[0].installed_sha256,
      );
      assert.equal(computeInventoryDigest(installed.inventory), canonicalInventoryDigest(installed.inventory));
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const pack = report.prerequisites.enabled_pack_source_installed.packs[0];
      assert.deepEqual(pack.source_identity, installed.inventory.source);
      assert.equal(pack.source_status, 'pass');
      assert.equal(pack.installed_status, 'pass');
    } finally {
      current.cleanup();
    }
  });

  const failures = [
    {
      name: 'unavailable persisted source with convenient catalog present',
      mutate(current, installed) {
        const convenient = path.join(current.root, 'library/packs/demo');
        copyTree(installed.packRoot, convenient);
        installed.profile.installed.demo.inventory.source.location = path.join(current.root, 'missing-origin');
        installed.profile.installed.demo.inventory.digest = canonicalInventoryDigest(installed.profile.installed.demo.inventory);
        writeInstallProfile(installed.profile, current.root);
      },
      code: 'E_PACK_SOURCE',
    },
    {
      name: 'mismatched persisted source',
      mutate(current, installed) {
        const other = path.join(current.root, 'other-origin');
        copyTree(path.join(current.root, 'persisted-origin'), other);
        write(other, 'library/packs/demo/skills/dude-pack-demo-tool/SKILL.md', 'different raw source\n');
        installed.profile.installed.demo.inventory.source.location = other;
        installed.profile.installed.demo.inventory.digest = canonicalInventoryDigest(installed.profile.installed.demo.inventory);
        writeInstallProfile(installed.profile, current.root);
      },
      code: 'E_PACK_PARITY',
    },
    {
      name: 'manifest mismatch',
      mutate(_current, installed) { fs.appendFileSync(path.join(installed.packRoot, 'pack.md'), '\nchanged\n'); },
      code: 'E_PACK_PARITY',
    },
    {
      name: 'source artifact mismatch',
      mutate(_current, installed) { fs.appendFileSync(path.join(installed.sourceArtifact, 'SKILL.md'), '\nchanged\n'); },
      code: 'E_PACK_PARITY',
    },
    {
      name: 'installed artifact mismatch',
      mutate(_current, installed) { fs.appendFileSync(path.join(installed.installedArtifact, 'SKILL.md'), '\nchanged\n'); },
      code: 'E_PACK_PARITY',
    },
    {
      name: 'source artifact set mismatch',
      mutate(_current, installed) {
        write(installed.packRoot, 'prompts/dude-pack-demo-extra.prompt.md', '# Extra\n');
      },
      code: 'E_PACK_PARITY',
    },
    {
      name: 'inventory digest mismatch',
      mutate(current, installed) {
        installed.profile.installed.demo.inventory.digest = '0'.repeat(64);
        writeInstallProfile(installed.profile, current.root);
      },
      code: 'E_INSTALL_PROFILE',
    },
  ];
  for (const failure of failures) {
    await suite.test(failure.name, async () => {
      const current = fixture();
      try {
        const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
        failure.mutate(current, installed);
        await assert.rejects(
          auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
          hasCode(failure.code),
        );
      } finally {
        current.cleanup();
      }
    });
  }
});

test('supplied static path aliases are rejected before canonicalization', { skip: POSIX_SKIP }, async (suite) => {
  await suite.test('direct workspace root and absolute profile path preserve the report', async () => {
    const current = fixture();
    try {
      const relative = await auditProfiles({ root: current.root, profilesPath: 'profiles.json' });
      const absolute = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      assert.deepEqual(absolute, relative);
      assert.equal(absolute.profile_manifest.path, 'profiles.json');
      assert.equal(absolute.profile_manifest.sha256, relative.profile_manifest.sha256);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('final workspace-root alias is rejected before root canonicalization or input reads', async (aliasTest) => {
    const current = fixture();
    const aliasRoot = `${current.root}-alias`;
    try {
      if (!createStaticAlias(aliasTest, current.root, aliasRoot)) return;
      const calls = await observePathAccess(
        { realpath: aliasRoot, open: current.profilesPath },
        async () => {
          await assert.rejects(
            auditProfiles({ root: aliasRoot, profilesPath: current.profilesPath }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      removeStaticAlias(aliasRoot);
      current.cleanup();
    }
  });

  await suite.test('intermediate workspace-root ancestor alias is rejected before root canonicalization or input reads', async (aliasTest) => {
    const current = fixture();
    const aliasParent = `${current.root}-parent-alias`;
    const requestedRoot = path.join(aliasParent, path.basename(current.root));
    try {
      if (!createStaticAlias(aliasTest, path.dirname(current.root), aliasParent)) return;
      const calls = await observePathAccess(
        { realpath: requestedRoot, open: current.profilesPath },
        async () => {
          await assert.rejects(
            auditProfiles({ root: requestedRoot, profilesPath: current.profilesPath }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      removeStaticAlias(aliasParent);
      current.cleanup();
    }
  });

  const profileAncestorCases = [
    {
      name: 'absolute profile parent alias',
      setup(current, aliasTest) {
        const realParent = path.join(current.root, 'profile-real');
        const aliasParent = path.join(current.root, 'profile-parent-alias');
        const realPath = write(realParent, 'profiles.json', fs.readFileSync(current.profilesPath));
        if (!createStaticAlias(aliasTest, realParent, aliasParent)) return null;
        return {
          requestedPath: path.join(aliasParent, 'profiles.json'),
          canonicalParent: aliasParent,
          realPath,
        };
      },
    },
    {
      name: 'absolute profile intermediate ancestor alias',
      setup(current, aliasTest) {
        const container = path.join(current.root, 'profile-tree');
        const realAncestor = path.join(container, 'real');
        const aliasAncestor = path.join(container, 'alias');
        const realPath = write(realAncestor, 'deep/profiles.json', fs.readFileSync(current.profilesPath));
        if (!createStaticAlias(aliasTest, realAncestor, aliasAncestor)) return null;
        return {
          requestedPath: path.join(aliasAncestor, 'deep/profiles.json'),
          canonicalParent: path.join(aliasAncestor, 'deep'),
          realPath,
        };
      },
    },
  ];
  for (const profileCase of profileAncestorCases) {
    await suite.test(`${profileCase.name} is rejected before canonicalization or input reads`, async (aliasTest) => {
      const current = fixture();
      try {
        const paths = profileCase.setup(current, aliasTest);
        if (!paths) return;
        const calls = await observePathAccess(
          { realpath: paths.canonicalParent, open: paths.realPath },
          async () => {
            await assert.rejects(
              auditProfiles({ root: current.root, profilesPath: paths.requestedPath }),
              hasCode('E_INPUT_SYMLINK'),
            );
          },
        );
        assert.equal(calls.realpath, 0);
        assert.equal(calls.open, 0);
      } finally {
        current.cleanup();
      }
    });
  }

  await suite.test('final absolute profile alias remains an input symlink error', async (aliasTest) => {
    const current = fixture();
    const aliasPath = path.join(current.root, 'profiles-alias.json');
    try {
      if (!createStaticAlias(aliasTest, current.profilesPath, aliasPath, 'file')) return;
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: aliasPath }),
        hasCode('E_INPUT_SYMLINK'),
      );
    } finally {
      current.cleanup();
    }
  });

  await suite.test('outside-workspace absolute profile alias is unsafe before canonicalization or link inspection', async (aliasTest) => {
    const current = fixture();
    const outsideAlias = `${current.root}-outside-profile.json`;
    try {
      if (!createStaticAlias(aliasTest, current.profilesPath, outsideAlias, 'file')) return;
      const calls = await observePathAccess(
        { realpath: path.dirname(outsideAlias), lstat: outsideAlias, open: current.profilesPath },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: outsideAlias }),
            hasCode('E_INPUT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.lstat, 0);
      assert.equal(calls.open, 0);
    } finally {
      removeStaticAlias(outsideAlias);
      current.cleanup();
    }
  });

  await suite.test('direct external tokenizer results pass', async () => {
    const current = fixture();
    const resultsRoot = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-tokenizer-'));
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsRoot, tokenizerManifest(report));
      const tokenized = await auditProfiles({
        root: current.root,
        profilesPath: current.profilesPath,
        tokenizerResults: config,
      });
      assert.equal(tokenized.tokenizer.status, 'available');
      assert.equal(tokenized.tokenizer.results_sha256, config.sha256);
    } finally {
      fs.rmSync(resultsRoot, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('tokenizer parent alias is rejected before canonicalization or result reads', async (aliasTest) => {
    const current = fixture();
    const resultsRoot = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-tokenizer-'));
    const aliasRoot = `${resultsRoot}-alias`;
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsRoot, tokenizerManifest(report));
      if (!createStaticAlias(aliasTest, resultsRoot, aliasRoot)) return;
      const requestedPath = path.join(aliasRoot, path.basename(config.path));
      const calls = await observePathAccess(
        { realpath: aliasRoot, open: config.path },
        async () => {
          await assert.rejects(
            auditProfiles({
              root: current.root,
              profilesPath: current.profilesPath,
              tokenizerResults: { ...config, path: requestedPath },
            }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      removeStaticAlias(aliasRoot);
      fs.rmSync(resultsRoot, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('tokenizer intermediate ancestor alias is rejected before canonicalization or result reads', async (aliasTest) => {
    const current = fixture();
    const container = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-tokenizer-tree-'));
    const realAncestor = path.join(container, 'real');
    const aliasAncestor = path.join(container, 'alias');
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(
        path.join(realAncestor, 'results'),
        tokenizerManifest(report),
      );
      if (!createStaticAlias(aliasTest, realAncestor, aliasAncestor)) return;
      const requestedPath = path.join(aliasAncestor, 'results', path.basename(config.path));
      const calls = await observePathAccess(
        { realpath: path.dirname(requestedPath), open: config.path },
        async () => {
          await assert.rejects(
            auditProfiles({
              root: current.root,
              profilesPath: current.profilesPath,
              tokenizerResults: { ...config, path: requestedPath },
            }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      fs.rmSync(container, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('final tokenizer result alias remains an input symlink error', async (aliasTest) => {
    const current = fixture();
    const resultsRoot = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-tokenizer-'));
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsRoot, tokenizerManifest(report));
      const aliasPath = path.join(resultsRoot, 'tokenizer-results-alias.json');
      if (!createStaticAlias(aliasTest, config.path, aliasPath, 'file')) return;
      await assert.rejects(
        auditProfiles({
          root: current.root,
          profilesPath: current.profilesPath,
          tokenizerResults: { ...config, path: aliasPath },
        }),
        hasCode('E_INPUT_SYMLINK'),
      );
    } finally {
      fs.rmSync(resultsRoot, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('direct relative persisted source identity preserves normalized unequal hashes', async () => {
    const current = fixture();
    try {
      const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
      installed.inventory.source.location = 'persisted-origin';
      installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
      writeInstallProfile(installed.profile, current.root);
      assert.notEqual(
        installed.inventory.artifacts[0].source_sha256,
        installed.inventory.artifacts[0].installed_sha256,
      );
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const pack = report.prerequisites.enabled_pack_source_installed.packs[0];
      assert.deepEqual(pack.source_identity, installed.inventory.source);
      assert.equal(pack.source_status, 'pass');
      assert.equal(pack.installed_status, 'pass');
    } finally {
      current.cleanup();
    }
  });

  await suite.test('final persisted-source root alias is rejected before canonicalization or source reads', async (aliasTest) => {
    const current = fixture();
    try {
      const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
      const directRoot = path.join(current.root, 'persisted-origin');
      const aliasRoot = path.join(current.root, 'persisted-origin-alias');
      if (!createStaticAlias(aliasTest, directRoot, aliasRoot)) return;
      installed.inventory.source.location = aliasRoot;
      installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
      writeInstallProfile(installed.profile, current.root);
      const calls = await observePathAccess(
        { realpath: aliasRoot, open: path.join(directRoot, 'library/packs/demo/pack.md') },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('intermediate persisted-source ancestor alias is rejected before canonicalization or source reads', async (aliasTest) => {
    const current = fixture();
    try {
      const installed = installPackFixture(current.root, { sourceType: 'source', normalized: true });
      const originalRoot = path.join(current.root, 'persisted-origin');
      const realAncestor = path.join(current.root, 'persisted-real-parent');
      const directRoot = path.join(realAncestor, 'persisted-origin');
      const aliasAncestor = path.join(current.root, 'persisted-parent-alias');
      fs.mkdirSync(realAncestor);
      fs.renameSync(originalRoot, directRoot);
      if (!createStaticAlias(aliasTest, realAncestor, aliasAncestor)) return;
      const requestedRoot = path.join(aliasAncestor, 'persisted-origin');
      installed.inventory.source.location = requestedRoot;
      installed.inventory.digest = canonicalInventoryDigest(installed.inventory);
      writeInstallProfile(installed.profile, current.root);
      const calls = await observePathAccess(
        { realpath: requestedRoot, open: path.join(directRoot, 'library/packs/demo/pack.md') },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
            hasCode('E_ROOT_UNSAFE'),
          );
        },
      );
      assert.equal(calls.realpath, 0);
      assert.equal(calls.open, 0);
    } finally {
      current.cleanup();
    }
  });

  await suite.test('comparison baseline and current parent aliases are root errors before canonicalization or reads', async (aliasTest) => {
    const current = fixture();
    const reportsContainer = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-comparison-'));
    const directAncestor = path.join(reportsContainer, 'real');
    const reportsRoot = path.join(directAncestor, 'reports');
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const baselinePath = write(reportsRoot, 'baseline.json', `${JSON.stringify(auditEnvelope(report))}\n`);
      const currentPath = write(reportsRoot, 'current.json', `${JSON.stringify(auditEnvelope(report))}\n`);
      const directOutput = outputSink();
      assert.equal(await runCli(
        ['compare', '--baseline', baselinePath, '--current', currentPath, '--json'],
        { stdout: directOutput.stream },
      ), 0);
      assert.equal(JSON.parse(directOutput.read()).comparison.comparable, true);
      const aliasCases = [
        {
          name: 'parent',
          target: reportsRoot,
          alias: path.join(reportsContainer, 'reports-alias'),
          requestedParent: path.join(reportsContainer, 'reports-alias'),
        },
        {
          name: 'intermediate ancestor',
          target: directAncestor,
          alias: path.join(reportsContainer, 'ancestor-alias'),
          requestedParent: path.join(reportsContainer, 'ancestor-alias/reports'),
        },
      ];
      for (const aliasCase of aliasCases) {
        if (!createStaticAlias(aliasTest, aliasCase.target, aliasCase.alias)) return;
        try {
          for (const aliasedInput of ['baseline', 'current']) {
            const requestedPath = path.join(aliasCase.requestedParent, `${aliasedInput}.json`);
            const canonicalPath = aliasedInput === 'baseline' ? baselinePath : currentPath;
            const args = aliasedInput === 'baseline'
              ? ['compare', '--baseline', requestedPath, '--current', currentPath]
              : ['compare', '--baseline', baselinePath, '--current', requestedPath];
            const calls = await observePathAccess(
              { realpath: aliasCase.requestedParent, open: canonicalPath },
              () => assertCliFailure(args, 'E_ROOT_UNSAFE'),
            );
            assert.equal(calls.realpath, 0, `${aliasCase.name} ${aliasedInput}`);
            assert.equal(calls.open, 0, `${aliasCase.name} ${aliasedInput}`);
          }
        } finally {
          removeStaticAlias(aliasCase.alias);
        }
      }
    } finally {
      fs.rmSync(reportsContainer, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('final comparison file aliases remain input symlink errors', async (aliasTest) => {
    const current = fixture();
    const reportsRoot = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-comparison-'));
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const baselinePath = write(reportsRoot, 'baseline.json', `${JSON.stringify(auditEnvelope(report))}\n`);
      const currentPath = write(reportsRoot, 'current.json', `${JSON.stringify(auditEnvelope(report))}\n`);
      for (const aliasedInput of ['baseline', 'current']) {
        const directPath = aliasedInput === 'baseline' ? baselinePath : currentPath;
        const aliasPath = path.join(reportsRoot, `${aliasedInput}-alias.json`);
        if (!createStaticAlias(aliasTest, directPath, aliasPath, 'file')) return;
        const args = aliasedInput === 'baseline'
          ? ['compare', '--baseline', aliasPath, '--current', currentPath]
          : ['compare', '--baseline', baselinePath, '--current', aliasPath];
        await assertCliFailure(args, 'E_INPUT_SYMLINK');
      }
    } finally {
      fs.rmSync(reportsRoot, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('workspace source-member alias remains an input symlink error', async (aliasTest) => {
    const current = fixture();
    try {
      const target = write(current.root, 'source-target.md', 'A\n');
      const member = path.join(current.root, 'src/a.md');
      fs.rmSync(member);
      if (!createStaticAlias(aliasTest, target, member, 'file')) return;
      await assert.rejects(
        auditProfiles({ root: current.root, profilesPath: current.profilesPath }),
        hasCode('E_INPUT_SYMLINK'),
      );
    } finally {
      current.cleanup();
    }
  });
});

test('persistent final, ancestor, and workspace-root replacements are detected', { skip: POSIX_SKIP }, async (suite) => {
  await suite.test('final file replacement', async () => {
    const current = fixture();
    const resultsDirectory = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-results-'));
    const target = path.join(current.root, 'src/a.md');
    const displaced = `${target}.old`;
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsDirectory, tokenizerManifest(report));
      await withPersistentReplacement(
        config.path,
        () => {
          const bytes = fs.readFileSync(target);
          fs.renameSync(target, displaced);
          fs.writeFileSync(target, bytes);
        },
        () => {
          fs.rmSync(target, { force: true });
          if (fs.existsSync(displaced)) fs.renameSync(displaced, target);
        },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: current.profilesPath, tokenizerResults: config }),
            hasCode('E_INPUT_DRIFT'),
          );
        },
      );
    } finally {
      fs.rmSync(resultsDirectory, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('ancestor directory replacement', async () => {
    const current = fixture();
    const resultsDirectory = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-results-'));
    const target = path.join(current.root, 'src');
    const displaced = path.join(current.root, 'src-old');
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsDirectory, tokenizerManifest(report));
      await withPersistentReplacement(
        config.path,
        () => {
          fs.renameSync(target, displaced);
          copyTree(displaced, target);
        },
        () => {
          fs.rmSync(target, { recursive: true, force: true });
          if (fs.existsSync(displaced)) fs.renameSync(displaced, target);
        },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: current.profilesPath, tokenizerResults: config }),
            hasCode('E_INPUT_DRIFT'),
          );
        },
      );
    } finally {
      fs.rmSync(resultsDirectory, { recursive: true, force: true });
      current.cleanup();
    }
  });

  await suite.test('workspace root replacement', async () => {
    const current = fixture();
    const resultsDirectory = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-results-'));
    const displaced = `${current.root}-old`;
    try {
      const report = await auditProfiles({ root: current.root, profilesPath: current.profilesPath });
      const config = writeTokenizerManifest(resultsDirectory, tokenizerManifest(report));
      await withPersistentReplacement(
        config.path,
        () => {
          fs.renameSync(current.root, displaced);
          fs.mkdirSync(current.root);
        },
        () => {
          fs.rmSync(current.root, { recursive: true, force: true });
          if (fs.existsSync(displaced)) fs.renameSync(displaced, current.root);
        },
        async () => {
          await assert.rejects(
            auditProfiles({ root: current.root, profilesPath: current.profilesPath, tokenizerResults: config }),
            hasCode('E_INPUT_DRIFT'),
          );
        },
      );
    } finally {
      fs.rmSync(resultsDirectory, { recursive: true, force: true });
      current.cleanup();
    }
  });
});

test('strict CLI rejects duplicates, inapplicable options, missing values, partial pairs, and extra commands', async () => {
  const current = fixture();
  try {
    const cases = [
      ['audit', '--baseline', 'ignored.json', '--json'],
      ['audit', '--json', '--json'],
      ['audit', '--root', current.root, '--root', current.root, '--json'],
      ['audit', '--unknown', '--json'],
      ['audit', '--profiles', '--json'],
      ['audit', 'extra', '--json'],
      ['audit', '--tokenizer-results', 'results.json', '--json'],
      ['compare', '--baseline', 'a.json', '--current', 'b.json', '--profiles', 'profiles.json', '--json'],
      ['compare', '--baseline', 'a.json', '--current', 'b.json', '--tokenizer-results', 'r.json', '--tokenizer-results-sha256', '0'.repeat(64), '--json'],
      ['audit', '--help', '--json'],
      ['--help', '--help'],
      [],
    ];
    for (const args of cases) {
      const stdout = outputSink();
      const stderr = outputSink();
      const exitCode = await runCli(args, {
        stdout: stdout.stream,
        stderr: stderr.stream,
        defaultRoot: current.root,
        defaultProfilesPath: current.profilesPath,
      });
      assert.equal(exitCode, 1, args.join(' '));
      const output = stdout.read() || stderr.read();
      assert.match(output, /E_USAGE/, args.join(' '));
    }

    const help = outputSink();
    assert.equal(await runCli(['audit', '--help'], { stdout: help.stream }), 0);
    assert.match(help.read(), /tokenizer-results/);

    const success = outputSink();
    assert.equal(await runCli(['audit', '--json'], {
      stdout: success.stream,
      defaultRoot: current.root,
      defaultProfilesPath: current.profilesPath,
    }), 0);
    assert.deepEqual(Object.keys(JSON.parse(success.read())).sort(), ['command', 'ok', 'report']);

    const invalidData = outputSink();
    assert.equal(await runCli(['audit', '--profiles', 'missing.json', '--json'], {
      stdout: invalidData.stream,
      defaultRoot: current.root,
    }), 2);
    assert.notEqual(JSON.parse(invalidData.read()).error.code, 'E_USAGE');
  } finally {
    current.cleanup();
  }
});

test('repository wrapper freezes the six profile order without changing it', async () => {
  const root = fs.mkdtempSync(path.join(canonicalTemporaryDirectory, 'prompt-audit-repository-wrapper-'));
  try {
    const manifest = JSON.parse(fs.readFileSync(repositoryWrapper.repositoryProfiles, 'utf8'));
    const members = manifest.profile_order.flatMap((name) => manifest.profiles[name].members);
    for (const member of new Set(members)) {
      copyTree(path.join(repositoryRoot, member), path.join(root, member));
      if (member.startsWith(`${manifest.parity.core_source_root}/`)) {
        const suffix = member.slice(manifest.parity.core_source_root.length + 1);
        copyTree(
          path.join(repositoryRoot, manifest.parity.core_generated_root, suffix),
          path.join(root, manifest.parity.core_generated_root, suffix),
        );
      }
    }
    for (const member of manifest.dogfood_guidance.members) {
      const source = path.join(repositoryRoot, member);
      if (!fs.existsSync(source) && member.startsWith('.dude/memory/')) {
        write(root, member, PRIVATE_DOGFOOD_PLACEHOLDER);
      } else {
        copyTree(source, path.join(root, member));
      }
    }
    copyTree(
      path.join(repositoryRoot, manifest.parity.pack_catalog_root, 'beads'),
      path.join(root, manifest.parity.pack_catalog_root, 'beads'),
    );
    write(root, manifest.parity.install_profile, emptyInstallProfile());
    write(root, 'profiles.json', `${JSON.stringify(manifest, null, 2)}\n`);

    const stdout = outputSink();
    const exitCode = await repositoryWrapper.main([
      'audit',
      '--root', root,
      '--profiles', 'profiles.json',
      '--json',
    ], { stdout: stdout.stream });
    assert.equal(exitCode, 0);
    const envelope = JSON.parse(stdout.read());
    assert.deepEqual(envelope.report.profile_order, [
      'core-coordinator',
      'definition-common',
      'lightweight-common',
      'tracked-common',
      'bundle-maintenance',
      'review-common',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installed runtime has exactly two files and works independently when installed', async (context) => {
  if (!fs.existsSync(installedRuntimePath)) {
    context.skip('authoring pack is intentionally absent during source-only validation');
    return;
  }
  const installedDirectory = path.dirname(installedRuntimePath);
  assert.deepEqual(fs.readdirSync(installedDirectory).sort(), ['SKILL.md', 'prompt-audit.mjs']);
  const installedRuntime = await import(`${pathToFileURL(installedRuntimePath).href}?test=${Date.now()}`);
  const current = fixture();
  try {
    const stdout = outputSink();
    const exitCode = await installedRuntime.runCli(['audit', '--profiles', 'profiles.json', '--json'], {
      stdout: stdout.stream,
      defaultRoot: current.root,
    });
    assert.equal(exitCode, 0);
    const envelope = JSON.parse(stdout.read());
    assert.equal(envelope.ok, true);
    assert.equal(envelope.command, 'audit');
  } finally {
    current.cleanup();
  }
});

// @ts-check
/**
 * Falsify the model-mapping topology in a fully disposable repository copy.
 *
 * This is deliberately a test-local authority scan: production code must not
 * grow a model-literal scanner or another configuration authority.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(here, '..');
const CANONICAL_CONFIG = 'src/config/agent-models.json';
const PACKAGED_CONFIG = '.github/skills/dude-engine/config/agent-models.json';
const REPRESENTATIVE_PACK = 'coding';
const AGENT_SUFFIX = '.agent.md';
const DROPPED_TARGETS = ['.claude', '.github/agents-sdk', '.github/config'];
const AUTHORED_SCAN_ROOTS = ['README.md', 'src', 'scripts', 'docs', 'library/packs'];
// Current independently authored text/code suffixes under AUTHORED_SCAN_ROOTS.
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ps1',
  '.scss',
  '.sh',
  '.yml',
]);

/** @param {string} root @param {string} relative */
function at(root, relative) {
  return path.join(root, ...relative.split('/'));
}

/** @param {Buffer | string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {Buffer} actual @param {Buffer} expected @param {string} label */
function assertExactBytes(actual, expected, label) {
  if (actual.equals(expected)) return;
  assert.fail(
    `${label} bytes differ (actual length=${actual.length}, sha256=${sha256(actual)}; `
    + `expected length=${expected.length}, sha256=${sha256(expected)})`,
  );
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Capture bytes and topology without following links. File metadata is
 * intentionally excluded: this test asserts byte stability, not timestamps.
 * @param {string} root
 * @param {{ exclude?: (relative: string) => boolean }} [options]
 */
function snapshotTree(root, { exclude = () => false } = {}) {
  /** @type {Array<{ path: string, type: string, bytes?: Buffer, target?: string }>} */
  const rows = [];

  /** @param {string} directory @param {string} prefix */
  const scan = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude(relative)) continue;

      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        rows.push({ path: relative, type: 'symlink', target: fs.readlinkSync(absolute) });
      } else if (stat.isDirectory()) {
        rows.push({ path: relative, type: 'directory' });
        scan(absolute, relative);
      } else if (stat.isFile()) {
        rows.push({ path: relative, type: 'file', bytes: fs.readFileSync(absolute) });
      } else {
        assert.fail(`unsupported filesystem entry in snapshot: ${relative}`);
      }
    }
  };

  if (fs.existsSync(root)) scan(root, '');
  return rows;
}

/** @param {string} relative */
function isGitPath(relative) {
  return relative === '.git' || relative.startsWith('.git/');
}

/** @param {string} relative */
function isNodeModulesPath(relative) {
  return relative.split('/').includes('node_modules');
}

/**
 * Copy the whole working tree except VCS internals. The destination is always
 * under the OS temporary directory and is removed in the enclosing finally.
 * @param {string} destination
 */
function copyTemporaryWorkspace(destination) {
  fs.cpSync(REPOSITORY_ROOT, destination, {
    recursive: true,
    filter(source) {
      const relative = path.relative(REPOSITORY_ROOT, source).split(path.sep).join('/');
      return !isGitPath(relative);
    },
  });
}

/**
 * Remove copied dogfood output, installed packs, and its install profile while
 * retaining the copied canonical source, catalog, documentation, and metadata.
 * @param {string} root
 */
function resetTemporaryGeneratedBundle(root) {
  for (const relative of [
    '.github/agents',
    '.github/instructions',
    '.github/prompts',
    '.github/agents-sdk',
    '.github/config',
    '.claude',
    'dist',
    '.dude/metadata/profile.md',
  ]) {
    fs.rmSync(at(root, relative), { recursive: true, force: true });
  }

  // Keep project-owned skills/workflows if present; only discard generated core,
  // local, and installed pack skill entries from the temporary copy.
  const skills = at(root, '.github/skills');
  if (fs.existsSync(skills)) {
    for (const entry of fs.readdirSync(skills)) {
      if (entry.startsWith('dude-')) {
        fs.rmSync(path.join(skills, entry), { recursive: true, force: true });
      }
    }
  }
}

/**
 * Import code from the disposable copy, never from this real workspace.
 * @param {string} root
 * @param {string} relative
 */
async function importTemporaryModule(root, relative) {
  const absolute = at(root, relative);
  const key = sha256(fs.readFileSync(absolute));
  return import(`${pathToFileURL(absolute).href}?model-mapping-falsifier=${key}`);
}

/**
 * @param {string} root
 * @param {string} sourceDirectory
 * @param {unknown} config
 * @param {{ parseAgentSource: Function, copilotAgentPath: Function }} projection
 */
function readAgentRecords(root, sourceDirectory, config, projection) {
  const directory = at(root, sourceDirectory);
  assert.equal(fs.statSync(directory).isDirectory(), true, `${sourceDirectory} must be a directory`);
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(AGENT_SUFFIX))
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.ok(entries.length > 0, `${sourceDirectory} must contain agent sources`);

  return entries.map((entry) => {
    const stem = entry.name.slice(0, -AGENT_SUFFIX.length);
    const source = `${sourceDirectory}/${entry.name}`;
    const record = projection.parseAgentSource(fs.readFileSync(at(root, source)), { stem, config });
    const modelClass = record.frontmatter['model-class'];
    assert.equal(typeof modelClass, 'string', `${source} must declare a model class`);
    return {
      stem,
      source,
      modelClass,
      record,
      generated: projection.copilotAgentPath(stem),
    };
  });
}

/** @param {string} root @param {string[]} relatives */
function snapshotFiles(root, relatives) {
  const unique = [...new Set(relatives)].sort();
  assert.equal(unique.length, relatives.length, 'profile paths must be unique');
  return new Map(unique.map((relative) => [relative, fs.readFileSync(at(root, relative))]));
}

/** @param {string} root */
function generatedProfilePaths(root) {
  const agents = at(root, '.github/agents');
  /** @type {string[]} */
  const paths = [];
  /** @param {string} directory @param {string} prefix */
  const scan = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(absolute, relative);
      else if (entry.isFile() && entry.name.endsWith(AGENT_SUFFIX)) {
        paths.push(`.github/agents/${relative}`);
      }
    }
  };
  scan(agents, '');
  return paths.sort();
}

/**
 * @param {string} root
 * @param {Array<{ generated: string }>} records
 * @param {string} label
 */
function assertGeneratedProfilesExactly(root, records, label) {
  assert.deepEqual(
    generatedProfilePaths(root),
    records.map((record) => record.generated).sort(),
    `${label} generated profile paths`,
  );
}

/**
 * @param {string} outputRoot
 * @param {Array<{ generated: string, record: unknown }>} records
 * @param {unknown} config
 * @param {{ renderCopilotAgent: Function }} projection
 * @param {string} label
 */
function assertProjectionEquivalent(outputRoot, records, config, projection, label) {
  for (const record of records) {
    const expected = projection.renderCopilotAgent(record.record, config);
    assertExactBytes(
      fs.readFileSync(at(outputRoot, record.generated)),
      expected,
      `${label} ${record.generated}`,
    );
  }
}

/**
 * @param {{
 *   outputRoot: string,
 *   baseline: Map<string, Buffer>,
 *   records: Array<{ generated: string, modelClass: string }>,
 *   modelClass: string,
 *   label: string,
 * }} options
 */
function assertOnlyClassProfilesChanged({
  outputRoot,
  baseline,
  records,
  modelClass,
  label,
}) {
  const applicable = records.filter((record) => record.modelClass === modelClass);
  const nonApplicable = records.filter((record) => record.modelClass !== modelClass);
  assert.ok(applicable.length > 0, `${label} needs an applicable profile`);
  assert.ok(nonApplicable.length > 0, `${label} needs a non-applicable profile`);
  assert.deepEqual(
    [...baseline.keys()].sort(),
    records.map((record) => record.generated).sort(),
    `${label} baseline coverage`,
  );

  for (const record of applicable) {
    const before = baseline.get(record.generated);
    assert.ok(before, `${label} baseline is missing ${record.generated}`);
    const after = fs.readFileSync(at(outputRoot, record.generated));
    assert.equal(after.equals(before), false, `${label} applicable ${record.generated} did not change`);
  }
  for (const record of nonApplicable) {
    const before = baseline.get(record.generated);
    assert.ok(before, `${label} baseline is missing ${record.generated}`);
    assertExactBytes(
      fs.readFileSync(at(outputRoot, record.generated)),
      before,
      `${label} non-applicable ${record.generated}`,
    );
  }
  return { applicable, nonApplicable };
}

/**
 * @param {unknown} document
 * @param {Array<{ modelClass: string }>} coreRecords
 * @param {Array<{ modelClass: string }>} packRecords
 */
function chooseSharedConcreteClass(document, coreRecords, packRecords) {
  const models = /** @type {any} */ (document)?.targets?.copilot?.models;
  assert.ok(models && typeof models === 'object' && !Array.isArray(models), 'canonical model map must be an object');

  const candidates = Object.entries(models)
    .filter(([, model]) => typeof model === 'string' && model.trim())
    .map(([modelClass, model]) => {
      const coreApplicable = coreRecords.filter((record) => record.modelClass === modelClass);
      const packApplicable = packRecords.filter((record) => record.modelClass === modelClass);
      return {
        modelClass,
        model,
        coreApplicable,
        coreNonApplicable: coreRecords.filter((record) => record.modelClass !== modelClass),
        packApplicable,
        packNonApplicable: packRecords.filter((record) => record.modelClass !== modelClass),
      };
    })
    .filter((candidate) => (
      candidate.coreApplicable.length > 0
      && candidate.coreNonApplicable.length > 0
      && candidate.packApplicable.length > 0
      && candidate.packNonApplicable.length > 0
    ))
    .sort((left, right) => left.modelClass.localeCompare(right.modelClass));

  assert.ok(
    candidates.length > 0,
    `${REPRESENTATIVE_PACK} must provide a concrete class with applicable and non-applicable core and pack profiles`,
  );
  return candidates[0];
}

/** @param {unknown} document */
function concreteModelIdentifiers(document) {
  const models = /** @type {any} */ (document)?.targets?.copilot?.models;
  assert.ok(models && typeof models === 'object' && !Array.isArray(models), 'canonical model map must be an object');
  const identifiers = [...new Set(
    Object.values(models).filter((model) => typeof model === 'string' && model.trim()),
  )].sort();
  assert.ok(identifiers.length > 0, 'canonical config must contain concrete model identifiers');
  return identifiers;
}

/** @param {string} original @param {string[]} identifiers */
function deriveDistinctReplacement(original, identifiers) {
  const used = new Set(identifiers);
  let replacement = `${original}-falsifier`;
  while (used.has(replacement)) replacement = `${replacement}-next`;
  assert.notEqual(replacement, original, 'derived replacement must differ from the current identifier');
  return replacement;
}

/**
 * Modify exactly one JSON value token selected from the parsed canonical map,
 * preserving every other copied configuration byte.
 * @param {{
 *   configPath: string,
 *   beforeDocument: any,
 *   modelClass: string,
 *   originalModel: string,
 *   replacement: string,
 * }} options
 */
function replaceOneCanonicalModel({
  configPath,
  beforeDocument,
  modelClass,
  originalModel,
  replacement,
}) {
  const before = fs.readFileSync(configPath, 'utf8');
  const valueToken = escapeRegExp(JSON.stringify(originalModel));
  const mapping = new RegExp(
    `("${escapeRegExp(modelClass)}"\\s*:\\s*)${valueToken}(?=\\s*[,}])`,
    'g',
  );
  const matches = [...before.matchAll(mapping)];
  assert.equal(matches.length, 1, `canonical ${modelClass} mapping must occur exactly once`);

  const after = before.replace(mapping, (_match, prefix) => `${prefix}${JSON.stringify(replacement)}`);
  fs.writeFileSync(configPath, after, 'utf8');

  const expected = structuredClone(beforeDocument);
  expected.targets.copilot.models[modelClass] = replacement;
  assert.deepEqual(JSON.parse(after), expected, 'only the selected canonical mapping changed structurally');
  return Buffer.from(after);
}

/** @param {string} root @param {string} outputRoot @param {string} label */
function assertPackagedConfigMatches(root, outputRoot, label) {
  assertExactBytes(
    fs.readFileSync(at(outputRoot, PACKAGED_CONFIG)),
    fs.readFileSync(at(root, CANONICAL_CONFIG)),
    `${label} packaged model config`,
  );
}

/** @param {string} root @param {string} label */
function assertNoModelClassInGeneratedProfiles(root, label) {
  const profiles = generatedProfilePaths(root);
  assert.ok(profiles.length > 0, `${label} must contain generated profiles`);
  for (const profile of profiles) {
    assert.doesNotMatch(
      fs.readFileSync(at(root, profile), 'utf8'),
      /^model-class\s*:/m,
      `${label} ${profile} must not expose source-only model-class`,
    );
  }
}

/** @param {string} root @param {string} label */
function assertDroppedTargetsAbsent(root, label) {
  for (const relative of DROPPED_TARGETS) {
    assert.equal(fs.existsSync(at(root, relative)), false, `${label} retained dropped target ${relative}`);
  }
}

/**
 * Invoke the compose entry point generated into the temporary development
 * bundle, rather than importing the source compose module.
 * @param {string} root
 * @param {'add' | 'remove' | 'status'} command
 * @param {string} [pack]
 */
function runGeneratedCompose(root, command, pack) {
  const compose = at(root, '.github/skills/dude-compose/compose.mjs');
  assert.equal(fs.statSync(compose).isFile(), true, 'generated compose entry point is missing');
  const args = [
    compose,
    command,
    ...(pack ? [pack] : []),
    '--root',
    root,
    '--library',
    at(root, 'library/packs'),
    '--no-fetch',
    '--json',
  ];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined, `generated compose ${command} failed to spawn: ${String(result.error)}`);
  assert.equal(
    result.status,
    0,
    `generated compose ${command} failed:\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`,
  );
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    assert.fail(`generated compose ${command} did not return JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout || ''}`);
  }
  assert.equal(payload.ok, true, `generated compose ${command} reported failure`);
  return payload;
}

/**
 * Enumerate only independently authored files. Generated `.github`, workflow
 * history under `.dude`, dependency installations, release output, and the one
 * canonical config authority are deliberately outside this test-local scan.
 * @param {string} root
 */
function authoredFilesForAuthorityScan(root) {
  /** @type {string[]} */
  const files = [];

  /** @param {string} absolute @param {string} relative */
  const scan = (absolute, relative) => {
    if (relative === CANONICAL_CONFIG || isNodeModulesPath(relative)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      assert.fail(`authority scan refuses symlinked authored path: ${relative}`);
    } else if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        scan(path.join(absolute, entry.name), `${relative}/${entry.name}`);
      }
    } else if (stat.isFile() && TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      files.push(relative);
    } else if (!stat.isFile()) {
      assert.fail(`authority scan found unsupported authored path: ${relative}`);
    }
  };

  for (const relative of AUTHORED_SCAN_ROOTS) {
    const absolute = at(root, relative);
    if (fs.existsSync(absolute)) scan(absolute, relative);
  }
  files.sort();
  assert.ok(files.length > 0, 'authority scan needs authored inputs');
  assert.ok(files.every((relative) => (
    !relative.startsWith('.github/')
    && !relative.startsWith('.dude/')
    && relative !== CANONICAL_CONFIG
  )), 'authority scan must exclude generated and workflow/history paths');
  return files;
}

/**
 * Search only concrete identifiers extracted from the model map. In particular,
 * class effort labels are never included in this authority check.
 * @param {string} root
 * @param {string[]} identifiers
 */
function scanConcreteModelAuthority(root, identifiers) {
  const files = authoredFilesForAuthorityScan(root);
  /** @type {Array<{ path: string, identifier: string }>} */
  const findings = [];
  for (const relative of files) {
    const content = fs.readFileSync(at(root, relative), 'utf8');
    for (const identifier of identifiers) {
      if (content.includes(identifier)) findings.push({ path: relative, identifier });
    }
  }
  return { files, findings };
}

test('authority scan ignores dependency symlinks but rejects authored symlinks', () => {
  // Arrange: a scoped dependency installation and an authored source subtree.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-authority-scan-'));
  try {
    fs.mkdirSync(at(root, 'scripts/dude-canvas-ui/node_modules/.bin'), { recursive: true });
    fs.symlinkSync(
      '../esbuild/bin/esbuild',
      at(root, 'scripts/dude-canvas-ui/node_modules/.bin/esbuild'),
    );
    fs.mkdirSync(at(root, 'src'), { recursive: true });
    fs.writeFileSync(at(root, 'src/authored.mjs'), 'export {};\n', 'utf8');

    // Act / Assert: the dependency tree is not an authored scan input.
    assert.deepEqual(authoredFilesForAuthorityScan(root), ['src/authored.mjs']);

    // Act / Assert: a similarly named authored subtree remains fail-closed.
    fs.mkdirSync(at(root, 'src/node_modules-not-a-dependency'), { recursive: true });
    fs.symlinkSync(
      '../authored.mjs',
      at(root, 'src/node_modules-not-a-dependency/authored-link.mjs'),
    );
    assert.throws(
      () => authoredFilesForAuthorityScan(root),
      /authority scan refuses symlinked authored path: src\/node_modules-not-a-dependency\/authored-link\.mjs/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Snapshot canonical inputs other than the intentionally edited mapping. Build,
 * release, and compose may change only excluded generated/profile surfaces.
 * @param {string} root
 */
function snapshotUnchangedCanonicalInputs(root) {
  return snapshotTree(root, {
    exclude(relative) {
      return (
        isGitPath(relative)
        || relative === '.github'
        || relative.startsWith('.github/')
        || relative === '.dude'
        || relative.startsWith('.dude/')
        || relative === 'dist'
        || relative.startsWith('dist/')
        || relative === CANONICAL_CONFIG
      );
    },
  });
}

test('model mapping changes regenerate only matching profiles in a disposable topology', { timeout: 120_000 }, async (t) => {
  // Arrange: capture every real working-tree byte before creating a temp copy.
  const realWorkspaceBefore = snapshotTree(REPOSITORY_ROOT, {
    exclude: isGitPath,
  });
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-model-mapping-falsifier-'));
  const workspace = path.join(temporaryParent, 'workspace');

  try {
    copyTemporaryWorkspace(workspace);
    resetTemporaryGeneratedBundle(workspace);
    assert.equal(fs.existsSync(at(workspace, CANONICAL_CONFIG)), true, 'copied canonical config is missing');
    assert.equal(
      fs.existsSync(at(workspace, `library/packs/${REPRESENTATIVE_PACK}/pack.md`)),
      true,
      'copied representative pack is missing',
    );

    // Act: use actual build functions copied with the source workspace.
    const { buildDev } = await importTemporaryModule(workspace, 'scripts/build-dev.mjs');
    const { buildRelease } = await importTemporaryModule(workspace, 'scripts/build-release.mjs');
    const sourceMap = await importTemporaryModule(
      workspace,
      'src/skills/dude-engine/lib/agent-model-map.mjs',
    );
    const sourceProjection = await importTemporaryModule(
      workspace,
      'src/skills/dude-engine/lib/agent-projection.mjs',
    );
    const release = at(workspace, 'dist');

    // Baseline development and release output precede the pack install.
    buildDev({ repoRoot: workspace });
    buildRelease({ repoRoot: workspace, outDir: release, ref: 'v0.0.0-falsifier' });
    assert.equal(fs.statSync(at(workspace, '.github/skills/dude-compose/compose.mjs')).isFile(), true);
    assert.equal(fs.statSync(at(release, '.github/skills/dude-compose/compose.mjs')).isFile(), true);
    assertPackagedConfigMatches(workspace, workspace, 'baseline development');
    assertPackagedConfigMatches(workspace, release, 'baseline release');

    // Install through the generated development compose path before config changes.
    const baselineAdd = runGeneratedCompose(workspace, 'add', REPRESENTATIVE_PACK);
    assert.equal(baselineAdd.added, REPRESENTATIVE_PACK, 'baseline pack install did not add coding');
    assert.equal(baselineAdd.alreadyInstalled, undefined, 'baseline pack install was not clean');

    const canonicalBeforeBytes = fs.readFileSync(at(workspace, CANONICAL_CONFIG));
    const canonicalBeforeDocument = JSON.parse(canonicalBeforeBytes.toString('utf8'));
    const baselineConfig = sourceMap.loadAgentModelConfig(at(workspace, CANONICAL_CONFIG));
    const coreBefore = readAgentRecords(workspace, 'src/agents', baselineConfig, sourceProjection);
    const packBefore = readAgentRecords(
      workspace,
      `library/packs/${REPRESENTATIVE_PACK}/agents`,
      baselineConfig,
      sourceProjection,
    );
    assertGeneratedProfilesExactly(workspace, [...coreBefore, ...packBefore], 'baseline development');
    assertGeneratedProfilesExactly(release, coreBefore, 'baseline release');
    assertProjectionEquivalent(workspace, coreBefore, baselineConfig, sourceProjection, 'baseline development');
    assertProjectionEquivalent(release, coreBefore, baselineConfig, sourceProjection, 'baseline release');
    assertProjectionEquivalent(workspace, packBefore, baselineConfig, sourceProjection, 'baseline pack');

    const baselineConcreteIds = concreteModelIdentifiers(canonicalBeforeDocument);
    const selection = chooseSharedConcreteClass(canonicalBeforeDocument, coreBefore, packBefore);
    const originalModel = /** @type {string} */ (selection.model);
    const replacement = deriveDistinctReplacement(
      originalModel,
      baselineConcreteIds,
    );
    const coreBaselineProfiles = snapshotFiles(workspace, coreBefore.map((record) => record.generated));
    const releaseBaselineProfiles = snapshotFiles(release, coreBefore.map((record) => record.generated));
    const oldPackProfiles = snapshotFiles(workspace, packBefore.map((record) => record.generated));
    const unchangedCanonicalInputs = snapshotUnchangedCanonicalInputs(workspace);

    // Act: edit exactly the one structurally selected canonical mapping value.
    const canonicalAfterBytes = replaceOneCanonicalModel({
      configPath: at(workspace, CANONICAL_CONFIG),
      beforeDocument: canonicalBeforeDocument,
      modelClass: selection.modelClass,
      originalModel,
      replacement,
    });
    assert.equal(canonicalAfterBytes.equals(canonicalBeforeBytes), false, 'canonical mapping edit had no byte effect');

    // Rebuild both products from the edited canonical configuration.
    buildDev({ repoRoot: workspace });
    buildRelease({ repoRoot: workspace, outDir: release, ref: 'v0.0.0-falsifier' });
    const changedConfig = sourceMap.loadAgentModelConfig(at(workspace, CANONICAL_CONFIG));
    const coreAfter = readAgentRecords(workspace, 'src/agents', changedConfig, sourceProjection);
    const packAfter = readAgentRecords(
      workspace,
      `library/packs/${REPRESENTATIVE_PACK}/agents`,
      changedConfig,
      sourceProjection,
    );

    // Assert: dev/release each change precisely the selected base class and match
    // the current renderer; both package exact current canonical config bytes.
    assertGeneratedProfilesExactly(workspace, [...coreAfter, ...packAfter], 'changed development');
    assertGeneratedProfilesExactly(release, coreAfter, 'changed release');
    const coreDiff = assertOnlyClassProfilesChanged({
      outputRoot: workspace,
      baseline: coreBaselineProfiles,
      records: coreAfter,
      modelClass: selection.modelClass,
      label: 'development',
    });
    const releaseDiff = assertOnlyClassProfilesChanged({
      outputRoot: release,
      baseline: releaseBaselineProfiles,
      records: coreAfter,
      modelClass: selection.modelClass,
      label: 'release',
    });
    assert.equal(coreDiff.applicable.length, releaseDiff.applicable.length, 'dev/release applicable counts differ');
    assertProjectionEquivalent(workspace, coreAfter, changedConfig, sourceProjection, 'changed development');
    assertProjectionEquivalent(release, coreAfter, changedConfig, sourceProjection, 'changed release');
    assertPackagedConfigMatches(workspace, workspace, 'changed development');
    assertPackagedConfigMatches(workspace, release, 'changed release');

    // A base rebuild must not silently refresh an installed pack. It still carries
    // its exact old rendered bytes until the lifecycle remove/add below.
    for (const [relative, bytes] of oldPackProfiles) {
      assertExactBytes(
        fs.readFileSync(at(workspace, relative)),
        bytes,
        `installed pack remained old after mapping change: ${relative}`,
      );
    }
    assertProjectionEquivalent(workspace, packBefore, baselineConfig, sourceProjection, 'still-old installed pack');

    // Act / Assert: remove succeeds despite the mapping change, then re-add through
    // the regenerated compose entry point and render the current mapped profiles.
    const removal = runGeneratedCompose(workspace, 'remove', REPRESENTATIVE_PACK);
    assert.equal(removal.removed, REPRESENTATIVE_PACK, 'mapping change blocked pack removal');
    for (const record of packAfter) {
      assert.equal(fs.existsSync(at(workspace, record.generated)), false, `removed pack profile remains: ${record.generated}`);
    }
    const afterRemoval = runGeneratedCompose(workspace, 'status');
    assert.deepEqual(afterRemoval.enabled_packs, [], 'removed pack remains enabled');

    const readded = runGeneratedCompose(workspace, 'add', REPRESENTATIVE_PACK);
    assert.equal(readded.added, REPRESENTATIVE_PACK, 'reinstall did not add the representative pack');
    assert.equal(readded.alreadyInstalled, undefined, 'reinstall did not perform a fresh projection');
    assertGeneratedProfilesExactly(workspace, [...coreAfter, ...packAfter], 'reinstalled development');
    assertProjectionEquivalent(workspace, packAfter, changedConfig, sourceProjection, 'reinstalled pack');
    for (const record of packAfter.filter((candidate) => candidate.modelClass === selection.modelClass)) {
      assert.ok(
        fs.readFileSync(at(workspace, record.generated), 'utf8').includes(`model: ${replacement}\n`),
        `reinstalled applicable pack profile lacks the replacement: ${record.generated}`,
      );
    }
    for (const record of packAfter.filter((candidate) => candidate.modelClass !== selection.modelClass)) {
      const before = oldPackProfiles.get(record.generated);
      assert.ok(before, `baseline pack profile missing: ${record.generated}`);
      assertExactBytes(
        fs.readFileSync(at(workspace, record.generated)),
        before,
        `reinstalled non-applicable pack profile ${record.generated}`,
      );
    }

    // Rebuilding an unchanged edited workspace is byte-stable for both products.
    const developmentBeforeStabilityRebuild = snapshotTree(at(workspace, '.github'));
    const releaseBeforeStabilityRebuild = snapshotTree(release);
    buildDev({ repoRoot: workspace });
    buildRelease({ repoRoot: workspace, outDir: release, ref: 'v0.0.0-falsifier' });
    assert.deepEqual(
      snapshotTree(at(workspace, '.github')),
      developmentBeforeStabilityRebuild,
      'second development build changed generated bytes or topology',
    );
    assert.deepEqual(
      snapshotTree(release),
      releaseBeforeStabilityRebuild,
      'second release build changed generated bytes or topology',
    );
    assertPackagedConfigMatches(workspace, workspace, 'stable development');
    assertPackagedConfigMatches(workspace, release, 'stable release');
    assert.deepEqual(
      snapshotUnchangedCanonicalInputs(workspace),
      unchangedCanonicalInputs,
      'the canonical source/catalog/docs changed outside the selected config mapping',
    );

    // Generated profiles keep no source-only class key, and neither output
    // topology recreates a dropped target family.
    assertNoModelClassInGeneratedProfiles(workspace, 'development');
    assertNoModelClassInGeneratedProfiles(release, 'release');
    assertDroppedTargetsAbsent(workspace, 'development');
    assertDroppedTargetsAbsent(release, 'release');

    // Extract only concrete IDs from both canonical documents; effort vocabulary
    // is intentionally not part of this literal-authority scan.
    const modifiedConcreteIds = concreteModelIdentifiers(JSON.parse(
      fs.readFileSync(at(workspace, CANONICAL_CONFIG), 'utf8'),
    ));
    const authorityIdentifiers = [...new Set([
      ...baselineConcreteIds,
      ...modifiedConcreteIds,
    ])].sort();
    assert.ok(
      authorityIdentifiers.includes(originalModel),
      'authority identifier set omits the displaced baseline model',
    );
    assert.ok(
      authorityIdentifiers.includes(replacement),
      'authority identifier set omits the derived replacement model',
    );
    const authorityBeforeInjection = scanConcreteModelAuthority(workspace, authorityIdentifiers);
    assert.deepEqual(
      authorityBeforeInjection.findings,
      [],
      'concrete model IDs escaped the canonical config into authored inputs',
    );

    // Focused falsifying mutation: an unrelated authored source must be named.
    const injectedRelative = 'src/model-mapping-authority-injection.mjs';
    assert.equal(fs.existsSync(at(workspace, injectedRelative)), false, 'authority injection path already exists');
    fs.writeFileSync(
      at(workspace, injectedRelative),
      `export default ${JSON.stringify(replacement)};\n`,
      'utf8',
    );
    const authorityAfterInjection = scanConcreteModelAuthority(workspace, authorityIdentifiers);
    assert.deepEqual(
      authorityAfterInjection.findings.filter((finding) => (
        finding.path === injectedRelative && finding.identifier === replacement
      )),
      [{ path: injectedRelative, identifier: replacement }],
      'authority scan did not fail at the injected authored source',
    );

    // Existing HTML source is independently authored too: the displaced
    // baseline ID must be rejected there as well.
    const nonJavaScriptProbe = 'src/skills/dude-lightweight-execution/backlog-template.html';
    assert.equal(
      fs.statSync(at(workspace, nonJavaScriptProbe)).isFile(),
      true,
      'non-JavaScript authority probe is missing',
    );
    fs.appendFileSync(
      at(workspace, nonJavaScriptProbe),
      `\n<!-- ${originalModel} -->\n`,
      'utf8',
    );
    const authorityAfterBaselineInjection = scanConcreteModelAuthority(workspace, authorityIdentifiers);
    assert.ok(
      authorityAfterBaselineInjection.files.includes(nonJavaScriptProbe),
      'authority scan omitted the non-JavaScript probe',
    );
    assert.deepEqual(
      authorityAfterBaselineInjection.findings.filter((finding) => (
        finding.path === nonJavaScriptProbe
      )),
      [{ path: nonJavaScriptProbe, identifier: originalModel }],
      'authority scan did not fail at the displaced baseline model in HTML',
    );

    t.diagnostic(
      `temporary workspace: ${coreAfter.length} core profiles `
      + `(${coreDiff.applicable.length} mapped, ${coreDiff.nonApplicable.length} unchanged); `
      + `${packAfter.length} ${REPRESENTATIVE_PACK} profiles `
      + `(${selection.packApplicable.length} mapped, ${selection.packNonApplicable.length} unchanged); `
      + `${authorityBeforeInjection.files.length} authored files scanned; `
      + `${realWorkspaceBefore.length} real-workspace entries snapshotted`,
    );
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
    assert.deepEqual(
      snapshotTree(REPOSITORY_ROOT, { exclude: isGitPath }),
      realWorkspaceBefore,
      'real workspace changed while the falsifier ran',
    );
  }
});

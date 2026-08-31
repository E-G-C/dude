// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as modelMap from './agent-model-map.mjs';

const CONFIG_PATH = fileURLToPath(new URL('../../../config/agent-models.json', import.meta.url));
const MODULE_PATH = fileURLToPath(new URL('./agent-model-map.mjs', import.meta.url));
const CANONICAL_DOCUMENT = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

/** @returns {Record<string, any>} */
function cloneCanonicalDocument() {
  return JSON.parse(JSON.stringify(CANONICAL_DOCUMENT));
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @template T @param {(directory: string) => Promise<T>} action */
async function withTemporaryDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), 'dude-agent-model-map-'));
  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** @param {string} directory @param {string} name @param {unknown} document */
async function writeConfigFixture(directory, name, document) {
  const absolutePath = join(directory, name);
  const bytes = typeof document === 'string' ? document : JSON.stringify(document, null, 2);
  await writeFile(absolutePath, bytes, 'utf8');
  return absolutePath;
}

/**
 * @param {(document: Record<string, any>) => void} mutate
 * @param {RegExp} expected
 */
async function assertInvalidConfig(mutate, expected) {
  await withTemporaryDirectory(async (directory) => {
    const document = cloneCanonicalDocument();
    mutate(document);
    const absolutePath = await writeConfigFixture(directory, 'invalid.json', document);
    assert.throws(() => modelMap.loadAgentModelConfig(absolutePath), expected);
  });
}

test('exports only the explicit loader and Copilot resolver', () => {
  // Arrange
  const expected = ['loadAgentModelConfig', 'resolveCopilotModel'];

  // Act / Assert
  assert.deepEqual(Object.keys(modelMap).sort(), expected);
  assert.equal(modelMap.loadAgentModelConfig.length, 1);
  assert.equal(modelMap.resolveCopilotModel.length, 2);
});

test('loads the shipped document with its exact schema, dated provenance, and closed effort vocabulary', () => {
  // Arrange
  const config = modelMap.loadAgentModelConfig(CONFIG_PATH);

  // Act
  const rootKeys = Object.keys(config).sort();
  const classKeys = Object.keys(/** @type {Record<string, unknown>} */ (config.classes)).sort();
  const targetKeys = Object.keys(/** @type {Record<string, unknown>} */ (config.targets)).sort();
  const copilot = /** @type {Record<string, any>} */ (config.targets).copilot;
  const efforts = Object.values(/** @type {Record<string, any>} */ (config.classes))
    .filter((settings) => Object.hasOwn(settings, 'effort'))
    .map((settings) => settings.effort)
    .sort();

  // Assert
  assert.deepEqual(rootKeys, ['classes', 'provenance', 'targets']);
  assert.deepEqual(classKeys, ['balanced', 'coding', 'fast', 'inherit', 'reasoning', 'visual']);
  assert.deepEqual(targetKeys, ['copilot']);
  assert.deepEqual(Object.keys(copilot).sort(), ['emits', 'models']);
  assert.deepEqual(copilot.emits, ['model']);
  assert.deepEqual(Object.keys(copilot.models).sort(), classKeys);
  assert.deepEqual(efforts, ['max', 'max', 'max', 'medium', 'medium']);
  assert.deepEqual(/** @type {Record<string, any>} */ (config.classes).inherit, {});
  assert.match(/** @type {string} */ (config.provenance), /\b\d{4}-\d{2}-\d{2}\b/);
});

test('rejects a missing, relative, unreadable, or malformed supplied configuration path', async () => {
  // Arrange
  await withTemporaryDirectory(async (directory) => {
    const malformedPath = await writeConfigFixture(directory, 'malformed.json', '{"classes":');
    const missingPath = join(directory, 'missing.json');

    // Act / Assert
    assert.throws(() => modelMap.loadAgentModelConfig(), /path must be an absolute path/);
    assert.throws(() => modelMap.loadAgentModelConfig('agent-models.json'), /path must be an absolute path/);
    assert.throws(
      () => modelMap.loadAgentModelConfig(directory),
      new RegExp(`cannot read agent model configuration '${escapeRegExp(directory)}'`),
    );
    assert.throws(
      () => modelMap.loadAgentModelConfig(missingPath),
      new RegExp(`cannot read agent model configuration '${escapeRegExp(missingPath)}'`),
    );
    assert.throws(
      () => modelMap.loadAgentModelConfig(malformedPath),
      new RegExp(`'${escapeRegExp(malformedPath)}' has malformed JSON`),
    );
  });
});

test('names unknown root, class, target, and target-setting fields', async () => {
  // Arrange / Act / Assert
  await assertInvalidConfig((document) => {
    document.unexpected = true;
  }, /document has unknown field 'unexpected'/);
  await assertInvalidConfig((document) => {
    delete document.provenance;
  }, /document is missing required field 'provenance'/);
  await assertInvalidConfig((document) => {
    delete document.classes;
  }, /document is missing required field 'classes'/);
  await assertInvalidConfig((document) => {
    delete document.targets;
  }, /document is missing required field 'targets'/);
  await assertInvalidConfig((document) => {
    document.classes.fast.unexpected = 'value';
  }, /class 'fast' has unknown setting 'unexpected'/);
  await assertInvalidConfig((document) => {
    document.targets.unimplemented = {};
  }, /has unknown target 'unimplemented'/);
  await assertInvalidConfig((document) => {
    document.targets.copilot.unexpected = true;
  }, /target 'copilot' has unknown field 'unexpected'/);
});

test('requires exact target model coverage for the declared classes', async () => {
  // Arrange / Act / Assert
  await assertInvalidConfig((document) => {
    delete document.targets.copilot.models.fast;
  }, /target 'copilot' is missing a model mapping for class 'fast'/);
  await assertInvalidConfig((document) => {
    document.targets.copilot.models.unlisted = document.targets.copilot.models.fast;
  }, /target 'copilot' has a model mapping for unknown class 'unlisted'/);
  await assertInvalidConfig((document) => {
    delete document.classes.fast;
  }, /target 'copilot' has a model mapping for unknown class 'fast'/);

  await withTemporaryDirectory(async (directory) => {
    // Arrange
    const document = cloneCanonicalDocument();
    const derivedModel = `${document.targets.copilot.models.fast}-fixture`;
    document.classes.future = { effort: 'low' };
    document.targets.copilot.models.future = derivedModel;
    const absolutePath = await writeConfigFixture(directory, 'future-class.json', document);

    // Act
    const config = modelMap.loadAgentModelConfig(absolutePath);

    // Assert
    assert.deepEqual(modelMap.resolveCopilotModel(config, 'future'), { model: derivedModel });
  });
});

test('rejects empty values, undated provenance, invalid effort, and invalid inherit settings by name', async () => {
  // Arrange / Act / Assert
  await assertInvalidConfig((document) => {
    document.provenance = ' ';
  }, /setting 'provenance' must be a non-empty dated string/);
  await assertInvalidConfig((document) => {
    document.provenance = 'observed sometime';
  }, /setting 'provenance' must be a non-empty dated string/);
  await assertInvalidConfig((document) => {
    document.classes.fast.effort = '';
  }, /class 'fast' setting 'effort' must be one of low, medium, high, max/);
  await assertInvalidConfig((document) => {
    document.classes.fast.effort = 'outside-vocabulary';
  }, /class 'fast' setting 'effort' must be one of low, medium, high, max/);
  await assertInvalidConfig((document) => {
    document.classes.inherit.effort = 'low';
  }, /class 'inherit' must not declare setting 'effort'/);
  await assertInvalidConfig((document) => {
    document.classes = {};
  }, /classes must not be empty/);
  await assertInvalidConfig((document) => {
    document.targets.copilot.emits = [];
  }, /target 'copilot' setting 'emits' must be exactly \['model'\]/);
  await assertInvalidConfig((document) => {
    document.targets.copilot.models.fast = ' ';
  }, /target 'copilot' class 'fast' must map to a non-empty model string/);
  await assertInvalidConfig((document) => {
    document.targets.copilot.models.inherit = '';
  }, /target 'copilot' class 'inherit' must map to null/);
});

test('deep-freezes every nested configuration object and array', () => {
  // Arrange
  const config = modelMap.loadAgentModelConfig(CONFIG_PATH);
  const classes = /** @type {Record<string, any>} */ (config.classes);
  const targets = /** @type {Record<string, any>} */ (config.targets);
  const copilot = targets.copilot;
  const originalFastModel = copilot.models.fast;

  // Act / Assert
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(classes));
  assert.ok(Object.isFrozen(classes.fast));
  assert.ok(Object.isFrozen(targets));
  assert.ok(Object.isFrozen(copilot));
  assert.ok(Object.isFrozen(copilot.emits));
  assert.ok(Object.isFrozen(copilot.models));
  assert.throws(() => {
    classes.fast.effort = 'high';
  }, TypeError);
  assert.throws(() => {
    copilot.models.fast = 'changed';
  }, TypeError);
  assert.throws(() => {
    copilot.emits.push('effort');
  }, TypeError);
  assert.equal(classes.fast.effort, 'medium');
  assert.equal(copilot.models.fast, originalFastModel);
  assert.equal(copilot.emits.length, 1);
});

test('does not eagerly load, derive, search, fall back, or override an explicit configuration path', async () => {
  // Arrange
  await withTemporaryDirectory(async (directory) => {
    const copiedModule = join(directory, 'agent-model-map.mjs');
    await copyFile(MODULE_PATH, copiedModule);
    const bogusEnvironmentPath = join(directory, 'environment-does-not-exist.json');
    const explicitDocument = cloneCanonicalDocument();
    const environmentDocument = cloneCanonicalDocument();
    const baseModel = explicitDocument.targets.copilot.models.fast;
    explicitDocument.targets.copilot.models.fast = `${baseModel}-explicit`;
    environmentDocument.targets.copilot.models.fast = `${baseModel}-environment`;
    const defaultNamedPath = await writeConfigFixture(directory, 'agent-models.json', environmentDocument);
    const explicitPath = await writeConfigFixture(directory, 'caller-selected.json', explicitDocument);
    const environmentPath = await writeConfigFixture(directory, 'environment-selected.json', environmentDocument);
    const importResult = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(copiedModule).href)});`],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, DUDE_AGENT_MODEL_CONFIG: bogusEnvironmentPath },
      },
    );
    const previousEnvironmentValue = process.env.DUDE_AGENT_MODEL_CONFIG;

    try {
      // Act
      process.env.DUDE_AGENT_MODEL_CONFIG = environmentPath;
      const explicit = modelMap.loadAgentModelConfig(explicitPath);

      // Assert
      assert.equal(importResult.status, 0, importResult.stderr || importResult.stdout);
      assert.throws(() => modelMap.loadAgentModelConfig(), /path must be an absolute path/);
      assert.throws(() => modelMap.loadAgentModelConfig('agent-models.json'), /path must be an absolute path/);
      assert.throws(
        () => modelMap.loadAgentModelConfig(join(directory, 'not-present.json')),
        /cannot read agent model configuration/,
      );
      assert.notEqual(defaultNamedPath, explicitPath);
      assert.deepEqual(
        modelMap.resolveCopilotModel(explicit, 'fast'),
        { model: explicitDocument.targets.copilot.models.fast },
      );
      assert.notEqual(
        modelMap.resolveCopilotModel(explicit, 'fast').model,
        environmentDocument.targets.copilot.models.fast,
      );
    } finally {
      if (previousEnvironmentValue === undefined) delete process.env.DUDE_AGENT_MODEL_CONFIG;
      else process.env.DUDE_AGENT_MODEL_CONFIG = previousEnvironmentValue;
    }
  });
});

test('resolves every declared Copilot class from the supplied config and returns no effort', () => {
  // Arrange
  const config = modelMap.loadAgentModelConfig(CONFIG_PATH);
  const classes = Object.keys(/** @type {Record<string, unknown>} */ (config.classes));
  const models = /** @type {Record<string, any>} */ (
    /** @type {Record<string, any>} */ (config.targets).copilot
  ).models;

  // Act / Assert
  for (const modelClass of classes) {
    const actual = modelMap.resolveCopilotModel(config, modelClass);
    const expected = models[modelClass];
    assert.deepEqual(actual, expected === null ? {} : { model: expected }, modelClass);
    assert.equal(Object.hasOwn(actual, 'effort'), false, `${modelClass} has no emitted effort`);
  }
  assert.deepEqual(modelMap.resolveCopilotModel(config, 'inherit'), {});
  assert.throws(
    () => modelMap.resolveCopilotModel(config, 'unknown-class'),
    /unknown model class 'unknown-class'/,
  );
});

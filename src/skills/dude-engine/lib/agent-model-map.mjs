// @ts-check
/**
 * Load the caller-selected model configuration for generated Copilot profiles.
 * Concrete model values live only in the JSON document supplied by the caller.
 */

import fs from 'node:fs';
import path from 'node:path';

const STABLE_IDENTIFIER_RE = /^[a-z][a-z0-9-]*$/;
const EFFORT_VALUES = new Set(['low', 'medium', 'high']);
const EMITTED_SETTINGS = new Set(['model', 'effort']);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {string} message */
function invalid(message) {
  throw new Error(`agent model configuration ${message}`);
}

/** @param {string} value @returns {boolean} */
function hasDate(value) {
  for (const match of value.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day) {
      return true;
    }
  }
  return false;
}

/** @param {unknown} value @param {string} label */
function requireObject(value, label) {
  if (!isObject(value)) invalid(`${label} must be an object`);
}

/** @param {Record<string, unknown>} value @param {readonly string[]} fields @param {string} label */
function requireExactFields(value, fields, label) {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) invalid(`${label} has unknown field '${key}'`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) invalid(`${label} is missing required field '${field}'`);
  }
}

/** @param {Record<string, unknown>} classes */
function validateClasses(classes) {
  const names = Object.keys(classes);
  if (names.length === 0) invalid('classes must not be empty');
  if (!Object.hasOwn(classes, 'inherit')) invalid("classes is missing required class 'inherit'");

  for (const modelClass of names) {
    if (!STABLE_IDENTIFIER_RE.test(modelClass)) {
      invalid(`class '${modelClass}' must be a lower-case stable identifier`);
    }
    const settings = classes[modelClass];
    requireObject(settings, `class '${modelClass}'`);
    for (const setting of Object.keys(settings)) {
      if (setting !== 'effort') {
        invalid(`class '${modelClass}' has unknown setting '${setting}'`);
      }
    }

    if (modelClass === 'inherit') {
      if (Object.hasOwn(settings, 'effort')) {
        invalid("class 'inherit' must not declare setting 'effort'");
      }
      continue;
    }

    if (!Object.hasOwn(settings, 'effort')) {
      invalid(`class '${modelClass}' is missing required setting 'effort'`);
    }
    const effort = settings.effort;
    if (typeof effort !== 'string' || !EFFORT_VALUES.has(effort)) {
      invalid(`class '${modelClass}' setting 'effort' must be one of low, medium, high`);
    }
  }
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} classes */
function validateCopilotTarget(target, classes) {
  requireObject(target, "target 'copilot'");
  requireExactFields(target, ['emits', 'models'], "target 'copilot'");

  const emits = target.emits;
  if (!Array.isArray(emits)) invalid("target 'copilot' setting 'emits' must be a list");
  const seen = new Set();
  for (const setting of emits) {
    if (typeof setting !== 'string' || !EMITTED_SETTINGS.has(setting)) {
      invalid(`target 'copilot' has unsupported emitted setting '${String(setting)}'`);
    }
    if (seen.has(setting)) invalid(`target 'copilot' repeats emitted setting '${setting}'`);
    seen.add(setting);
  }
  if (emits.length !== 1 || emits[0] !== 'model') {
    invalid("target 'copilot' setting 'emits' must be exactly ['model']");
  }

  const models = target.models;
  requireObject(models, "target 'copilot' setting 'models'");
  const classesNames = Object.keys(classes);
  for (const modelClass of Object.keys(models)) {
    if (!Object.hasOwn(classes, modelClass)) {
      invalid(`target 'copilot' has a model mapping for unknown class '${modelClass}'`);
    }
  }
  for (const modelClass of classesNames) {
    if (!Object.hasOwn(models, modelClass)) {
      invalid(`target 'copilot' is missing a model mapping for class '${modelClass}'`);
    }
    const model = models[modelClass];
    if (modelClass === 'inherit') {
      if (model !== null) invalid("target 'copilot' class 'inherit' must map to null");
    } else if (typeof model !== 'string' || !model.trim()) {
      invalid(`target 'copilot' class '${modelClass}' must map to a non-empty model string`);
    }
  }
}

/** @param {unknown} config @returns {Record<string, unknown>} */
function validateAgentModelConfig(config) {
  requireObject(config, 'document');
  requireExactFields(config, ['provenance', 'classes', 'targets'], 'document');

  if (typeof config.provenance !== 'string' || !config.provenance.trim() || !hasDate(config.provenance)) {
    invalid("setting 'provenance' must be a non-empty dated string");
  }

  requireObject(config.classes, "setting 'classes'");
  validateClasses(config.classes);

  requireObject(config.targets, "setting 'targets'");
  const targetNames = Object.keys(config.targets);
  if (targetNames.length === 0) invalid("setting 'targets' must not be empty");
  for (const targetName of targetNames) {
    if (!STABLE_IDENTIFIER_RE.test(targetName)) {
      invalid(`target '${targetName}' must be a lower-case stable identifier`);
    }
    if (targetName !== 'copilot') invalid(`has unknown target '${targetName}'`);
  }
  if (!Object.hasOwn(config.targets, 'copilot')) invalid("is missing required target 'copilot'");
  validateCopilotTarget(config.targets.copilot, config.classes);

  return config;
}

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Read, validate, and deeply freeze one caller-selected configuration document.
 * @param {string} absolutePath
 * @returns {Readonly<Record<string, unknown>>}
 */
export function loadAgentModelConfig(absolutePath) {
  if (typeof absolutePath !== 'string' || !path.isAbsolute(absolutePath)) {
    throw new Error('agent model configuration path must be an absolute path');
  }

  let text;
  try {
    text = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(
      `cannot read agent model configuration '${absolutePath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `agent model configuration '${absolutePath}' has malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return deepFreeze(validateAgentModelConfig(parsed));
  } catch (error) {
    throw new Error(
      `agent model configuration '${absolutePath}' is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Resolve one logical class for the only implemented projection target.
 * @param {unknown} config
 * @param {string} modelClass
 * @returns {{ model?: string }}
 */
export function resolveCopilotModel(config, modelClass) {
  const validated = validateAgentModelConfig(config);
  if (typeof modelClass !== 'string' || !Object.hasOwn(validated.classes, modelClass)) {
    throw new Error(`unknown model class '${String(modelClass)}'`);
  }
  const models = /** @type {Record<string, unknown>} */ (
    /** @type {Record<string, unknown>} */ (validated.targets).copilot
  ).models;
  const model = /** @type {Record<string, unknown>} */ (models)[modelClass];
  return model === null ? {} : { model: /** @type {string} */ (model) };
}

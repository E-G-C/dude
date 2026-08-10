// @ts-check
/**
 * Parse authoritative agent sources and render one Copilot profile.
 * Model configuration is selected and passed by each caller.
 */

import { resolveCopilotModel } from './agent-model-map.mjs';

const SOURCE_KEYS = Object.freeze([
  'name', 'description', 'tools', 'agents', 'user-invocable', 'argument-hint', 'model-class',
]);
const STEM_RE = /^[a-z][a-z0-9-]*$/;
const COPILOT_TOOLS = new Set([
  'read', 'edit', 'search', 'execute', 'todo', 'agent', 'workiq/*', 'workiq2/*',
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} stem @returns {string} */
function assertStem(stem) {
  if (typeof stem !== 'string' || !STEM_RE.test(stem)) {
    throw new Error(`agent '${String(stem)}' has an invalid stem`);
  }
  return stem;
}

/** @param {string} stem @param {string} detail @returns {Error} */
function agentError(stem, detail) {
  return new Error(`agent '${stem}' ${detail}`);
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string} raw @param {string} key @returns {string} */
function parseString(raw, key) {
  const value = raw.trim();
  if (!value) throw new Error(`frontmatter ${key} must be a non-empty string`);
  if (value.startsWith(String.fromCharCode(34))) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string' || !parsed) throw new Error();
      return parsed;
    } catch {
      throw new Error(`frontmatter ${key} has a malformed quoted string`);
    }
  }
  if (value.startsWith(String.fromCharCode(39))) {
    let parsed = '';
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] !== String.fromCharCode(39)) {
        parsed += value[index];
      } else if (value[index + 1] === String.fromCharCode(39)) {
        parsed += String.fromCharCode(39);
        index += 1;
      } else if (index === value.length - 1) {
        if (!parsed) throw new Error(`frontmatter ${key} must be a non-empty string`);
        return parsed;
      } else {
        throw new Error(`frontmatter ${key} has a malformed quoted string`);
      }
    }
    throw new Error(`frontmatter ${key} has a malformed quoted string`);
  }
  if (/[\[\]{}]/.test(value)) throw new Error(`frontmatter ${key} must be a scalar string`);
  if (/^(?:~|null|true|false|yes|no|on|off)$/i.test(value)
    || /^[-+]?(?:(?:0|[1-9][0-9_]*)(?:\.[0-9_]*)?(?:e[-+]?[0-9_]+)?|\.[0-9_]+(?:e[-+]?[0-9_]+)?|0x[0-9a-f_]+|\.inf|\.nan)$/i.test(value)) {
    throw new Error(`frontmatter ${key} must be a string, not a YAML scalar`);
  }
  return value;
}

/** @param {string} raw @param {string} key @returns {string[]} */
function parseStringList(raw, key) {
  const text = raw.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) {
    throw new Error(`frontmatter ${key} must be a flow list of strings`);
  }
  const interior = text.slice(1, -1);
  if (!interior.trim()) return [];
  /** @type {string[]} */
  const values = [];
  let start = 0;
  let quote = '';
  for (let index = 0; index < interior.length; index += 1) {
    const character = interior[index];
    if (quote === String.fromCharCode(34)) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (quote === String.fromCharCode(39)) {
      if (character === quote && interior[index + 1] === quote) index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === String.fromCharCode(34) || character === String.fromCharCode(39)) {
      quote = character;
    } else if (character === '[' || character === ']' || character === '{' || character === '}') {
      throw new Error(`frontmatter ${key} must be a flat flow list of strings`);
    } else if (character === ',') {
      const item = interior.slice(start, index);
      if (!item.trim()) throw new Error(`frontmatter ${key} has an empty or trailing item`);
      values.push(parseString(item, key));
      start = index + 1;
    }
  }
  if (quote) throw new Error(`frontmatter ${key} has a malformed quoted string`);
  const item = interior.slice(start);
  if (!item.trim()) throw new Error(`frontmatter ${key} has an empty or trailing item`);
  values.push(parseString(item, key));
  if (new Set(values).size !== values.length) {
    throw new Error(`frontmatter ${key} has ambiguous or duplicate values`);
  }
  return values;
}

/** @param {string} raw @param {string} key @returns {boolean} */
function parseBoolean(raw, key) {
  if (raw.trim() === 'true') return true;
  if (raw.trim() === 'false') return false;
  throw new Error(`frontmatter ${key} must be true or false`);
}

/**
 * Parse one authoritative source record without changing its body.
 * @param {Buffer | string} bytes
 * @param {{ stem: string, config: unknown }} options
 * @returns {{ stem: string, frontmatter: Record<string, string | boolean | string[]>, body: string }}
 */
export function parseAgentSource(bytes, options) {
  const stem = assertStem(options?.stem);
  try {
    const source = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
    const opening = source.startsWith('---\r\n') ? '---\r\n' : source.startsWith('---\n') ? '---\n' : '';
    if (!opening) throw new Error('source frontmatter opening delimiter is missing or malformed');
    const lineEnding = opening.endsWith('\r\n') ? '\r\n' : '\n';
    let offset = opening.length;
    /** @type {string[]} */
    const lines = [];
    let body = '';
    let closed = false;
    while (offset <= source.length) {
      const newline = source.indexOf('\n', offset);
      const rawLine = source.slice(offset, newline === -1 ? source.length : newline);
      let line = rawLine;
      if (lineEnding === '\r\n') {
        if (newline !== -1 && !line.endsWith('\r')) throw new Error('frontmatter has mixed line endings');
        if (newline !== -1) line = line.slice(0, -1);
      }
      if (line.includes('\r')) throw new Error('frontmatter has a bare carriage return or mixed line endings');
      if (line === '---') {
        body = newline === -1 ? '' : source.slice(newline + 1);
        closed = true;
        break;
      }
      if (newline === -1) break;
      lines.push(line);
      offset = newline + 1;
    }
    if (!closed) throw new Error('source frontmatter closing delimiter is missing or malformed');
    /** @type {Record<string, string | boolean | string[]>} */
    const frontmatter = {};
    for (const line of lines) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const entry = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/.exec(line);
      if (!entry) throw new Error(`frontmatter line is not a canonical scalar: ${line}`);
      const key = entry[1];
      const value = entry[2];
      if (!SOURCE_KEYS.includes(key)) {
        if (key === 'model' || key === 'effort' || key === 'reasoningEffort') {
          throw new Error(`source must not declare concrete ${key}`);
        }
        throw new Error(`unsupported source frontmatter key ${key}`);
      }
      if (Object.hasOwn(frontmatter, key)) throw new Error(`duplicate source frontmatter key ${key}`);
      if (key === 'tools' || key === 'agents') frontmatter[key] = parseStringList(value, key);
      else if (key === 'user-invocable') frontmatter[key] = parseBoolean(value, key);
      else frontmatter[key] = parseString(value, key);
    }
    for (const key of ['name', 'description', 'tools', 'model-class']) {
      if (!Object.hasOwn(frontmatter, key)) throw new Error(`source is missing required ${key}`);
    }
    if (typeof frontmatter.name !== 'string' || typeof frontmatter.description !== 'string'
      || !Array.isArray(frontmatter.tools) || typeof frontmatter['model-class'] !== 'string') {
      throw new Error('source frontmatter has malformed required values');
    }
    for (const tool of frontmatter.tools) {
      if (!COPILOT_TOOLS.has(tool)) {
        throw new Error(`tool selector '${tool}' is unsupported for Copilot`);
      }
    }
    if (frontmatter.agents !== undefined && !Array.isArray(frontmatter.agents)) {
      throw new Error('frontmatter agents must be a flow list of strings');
    }
    if (frontmatter.agents?.length === 0) throw new Error('frontmatter agents must not be empty when declared');
    if (frontmatter['argument-hint'] !== undefined && typeof frontmatter['argument-hint'] !== 'string') {
      throw new Error('frontmatter argument-hint must be a string');
    }
    if (frontmatter['user-invocable'] !== undefined && typeof frontmatter['user-invocable'] !== 'boolean') {
      throw new Error('frontmatter user-invocable must be true or false');
    }
    resolveCopilotModel(options?.config, frontmatter['model-class']);
    return { stem, frontmatter, body };
  } catch (error) {
    throw agentError(stem, errorMessage(error));
  }
}

/**
 * Return the one generated profile path for a stable source stem.
 * @param {string} stem
 * @returns {string}
 */
export function copilotAgentPath(stem) {
  return `.github/agents/${assertStem(stem)}.agent.md`;
}

/** @param {string[]} values @returns {string} */
function list(values) {
  return '[' + values.map((value) => JSON.stringify(value)).join(', ') + ']';
}

/**
 * Validate stable identities and declared delegation rosters across one complete
 * source set. It deliberately does not infer or inspect transitive topology.
 * @param {unknown} records
 */
export function validateAgentSet(records) {
  if (!Array.isArray(records)) throw new Error('agent set must be an array');
  const stems = new Set();
  const names = new Set();
  for (const record of records) {
    if (!isObject(record) || !isObject(record.frontmatter)) {
      const stem = isObject(record) && typeof record.stem === 'string' && record.stem ? record.stem : '';
      throw stem ? agentError(stem, 'has a malformed record') : new Error('agent set has a malformed record');
    }
    const stem = assertStem(record.stem);
    const name = record.frontmatter.name;
    if (typeof name !== 'string' || !name) throw agentError(stem, 'has no display name');
    if (stems.has(stem)) throw agentError(stem, `duplicates source stem '${stem}'`);
    if (names.has(name)) throw agentError(stem, `duplicates display name '${name}'`);
    stems.add(stem);
    names.add(name);
  }

  for (const record of records) {
    const stem = /** @type {string} */ (record.stem);
    const frontmatter = /** @type {Record<string, unknown>} */ (record.frontmatter);
    if (!Object.hasOwn(frontmatter, 'agents')) continue;
    const roster = frontmatter.agents;
    if (!Array.isArray(roster) || roster.length === 0 || !roster.every((target) => typeof target === 'string')) {
      throw agentError(stem, 'has a malformed or empty delegation roster');
    }
    if (new Set(roster).size !== roster.length) {
      throw agentError(stem, 'has duplicate delegation roster entries');
    }
    if (roster.includes('*')) {
      if (stem !== 'dude') throw agentError(stem, 'only coordinator stem dude may delegate to *');
      if (roster.length !== 1) throw agentError(stem, 'must not mix wildcard delegation with explicit stems');
      continue;
    }
    for (const target of roster) {
      if (!STEM_RE.test(target)) {
        throw agentError(stem, `delegation target '${target}' must be a stable stem, not a display name`);
      }
      if (target === stem) throw agentError(stem, `must not delegate to itself '${target}'`);
      if (!stems.has(target)) throw agentError(stem, `delegates to unknown stem '${target}'`);
    }
  }
}

/**
 * Render one parsed source record as a Copilot profile.
 * @param {{ stem: string, frontmatter: Record<string, string | boolean | string[]>, body: string }} record
 * @param {unknown} config
 * @returns {Buffer}
 */
export function renderCopilotAgent(record, config) {
  const stem = assertStem(record?.stem);
  try {
    if (!isObject(record.frontmatter) || typeof record.body !== 'string') {
      throw new Error('has a malformed record');
    }
    const frontmatter = record.frontmatter;
    if (typeof frontmatter.name !== 'string' || typeof frontmatter.description !== 'string'
      || !Array.isArray(frontmatter.tools) || typeof frontmatter['model-class'] !== 'string') {
      throw new Error('has malformed required frontmatter');
    }
    for (const tool of frontmatter.tools) {
      if (typeof tool !== 'string' || !COPILOT_TOOLS.has(tool)) {
        throw new Error(`has unsupported Copilot tool selector '${String(tool)}'`);
      }
    }
    if (frontmatter.agents !== undefined
      && (!Array.isArray(frontmatter.agents) || frontmatter.agents.length === 0
        || !frontmatter.agents.every((target) => typeof target === 'string'))) {
      throw new Error('has a malformed delegation roster');
    }
    if (frontmatter['user-invocable'] !== undefined && typeof frontmatter['user-invocable'] !== 'boolean') {
      throw new Error('has malformed user-invocable frontmatter');
    }
    if (frontmatter['argument-hint'] !== undefined && typeof frontmatter['argument-hint'] !== 'string') {
      throw new Error('has malformed argument-hint frontmatter');
    }
    const mapping = resolveCopilotModel(config, frontmatter['model-class']);
    const lines = [
      '---',
      `name: ${JSON.stringify(frontmatter.name)}`,
      `description: ${JSON.stringify(frontmatter.description)}`,
      `tools: ${list(frontmatter.tools)}`,
    ];
    if (frontmatter.agents) lines.push(`agents: ${list(frontmatter.agents)}`);
    if (frontmatter['user-invocable'] !== undefined) {
      lines.push(`user-invocable: ${frontmatter['user-invocable']}`);
    }
    if (frontmatter['argument-hint'] !== undefined) {
      lines.push(`argument-hint: ${JSON.stringify(frontmatter['argument-hint'])}`);
    }
    if (mapping.model) lines.push(`model: ${mapping.model}`);
    return Buffer.from(`${lines.join('\n')}\n---\n${record.body}`, 'utf8');
  } catch (error) {
    throw agentError(stem, errorMessage(error));
  }
}

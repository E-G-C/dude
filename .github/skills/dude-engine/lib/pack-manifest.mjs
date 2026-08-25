// @ts-check
/**
 * Minimal, dependency-free helpers for a pack's `pack.md` frontmatter. The
 * `provides` editor is used by the scaffolders to keep the manifest in sync when a new
 * `dude-pack-<pack>-<slug>` agent or skill is created.
 *
 * Handles both list styles that appear in the catalog:
 *   block:   agents:\n    - dude-pack-x-a\n    - dude-pack-x-b
 *   inline:  agents: [dude-pack-x-a, dude-pack-x-b]
 * Inserts sorted, de-duplicates, and creates the `provides:`/`<kind>:` scaffold
 * when missing. Preserves everything outside the touched list.
 */

/**
 * @param {string} content full pack.md text
 * @returns {{ start: number, end: number, lines: string[] }} frontmatter bounds (line indices) + split lines
 */
function frontmatter(content) {
  const lines = String(content).split('\n');
  if ((lines[0] || '').trim() !== '---') throw new Error('pack.md is missing YAML frontmatter');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('pack.md frontmatter is not closed');
  return { start: 0, end, lines };
}

/** Stable identifier accepted by the discovery `use-cases` metadata. */
export const USE_CASE_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const COLUMN_ZERO_FENCE_RE = /^---[ \t]*$/;
const USE_CASES_KEY_RE = /^use-cases[ \t]*:(.*)$/;
const TOP_LEVEL_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*[ \t]*:/;
const USE_CASES_BLOCK_ITEM_RE = /^  -(?: +(.*)|[ \t]*)$/;

/**
 * Read only a leading, closed, column-zero frontmatter block. This is separate
 * from the editor's legacy bounds helper so its established behavior stays
 * unchanged.
 * @param {string} content
 * @returns {string[] | null}
 */
function closedFrontmatterLines(content) {
  const lines = String(content).split(/\r?\n/);
  if (!COLUMN_ZERO_FENCE_RE.test(lines[0] || '')) return null;
  for (let index = 1; index < lines.length; index += 1) {
    if (COLUMN_ZERO_FENCE_RE.test(lines[index])) return lines.slice(1, index);
  }
  return null;
}

/**
 * Decode the intentionally small scalar subset shared by manifest metadata.
 * @param {string} value
 * @returns {string}
 */
function decodeSimpleScalar(value) {
  const scalar = value.trim();
  if (
    scalar.length >= 2
    && ((scalar.startsWith('"') && scalar.endsWith('"'))
      || (scalar.startsWith("'") && scalar.endsWith("'")))
  ) {
    return scalar.slice(1, -1);
  }
  return scalar;
}

/**
 * @param {string[]} lines
 * @param {'name'|'description'} key
 * @returns {string | null}
 */
function topLevelScalar(lines, key) {
  const keyRe = new RegExp(`^${key}[ \\t]*:(.*)$`);
  for (const line of lines) {
    const match = keyRe.exec(line);
    if (match) return decodeSimpleScalar(match[1]);
  }
  return null;
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function validateUseCases(values) {
  if (values.length === 0) throw new Error('pack.md use-cases must be a non-empty list');
  const seen = new Set();
  for (const value of values) {
    if (!value) throw new Error('pack.md use-cases contains an empty item');
    if (!USE_CASE_ID_RE.test(value)) {
      throw new Error(`pack.md use-cases contains invalid value ${JSON.stringify(value)}`);
    }
    if (seen.has(value)) {
      throw new Error(`pack.md use-cases contains duplicate value ${JSON.stringify(value)}`);
    }
    seen.add(value);
  }
  return values;
}

/**
 * Parse the optional discovery list without attempting to implement YAML.
 * @param {string[]} lines
 * @returns {string[]}
 */
function parseUseCases(lines) {
  /** @type {Array<{ index: number, value: string }>} */
  const declarations = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = USE_CASES_KEY_RE.exec(lines[index]);
    if (match) declarations.push({ index, value: match[1] });
  }
  if (declarations.length === 0) return [];
  if (declarations.length > 1) throw new Error('pack.md use-cases must not be repeated');

  const declaration = declarations[0];
  const value = declaration.value.trim();
  if (value) {
    const inline = /^\[(.*)\]$/.exec(value);
    if (!inline) throw new Error('pack.md use-cases must be a list');
    if (!inline[1].trim()) throw new Error('pack.md use-cases must be a non-empty list');
    return validateUseCases(inline[1].split(',').map(decodeSimpleScalar));
  }

  /** @type {string[]} */
  const items = [];
  for (let index = declaration.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (TOP_LEVEL_KEY_RE.test(line)) break;
    const item = USE_CASES_BLOCK_ITEM_RE.exec(line);
    if (!item) throw new Error('pack.md use-cases must be a list of two-space items');
    items.push(decodeSimpleScalar(item[1] || ''));
  }
  return validateUseCases(items);
}

/**
 * Parse the bounded pack metadata consumed by Compose discovery.
 * @param {string} content
 * @returns {{ name: string | null, description: string, useCases: string[] }}
 */
export function parsePackManifestMetadata(content) {
  const lines = closedFrontmatterLines(content);
  if (!lines) return { name: null, description: '', useCases: [] };
  return {
    name: topLevelScalar(lines, 'name'),
    description: topLevelScalar(lines, 'description') || '',
    useCases: parseUseCases(lines),
  };
}

/** @param {string[]} items @returns {string[]} sorted unique */
function sortedUnique(items) {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].sort();
}

/**
 * Add an artifact id to `provides.<kind>` in pack.md. Idempotent.
 * @param {string} content
 * @param {'agents'|'skills'|'instructions'|'prompts'} kind
 * @param {string} id
 * @returns {string} new content
 */
export function addProvide(content, kind, id) {
  const { end: fmEnd, lines } = frontmatter(content);

  // Locate `provides:` (top-level key inside frontmatter).
  let provIdx = -1;
  for (let i = 1; i < fmEnd; i++) {
    if (/^provides:\s*$/.test(lines[i])) {
      provIdx = i;
      break;
    }
  }

  if (provIdx === -1) {
    // No provides block: insert one before `requires:` if present, else before the closing ---.
    let insertAt = fmEnd;
    for (let i = 1; i < fmEnd; i++) {
      if (/^requires:/.test(lines[i]) || /^routing_hints:/.test(lines[i]) || /^hooks:/.test(lines[i])) {
        insertAt = i;
        break;
      }
    }
    lines.splice(insertAt, 0, 'provides:', `  ${kind}:`, `    - ${id}`);
    return lines.join('\n');
  }

  // Determine the extent of the provides block: until the next top-level key or ---.
  let provEnd = fmEnd;
  for (let i = provIdx + 1; i < fmEnd; i++) {
    if (/^[^\s#]/.test(lines[i])) {
      provEnd = i;
      break;
    }
  }

  // Find the `  <kind>:` line within the provides block.
  let kindIdx = -1;
  for (let i = provIdx + 1; i < provEnd; i++) {
    if (new RegExp(`^  ${kind}:`).test(lines[i])) {
      kindIdx = i;
      break;
    }
  }

  if (kindIdx === -1) {
    // Kind missing: append `  <kind>:` block at the end of the provides block.
    lines.splice(provEnd, 0, `  ${kind}:`, `    - ${id}`);
    return lines.join('\n');
  }

  const inline = /^ {2}[a-z]+:\s*\[(.*)\]\s*$/.exec(lines[kindIdx]);
  if (inline) {
    const items = sortedUnique(inline[1].split(',').concat(id));
    lines[kindIdx] = `  ${kind}: [${items.join(', ')}]`;
    return lines.join('\n');
  }

  // Block form: gather subsequent `    - item` lines.
  const items = [];
  let j = kindIdx + 1;
  for (; j < provEnd; j++) {
    const m = /^ {4}-\s+(.+?)\s*$/.exec(lines[j]);
    if (!m) break;
    items.push(m[1]);
  }
  const merged = sortedUnique(items.concat(id));
  lines.splice(kindIdx + 1, j - (kindIdx + 1), ...merged.map((it) => `    - ${it}`));
  return lines.join('\n');
}

/**
 * List the ids under `provides.<kind>` (block or inline). For tests/validation.
 * @param {string} content
 * @param {string} kind
 * @returns {string[]}
 */
export function listProvide(content, kind) {
  const { end: fmEnd, lines } = frontmatter(content);
  let provIdx = -1;
  for (let i = 1; i < fmEnd; i++) if (/^provides:\s*$/.test(lines[i])) provIdx = i;
  if (provIdx === -1) return [];
  let provEnd = fmEnd;
  for (let i = provIdx + 1; i < fmEnd; i++) if (/^[^\s#]/.test(lines[i])) { provEnd = i; break; }
  for (let i = provIdx + 1; i < provEnd; i++) {
    if (new RegExp(`^  ${kind}:`).test(lines[i])) {
      const inline = /^ {2}[a-z]+:\s*\[(.*)\]\s*$/.exec(lines[i]);
      if (inline) return sortedUnique(inline[1].split(','));
      const items = [];
      for (let j = i + 1; j < provEnd; j++) {
        const m = /^ {4}-\s+(.+?)\s*$/.exec(lines[j]);
        if (!m) break;
        items.push(m[1]);
      }
      return items;
    }
  }
  return [];
}

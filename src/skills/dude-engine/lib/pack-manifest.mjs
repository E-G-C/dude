// @ts-check
/**
 * Minimal, dependency-free editor for a pack's `pack.md` frontmatter `provides`
 * lists. Used by the scaffolders to keep the manifest in sync when a new
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

// @ts-check
/**
 * Host-editor `model:` frontmatter normalizer for Dude agent files.
 *
 * VS Code injects a per-agent `model:` frontmatter line into an installed
 * `.github/agents/*.agent.md` when it dispatches that agent as a subagent. That
 * editor-owned key is not part of the bundle-controlled source, so it breaks
 * `dude-compose` pack parity (recorded vs. installed hashes) and the prompt
 * audit's source/installed comparison. This module is the single source of
 * truth for stripping only that injected key back out for measurement.
 *
 * `normalizeAgentFrontmatter` operates on raw bytes and is deliberately narrow:
 *
 *   - Only the LEADING `---` … `---` frontmatter block is considered; a
 *     `model:` line anywhere in the body is left untouched.
 *   - It neutralizes EXACTLY ONE well-formed host-injected
 *     `model: <constrained model identifier>` key — and only when that key is
 *     also the block's ONLY model-semantic line — stripping it plus at most one
 *     adjacent blank line (preferring the blank AFTER, else the blank BEFORE).
 *   - Everything else is DRIFT and returned as a strict byte-for-byte no-op
 *     (the original buffer reference), leaving the bytes intact so downstream
 *     hashing/parity catches the drift rather than masking it:
 *       · zero model lines (already clean);
 *       · TWO OR MORE well-formed `model:` keys (duplicates);
 *       · one well-formed key beside any other model-semantic line — a
 *         malformed (`model: {a: b}`), empty (`model:`), quoted-value
 *         (`model: "x"`), or quoted-key (`"model": X`) form;
 *       · INCONSISTENT (mixed LF/CRLF) frontmatter terminators, which a
 *         single-EOL rebuild would silently rewrite on untouched lines.
 *   - In the single clean case the EOL style (LF vs CRLF), the opening/closing
 *     `---` delimiters, and the body after the closing delimiter are preserved
 *     verbatim.
 *
 * The transform is idempotent: `normalize(normalize(x))` equals `normalize(x)`.
 *
 * Dependency-free ESM, Node >= 20.
 */

/**
 * A whole `model:` frontmatter line carrying a plain, unquoted model
 * identifier. Deliberately narrow so quoted/structured/empty values never
 * match and therefore are never stripped.
 * @type {RegExp}
 */
const MODEL_LINE_RE = /^model:[ \t]+[A-Za-z0-9][A-Za-z0-9 ._()\/+-]*[ \t]*$/;

/**
 * A whole line that is semantically a top-level `model` key in ANY form —
 * well-formed, malformed, empty, quoted value, or quoted key. Every
 * `MODEL_LINE_RE` line is also a `MODEL_SEMANTIC_RE` line, so the normalizer
 * strips only when the block holds exactly one of each (the same line); any
 * extra semantic line marks drift and forces a no-op.
 * @type {RegExp}
 */
const MODEL_SEMANTIC_RE = /^(?:model|"model"|'model'):/;

/**
 * Strip the host editor's injected `model:` key from an agent file's leading
 * frontmatter block, returning the canonical model-less bytes. Model-less input
 * is returned as the original buffer (strict no-op).
 * @param {Buffer | string} input raw agent-file bytes (or UTF-8 text)
 * @returns {Buffer} normalized bytes; the original buffer when nothing changed
 */
export function normalizeAgentFrontmatter(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  const text = buf.toString('utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return buf;

  const interior = m[1];
  const lines = interior.split(/\r?\n/);

  // Classify the block's `model` lines. Strip only when there is EXACTLY ONE
  // well-formed host-injected key that is also the ONLY model-semantic line.
  // Zero keys is already clean; duplicates, or a well-formed key beside any
  // other model-semantic line, is drift — return the original bytes untouched.
  let wellFormedCount = 0;
  let semanticCount = 0;
  for (const line of lines) {
    if (MODEL_SEMANTIC_RE.test(line)) semanticCount += 1;
    if (MODEL_LINE_RE.test(line)) wellFormedCount += 1;
  }
  if (wellFormedCount !== 1 || semanticCount !== 1) return buf;

  // Inconsistent (mixed LF/CRLF) frontmatter is drift too: rebuilding on a
  // single detected EOL would silently rewrite the terminators of untouched
  // lines, so bail to a byte-for-byte no-op.
  const lfCount = (m[0].match(/\n/g) || []).length;
  const crlfCount = (m[0].match(/\r\n/g) || []).length;
  if (crlfCount > 0 && crlfCount !== lfCount) return buf;

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  /** @type {string[]} */
  const out = [];
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (MODEL_LINE_RE.test(lines[i])) {
      changed = true;
      if (i + 1 < lines.length && lines[i + 1].trim() === '') {
        i += 1; // absorb one blank line after
      } else if (out.length && out[out.length - 1].trim() === '') {
        out.pop(); // else absorb one blank line before
      }
      continue;
    }
    out.push(lines[i]);
  }
  if (!changed) return buf;

  const interiorOut = out.length ? out.join(eol) + eol : '';
  const rebuilt =
    text.slice(0, m.index) +
    '---' + eol + interiorOut + '---' +
    text.slice(m.index + m[0].length - m[2].length);
  return Buffer.from(rebuilt, 'utf8');
}

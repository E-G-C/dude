// @ts-check
/**
 * Host-owned `model:` frontmatter normalizer for the one Copilot profile.
 *
 * `.github/agents/<stem>.agent.md` is the one generated Copilot profile. Its
 * `model:` line is a BUNDLE-SEEDED DEFAULT resolved from the authoritative
 * source's `model-class` and configuration, not a value the source declares.
 * After installation that line becomes HOST-OWNED: VS Code rewrites it per
 * agent when it dispatches that agent as a subagent. The rewritten value is
 * still the same single key in the same slot, so `dude-compose` parity
 * (recorded vs. installed hashes) would otherwise read an ordinary host model
 * choice as pack drift. This module is the single source of truth for
 * neutralizing that one key for MEASUREMENT ONLY; it never writes, repairs, or
 * reseeds a file.
 *
 * SCOPE — the Copilot profile form only, and only where parity is MEASURED.
 * `hashArtifact` in `dude-compose` applies it to `*.agent.md` and to nothing
 * else.
 *
 * DO NOT APPLY IT TO `dude-bundle-upgrade` CLASSIFICATION. `classifyPlan`
 * compares installed core bytes against upstream bytes to decide what to
 * overwrite, which is not parity measurement: a class remap that changes only the
 * `model:` line is exactly the change that must reach the workspace. Normalizing
 * there would classify that file as up to date and silently strand the old model.
 * The same reasoning holds for the apply-time Replace line-count recheck, which
 * must measure the same bytes `classifyPlan` did.
 *
 * IT NEVER STRIPS `model-class`. `model-class` is authoritative source metadata,
 * is projected into no target, and matches neither pattern below (both anchor on
 * the exact key `model:`). Stripping it would erase the one input the single
 * class-to-model mapping reads.
 *
 * WHY THERE IS NO IN-PLACE CANONICALIZER. The historical canonicalizer is
 * deleted rather than carried forward or reworked: it had no production caller,
 * shipped in no release, and its only job — restoring parity after a host edit
 * — is already done here at measurement time. Rewriting a file with the
 * normalized bytes now deletes the generated default; reseeding it instead
 * would re-derive the model outside the canonical configuration, which is
 * exactly the second resolution surface the ledger forbids. It remains deleted.
 *
 * `normalizeAgentFrontmatter` operates on raw bytes and is deliberately narrow:
 *
 *   - Only the LEADING `---` … `---` frontmatter block is considered; a
 *     `model:` line anywhere in the body is left untouched.
 *   - It neutralizes EXACTLY ONE well-formed
 *     `model: <constrained model identifier>` key — seeded by the projection or
 *     rewritten in place by the host — and only when that key is also the
 *     block's ONLY model-semantic line, stripping it plus at most one
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
 * Strip the single seeded-or-host-rewritten `model:` key from an agent file's
 * leading frontmatter block, returning the model-less bytes used for parity
 * measurement. Model-less input is returned as the original buffer (strict
 * no-op). Nothing is written to disk; `model-class` is never touched.
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
  // well-formed `model:` key that is also the ONLY model-semantic line.
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

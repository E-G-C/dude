// @ts-check
/**
 * Optional development base-release provenance record.
 *
 * `.dude/metadata/development-base-release.md` holds exactly one fenced JSON
 * object with two fields: the exact installation source the record belongs
 * to, and the highest stable Dude release evidenced as included in that
 * development source when it was recorded. It is provenance, not verification
 * of installed bytes or a claim about the newest available release. Unknown
 * provenance is an absent file, never a placeholder document.
 *
 * The source development build and the upgrade engine write it; the Canvas
 * About read consumes it. Parsing and rendering are pure: they perform no
 * filesystem, process, or network access.
 */
import { parseProfilePayload } from './profile.mjs';

/** The recorded installation ref of a branch-tracking development install. */
export const DEVELOPMENT_INSTALLED_REF = 'main';

/** Stable release tags only; prereleases and other names never qualify. */
export const STABLE_RELEASE_PATTERN = /^v\d+\.\d+\.\d+$/;

const RECORD_FIELDS = Object.freeze(['base_release', 'source_repo']);

const RECORD_PROSE = [
  'This optional file records the highest stable Dude release evidenced as',
  "included in this development installation's source when it was recorded.",
  'The source development build and `@dude upgrade` maintain it; do not',
  'hand-edit it. It is provenance, not verification of installed files or a',
  'check for newer releases. An absent file means the base release is unknown.',
].join('\n');

/** @typedef {{ source_repo: string, base_release: string }} DevelopmentBaseRelease */

/**
 * Validate one record value exactly, without coercion.
 * @param {unknown} value
 * @returns {Readonly<DevelopmentBaseRelease>}
 */
export function validateDevelopmentBaseRelease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('development base release record must be a JSON object');
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_FIELDS.length || keys.some((key, index) => key !== RECORD_FIELDS[index])) {
    throw new Error('development base release record fields must be exactly source_repo and base_release');
  }
  const sourceRepo = record.source_repo;
  const baseRelease = record.base_release;
  if (typeof sourceRepo !== 'string' || !sourceRepo.trim()) {
    throw new Error('development base release source_repo must be a nonblank string');
  }
  if (typeof baseRelease !== 'string' || !STABLE_RELEASE_PATTERN.test(baseRelease)) {
    throw new Error('development base release base_release must be a stable vX.Y.Z release tag');
  }
  return Object.freeze({ source_repo: sourceRepo, base_release: baseRelease });
}

/**
 * Parse record bytes. Only valid UTF-8 with exactly one fenced JSON object of
 * the two fields is usable; any other content throws.
 * @param {Uint8Array} bytes
 * @returns {Readonly<DevelopmentBaseRelease>}
 */
export function parseDevelopmentBaseRelease(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('development base release content must be bytes');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error('development base release record is not valid UTF-8', { cause: error });
  }
  let payload;
  try {
    payload = parseProfilePayload(text);
  } catch (error) {
    throw new Error(
      'development base release record must contain exactly one well-formed fenced JSON block',
      { cause: error },
    );
  }
  return validateDevelopmentBaseRelease(payload);
}

/**
 * Render the canonical document for one validated record.
 * @param {DevelopmentBaseRelease} record
 * @returns {string}
 */
export function renderDevelopmentBaseRelease(record) {
  const { source_repo: sourceRepo, base_release: baseRelease } = validateDevelopmentBaseRelease(record);
  const json = JSON.stringify({ source_repo: sourceRepo, base_release: baseRelease }, null, 2);
  return `# Development Base Release\n\n${RECORD_PROSE}\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

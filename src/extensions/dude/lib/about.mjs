// @ts-check
/**
 * Private Canvas About read: the bound workspace's recorded installation refs.
 *
 * It reads one fixed file, the bundle manifest, through the engine's
 * repository-contained, no-symbolic-link path boundary. The record is
 * installation provenance, not verification of installed bytes. Compose and
 * upgrade own every acquisition from the recorded source; this read starts no
 * command, contacts no remote, keeps no cache, and writes nothing.
 *
 * The relative engine imports resolve identically from the authored source
 * tree and from the projected runtime tree.
 */
import fs from 'node:fs';
import { parseProfilePayload } from '../../../skills/dude-engine/lib/profile.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

/** @typedef {{ installedRef: string | null, sourceRef: string | null }} InstallationRecord */

const MANIFEST_FIELDS = Object.freeze(['source_repo', 'source_ref', 'installed_ref']);
// Branch, tag or commit-shaped refs only: no URL, path, whitespace, control or
// credential syntax. An accepted value is returned exactly as recorded.
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/;

/** @type {Readonly<InstallationRecord>} */
const UNAVAILABLE = Object.freeze({ installedRef: null, sourceRef: null });

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function usableRef(value) {
  if (typeof value !== 'string' || !REF_PATTERN.test(value) || value.includes('..')) return null;
  // An empty component also rejects `//` and a trailing `/`.
  return value.split('/').every(part => part !== '' && !part.startsWith('.')
    && !part.endsWith('.') && !part.endsWith('.lock')) ? value : null;
}

/**
 * Apply the closed manifest shape. A nonblank `source_repo` establishes the
 * record's provenance but is never returned. Each ref stands alone: an absent,
 * empty, non-string or unsafe value is null, never a default or the other ref.
 * @param {unknown} payload
 * @returns {Readonly<InstallationRecord>}
 */
function installationRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return UNAVAILABLE;
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (Object.keys(record).some(key => !MANIFEST_FIELDS.includes(key))) return UNAVAILABLE;
  /** @param {string} key */
  const field = key => (Object.hasOwn(record, key) ? record[key] : undefined);
  const repository = field('source_repo');
  if (typeof repository !== 'string' || !repository.trim()) return UNAVAILABLE;
  return { installedRef: usableRef(field('installed_ref')), sourceRef: usableRef(field('source_ref')) };
}

/**
 * Read the recorded refs once, uncached. Missing, linked, non-file, unreadable,
 * non-UTF-8, malformed, multi-payload, unsupported or unprovenanced records
 * are unavailable: both refs are null, and no document, path or error detail
 * leaves this module.
 * @param {string} root
 * @returns {Promise<Readonly<InstallationRecord>>}
 */
export async function readInstallationRecord(root) {
  let bytes;
  try {
    // The resolver rejects linked, non-directory and escaping components; the
    // filesystem reports missing and unreadable sources.
    const file = resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST);
    if (!fs.lstatSync(file).isFile()) return UNAVAILABLE;
    bytes = await fs.promises.readFile(file);
  } catch (error) {
    // An invalid argument is a caller defect, not an unavailable record.
    if (error instanceof TypeError) throw error;
    return UNAVAILABLE;
  }
  let payload;
  try {
    // Invalid UTF-8 anywhere in the document, zero or several JSON fences, and
    // malformed JSON are the only failures of these two calls.
    payload = parseProfilePayload(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return UNAVAILABLE;
  }
  return installationRecord(payload);
}

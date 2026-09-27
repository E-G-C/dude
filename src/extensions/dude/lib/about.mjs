// @ts-check
/**
 * Private Canvas About read: the bound workspace's recorded installation refs
 * and, for a development install, its recorded base release.
 *
 * It reads at most two fixed files through the engine's repository-contained,
 * no-symbolic-link path boundary: the bundle manifest and, only when that
 * manifest records the development ref, the optional development base-release
 * record. Both are installation provenance, not verification of installed
 * bytes or a claim about the newest release. Compose and upgrade own every
 * acquisition from the recorded source; this read starts no command, contacts
 * no remote, keeps no cache, and writes nothing.
 *
 * The relative engine imports resolve identically from the authored source
 * tree and from the projected runtime tree.
 */
import fs from 'node:fs';
import {
  DEVELOPMENT_INSTALLED_REF,
  parseDevelopmentBaseRelease,
} from '../../../skills/dude-engine/lib/development-base-release.mjs';
import { parseProfilePayload } from '../../../skills/dude-engine/lib/profile.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

/**
 * @typedef {{ installedRef: string | null, sourceRef: string | null, baseRelease: string | null }} InstallationRecord
 */

const MANIFEST_FIELDS = Object.freeze(['source_repo', 'source_ref', 'installed_ref']);
// Branch, tag or commit-shaped refs only: no URL, path, whitespace, control or
// credential syntax. An accepted value is returned exactly as recorded.
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/;

/** @type {Readonly<InstallationRecord>} */
const UNAVAILABLE = Object.freeze({ installedRef: null, sourceRef: null, baseRelease: null });

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
 * record's provenance; it is kept only to associate the optional base record
 * and is never returned. Each ref stands alone: an absent, empty, non-string
 * or unsafe value is null, never a default or the other ref.
 * @param {unknown} payload
 * @returns {{ installedRef: string | null, sourceRef: string | null, repository: string } | null}
 */
function manifestRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (Object.keys(record).some(key => !MANIFEST_FIELDS.includes(key))) return null;
  /** @param {string} key */
  const field = key => (Object.hasOwn(record, key) ? record[key] : undefined);
  const repository = field('source_repo');
  if (typeof repository !== 'string' || !repository.trim()) return null;
  return { installedRef: usableRef(field('installed_ref')), sourceRef: usableRef(field('source_ref')), repository };
}

/**
 * Read one fixed workspace file once, uncached. The resolver rejects linked,
 * non-directory and escaping components, a linked or non-file target is never
 * opened, and the filesystem reports missing and unreadable files. Every such
 * file is absent; no path or error detail leaves this module.
 * @param {string} root
 * @param {string} relativePath
 * @returns {Promise<Buffer | null>}
 */
async function readFixedFile(root, relativePath) {
  try {
    const file = resolveMutationPath(root, relativePath);
    if (!fs.lstatSync(file).isFile()) return null;
    return await fs.promises.readFile(file);
  } catch (error) {
    // An invalid argument is a caller defect, not an absent record.
    if (error instanceof TypeError) throw error;
    return null;
  }
}

/**
 * The development install's recorded base release, only when the optional
 * record names exactly the manifest's source. A missing, unreadable, non-UTF-8,
 * malformed, non-stable or differently sourced record is no base.
 * @param {string} root
 * @param {string} repository
 * @returns {Promise<string | null>}
 */
async function recordedBaseRelease(root, repository) {
  const bytes = await readFixedFile(root, WORKSPACE_PATHS.DEVELOPMENT_BASE_RELEASE);
  if (!bytes) return null;
  let record;
  try {
    record = parseDevelopmentBaseRelease(bytes);
  } catch {
    return null;
  }
  return record.source_repo === repository ? record.base_release : null;
}

/**
 * Read the recorded installation once, uncached. Missing, linked, non-file,
 * unreadable, non-UTF-8, malformed, multi-payload, unsupported or
 * unprovenanced manifests are unavailable: all three values are null. Only an
 * installed development ref reads the base record, and an unusable record
 * nulls only `baseRelease`. No document, source, path or error detail leaves
 * this module.
 * @param {string} root
 * @returns {Promise<Readonly<InstallationRecord>>}
 */
export async function readInstallationRecord(root) {
  const bytes = await readFixedFile(root, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  if (!bytes) return UNAVAILABLE;
  let payload;
  try {
    // Invalid UTF-8 anywhere in the document, zero or several JSON fences, and
    // malformed JSON are the only failures of these two calls.
    payload = parseProfilePayload(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return UNAVAILABLE;
  }
  const manifest = manifestRecord(payload);
  if (!manifest) return UNAVAILABLE;
  const { installedRef, sourceRef, repository } = manifest;
  const baseRelease = installedRef === DEVELOPMENT_INSTALLED_REF
    ? await recordedBaseRelease(root, repository)
    : null;
  return { installedRef, sourceRef, baseRelease };
}

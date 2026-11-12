// @ts-check
/**
 * Standing A2A pairing records: one small owner-local file per paired
 * profile, beside the owner's external configuration and never in a
 * repository. This module only derives, reads, and writes them; it decides
 * nothing about approval or activation.
 *
 * Layout: `<canonical-config-path>.pairings/<sha256(exact profile ID)>.json`.
 * Hashing the exact, case-sensitive ID keeps distinct IDs apart on
 * case-insensitive file systems without changing the ID grammar. A record is
 * exactly `{"version":1,"bindingSha256":"<64 lowercase hex>"}` within 1 KiB:
 * the digest of an approved stable binding, never the binding's values, a
 * proposal, a code, a session, a key, a credential, or a time.
 *
 * Location: every read and write checks it again first. The record's folder
 * must lie outside the canonical workspace and outside every Git checkout or
 * worktree, recognized by a `.git` file or folder on the folder or any
 * ancestor, without running Git. Its existing parent is resolved first, so a
 * link cannot hide where the folder really is. The folder must not be a link,
 * and the record must be a regular file, not a link.
 *
 * Reading: a record that does not exist yet, in an allowed location, reads as
 * null, the first-enrollment case. A record that is unsafe, unreadable, or not
 * exactly the closed record refuses with a `PairingError`; its content is
 * never echoed.
 *
 * Writing: only a write creates the folder. A new record goes to an
 * exclusively created sibling temporary file that is then renamed into place,
 * so a caught failure keeps any previous record and removes only that
 * attempt's temporary file. Owner-only modes are requested where the platform
 * applies them. This is not a crash-proof transaction, and nothing here
 * protects a record from anyone already allowed to write these files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

/** One record's upper bound; a larger file is refused, never truncated. */
const RECORD_BYTES = 1024;
const VERSION = 1;
const RECORD_KEYS = Object.freeze(['version', 'bindingSha256']);
const DIGEST = /^[0-9a-f]{64}$/;
const UNREADABLE = 'the pairing record cannot be read';
const INVALID = `the pairing record is not a version ${VERSION} record of at most ${RECORD_BYTES} bytes`;
const RECORD_UNSAFE = 'the pairing record must be a regular file, not a link or folder';
const UNWRITABLE = 'the pairing record could not be saved; any previous record is unchanged';

/** @typedef {'pairing_location' | 'pairing_unsafe' | 'pairing_unreadable' | 'pairing_invalid' | 'pairing_unwritable'} PairingCode */

/**
 * A refusal whose message names the rule, never a path or record content.
 * `pairing_location`: inside the workspace or a Git checkout or worktree.
 * `pairing_unsafe`: a linked or non-folder storage folder, or a linked or
 * non-regular record. `pairing_unreadable`: the location or record cannot be
 * read. `pairing_invalid`: not exactly the closed record within its bound.
 * `pairing_unwritable`: a write failed, and any previous record was kept.
 */
export class PairingError extends Error {
  /** @param {PairingCode} code @param {string} detail */
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} error @param {string} code */
function hasCode(error, code) {
  return isRecord(error) && error.code === code;
}

/** @param {string} base @param {string} candidate */
function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Null when nothing is there, including below a file. @param {string} target */
function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) return null;
    throw error;
  }
}

/**
 * Where one profile's record lives. Pure: it reads and creates nothing.
 * @param {string} config The canonical (real) absolute path of the external configuration file.
 * @param {string} profileId The exact profile ID.
 */
export function pairingPath(config, profileId) {
  return path.join(`${config}.pairings`, `${createHash('sha256').update(profileId, 'utf8').digest('hex')}.json`);
}

/**
 * The record's folder as it is now: its existing parent resolved, a plain
 * folder when present, and outside the workspace and every Git checkout or
 * worktree. A probe that fails for any reason but absence refuses.
 * @param {string} file A `pairingPath` result.
 * @param {string} workspace The canonical workspace.
 * @returns {{folder: string, present: boolean}}
 */
function checkLocation(file, workspace) {
  try {
    const named = path.dirname(file);
    const folder = path.join(fs.realpathSync.native(path.dirname(named)), path.basename(named));
    const stat = lstatOrNull(folder);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new PairingError('pairing_unsafe', 'the pairing folder must be a plain folder, not a link or file');
    }
    if (isWithin(workspace, folder)) throw new PairingError('pairing_location', 'the pairing folder must be outside this workspace');
    for (let directory = folder; ; directory = path.dirname(directory)) {
      if (lstatOrNull(path.join(directory, '.git'))) {
        throw new PairingError('pairing_location', 'the pairing folder must be outside every Git checkout or worktree');
      }
      if (path.dirname(directory) === directory) break;
    }
    return { folder, present: stat !== null };
  } catch (error) {
    if (error instanceof PairingError) throw error;
    throw new PairingError('pairing_unreadable', 'the pairing location cannot be checked');
  }
}

/** @param {Buffer} bytes @returns {unknown} */
function decodeJson(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new PairingError('pairing_invalid', INVALID);
  }
}

/**
 * The digest of exactly the closed record. A refusal never repeats the bytes.
 * @param {Buffer} bytes
 * @returns {string}
 */
function parseRecord(bytes) {
  const value = decodeJson(bytes);
  if (!isRecord(value) || Object.keys(value).length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => Object.hasOwn(value, key))
    || value.version !== VERSION || typeof value.bindingSha256 !== 'string' || !DIGEST.test(value.bindingSha256)) {
    throw new PairingError('pairing_invalid', INVALID);
  }
  return value.bindingSha256;
}

/**
 * The complete bytes of a regular file of at most RECORD_BYTES, reading one
 * byte more so a larger file is refused rather than truncated.
 * @param {string} file
 */
function readBounded(file) {
  /** @type {number} */
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new PairingError('pairing_unreadable', UNREADABLE);
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new PairingError('pairing_unsafe', RECORD_UNSAFE);
    const buffer = Buffer.alloc(RECORD_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (!read) break;
      count += read;
    }
    if (count > RECORD_BYTES) throw new PairingError('pairing_invalid', INVALID);
    return buffer.subarray(0, count);
  } catch (error) {
    if (error instanceof PairingError) throw error;
    throw new PairingError('pairing_unreadable', UNREADABLE);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * One profile's stored binding digest, or null when it has no record yet.
 * Every other outcome refuses with a `PairingError`.
 * @param {string} file A `pairingPath` result.
 * @param {string} workspace The canonical workspace.
 * @returns {string | null}
 */
export function readPairing(file, workspace) {
  const { folder, present } = checkLocation(file, workspace);
  if (!present) return null;
  const record = path.join(folder, path.basename(file));
  /** @type {fs.Stats | null} */
  let stat;
  try {
    stat = lstatOrNull(record);
  } catch {
    throw new PairingError('pairing_unreadable', UNREADABLE);
  }
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) throw new PairingError('pairing_unsafe', RECORD_UNSAFE);
  return parseRecord(readBounded(record));
}

/**
 * Save one profile's record holding `bindingSha256`. Any previous record is
 * replaced only by the final rename.
 * @param {string} file A `pairingPath` result.
 * @param {string} workspace The canonical workspace.
 * @param {string} bindingSha256 The approved stable binding digest: 64 lowercase hex digits.
 */
export function writePairing(file, workspace, bindingSha256) {
  if (typeof bindingSha256 !== 'string' || !DIGEST.test(bindingSha256)) {
    throw new PairingError('pairing_invalid', 'a pairing record holds one lowercase SHA-256 digest');
  }
  let location = checkLocation(file, workspace);
  if (!location.present) {
    try {
      fs.mkdirSync(location.folder, { mode: 0o700 });
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw new PairingError('pairing_unwritable', UNWRITABLE);
    }
    // Checked again now that it exists, as at every use.
    location = checkLocation(file, workspace);
    if (!location.present) throw new PairingError('pairing_unwritable', UNWRITABLE);
  }
  const name = path.basename(file);
  const record = path.join(location.folder, name);
  /** @type {fs.Stats | null} */
  let existing;
  try {
    existing = lstatOrNull(record);
  } catch {
    throw new PairingError('pairing_unwritable', UNWRITABLE);
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) throw new PairingError('pairing_unsafe', RECORD_UNSAFE);
  const temporary = path.join(location.folder, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
  /** @type {number} */
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
  } catch {
    // This attempt created nothing, so it has nothing of its own to remove.
    throw new PairingError('pairing_unwritable', UNWRITABLE);
  }
  try {
    try {
      fs.writeFileSync(fd, `${JSON.stringify({ version: VERSION, bindingSha256 })}\n`);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, record);
  } catch {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      throw new PairingError('pairing_unwritable', `${UNWRITABLE}, but this attempt's temporary file remains beside it`);
    }
    throw new PairingError('pairing_unwritable', UNWRITABLE);
  }
}

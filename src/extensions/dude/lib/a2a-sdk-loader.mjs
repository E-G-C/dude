// @ts-check
/**
 * The two fixed production loaders of the public Copilot SDK.
 *
 * `loadExtensionSdk()` serves the joined extension and `loadWorkerSdk()` the
 * restricted evidence worker. There is no other entry point, argument, SDK
 * path, resolver, search, fallback, or install. Each resolves its one public
 * specifier, `@github/copilot-sdk/extension` or `@github/copilot-sdk`, in this
 * module's own production import context, inspects the resolved artifact, and
 * imports exactly that resolved URL.
 *
 * The artifact must be a canonical regular `file:` entry of at most 16 MiB,
 * reached through no link. Its file identity, size, modification time, and
 * SHA-256 are taken before and after the import; a changed or uninspectable
 * artifact refuses. A later call for the same specifier must resolve to the
 * same URL and find the same identity, so it reports the provenance first
 * observed, which is what the process actually loaded.
 *
 * The caller gets the module privately and only bounded provenance,
 * {resolvedUrl, path, bytes, sha256}. A refusal throws an Error whose `code`
 * is `sdk_provenance_unavailable` (unresolvable, not a plain file, linked,
 * oversized, or unreadable), `sdk_artifact_changed`, or `sdk_unavailable`
 * (the import itself failed). Hashes detect a changed artifact; they do not
 * show that it is authentic, that the host loaded what the file holds, or what
 * the entry imports in turn.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Largest SDK entry file either loader inspects and imports. */
const ENTRY_BYTES = 16 * 1024 * 1024;
/** Bound for the resolved URL and path kept as provenance. */
const LOCATION_CHARS = 2_048;

/**
 * @typedef {object} SdkProvenance
 * @property {string} resolvedUrl The exact `file:` URL that was imported.
 * @property {string} path That URL's file path.
 * @property {number} bytes The entry's size.
 * @property {string} sha256 The entry's SHA-256, before and after the import.
 */
/** @typedef {{dev: bigint, ino: bigint, size: number, mtimeNs: bigint, sha256: string}} Identity */

/** What each specifier first loaded, so a later load reports the same provenance or refuses. @type {Map<string, {identity: Identity, provenance: SdkProvenance}>} */
const loaded = new Map();

/** @param {string} code @param {string} detail */
function refusal(code, detail) {
  return Object.assign(new Error(detail), { code });
}

/** @param {Identity} left @param {Identity} right */
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.sha256 === right.sha256;
}

/**
 * Read one entry completely through a descriptor that cannot follow a final
 * link, and return its identity and digest.
 * @param {string} file
 * @returns {Identity}
 */
function inspect(file) {
  /** @type {fs.BigIntStats} */
  let stat;
  let real = '';
  try {
    stat = fs.lstatSync(file, { bigint: true });
    real = fs.realpathSync(file);
  } catch {
    throw refusal('sdk_provenance_unavailable', 'the resolved SDK entry cannot be inspected');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw refusal('sdk_provenance_unavailable', 'the resolved SDK entry is not a regular file');
  if (real !== file) throw refusal('sdk_provenance_unavailable', 'the resolved SDK entry is reached through a link');
  if (stat.size > BigInt(ENTRY_BYTES)) throw refusal('sdk_provenance_unavailable', `the resolved SDK entry exceeds ${ENTRY_BYTES} bytes`);
  /** @type {number} */
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch {
    throw refusal('sdk_provenance_unavailable', 'the resolved SDK entry cannot be opened');
  }
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || before.size > BigInt(ENTRY_BYTES)) {
      throw refusal('sdk_artifact_changed', 'the resolved SDK entry changed while it was opened');
    }
    const size = Number(before.size);
    const buffer = Buffer.alloc(size + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (!read) break;
      count += read;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (count !== size || after.size !== before.size || after.mtimeNs !== before.mtimeNs) {
      throw refusal('sdk_artifact_changed', 'the resolved SDK entry changed while it was read');
    }
    return {
      dev: before.dev, ino: before.ino, size, mtimeNs: before.mtimeNs, sha256: createHash('sha256').update(buffer.subarray(0, count)).digest('hex'),
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('sdk_')) throw error;
    throw refusal('sdk_provenance_unavailable', 'the resolved SDK entry cannot be read');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Resolve, inspect, import the same resolved URL, and inspect again.
 * @param {string} specifier
 * @returns {Promise<{api: Record<string, unknown>, provenance: SdkProvenance}>}
 */
async function load(specifier) {
  /** @type {unknown} */
  let resolvedUrl;
  try {
    resolvedUrl = import.meta.resolve(specifier);
  } catch {
    throw refusal('sdk_provenance_unavailable', `${specifier} does not resolve here`);
  }
  if (typeof resolvedUrl !== 'string' || resolvedUrl.length > LOCATION_CHARS) {
    throw refusal('sdk_provenance_unavailable', `${specifier} did not resolve to a bounded URL`);
  }
  /** @type {URL} */
  let url;
  try {
    url = new URL(resolvedUrl);
  } catch {
    throw refusal('sdk_provenance_unavailable', `${specifier} did not resolve to a URL`);
  }
  if (url.protocol !== 'file:' || url.search || url.hash || url.href !== resolvedUrl) {
    throw refusal('sdk_provenance_unavailable', `${specifier} did not resolve to a plain file: URL`);
  }
  const file = fileURLToPath(url);
  if (file.length > LOCATION_CHARS) throw refusal('sdk_provenance_unavailable', `${specifier} resolved to an overlong path`);
  const first = loaded.get(specifier);
  if (first && first.provenance.resolvedUrl !== resolvedUrl) {
    throw refusal('sdk_artifact_changed', `${specifier} now resolves to a different artifact than it first loaded`);
  }
  const before = inspect(file);
  if (first && !sameIdentity(first.identity, before)) throw refusal('sdk_artifact_changed', `${specifier} changed since it first loaded`);
  /** @type {Record<string, unknown>} */
  let api;
  try {
    api = await import(resolvedUrl);
  } catch {
    throw refusal('sdk_unavailable', `${specifier} failed to load`);
  }
  if (!sameIdentity(before, inspect(file))) throw refusal('sdk_artifact_changed', `${specifier} changed while it loaded`);
  if (first) return { api, provenance: first.provenance };
  /** @type {SdkProvenance} */
  const provenance = Object.freeze({ resolvedUrl, path: file, bytes: before.size, sha256: before.sha256 });
  loaded.set(specifier, { identity: before, provenance });
  return { api, provenance };
}

/** The public SDK for the evidence worker, with its provenance. */
export function loadWorkerSdk() {
  return load('@github/copilot-sdk');
}

/** The public extension SDK the provider joins with, with its provenance. */
export function loadExtensionSdk() {
  return load('@github/copilot-sdk/extension');
}

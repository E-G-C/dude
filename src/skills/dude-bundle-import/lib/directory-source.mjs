// @ts-check
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const DIRECTORY_SOURCE_LIMITS = Object.freeze({
  max_depth: 12,
  max_entries: 256,
  max_regular_files: 128,
  max_file_bytes: 1_048_576,
  max_total_bytes: 4_194_304,
  max_metadata_requests: 16,
  max_raw_requests: 128,
  max_metadata_response_bytes: 1_048_576,
  max_raw_response_bytes: 1_048_576,
  max_metadata_total_bytes: 4_194_304,
  max_raw_total_bytes: 4_194_304,
  request_timeout_ms: 30_000,
});

/**
 * @typedef {{
 *   path: string,
 *   entry_type: string,
 *   byte_count: number,
 *   sha256: string | null,
 *   content_class: string,
 * }} CanonicalEntry
 */

/** @param {string} left @param {string} right */
function compareRawPaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** @param {Buffer} bytes */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** @param {Buffer} bytes */
function classifyFileBytes(bytes) {
  return isUtf8(bytes) && !bytes.includes(0) ? 'text' : 'opaque';
}

/** @param {string} segment */
function validatePathSegment(segment) {
  if (segment.length === 0 || segment === '.' || segment === '..') {
    throw new Error(`invalid directory source path segment: ${JSON.stringify(segment)}`);
  }
  if (segment.includes('/') || segment.includes('\\')) {
    throw new Error(`directory source path segment contains a slash or backslash: ${JSON.stringify(segment)}`);
  }
  if (/\p{Cc}/u.test(segment)) {
    throw new Error(`directory source path segment contains a control character: ${JSON.stringify(segment)}`);
  }
}

/** @param {string} relativePath */
function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('directory source path must be a non-empty relative path');
  }
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error(`directory source path must not be absolute: ${JSON.stringify(relativePath)}`);
  }
  if (relativePath.includes('\\')) {
    throw new Error(`directory source path contains a backslash: ${JSON.stringify(relativePath)}`);
  }
  for (const segment of relativePath.split('/')) {
    validatePathSegment(segment);
  }
}

/**
 * @param {readonly CanonicalEntry[]} entries
 * @returns {{entries: CanonicalEntry[], manifest_sha256: string}}
 */
export function createCanonicalEntryManifest(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('directory source entries must be an array');
  }

  const canonicalEntries = entries.map((entry) => {
    if (
      !entry
      || typeof entry !== 'object'
      || (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)
    ) {
      throw new TypeError('directory source entry must be a plain object');
    }
    const requiredKeys = ['path', 'entry_type', 'byte_count', 'sha256', 'content_class'];
    const actualKeys = Reflect.ownKeys(entry);
    if (
      actualKeys.length !== requiredKeys.length
      || !requiredKeys.every((key) => Object.hasOwn(entry, key))
    ) {
      throw new Error(`directory source entry must have exactly these fields: ${requiredKeys.join(', ')}`);
    }

    const canonicalEntry = {
      path: entry.path,
      entry_type: entry.entry_type,
      byte_count: entry.byte_count,
      sha256: entry.sha256,
      content_class: entry.content_class,
    };
    validateRelativePath(canonicalEntry.path);
    if (!['directory', 'regular-file', 'symbolic-link', 'non-regular'].includes(canonicalEntry.entry_type)) {
      throw new Error(`invalid directory source entry type: ${JSON.stringify(canonicalEntry.entry_type)}`);
    }
    if (!Number.isSafeInteger(canonicalEntry.byte_count) || canonicalEntry.byte_count < 0) {
      throw new Error('directory source entry byte_count must be a nonnegative safe integer');
    }
    if (canonicalEntry.entry_type === 'regular-file') {
      if (!['text', 'opaque'].includes(canonicalEntry.content_class)) {
        throw new Error('regular-file directory source entry content_class must be text or opaque');
      }
      if (typeof canonicalEntry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(canonicalEntry.sha256)) {
        throw new Error('regular-file directory source entry sha256 must be 64 lowercase hexadecimal characters');
      }
    } else if (
      canonicalEntry.byte_count !== 0
      || canonicalEntry.sha256 !== null
      || canonicalEntry.content_class !== 'none'
    ) {
      throw new Error('non-file directory source entries must have byte_count 0, sha256 null, and content_class none');
    }
    return canonicalEntry;
  }).sort((left, right) => compareRawPaths(left.path, right.path));

  const exactPaths = new Set();
  const foldedPaths = new Map();
  for (const entry of canonicalEntries) {
    if (exactPaths.has(entry.path)) {
      throw new Error(`duplicate directory source path: ${JSON.stringify(entry.path)}`);
    }
    exactPaths.add(entry.path);

    const foldedPath = entry.path.toLowerCase();
    const collision = foldedPaths.get(foldedPath);
    if (collision !== undefined && collision !== entry.path) {
      throw new Error(
        `case collision between directory source paths ${JSON.stringify(collision)} and ${JSON.stringify(entry.path)}`,
      );
    }
    foldedPaths.set(foldedPath, entry.path);
  }

  const compactJson = `[${canonicalEntries.map((entry) => JSON.stringify({
    byte_count: entry.byte_count,
    content_class: entry.content_class,
    entry_type: entry.entry_type,
    path: entry.path,
    sha256: entry.sha256,
  })).join(',')}]`;

  return {
    entries: canonicalEntries,
    manifest_sha256: sha256(Buffer.from(compactJson)),
  };
}

/** @param {fs.BigIntStats} stat */
function statType(stat) {
  if (stat.isFile()) return 'regular-file';
  if (stat.isDirectory()) return 'directory';
  if (stat.isSymbolicLink()) return 'symbolic-link';
  return 'non-regular';
}

/** @param {fs.BigIntStats} stat */
function snapshotStat(stat) {
  return {
    type: statType(stat),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: stat.mode.toString(),
    link_count: stat.nlink.toString(),
    byte_count: stat.size.toString(),
    modified_ns: stat.mtimeNs.toString(),
    changed_ns: stat.ctimeNs.toString(),
  };
}

/** @param {fs.BigIntStats} stat */
function snapshotIdentity(stat) {
  return {
    type: statType(stat),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
  };
}

/** @param {string} absolutePath @param {string} label */
function lstatForSnapshot(absolutePath, label) {
  try {
    return fs.lstatSync(absolutePath, { bigint: true });
  } catch (error) {
    throw new Error(`directory source ${label} is missing or unavailable: ${absolutePath}`, { cause: error });
  }
}

/** @param {string} absoluteRoot */
function lexicalAncestorPaths(absoluteRoot) {
  const parsed = path.parse(absoluteRoot);
  const ancestors = [parsed.root];
  let current = parsed.root;
  const remainder = absoluteRoot.slice(parsed.root.length);
  for (const segment of remainder.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    ancestors.push(current);
  }
  return ancestors;
}

/** @param {string} absoluteRoot */
function snapshotAncestors(absoluteRoot) {
  const ancestorPaths = lexicalAncestorPaths(absoluteRoot);
  return ancestorPaths.map((ancestorPath, index) => {
    const isRoot = index === ancestorPaths.length - 1;
    const label = isRoot ? 'root directory' : 'ancestor';
    const stat = lstatForSnapshot(ancestorPath, label);
    if (stat.isSymbolicLink()) {
      throw new Error(`directory source ${label} must not be a symbolic link: ${ancestorPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`directory source ${label} must be a directory: ${ancestorPath}`);
    }
    return { path: ancestorPath, stat: snapshotIdentity(stat) };
  });
}

/**
 * @param {string} absoluteDirectory
 * @param {string} relativeDirectory
 * @param {number} [depth]
 * @param {{entryCount: number}} [entryState]
 */
function readDirectoryNames(absoluteDirectory, relativeDirectory, depth, entryState) {
  /** @type {fs.Dir<Buffer>} */
  let directory;
  try {
    directory = fs.opendirSync(absoluteDirectory, { encoding: 'buffer' });
  } catch (error) {
    const label = relativeDirectory || '.';
    throw new Error(`cannot read directory source directory ${JSON.stringify(label)}`, { cause: error });
  }

  const names = [];
  try {
    while (true) {
      let child;
      try {
        child = directory.readSync();
      } catch (error) {
        const label = relativeDirectory || '.';
        throw new Error(`cannot read directory source directory ${JSON.stringify(label)}`, { cause: error });
      }
      if (child === null) break;

      const rawName = child.name;
      if (!isUtf8(rawName)) {
        throw new Error(`directory source contains a non-UTF-8 path segment under ${JSON.stringify(relativeDirectory || '.')}`);
      }
      const name = rawName.toString('utf8');
      validatePathSegment(name);

      if (entryState !== undefined) {
        const childDepth = /** @type {number} */ (depth) + 1;
        if (childDepth > DIRECTORY_SOURCE_LIMITS.max_depth) {
          throw new Error(`directory source exceeds the maximum depth of ${DIRECTORY_SOURCE_LIMITS.max_depth}`);
        }
        entryState.entryCount += 1;
        if (entryState.entryCount > DIRECTORY_SOURCE_LIMITS.max_entries) {
          throw new Error(`directory source exceeds the entry limit of ${DIRECTORY_SOURCE_LIMITS.max_entries}`);
        }
      }

      names.push(name);
    }
  } finally {
    directory.closeSync();
  }

  return names.sort(compareRawPaths);
}

/** @param {fs.BigIntStats} stat @param {string} relativePath @param {number} remainingTotalBytes */
function enforceFileSize(stat, relativePath, remainingTotalBytes) {
  const byteCount = Number(stat.size);
  if (byteCount > DIRECTORY_SOURCE_LIMITS.max_file_bytes) {
    throw new Error(
      `regular file ${JSON.stringify(relativePath)} exceeds the per-file limit of 1048576 bytes (1 MiB)`,
    );
  }
  if (byteCount > remainingTotalBytes) {
    throw new Error('directory source exceeds the aggregate total limit of 4194304 regular-file bytes (4 MiB)');
  }
  return byteCount;
}

/** @param {number} descriptor @param {string} relativePath @param {number} remainingTotalBytes */
function readBoundedDescriptor(descriptor, relativePath, remainingTotalBytes) {
  const chunks = [];
  let byteCount = 0;

  while (true) {
    const remainingBeforeLimit = Math.min(
      DIRECTORY_SOURCE_LIMITS.max_file_bytes - byteCount,
      remainingTotalBytes - byteCount,
    );
    const requestedBytes = Math.min(64 * 1024, Math.max(1, remainingBeforeLimit + 1));
    const chunk = Buffer.allocUnsafe(requestedBytes);
    const bytesRead = fs.readSync(descriptor, chunk, 0, requestedBytes, null);
    if (bytesRead === 0) break;

    byteCount += bytesRead;
    if (byteCount > DIRECTORY_SOURCE_LIMITS.max_file_bytes) {
      throw new Error(
        `regular file ${JSON.stringify(relativePath)} exceeds the per-file limit of 1048576 bytes (1 MiB)`,
      );
    }
    if (byteCount > remainingTotalBytes) {
      throw new Error('directory source exceeds the aggregate total limit of 4194304 regular-file bytes (4 MiB)');
    }
    chunks.push(chunk.subarray(0, bytesRead));
  }

  return Buffer.concat(chunks, byteCount);
}

/**
 * @param {string} absolutePath
 * @param {string} relativePath
 * @param {fs.BigIntStats} initialStat
 * @param {number} remainingTotalBytes
 */
function readRegularFile(absolutePath, relativePath, initialStat, remainingTotalBytes) {
  const initialSnapshot = snapshotStat(initialStat);
  enforceFileSize(initialStat, relativePath, remainingTotalBytes);

  const flags = fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW ?? 0)
    | (fs.constants.O_NONBLOCK ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(absolutePath, flags);
  } catch (error) {
    throw new Error(`regular file changed or could not be opened without following links: ${relativePath}`, { cause: error });
  }

  /** @type {Buffer} */
  let bytes;
  /** @type {ReturnType<typeof snapshotStat>} */
  let finalOpenedSnapshot;
  try {
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    const openedSnapshot = snapshotStat(openedStat);
    if (!openedStat.isFile() || !isDeepStrictEqual(openedSnapshot, initialSnapshot)) {
      throw new Error(`regular file drift observed before reading ${JSON.stringify(relativePath)}`);
    }
    enforceFileSize(openedStat, relativePath, remainingTotalBytes);

    bytes = readBoundedDescriptor(descriptor, relativePath, remainingTotalBytes);

    const finalOpenedStat = fs.fstatSync(descriptor, { bigint: true });
    finalOpenedSnapshot = snapshotStat(finalOpenedStat);
    if (!finalOpenedStat.isFile() || !isDeepStrictEqual(finalOpenedSnapshot, openedSnapshot)) {
      throw new Error(`regular file drift observed while reading ${JSON.stringify(relativePath)}`);
    }
    if (bytes.length !== Number(finalOpenedStat.size)) {
      throw new Error(`regular file size drift observed while reading ${JSON.stringify(relativePath)}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }

  const finalPathStat = lstatForSnapshot(absolutePath, `regular file ${JSON.stringify(relativePath)}`);
  const finalPathSnapshot = snapshotStat(finalPathStat);
  if (!finalPathStat.isFile() || !isDeepStrictEqual(finalPathSnapshot, finalOpenedSnapshot)) {
    throw new Error(`regular file identity drift observed after reading ${JSON.stringify(relativePath)}`);
  }

  return { bytes, stat: finalPathSnapshot };
}

/** @param {string} absolutePath @param {string} relativePath */
function lstatEntry(absolutePath, relativePath) {
  try {
    return fs.lstatSync(absolutePath, { bigint: true });
  } catch (error) {
    throw new Error(`directory source entry changed or disappeared: ${JSON.stringify(relativePath)}`, { cause: error });
  }
}

/**
 * @param {string} absoluteDirectory
 * @param {string} relativeDirectory
 * @param {number} depth
 * @param {ReturnType<typeof snapshotStat>} expectedStat
 * @param {any} state
 */
function walkDirectory(absoluteDirectory, relativeDirectory, depth, expectedStat, state) {
  const initialStat = lstatEntry(absoluteDirectory, relativeDirectory || '.');
  const initialSnapshot = snapshotStat(initialStat);
  if (!initialStat.isDirectory() || !isDeepStrictEqual(initialSnapshot, expectedStat)) {
    throw new Error(`directory source directory drift observed at ${JSON.stringify(relativeDirectory || '.')}`);
  }

  const childNames = readDirectoryNames(absoluteDirectory, relativeDirectory, depth, state);
  state.directories.push({
    path: relativeDirectory,
    stat: initialSnapshot,
    children: childNames,
  });

  for (const childName of childNames) {
    const childDepth = depth + 1;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${childName}` : childName;
    const absolutePath = path.join(absoluteDirectory, childName);
    const childStat = lstatEntry(absolutePath, relativePath);
    const entryType = statType(childStat);

    if (entryType === 'regular-file') {
      state.regularFileCount += 1;
      if (state.regularFileCount > DIRECTORY_SOURCE_LIMITS.max_regular_files) {
        throw new Error(
          `directory source exceeds the regular-file count limit of ${DIRECTORY_SOURCE_LIMITS.max_regular_files}`,
        );
      }

      const metadataBytes = enforceFileSize(
        childStat,
        relativePath,
        DIRECTORY_SOURCE_LIMITS.max_total_bytes - state.metadataBytes,
      );
      state.metadataBytes += metadataBytes;
      const acquired = readRegularFile(
        absolutePath,
        relativePath,
        childStat,
        DIRECTORY_SOURCE_LIMITS.max_total_bytes - state.actualBytes,
      );
      state.actualBytes += acquired.bytes.length;
      const contentHash = sha256(acquired.bytes);
      state.fileBytes.set(relativePath, acquired.bytes);
      state.entries.push({
        path: relativePath,
        entry_type: 'regular-file',
        byte_count: acquired.bytes.length,
        sha256: contentHash,
        content_class: classifyFileBytes(acquired.bytes),
      });
      state.nodes.push({ path: relativePath, stat: acquired.stat, sha256: contentHash });
      continue;
    }

    state.entries.push({
      path: relativePath,
      entry_type: entryType,
      byte_count: 0,
      sha256: null,
      content_class: 'none',
    });

    if (entryType === 'directory') {
      const directorySnapshot = walkDirectory(
        absolutePath,
        relativePath,
        childDepth,
        snapshotStat(childStat),
        state,
      );
      state.nodes.push({ path: relativePath, stat: directorySnapshot, sha256: null });
    } else {
      state.nodes.push({ path: relativePath, stat: snapshotStat(childStat), sha256: null });
    }
  }

  const finalStat = lstatEntry(absoluteDirectory, relativeDirectory || '.');
  const finalSnapshot = snapshotStat(finalStat);
  if (!finalStat.isDirectory() || !isDeepStrictEqual(finalSnapshot, initialSnapshot)) {
    throw new Error(`directory source directory drift observed at ${JSON.stringify(relativeDirectory || '.')}`);
  }
  return finalSnapshot;
}

/** @param {string} absoluteRoot @param {any} snapshot */
function verifySnapshotMetadata(absoluteRoot, snapshot) {
  const entryState = { entryCount: 0 };
  for (const directory of snapshot.directories) {
    const absoluteDirectory = directory.path
      ? path.join(absoluteRoot, ...directory.path.split('/'))
      : absoluteRoot;
    const before = lstatEntry(absoluteDirectory, directory.path || '.');
    if (!before.isDirectory() || !isDeepStrictEqual(snapshotStat(before), directory.stat)) {
      throw new Error(`directory source directory drift observed at ${JSON.stringify(directory.path || '.')}`);
    }
    const depth = directory.path ? directory.path.split('/').length : 0;
    const children = readDirectoryNames(absoluteDirectory, directory.path, depth, entryState);
    if (!isDeepStrictEqual(children, directory.children)) {
      throw new Error(`directory source membership drift observed at ${JSON.stringify(directory.path || '.')}`);
    }
    const after = lstatEntry(absoluteDirectory, directory.path || '.');
    if (!after.isDirectory() || !isDeepStrictEqual(snapshotStat(after), directory.stat)) {
      throw new Error(`directory source directory drift observed at ${JSON.stringify(directory.path || '.')}`);
    }
  }

  for (const node of snapshot.nodes) {
    const absolutePath = path.join(absoluteRoot, ...node.path.split('/'));
    const stat = lstatEntry(absolutePath, node.path);
    if (!isDeepStrictEqual(snapshotStat(stat), node.stat)) {
      throw new Error(`directory source entry drift observed at ${JSON.stringify(node.path)}`);
    }
  }

  const ancestors = snapshotAncestors(absoluteRoot);
  if (!isDeepStrictEqual(ancestors, snapshot.ancestors)) {
    throw new Error('directory source root or ancestor identity drift observed');
  }
  let rootPath;
  try {
    rootPath = fs.realpathSync(absoluteRoot);
  } catch (error) {
    throw new Error('directory source root is missing or unavailable during verification', { cause: error });
  }
  if (rootPath !== snapshot.rootPath) {
    throw new Error('directory source root identity drift observed');
  }
}

/** @param {string} absoluteRoot */
function acquireSnapshot(absoluteRoot) {
  const ancestors = snapshotAncestors(absoluteRoot);
  let rootPath;
  try {
    rootPath = fs.realpathSync(absoluteRoot);
  } catch (error) {
    throw new Error(`directory source root must exist as a directory: ${absoluteRoot}`, { cause: error });
  }

  const rootStat = lstatForSnapshot(absoluteRoot, 'root directory');
  const expectedRootIdentity = ancestors.at(-1)?.stat;
  if (!rootStat.isDirectory() || !isDeepStrictEqual(snapshotIdentity(rootStat), expectedRootIdentity)) {
    throw new Error('directory source root identity drift observed before traversal');
  }

  const state = {
    entries: [],
    directories: [],
    nodes: [],
    fileBytes: new Map(),
    entryCount: 0,
    regularFileCount: 0,
    metadataBytes: 0,
    actualBytes: 0,
  };
  walkDirectory(absoluteRoot, '', 0, snapshotStat(rootStat), state);

  const manifest = createCanonicalEntryManifest(state.entries);
  state.directories.sort((left, right) => compareRawPaths(left.path, right.path));
  state.nodes.sort((left, right) => compareRawPaths(left.path, right.path));
  const comparison = {
    rootPath,
    ancestors,
    directories: state.directories,
    nodes: state.nodes,
    entries: manifest.entries,
    manifest_sha256: manifest.manifest_sha256,
  };
  verifySnapshotMetadata(absoluteRoot, comparison);

  return {
    rootPath,
    entries: manifest.entries,
    manifest_sha256: manifest.manifest_sha256,
    fileBytes: state.fileBytes,
    comparison,
  };
}

/**
 * @param {string} source
 * @returns {Promise<{
 *   source: {provider: 'local-directory', input: string, identity: {root_path: string}},
 *   entries: CanonicalEntry[],
 *   manifest_sha256: string,
 *   getFileBytes(relativePath: string): Promise<Buffer>,
 *   revalidate(): Promise<void>,
 * }>}
 */
export async function analyzeLocalDirectory(source) {
  if (typeof source !== 'string') {
    throw new TypeError('local directory source must be a path string');
  }
  const absoluteRoot = path.resolve(source);
  const acquired = acquireSnapshot(absoluteRoot);
  const baseline = acquired.comparison;
  const entryTypes = new Map(acquired.entries.map((entry) => [entry.path, entry.entry_type]));

  return {
    source: {
      provider: 'local-directory',
      input: source,
      identity: { root_path: acquired.rootPath },
    },
    entries: acquired.entries.map((entry) => ({ ...entry })),
    manifest_sha256: acquired.manifest_sha256,
    async getFileBytes(relativePath) {
      validateRelativePath(relativePath);
      const bytes = acquired.fileBytes.get(relativePath);
      if (bytes !== undefined) return Buffer.from(bytes);
      if (entryTypes.has(relativePath)) {
        throw new Error(`directory source entry is not a regular file: ${JSON.stringify(relativePath)}`);
      }
      throw new Error(`unknown or missing directory source file: ${JSON.stringify(relativePath)}`);
    },
    async revalidate() {
      const current = acquireSnapshot(absoluteRoot);
      if (!isDeepStrictEqual(current.comparison, baseline)) {
        throw new Error('local directory source changed since analysis');
      }
    },
  };
}

const GITHUB_SOURCE_PREFIX = 'https://github.com/';
const GITHUB_API_HEADERS = Object.freeze({
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
});
const GIT_OBJECT_ID = /^[0-9a-f]{40}$/;

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
  );
}

/** @param {unknown} value @param {string} label */
function validateGitObjectId(value, label) {
  if (typeof value !== 'string' || !GIT_OBJECT_ID.test(value)) {
    throw new Error(`invalid ${label} Git SHA-1 object ID`);
  }
  return value;
}

/** @param {string} rawSegment @param {string} label */
function decodeCanonicalUrlSegment(rawSegment, label) {
  if (rawSegment.length === 0) {
    throw new Error(`canonical GitHub tree source has an empty ${label}`);
  }
  let segment;
  try {
    segment = decodeURIComponent(rawSegment);
  } catch (error) {
    throw new Error(`canonical GitHub tree source has an invalid ${label}`, { cause: error });
  }
  if (encodeURIComponent(segment) !== rawSegment) {
    throw new Error(`canonical GitHub tree source has a non-canonical ${label}`);
  }
  validatePathSegment(segment);
  return segment;
}

/** @param {string} ref */
function validateGitRef(ref) {
  const forbidden = '~^:?*[\\';
  const hasForbiddenCharacter = [...ref].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f || forbidden.includes(character);
  });
  if (
    ref === '@'
    || ref.startsWith('.')
    || ref.endsWith('.')
    || ref.includes('..')
    || ref.includes('@{')
    || ref.endsWith('.lock')
    || hasForbiddenCharacter
  ) {
    throw new Error('canonical GitHub tree source has an invalid ref');
  }
}

/** @param {unknown} source */
function parseCanonicalGitHubSource(source) {
  if (typeof source !== 'string') {
    throw new TypeError('GitHub directory source must be a canonical URL string');
  }
  if (!source.startsWith(GITHUB_SOURCE_PREFIX)) {
    throw new Error('GitHub directory source must be an exact canonical HTTPS github.com tree URL');
  }

  const rawSegments = source.slice(GITHUB_SOURCE_PREFIX.length).split('/');
  if (rawSegments.length < 5 || rawSegments[2] !== 'tree') {
    throw new Error('GitHub directory source must be an exact canonical tree URL with a subtree path');
  }
  const owner = decodeCanonicalUrlSegment(rawSegments[0], 'owner');
  const repository = decodeCanonicalUrlSegment(rawSegments[1], 'repository');
  const requestedRef = decodeCanonicalUrlSegment(rawSegments[3], 'ref');
  const subtreeSegments = rawSegments.slice(4)
    .map((segment, index) => decodeCanonicalUrlSegment(segment, `subtree segment ${index + 1}`));

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('canonical GitHub tree source has an invalid owner');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(repository) || /\.git$/i.test(repository)) {
    throw new Error('canonical GitHub tree source has an invalid repository');
  }
  validateGitRef(requestedRef);
  validateRelativePath(subtreeSegments.join('/'));
  if (subtreeSegments.length + 3 > DIRECTORY_SOURCE_LIMITS.max_metadata_requests) {
    throw new Error(
      `GitHub directory source subtree exceeds the ${DIRECTORY_SOURCE_LIMITS.max_metadata_requests}-request metadata limit`,
    );
  }

  return { owner, repository, requestedRef, subtreeSegments };
}

/** @param {readonly string[]} segments */
function encodeUrlPath(segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

/** @param {any} parsed @param {string} suffix */
function githubApiUrl(parsed, suffix) {
  return `https://api.github.com/repos/${encodeUrlPath([parsed.owner, parsed.repository])}${suffix}`;
}

/** @param {ReadableStreamDefaultReader<Uint8Array>} reader @param {AbortSignal} signal */
function readStreamChunk(reader, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * @param {ReadableStream<Uint8Array>|ReadableStreamDefaultReader<Uint8Array>|null} cancellable
 * @param {AbortController} controller
 * @param {Error} error
 * @returns {never}
 */
function abortAndCancelResponse(cancellable, controller, error) {
  controller.abort(error);
  void cancellable?.cancel(error).catch(() => {});
  throw error;
}

/**
 * @param {Response} response
 * @param {'metadata'|'raw'} kind
 * @param {any} counters
 * @param {AbortController} controller
 */
async function readBoundedResponse(response, kind, counters, controller) {
  const responseLimit = kind === 'metadata'
    ? DIRECTORY_SOURCE_LIMITS.max_metadata_response_bytes
    : DIRECTORY_SOURCE_LIMITS.max_raw_response_bytes;
  const totalLimit = kind === 'metadata'
    ? DIRECTORY_SOURCE_LIMITS.max_metadata_total_bytes
    : DIRECTORY_SOURCE_LIMITS.max_raw_total_bytes;
  const totalKey = kind === 'metadata' ? 'metadataBytes' : 'rawBytes';
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(`GitHub ${kind} response has an invalid Content-Length header`),
      );
    }
    const declaredBytes = Number(contentLength);
    if (declaredBytes > responseLimit) {
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(`GitHub ${kind} response body exceeds the 1048576-byte (1 MiB) limit`),
      );
    }
    if (counters[totalKey] + declaredBytes > totalLimit) {
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(`GitHub ${kind} response aggregate exceeds the 4194304-byte (4 MiB) limit`),
      );
    }
  }

  if (response.body === null) {
    abortAndCancelResponse(
      null,
      controller,
      new Error(`GitHub ${kind} response with HTTP 200 has no body`),
    );
  }
  const reader = response.body.getReader();
  const chunks = [];
  let responseBytes = 0;
  while (true) {
    let result;
    try {
      result = await readStreamChunk(reader, controller.signal);
    } catch (error) {
      const readError = error instanceof Error ? error : new Error(String(error));
      abortAndCancelResponse(reader, controller, readError);
    }
    if (result.done) break;
    const chunk = Buffer.from(result.value);
    const nextResponseBytes = responseBytes + chunk.length;
    const nextTotalBytes = counters[totalKey] + chunk.length;
    if (nextResponseBytes > responseLimit || nextTotalBytes > totalLimit) {
      if (nextResponseBytes > responseLimit) {
        const error = new Error(`GitHub ${kind} response body exceeds the 1048576-byte (1 MiB) limit`);
        abortAndCancelResponse(reader, controller, error);
      }
      const error = new Error(`GitHub ${kind} response aggregate exceeds the 4194304-byte (4 MiB) limit`);
      abortAndCancelResponse(reader, controller, error);
    }
    responseBytes = nextResponseBytes;
    counters[totalKey] = nextTotalBytes;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, responseBytes);
}

/** @param {string} url @param {'metadata'|'raw'} kind @param {any} counters */
async function fetchGitHubBytes(url, kind, counters) {
  const requestKey = kind === 'metadata' ? 'metadataRequests' : 'rawRequests';
  const requestLimit = kind === 'metadata'
    ? DIRECTORY_SOURCE_LIMITS.max_metadata_requests
    : DIRECTORY_SOURCE_LIMITS.max_raw_requests;
  counters[requestKey] += 1;
  if (counters[requestKey] > requestLimit) {
    throw new Error(`GitHub ${kind} request limit of ${requestLimit} exceeded`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('GitHub request timed out', 'TimeoutError'));
  }, DIRECTORY_SOURCE_LIMITS.request_timeout_ms);
  try {
    const init = {
      method: 'GET',
      redirect: /** @type {RequestRedirect} */ ('error'),
      signal: controller.signal,
      ...(kind === 'metadata' ? { headers: GITHUB_API_HEADERS } : {}),
    };
    const response = await globalThis.fetch(url, init);
    if (response.status !== 200) {
      const rateLimited = response.status === 429
        || (response.status === 403 && (
          response.headers.get('x-ratelimit-remaining') === '0'
          || response.headers.has('retry-after')
        ));
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(
          `GitHub ${kind} request failed with HTTP ${response.status}${rateLimited ? ' (rate limit)' : ''}`,
        ),
      );
    }
    return await readBoundedResponse(response, kind, counters, controller);
  } catch (error) {
    if (timedOut) {
      throw new Error(`GitHub ${kind} request timed out or was aborted`, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GitHub ${kind} fetch failed: ${message}`, { cause: error });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** @param {string} url @param {any} counters */
async function fetchGitHubJson(url, counters) {
  const bytes = await fetchGitHubBytes(url, 'metadata', counters);
  if (!isUtf8(bytes)) throw new Error('GitHub metadata response is not valid UTF-8 JSON');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('GitHub metadata response is not valid JSON', { cause: error });
  }
}

/** @param {any} parsed @param {any} counters */
async function resolveGitHubCommit(parsed, counters) {
  const value = await fetchGitHubJson(
    githubApiUrl(parsed, `/commits/${encodeURIComponent(parsed.requestedRef)}`),
    counters,
  );
  if (!isPlainObject(value) || !isPlainObject(value.commit) || !isPlainObject(value.commit.tree)) {
    throw new Error('GitHub commit metadata is malformed');
  }
  return {
    commitSha: validateGitObjectId(value.sha, 'commit'),
    rootTreeSha: validateGitObjectId(value.commit.tree.sha, 'commit tree'),
  };
}

/** @param {string} mode @param {string} type */
function gitEntryType(mode, type) {
  if (mode === '040000' && type === 'tree') return 'directory';
  if ((mode === '100644' || mode === '100755') && type === 'blob') return 'regular-file';
  if (mode === '120000' && type === 'blob') return 'symbolic-link';
  if (mode === '160000' && type === 'commit') return 'non-regular';
  throw new Error(`invalid Git tree mode/type pair: ${JSON.stringify(mode)}/${JSON.stringify(type)}`);
}

/** @param {unknown} value @param {string} expectedTreeSha @param {boolean} recursive */
function validateGitTree(value, expectedTreeSha, recursive) {
  if (!isPlainObject(value)) throw new Error('Git tree metadata is malformed');
  const actualTreeSha = validateGitObjectId(value.sha, 'tree');
  if (actualTreeSha !== expectedTreeSha) throw new Error('Git tree response identity does not match the requested tree');
  if (value.truncated !== false) throw new Error('Git tree response is truncated or lacks an exact truncation marker');
  if (!Array.isArray(value.tree)) throw new Error('Git tree response has a malformed tree record list');

  const exactPaths = new Set();
  const foldedPaths = new Map();
  const records = value.tree.map((item) => {
    if (!isPlainObject(item)) throw new Error('Git tree contains a malformed record');
    validateRelativePath(item.path);
    if (!recursive && item.path.includes('/')) {
      throw new Error('nonrecursive Git tree response contains a nested path');
    }
    if (exactPaths.has(item.path)) throw new Error(`duplicate Git tree path: ${JSON.stringify(item.path)}`);
    exactPaths.add(item.path);
    const foldedPath = item.path.toLowerCase();
    const collision = foldedPaths.get(foldedPath);
    if (collision !== undefined && collision !== item.path) {
      throw new Error(`case collision between Git tree paths ${JSON.stringify(collision)} and ${JSON.stringify(item.path)}`);
    }
    foldedPaths.set(foldedPath, item.path);

    if (typeof item.mode !== 'string' || typeof item.type !== 'string') {
      throw new Error('Git tree record has a malformed mode or type');
    }
    const entryType = gitEntryType(item.mode, item.type);
    const objectSha = validateGitObjectId(item.sha, 'tree record');
    if (entryType === 'regular-file' && !Number.isSafeInteger(item.size)) {
      throw new Error('regular-file Git tree record has a missing or invalid size');
    }
    if (Object.hasOwn(item, 'size') && (!Number.isSafeInteger(item.size) || item.size < 0)) {
      throw new Error('Git tree record has an invalid size');
    }
    return {
      path: item.path,
      mode: item.mode,
      type: item.type,
      sha: objectSha,
      size: Object.hasOwn(item, 'size') ? item.size : null,
      entryType,
    };
  }).sort((left, right) => compareRawPaths(left.path, right.path));

  return records;
}

/** @param {any} parsed @param {string} treeSha @param {boolean} recursive @param {any} counters */
async function readGitHubTree(parsed, treeSha, recursive, counters) {
  const suffix = `/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`;
  const value = await fetchGitHubJson(githubApiUrl(parsed, suffix), counters);
  return validateGitTree(value, treeSha, recursive);
}

/** @param {any[]} records */
function validateGitHubInventory(records) {
  if (records.length > DIRECTORY_SOURCE_LIMITS.max_entries) {
    throw new Error(`GitHub directory source exceeds the entry limit of ${DIRECTORY_SOURCE_LIMITS.max_entries}`);
  }
  const byPath = new Map(records.map((record) => [record.path, record]));
  let regularFileCount = 0;
  let totalBytes = 0;
  for (const record of records) {
    const segments = record.path.split('/');
    if (segments.length > DIRECTORY_SOURCE_LIMITS.max_depth) {
      throw new Error(`GitHub directory source exceeds the maximum depth of ${DIRECTORY_SOURCE_LIMITS.max_depth}`);
    }
    for (let index = 1; index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join('/');
      if (byPath.get(parentPath)?.entryType !== 'directory') {
        throw new Error(`Git tree path has a missing or non-directory parent: ${JSON.stringify(record.path)}`);
      }
    }
    if (record.entryType !== 'regular-file') continue;
    regularFileCount += 1;
    if (regularFileCount > DIRECTORY_SOURCE_LIMITS.max_regular_files) {
      throw new Error(
        `GitHub directory source exceeds the regular-file count limit of ${DIRECTORY_SOURCE_LIMITS.max_regular_files}`,
      );
    }
    if (record.size > DIRECTORY_SOURCE_LIMITS.max_file_bytes) {
      throw new Error(
        `regular file ${JSON.stringify(record.path)} exceeds the per-file limit of 1048576 bytes (1 MiB)`,
      );
    }
    totalBytes += record.size;
    if (totalBytes > DIRECTORY_SOURCE_LIMITS.max_total_bytes) {
      throw new Error('GitHub directory source exceeds the aggregate total limit of 4194304 regular-file bytes (4 MiB)');
    }
  }
}

/** @param {Buffer} bytes */
function gitBlobSha1(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** @param {any} parsed @param {{commitSha: string, rootTreeSha: string} | undefined} expectedIdentity */
async function acquireGitHubSnapshot(parsed, expectedIdentity) {
  const counters = {
    metadataRequests: 0,
    rawRequests: 0,
    metadataBytes: 0,
    rawBytes: 0,
  };
  const opening = await resolveGitHubCommit(parsed, counters);
  if (expectedIdentity !== undefined && opening.commitSha !== expectedIdentity.commitSha) {
    throw new Error('GitHub requested ref changed since analysis');
  }
  if (expectedIdentity !== undefined && opening.rootTreeSha !== expectedIdentity.rootTreeSha) {
    throw new Error('GitHub commit tree identity changed since analysis');
  }

  let currentTreeSha = opening.rootTreeSha;
  const subtreeTreeShas = [];
  for (const segment of parsed.subtreeSegments) {
    const records = await readGitHubTree(parsed, currentTreeSha, false, counters);
    const child = records.find((record) => record.path === segment);
    if (child === undefined || child.entryType !== 'directory') {
      throw new Error(`GitHub subtree segment is missing or not a tree: ${JSON.stringify(segment)}`);
    }
    currentTreeSha = child.sha;
    subtreeTreeShas.push(currentTreeSha);
  }

  const records = await readGitHubTree(parsed, currentTreeSha, true, counters);
  validateGitHubInventory(records);
  const fileBytes = new Map();
  const entries = [];
  for (const record of records) {
    if (record.entryType !== 'regular-file') {
      entries.push({
        path: record.path,
        entry_type: record.entryType,
        byte_count: 0,
        sha256: null,
        content_class: 'none',
      });
      continue;
    }

    const rawUrl = `https://raw.githubusercontent.com/${encodeUrlPath([
      parsed.owner,
      parsed.repository,
      opening.commitSha,
      ...parsed.subtreeSegments,
      ...record.path.split('/'),
    ])}`;
    const bytes = await fetchGitHubBytes(rawUrl, 'raw', counters);
    if (bytes.length !== record.size) {
      throw new Error(`raw file size does not match Git tree metadata for ${JSON.stringify(record.path)}`);
    }
    if (gitBlobSha1(bytes) !== record.sha) {
      throw new Error(`raw file Git blob SHA-1 integrity mismatch for ${JSON.stringify(record.path)}`);
    }
    fileBytes.set(record.path, bytes);
    entries.push({
      path: record.path,
      entry_type: 'regular-file',
      byte_count: bytes.length,
      sha256: sha256(bytes),
      content_class: classifyFileBytes(bytes),
    });
  }

  const closing = await resolveGitHubCommit(parsed, counters);
  if (closing.commitSha !== opening.commitSha || closing.rootTreeSha !== opening.rootTreeSha) {
    throw new Error('GitHub requested ref moved during directory analysis');
  }

  const manifest = createCanonicalEntryManifest(entries);
  return {
    resolvedCommit: opening.commitSha,
    rootTreeSha: opening.rootTreeSha,
    selectedTreeSha: currentTreeSha,
    fileBytes,
    entries: manifest.entries,
    manifestSha256: manifest.manifest_sha256,
    comparison: {
      resolvedCommit: opening.commitSha,
      rootTreeSha: opening.rootTreeSha,
      subtreeTreeShas,
      selectedTreeSha: currentTreeSha,
      records,
      entries: manifest.entries,
      manifestSha256: manifest.manifest_sha256,
    },
  };
}

/**
 * @param {string} source
 * @returns {Promise<{
 *   source: {provider: 'github-tree', input: string, identity: {
 *     owner: string, repository: string, requested_ref: string,
 *     resolved_commit: string, subtree: string, tree_sha: string,
 *   }},
 *   entries: CanonicalEntry[],
 *   manifest_sha256: string,
 *   getFileBytes(relativePath: string): Promise<Buffer>,
 *   revalidate(): Promise<void>,
 * }>}
 */
export async function analyzeGitHubDirectory(source) {
  const parsed = parseCanonicalGitHubSource(source);
  const acquired = await acquireGitHubSnapshot(parsed, undefined);
  const baseline = acquired.comparison;
  const entryTypes = new Map(acquired.entries.map((entry) => [entry.path, entry.entry_type]));

  return {
    source: {
      provider: 'github-tree',
      input: source,
      identity: {
        owner: parsed.owner,
        repository: parsed.repository,
        requested_ref: parsed.requestedRef,
        resolved_commit: acquired.resolvedCommit,
        subtree: parsed.subtreeSegments.join('/'),
        tree_sha: acquired.selectedTreeSha,
      },
    },
    entries: acquired.entries.map((entry) => ({ ...entry })),
    manifest_sha256: acquired.manifestSha256,
    async getFileBytes(relativePath) {
      validateRelativePath(relativePath);
      const bytes = acquired.fileBytes.get(relativePath);
      if (bytes !== undefined) return Buffer.from(bytes);
      if (entryTypes.has(relativePath)) {
        throw new Error(`directory source entry is not a regular file: ${JSON.stringify(relativePath)}`);
      }
      throw new Error(`unknown or missing directory source file: ${JSON.stringify(relativePath)}`);
    },
    async revalidate() {
      const current = await acquireGitHubSnapshot(parsed, {
        commitSha: acquired.resolvedCommit,
        rootTreeSha: acquired.rootTreeSha,
      });
      if (!isDeepStrictEqual(current.comparison, baseline)) {
        throw new Error('GitHub directory source changed since analysis');
      }
    },
  };
}

/** @param {string} source */
export async function analyzeDirectorySource(source) {
  if (typeof source !== 'string') {
    throw new TypeError('directory source must be a path or canonical GitHub tree URL string');
  }
  if (source.startsWith(GITHUB_SOURCE_PREFIX)) return analyzeGitHubDirectory(source);
  const windowsDrivePath = /^[A-Za-z]:[\\/]/.test(source);
  const uriShaped = source.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(source);
  if (!windowsDrivePath && uriShaped) {
    throw new Error('URI-shaped directory source is not an exact canonical GitHub tree URL');
  }
  return analyzeLocalDirectory(source);
}

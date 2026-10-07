// @ts-check
/**
 * The project's added pack sources: the one closed `.dude/metadata/pack-sources.md`
 * document, source identity and opaque keys, the checks that run before a source
 * is added, and the one-file writer. Dude Canvas and dude-lint share it, so both
 * judge the same document the same way.
 *
 * An added source is a public GitHub repository at a ref, or a local folder that
 * contains `library/packs`. The two built-in sources (the workspace library and
 * the bundle upstream) are derived on every read and never saved. The document
 * holds nothing else: no keys, counts, aliases, timestamps, versions or priorities.
 *
 * Nothing here runs Git or contacts a remote repository. Parsing, writing and
 * lint's check never resolve a source folder, but describing or validating a local
 * source resolves its real path synchronously, so a UNC path (`\\host\share`) can
 * block on an unreachable share. A caller that has a time bound must account for it.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_PATHS, resolveMutationPath } from './workspace-paths.mjs';

export const PACK_SOURCES_PATH = `${WORKSPACE_PATHS.METADATA_DIR}/pack-sources.md`;
/** The most sources a project can add. The built-in sources do not count. */
export const MAX_ADDED_SOURCES = 8;

const ABSENT = 'absent';
const DEFAULT_REF = 'main';
const MAX_DOCUMENT_BYTES = 65_536;
const MAX_LOCATION_BYTES = 2_048;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
// A lone letter before the colon is a Windows drive, so only longer schemes are URLs.
const URL_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]+:/;
const SCP_ADDRESS_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:/;
const JSON_BLOCK_RE = /```json\s*\r?\n([\s\S]*?)\r?\n```/g;
const DOCUMENT_HEAD = `# Pack Sources

This file lists the extra pack sources saved with this project, so a team can
share them. Dude Canvas regenerates the whole file when you add or remove a
source, so text outside the JSON block is not kept. The bundle's built-in
sources are never saved here. Keep exactly one JSON block that holds only the
\`sources\` list.

`;

/** @typedef {{ type: 'remote', repository: string, ref: string }} RemoteSource */
/** @typedef {{ type: 'local', location: string }} LocalSource */
/** @typedef {RemoteSource | LocalSource} PackSource The only two shapes a saved entry can take. */
/**
 * A source with its derived identity. `root` is the real folder of a local source,
 * or null while it cannot be resolved. `builtin` is set only on the two derived
 * sources, which are never saved.
 * @typedef {PackSource & { identity: string, key: string, root?: string | null, builtin?: 'local-library' | 'bundle-upstream' }} DescribedSource
 */
/**
 * @typedef {'invalid_location' | 'credentials' | 'invalid_ref' | 'ref_not_applicable' | 'local_missing'
 *   | 'local_layout' | 'bare_packs_folder' | 'own_library' | 'duplicate' | 'limit' | 'stale'
 *   | 'unavailable'} PackSourceErrorCode
 */

/**
 * Every refusal this module makes. Messages never repeat rejected input, so a
 * credential typed into a URL cannot reach a log or the UI. The one value a
 * message may name is a repository rebuilt from validated parts.
 */
export class PackSourceError extends Error {
  /** @param {PackSourceErrorCode} code @param {string} message @param {string | null} [key] the configured source a duplicate repeats */
  constructor(code, message, key = null) {
    super(message);
    this.name = 'PackSourceError';
    this.code = code;
    this.key = key;
  }
}

/** @param {string} detail */
function unavailable(detail) {
  return new PackSourceError('unavailable', `${path.posix.basename(PACK_SOURCES_PATH)} ${detail}`);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

/** @param {string | Buffer} bytes */
function revisionOf(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

/* ---------------------------------------------------------------- locations */

/**
 * One trimmed line of text that fits the bound. Returns the problem, or null.
 * @param {unknown} value
 * @returns {string | null}
 */
function locationProblem(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Enter a GitHub repository URL or a local folder.';
  if (value !== value.trim() || /[\p{Cc}\u2028\u2029]/u.test(value) || Buffer.from(value, 'utf8').toString('utf8') !== value) {
    return 'The location must be one line, without surrounding spaces or control characters.';
  }
  return Buffer.byteLength(value, 'utf8') > MAX_LOCATION_BYTES
    ? `The location is longer than ${MAX_LOCATION_BYTES} UTF-8 bytes.`
    : null;
}

/**
 * Only a public `https://github.com/<owner>/<repo>` repository. The raw text is
 * judged before anything is parsed, because URL parsers forgive what Git or a
 * person would read differently: `user@` is credentials, and a default `:443` is
 * dropped. The result is rebuilt from the validated owner and repository, so no
 * parser's leniency can reach the value that is saved or handed to Compose.
 * A trailing `/` and `.git` are the only forms normalized away; the identity
 * ignores letter case.
 * @param {string} location
 * @returns {{ repository: string, identity: string } | { code: PackSourceErrorCode, message: string }}
 */
function readGitHubRepository(location) {
  /** @param {PackSourceErrorCode} code @param {string} message */
  const refuse = (code, message) => ({ code, message });
  if (SCP_ADDRESS_RE.test(location)) {
    return refuse('invalid_location', 'SSH addresses are not supported. Use an https://github.com/<owner>/<repo> URL.');
  }
  if (!/^https:/i.test(location)) {
    return refuse('invalid_location', 'Use an https://github.com/<owner>/<repo> URL. Other transports are not supported.');
  }
  const match = /^https:\/\/([^/?#\\]*)(.*)$/i.exec(location);
  if (!match) return refuse('invalid_location', 'Enter the complete https:// URL.');
  const [, authority, rest] = match;
  if (authority.includes('@')) {
    return refuse('credentials', 'Remove the user name or password from the URL. Canvas never sends credentials.');
  }
  if (authority.includes(':')) return refuse('invalid_location', 'Remove the port number from the URL.');
  if (authority !== 'github.com') {
    return refuse('invalid_location', 'Use a github.com repository URL. Other hosts are not supported.');
  }
  if (/\\|%2f|%5c/i.test(rest)) {
    return refuse('invalid_location', 'Remove backslashes and encoded slashes (%2F or %5C) from the URL.');
  }
  if (/[?#]/.test(rest)) return refuse('invalid_location', 'Remove the query or fragment from the URL.');
  const parts = rest.startsWith('/') ? rest.slice(1).replace(/\/$/, '').split('/') : [];
  const addressOnly = 'Use the repository address only: https://github.com/<owner>/<repo>. A branch, file, or folder is not part of it.';
  if (parts.length !== 2) return refuse('invalid_location', addressOnly);
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || /^\.+$/.test(repo) || /\.git$/i.test(repo)) {
    return refuse('invalid_location', addressOnly);
  }
  return {
    repository: `https://github.com/${owner}/${repo}`,
    identity: `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
  };
}

/**
 * @param {unknown} ref
 * @returns {string | null} the problem, or null
 */
function refProblem(ref) {
  return typeof ref === 'string' && REF_RE.test(ref) && !ref.includes('..')
    ? null
    : 'A ref has 1-128 letters, digits, periods, underscores, slashes, or hyphens, starts with a letter or digit, and has no "..".';
}

/** @param {string} location */
function isUrlShaped(location) {
  return URL_SCHEME_RE.test(location) || SCP_ADDRESS_RE.test(location);
}

/* ----------------------------------------------------------------- document */

/**
 * @param {unknown} raw
 * @param {string} label
 * @returns {{ entry: PackSource, identity: string }}
 */
function readEntry(raw, label) {
  if (!isObject(raw)) throw unavailable(`${label} must be an object`);
  if (raw.type === 'remote') {
    if (!hasExactKeys(raw, ['type', 'repository', 'ref'])) throw unavailable(`${label} has unsupported or missing fields`);
    const { repository, ref } = raw;
    const read = typeof repository === 'string' ? readGitHubRepository(repository) : null;
    if (!read || 'code' in read) throw unavailable(`${label}.repository must be a public https://github.com/<owner>/<repo> repository`);
    if (read.repository !== repository) throw unavailable(`${label}.repository must be written ${read.repository}`);
    if (refProblem(ref)) throw unavailable(`${label}.ref is not a valid ref`);
    return { entry: { type: 'remote', repository: read.repository, ref: /** @type {string} */ (ref) }, identity: read.identity };
  }
  if (raw.type === 'local') {
    if (!hasExactKeys(raw, ['type', 'location'])) throw unavailable(`${label} has unsupported or missing fields`);
    const { location } = raw;
    if (locationProblem(location) || isUrlShaped(/** @type {string} */ (location))) {
      throw unavailable(`${label}.location must be one trimmed line of at most ${MAX_LOCATION_BYTES} bytes that is a folder path, not a URL`);
    }
    // Spelled differently, the same folder is only caught once it can be resolved.
    const spelling = /** @type {string} */ (location).replace(/[\\/]+$/, '');
    return { entry: { type: 'local', location: /** @type {string} */ (location) }, identity: `local:${spelling}` };
  }
  throw unavailable(`${label}.type must be "remote" or "local"`);
}

/**
 * The same checks for what is parsed and what is serialized, so the document can
 * never hold an entry that this module would refuse to write.
 * @param {unknown} value
 * @returns {PackSource[]}
 */
function readEntries(value) {
  if (!Array.isArray(value)) throw unavailable('sources must be a list');
  if (value.length > MAX_ADDED_SOURCES) {
    throw unavailable(`lists ${value.length} sources; at most ${MAX_ADDED_SOURCES} can be added`);
  }
  /** @type {Map<string, number>} */
  const seen = new Map();
  return value.map((raw, index) => {
    const { entry, identity } = readEntry(raw, `sources[${index}]`);
    const first = seen.get(identity);
    if (first !== undefined) throw unavailable(`sources[${index}] repeats sources[${first}]`);
    seen.set(identity, index);
    return entry;
  });
}

/**
 * Parse the one fenced JSON block. Anything else is unavailable, never an empty
 * list: more or fewer than one block, bad JSON, a root other than `sources`, an
 * unknown field, an invalid or repeated entry, more than eight entries, or a
 * document over its size limit.
 * @param {string | Buffer} content
 * @returns {PackSource[]}
 */
export function parsePackSourcesDocument(content) {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  if (bytes.length > MAX_DOCUMENT_BYTES) throw unavailable(`is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw unavailable('is not valid UTF-8');
  }
  const blocks = [...text.matchAll(JSON_BLOCK_RE)];
  if (blocks.length !== 1) throw unavailable(`must contain exactly one fenced JSON block (found ${blocks.length})`);
  let payload;
  try {
    payload = JSON.parse(blocks[0][1]);
  } catch {
    throw unavailable('has malformed JSON');
  }
  if (!isObject(payload) || !hasExactKeys(payload, ['sources'])) throw unavailable('JSON must contain only sources');
  return readEntries(payload.sources);
}

/**
 * The canonical document for a list of added sources. It refuses what the parser
 * would refuse, including fields beyond the two entry shapes.
 * @param {PackSource[]} sources
 * @returns {string}
 */
export function serializePackSourcesDocument(sources) {
  return `${DOCUMENT_HEAD}\`\`\`json\n${JSON.stringify({ sources: readEntries(sources) }, null, 2)}\n\`\`\`\n`;
}

/* ------------------------------------------------------------ read and write */

/**
 * @param {string} file
 * @returns {Buffer | null} null when the file is over the size limit
 */
function readBounded(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    return length > MAX_DOCUMENT_BYTES ? null : buffer.subarray(0, length);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The raw bytes behind a revision. A missing file is `absent`, not an error.
 * @param {string} file an absolute path already checked by `resolveMutationPath`
 * @returns {{ bytes: Buffer | null, revision: string }}
 */
function readPreimage(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return { bytes: null, revision: ABSENT };
    throw unavailable('could not be read');
  }
  if (!stat.isFile()) throw unavailable('must be a regular file');
  let bytes;
  try {
    bytes = readBounded(file);
  } catch {
    throw unavailable('could not be read');
  }
  if (!bytes) throw unavailable(`is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  return { bytes, revision: revisionOf(bytes) };
}

/**
 * Read the project's saved sources. A missing file is an empty list with
 * revision `absent`; the revision of an existing file is the SHA-256 of its raw
 * bytes, surrounding Markdown included. A file that cannot be trusted is
 * `ok: false`, which callers must not treat as an empty list.
 * @param {string} root
 * @returns {{ ok: true, sources: PackSource[], revision: string } | { ok: false, error: string }}
 */
export function readPackSources(root) {
  try {
    const { bytes, revision } = readPreimage(resolveMutationPath(root, PACK_SOURCES_PATH));
    return { ok: true, sources: bytes ? parsePackSourcesDocument(bytes) : [], revision };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The saved sources could not be read.' };
  }
}

/**
 * Replace the saved sources, only if the file is still exactly the revision the
 * caller read (`absent` to create it). This is the one place that writes the
 * sources file, and it is synchronous from the final comparison through the swap,
 * so writers in this process cannot interleave. A stale revision is refused,
 * never merged or retried. Like the install profile, the write goes to a sibling
 * temporary file and is swapped in with a backup; a caught failure leaves or
 * restores the previous bytes. That is not crash recovery, and it does not stop
 * another program from editing the file at the same moment.
 * @param {string} root
 * @param {PackSource[]} sources
 * @param {string} expectedRevision `absent` or `sha256:<hex>` from `readPackSources`
 * @returns {{ revision: string }}
 */
export function writePackSources(root, sources, expectedRevision) {
  const body = serializePackSourcesDocument(sources);
  const target = resolveMutationPath(root, PACK_SOURCES_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const nonce = `${process.pid}-${crypto.randomUUID()}`;
  const temporary = `${target}.tmp-${nonce}`;
  const backup = `${target}.backup-${nonce}`;
  try {
    fs.writeFileSync(temporary, body);
    const current = readPreimage(target);
    if (current.revision !== expectedRevision) {
      throw new PackSourceError('stale', 'The saved sources changed after they were read.');
    }
    // An unreadable list is reported, never silently reset.
    if (current.bytes) parsePackSourcesDocument(current.bytes);
    if (current.bytes) fs.renameSync(target, backup);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      if (current.bytes) {
        try {
          fs.renameSync(backup, target);
        } catch (restoreError) {
          throw new Error(
            `${PACK_SOURCES_PATH} could not be replaced or restored; its previous bytes remain in ${path.basename(backup)}`,
            { cause: restoreError },
          );
        }
      }
      throw error;
    }
    // The new bytes are already in place, so a backup that will not delete is only residue.
    if (current.bytes) {
      try {
        fs.rmSync(backup, { force: true });
      } catch { /* residue only */ }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { revision: revisionOf(Buffer.from(body, 'utf8')) };
}

/* ------------------------------------------------------- identity and matching */

/**
 * Folders compare by real path, and case-insensitively on Windows.
 * @param {string} folder
 */
function folderIdentity(folder) {
  const resolved = path.resolve(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** @param {string} folder @returns {string | null} the real path of an existing folder */
function realFolder(folder) {
  try {
    const real = fs.realpathSync(folder);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/** @param {string} identity */
function sourceKey(identity) {
  return `src_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

/**
 * A repository's identity in a profile record or manifest. Public GitHub forms
 * ignore case, `.git` and a trailing slash; any other value is its exact text.
 * @param {string} repository
 */
function repositoryIdentity(repository) {
  const read = readGitHubRepository(repository);
  return 'code' in read ? `url:${repository}` : read.identity;
}

/**
 * @param {PackSource} entry
 * @param {string} identity
 * @param {string | null} [root]
 * @returns {DescribedSource}
 */
function describe(entry, identity, root) {
  /** @type {DescribedSource} */
  const described = { ...entry, identity, key: sourceKey(identity) };
  if (root !== undefined) described.root = root;
  return described;
}

/**
 * The two derived sources. The workspace library exists only while
 * `library/packs` does, and is identified by that real folder, not by the folder
 * that contains it. The bundle upstream is the manifest's `source_repo` and
 * `source_ref`, as read by Compose's `readManifestSource`.
 * @param {{ root: string, upstream: { source_repo: string, source_ref?: string } | null }} input
 * @returns {DescribedSource[]}
 */
export function describeBuiltinSources({ root, upstream }) {
  /** @type {DescribedSource[]} */
  const builtins = [];
  const library = realFolder(path.join(root, 'library', 'packs'));
  if (library) {
    builtins.push({
      builtin: 'local-library',
      ...describe({ type: 'local', location: 'library/packs' }, `library:${folderIdentity(library)}`, library),
    });
  }
  if (upstream && typeof upstream.source_repo === 'string' && upstream.source_repo) {
    builtins.push({
      builtin: 'bundle-upstream',
      ...describe(
        { type: 'remote', repository: upstream.source_repo, ref: upstream.source_ref || DEFAULT_REF },
        repositoryIdentity(upstream.source_repo),
      ),
    });
  }
  return builtins;
}

/**
 * @param {string} root
 * @param {RemoteSource | LocalSource} entry
 * @returns {DescribedSource}
 */
function describeEntry(root, entry) {
  if (entry.type === 'remote') {
    return describe(entry, repositoryIdentity(entry.repository));
  }
  // A relative location is relative to the workspace. A folder that cannot be
  // resolved keeps a key from its spelling, so the saved entry is never dropped.
  const resolved = path.resolve(root, entry.location);
  const real = realFolder(resolved);
  return describe(entry, `local:${folderIdentity(real ?? resolved)}`, real);
}

/**
 * Identity and opaque key for each saved source. A key is a short hash of the
 * normalized repository, or of the real folder, so it ignores the ref and the
 * display name. Two sources, or a source and a built-in, that share an identity
 * make the list `ok: false`: rows are selected by key, so they must be distinct.
 * @param {{ root: string, sources: PackSource[], builtins: DescribedSource[] }} input
 * @returns {{ ok: true, sources: DescribedSource[] } | { ok: false, error: string }}
 */
export function describePackSources({ root, sources, builtins }) {
  const taken = new Set(builtins.map((builtin) => builtin.key));
  /** @type {DescribedSource[]} */
  const described = [];
  for (const [index, entry] of sources.entries()) {
    const source = describeEntry(root, entry);
    if (taken.has(source.key)) {
      return { ok: false, error: `${path.posix.basename(PACK_SOURCES_PATH)} sources[${index}] repeats another source` };
    }
    taken.add(source.key);
    described.push(source);
  }
  return { ok: true, sources: described };
}

/**
 * Does a profile's recorded install source come from this source? A GitHub
 * source matches the same repository at any ref. A local source matches its real
 * folder: the library's `library/packs`, or an added source's containing root,
 * which is what Compose records for each.
 * @param {DescribedSource} source
 * @param {unknown} recorded `installed.<name>.source` from the profile
 * @returns {boolean}
 */
export function matchesRecordedSource(source, recorded) {
  if (!isObject(recorded)) return false;
  if (source.type === 'remote') {
    return recorded.type === 'remote' && typeof recorded.repository === 'string'
      && repositoryIdentity(recorded.repository) === source.identity;
  }
  return recorded.type === 'local' && typeof recorded.location === 'string'
    && path.isAbsolute(recorded.location) && Boolean(source.root)
    && folderIdentity(recorded.location) === folderIdentity(/** @type {string} */ (source.root));
}

/* --------------------------------------------------------------- adding one */

/**
 * @param {string} root
 * @param {string} location one valid line
 * @param {DescribedSource[]} builtins
 * @returns {DescribedSource}
 */
function describeNewLocalSource(root, location, builtins) {
  const real = realFolder(path.resolve(root, location));
  if (!real) throw new PackSourceError('local_missing', 'The location is not an existing folder.');
  let catalog;
  try {
    catalog = resolveMutationPath(real, 'library/packs');
  } catch {
    throw new PackSourceError('local_layout', 'The source\'s library/packs must be a real folder, not a link.');
  }
  const realCatalog = realFolder(catalog);
  if (!realCatalog) {
    const bare = path.basename(real).toLowerCase() === 'packs' && path.basename(path.dirname(real)).toLowerCase() === 'library';
    throw bare
      ? new PackSourceError('bare_packs_folder', 'Choose the folder that contains library/packs.')
      : new PackSourceError('local_layout', 'The folder has no library/packs. A source must be a folder that contains library/packs.');
  }
  const own = builtins.find((builtin) => builtin.builtin === 'local-library'
    && folderIdentity(/** @type {string} */ (builtin.root)) === folderIdentity(realCatalog));
  if (own) throw new PackSourceError('own_library', 'This is the workspace\'s own library, which is already a source.');
  return describe({ type: 'local', location }, `local:${folderIdentity(real)}`, real);
}

/**
 * Check one source before anything is read from it or saved: the limit, the
 * location and ref, the folder layout for a local source, and whether its
 * identity repeats a saved or built-in source (a different ref is still the same
 * source). Nothing is fetched, so reachability and pack metadata remain the
 * caller's candidate read. A remote ref defaults to `main`; a local source has
 * none, and a supplied one is refused.
 * @param {{ root: string, sources: PackSource[], builtins: DescribedSource[], location: unknown, ref?: unknown }} input
 * @returns {{ entry: PackSource, source: DescribedSource }}
 * @throws {PackSourceError}
 */
export function validateNewSource({ root, sources, builtins, location, ref }) {
  if (sources.length >= MAX_ADDED_SOURCES) {
    throw new PackSourceError('limit', `At most ${MAX_ADDED_SOURCES} sources can be added to a project.`);
  }
  const problem = locationProblem(location);
  if (problem) throw new PackSourceError('invalid_location', problem);
  const text = /** @type {string} */ (location);
  const omitted = ref === undefined || ref === null || ref === '';
  /** @type {PackSource} */
  let entry;
  /** @type {DescribedSource} */
  let source;
  if (isUrlShaped(text)) {
    const read = readGitHubRepository(text);
    if ('code' in read) throw new PackSourceError(read.code, read.message);
    const refText = omitted ? DEFAULT_REF : ref;
    const refIssue = refProblem(refText);
    if (refIssue) throw new PackSourceError('invalid_ref', refIssue);
    entry = { type: 'remote', repository: read.repository, ref: /** @type {string} */ (refText) };
    source = describe(entry, read.identity);
  } else {
    if (!omitted) throw new PackSourceError('ref_not_applicable', 'A local folder has no ref.');
    source = describeNewLocalSource(root, text, builtins);
    entry = { type: 'local', location: text };
  }
  const saved = describePackSources({ root, sources, builtins });
  if (!saved.ok) throw new PackSourceError('unavailable', saved.error);
  const repeated = [...builtins, ...saved.sources].find((existing) => existing.key === source.key);
  if (repeated) throw new PackSourceError('duplicate', 'This source is already configured.', repeated.key);
  return { entry, source };
}

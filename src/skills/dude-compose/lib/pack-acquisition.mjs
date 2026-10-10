// @ts-check
/**
 * Remote pack-catalog acquisition for Compose. A remote source is either a public
 * GitHub repository, read over anonymous HTTPS, or another Git remote, cloned
 * whole. Local folders never reach this module: Compose reads them in place.
 *
 * GitHub. One commit is resolved before any content is read; every tree is then
 * addressed by its object ID and every file by that commit. Discovery reads the
 * nonrecursive root, `library`, `packs` and direct pack trees and downloads only
 * each direct `pack.md`. A selected pack reads one recursive tree for
 * `library/packs/<name>` and downloads that subtree's regular files. Each file is
 * checked against its tree size and Git blob ID before it is written. A mutable
 * selector (a branch, tag or `latest`) is resolved again before the material is
 * returned, and a different answer is refused as ref drift. This path never runs
 * Git: a GitHub source is not cloned, not even after a failure, and its SSH
 * spellings are read over HTTPS too. Requests carry no credentials, so a private
 * repository fails rather than being reached through Git's sign-in.
 *
 * Other hosts. The repository is cloned whole, as before: a shallow clone of the
 * ref, else a full clone and checkout, and `latest` selects the highest stable
 * `vX.Y.Z` tag that `git ls-remote` lists. Git runs synchronously within one
 * 60-second deadline and 1 MiB of captured output for the whole acquisition, so
 * this path belongs only in a process its owner can stop as a whole: the Canvas
 * catalog helper or a foreground Compose or upgrade command, never an interactive
 * event loop. `spawnSync` is called through this module's live import, so the
 * catalog helper's stop gate also holds a fallback clone. A cancellation between
 * the shallow attempt and the fallback ends the acquisition before the fallback.
 * When the deadline or output bound stops Git, a descendant may still be writing,
 * so that material is kept and reported instead of removed.
 *
 * Each acquisition owns one new temporary root under `os.tmpdir()` until the
 * caller awaits `dispose()`. A failed acquisition removes its root before it
 * rejects, except in the kept case above.
 *
 * Dependency-free ESM (node:* only). Targets Node >= 20.
 */
import fs from 'node:fs';
import { isIP } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  GITHUB_API_HEADERS,
  createReadBudget,
  fetchGitHubBytes,
  fetchGitHubJson,
  gitBlobSha1,
  validateGitObjectId,
  validateGitTree,
} from '../../dude-engine/lib/github-content.mjs';
import { PACK_NAME_RE, normalizeGitObjectId } from '../../dude-engine/lib/profile.mjs';
import { RELEASE_CHANNEL, pickLatestReleaseTag } from '../../dude-engine/lib/release-channel.mjs';

const KIB = 1_024;
const MIB = 1_048_576;

// Chosen safety bounds. They leave headroom over the current catalog; exceeding
// one fails the acquisition without truncation, fallback or workspace change.
// The request budgets cover the largest walk the other bounds admit, so those
// bounds, checked before anything is scheduled, also reserve the requests.
const CATALOG_LIMITS = Object.freeze({
  label: 'catalog',
  totalMs: 30_000,
  requestTimeoutMs: 15_000,
  metadataRequests: 176,
  rawRequests: 128,
  rawResponseBytes: 64 * KIB,
  rawTotalBytes: 1 * MIB,
  directories: 128,
});
const PACK_LIMITS = Object.freeze({
  label: 'pack',
  totalMs: 120_000,
  requestTimeoutMs: 30_000,
  metadataRequests: 64,
  rawRequests: 512,
  rawResponseBytes: 8 * MIB,
  rawTotalBytes: 64 * MIB,
  entries: 1_024,
  regularFiles: 512,
  depth: 16,
});
const METADATA_RESPONSE_BYTES = 2 * MIB;
const METADATA_TOTAL_BYTES = 8 * MIB;
const MAX_IN_FLIGHT = 4;
const TAGS_PER_PAGE = 100;
const MAX_TAG_PAGES = 20;
const GIT_DEADLINE_MS = 60_000;
const GIT_OUTPUT_BYTES = 1 * MIB;
const ROOT_PREFIX = 'dude-pack-';

const GITHUB_COMMIT_SHA_HEADERS = Object.freeze({
  accept: 'application/vnd.github.sha',
  'x-github-api-version': '2022-11-28',
});
const FULL_COMMIT_RE = /^[0-9a-f]{40}$/i;
// The repository grammar Canvas's saved sources use (pack-sources.mjs).
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPOSITORY_RE = /^[A-Za-z0-9._-]{1,100}$/;
const URL_RE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#\\]*)(.*)$/s;
// Git reads `[user@]host:path` as SSH when no slash precedes the first colon.
const SCP_RE = /^(?:([^@/\\:]+)@)?([^@/\\:]+):(.*)$/s;
// Git hands `<transport>::<address>` to the remote helper git-remote-<transport>, even an unnamed one.
const REMOTE_HELPER_RE = /^(?:[A-Za-z0-9][A-Za-z0-9+.-]*)?::/;
// A bracketed host: a URL's, before any port, or an SSH location's leading `[host]` or `user@[host]`.
const URL_BRACKETED_HOST_RE = /^\[([^\]]*)\](?::\d*)?$/;
const SCP_BRACKETED_HOST_RE = /^(?:[^@/\\:[\]]+@)?\[([^\]]*)\]:/;
const SSH_SCHEMES = new Set(['ssh', 'git+ssh', 'ssh+git']);
const WINDOWS_RESERVED_NAME_RE = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\..*)?$/i;

const UNSUPPORTED_GITHUB_ADDRESS = 'A GitHub pack source must be https://github.com/<owner>/<repo>, '
  + 'ssh://git@github.com/<owner>/<repo> or git@github.com:<owner>/<repo>; other GitHub address forms are not read.';
const CREDENTIAL_ADDRESS = 'A pack source address must not contain a user name or password; '
  + 'Dude never sends credentials from a source address.';
const AMBIGUOUS_URL_ADDRESS = 'A remote pack source URL must name its host directly after "://", with no backslash before its path; '
  + 'Git can read other spellings as a different host.';
const REMOTE_HELPER_ADDRESS = 'A remote pack source must not use Git\'s "<transport>::<address>" remote-helper form; '
  + 'Dude does not hand a source to a Git remote helper.';
const BRACKETED_HOST_ADDRESS = 'A remote pack source may enclose only an IPv6 address in brackets, as in [2001:db8::1]; '
  + 'Git would connect to any other bracketed name as the host.';

/** A failure whose message already names its source, so it is reported unchanged. */
class ReportedError extends Error {}

/** Failures whose temporary material must be kept because a process may still use it. */
const keptFailures = new WeakSet();

/**
 * @typedef {{ type: 'remote', repository: string, requested_ref: string, resolved_commit: string }} RemoteSourceIdentity
 * @typedef {{ kind: 'github', owner: string, repository: string } | { kind: 'git' }} RemoteKind
 * @typedef {import('../../dude-engine/lib/github-content.mjs').GitTreeRecord} GitTreeRecord
 * @typedef {import('../../dude-engine/lib/github-content.mjs').ReadBudget} ReadBudget
 */

/** @param {number} byteCount */
function byteLimit(byteCount) {
  return byteCount % MIB === 0 ? `${byteCount}-byte (${byteCount / MIB} MiB)` : `${byteCount}-byte (${byteCount / KIB} KiB)`;
}

/* ------------------------------------------------------------ classification */

/** @param {string} host */
function isGitHubShapedHost(host) {
  const lower = host.toLowerCase();
  return lower === 'github.com' || lower.endsWith('.github.com');
}

/**
 * `owner/repo`, with one optional `.git` and one optional trailing slash.
 * @param {string} text
 * @returns {{ owner: string, repository: string } | null}
 */
function readOwnerAndRepository(text) {
  const parts = text.replace(/\/$/, '').split('/');
  if (parts.length !== 2) return null;
  const [owner, spelled] = parts;
  const repository = spelled.replace(/\.git$/i, '');
  if (!OWNER_RE.test(owner) || !REPOSITORY_RE.test(repository) || /^\.+$/.test(repository) || /\.git$/i.test(repository)) {
    return null;
  }
  return { owner, repository };
}

/**
 * Whether `pattern` finds a bracketed IPv6 address in `text`. Git connects to
 * whatever a host's brackets hold, so a bracketed name is neither read nor taken
 * for GitHub.
 * @param {RegExp} pattern
 * @param {string} text
 */
function bracketsIPv6(pattern, text) {
  const bracketed = pattern.exec(text);
  return bracketed !== null && isIP(bracketed[1]) === 6;
}

/**
 * Decide how a remote source is read. A refusal never repeats the address, so a
 * credential typed into it cannot reach a message.
 * @param {unknown} location
 * @returns {RemoteKind}
 */
function classifyRemote(location) {
  if (typeof location !== 'string' || location.length === 0) {
    throw new TypeError('A remote pack source must be a non-empty string.');
  }
  if (location !== location.trim() || /\p{Cc}/u.test(location)) {
    throw new Error('A remote pack source must be one line without surrounding spaces or control characters.');
  }
  if (location.startsWith('-')) throw new Error('A remote pack source must not begin with "-".');
  // Git would run a remote helper on this, whatever address follows the "::".
  if (REMOTE_HELPER_RE.test(location)) throw new Error(REMOTE_HELPER_ADDRESS);

  const url = URL_RE.exec(location);
  if (url) {
    const [, rawScheme, authority, rest] = url;
    const scheme = rawScheme.toLowerCase();
    const at = authority.lastIndexOf('@');
    const user = at >= 0 ? authority.slice(0, at) : null;
    const hostAndPort = at >= 0 ? authority.slice(at + 1) : authority;
    if (user !== null && (!SSH_SCHEMES.has(scheme) || user.includes(':'))) throw new Error(CREDENTIAL_ADDRESS);
    if (/[[\]]/.test(hostAndPort) && !bracketsIPv6(URL_BRACKETED_HOST_RE, hostAndPort)) {
      throw new Error(BRACKETED_HOST_ADDRESS);
    }
    const host = hostAndPort.startsWith('[') ? hostAndPort : hostAndPort.replace(/:[^:]*$/, '');
    if (!isGitHubShapedHost(host)) {
      // Git finds a host after an extra slash or past a backslash, where this parse
      // sees none or a different one, so the address could reach GitHub or hide credentials.
      if (scheme !== 'file' && (authority === '' || rest.startsWith('\\'))) throw new Error(AMBIGUOUS_URL_ADDRESS);
      return { kind: 'git' };
    }
    const exactAddress = (scheme === 'https' ? user === null : SSH_SCHEMES.has(scheme) && user === 'git')
      && host.toLowerCase() === 'github.com'
      && hostAndPort === host
      && rest.startsWith('/')
      && !/[?#%\\]/.test(rest);
    const parsed = exactAddress ? readOwnerAndRepository(rest.slice(1)) : null;
    if (!parsed) throw new Error(UNSUPPORTED_GITHUB_ADDRESS);
    return { kind: 'github', ...parsed };
  }

  // Git reads this as SSH when a colon precedes any slash, and then unwraps a host
  // bracketed at its start or after an `@`.
  if (/^[^/:]*:/.test(location) && /^\[|@\[/.test(location)) {
    if (!bracketsIPv6(SCP_BRACKETED_HOST_RE, location)) throw new Error(BRACKETED_HOST_ADDRESS);
    return { kind: 'git' };
  }

  const scp = SCP_RE.exec(location);
  // A single letter before the colon is a Windows drive, not a host.
  if (scp && scp[2].length > 1) {
    const [, user, host, rest] = scp;
    if (!isGitHubShapedHost(host)) return { kind: 'git' };
    const parsed = user === 'git' && host.toLowerCase() === 'github.com' ? readOwnerAndRepository(rest) : null;
    if (!parsed) throw new Error(UNSUPPORTED_GITHUB_ADDRESS);
    return { kind: 'github', ...parsed };
  }

  // Git would read this as a missing local path; it is a GitHub address without its scheme.
  if (/^(?:www\.)?github\.com[/\\]/i.test(location)) throw new Error(UNSUPPORTED_GITHUB_ADDRESS);
  return { kind: 'git' };
}

/** @param {unknown} ref */
function checkGitHubRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) throw new TypeError('A pack source ref must be a non-empty string.');
  if (ref === RELEASE_CHANNEL || FULL_COMMIT_RE.test(ref)) return;
  const invalid = Buffer.byteLength(ref, 'utf8') > 255
    || /[\p{Cc}\s~^:?*[\\]/u.test(ref)
    || ref === '@'
    || ref.includes('..')
    || ref.includes('@{')
    || /^[-./]|[/.]$|\/\/|\/\.|\.lock(?:\/|$)/.test(ref);
  if (invalid) throw new Error('A GitHub pack source ref must be a valid branch, tag or full commit name.');
}

/** @param {unknown} ref */
function checkGitRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) throw new TypeError('A pack source ref must be a non-empty string.');
  if (ref.startsWith('-') || /[\p{Cc}\s]/u.test(ref)) {
    throw new Error('A pack source ref must not begin with "-" or contain spaces or control characters.');
  }
}

/* ------------------------------------------------------------- path policy */

/**
 * Structure every tree read must have: a relative path of nonempty, non-dot
 * segments without backslashes or control characters.
 * @param {unknown} relativePath
 */
function validateTreePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.startsWith('/')) {
    throw new Error('Git tree path must be a nonempty relative path');
  }
  for (const segment of relativePath.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || segment.includes('\\') || /\p{Cc}/u.test(segment)) {
      throw new Error(`Git tree path has an empty, dot, backslash or control-character segment: ${JSON.stringify(relativePath)}`);
    }
  }
}

/**
 * A segment this module writes must be a name every supported platform can hold,
 * so a pack is never renamed, dropped or redirected to a Windows device.
 * @param {string} segment
 * @param {string} relativePath
 */
function checkPortableSegment(segment, relativePath) {
  if (/[<>:"|?*]/.test(segment) || /[. ]$/.test(segment) || WINDOWS_RESERVED_NAME_RE.test(segment)) {
    throw new Error(`pack path is not representable on Windows: ${JSON.stringify(relativePath)}`);
  }
}

/** @param {unknown} relativePath */
function validatePackPath(relativePath) {
  validateTreePath(relativePath);
  const text = /** @type {string} */ (relativePath);
  for (const segment of text.split('/')) checkPortableSegment(segment, text);
}

/* ----------------------------------------------------------- GitHub reading */

/**
 * @typedef {{
 *   repository: string,
 *   display: string,
 *   apiBase: string,
 *   rawBase: string,
 *   metadata: ReadBudget,
 *   raw: ReadBudget,
 *   operation: AbortController,
 * }} GitHubContext
 */

/**
 * Run one GitHub step. Its failure ends the whole operation, which aborts every
 * sibling request, and the operation's first reason is what every step reports.
 * @template T
 * @param {GitHubContext} context
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function step(context, work) {
  const { signal } = context.operation;
  if (signal.aborted) throw signal.reason;
  try {
    return await work();
  } catch (error) {
    if (!signal.aborted) context.operation.abort(error);
    throw signal.reason;
  }
}

/**
 * Run `task` over `items` with at most four in flight. The first failure ends the
 * operation; every started task settles before the failure is reported, so no
 * request or write outlives the acquisition.
 * @template T, R
 * @param {GitHubContext} context
 * @param {readonly T[]} items
 * @param {(item: T) => Promise<R>} task
 * @returns {Promise<R[]>}
 */
async function mapBounded(context, items, task) {
  const { signal } = context.operation;
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const index = next;
      next += 1;
      try {
        results[index] = await task(items[index]);
      } catch (error) {
        if (!signal.aborted) context.operation.abort(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_IN_FLIGHT, items.length) }, worker));
  if (signal.aborted) throw signal.reason;
  return results;
}

/** @param {string} ref */
function encodeRef(ref) {
  return ref.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

/** @param {GitHubContext} context @param {string} ref */
function readCommitSha(context, ref) {
  return step(context, async () => {
    const bytes = await fetchGitHubBytes(`${context.apiBase}/commits/${encodeRef(ref)}`, context.metadata, {
      headers: GITHUB_COMMIT_SHA_HEADERS,
      signal: context.operation.signal,
    });
    const text = bytes.toString('latin1');
    if (!/^[0-9a-f]{40}\n?$/.test(text)) throw new Error('GitHub commit lookup did not return one full commit ID');
    return text.slice(0, 40);
  });
}

/** @param {GitHubContext} context @param {string} commit */
function readRootTree(context, commit) {
  return step(context, async () => {
    const value = /** @type {any} */ (await fetchGitHubJson(`${context.apiBase}/git/commits/${commit}`, context.metadata, {
      headers: GITHUB_API_HEADERS,
      signal: context.operation.signal,
    }));
    if (!value || typeof value !== 'object' || Array.isArray(value) || !value.tree || typeof value.tree !== 'object') {
      throw new Error('GitHub commit object is malformed');
    }
    if (validateGitObjectId(value.sha, 'commit') !== commit) {
      throw new Error('GitHub commit object identity does not match the resolved commit');
    }
    return validateGitObjectId(value.tree.sha, 'commit tree');
  });
}

/**
 * @param {GitHubContext} context
 * @param {string} treeSha
 * @param {boolean} recursive
 * @param {(relativePath: unknown) => void} validatePath
 * @returns {Promise<GitTreeRecord[]>}
 */
function readTree(context, treeSha, recursive, validatePath) {
  return step(context, async () => validateGitTree(
    await fetchGitHubJson(`${context.apiBase}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`, context.metadata, {
      headers: GITHUB_API_HEADERS,
      signal: context.operation.signal,
    }),
    treeSha,
    recursive,
    validatePath,
  ));
}

/**
 * The highest stable `vX.Y.Z` tag and its commit, from every tag page. A page
 * shorter than a full page proves the end; a full last permitted page does not.
 * @param {GitHubContext} context
 * @returns {Promise<{ tag: string, commit: string }>}
 */
async function selectLatestRelease(context) {
  /** @type {Map<string, string>} */
  const commits = new Map();
  for (let page = 1; ; page += 1) {
    if (page > MAX_TAG_PAGES) {
      throw new Error(`the GitHub tag list did not end within ${MAX_TAG_PAGES} pages of ${TAGS_PER_PAGE} tags`);
    }
    const tags = await step(context, async () => {
      const value = await fetchGitHubJson(
        `${context.apiBase}/tags?per_page=${TAGS_PER_PAGE}&page=${page}`,
        context.metadata,
        { headers: GITHUB_API_HEADERS, signal: context.operation.signal },
      );
      if (!Array.isArray(value) || value.length > TAGS_PER_PAGE) throw new Error('GitHub tag list page is malformed');
      return value.map((item) => {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.commit || typeof item.commit !== 'object') {
          throw new Error('GitHub tag list contains a malformed tag');
        }
        return { name: item.name, commit: validateGitObjectId(item.commit.sha, 'tag commit') };
      });
    });
    for (const tag of tags) {
      if (commits.has(tag.name)) throw new Error('the GitHub tag list repeated a tag while it was read');
      commits.set(tag.name, tag.commit);
    }
    if (tags.length < TAGS_PER_PAGE) break;
  }
  const tag = pickLatestReleaseTag([...commits.keys()]);
  if (!tag) throw new ReportedError(`no releases published yet at ${context.repository} (channel: ${RELEASE_CHANNEL})`);
  return { tag, commit: /** @type {string} */ (commits.get(tag)) };
}

/**
 * @param {GitHubContext} context
 * @param {string} ref
 * @returns {Promise<{ commit: string, tag: string | null }>}
 */
async function resolveRevision(context, ref) {
  if (ref === RELEASE_CHANNEL) return selectLatestRelease(context);
  const commit = await readCommitSha(context, ref);
  if (FULL_COMMIT_RE.test(ref) && commit !== ref.toLowerCase()) {
    throw new Error('GitHub resolved the requested commit to a different commit');
  }
  return { commit, tag: null };
}

/**
 * Resolve a mutable selector again and refuse any different answer.
 * @param {GitHubContext} context
 * @param {string} ref
 * @param {{ commit: string, tag: string | null }} opening
 */
async function recheckRevision(context, ref, opening) {
  if (FULL_COMMIT_RE.test(ref)) return;
  const closing = await resolveRevision(context, ref);
  if (closing.commit !== opening.commit || closing.tag !== opening.tag) {
    const describe = (/** @type {{ commit: string, tag: string | null }} */ revision) => (
      revision.tag ? `${revision.tag} at ${revision.commit}` : revision.commit);
    throw new Error(`the requested ref changed during acquisition (from ${describe(opening)} to ${describe(closing)}); nothing was kept`);
  }
}

/**
 * The `packs` tree records of the catalog at `rootTree`.
 * @param {GitHubContext} context
 * @param {string} rootTree
 */
async function readPacksTree(context, rootTree) {
  let treeSha = rootTree;
  for (const name of ['library', 'packs']) {
    const records = await readTree(context, treeSha, false, validateTreePath);
    const child = records.find((record) => record.path === name);
    if (!child) throw new ReportedError(`no pack catalog found in ${context.display}`);
    if (child.entryType !== 'directory') throw new Error(`the catalog's ${name} entry is not a directory`);
    treeSha = child.sha;
  }
  return readTree(context, treeSha, false, validateTreePath);
}

/**
 * Download one blob at the resolved commit and verify it against its tree record.
 * @param {GitHubContext} context
 * @param {string} commit
 * @param {string[]} segments path from the repository root
 * @param {GitTreeRecord} record
 */
async function fetchVerifiedBlob(context, commit, segments, record) {
  const relativePath = segments.join('/');
  const bytes = await fetchGitHubBytes(
    `${context.rawBase}/${commit}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`,
    context.raw,
    { signal: context.operation.signal },
  );
  if (bytes.length !== record.size) {
    throw new Error(`raw file size does not match Git tree metadata for ${JSON.stringify(relativePath)}`);
  }
  if (gitBlobSha1(bytes) !== record.sha) {
    throw new Error(`raw file Git blob SHA-1 integrity mismatch for ${JSON.stringify(relativePath)}`);
  }
  return bytes;
}

/** @param {GitTreeRecord} record */
function fileMode(record) {
  return record.mode === '100755' ? 0o755 : 0o644;
}

/**
 * @param {GitHubContext} context
 * @param {string} ref
 * @param {string} root
 */
async function readGitHubCatalog(context, ref, root) {
  const opening = await resolveRevision(context, ref);
  const rootTree = await readRootTree(context, opening.commit);
  const packs = await readPacksTree(context, rootTree);
  const catalogDir = path.join(root, 'library', 'packs');
  await fs.promises.mkdir(catalogDir, { recursive: true });

  const directories = packs.filter((record) => record.entryType === 'directory');
  if (directories.length > CATALOG_LIMITS.directories) {
    throw new Error(`the catalog has more than ${CATALOG_LIMITS.directories} direct pack directories`);
  }
  const trees = await mapBounded(context, directories, (directory) => readTree(context, directory.sha, false, validateTreePath));

  /** @type {{ name: string, record: GitTreeRecord }[]} */
  const manifests = [];
  let declaredBytes = 0;
  for (const [index, directory] of directories.entries()) {
    const manifest = trees[index].find((record) => record.path === 'pack.md');
    if (!manifest) continue;
    checkPortableSegment(directory.path, directory.path);
    if (manifest.entryType !== 'regular-file') {
      throw new Error(`pack ${JSON.stringify(directory.path)} has a pack.md that is not a regular file`);
    }
    const size = /** @type {number} */ (manifest.size);
    if (size > CATALOG_LIMITS.rawResponseBytes) {
      throw new Error(`pack ${JSON.stringify(directory.path)} has a pack.md over the ${byteLimit(CATALOG_LIMITS.rawResponseBytes)} manifest limit`);
    }
    declaredBytes += size;
    if (declaredBytes > CATALOG_LIMITS.rawTotalBytes) {
      throw new Error(`the catalog manifests exceed the ${byteLimit(CATALOG_LIMITS.rawTotalBytes)} aggregate limit`);
    }
    manifests.push({ name: directory.path, record: manifest });
  }

  await mapBounded(context, manifests, ({ name, record }) => step(context, async () => {
    const bytes = await fetchVerifiedBlob(context, opening.commit, ['library', 'packs', name, 'pack.md'], record);
    await fs.promises.mkdir(path.join(catalogDir, name));
    await fs.promises.writeFile(path.join(catalogDir, name, 'pack.md'), bytes, { flag: 'wx', mode: fileMode(record) });
  }));

  await recheckRevision(context, ref, opening);
  return { catalogDir, resolvedCommit: opening.commit };
}

/**
 * Refuse a selected pack's inventory before any file is downloaded.
 * @param {GitTreeRecord[]} records
 * @param {string} name
 */
function checkPackInventory(records, name) {
  const label = `pack ${JSON.stringify(name)}`;
  if (records.length > PACK_LIMITS.entries) throw new Error(`${label} has more than ${PACK_LIMITS.entries} entries`);
  const byPath = new Map(records.map((record) => [record.path, record]));
  let regularFiles = 0;
  let totalBytes = 0;
  for (const record of records) {
    const segments = record.path.split('/');
    if (segments.length > PACK_LIMITS.depth) {
      throw new Error(`${label} is deeper than ${PACK_LIMITS.depth} levels at ${JSON.stringify(record.path)}`);
    }
    for (let index = 1; index < segments.length; index += 1) {
      if (byPath.get(segments.slice(0, index).join('/'))?.entryType !== 'directory') {
        throw new Error(`Git tree path has a missing or non-directory parent: ${JSON.stringify(record.path)}`);
      }
    }
    if (record.entryType === 'symbolic-link') {
      throw new Error(`${label} contains a symbolic link at ${JSON.stringify(record.path)}, which is not followed`);
    }
    if (record.entryType === 'non-regular') {
      throw new Error(`${label} contains a submodule at ${JSON.stringify(record.path)}, which is not read`);
    }
    if (record.entryType !== 'regular-file') continue;
    regularFiles += 1;
    if (regularFiles > PACK_LIMITS.regularFiles) {
      throw new Error(`${label} has more than ${PACK_LIMITS.regularFiles} regular files`);
    }
    const size = /** @type {number} */ (record.size);
    if (size > PACK_LIMITS.rawResponseBytes) {
      throw new Error(`${label} file ${JSON.stringify(record.path)} exceeds the ${byteLimit(PACK_LIMITS.rawResponseBytes)} per-file limit`);
    }
    totalBytes += size;
    if (totalBytes > PACK_LIMITS.rawTotalBytes) {
      throw new Error(`${label} exceeds the ${byteLimit(PACK_LIMITS.rawTotalBytes)} aggregate file limit`);
    }
  }
}

/**
 * @param {GitHubContext} context
 * @param {string} ref
 * @param {string} name
 * @param {string} root
 */
async function readGitHubPack(context, ref, name, root) {
  const opening = await resolveRevision(context, ref);
  const rootTree = await readRootTree(context, opening.commit);
  const packs = await readPacksTree(context, rootTree);
  const entry = packs.find((record) => record.path === name);
  if (!entry) throw new ReportedError(`pack "${name}" not found in source ${context.display}`);
  if (entry.entryType !== 'directory') throw new Error(`pack ${JSON.stringify(name)} is not a directory in the catalog`);

  const records = await readTree(context, entry.sha, true, validatePackPath);
  const manifest = records.find((record) => record.path === 'pack.md');
  if (manifest?.entryType !== 'regular-file') throw new ReportedError(`pack "${name}" not found in source ${context.display}`);
  checkPackInventory(records, name);

  const packDir = path.join(root, 'library', 'packs', name);
  await fs.promises.mkdir(packDir, { recursive: true });
  // Sorted paths put every directory before its contents.
  for (const record of records) {
    if (record.entryType === 'directory') await fs.promises.mkdir(path.join(packDir, ...record.path.split('/')));
  }
  const files = records.filter((record) => record.entryType === 'regular-file');
  await mapBounded(context, files, (record) => step(context, async () => {
    const segments = record.path.split('/');
    const bytes = await fetchVerifiedBlob(context, opening.commit, ['library', 'packs', name, ...segments], record);
    await fs.promises.writeFile(path.join(packDir, ...segments), bytes, { flag: 'wx', mode: fileMode(record) });
  }));

  await recheckRevision(context, ref, opening);
  return { packDir, resolvedCommit: opening.commit };
}

/**
 * Run one GitHub acquisition under its total deadline and the caller's signal.
 * @template T
 * @param {{ owner: string, repository: string }} github
 * @param {string} repository the configured source, as reported
 * @param {string} display
 * @param {typeof CATALOG_LIMITS | typeof PACK_LIMITS} limits
 * @param {AbortSignal | undefined} signal
 * @param {(context: GitHubContext) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withGitHubOperation(github, repository, display, limits, signal, work) {
  const operation = new AbortController();
  const deadline = globalThis.setTimeout(() => {
    operation.abort(new Error(`the GitHub ${limits.label} acquisition did not finish within its ${limits.totalMs / 1_000}-second deadline`));
  }, limits.totalMs);
  const cancel = () => operation.abort(new Error(`the GitHub ${limits.label} acquisition was cancelled`, { cause: signal?.reason }));
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const repositoryPath = `${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repository)}`;
  /** @type {GitHubContext} */
  const context = {
    repository,
    display,
    apiBase: `https://api.github.com/repos/${repositoryPath}`,
    rawBase: `https://raw.githubusercontent.com/${repositoryPath}`,
    metadata: createReadBudget('metadata', {
      maxRequests: limits.metadataRequests,
      maxResponseBytes: METADATA_RESPONSE_BYTES,
      maxTotalBytes: METADATA_TOTAL_BYTES,
      requestTimeoutMs: limits.requestTimeoutMs,
    }),
    raw: createReadBudget('raw', {
      maxRequests: limits.rawRequests,
      maxResponseBytes: limits.rawResponseBytes,
      maxTotalBytes: limits.rawTotalBytes,
      requestTimeoutMs: limits.requestTimeoutMs,
    }),
    operation,
  };
  try {
    return await work(context);
  } finally {
    globalThis.clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}

/* -------------------------------------------------------------- Git cloning */

/**
 * Clone an other-host repository whole into `<root>/repo` within the shared Git
 * deadline and output bound.
 * @param {string} repository
 * @param {string} ref
 * @param {string} root
 * @param {AbortSignal | undefined} signal
 * @returns {{ checkout: string, resolvedCommit: string }}
 */
function cloneWithGit(repository, ref, root, signal) {
  const deadline = Date.now() + GIT_DEADLINE_MS;
  let captured = 0;
  let fetchRef = ref;
  const fail = (/** @type {string} */ detail = '') => new ReportedError(
    `failed to fetch source ${repository} @ ${fetchRef}${detail ? `: ${detail}` : ''}`,
  );
  /**
   * @param {string[]} args
   * @param {{ cwd?: string, capture?: boolean }} [options]
   */
  const git = (args, { cwd, capture = false } = {}) => {
    if (signal?.aborted) throw fail('the acquisition was cancelled');
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw fail(`Git did not finish within the ${GIT_DEADLINE_MS / 1_000}-second acquisition deadline`);
    const result = spawnSync('git', args, {
      cwd,
      windowsHide: true,
      timeout: remainingMs,
      killSignal: 'SIGKILL',
      maxBuffer: Math.max(1, GIT_OUTPUT_BYTES - captured),
      stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'],
    });
    const code = /** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code;
    if (code === 'ENOENT') throw new ReportedError('git is required to fetch a pack from a remote source');
    const stopped = code === 'ETIMEDOUT' ? `Git did not finish within the ${GIT_DEADLINE_MS / 1_000}-second acquisition deadline`
      : code === 'ENOBUFS' ? `Git wrote more than the ${byteLimit(GIT_OUTPUT_BYTES)} output limit`
        : result.signal ? `Git was stopped by ${result.signal}`
          : null;
    if (stopped) {
      const error = fail(`${stopped}; its process tree could not be confirmed stopped, so its temporary material was kept at ${root}`);
      keptFailures.add(error);
      throw error;
    }
    if (result.error) throw fail(`Git could not be started: ${result.error.message}`);
    if (capture) captured += result.stdout.length;
    return { status: result.status, stdout: capture ? result.stdout.toString('utf8') : '' };
  };

  if (ref === RELEASE_CHANNEL) {
    const listed = git(['ls-remote', '--tags', '--refs', '--', repository], { capture: true });
    if (listed.status !== 0) throw fail('git ls-remote could not list its tags');
    /** @type {string[]} */
    const names = [];
    for (const line of listed.stdout.split('\n')) {
      const match = /refs\/tags\/(\S+)$/.exec(line.trim());
      if (match) names.push(match[1]);
    }
    const tag = pickLatestReleaseTag(names);
    if (!tag) throw new ReportedError(`no releases published yet at ${repository} (channel: ${ref})`);
    fetchRef = tag;
  }

  const checkout = path.join(root, 'repo');
  let cloned = git(['clone', '--quiet', '--depth=1', '--branch', fetchRef, '--', repository, checkout]).status === 0;
  if (!cloned) {
    // That Git exited by itself, so nothing still writes into its partial checkout.
    fs.rmSync(checkout, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    cloned = git(['clone', '--quiet', '--', repository, checkout]).status === 0
      && git(['checkout', '--quiet', fetchRef], { cwd: checkout }).status === 0;
  }
  if (!cloned) throw fail();
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: checkout, capture: true });
  const resolvedCommit = head.status === 0 ? normalizeGitObjectId(head.stdout.trim()) : null;
  if (!resolvedCommit) throw fail();
  return { checkout, resolvedCommit };
}

/** @param {string} directory */
function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- ownership */

/** @param {string} root */
function removeRoot(root) {
  return fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Point an anonymous-access refusal at its usual cause.
 * @param {unknown} error
 */
function anonymousHint(error) {
  for (let cause = error; cause instanceof Error; cause = /** @type {any} */ (cause).cause) {
    const { status, rateLimited } = /** @type {any} */ (cause);
    if ([401, 403, 404].includes(status) && !rateLimited) {
      return ' (GitHub sources are read anonymously, so the repository and ref must be public)';
    }
  }
  return '';
}

/**
 * Own one new temporary root for `work`. Success hands the root to the caller's
 * `dispose`; failure removes it first, unless a process may still be using it.
 * @template {object} T
 * @param {string} display
 * @param {(root: string) => Promise<T>} work
 * @returns {Promise<T & { dispose: () => Promise<void> }>}
 */
async function acquireInOwnedRoot(display, work) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), ROOT_PREFIX));
  /** @type {T} */
  let result;
  try {
    result = await work(root);
  } catch (error) {
    const reported = error instanceof ReportedError
      ? error
      : new Error(`failed to fetch source ${display}: ${error instanceof Error ? error.message : String(error)}${anonymousHint(error)}`, { cause: error });
    if (keptFailures.has(error)) throw reported;
    try {
      await removeRoot(root);
    } catch (removalError) {
      throw new Error(`${reported.message}; its temporary material at ${root} could not be removed: ${
        removalError instanceof Error ? removalError.message : String(removalError)}`, { cause: error });
    }
    throw reported;
  }
  /** @type {Promise<void> | null} */
  let disposal = null;
  return { ...result, dispose: () => (disposal ??= removeRoot(root)) };
}

/**
 * @param {unknown} signal
 * @returns {AbortSignal | undefined}
 */
function checkSignal(signal) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal');
  if (signal?.aborted) throw new Error('the pack acquisition was cancelled before it started', { cause: signal.reason });
  return signal;
}

/**
 * Classify the source and check its ref before anything is created or requested.
 * @param {unknown} repository
 * @param {unknown} ref
 * @param {unknown} signal
 */
function prepare(repository, ref, signal) {
  const kind = classifyRemote(repository);
  if (kind.kind === 'github') checkGitHubRef(ref);
  else checkGitRef(ref);
  return { kind, signal: checkSignal(signal), display: `${repository} @ ${ref}` };
}

/* ------------------------------------------------------------------- API */

/**
 * Acquire a remote source's catalog. `catalogDir` is a `library/packs` folder: at
 * one commit, the source's direct manifests (GitHub) or the catalog of a whole
 * clone (other hosts). The caller must await `dispose()` after reading it.
 * @param {{ repository: string, ref: string, signal?: AbortSignal }} input
 * @returns {Promise<{ catalogDir: string, sourceIdentity: RemoteSourceIdentity, dispose: () => Promise<void> }>}
 */
export async function acquireRemoteCatalog({ repository, ref, signal }) {
  const { kind, signal: callerSignal, display } = prepare(repository, ref, signal);
  const acquired = await acquireInOwnedRoot(display, async (root) => {
    if (kind.kind === 'github') {
      return withGitHubOperation(kind, repository, display, CATALOG_LIMITS, callerSignal,
        (context) => readGitHubCatalog(context, ref, root));
    }
    const { checkout, resolvedCommit } = cloneWithGit(repository, ref, root, callerSignal);
    const catalogDir = path.join(checkout, 'library', 'packs');
    if (!isDirectory(catalogDir)) throw new ReportedError(`no pack catalog found in ${display}`);
    return { catalogDir, resolvedCommit };
  });
  return {
    catalogDir: acquired.catalogDir,
    sourceIdentity: { type: 'remote', repository, requested_ref: ref, resolved_commit: acquired.resolvedCommit },
    dispose: acquired.dispose,
  };
}

/**
 * Acquire one pack from a remote source. `packDir` holds the selected pack's
 * complete subtree at one commit (GitHub) or lies in a whole clone (other hosts).
 * The caller must await `dispose()` after reading it.
 * @param {{ repository: string, ref: string, name: string, signal?: AbortSignal }} input
 * @returns {Promise<{ packDir: string, sourceIdentity: RemoteSourceIdentity, dispose: () => Promise<void> }>}
 */
export async function acquireRemotePack({ repository, ref, name, signal }) {
  if (typeof name !== 'string' || !PACK_NAME_RE.test(name)) throw new Error('A pack name must be a valid pack identifier.');
  const { kind, signal: callerSignal, display } = prepare(repository, ref, signal);
  // A GitHub pack is written under its own name, which discovery also requires to be portable.
  if (kind.kind === 'github') checkPortableSegment(name, name);
  const acquired = await acquireInOwnedRoot(display, async (root) => {
    if (kind.kind === 'github') {
      return withGitHubOperation(kind, repository, display, PACK_LIMITS, callerSignal,
        (context) => readGitHubPack(context, ref, name, root));
    }
    const { checkout, resolvedCommit } = cloneWithGit(repository, ref, root, callerSignal);
    const packDir = path.join(checkout, 'library', 'packs', name);
    if (!isDirectory(packDir) || !fs.existsSync(path.join(packDir, 'pack.md'))) {
      throw new ReportedError(`pack "${name}" not found in source ${display}`);
    }
    return { packDir, resolvedCommit };
  });
  return {
    packDir: acquired.packDir,
    sourceIdentity: { type: 'remote', repository, requested_ref: ref, resolved_commit: acquired.resolvedCommit },
    dispose: acquired.dispose,
  };
}

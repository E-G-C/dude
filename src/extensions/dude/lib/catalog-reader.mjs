// @ts-check
/**
 * Private Canvas catalog reader. `packs.mjs` runs it as a short-lived helper
 * process for one operation and owns that process's launch, deadline, stop and
 * temporary root. The helper does its one operation, reports over IPC and exits.
 * Once the parent writes its stop marker, this helper holds at any subsequent
 * synchronous process start until killed, including Compose's fallback clone.
 *
 * The operation is fixed by a closed request in `CATALOG_REQUEST_ENV`; its absence
 * is the default catalog read this helper always did. There is no command, path,
 * repository or ref in a request. A source is named by its position in the saved
 * (or prospective) sources document and checked against its derived key and the
 * document's revision, and the document itself is parsed by the shared parser.
 *
 * - default:  read the default catalog once (the local library, else the upstream).
 * - source:   resolve one saved source once, then optionally enumerate its catalog.
 * - validate: the shared checks for one new source, which may resolve a local
 *   folder. They run here, behind the parent's deadline, because a path on an
 *   unreachable share can block a synchronous call for as long as the OS waits.
 *
 * Git's home. libcurl sends a `~/.netrc` (on Windows `~/_netrc`) login to any
 * host, and only another home stops that. `packs.mjs` makes an empty folder in
 * this helper's own temporary root and names it in `CATALOG_GIT_HOME_ENV`, but
 * leaves HOME, USERPROFILE, HOMEDRIVE and HOMEPATH in the helper's launch
 * environment as it has them: the CLI's single executable and its extension
 * bootstrap start from that environment, and on Linux and macOS they find their
 * unpacked package under the home they start with. The main block below points
 * those variables at the folder in this process's own environment, once any
 * bootstrap that imported this module has loaded and before `handle` can reach
 * Compose. Compose starts Git without an environment of its own, so its Git
 * inherits the empty home. A mere import never changes a home, and a helper that
 * is not given a valid folder answers `catalog_unavailable` and reads nothing.
 * What remains, by design: a credential written into the Git configuration that
 * `packs.mjs` carries (such as `http.extraHeader`) is still sent, a Git older
 * than 2.32 ignores `GIT_CONFIG_GLOBAL` so it does not read `~/.gitconfig`, and a
 * `~/` path inside the carried configuration names the empty home. Git serves
 * only other hosts: Compose reads a GitHub source over anonymous HTTPS, with no
 * Git and no credentials at all.
 *
 * Compose acquires a remote catalog into a temporary folder inside this helper's
 * own root. Every read awaits Compose and releases that folder before its answer
 * is sent, so only a settled answer ever crosses IPC. An acquisition that had to
 * keep material, because a stopped Git could not be confirmed stopped, says so in
 * its error, which is returned unchanged and marked `kept`: that Git may still be
 * writing into this helper's root, so the parent must keep the root and its slot.
 */
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePacks, cmdList, readManifestSource, resolveCatalogDir } from '../../../skills/dude-compose/compose.mjs';
import {
  PackSourceError,
  describeBuiltinSources,
  describePackSources,
  parsePackSourcesDocument,
  readPackSources,
  validateNewSource,
} from '../../../skills/dude-engine/lib/pack-sources.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

const SELF = fileURLToPath(import.meta.url);

/** The one environment variable that carries a closed request to this helper. */
export const CATALOG_REQUEST_ENV = 'DUDE_CANVAS_CATALOG_REQUEST';
/**
 * The helper's private variable naming its empty Git home. No CLI loader reads
 * it; only the main block below does, and it never reads it on import.
 */
export const CATALOG_GIT_HOME_ENV = 'DUDE_CANVAS_CATALOG_GIT_HOME';
/** The parent's fixed private stop marker, inside this helper's own temporary root. */
export const CATALOG_STOP_MARKER = 'reader-stop';
/** The prospective document's fixed name, inside the helper's own temporary root. */
export const CANDIDATE_DOCUMENT = 'pack-sources.candidate.md';

const KEY_RE = /^src_[0-9a-f]{32}$/;
const REVISION_RE = /^(?:absent|sha256:[0-9a-f]{64})$/;
/**
 * How Compose's error ends when it kept an acquisition's material: the root it
 * names last, which Compose made in `os.tmpdir()`, this helper's own root.
 */
const KEPT_MATERIAL = '; its process tree could not be confirmed stopped, so its temporary material was kept at ';

/**
 * @typedef {{ op: 'source', index: number, key: string | null, revision: string,
 *   document: 'configured' | 'candidate', list: boolean }} SourceRequest
 * @typedef {{ op: 'validate', location: string, ref: string | null, revision: string }} ValidateRequest
 */

/** @param {string | Buffer} bytes */
function revisionOf(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * The closed request, or null for the default read. Anything else is a refusal,
 * never a best-effort read.
 * @param {string | undefined} text
 * @returns {SourceRequest | ValidateRequest | null}
 */
function parseRequest(text) {
  if (text === undefined) return null;
  const value = JSON.parse(text);
  /** @param {string[]} keys */
  const exact = keys => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  if (value?.op === 'source' && exact(['op', 'index', 'key', 'revision', 'document', 'list'])
    && Number.isSafeInteger(value.index) && value.index >= 0 && value.index < 64
    && (value.key === null || (typeof value.key === 'string' && KEY_RE.test(value.key)))
    && typeof value.revision === 'string' && REVISION_RE.test(value.revision)
    && (value.document === 'configured' || value.document === 'candidate') && typeof value.list === 'boolean') {
    return value;
  }
  if (value?.op === 'validate' && exact(['op', 'location', 'ref', 'revision'])
    && typeof value.location === 'string' && (value.ref === null || typeof value.ref === 'string')
    && typeof value.revision === 'string' && REVISION_RE.test(value.revision)) {
    return value;
  }
  throw new Error('The catalog request is not one of the fixed operations.');
}

/**
 * Validate the resolved catalog directory, then enumerate it once. This resolver
 * always returns <source-or-checkout>/library/packs. Validate from that source
 * root, not below a potentially linked library ancestor, before enumerating even
 * an empty catalog. The resolved directory is passed back as a local input only
 * to avoid a second acquisition; its actual origin remains the resolver's origin.
 * @param {string} root
 * @param {{ dir: string, origin: string }} catalog
 */
async function listCatalog(root, catalog) {
  const sourceRoot = fs.realpathSync(path.resolve(catalog.dir, '..', '..'));
  const catalogDir = resolveMutationPath(sourceRoot, 'library/packs');
  for (const name of availablePacks(catalogDir)) {
    resolveMutationPath(catalogDir, `${name}/pack.md`);
  }
  const result = await cmdList({ root, library: catalogDir, fetch: false });
  if (result.ok) result.result.origin = catalog.origin;
  return result;
}

/**
 * Enumerate a resolved catalog once, then remove the copy Compose acquired for
 * it, if any, before the answer can be sent. A copy that cannot be removed fails
 * the read instead of being left behind a listing.
 * @param {string} root
 * @param {{ dir: string, origin: string, dispose?: () => Promise<void> }} catalog
 */
async function listAndRelease(root, catalog) {
  try {
    return await listCatalog(root, catalog);
  } finally {
    await catalog.dispose?.();
  }
}

/** @param {string} root */
async function readCatalog(root) {
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
    resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST);
    const library = resolveMutationPath(root, 'library/packs');
    const catalog = await resolveCatalogDir({ root, library, fetch: true });
    if ('error' in catalog) {
      return keptMaterial(catalog.error) ? { ...failure('catalog_cleanup_failed', catalog.error), kept: true }
        : { ok: false, error: catalog.error };
    }
    return await listAndRelease(root, catalog);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The catalog could not be read.' };
  }
}

/**
 * @param {string} reason
 * @param {string} error
 */
function failure(reason, error) {
  return { ok: false, reason, error };
}

/**
 * Whether a failed acquisition's error is Compose's report that it kept material
 * in this helper's own root, which Compose exports no other way. The report is
 * the error's last clause and names a root directly inside this helper's own
 * temporary root, a random folder that text inside a source address cannot name.
 * @param {string} error
 */
function keptMaterial(error) {
  const at = error.lastIndexOf(KEPT_MATERIAL);
  return at >= 0 && path.dirname(error.slice(at + KEPT_MATERIAL.length)) === path.resolve(os.tmpdir());
}

/**
 * The two built-in sources this workspace derives, exactly as the parent derives
 * them: a manifest that cannot be read names no upstream.
 * @param {string} root
 */
function builtinSources(root) {
  /** @type {ReturnType<typeof readManifestSource>} */
  let upstream = null;
  try { upstream = readManifestSource(root); } catch { /* an unreadable manifest names no upstream */ }
  return describeBuiltinSources({ root, upstream });
}
/**
 * The saved entries a source request names: the document at its pinned revision,
 * or the prospective document the parent wrote into this helper's own root.
 * @param {string} root
 * @param {SourceRequest} request
 * @returns {{ sources: import('../../../skills/dude-engine/lib/pack-sources.mjs').PackSource[] } | { failure: ReturnType<typeof failure> }}
 */
function loadSources(root, request) {
  if (request.document === 'candidate') {
    const bytes = fs.readFileSync(path.join(os.tmpdir(), CANDIDATE_DOCUMENT));
    if (revisionOf(bytes) !== request.revision) {
      return { failure: failure('sources_changed', 'The prospective sources document changed.') };
    }
    return { sources: parsePackSourcesDocument(bytes) };
  }
  const saved = readPackSources(root);
  if (!saved.ok) return { failure: failure('sources_unavailable', saved.error) };
  if (saved.revision !== request.revision) {
    return { failure: failure('sources_changed', 'The saved sources changed after they were read.') };
  }
  return { sources: saved.sources };
}

/**
 * Describe one saved source, and with `list` resolve it once and enumerate its
 * catalog once. An explicit source is exclusive, and the resolved directory is
 * passed on as a local input, so this never acquires twice.
 * @param {string} root
 * @param {SourceRequest} request
 */
async function readSource(root, request) {
  const loaded = loadSources(root, request);
  if ('failure' in loaded) return loaded.failure;
  const entry = loaded.sources[request.index];
  if (!entry) return failure('sources_changed', 'The saved sources changed after they were read.');
  const builtins = builtinSources(root);
  // Only this entry is described, so another saved folder that does not answer
  // can never delay this source.
  const described = describePackSources({ root, sources: [entry], builtins });
  if (!described.ok) return failure('sources_unavailable', described.error);
  const source = described.sources[0];
  if (request.key !== null && request.key !== source.key) {
    return failure('sources_changed', 'The saved sources changed after they were read.');
  }
  const summary = { key: source.key, type: source.type, root: source.root ?? null };
  if (!request.list) return { ok: true, source: summary };
  // From here a failure still reports who the source is, so a source whose catalog
  // cannot be read keeps its row, its key and its place in the saved list.
  /** @param {string} reason @param {string} error */
  const unread = (reason, error) => ({ ...failure(reason, error), source: summary });
  if (source.type === 'local' && !source.root) {
    return unread('source_unavailable', 'The saved folder is not available.');
  }
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
    resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST);
    const library = resolveMutationPath(root, 'library/packs');
    const catalog = source.type === 'remote'
      ? await resolveCatalogDir({ root, library, fetch: true, source: source.repository, ref: source.ref })
      : await resolveCatalogDir({ root, library, fetch: true, source: /** @type {string} */ (source.root) });
    if ('error' in catalog) {
      if (keptMaterial(catalog.error)) return { ...unread('catalog_cleanup_failed', catalog.error), kept: true };
      return unread(/^no pack catalog found in /.test(catalog.error) ? 'catalog_missing' : 'catalog_unreachable', catalog.error);
    }
    const listed = await listAndRelease(root, catalog);
    if (!listed.ok) {
      const error = listed.error ?? 'The catalog could not be read.';
      return unread(/ has invalid metadata/.test(error) ? 'catalog_metadata' : 'catalog_unavailable', error);
    }
    return { ok: true, result: listed.result, source: summary };
  } catch (error) {
    return unread('catalog_unavailable', error instanceof Error ? error.message : 'The catalog could not be read.');
  }
}

/**
 * The shared checks for one new source, against the saved document at its pinned
 * revision. A refusal is data for the parent to report, not a failed helper.
 * @param {string} root
 * @param {ValidateRequest} request
 */
function validateSource(root, request) {
  const saved = readPackSources(root);
  if (!saved.ok) return { ok: false, refusal: { code: 'unavailable', message: saved.error, key: null } };
  if (saved.revision !== request.revision) {
    return { ok: false, refusal: { code: 'stale', message: 'The saved sources changed after they were read.', key: null } };
  }
  const builtins = builtinSources(root);
  try {
    const { entry, source } = validateNewSource({
      root, sources: saved.sources, builtins, location: request.location, ref: request.ref ?? undefined,
    });
    return { ok: true, entry, source: { key: source.key, type: source.type, root: source.root ?? null } };
  } catch (error) {
    if (!(error instanceof PackSourceError)) throw error;
    return { ok: false, refusal: { code: error.code, message: error.message, key: error.key } };
  }
}

/**
 * The one operation's answer. It settles only after any catalog copy Compose
 * acquired has been removed, and it never rejects.
 * @param {string} root
 */
async function handle(root) {
  try {
    const request = parseRequest(process.env[CATALOG_REQUEST_ENV]);
    if (request === null) return await readCatalog(root);
    return request.op === 'validate' ? validateSource(root, request) : await readSource(root, request);
  } catch (error) {
    return failure('catalog_unavailable', error instanceof Error ? error.message : 'The catalog could not be read.');
  }
}

/**
 * This helper's Git home as `packs.mjs` named it, or null. Only the folder that
 * `packs.mjs` makes qualifies: an absolute path that is a direct child of this
 * helper's own temporary root. An absent, relative, nested or foreign value,
 * such as one inherited from another process, never moves a home.
 * @param {string | undefined} value
 * @returns {string | null}
 */
function privateGitHome(value) {
  if (!value || !path.isAbsolute(value)) return null;
  const home = path.resolve(value);
  const parent = path.dirname(home);
  return parent !== home && parent === path.resolve(os.tmpdir()) ? home : null;
}

/**
 * Point every spelling of this process's home at the empty folder `home`: HOME
 * and USERPROFILE, and on Windows HOMEDRIVE and HOMEPATH too, because Git for
 * Windows and libcurl take theirs from any of them. Compose starts Git without
 * an environment of its own, so its Git inherits these.
 * @param {string} home
 */
function useGitHome(home) {
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  if (process.platform === 'win32') {
    const { root: drive } = path.parse(home);
    process.env.HOMEDRIVE = drive.replace(/[\\/]$/, '');
    process.env.HOMEPATH = home.slice(drive.length - 1);
  }
}

/**
 * Stop reader-originated process starts after the parent begins a tree kill.
 * Hold rather than throw: an early reader exit would race taskkill's last kill
 * and turn a clean stop into an unconfirmed one. This closes Compose's fallback
 * window, not every possible spawn inside a descendant or already past the gate.
 * Installed only by the main block, after any host bootstrap has loaded.
 */
function holdProcessStartsAfterStop() {
  const marker = path.join(os.tmpdir(), CATALOG_STOP_MARKER);
  const spawnSync = childProcess.spawnSync;
  childProcess.spawnSync = /** @type {typeof childProcess.spawnSync} */ (function (...args) {
    if (fs.existsSync(marker)) {
      const held = new Int32Array(new SharedArrayBuffer(4));
      for (;;) Atomics.wait(held, 0, 0);
    }
    return spawnSync.apply(this, args);
  });
  // Compose's remote acquisition and release-channel use the built-in module's
  // live named import, including a module Compose loads after this.
  syncBuiltinESMExports();
}

// One operation, never a command dispatcher. The launch always ends with this
// module's path and the workspace root, whether Node runs the module directly
// or a host entry imports it, so any other importer never starts a read.
const [entry, root] = process.argv.slice(-2);
if (typeof process.send === 'function' && entry && path.resolve(entry) === SELF && root) {
  // The one place a home changes: after any host bootstrap that imported this
  // module has loaded, and before `handle` can reach Compose and its Git. Without
  // a valid home of its own the helper reads nothing, rather than reach a source
  // with the user's home.
  const home = privateGitHome(process.env[CATALOG_GIT_HOME_ENV]);
  if (home) useGitHome(home);
  holdProcessStartsAfterStop();
  // Send only the settled answer, never a pending one. Awaiting at the top level
  // also keeps a host entry's import of this module pending until the answer is
  // on its way, as when the read was synchronous.
  const answer = home ? await handle(root)
    : failure('catalog_unavailable', 'The catalog reader was not given a Git home of its own.');
  // Exit explicitly: a host runtime may hold handles that would otherwise keep
  // a finished helper alive until the deadline kills it.
  process.send(answer, error => process.exit(error ? 1 : 0));
}

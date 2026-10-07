// @ts-check
/**
 * Private Canvas project read: the agents and skills a project keeps in its own
 * `dude-local-*` namespace, listed as the read-only rows of Installed.
 *
 * It lists the `dude-local-<name>.agent.md` files of `.github/agents` (with each
 * agent's matching `dude-local-<name>.support/` companions) and the
 * `dude-local-<name>` folders of `.github/skills` (entrypoint `SKILL.md`),
 * however they got there: Canvas import or by hand.
 * It never inspects a pack-owned, core or project-tier entry and never leaves
 * those two folders. It starts no process, makes no network request, keeps no
 * watcher, cache or persisted inventory, and writes nothing. It claims no
 * origin for an artifact and is never authority for a pack operation: pack
 * membership, requests and freshness stay with the profile and the pack read.
 *
 * Containment goes through the engine's no-symbolic-link resolver once per
 * collection and once per artifact root. Every descendant is judged by `lstat`
 * alone: no link is followed or read, and a link keeps its reason visible
 * instead of being counted as a readable file. An entrypoint is read through
 * one positioned read of its first 8 KiB, never as a whole file.
 *
 * Nothing is silently truncated. More than 256 artifacts withholds the whole
 * list; a per-artifact limit withholds only that row's files and count. The
 * result's coverage uses the pack read's `{state, reason, message}` shape.
 * `readProjectArtifacts` rejects only for cancellation or a defect; every
 * filesystem outcome is a reason in its result.
 *
 * Folder entries are read as bytes. A valid UTF-8 name decodes to the exact
 * name on disk, so it can be a path, a key and a lookup. A name that is not
 * valid UTF-8 has no text form: it is never turned into a lossy name or key and
 * is never looked up, because the lossy text names a different path. In a
 * collection it makes the whole list unavailable; inside an artifact it
 * withholds only that row's files and count. A present entry is never dropped.
 *
 * The relative engine imports resolve identically from the authored source
 * tree and from the projected runtime tree.
 */
import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatterScalars } from '../../../skills/dude-engine/lib/feature-identity.mjs';
import { isLocalPath } from '../../../skills/dude-engine/lib/ownership.mjs';
import { ENGINE_PATHS, resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

/**
 * A description or declared name: its text, or why there is none. Never an
 * invented value, and never the artifact's path identity.
 * @typedef {{ state: 'read', value: string } | { state: 'unavailable', reason: string, message: string }} ProjectField
 * @typedef {{ path: string, reason: string, message: string }} ProjectNotRead
 * `complete` lists every file; `partial` lists the regular files it read and
 * names each path that was not read; `withheld` lists none and has no count.
 * @typedef {{
 *   state: 'complete' | 'partial' | 'withheld', count: number | null, paths: string[] | null,
 *   notRead: ProjectNotRead[], reason: string | null, message: string | null,
 * }} ProjectFiles
 * @typedef {{
 *   key: string, type: 'agent' | 'skill', name: string, location: string,
 *   description: ProjectField, declaredName: ProjectField, files: ProjectFiles,
 * }} ProjectItem
 * @typedef {{ state: 'current' | 'empty' | 'unavailable' | 'stale', reason: string | null, message: string | null }} ProjectCoverage
 * @typedef {{
 *   type: 'agent' | 'skill', name: string, entry: string, directory: string, absolute: string,
 *   relative: string, kind: 'linked' | 'file' | 'directory' | 'unreadable',
 *   stat?: import('node:fs').BigIntStats, code?: string,
 * }} Candidate
 * @typedef {{ files: string[], notRead: ProjectNotRead[] }} Traversal
 */

/**
 * `files` bounds everything an artifact's Files list would show: a regular
 * file, and equally a link, special file or unreadable path that is named as
 * not read, so the list and its not-read notes together never exceed it. A
 * folder that was read is no entry of that list; folders are bounded only by
 * `depth`, the number of path segments below the artifact folder.
 */
const LIMITS = Object.freeze({
  artifacts: 256,
  prefixBytes: 8 * 1024,
  files: 128,
  depth: 12,
});

const COLLECTIONS = Object.freeze([
  { type: /** @type {const} */ ('agent'), directory: ENGINE_PATHS.AGENTS_DIR },
  { type: /** @type {const} */ ('skill'), directory: ENGINE_PATHS.SKILLS_DIR },
]);
const AGENT_SUFFIX = '.agent.md';
const SUPPORT_SUFFIX = '.support';
const SKILL_ENTRYPOINT = 'SKILL.md';
const LINKED = 'Linked; not read';
const DESCRIPTION_UNAVAILABLE = 'Description unavailable';
const PREFIX_KIB = `${LIMITS.prefixBytes / 1024} KiB`;

/** A condition that ends the whole read as a coverage, never as an exception. */
class ProjectFailure extends Error {
  /** @param {string} reason @param {string} message @param {'unavailable' | 'stale'} [state] */
  constructor(reason, message, state = 'unavailable') {
    super(message);
    this.reason = reason;
    this.state = state;
  }
}

/** A per-artifact condition that withholds that artifact's files and count. */
class FilesWithheld extends Error {
  /** @param {string} reason @param {string} message */
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

/** The entrypoint opened to something other than the file that was inspected. */
class EntrypointChanged extends Error {}

/**
 * A filesystem failure carries its system code and becomes a reason. Anything
 * else is a defect or a caller error and keeps propagating.
 * @param {unknown} error
 * @returns {string}
 */
function systemCode(error) {
  const code = /** @type {{ code?: unknown }} */ (error)?.code;
  if (typeof code !== 'string' || code === '' || code.startsWith('ERR_') || code === 'ABORT_ERR') throw error;
  return code;
}

/**
 * An unavailable field gives its reason code and a sentence for it. An
 * unavailable description also says so in the words the user reads, followed
 * by that specific reason, so it is never shown as "No description". The one
 * place a field is built keeps every route to it, entrypoint or folder defect,
 * carrying the same words.
 * @param {'description' | 'name'} key @param {string} reason @param {string} message @returns {ProjectField}
 */
const unavailable = (key, reason, message) => ({ state: 'unavailable', reason,
  message: key === 'description' ? `${DESCRIPTION_UNAVAILABLE}: ${message}` : message });

/** @param {string} reason @param {string} message */
const bothUnavailable = (reason, message) => ({
  description: unavailable('description', reason, message), declaredName: unavailable('name', reason, message),
});

/** @param {string} reason @param {string} message @returns {ProjectFiles} */
const withheldFiles = (reason, message) => ({
  state: 'withheld', count: null, paths: null, notRead: [], reason, message,
});

/** @param {string} file @param {string} reason @param {string} message @returns {ProjectNotRead} */
const skipped = (file, reason, message) => ({ path: file, reason, message });

/**
 * Code-unit order, so rows and files sort the same on every platform and locale.
 * @param {string} a @param {string} b
 */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The root's identity brackets the read, so a replaced workspace is stale
 * rather than a mixture of two. This is the same judgement the pack read makes.
 * A root that is missing, linked or not a folder has no identity.
 * @param {string} workspace
 * @returns {Promise<string | null>}
 */
async function rootIdentity(workspace) {
  try {
    const stat = await fs.promises.lstat(workspace, { bigint: true });
    return stat.isDirectory() && !stat.isSymbolicLink() ? `${stat.dev}:${stat.ino}` : null;
  } catch (error) {
    systemCode(error);
    return null;
  }
}

/** @param {import('node:fs').Dir} directory */
async function closeDirectory(directory) {
  try { await directory.close(); }
  catch (error) {
    // The iterator already closed a directory it read to its end.
    if (/** @type {{ code?: unknown }} */ (error)?.code !== 'ERR_DIR_CLOSED') throw error;
  }
}

/**
 * A folder opened with `encoding: 'buffer'` yields each entry's name as the
 * bytes on disk; the Node typings still declare a string.
 * @param {import('node:fs').Dirent} dirent
 * @returns {Buffer}
 */
function direntBytes(dirent) {
  return /** @type {Buffer} */ (/** @type {unknown} */ (dirent.name));
}

/**
 * Judge one directory entry of a collection by `lstat`. A link is an artifact
 * root that is listed but never opened; anything of the wrong kind is no
 * artifact of this type.
 * @param {typeof COLLECTIONS[number] & { absolute: string }} collection
 * @param {string} entry
 * @param {string} name
 * @param {AbortSignal} signal
 * @returns {Promise<Candidate | null>}
 */
async function classifyEntry(collection, entry, name, signal) {
  const absolute = path.join(collection.absolute, entry);
  const base = { type: collection.type, name, entry, directory: collection.directory, absolute,
    relative: `${collection.directory}/${entry}` };
  let stat;
  try { stat = await fs.promises.lstat(absolute, { bigint: true }); }
  catch (error) {
    signal.throwIfAborted();
    const code = systemCode(error);
    // A name that is valid UTF-8 is exactly the name on disk, so ENOENT means
    // the entry vanished since it was listed and is no longer an artifact.
    return code === 'ENOENT' ? null : { ...base, kind: 'unreadable', code };
  }
  if (stat.isSymbolicLink()) return { ...base, kind: 'linked' };
  if (collection.type === 'agent' && stat.isFile()) return { ...base, kind: 'file', stat };
  if (collection.type === 'skill' && stat.isDirectory()) return { ...base, kind: 'directory', stat };
  return null;
}

/**
 * Add one collection's local artifacts, streaming its directory and keeping
 * only matches, and detect an artifact over the limit as soon as it exists.
 * A missing collection is a known-empty read.
 *
 * Names arrive as bytes. A local name that is not valid UTF-8 cannot become an
 * artifact's name or key, and the entry is present in the project's own
 * namespace, so the read is unavailable rather than silently one row short.
 * Its kind is not judged: that would need a lookup by a name with no text form.
 * @param {typeof COLLECTIONS[number] & { absolute: string }} collection
 * @param {Candidate[]} found
 * @param {AbortSignal} signal
 */
async function listCollection(collection, found, signal) {
  signal.throwIfAborted();
  /** @type {import('node:fs').Dir} */
  let directory;
  try { directory = await fs.promises.opendir(collection.absolute, { encoding: 'buffer' }); }
  catch (error) {
    signal.throwIfAborted();
    const code = systemCode(error);
    if (code === 'ENOENT') return;
    if (code === 'ENOTDIR' || code === 'ELOOP') {
      throw new ProjectFailure('project_unsafe_path',
        `${collection.directory} is not a folder, so project agents and skills were not read.`);
    }
    throw new ProjectFailure('project_unreadable', `${collection.directory} could not be read (${code}).`);
  }
  try {
    // An empty listing never enters the loop, so cancellation is checked here too.
    signal.throwIfAborted();
    for await (const dirent of directory) {
      signal.throwIfAborted();
      const bytes = direntBytes(dirent);
      // Only the classifier below reads this text, and only for its ASCII
      // namespace prefix and suffix, which a lossy decoding leaves intact. It
      // is never a name, key or path unless the bytes are valid UTF-8.
      const entry = bytes.toString('utf8');
      const isAgent = collection.type === 'agent';
      if (isAgent && !entry.endsWith(AGENT_SUFFIX)) continue;
      // The shared namespace classifier decides what is local; no other tier is inspected.
      if (!isLocalPath(`${collection.directory}/${entry}`)) continue;
      if (!isUtf8(bytes)) {
        throw new ProjectFailure('project_name_not_utf8',
          `A project ${collection.type} in ${collection.directory} has a name that is not valid UTF-8, so none are listed rather than a partial list.`);
      }
      const name = isAgent ? entry.slice(0, -AGENT_SUFFIX.length) : entry;
      const candidate = await classifyEntry(collection, entry, name, signal);
      if (!candidate) continue;
      found.push(candidate);
      if (found.length > LIMITS.artifacts) {
        throw new ProjectFailure('project_limit',
          `More than ${LIMITS.artifacts} project agents and skills are present, so none are listed rather than a partial list.`);
      }
    }
  } catch (error) {
    if (error instanceof ProjectFailure) throw error;
    signal.throwIfAborted();
    throw new ProjectFailure('project_unreadable', `${collection.directory} could not be read (${systemCode(error)}).`);
  } finally {
    await closeDirectory(directory);
  }
}

/**
 * One positioned read of an entrypoint's first bytes. The opened handle must be
 * the very file `lstat` classified: where the platform has `O_NOFOLLOW` a link
 * swapped in after that check is refused at open, and everywhere the identity
 * comparison catches it. `O_NONBLOCK` keeps a special file swapped in from
 * hanging the open.
 * @param {string} absolute
 * @param {import('node:fs').BigIntStats} expected
 * @param {AbortSignal} signal
 * @returns {Promise<{ bytes: Buffer, truncated: boolean }>}
 */
async function readPrefix(absolute, expected, signal) {
  signal.throwIfAborted();
  const { O_RDONLY, O_NOFOLLOW = 0, O_NONBLOCK = 0 } = fs.constants;
  const handle = await fs.promises.open(absolute, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new EntrypointChanged();
    const buffer = Buffer.allocUnsafe(LIMITS.prefixBytes);
    let length = 0;
    // Never past the prefix, and never past the size this handle reported.
    while (length < LIMITS.prefixBytes && BigInt(length) < stat.size) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, length, LIMITS.prefixBytes - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    return { bytes: buffer.subarray(0, length), truncated: stat.size > BigInt(length) };
  } finally {
    await handle.close();
  }
}

/**
 * The shared parser's optionless mode ignores every line that is not a
 * top-level scalar, so a value that continues on an indented line must be
 * found here: the next non-blank line after its key decides.
 * @param {string[]} lines @param {number} keyLine @param {number} endLine
 */
function continues(lines, keyLine, endLine) {
  for (let index = keyLine + 1; index < endLine; index += 1) {
    if (lines[index].trim() !== '') return /^[ \t]/.test(lines[index]);
  }
  return false;
}

/**
 * @param {import('../../../skills/dude-engine/lib/feature-identity.mjs').ParsedFrontmatter} parsed
 * @param {'description' | 'name'} key
 * @returns {ProjectField}
 */
function scalarField(parsed, key) {
  const label = key === 'name' ? 'declared name' : 'description';
  const scalar = parsed.scalars.get(key);
  if (!scalar) return unavailable(key, 'missing', `The frontmatter does not declare a ${key}.`);
  if (!scalar.quote && /^[|>]/.test(scalar.value)) {
    return unavailable(key, 'block_scalar', `The ${label} is a block value, which is not read.`);
  }
  if (continues(parsed.lines, scalar.lineIndex, parsed.endIndex)) {
    return unavailable(key, 'multiline', `The ${label} spans several lines, which is not read.`);
  }
  if (!scalar.quote && /^[[{&*!%@`]/.test(scalar.value)) {
    return unavailable(key, 'not_plain_text', `The ${label} is not a plain text value.`);
  }
  if (scalar.value.trim() === '' || (!scalar.quote && /^(?:~|null|Null|NULL)$/.test(scalar.value))) {
    return unavailable(key, 'empty', `The frontmatter ${label} is empty.`);
  }
  return { state: 'read', value: scalar.value };
}

/**
 * Judge only the entrypoint's first bytes. A prefix that stops inside a line
 * keeps that line out of the judgement: it cannot be a delimiter or a value.
 * @param {{ bytes: Buffer, truncated: boolean }} prefix
 * @returns {{ description: ProjectField, declaredName: ProjectField }}
 */
function describeEntrypoint({ bytes, truncated }) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bothUnavailable('bom', 'The file starts with a byte order mark, so its frontmatter was not read.');
  }
  let text;
  try {
    // A cut prefix may end inside a character; only a complete bad sequence is an error.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, { stream: truncated });
  } catch {
    return bothUnavailable('invalid_utf8', 'The start of the file is not valid UTF-8, so its frontmatter was not read.');
  }
  if (truncated) text = text.slice(0, Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r')) + 1);
  let parsed;
  try { parsed = parseFrontmatterScalars(text); }
  catch (error) {
    const detail = error instanceof Error ? error.message : '';
    if (/opening delimiter/.test(detail)) return bothUnavailable('frontmatter_missing', 'The file has no frontmatter block at its start.');
    if (/closing delimiter/.test(detail)) {
      return truncated
        ? bothUnavailable('closing_delimiter_late', `The closing frontmatter delimiter is not within the first ${PREFIX_KIB}.`)
        : bothUnavailable('closing_delimiter_missing', 'The frontmatter block is not closed.');
    }
    if (/duplicate frontmatter key/.test(detail)) return bothUnavailable('duplicate_key', 'The frontmatter repeats a key.');
    if (/malformed quoted scalar/.test(detail)) return bothUnavailable('malformed_quote', 'The frontmatter has a malformed quoted value.');
    return bothUnavailable('frontmatter_unreadable', 'The frontmatter could not be read.');
  }
  return { description: scalarField(parsed, 'description'), declaredName: scalarField(parsed, 'name') };
}

/**
 * @param {string} absolute @param {import('node:fs').BigIntStats} expected @param {AbortSignal} signal
 * @returns {Promise<{ description: ProjectField, declaredName: ProjectField }>}
 */
async function readEntrypoint(absolute, expected, signal) {
  let prefix;
  try { prefix = await readPrefix(absolute, expected, signal); }
  catch (error) {
    signal.throwIfAborted();
    if (error instanceof EntrypointChanged) return bothUnavailable('changed_during_read', 'The file changed while it was being read.');
    const code = systemCode(error);
    // A link swapped in after `lstat` fails the no-follow open.
    return code === 'ELOOP' ? bothUnavailable('linked', LINKED)
      : bothUnavailable('read_failed', `The file could not be read (${code}).`);
  }
  return describeEntrypoint(prefix);
}

/** @param {Candidate} candidate @param {AbortSignal} signal */
async function readSkillEntrypoint(candidate, signal) {
  const absolute = path.join(candidate.absolute, SKILL_ENTRYPOINT);
  let stat;
  try { stat = await fs.promises.lstat(absolute, { bigint: true }); }
  catch (error) {
    signal.throwIfAborted();
    const code = systemCode(error);
    return code === 'ENOENT' ? bothUnavailable('entrypoint_missing', `${SKILL_ENTRYPOINT} is missing.`)
      : bothUnavailable('read_failed', `${SKILL_ENTRYPOINT} could not be read (${code}).`);
  }
  if (stat.isSymbolicLink()) return bothUnavailable('linked', LINKED);
  if (!stat.isFile()) return bothUnavailable('entrypoint_not_file', `${SKILL_ENTRYPOINT} is not a regular file.`);
  return readEntrypoint(absolute, stat, signal);
}

/**
 * Everything the Files list would show, a read file or a path named as not
 * read, counts toward the one file bound, so neither list can outgrow it. A
 * limit throws `FilesWithheld`, which withholds the row's whole list and count.
 * @param {Traversal} state
 */
function enforceFileBound(state) {
  if (state.files.length + state.notRead.length > LIMITS.files) {
    throw new FilesWithheld('file_limit', `More than ${LIMITS.files} files were found, so the file list and count are withheld.`);
  }
}

/** @param {Traversal} state @param {string} relative */
function addFile(state, relative) {
  state.files.push(relative);
  enforceFileBound(state);
}

/** @param {Traversal} state @param {string} relative @param {string} reason @param {string} message */
function addNotRead(state, relative, reason, message) {
  state.notRead.push(skipped(relative, reason, message));
  enforceFileBound(state);
}

/**
 * Walk one artifact folder depth-first by `lstat` alone, never following a
 * link. Entries are handled as they stream in and a subfolder is entered at
 * once, so no folder is held as a list of names: a flood of folders costs time
 * and is bounded by depth alone, while memory holds only the at most 129 paths
 * the file bound allows. The result is sorted afterwards (`listedFiles`), so a
 * complete list is the same on every filesystem. A limit withholds the whole
 * list; which limit is named can follow the order the filesystem lists in.
 *
 * A link, special file or unreadable path is recorded as not read and never
 * visited. A name that is not valid UTF-8 has no honest text, so it withholds
 * the list rather than being dropped or renamed. A name that was listed but is
 * gone when it is judged means the folder changed during the read: it is named
 * as not read, so a list that may have missed a renamed entry is never complete.
 * @param {AbortSignal} signal @param {Traversal} state
 * @param {string} absolute @param {string} relative @param {number} depth
 */
async function walk(signal, state, absolute, relative, depth) {
  signal.throwIfAborted();
  try {
    const directory = await fs.promises.opendir(absolute, { encoding: 'buffer' });
    try {
      signal.throwIfAborted();
      for await (const dirent of directory) {
        signal.throwIfAborted();
        // Any entry of a folder already at the deepest level lies beyond it.
        if (depth + 1 > LIMITS.depth) {
          throw new FilesWithheld('depth_limit', `Folders go deeper than ${LIMITS.depth} levels, so the file list and count are withheld.`);
        }
        const bytes = direntBytes(dirent);
        if (!isUtf8(bytes)) {
          throw new FilesWithheld('name_not_utf8', 'A file or folder name is not valid UTF-8, so the file list and count are withheld.');
        }
        const name = bytes.toString('utf8');
        const childAbsolute = path.join(absolute, name);
        const childRelative = `${relative}/${name}`;
        let stat;
        try { stat = await fs.promises.lstat(childAbsolute); }
        catch (error) {
          signal.throwIfAborted();
          const code = systemCode(error);
          if (code === 'ENOENT') addNotRead(state, childRelative, 'changed_during_read', 'Changed while it was being read.');
          else addNotRead(state, childRelative, 'read_failed', `Could not be read (${code}).`);
          continue;
        }
        if (stat.isSymbolicLink()) addNotRead(state, childRelative, 'linked', LINKED);
        else if (stat.isDirectory()) await walk(signal, state, childAbsolute, childRelative, depth + 1);
        else if (stat.isFile()) addFile(state, childRelative);
        else addNotRead(state, childRelative, 'not_regular', 'Not a regular file; not read.');
      }
    } finally {
      await closeDirectory(directory);
    }
  } catch (error) {
    if (error instanceof FilesWithheld) throw error;
    signal.throwIfAborted();
    // Only this folder's own open, read or close fails here: every other
    // filesystem outcome below it is handled where it happens.
    const message = `The folder could not be read (${systemCode(error)}).`;
    if (depth === 0) throw new FilesWithheld('unreadable', message);
    addNotRead(state, relative, 'read_failed', message);
  }
}

/** @param {Traversal} state @returns {ProjectFiles} */
function listedFiles(state) {
  const paths = [...state.files].sort();
  const missed = [...state.notRead].sort((a, b) => compare(a.path, b.path));
  return missed.length === 0
    ? { state: 'complete', count: paths.length, paths, notRead: [], reason: null, message: null }
    : { state: 'partial', count: paths.length, paths, notRead: missed, reason: 'descendants_not_read',
      message: 'Linked or unreadable paths were not read, so this list is not complete.' };
}

/**
 * @param {AbortSignal} signal @param {Traversal} state
 * @param {string} absolute @param {string} relative
 * @returns {Promise<ProjectFiles>}
 */
async function inventory(signal, state, absolute, relative) {
  try { await walk(signal, state, absolute, relative, 0); }
  catch (error) {
    if (error instanceof FilesWithheld) return withheldFiles(error.reason, error.message);
    throw error;
  }
  return listedFiles(state);
}

/**
 * An agent's files are its entrypoint plus its matching `.support/` folder. A
 * linked or unsafe companion folder is not read and keeps its reason; a plain
 * file of that name is no companion folder.
 * @param {string} workspace @param {Candidate} candidate @param {AbortSignal} signal
 * @returns {Promise<ProjectFiles>}
 */
async function agentFiles(workspace, candidate, signal) {
  /** @type {Traversal} */
  const state = { files: [candidate.relative], notRead: [] };
  const support = `${candidate.name}${SUPPORT_SUFFIX}`;
  const absolute = path.join(path.dirname(candidate.absolute), support);
  const relative = `${candidate.directory}/${support}`;
  let stat;
  try { stat = await fs.promises.lstat(absolute); }
  catch (error) {
    signal.throwIfAborted();
    const code = systemCode(error);
    if (code !== 'ENOENT') state.notRead.push(skipped(relative, 'read_failed', `Could not be read (${code}).`));
    return listedFiles(state);
  }
  if (stat.isSymbolicLink()) {
    state.notRead.push(skipped(relative, 'linked', LINKED));
    return listedFiles(state);
  }
  if (!stat.isDirectory()) return listedFiles(state);
  // The one containment check for this companion folder; its descendants are never resolved.
  try { resolveMutationPath(workspace, relative); }
  catch (error) {
    if (error instanceof TypeError) throw error;
    state.notRead.push(skipped(relative, 'unsafe_path', 'The path is unsafe, so it was not read.'));
    return listedFiles(state);
  }
  return inventory(signal, state, absolute, relative);
}

/**
 * @param {string} workspace @param {Candidate} candidate @param {AbortSignal} signal
 * @returns {Promise<ProjectItem>}
 */
async function readArtifact(workspace, candidate, signal) {
  const base = {
    key: `project:${candidate.type}:${candidate.name}`, type: candidate.type, name: candidate.name,
    location: candidate.relative,
  };
  /** @param {string} reason @param {string} message @returns {ProjectItem} */
  const identityOnly = (reason, message) => ({ ...base, ...bothUnavailable(reason, message), files: withheldFiles(reason, message) });
  if (candidate.kind === 'linked') return identityOnly('linked', LINKED);
  if (candidate.kind === 'unreadable') return identityOnly('read_failed', `Could not be read (${candidate.code}).`);
  // The one containment check for this artifact root; descendants are never resolved.
  try { resolveMutationPath(workspace, candidate.relative); }
  catch (error) {
    if (error instanceof TypeError) throw error;
    return identityOnly('unsafe_path', 'The path is unsafe, so it was not read.');
  }
  if (candidate.type === 'agent') {
    const fields = await readEntrypoint(candidate.absolute, /** @type {import('node:fs').BigIntStats} */ (candidate.stat), signal);
    return { ...base, ...fields, files: await agentFiles(workspace, candidate, signal) };
  }
  const fields = await readSkillEntrypoint(candidate, signal);
  const files = await inventory(signal, { files: [], notRead: [] }, candidate.absolute, candidate.relative);
  return { ...base, ...fields, files };
}

/**
 * @param {string} workspace @param {AbortSignal} signal
 * @returns {Promise<{ coverage: ProjectCoverage, items: ProjectItem[] | null }>}
 */
async function scan(workspace, signal) {
  const before = await rootIdentity(workspace);
  if (before === null) {
    throw new ProjectFailure('project_unsafe_path',
      'The workspace folder is missing, linked or not a folder, so project agents and skills were not read.');
  }
  // The one containment check for each collection; an unsafe one fails the whole read closed.
  const collections = COLLECTIONS.map(({ type, directory }) => {
    try { return { type, directory, absolute: resolveMutationPath(workspace, directory) }; }
    catch (error) {
      if (error instanceof TypeError) throw error;
      throw new ProjectFailure('project_unsafe_path',
        `${directory} is linked, not a folder, or outside the workspace, so project agents and skills were not read.`);
    }
  });
  /** @type {Candidate[]} */
  const candidates = [];
  for (const collection of collections) await listCollection(collection, candidates, signal);
  candidates.sort((a, b) => compare(a.name, b.name) || compare(a.type, b.type));
  /** @type {ProjectItem[]} */
  const items = [];
  for (const candidate of candidates) {
    signal.throwIfAborted();
    items.push(await readArtifact(workspace, candidate, signal));
  }
  signal.throwIfAborted();
  if (await rootIdentity(workspace) !== before) {
    throw new ProjectFailure('workspace_changed',
      'The workspace changed during the read. Reload to read one current snapshot.', 'stale');
  }
  return { coverage: { state: items.length ? 'current' : 'empty', reason: null, message: null }, items };
}

/**
 * Read every present project agent and skill once, uncached. Missing folders
 * and no matching entries are a known-empty read. An unsafe collection path, a
 * collection that cannot be read, more than 256 artifacts, a local entry whose
 * name is not valid UTF-8, or a workspace replaced mid-read is unavailable or
 * stale coverage with no `items`, never a partial list. Rows are ordered by
 * path-identity name, then type (agent before skill), and are plain text only.
 * Cancellation rejects with the signal's reason; every other filesystem outcome
 * is a reason in the result.
 * @param {string} root the workspace root
 * @param {AbortSignal} signal
 * @returns {Promise<{ coverage: ProjectCoverage, items: ProjectItem[] | null }>}
 */
export async function readProjectArtifacts(root, signal) {
  if (typeof root !== 'string' || root === '') throw new TypeError('A project root path is required.');
  if (!(signal instanceof AbortSignal)) throw new TypeError('An AbortSignal is required.');
  signal.throwIfAborted();
  try {
    return await scan(path.resolve(root), signal);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ProjectFailure) {
      return { coverage: { state: error.state, reason: error.reason, message: error.message }, items: null };
    }
    throw error;
  }
}

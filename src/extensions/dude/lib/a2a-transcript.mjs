// @ts-check
/**
 * Bounded local transcripts of `dude_a2a_conversation` operations, and their
 * read-only terminal view.
 *
 * Writing. Each operation records into one journal,
 * `<workspace>/.dude/state/a2a/<operationId>.jsonl`, created exclusively after
 * every path component was checked to be a plain directory inside the
 * workspace, beside a `.gitignore` marker that keeps the folder out of Git
 * without touching its index. One JSON record per line: {version: 1,
 * sequence, time (UTC), operationId, conversationId, kind, data}. `open`
 * writes an `opened` header with the approved correlation (profile, project,
 * peer pin, configuration digest) and the categories no record carries.
 * `append` hands one record to the operating system in one synchronous call
 * before it returns, so a caller can record each boundary before the
 * disclosure it records; nothing is flushed to disk (fsync). `close` writes a
 * final `closed` record, and throws when it cannot or the file does not close.
 *
 * Bounds. A journal never exceeds 1 MiB, and its last 16 KiB are kept for the
 * `terminal`, `cleanup`, `gap`, and `closed` records. A record that does not
 * fit its room, or cannot be serialized, is refused, and a `gap` record names
 * what was left out. At most ten conversations are retained, counting
 * journals and the asking side's capture receipts (`captures/<operationId>.json`,
 * at most 4 KiB each); nothing is rotated or deleted, so another conversation
 * is refused until the owner deletes old ones. The count is taken before an
 * exclusive create, so two providers opening at the same moment in one
 * workspace can each pass it. A write error ends the journal where it is:
 * reserved room is no proof the disk can take more, nothing is written after
 * it, and a journal without its `terminal` or `closed` record reads as
 * incomplete.
 *
 * Reading. `node a2a-transcript.mjs --root <workspace> --operation <id> [--follow]`
 * prints each complete record with terminal controls escaped, then whether
 * the journal is complete and, if not, why. `--follow` keeps printing records
 * as they are written until the `closed` record or an interrupt. Reading
 * opens the journal read-only, writes nothing, contacts no peer or session,
 * and acts on nothing a record says: record text is never an approval or an
 * instruction. Exit status: 0 complete, 1 incomplete or unreadable, 2 usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isMainModule } from '../../../skills/dude-engine/lib/text.mjs';
import { resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

/** Where journals and capture receipts live, below the workspace root. */
export const TRANSCRIPT_DIR = '.dude/state/a2a';
/** One journal's size, the room kept at its end for closing records, retained conversations, and each capture receipt's ceiling. */
export const TRANSCRIPT_LIMITS = Object.freeze({
  journalBytes: 1_048_576,
  reserveBytes: 16_384,
  conversations: 10,
  receiptBytes: 4_096,
});

const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KIND = /^[a-z][a-z_]{0,63}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECORD_KEYS = Object.freeze(['version', 'sequence', 'time', 'operationId', 'conversationId', 'kind', 'data']);
/** The records the reserve at the end of a journal is kept for. */
const CLOSING_KINDS = new Set(['terminal', 'cleanup', 'gap', 'closed']);
/** Records only this module writes; a caller cannot append them. */
const OWN_KINDS = new Set(['opened', 'gap', 'closed']);
const MARKER = '# Dude A2A transcripts and capture receipts: locally sensitive, kept until the owner deletes them.\n*\n';
/** What no record carries, stated in each header so the omission is explicit. */
const NEVER_RECORDED = Object.freeze(['credentials', 'tls_keys', 'http_headers', 'approval_codes', 'worker_prompt', 'model_reasoning', 'sdk_history',
  'refused_request_text']);
const POLL_MS = 100;
const READ_CHUNK = 65_536;
// C0 and C1 controls, DEL, line and paragraph separators, and bidirectional overrides.
const TERMINAL_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;
const USAGE = 'usage: node a2a-transcript.mjs --root <workspace> --operation <operationId> [--follow]';

/**
 * The approved correlation an operation is recorded under.
 * @typedef {object} RecordingStart
 * @property {string} operationId
 * @property {'ask' | 'receive'} role
 * @property {string} profileId
 * @property {string} projectId
 * @property {{label: string, certSha256: string}} peer The approved peer and its certificate pin.
 * @property {string} configDigest SHA-256 of the approved configuration file.
 * @property {number} contentBytes The approved per-message bound.
 */
/**
 * @typedef {object} TranscriptRecording
 * @property {string} path The journal's absolute path.
 * @property {(entry: {kind: string, conversationId: string | null, data: Record<string, unknown>}) => boolean} append
 *   True once the record was written; false when it was refused or the write failed.
 * @property {() => void} close Writes the `closed` record and closes the file; throws when either fails.
 */
/**
 * @typedef {object} TranscriptSummary
 * @property {string} file
 * @property {number} records Complete, readable records.
 * @property {{outcome: string, reason: string | null} | null} terminal
 * @property {boolean} closed
 * @property {Array<{sequence: number, omitted: string, bytes: number | null, reason: string}>} gaps
 * @property {boolean} complete
 * @property {string[]} problems Why the journal is incomplete, in reading order of concern.
 */

/** A recording that cannot start or end cleanly; `code` is the closed reason a caller may show. */
export class TranscriptError extends Error {
  /** @param {'recording_unavailable' | 'recording_full'} code @param {string} detail */
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {unknown} error @param {string} code */
function hasCode(error, code) {
  return isRecord(error) && error.code === code;
}

/** One output line with every terminal control escaped, then its own line break. @param {string} text */
function line(text) {
  const escaped = text.replace(TERMINAL_CONTROL, (character) => `\\u${/** @type {number} */ (character.codePointAt(0)).toString(16).padStart(4, '0')}`);
  return `${escaped}\n`;
}

/**
 * The journal of one operation below a workspace. Links, non-directory
 * parents, and escapes are refused.
 * @param {string} root @param {string} operationId
 */
export function journalPath(root, operationId) {
  if (typeof operationId !== 'string' || !UUID.test(operationId)) {
    throw new TranscriptError('recording_unavailable', 'an operation ID is a lowercase UUID');
  }
  try {
    return resolveMutationPath(root, `${TRANSCRIPT_DIR}/${operationId}.jsonl`);
  } catch (error) {
    throw new TranscriptError('recording_unavailable', `the journal path is unsafe: ${describe(error)}`);
  }
}

/**
 * The transcript folder with its ignore marker, created when missing. Every
 * component must be a plain directory inside the workspace, checked again
 * after creation; an existing marker must be a regular file and is never rewritten.
 * @param {string} root
 */
function prepareFolder(root) {
  try {
    const folder = resolveMutationPath(root, TRANSCRIPT_DIR);
    fs.mkdirSync(folder, { recursive: true });
    resolveMutationPath(root, TRANSCRIPT_DIR);
    if (!fs.lstatSync(folder).isDirectory()) throw new Error('it is not a plain directory');
    const marker = resolveMutationPath(root, `${TRANSCRIPT_DIR}/.gitignore`);
    /** @type {unknown} */
    let unwritten = null;
    try {
      fs.writeFileSync(marker, MARKER, { flag: 'wx' });
    } catch (error) {
      // An existing marker is kept as it is; only what it is gets checked.
      unwritten = error;
    }
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.lstatSync(marker);
    } catch {
      throw unwritten ?? new Error('its .gitignore marker cannot be created');
    }
    if (!stat.isFile()) throw new Error('its .gitignore marker is not a regular file');
    return folder;
  } catch (error) {
    throw new TranscriptError('recording_unavailable', `the transcript folder ${TRANSCRIPT_DIR} cannot be used: ${describe(error)}`);
  }
}

/**
 * Retained conversations by operation ID: journals and capture receipts. An
 * entry named like either must be a regular file within its bound. A missing
 * folder retains nothing.
 * @param {string} folder
 */
function retainedConversations(folder) {
  /** @type {fs.Stats | null} */
  let folderStat = null;
  try {
    folderStat = fs.lstatSync(folder);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  if (!folderStat) return 0;
  if (!folderStat.isDirectory()) throw new Error(`${TRANSCRIPT_DIR} is not a plain directory`);
  /** @type {Set<string>} */
  const operations = new Set();
  /** @param {string} directory @param {string} suffix @param {number} limit */
  const collect = (directory, suffix, limit) => {
    for (const name of fs.readdirSync(directory)) {
      const operationId = name.endsWith(suffix) ? name.slice(0, -suffix.length) : '';
      if (!UUID.test(operationId)) continue;
      const stat = fs.lstatSync(path.join(directory, name));
      if (!stat.isFile()) throw new Error(`${name} is not a regular file`);
      if (stat.size > limit) throw new Error(`${name} exceeds ${limit} bytes`);
      operations.add(operationId);
    }
  };
  collect(folder, '.jsonl', TRANSCRIPT_LIMITS.journalBytes);
  const captures = path.join(folder, 'captures');
  /** @type {fs.Stats | null} */
  let stat = null;
  try {
    stat = fs.lstatSync(captures);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  if (stat) {
    if (!stat.isDirectory()) throw new Error('captures is not a plain directory');
    collect(captures, '.json', TRANSCRIPT_LIMITS.receiptBytes);
  }
  return operations.size;
}

/**
 * One open journal. Records are written whole or the journal fails: nothing
 * is written after a write error, and partial bytes it left stay counted.
 * @param {number} fd @param {string} file @param {string} operationId
 * @param {() => number} now @param {typeof fs.writeSync} writeSync
 */
function openJournal(fd, file, operationId, now, writeSync) {
  let size = 0;
  let sequence = 0;
  let gaps = 0;
  /** The write error that ended the journal, if any. */
  let failure = '';
  let closed = false;
  /** @type {string | null} */
  let lastConversation = null;

  /** @param {Buffer} bytes */
  function writeLine(bytes) {
    let offset = 0;
    try {
      while (offset < bytes.length) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset);
        if (!(written > 0)) throw Object.assign(new Error('the write made no progress'), { code: 'EIO' });
        offset += written;
      }
    } catch (error) {
      failure = isRecord(error) && typeof error.code === 'string' ? error.code : 'write_failed';
      size += offset;
      return false;
    }
    size += bytes.length;
    return true;
  }

  /**
   * Write one record, or refuse it. A refused record leaves a gap record
   * while closing room remains.
   * @param {string} kind @param {string | null} conversationId @param {Record<string, unknown>} data
   */
  function put(kind, conversationId, data) {
    if (closed || failure) return false;
    if (conversationId !== null) lastConversation = conversationId;
    /** @type {Buffer | null} */
    let bytes = null;
    try {
      const record = { version: VERSION, sequence: sequence + 1, time: new Date(now()).toISOString(), operationId, conversationId, kind, data };
      bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    } catch {
      bytes = null;
    }
    const limit = CLOSING_KINDS.has(kind) ? TRANSCRIPT_LIMITS.journalBytes : TRANSCRIPT_LIMITS.journalBytes - TRANSCRIPT_LIMITS.reserveBytes;
    if (!bytes || size + bytes.length > limit) {
      if (kind !== 'gap' && put('gap', conversationId, { omitted: kind, bytes: bytes?.length ?? null, reason: bytes ? 'capacity' : 'unserializable' })) {
        gaps += 1;
      }
      return false;
    }
    if (!writeLine(bytes)) return false;
    sequence += 1;
    return true;
  }

  /** @type {TranscriptRecording} */
  const recording = {
    path: file,
    append(entry) {
      const valid = isRecord(entry) && typeof entry.kind === 'string' && KIND.test(entry.kind) && !OWN_KINDS.has(entry.kind)
        && (entry.conversationId === null || (typeof entry.conversationId === 'string' && UUID.test(entry.conversationId)))
        && isRecord(entry.data);
      if (valid) return put(entry.kind, entry.conversationId, entry.data);
      const kind = isRecord(entry) && typeof entry.kind === 'string' && KIND.test(entry.kind) ? entry.kind : 'unknown';
      if (put('gap', lastConversation, { omitted: kind, bytes: null, reason: 'invalid_record' })) gaps += 1;
      return false;
    },
    close() {
      if (closed) return;
      const wrote = put('closed', lastConversation, { gaps });
      closed = true;
      /** @type {unknown} */
      let closeError = null;
      try {
        fs.closeSync(fd);
      } catch (error) {
        closeError = error;
      }
      if (closeError) throw new TranscriptError('recording_unavailable', `the journal ${file} did not close: ${describe(closeError)}`);
      if (!wrote) {
        throw new TranscriptError('recording_unavailable', `the journal ${file} has no closed record${failure ? ` after a write error (${failure})` : ''}`);
      }
    },
  };
  return { recording, put, release: () => { closed = true; fs.closeSync(fd); } };
}

/**
 * The production recorder for one workspace. Making it touches nothing;
 * `open` prepares the folder, checks retention, creates the operation's
 * journal, and writes its header, or throws a `TranscriptError`.
 * @param {{root: string, now?: () => number, io?: {writeSync?: typeof fs.writeSync}}} options
 *   `io.writeSync` replaces the write call where a test needs a failing disk.
 */
export function createTranscriptRecorder({ root, now = Date.now, io = {} }) {
  const writeSync = io.writeSync ?? fs.writeSync;
  return {
    /** @param {RecordingStart} start @returns {TranscriptRecording} */
    open(start) {
      if (!isRecord(start) || typeof start.operationId !== 'string' || !UUID.test(start.operationId)) {
        throw new TranscriptError('recording_unavailable', 'a recording needs a lowercase UUID operation ID');
      }
      let folder = '';
      let retained = 0;
      try {
        folder = resolveMutationPath(root, TRANSCRIPT_DIR);
        retained = retainedConversations(folder);
      } catch (error) {
        throw new TranscriptError('recording_unavailable', `retained transcripts in ${TRANSCRIPT_DIR} cannot be counted: ${describe(error)}`);
      }
      // Counted before anything is created, so a refusal changes nothing.
      if (retained >= TRANSCRIPT_LIMITS.conversations) {
        throw new TranscriptError('recording_full', `${retained} conversations are retained in ${folder}; `
          + 'nothing is rotated, so delete old journals or receipts to record another');
      }
      prepareFolder(root);
      const file = journalPath(root, start.operationId);
      let fd;
      try {
        fd = fs.openSync(file, 'ax');
      } catch (error) {
        throw new TranscriptError('recording_unavailable', `the journal ${file} cannot be created: ${describe(error)}`);
      }
      const journal = openJournal(fd, file, start.operationId, now, writeSync);
      const header = {
        role: start.role,
        profileId: start.profileId,
        projectId: start.projectId,
        peer: { label: start.peer?.label, certSha256: start.peer?.certSha256 },
        configDigest: start.configDigest,
        contentBytes: start.contentBytes,
        limits: { ...TRANSCRIPT_LIMITS },
        neverRecorded: NEVER_RECORDED,
      };
      if (!journal.put('opened', null, header)) {
        try {
          journal.release();
        } catch {
          // The refusal below already reports that this journal is unusable.
        }
        throw new TranscriptError('recording_unavailable', `the journal ${file} header could not be written`);
      }
      return journal.recording;
    },
  };
}

/**
 * One complete line as a record of `operationId`, or null.
 * @param {Buffer} line @param {string} operationId
 * @returns {{sequence: number, time: string, conversationId: string | null, kind: string, data: Record<string, unknown>} | null}
 */
function parseRecord(line, operationId) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => Object.hasOwn(value, key))) return null;
  const { version, sequence, time, conversationId, kind, data } = value;
  if (version !== VERSION || typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1
    || typeof time !== 'string' || !ISO_TIME.test(time) || value.operationId !== operationId
    || !(conversationId === null || (typeof conversationId === 'string' && UUID.test(conversationId)))
    || typeof kind !== 'string' || !KIND.test(kind) || !isRecord(data)) {
    return null;
  }
  return { sequence, time, conversationId, kind, data };
}

/** @param {unknown} value */
function shortText(value) {
  return typeof value === 'string' && KIND.test(value) ? value : null;
}

/**
 * Print one journal's complete records through `write` as they can be read,
 * then one summary line, and resolve with the summary. With `follow`, waits
 * for more records until the `closed` record, a shrunk or oversized journal,
 * or `signal`. Only a partial final line is held back, and never more than
 * the journal bound; the journal is opened read-only and nothing is written
 * anywhere else.
 * @param {{root: string, operationId: string, follow?: boolean, write: (text: string) => void, signal?: AbortSignal, pollMs?: number}} options
 * @returns {Promise<TranscriptSummary>}
 */
export async function readTranscript({ root, operationId, follow = false, write, signal, pollMs = POLL_MS }) {
  const file = journalPath(root, operationId);
  const found = await fs.promises.lstat(file).catch(() => null);
  if (!found?.isFile()) throw new TranscriptError('recording_unavailable', `no journal is a regular file at ${file}`);
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const ordinaryRoom = TRANSCRIPT_LIMITS.journalBytes - TRANSCRIPT_LIMITS.reserveBytes;
  const state = {
    records: 0,
    last: 0,
    opened: false,
    /** @type {TranscriptSummary['terminal']} */
    terminal: null,
    closed: false,
    /** @type {TranscriptSummary['gaps']} */
    gaps: [],
    unreadable: 0,
    outOfSequence: false,
    afterClose: 0,
    /** @type {number[]} */
    inReserve: [],
    oversize: false,
    shrank: false,
    partialBytes: 0,
  };
  /** @param {Buffer} bytes One complete line without its newline. @param {number} end The file offset just after its newline. */
  const consume = (bytes, end) => {
    const record = parseRecord(bytes, operationId);
    if (!record) {
      state.unreadable += 1;
      write(line(`!! unreadable line after #${state.last} (${bytes.length} bytes)`));
      return;
    }
    if (state.closed) state.afterClose += 1;
    if (record.sequence !== state.last + 1) state.outOfSequence = true;
    if (record.sequence === 1 && record.kind === 'opened') state.opened = true;
    state.last = record.sequence;
    state.records += 1;
    if (!CLOSING_KINDS.has(record.kind) && end > ordinaryRoom) state.inReserve.push(record.sequence);
    const { data } = record;
    if (record.kind === 'terminal') state.terminal = { outcome: shortText(data.outcome) ?? 'unknown', reason: shortText(data.reason) };
    if (record.kind === 'gap') {
      state.gaps.push({
        sequence: record.sequence,
        omitted: shortText(data.omitted) ?? 'unknown',
        bytes: typeof data.bytes === 'number' ? data.bytes : null,
        reason: shortText(data.reason) ?? 'unknown',
      });
    }
    if (record.kind === 'closed') state.closed = true;
    const conversation = record.conversationId ? ` [${record.conversationId}]` : '';
    write(line(`#${record.sequence} ${record.time} ${record.kind}${conversation} ${JSON.stringify(data)}`));
  };
  try {
    write(line(`A2A transcript ${file}`));
    let position = 0;
    /** @type {Buffer} */
    let partial = Buffer.alloc(0);
    for (;;) {
      const { size } = await handle.stat();
      if (size < position) {
        state.shrank = true;
        break;
      }
      if (size > TRANSCRIPT_LIMITS.journalBytes) state.oversize = true;
      // Never read past the bound: one byte over it is enough to know.
      const end = Math.min(size, TRANSCRIPT_LIMITS.journalBytes + 1);
      while (position < end) {
        const buffer = Buffer.alloc(Math.min(READ_CHUNK, end - position));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        const chunk = buffer.subarray(0, bytesRead);
        let start = 0;
        for (let index = chunk.indexOf(0x0a); index !== -1; index = chunk.indexOf(0x0a, start)) {
          const complete = partial.length ? Buffer.concat([partial, chunk.subarray(start, index)]) : chunk.subarray(start, index);
          partial = Buffer.alloc(0);
          consume(complete, position + index + 1);
          start = index + 1;
        }
        partial = Buffer.concat([partial, chunk.subarray(start)]);
        position += bytesRead;
      }
      if (!follow || state.closed || state.oversize || signal?.aborted) break;
      try {
        await delay(pollMs, undefined, { signal });
      } catch {
        break;
      }
    }
    state.partialBytes = partial.length;
  } finally {
    await handle.close();
  }
  /** @type {string[]} */
  const problems = [];
  if (state.oversize) problems.push(`the journal exceeds ${TRANSCRIPT_LIMITS.journalBytes} bytes`);
  if (state.shrank) problems.push('the journal shrank while it was read');
  if (state.inReserve.length) problems.push(`records ${state.inReserve.map((sequence) => `#${sequence}`).join(', ')} entered the closing reserve`);
  if (!state.opened) problems.push('no opened header');
  for (const gap of state.gaps) problems.push(`gap at #${gap.sequence}: ${gap.omitted} left out (${gap.reason})`);
  if (state.unreadable) problems.push(`${state.unreadable} unreadable line${state.unreadable === 1 ? '' : 's'}`);
  if (state.outOfSequence) problems.push('records out of sequence');
  if (state.afterClose) problems.push('records after the closed record');
  if (!state.terminal) problems.push('no terminal record');
  if (state.partialBytes) problems.push(`an incomplete final record (${state.partialBytes} bytes)`);
  if (!state.closed) problems.push('not closed');
  /** @type {TranscriptSummary} */
  const summary = {
    file,
    records: state.records,
    terminal: state.terminal,
    closed: state.closed,
    gaps: state.gaps,
    complete: problems.length === 0,
    problems,
  };
  const outcome = state.terminal ? `outcome ${state.terminal.outcome}${state.terminal.reason ? ` (${state.terminal.reason})` : ''}` : '';
  write(line(summary.complete ? `-- journal complete: ${state.records} records; ${outcome}` : `-- journal INCOMPLETE: ${problems.join('; ')}`));
  return summary;
}

/** @param {string[]} argv @returns {{root: string, operationId: string, follow: boolean} | null} */
function parseCli(argv) {
  /** @type {Map<string, string>} */
  const values = new Map();
  let follow = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--follow' && !follow) {
      follow = true;
      continue;
    }
    const value = argv[index + 1];
    if ((option !== '--root' && option !== '--operation') || values.has(option) || !value || value.startsWith('--')) return null;
    values.set(option, value);
    index += 1;
  }
  const root = values.get('--root');
  const operationId = values.get('--operation');
  if (!root || !operationId || !UUID.test(operationId)) return null;
  return { root: path.resolve(root), operationId, follow };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (!options) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  try {
    const summary = await readTranscript({ ...options, signal: controller.signal, write: (text) => { process.stdout.write(text); } });
    process.exitCode = summary.complete ? 0 : 1;
  } catch (error) {
    process.stderr.write(line(`[FAIL] ${error instanceof TranscriptError ? error.message : `the journal cannot be read: ${describe(error)}`}`));
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) await main();

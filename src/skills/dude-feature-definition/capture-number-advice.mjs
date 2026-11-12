// @ts-check
/**
 * Optional peer number advice for one first capture:
 * `publish-first-capture.mjs ... --number-advice <absolute-staged-advice-file>`.
 *
 * The advice file is staged only after the asking owner explicitly decides to
 * use one recorded `dude_a2a_conversation` answer for this capture. It is
 * closed version-1 JSON:
 *
 *   {"version": 1, "slug", "ledgerSha256", "workspace", "projectId",
 *    "conversationId", "operationId", "questionId", "exchangeId",
 *    "peerCertSha256", "reply": {"sequence", "sha256"}, "observedMaximum",
 *    "reason"}
 *
 * The answer's `advice.capture` supplies every field except three the owner
 * adds: `ledgerSha256`, the SHA-256 of the exact staged ledger bytes;
 * `workspace`, this workspace root's canonical absolute path as
 * `fs.realpathSync.native` resolves it; and `reason`, why the owner uses the
 * advice, as 1 to 512 UTF-8 bytes of message text.
 *
 * Everything is checked before the publisher's authoritative inventory and
 * before any write. The advice must be a bounded regular file naming the
 * staged draft and this workspace. Its journal is derived from the operation
 * ID below the root, `.dude/state/a2a/<operationId>.jsonl`, never from a
 * caller path, and must hold exactly one complete asking conversation that
 * ended in this answer: its eight records in sequence, without a gap, closed
 * cleanly. The header's role, project, and peer pin, the request for this
 * slug, the recorded question ID, and the reply's exchange must match the
 * advice. The reply's envelope, excerpt hashes, conclusion, and cited maximum
 * are checked again with the asker's own validators, and it must be the reply
 * the asker validated at receipt: the record at `reply.sequence` whose reply,
 * as that record serializes it, has SHA-256 `reply.sha256`. A conversation
 * advises one capture: its receipt must not exist yet.
 *
 * The publisher then re-inventories locally and takes
 * `max(fresh local maximum, accepted peer observed maximum) + 1`, never filling
 * a gap and stopping above 999. In the same file transaction as the ledger it
 * creates the receipt `.dude/state/a2a/captures/<operationId>.json` (at most
 * 4 KiB), which records the correlation and digests, the tentative number,
 * the fresh local maximum, the peer's observation, the chosen number and
 * exact path, and whether the advice raised the number above the local-only
 * result; local drift that dominates the advice records `influence: "none"`.
 * The receipt shares its conversation's retained transcript slot; nothing is
 * rotated or deleted.
 *
 * A journal, digest, or peer text is evidence, not permission or authorship:
 * validation revives no A2A grant, and the capture still needs current local
 * authority. The peer's observation is partial knowledge of its own approved
 * records, never a reservation or a global inventory. Nothing here reads a
 * peer's files or imports a peer's idea.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import { readAdvice as checkRecordedReply, readRequest as checkRecordedRequest } from '../../extensions/dude/lib/a2a-collaboration.mjs';
import { TRANSCRIPT_DIR, TRANSCRIPT_LIMITS, journalPath } from '../../extensions/dude/lib/a2a-transcript.mjs';
import { isMessageText, readAnswer } from '../../extensions/dude/lib/a2a-transport.mjs';

/** The staged advice file's and the owner's reason's byte bounds. */
export const NUMBER_ADVICE_LIMITS = Object.freeze({ fileBytes: 4_096, reasonBytes: 512 });
/** Capture receipts, below the workspace root, beside the transcripts they belong to. */
export const RECEIPT_DIR = `${TRANSCRIPT_DIR}/captures`;

const MAX_NUMBER = 999;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ADVICE_KEYS = Object.freeze(['version', 'slug', 'ledgerSha256', 'workspace', 'projectId', 'conversationId', 'operationId',
  'questionId', 'exchangeId', 'peerCertSha256', 'reply', 'observedMaximum', 'reason']);
const RECORD_KEYS = Object.freeze(['version', 'sequence', 'time', 'operationId', 'conversationId', 'kind', 'data']);
/** Every record of one complete asking conversation that ended in an answer, in order. */
const ANSWERED = Object.freeze(['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated',
  'terminal', 'closed']);
const READ_CHUNK = 65_536;

/**
 * The staged advice, as the closed shape guarantees it.
 * @typedef {object} NumberAdvice
 * @property {1} version
 * @property {string} slug
 * @property {string} ledgerSha256
 * @property {string} workspace
 * @property {string} projectId
 * @property {string} conversationId
 * @property {string} operationId
 * @property {string} questionId
 * @property {string} exchangeId
 * @property {string} peerCertSha256
 * @property {{sequence: number, sha256: string}} reply
 * @property {number} observedMaximum
 * @property {string} reason
 */
/**
 * Advice that matched its staged draft, this workspace, and its own recorded
 * conversation, with what that conversation recorded.
 * @typedef {NumberAdvice & {adviceSha256: string, configDigest: string, tentativeNumber: number, citedFiles: number}} AcceptedAdvice
 */
/**
 * @typedef {object} AdvisedSelection
 * @property {number} numberValue
 * @property {string} number The chosen number, zero-padded.
 * @property {number} freshLocalMaximum
 * @property {number} localOnlyNumber What the ordinary command would have chosen from the same inventory.
 * @property {'raised' | 'none'} influence `raised` only when the peer observation made the number exceed the local-only one.
 */
/**
 * @typedef {object} RecordedFacts
 * @property {string} configDigest
 * @property {number} tentativeNumber
 * @property {import('../../extensions/dude/lib/a2a-collaboration.mjs').AdviceRequest | null} request
 * @property {string} requestText
 * @property {string} replySha256
 * @property {number} citedFiles
 */

/** @param {string} detail */
function refuse(detail) {
  return new Error(`number advice refused: ${detail}`);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} keys @returns {value is Record<string, unknown>} */
function exactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
function integer(value, min, max) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** @param {unknown} value @returns {value is string} */
function isSha256(value) {
  return typeof value === 'string' && SHA256.test(value);
}

/** @param {unknown} value @returns {value is string} */
function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

/** @param {Buffer | string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One regular file, opened without following a link and checked again once
 * open; anything over `limit` bytes is refused, never truncated.
 * @param {string} file @param {number} limit @param {string} what
 */
function openBounded(file, limit, what) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw refuse(`${what} cannot be read`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw refuse(`${what} must be a regular file`);
  if (stat.size > limit) throw refuse(`${what} exceeds ${limit} bytes`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const opened = fs.fstatSync(fd);
  if (!opened.isFile() || opened.size > limit) {
    fs.closeSync(fd);
    throw refuse(`${what} must be a regular file within ${limit} bytes`);
  }
  return fd;
}

/**
 * Hand each complete line of a bounded file to `onLine` as it is read,
 * holding at most one partial line. Returns the byte count of an unterminated
 * final line.
 * @param {string} file @param {number} limit @param {string} what @param {(line: Buffer) => void} onLine
 */
function readLines(file, limit, what, onLine) {
  const fd = openBounded(file, limit, what);
  try {
    const chunk = Buffer.alloc(READ_CHUNK);
    let position = 0;
    /** @type {Buffer} */
    let partial = Buffer.alloc(0);
    for (;;) {
      const read = fs.readSync(fd, chunk, 0, chunk.length, position);
      if (!read) break;
      position += read;
      if (position > limit) throw refuse(`${what} exceeds ${limit} bytes`);
      const view = chunk.subarray(0, read);
      let start = 0;
      for (let index = view.indexOf(0x0a); index !== -1; index = view.indexOf(0x0a, start)) {
        onLine(partial.length ? Buffer.concat([partial, view.subarray(start, index)]) : Buffer.from(view.subarray(start, index)));
        partial = Buffer.alloc(0);
        start = index + 1;
      }
      partial = Buffer.concat([partial, view.subarray(start)]);
    }
    return partial.length;
  } finally {
    fs.closeSync(fd);
  }
}

/** @param {Buffer} bytes @param {string} what @returns {unknown} */
function parseJson(bytes, what) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw refuse(`${what} is not UTF-8 JSON`);
  }
}

/**
 * The closed version-1 advice, or the first field that is missing, unknown, or invalid.
 * @param {unknown} value @returns {NumberAdvice}
 */
function readAdviceShape(value) {
  if (!isRecord(value)) throw refuse('the advice file is not a JSON object');
  const unknown = Object.keys(value).find((key) => !ADVICE_KEYS.includes(key));
  if (unknown !== undefined) throw refuse(`unknown field ${JSON.stringify(unknown)}`);
  const missing = ADVICE_KEYS.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) throw refuse(`missing field ${missing}`);
  const reply = value.reply;
  /** @type {Array<[string, boolean]>} */
  const fields = [
    ['version', value.version === 1],
    ['slug', typeof value.slug === 'string' && SLUG.test(value.slug)],
    ['ledgerSha256', isSha256(value.ledgerSha256)],
    ['workspace', typeof value.workspace === 'string' && path.isAbsolute(value.workspace)],
    ['projectId', typeof value.projectId === 'string' && PROJECT_ID.test(value.projectId)],
    ['conversationId', isUuid(value.conversationId)],
    ['operationId', isUuid(value.operationId)],
    ['questionId', isUuid(value.questionId)],
    ['exchangeId', isUuid(value.exchangeId)],
    ['peerCertSha256', isSha256(value.peerCertSha256)],
    ['reply', exactKeys(reply, ['sequence', 'sha256']) && integer(reply.sequence, 1, Number.MAX_SAFE_INTEGER) && isSha256(reply.sha256)],
    ['observedMaximum', integer(value.observedMaximum, 0, MAX_NUMBER)],
    ['reason', isMessageText(value.reason) && Buffer.byteLength(value.reason, 'utf8') <= NUMBER_ADVICE_LIMITS.reasonBytes],
  ];
  const invalid = fields.find(([, valid]) => !valid);
  if (invalid) throw refuse(`invalid field ${invalid[0]}`);
  return /** @type {NumberAdvice} */ (value);
}

/**
 * One journal line as a record of `operationId`, or null; the same envelope
 * the transcript writes.
 * @param {Buffer} line @param {string} operationId
 * @returns {{sequence: number, conversationId: string | null, kind: string, data: Record<string, unknown>} | null}
 */
function parseRecord(line, operationId) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
  } catch {
    return null;
  }
  if (!exactKeys(value, RECORD_KEYS) || value.version !== 1 || !integer(value.sequence, 1, Number.MAX_SAFE_INTEGER)
    || typeof value.time !== 'string' || !ISO_TIME.test(value.time) || value.operationId !== operationId
    || !(value.conversationId === null || isUuid(value.conversationId)) || typeof value.kind !== 'string' || !isRecord(value.data)) {
    return null;
  }
  return { sequence: value.sequence, conversationId: value.conversationId, kind: value.kind, data: value.data };
}

/**
 * The request body's message, when the body is the JSON the transport wrote.
 * @param {unknown} body @returns {Record<string, unknown> | null}
 */
function requestMessage(body) {
  if (typeof body !== 'string') return null;
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const params = isRecord(value) ? value.params : null;
  return isRecord(params) && isRecord(params.message) ? params.message : null;
}

/**
 * What each record of an answered asking conversation must say for this
 * advice. Each check throws its own refusal.
 * @type {Record<string, (data: Record<string, unknown>, advice: NumberAdvice, facts: RecordedFacts, sequence: number) => void>}
 */
const CHECKS = {
  opened(data, advice, facts) {
    if (data.role !== 'ask') throw refuse('its journal is not an asking conversation');
    if (data.projectId !== advice.projectId) throw refuse('its projectId is not the project its conversation was approved for');
    if (!isRecord(data.peer) || data.peer.certSha256 !== advice.peerCertSha256) {
      throw refuse('its peerCertSha256 is not the peer pin its conversation was approved with');
    }
    if (!isSha256(data.configDigest)) throw refuse('its journal header has no approved configuration digest');
    facts.configDigest = data.configDigest;
  },
  accepted(data, advice, facts) {
    if (!exactKeys(data, ['role', 'budgetMs', 'slug', 'tentativeNumber']) || data.role !== 'ask'
      || !integer(data.tentativeNumber, 1, MAX_NUMBER)) {
      throw refuse('its journal accepted record is malformed');
    }
    if (data.slug !== advice.slug) throw refuse(`its conversation asked about slug ${String(data.slug)}, not ${advice.slug}`);
    facts.tentativeNumber = data.tentativeNumber;
  },
  request_prepared(data, advice, facts) {
    const parsed = exactKeys(data, ['text']) && typeof data.text === 'string'
      ? checkRecordedRequest(data.text, advice.projectId) : { ok: /** @type {const} */ (false), reason: 'malformed' };
    if (!parsed.ok) throw refuse(`its recorded request is not this project's number_advice question (${parsed.reason})`);
    const { request } = parsed;
    if (request.conversationId !== advice.conversationId || request.slug !== advice.slug
      || request.tentativeNumber !== facts.tentativeNumber) {
      throw refuse('its recorded request does not name its conversation, slug, and tentative number');
    }
    facts.request = request;
    facts.requestText = /** @type {string} */ (data.text);
  },
  request_write_started(data, advice, facts) {
    const message = exactKeys(data, ['body']) ? requestMessage(data.body) : null;
    if (!message || message.messageId !== advice.questionId) throw refuse("its questionId is not the recorded request's message ID");
    const parts = message.parts;
    if (!Array.isArray(parts) || parts.length !== 1 || !isRecord(parts[0]) || parts[0].text !== facts.requestText) {
      throw refuse('its recorded request body does not carry the recorded request');
    }
  },
  reply_received(data, advice, facts, sequence) {
    const reply = exactKeys(data, ['reply']) ? data.reply : null;
    if (!exactKeys(reply, ['outcome', 'exchangeId', 'conclusion', 'limitations', 'evidence', 'questionId'])) {
      throw refuse('its recorded reply is not an answer');
    }
    if (reply.questionId !== advice.questionId) throw refuse('its recorded reply answers another question');
    const { questionId, ...envelope } = reply;
    // Recomputes each excerpt's size and hash, as the asker's transport did at receipt.
    const answer = readAnswer(envelope);
    if (!answer) throw refuse('its recorded reply is not a valid answer envelope with matching excerpt hashes');
    if (answer.exchangeId !== advice.exchangeId) throw refuse("its exchangeId is not the recorded reply's exchange");
    const checked = checkRecordedReply({ ...answer, questionId: advice.questionId },
      /** @type {NonNullable<RecordedFacts['request']>} */ (facts.request));
    if (!checked.ok) throw refuse(`its recorded reply is not valid number advice (${checked.reason})`);
    if (checked.observedMaximum !== advice.observedMaximum) {
      throw refuse(`its observedMaximum ${advice.observedMaximum} is not the recorded reply's ${checked.observedMaximum}`);
    }
    const digest = sha256(JSON.stringify(reply));
    if (advice.reply.sequence !== sequence || advice.reply.sha256 !== digest) {
      throw refuse(`its reply is not the recorded reply: record ${sequence} has SHA-256 ${digest}`);
    }
    facts.replySha256 = digest;
    facts.citedFiles = checked.files.length;
  },
  reply_validated(data, advice, facts) {
    if (!exactKeys(data, ['observedMaximum', 'reply']) || !exactKeys(data.reply, ['sequence', 'sha256'])
      || data.observedMaximum !== advice.observedMaximum || data.reply.sequence !== advice.reply.sequence
      || data.reply.sha256 !== facts.replySha256) {
      throw refuse('its asker did not validate this reply and maximum at receipt');
    }
  },
  terminal(data) {
    if (!exactKeys(data, ['outcome', 'reason', 'delivery']) || data.outcome !== 'answer' || data.reason !== null
      || data.delivery !== 'reached_peer') {
      throw refuse('its conversation did not end in this answer');
    }
  },
  closed(data) {
    if (data.gaps !== 0) throw refuse('its journal recorded gaps');
  },
};

/**
 * Check the operation's own journal, record by record, against the advice.
 * @param {string} root @param {NumberAdvice} advice @returns {RecordedFacts}
 */
function readRecordedAnswer(root, advice) {
  /** @type {string} */
  let file;
  try {
    file = journalPath(root, advice.operationId);
  } catch (error) {
    throw refuse(`its journal cannot be used (${describe(error)})`);
  }
  const label = `${TRANSCRIPT_DIR}/${advice.operationId}.jsonl`;
  /** @type {RecordedFacts} */
  const facts = { configDigest: '', tentativeNumber: 0, request: null, requestText: '', replySha256: '', citedFiles: 0 };
  let count = 0;
  const unterminated = readLines(file, TRANSCRIPT_LIMITS.journalBytes, `the journal ${label}`, (line) => {
    count += 1;
    const expected = ANSWERED[count - 1];
    if (!expected) throw refuse(`the journal ${label} has records after its closed record`);
    const record = parseRecord(line, advice.operationId);
    if (!record) throw refuse(`the journal ${label} record ${count} is unreadable`);
    if (record.sequence !== count) throw refuse(`the journal ${label} record ${count} is out of sequence`);
    if (record.kind !== expected) {
      throw refuse(`the journal ${label} record ${count} is ${record.kind}, not ${expected}: it is not one complete answered conversation`);
    }
    if (record.conversationId !== (expected === 'opened' ? null : advice.conversationId)) {
      throw refuse(`the journal ${label} record ${count} belongs to another conversation`);
    }
    CHECKS[expected](record.data, advice, facts, count);
  });
  if (unterminated) throw refuse(`the journal ${label} ends with an incomplete record`);
  if (count < ANSWERED.length) {
    throw refuse(`the journal ${label} has no ${ANSWERED[count]} record: it is not one complete answered conversation`);
  }
  return facts;
}

/**
 * The workspace-relative receipt path of one asking operation.
 * @param {string} operationId
 */
export function receiptPath(operationId) {
  return `${RECEIPT_DIR}/${operationId}.json`;
}

/**
 * Read and check one staged advice file for the first capture of `slug`
 * from the exact staged `ledger` bytes, before anything is written. Throws
 * with why it is refused; nothing falls back to an ordinary capture.
 * @param {{root: string, slug: string, ledger: Buffer, file: string}} options `file` is the absolute advice path.
 * @returns {AcceptedAdvice}
 */
export function readNumberAdvice({ root, slug, ledger, file }) {
  const limit = NUMBER_ADVICE_LIMITS.fileBytes;
  const fd = openBounded(file, limit, 'the advice file');
  const buffer = Buffer.alloc(limit + 1);
  let count = 0;
  try {
    while (count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (!read) break;
      count += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  if (count > limit) throw refuse(`the advice file exceeds ${limit} bytes`);
  const bytes = buffer.subarray(0, count);
  const advice = readAdviceShape(parseJson(bytes, 'the advice file'));
  if (advice.slug !== slug) throw refuse(`it is for slug ${advice.slug}, not ${slug}`);
  if (advice.ledgerSha256 !== sha256(ledger)) throw refuse('its ledgerSha256 is not the SHA-256 of the staged ledger bytes');
  /** @type {string} */
  let canonical;
  try {
    canonical = fs.realpathSync.native(path.resolve(root));
  } catch {
    throw refuse('the workspace root cannot be resolved');
  }
  if (advice.workspace !== canonical) throw refuse(`its workspace is not this workspace's canonical root ${canonical}`);
  const receipt = receiptPath(advice.operationId);
  /** @type {fs.Stats | null} */
  let existing = null;
  try {
    existing = fs.lstatSync(resolveMutationPath(root, receipt), { throwIfNoEntry: false }) ?? null;
  } catch (error) {
    throw refuse(`its receipt ${receipt} cannot be created (${describe(error)})`);
  }
  if (existing) throw refuse(`its conversation already advised a capture: ${receipt} exists`);
  const facts = readRecordedAnswer(root, advice);
  return {
    ...advice,
    adviceSha256: sha256(bytes),
    configDigest: facts.configDigest,
    tentativeNumber: facts.tentativeNumber,
    citedFiles: facts.citedFiles,
  };
}

/**
 * The advised lifecycle number for a clean inventory whose next local number
 * is `localNext`: one above the larger of the fresh local maximum and the
 * accepted peer observation. Never fills a gap; stops above 999.
 * @param {Pick<AcceptedAdvice, 'observedMaximum'>} advice @param {number} localNext
 * @returns {AdvisedSelection}
 */
export function chooseAdvisedNumber(advice, localNext) {
  if (!integer(localNext, 1, MAX_NUMBER)) throw new Error('the fresh local inventory has no next lifecycle number');
  const numberValue = Math.max(localNext, advice.observedMaximum + 1);
  if (numberValue > MAX_NUMBER) {
    throw new Error(`lifecycle identity range 001-999 is exhausted by the accepted peer observation ${advice.observedMaximum}`);
  }
  return {
    numberValue,
    number: String(numberValue).padStart(3, '0'),
    freshLocalMaximum: localNext - 1,
    localOnlyNumber: localNext,
    influence: numberValue > localNext ? 'raised' : 'none',
  };
}

/**
 * The receipt the publisher creates beside `ideaPath`, as its
 * workspace-relative path and exact bytes.
 * @param {AcceptedAdvice} advice @param {AdvisedSelection} selection @param {string} ideaPath
 * @returns {{path: string, bytes: Buffer}}
 */
export function captureReceipt(advice, selection, ideaPath) {
  const receipt = {
    version: 1,
    kind: 'number_advice_receipt',
    ideaPath,
    slug: advice.slug,
    ledgerSha256: advice.ledgerSha256,
    advice: { sha256: advice.adviceSha256, reason: advice.reason },
    conversation: {
      projectId: advice.projectId,
      operationId: advice.operationId,
      conversationId: advice.conversationId,
      questionId: advice.questionId,
      exchangeId: advice.exchangeId,
      peerCertSha256: advice.peerCertSha256,
      configDigest: advice.configDigest,
      reply: { sequence: advice.reply.sequence, sha256: advice.reply.sha256 },
    },
    selection: {
      tentativeNumber: advice.tentativeNumber,
      freshLocalMaximum: selection.freshLocalMaximum,
      peerObservedMaximum: advice.observedMaximum,
      peerCitedFiles: advice.citedFiles,
      localOnlyNumber: selection.localOnlyNumber,
      chosenNumber: selection.numberValue,
      influence: selection.influence,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (bytes.length > TRANSCRIPT_LIMITS.receiptBytes) {
    throw refuse(`its receipt would exceed ${TRANSCRIPT_LIMITS.receiptBytes} bytes`);
  }
  return { path: receiptPath(advice.operationId), bytes };
}

// @ts-check
/**
 * Bounded, anonymous GitHub reads and the Git object checks applied to what they
 * return. Two readers share them: the directory importer
 * (`dude-bundle-import/lib/directory-source.mjs`) and pack acquisition
 * (`dude-compose/lib/pack-acquisition.mjs`). Each passes its own fixed budget and
 * path rules; nothing here chooses a limit, repository, ref or path policy.
 *
 * Every request is a GET to `api.github.com` or `raw.githubusercontent.com` with
 * only the headers its caller names, omitted credentials and refused redirects. No
 * token, credential helper, proxy or Git configuration is read. A body is read as a
 * stream and stopped at its budget even when Content-Length is absent or false.
 *
 * Dependency-free ESM (node:* only). Targets Node >= 20.
 */
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';

/** The JSON media type and API version every metadata request names. */
export const GITHUB_API_HEADERS = Object.freeze({
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
});

const GIT_OBJECT_ID = /^[0-9a-f]{40}$/;
const GITHUB_ORIGINS = Object.freeze(['https://api.github.com/', 'https://raw.githubusercontent.com/']);
const BUDGET_LIMITS = Object.freeze(['maxRequests', 'maxResponseBytes', 'maxTotalBytes', 'requestTimeoutMs']);

/**
 * @typedef {{
 *   kind: 'metadata' | 'raw',
 *   maxRequests: number,
 *   maxResponseBytes: number,
 *   maxTotalBytes: number,
 *   requestTimeoutMs: number,
 *   requests: number,
 *   bytes: number,
 * }} ReadBudget
 */

/**
 * One class of reads with fixed limits. Its request count and actual body bytes
 * are shared by every request made against it, including concurrent ones.
 * @param {'metadata' | 'raw'} kind
 * @param {{ maxRequests: number, maxResponseBytes: number, maxTotalBytes: number, requestTimeoutMs: number }} limits
 * @returns {ReadBudget}
 */
export function createReadBudget(kind, limits) {
  if (kind !== 'metadata' && kind !== 'raw') {
    throw new TypeError('GitHub read budget kind must be metadata or raw');
  }
  for (const name of BUDGET_LIMITS) {
    const value = limits?.[/** @type {keyof typeof limits} */ (name)];
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`GitHub ${kind} budget ${name} must be a positive safe integer`);
    }
  }
  return {
    kind,
    maxRequests: limits.maxRequests,
    maxResponseBytes: limits.maxResponseBytes,
    maxTotalBytes: limits.maxTotalBytes,
    requestTimeoutMs: limits.requestTimeoutMs,
    requests: 0,
    bytes: 0,
  };
}

/** @param {number} byteCount */
function describeByteLimit(byteCount) {
  if (byteCount % 1_048_576 === 0) return `${byteCount}-byte (${byteCount / 1_048_576} MiB)`;
  if (byteCount % 1_024 === 0) return `${byteCount}-byte (${byteCount / 1_024} KiB)`;
  return `${byteCount}-byte`;
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
  );
}

/** @param {string} left @param {string} right */
function compareRawPaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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
 * Abort first, so a body whose cancellation never settles cannot delay the
 * rejection, then cancel the body best-effort.
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
 * @param {ReadBudget} budget
 * @param {AbortController} controller
 */
async function readBoundedResponse(response, budget, controller) {
  const { kind, maxResponseBytes, maxTotalBytes } = budget;
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
    if (declaredBytes > maxResponseBytes) {
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(`GitHub ${kind} response body exceeds the ${describeByteLimit(maxResponseBytes)} limit`),
      );
    }
    if (budget.bytes + declaredBytes > maxTotalBytes) {
      abortAndCancelResponse(
        response.body,
        controller,
        new Error(`GitHub ${kind} response aggregate exceeds the ${describeByteLimit(maxTotalBytes)} limit`),
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
    const nextTotalBytes = budget.bytes + chunk.length;
    if (nextResponseBytes > maxResponseBytes) {
      abortAndCancelResponse(
        reader,
        controller,
        new Error(`GitHub ${kind} response body exceeds the ${describeByteLimit(maxResponseBytes)} limit`),
      );
    }
    if (nextTotalBytes > maxTotalBytes) {
      abortAndCancelResponse(
        reader,
        controller,
        new Error(`GitHub ${kind} response aggregate exceeds the ${describeByteLimit(maxTotalBytes)} limit`),
      );
    }
    responseBytes = nextResponseBytes;
    budget.bytes = nextTotalBytes;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, responseBytes);
}

/**
 * GET one GitHub URL within `budget`. The caller builds the URL from validated
 * parts and names every header. A `signal` ends the request with its operation,
 * and an operation that already ended starts no request.
 * @param {string} url
 * @param {ReadBudget} budget
 * @param {{ headers?: Readonly<Record<string, string>>, signal?: AbortSignal }} [options]
 * @returns {Promise<Buffer>}
 */
export async function fetchGitHubBytes(url, budget, { headers, signal } = {}) {
  const { kind } = budget;
  if (typeof url !== 'string' || !GITHUB_ORIGINS.some((origin) => url.startsWith(origin))) {
    throw new Error(`GitHub ${kind} request URL must be an api.github.com or raw.githubusercontent.com HTTPS URL`);
  }
  if (signal?.aborted) {
    throw new Error(`GitHub ${kind} request was not started because its operation ended`, { cause: signal.reason });
  }
  budget.requests += 1;
  if (budget.requests > budget.maxRequests) {
    throw new Error(`GitHub ${kind} request limit of ${budget.maxRequests} exceeded`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('GitHub request timed out', 'TimeoutError'));
  }, budget.requestTimeoutMs);
  const endWithOperation = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', endWithOperation, { once: true });
  try {
    const init = {
      method: 'GET',
      redirect: /** @type {RequestRedirect} */ ('error'),
      credentials: /** @type {RequestCredentials} */ ('omit'),
      signal: controller.signal,
      ...(headers ? { headers } : {}),
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
        Object.assign(
          new Error(`GitHub ${kind} request failed with HTTP ${response.status}${rateLimited ? ' (rate limit)' : ''}`),
          { status: response.status, rateLimited },
        ),
      );
    }
    return await readBoundedResponse(response, budget, controller);
  } catch (error) {
    if (timedOut) {
      throw new Error(`GitHub ${kind} request timed out or was aborted`, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GitHub ${kind} fetch failed: ${message}`, { cause: error });
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', endWithOperation);
  }
}

/**
 * @param {string} url
 * @param {ReadBudget} budget
 * @param {{ headers?: Readonly<Record<string, string>>, signal?: AbortSignal }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchGitHubJson(url, budget, options) {
  const bytes = await fetchGitHubBytes(url, budget, options);
  if (!isUtf8(bytes)) throw new Error(`GitHub ${budget.kind} response is not valid UTF-8 JSON`);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`GitHub ${budget.kind} response is not valid JSON`, { cause: error });
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
export function validateGitObjectId(value, label) {
  if (typeof value !== 'string' || !GIT_OBJECT_ID.test(value)) {
    throw new Error(`invalid ${label} Git SHA-1 object ID`);
  }
  return value;
}

/** @param {string} mode @param {string} type */
function gitEntryType(mode, type) {
  if (mode === '040000' && type === 'tree') return 'directory';
  if ((mode === '100644' || mode === '100755') && type === 'blob') return 'regular-file';
  if (mode === '120000' && type === 'blob') return 'symbolic-link';
  if (mode === '160000' && type === 'commit') return 'non-regular';
  throw new Error(`invalid Git tree mode/type pair: ${JSON.stringify(mode)}/${JSON.stringify(type)}`);
}

/**
 * @typedef {{
 *   path: string,
 *   mode: string,
 *   type: string,
 *   sha: string,
 *   size: number | null,
 *   entryType: 'directory' | 'regular-file' | 'symbolic-link' | 'non-regular',
 * }} GitTreeRecord
 */

/**
 * Validate one Git tree response: its identity, an exact `truncated: false`,
 * record shapes, fixed mode/type pairs, object IDs, sizes, and exact or
 * case-folded duplicate paths. `validatePath` is the caller's path policy and
 * throws for a path it refuses.
 * @param {unknown} value
 * @param {string} expectedTreeSha
 * @param {boolean} recursive
 * @param {(relativePath: unknown) => void} validatePath
 * @returns {GitTreeRecord[]} records sorted by raw path
 */
export function validateGitTree(value, expectedTreeSha, recursive, validatePath) {
  if (!isPlainObject(value)) throw new Error('Git tree metadata is malformed');
  const tree = /** @type {Record<string, unknown>} */ (value);
  const actualTreeSha = validateGitObjectId(tree.sha, 'tree');
  if (actualTreeSha !== expectedTreeSha) throw new Error('Git tree response identity does not match the requested tree');
  if (tree.truncated !== false) throw new Error('Git tree response is truncated or lacks an exact truncation marker');
  if (!Array.isArray(tree.tree)) throw new Error('Git tree response has a malformed tree record list');

  const exactPaths = new Set();
  const foldedPaths = new Map();
  const records = tree.tree.map((item) => {
    if (!isPlainObject(item)) throw new Error('Git tree contains a malformed record');
    validatePath(item.path);
    const itemPath = /** @type {string} */ (item.path);
    if (!recursive && itemPath.includes('/')) {
      throw new Error('nonrecursive Git tree response contains a nested path');
    }
    if (exactPaths.has(itemPath)) throw new Error(`duplicate Git tree path: ${JSON.stringify(itemPath)}`);
    exactPaths.add(itemPath);
    const foldedPath = itemPath.toLowerCase();
    const collision = foldedPaths.get(foldedPath);
    if (collision !== undefined && collision !== itemPath) {
      throw new Error(`case collision between Git tree paths ${JSON.stringify(collision)} and ${JSON.stringify(itemPath)}`);
    }
    foldedPaths.set(foldedPath, itemPath);

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
      path: itemPath,
      mode: item.mode,
      type: item.type,
      sha: objectSha,
      size: Object.hasOwn(item, 'size') ? /** @type {number} */ (item.size) : null,
      entryType,
    };
  }).sort((left, right) => compareRawPaths(left.path, right.path));

  return records;
}

/**
 * The Git blob object ID of exact bytes, including Git's `blob <size>\0` header.
 * @param {Buffer} bytes
 */
export function gitBlobSha1(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

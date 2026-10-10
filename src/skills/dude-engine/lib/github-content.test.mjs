// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  GITHUB_API_HEADERS,
  createReadBudget,
  fetchGitHubBytes,
  fetchGitHubJson,
  gitBlobSha1,
  validateGitObjectId,
  validateGitTree,
} from './github-content.mjs';

const API_URL = 'https://api.github.com/repos/acme/widgets/git/trees/1111111111111111111111111111111111111111';
const RAW_URL = 'https://raw.githubusercontent.com/acme/widgets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/file.txt';
const FOREIGN_URL = 'https://attacker.invalid/never-follow';

/** Small, unusual limits, so no assertion can pass by inheriting another caller's budget. */
function budget(kind = /** @type {'metadata' | 'raw'} */ ('metadata'), overrides = {}) {
  return createReadBudget(kind, {
    maxRequests: 3,
    maxResponseBytes: 100,
    maxTotalBytes: 150,
    requestTimeoutMs: 4_321,
    ...overrides,
  });
}

/** @param {BodyInit | null} body @param {{ status?: number, headers?: Record<string, string> }} [options] */
function response(body, { status = 200, headers = {} } = {}) {
  const value = new Response(body, { status, headers });
  Object.defineProperty(value, 'url', { value: FOREIGN_URL });
  return value;
}

/**
 * @param {Array<Uint8Array | string>} chunks
 * @param {{ status?: number, headers?: Record<string, string>, onCancel?: (reason: unknown) => void, onPull?: () => Promise<void> }} [options]
 */
function streamResponse(chunks, { onCancel = () => {}, onPull, ...options } = {}) {
  let index = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (onPull) await onPull();
      if (index === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(Buffer.from(chunks[index]));
      index += 1;
    },
    cancel(reason) {
      onCancel(reason);
    },
  }, { highWaterMark: 0 });
  return response(body, options);
}

/**
 * @param {(input: RequestInfo | URL, init: RequestInit) => Promise<Response> | Response} handler
 * @param {(calls: Array<{ url: string, init: RequestInit }>) => Promise<void>} run
 */
async function withMockFetch(handler, run) {
  const original = globalThis.fetch;
  /** @type {Array<{ url: string, init: RequestInit }>} */
  const calls = [];
  globalThis.fetch = /** @type {typeof fetch} */ (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return handler(input, init);
  });
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

/** @param {Buffer} bytes */
function blobItem(itemPath, bytes, mode = '100644') {
  return { path: itemPath, mode, type: 'blob', sha: gitBlobSha1(bytes), size: bytes.length, url: FOREIGN_URL };
}

/** @param {string} itemPath */
function treeItem(itemPath, sha = '4'.repeat(40)) {
  return { path: itemPath, mode: '040000', type: 'tree', sha, url: FOREIGN_URL };
}

const TREE_SHA = '1'.repeat(40);
/** @param {unknown} value */
const acceptAnyPath = (value) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('fixture path must be a nonempty string');
};

test('createReadBudget accepts only explicit positive limits and starts empty counters', () => {
  assert.deepEqual(budget('raw'), {
    kind: 'raw',
    maxRequests: 3,
    maxResponseBytes: 100,
    maxTotalBytes: 150,
    requestTimeoutMs: 4_321,
    requests: 0,
    bytes: 0,
  });
  assert.throws(() => createReadBudget(/** @type {any} */ ('other'), budget()), /kind must be metadata or raw/);
  for (const name of ['maxRequests', 'maxResponseBytes', 'maxTotalBytes', 'requestTimeoutMs']) {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined, '10']) {
      assert.throws(
        () => createReadBudget('metadata', /** @type {any} */ ({ ...budget(), [name]: value })),
        new RegExp(`${name} must be a positive safe integer`),
      );
    }
  }
  assert.notStrictEqual(budget(), budget(), 'each budget owns its own counters');
});

test('fetchGitHubBytes sends only an anonymous, non-redirecting GET with the caller headers', async () => {
  await withMockFetch(() => response(Buffer.from('{}')), async (calls) => {
    const metadata = budget();
    await fetchGitHubBytes(API_URL, metadata, { headers: GITHUB_API_HEADERS });
    const raw = budget('raw');
    await fetchGitHubBytes(RAW_URL, raw);

    assert.deepEqual(calls.map(({ url }) => url), [API_URL, RAW_URL]);
    for (const { init } of calls) {
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.credentials, 'omit');
      assert.ok(init.signal instanceof AbortSignal);
    }
    assert.deepEqual(calls[0].init.headers, GITHUB_API_HEADERS);
    assert.equal(Object.hasOwn(calls[1].init, 'headers'), false, 'raw requests send no headers at all');
    assert.equal(calls.some(({ url }) => url === FOREIGN_URL), false, 'response URLs are never followed');
    assert.deepEqual([metadata.requests, metadata.bytes, raw.requests, raw.bytes], [1, 2, 1, 2]);
  });
});

test('fetchGitHubBytes refuses URLs outside the two GitHub origins before any request', async () => {
  await withMockFetch(() => assert.fail('must not fetch'), async (calls) => {
    for (const url of [
      FOREIGN_URL,
      'http://api.github.com/repos/acme/widgets',
      'https://api.github.com.attacker.invalid/x',
      'https://github.com/acme/widgets',
      'https://codeload.github.com/acme/widgets/zip/main',
    ]) {
      const metadata = budget();
      await assert.rejects(() => fetchGitHubBytes(url, metadata), /api\.github\.com or raw\.githubusercontent\.com HTTPS URL/);
      assert.equal(metadata.requests, 0);
    }
    assert.equal(calls.length, 0);
  });
});

test('fetchGitHubBytes enforces the budget request count before fetching', async () => {
  await withMockFetch(() => response(Buffer.from('ok')), async (calls) => {
    const limited = budget('raw', { maxRequests: 2 });
    await fetchGitHubBytes(RAW_URL, limited);
    await fetchGitHubBytes(RAW_URL, limited);
    await assert.rejects(() => fetchGitHubBytes(RAW_URL, limited), /GitHub raw request limit of 2 exceeded/);
    assert.equal(calls.length, 2);
  });
});

test('fetchGitHubBytes bounds each body and the shared aggregate while streaming', async (t) => {
  await t.test('accepts a body at exactly the per-response limit', async () => {
    await withMockFetch(() => streamResponse([Buffer.alloc(60), Buffer.alloc(40)]), async () => {
      const exact = budget();
      assert.equal((await fetchGitHubBytes(API_URL, exact)).length, 100);
      assert.equal(exact.bytes, 100);
    });
  });

  const rejections = [
    ['declared Content-Length over the response limit', { headers: { 'content-length': '101' } }, [Buffer.alloc(1)], /metadata response body exceeds the 100-byte limit/],
    ['malformed Content-Length', { headers: { 'content-length': '1e2' } }, [Buffer.alloc(1)], /invalid Content-Length/],
    ['streamed excess without Content-Length', {}, [Buffer.alloc(100), Buffer.alloc(1)], /metadata response body exceeds the 100-byte limit/],
    ['streamed excess behind a lying-small Content-Length', { headers: { 'content-length': '5' } }, [Buffer.alloc(100), Buffer.alloc(1)], /metadata response body exceeds the 100-byte limit/],
  ];
  for (const [name, options, chunks, expected] of rejections) {
    await t.test(`rejects ${name} and ends its request`, async () => {
      let cancelled = 0;
      await withMockFetch(
        () => streamResponse(/** @type {Buffer[]} */ (chunks), { ...options, onCancel: () => { cancelled += 1; } }),
        async (calls) => {
          await assert.rejects(() => fetchGitHubBytes(API_URL, budget()), expected);
          assert.equal(calls[0].init.signal?.aborted, true);
          assert.equal(cancelled, 1);
        },
      );
    });
  }

  await t.test('shares actual bytes across concurrent requests and stops the one that crosses the aggregate', async () => {
    /** @type {Array<() => void>} */
    const gates = [];
    let cancelled = 0;
    // Hold only each stream's first chunk, so both requests are in flight together.
    const gatedResponse = () => {
      let held = false;
      return streamResponse([Buffer.alloc(80)], {
        onPull: () => {
          if (held) return Promise.resolve();
          held = true;
          return new Promise((resolve) => { gates.push(() => resolve(undefined)); });
        },
        onCancel: () => { cancelled += 1; },
      });
    };
    await withMockFetch(gatedResponse, async (calls) => {
      const shared = budget();
      const first = fetchGitHubBytes(API_URL, shared);
      const second = fetchGitHubBytes(API_URL, shared);
      while (gates.length < 2) await new Promise((resolve) => setImmediate(resolve));
      gates[0]();
      assert.equal((await first).length, 80);
      gates[1]();
      await assert.rejects(second, /metadata response aggregate exceeds the 150-byte limit/);
      assert.equal(shared.bytes, 80, 'rejected bytes are never counted as accepted');
      assert.equal(calls[1].init.signal?.aborted, true);
      assert.equal(cancelled, 1);
    });
  });

  await t.test('describes MiB and KiB limits in bytes and units', async () => {
    await withMockFetch(() => response(null, { headers: { 'content-length': String(2 * 1_048_576 + 1) } }), async () => {
      await assert.rejects(
        () => fetchGitHubBytes(API_URL, budget('metadata', { maxResponseBytes: 2 * 1_048_576, maxTotalBytes: 8 * 1_048_576 })),
        /exceeds the 2097152-byte \(2 MiB\) limit/,
      );
    });
    await withMockFetch(() => response(null, { headers: { 'content-length': String(65_537) } }), async () => {
      await assert.rejects(
        () => fetchGitHubBytes(RAW_URL, budget('raw', { maxResponseBytes: 65_536, maxTotalBytes: 1_048_576 })),
        /exceeds the 65536-byte \(64 KiB\) limit/,
      );
    });
  });
});

test('fetchGitHubBytes refuses non-200 responses, labels rate limits and exposes the status', async (t) => {
  const cases = [
    { status: 404, headers: {}, expected: /GitHub metadata fetch failed: GitHub metadata request failed with HTTP 404$/, rateLimited: false },
    { status: 403, headers: { 'x-ratelimit-remaining': '0' }, expected: /HTTP 403 \(rate limit\)/, rateLimited: true },
    { status: 429, headers: { 'retry-after': '60' }, expected: /HTTP 429 \(rate limit\)/, rateLimited: true },
    { status: 302, headers: { location: FOREIGN_URL }, expected: /HTTP 302/, rateLimited: false },
  ];
  for (const { status, headers, expected, rateLimited } of cases) {
    await t.test(`HTTP ${status}`, async () => {
      let cancelled = 0;
      await withMockFetch(
        () => (status === 302 ? response(null, { status, headers }) : streamResponse(['{"message":"no"}'], { status, headers, onCancel: () => { cancelled += 1; } })),
        async (calls) => {
          const error = await fetchGitHubBytes(API_URL, budget()).then(() => assert.fail('must reject'), (caught) => caught);
          assert.match(error.message, expected);
          assert.equal(error.cause.status, status);
          assert.equal(error.cause.rateLimited, rateLimited);
          assert.equal(calls.length, 1, 'no retry and no redirect follow');
          assert.equal(calls[0].init.signal?.aborted, true);
          if (status !== 302) assert.equal(cancelled, 1);
        },
      );
    });
  }

  await t.test('a fetch-level redirect refusal is reported, not followed', async () => {
    await withMockFetch(() => { throw new TypeError('fetch failed: redirect mode is set to error'); }, async (calls) => {
      await assert.rejects(() => fetchGitHubBytes(RAW_URL, budget('raw')), /GitHub raw fetch failed: fetch failed: redirect/);
      assert.equal(calls.length, 1);
    });
  });
});

test('fetchGitHubBytes times each request with the budget timeout', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  /** @type {number[]} */
  const durations = [];
  /** @type {(() => void) | undefined} */
  let fire;
  let cancelled = 0;
  try {
    globalThis.setTimeout = /** @type {any} */ ((callback, milliseconds) => {
      durations.push(milliseconds);
      fire = callback;
      return { milliseconds };
    });
    globalThis.clearTimeout = () => {};
    await withMockFetch(() => streamResponse([], {
      onPull: () => {
        queueMicrotask(() => fire?.());
        return new Promise(() => {});
      },
      onCancel: () => { cancelled += 1; },
    }), async (calls) => {
      await assert.rejects(() => fetchGitHubBytes(API_URL, budget()), /GitHub metadata request timed out or was aborted/);
      assert.deepEqual(durations, [4_321]);
      assert.equal(calls[0].init.signal?.aborted, true);
      assert.equal(cancelled, 1, 'a stalled body is cancelled when the request times out');
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('fetchGitHubBytes ends with its operation signal and starts nothing after it ended', async (t) => {
  await t.test('an operation abort mid-body aborts the request and cancels the body', async () => {
    const operation = new AbortController();
    let cancelled = 0;
    await withMockFetch(() => streamResponse([], {
      onPull: () => {
        queueMicrotask(() => operation.abort(new Error('sibling failed')));
        return new Promise(() => {});
      },
      onCancel: () => { cancelled += 1; },
    }), async (calls) => {
      await assert.rejects(
        () => fetchGitHubBytes(RAW_URL, budget('raw'), { signal: operation.signal }),
        /GitHub raw fetch failed: sibling failed/,
      );
      assert.equal(calls[0].init.signal?.aborted, true);
      assert.equal(cancelled, 1);
    });
  });

  await t.test('an operation that already ended makes and counts no request', async () => {
    const operation = new AbortController();
    operation.abort(new Error('deadline'));
    await withMockFetch(() => assert.fail('must not fetch'), async (calls) => {
      const raw = budget('raw');
      await assert.rejects(
        () => fetchGitHubBytes(RAW_URL, raw, { signal: operation.signal }),
        /request was not started because its operation ended/,
      );
      assert.equal(raw.requests, 0);
      assert.equal(calls.length, 0);
    });
  });
});

test('fetchGitHubJson names the budget kind for invalid UTF-8 and invalid JSON', async () => {
  await withMockFetch(() => response(Buffer.from([0xc3, 0x28])), async () => {
    await assert.rejects(() => fetchGitHubJson(API_URL, budget()), /^Error: GitHub metadata response is not valid UTF-8 JSON$/);
  });
  await withMockFetch(() => response(Buffer.from('{"tree":')), async () => {
    await assert.rejects(() => fetchGitHubJson(RAW_URL, budget('raw')), /GitHub raw response is not valid JSON/);
  });
  await withMockFetch(() => response(Buffer.from('{"sha":"x"}')), async () => {
    assert.deepEqual(await fetchGitHubJson(API_URL, budget()), { sha: 'x' });
  });
});

test('validateGitTree checks identity, completeness, records and duplicates, and applies the caller path policy', async (t) => {
  const readme = Buffer.from('readme\n');
  const tool = Buffer.from('#!/bin/sh\n');
  const valid = {
    sha: TREE_SHA,
    truncated: false,
    url: FOREIGN_URL,
    tree: [
      blobItem('tool.sh', tool, '100755'),
      treeItem('nested'),
      blobItem('README.md', readme),
      { path: 'link', mode: '120000', type: 'blob', sha: gitBlobSha1(Buffer.from('README.md')), size: 9 },
      { path: 'vendor', mode: '160000', type: 'commit', sha: '5'.repeat(40) },
    ],
  };

  await t.test('returns typed records sorted by raw path', () => {
    const records = validateGitTree(valid, TREE_SHA, false, acceptAnyPath);
    assert.deepEqual(records.map(({ path, entryType, mode, size }) => ({ path, entryType, mode, size })), [
      { path: 'README.md', entryType: 'regular-file', mode: '100644', size: readme.length },
      { path: 'link', entryType: 'symbolic-link', mode: '120000', size: 9 },
      { path: 'nested', entryType: 'directory', mode: '040000', size: null },
      { path: 'tool.sh', entryType: 'regular-file', mode: '100755', size: tool.length },
      { path: 'vendor', entryType: 'non-regular', mode: '160000', size: null },
    ]);
  });

  await t.test('calls the path policy for every record and propagates its refusal', () => {
    /** @type {unknown[]} */
    const seen = [];
    validateGitTree(valid, TREE_SHA, false, (value) => { seen.push(value); });
    assert.deepEqual(seen, valid.tree.map((item) => item.path));
    assert.throws(
      () => validateGitTree(valid, TREE_SHA, false, (value) => { if (value === 'link') throw new Error('policy refused link'); }),
      /policy refused link/,
    );
  });

  const refusals = [
    ['wrong identity', { ...valid, sha: '9'.repeat(40) }, false, /identity does not match/],
    ['truncated', { ...valid, truncated: true }, false, /truncated/],
    ['missing truncation marker', { sha: TREE_SHA, tree: [] }, false, /truncated/],
    ['malformed record list', { ...valid, tree: {} }, false, /malformed tree record list/],
    ['nested path in a nonrecursive tree', { ...valid, tree: [blobItem('a/b', readme)] }, false, /nonrecursive Git tree response contains a nested path/],
    ['duplicate path', { ...valid, tree: [blobItem('a', readme), blobItem('a', readme)] }, true, /duplicate Git tree path/],
    ['case collision', { ...valid, tree: [blobItem('Readme', readme), blobItem('README', readme)] }, true, /case collision/],
    ['unknown mode', { ...valid, tree: [{ ...blobItem('a', readme), mode: '100664' }] }, true, /mode\/type pair/],
    ['mode/type mismatch', { ...valid, tree: [{ ...treeItem('a'), type: 'blob' }] }, true, /mode\/type pair/],
    ['missing blob size', { ...valid, tree: [{ path: 'a', mode: '100644', type: 'blob', sha: '6'.repeat(40) }] }, true, /missing or invalid size/],
    ['negative size', { ...valid, tree: [{ ...blobItem('a', readme), size: -1 }] }, true, /size/],
    ['bad object ID', { ...valid, tree: [{ ...blobItem('a', readme), sha: 'A'.repeat(40) }] }, true, /invalid tree record Git SHA-1 object ID/],
    ['non-object record', { ...valid, tree: ['a'] }, true, /malformed record/],
  ];
  for (const [name, value, recursive, expected] of refusals) {
    await t.test(`refuses ${name}`, () => {
      assert.throws(() => validateGitTree(value, TREE_SHA, /** @type {boolean} */ (recursive), acceptAnyPath), /** @type {RegExp} */ (expected));
    });
  }

  await t.test('accepts nested paths in a recursive tree', () => {
    const records = validateGitTree({ ...valid, tree: [treeItem('a'), blobItem('a/b.txt', readme)] }, TREE_SHA, true, acceptAnyPath);
    assert.deepEqual(records.map((record) => record.path), ['a', 'a/b.txt']);
  });
});

test('gitBlobSha1 is the Git blob object ID, including its header', () => {
  assert.equal(gitBlobSha1(Buffer.alloc(0)), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha1(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.notEqual(
    gitBlobSha1(Buffer.from('hello\n')),
    crypto.createHash('sha1').update('hello\n').digest('hex'),
    'the header is part of the identity',
  );
});

test('validateGitObjectId accepts only 40 lowercase hexadecimal characters', () => {
  assert.equal(validateGitObjectId('a'.repeat(40), 'commit'), 'a'.repeat(40));
  for (const value of ['A'.repeat(40), 'a'.repeat(39), 'a'.repeat(64), 'g'.repeat(40), 40, null]) {
    assert.throws(() => validateGitObjectId(value, 'commit'), /invalid commit Git SHA-1 object ID/);
  }
});

// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DIRECTORY_SOURCE_LIMITS,
  analyzeDirectorySource,
  analyzeGitHubDirectory,
  analyzeLocalDirectory,
  createCanonicalEntryManifest,
} from './directory-source.mjs';

const EXPECTED_LOCAL_LIMITS = {
  max_depth: 12,
  max_entries: 256,
  max_regular_files: 128,
  max_file_bytes: 1_048_576,
  max_total_bytes: 4_194_304,
};

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function compareRawPaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalManifestSha256(entries) {
  const compactJson = `[${entries.map((entry) => JSON.stringify({
    byte_count: entry.byte_count,
    content_class: entry.content_class,
    entry_type: entry.entry_type,
    path: entry.path,
    sha256: entry.sha256,
  })).join(',')}]`;
  return sha256(Buffer.from(compactJson));
}

function regularFileEntry(relativePath, bytes, contentClass = 'text') {
  return {
    path: relativePath,
    entry_type: 'regular-file',
    byte_count: bytes.length,
    sha256: sha256(bytes),
    content_class: contentClass,
  };
}

function nonFileEntry(relativePath, entryType) {
  return {
    path: relativePath,
    entry_type: entryType,
    byte_count: 0,
    sha256: null,
    content_class: 'none',
  };
}

async function withTempSource(run) {
  const temporaryBase = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temporaryBase, 'dude-directory-source-'));
  const root = path.join(fixture, 'source');
  fs.mkdirSync(root);
  try {
    return await run({ fixture, root });
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function snapshotTree(root) {
  const records = [];

  function visit(directory, prefix = '') {
    const children = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareRawPaths(left.name, right.name));
    for (const child of children) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        records.push({ path: relativePath, type: 'directory' });
        visit(absolutePath, relativePath);
      } else if (child.isFile()) {
        records.push({
          path: relativePath,
          type: 'regular-file',
          bytes: fs.readFileSync(absolutePath).toString('base64'),
        });
      } else if (child.isSymbolicLink()) {
        records.push({
          path: relativePath,
          type: 'symbolic-link',
          target: fs.readlinkSync(absolutePath),
        });
      } else {
        records.push({ path: relativePath, type: 'non-regular' });
      }
    }
  }

  visit(root);
  return records;
}

async function assertRefuses(operation, expected) {
  await assert.rejects(async () => operation(), expected);
}

const EXPECTED_NETWORK_LIMITS = {
  max_metadata_requests: 16,
  max_raw_requests: 128,
  max_metadata_response_bytes: 1_048_576,
  max_raw_response_bytes: 1_048_576,
  max_metadata_total_bytes: 4_194_304,
  max_raw_total_bytes: 4_194_304,
  request_timeout_ms: 30_000,
};

const GITHUB_OWNER = 'acme';
const GITHUB_REPOSITORY = 'widgets';
const GITHUB_REF = 'main';
const GITHUB_COMMIT = 'a'.repeat(40);
const GITHUB_MOVED_COMMIT = 'b'.repeat(40);
const GITHUB_ROOT_TREE = '1'.repeat(40);
const GITHUB_ARTIFACTS_TREE = '2'.repeat(40);
const GITHUB_SELECTED_TREE = '3'.repeat(40);
const GITHUB_API_HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
};
const MALICIOUS_RESPONSE_URL = 'https://attacker.invalid/never-follow';

const GITHUB_PARITY_FILES = Object.freeze({
  'README.md': Buffer.from('hello from GitHub\n'),
  'nested/data.bin': Buffer.from([0xc3, 0x28]),
  'run.sh': Buffer.from('#!/bin/sh\nexit 0\n'),
});

function gitBlobSha1(bytes) {
  return crypto.createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function githubBlobItem(relativePath, bytes, mode = '100644') {
  return {
    path: relativePath,
    mode,
    type: 'blob',
    sha: gitBlobSha1(bytes),
    size: bytes.length,
    url: MALICIOUS_RESPONSE_URL,
  };
}

function githubTreeItem(relativePath, sha = '4'.repeat(40)) {
  return {
    path: relativePath,
    mode: '040000',
    type: 'tree',
    sha,
    url: MALICIOUS_RESPONSE_URL,
  };
}

function githubCommitValue(commitSha, rootTreeSha) {
  return {
    sha: commitSha,
    url: MALICIOUS_RESPONSE_URL,
    html_url: MALICIOUS_RESPONSE_URL,
    commit: {
      tree: {
        sha: rootTreeSha,
        url: MALICIOUS_RESPONSE_URL,
      },
    },
  };
}

function responseWithUrl(body, { status = 200, headers = {}, url = MALICIOUS_RESPONSE_URL } = {}) {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function jsonResponse(value, options = {}) {
  return responseWithUrl(Buffer.from(JSON.stringify(value)), {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

function rawResponse(bytes, options = {}) {
  return responseWithUrl(bytes, options);
}

function streamResponse(chunks, { onCancel = () => {}, onPull, ...options } = {}) {
  let chunkIndex = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (onPull) return onPull(controller);
      if (chunkIndex === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(Buffer.from(chunks[chunkIndex]));
      chunkIndex += 1;
    },
    cancel(reason) {
      return onCancel(reason);
    },
  }, { highWaterMark: 0 });
  return responseWithUrl(body, options);
}

function paddedJsonResponse(value, byteCount) {
  const padded = { ...value, padding: '' };
  const unpaddedBytes = Buffer.from(JSON.stringify(padded));
  assert.ok(unpaddedBytes.length <= byteCount, 'padded response target must fit its JSON record');
  padded.padding = 'x'.repeat(byteCount - unpaddedBytes.length);
  const bytes = Buffer.from(JSON.stringify(padded));
  assert.equal(bytes.length, byteCount);
  return responseWithUrl(bytes, { headers: { 'content-type': 'application/json' } });
}

function normalizedHeaders(headers) {
  return Object.fromEntries(
    [...new Headers(headers).entries()].sort(([left], [right]) => compareRawPaths(left, right)),
  );
}

function assertGitHubRequestPolicy(init, kind) {
  assert.equal(init?.method ?? 'GET', 'GET');
  assert.equal(init?.redirect, 'error');
  assert.ok(init?.signal instanceof AbortSignal, 'every request has a timeout signal');
  assert.equal(init.signal.aborted, false, 'request signal starts active');
  assert.ok(init?.credentials === undefined || init.credentials === 'omit');
  const headers = normalizedHeaders(init?.headers);
  assert.equal(Object.hasOwn(headers, 'authorization'), false, 'no authorization header is sent');
  assert.deepEqual(headers, kind === 'metadata' ? GITHUB_API_HEADERS : {});
}

async function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let activeRequests = 0;
  let maximumConcurrency = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push({
        url,
        method: init.method ?? 'GET',
        redirect: init.redirect,
        headers: normalizedHeaders(init.headers),
        signal: init.signal,
      });
      activeRequests += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeRequests);
      try {
        return await handler(input, init);
      } finally {
        activeRequests -= 1;
      }
    };

    return await run({
      calls,
      maximumConcurrency: () => maximumConcurrency,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withFetchScript(steps, run, { requireAll = true } = {}) {
  let stepIndex = 0;
  return withMockFetch(async (input, init) => {
    const step = steps[stepIndex];
    assert.ok(step, `unexpected fetch ${String(input)}`);
    stepIndex += 1;
    assert.equal(String(input), step.url, `fetch ${stepIndex} URL`);
    assertGitHubRequestPolicy(init, step.kind);
    await new Promise((resolve) => setImmediate(resolve));
    return step.reply({ input, init });
  }, async (state) => {
    const result = await run(state);
    if (requireAll) {
      assert.equal(stepIndex, steps.length, 'all scripted requests were made');
    }
    return result;
  });
}

function githubApiUrl(pathname) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}${pathname}`;
}

function githubCommitUrl(requestedRef = GITHUB_REF) {
  return githubApiUrl(`/commits/${encodeURIComponent(requestedRef)}`);
}

function githubTreeUrl(treeSha, recursive = false) {
  return githubApiUrl(`/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`);
}

function githubRawUrl(commitSha, subtreeSegments, relativePath) {
  const encodedPath = [...subtreeSegments, ...relativePath.split('/')]
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/${commitSha}/${encodedPath}`;
}

function metadataStep(url, value, response = () => jsonResponse(value)) {
  return { kind: 'metadata', url, value, reply: response };
}

function rawStep(url, response) {
  return { kind: 'raw', url, reply: response };
}

function treeObjectId(label) {
  return crypto.createHash('sha1').update(`test-tree:${label}`).digest('hex');
}

function githubProtocolFixture({
  subtreeSegments = ['artifacts', 'example'],
  commitSha = GITHUB_COMMIT,
  finalCommitSha = commitSha,
  rootTreeSha = GITHUB_ROOT_TREE,
  childTreeShas,
  selectedItems,
  files = GITHUB_PARITY_FILES,
  recursiveValue,
  includeRawSteps = true,
} = {}) {
  const resolvedChildShas = childTreeShas ?? subtreeSegments.map((segment, index) => {
    if (subtreeSegments.length === 2 && index === 0) return GITHUB_ARTIFACTS_TREE;
    if (subtreeSegments.length === 2 && index === 1) return GITHUB_SELECTED_TREE;
    return treeObjectId(`${index}:${segment}`);
  });
  assert.equal(resolvedChildShas.length, subtreeSegments.length);
  const selectedTreeSha = resolvedChildShas.at(-1);
  assert.ok(selectedTreeSha);

  const treeItems = selectedItems ?? [
    githubBlobItem('README.md', files['README.md']),
    githubTreeItem('nested'),
    githubBlobItem('nested/data.bin', files['nested/data.bin']),
    githubBlobItem('run.sh', files['run.sh'], '100755'),
  ];
  const source = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/tree/${GITHUB_REF}/${subtreeSegments.join('/')}`;
  const steps = [metadataStep(
    githubCommitUrl(),
    githubCommitValue(commitSha, rootTreeSha),
  )];

  let parentTreeSha = rootTreeSha;
  for (let index = 0; index < subtreeSegments.length; index += 1) {
    const childTreeSha = resolvedChildShas[index];
    steps.push(metadataStep(githubTreeUrl(parentTreeSha), {
      sha: parentTreeSha,
      truncated: false,
      url: MALICIOUS_RESPONSE_URL,
      tree: [githubTreeItem(subtreeSegments[index], childTreeSha)],
    }));
    parentTreeSha = childTreeSha;
  }

  steps.push(metadataStep(
    githubTreeUrl(selectedTreeSha, true),
    recursiveValue ?? {
      sha: selectedTreeSha,
      truncated: false,
      url: MALICIOUS_RESPONSE_URL,
      tree: treeItems,
    },
  ));

  if (includeRawSteps) {
    const regularItems = treeItems
      .filter((item) => ['100644', '100755'].includes(item.mode))
      .sort((left, right) => compareRawPaths(left.path, right.path));
    for (const item of regularItems) {
      const bytes = files[item.path];
      assert.ok(Buffer.isBuffer(bytes), `missing raw fixture for ${item.path}`);
      steps.push(rawStep(
        githubRawUrl(commitSha, subtreeSegments, item.path),
        () => rawResponse(bytes),
      ));
    }
  }

  steps.push(metadataStep(
    githubCommitUrl(),
    githubCommitValue(finalCommitSha, rootTreeSha),
  ));

  return {
    source,
    steps,
    selectedTreeSha,
    subtree: subtreeSegments.join('/'),
  };
}

test('directory source constants and canonical manifest are fixed and provider-independent', async (t) => {
  await t.test('publishes the accepted local limits', () => {
    const localLimits = Object.fromEntries(
      Object.keys(EXPECTED_LOCAL_LIMITS).map((key) => [key, DIRECTORY_SOURCE_LIMITS[key]]),
    );

    assert.deepEqual(localLimits, EXPECTED_LOCAL_LIMITS);
  });

  await t.test('sorts by raw code-unit path and hashes compact canonical projections', () => {
    const input = [
      regularFileEntry('é.txt', Buffer.from('non-ascii\n')),
      nonFileEntry('a-directory', 'directory'),
      regularFileEntry('Z.txt', Buffer.from('upper\n')),
    ];
    const original = structuredClone(input);
    const expectedEntries = [input[2], input[1], input[0]];

    const manifest = createCanonicalEntryManifest(input);

    assert.deepEqual(manifest.entries, expectedEntries);
    assert.equal(manifest.manifest_sha256, canonicalManifestSha256(expectedEntries));
    assert.match(manifest.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(input, original, 'canonicalization must not mutate caller entries');
    assert.deepEqual(createCanonicalEntryManifest([...input].reverse()), manifest);
  });

  await t.test('matches a pinned digest for a literal compact canonical JSON vector', () => {
    const canonicalCompactJson = '[{"byte_count":0,"content_class":"none","entry_type":"directory","path":"A-dir","sha256":null},{"byte_count":3,"content_class":"text","entry_type":"regular-file","path":"é.txt","sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}]';
    const expectedDigest = '6b73d3974da57ce959987dd9c96c5cb28a83649f3ede3306f53c9303c5dd3407';
    const entries = [
      regularFileEntry('é.txt', Buffer.from('abc')),
      nonFileEntry('A-dir', 'directory'),
    ];

    assert.equal(sha256(Buffer.from(canonicalCompactJson)), expectedDigest);
    assert.equal(createCanonicalEntryManifest(entries).manifest_sha256, expectedDigest);
  });

  await t.test('enforces the exact canonical entry schema and type coherence', async (t) => {
    const validSha256 = '0123456789abcdef'.repeat(4);
    const regularEntry = {
      path: 'file.txt',
      entry_type: 'regular-file',
      byte_count: 0,
      sha256: validSha256,
      content_class: 'text',
    };
    const invalidEntries = [
      ['unknown field', { ...regularEntry, extra: true }],
      ['invalid entry_type', { ...regularEntry, entry_type: 'file' }],
      ['invalid content_class', { ...regularEntry, content_class: 'binary' }],
      ['non-safe byte_count', { ...regularEntry, byte_count: Number.MAX_SAFE_INTEGER + 1 }],
      ['negative byte_count', { ...regularEntry, byte_count: -1 }],
      ['fractional byte_count', { ...regularEntry, byte_count: 0.5 }],
      ['malformed SHA-256', { ...regularEntry, sha256: 'g'.repeat(64) }],
      ['non-lowercase SHA-256', { ...regularEntry, sha256: validSha256.toUpperCase() }],
      ['non-64 SHA-256', { ...regularEntry, sha256: validSha256.slice(1) }],
      ['regular-file with null hash', { ...regularEntry, sha256: null }],
      ['regular-file with none content', { ...regularEntry, content_class: 'none' }],
      ['directory with nonzero byte_count', { ...nonFileEntry('directory', 'directory'), byte_count: 1 }],
      ['symbolic-link with non-null hash', { ...nonFileEntry('link', 'symbolic-link'), sha256: validSha256 }],
      ['non-regular with non-none content', { ...nonFileEntry('device', 'non-regular'), content_class: 'opaque' }],
    ];

    for (const [name, entry] of invalidEntries) {
      await t.test(String(name), () => {
        assert.throws(() => createCanonicalEntryManifest([entry]));
      });
    }

    const validEntries = [
      { ...regularEntry, path: 'empty.txt' },
      {
        ...regularEntry,
        path: 'maximum.bin',
        byte_count: Number.MAX_SAFE_INTEGER,
        content_class: 'opaque',
      },
      nonFileEntry('folder', 'directory'),
      nonFileEntry('link', 'symbolic-link'),
      nonFileEntry('device', 'non-regular'),
    ];

    assert.deepEqual(createCanonicalEntryManifest(validEntries).entries, [
      nonFileEntry('device', 'non-regular'),
      { ...regularEntry, path: 'empty.txt' },
      nonFileEntry('folder', 'directory'),
      nonFileEntry('link', 'symbolic-link'),
      {
        ...regularEntry,
        path: 'maximum.bin',
        byte_count: Number.MAX_SAFE_INTEGER,
        content_class: 'opaque',
      },
    ]);
  });

  await t.test('preserves normalization forms and uses locale-independent lowercase semantics', () => {
    const composed = 'é.txt';
    const decomposed = 'e\u0301.txt';
    const manifest = createCanonicalEntryManifest([
      nonFileEntry(composed, 'directory'),
      nonFileEntry(decomposed, 'directory'),
      nonFileEntry('I.txt', 'directory'),
      nonFileEntry('ı.txt', 'directory'),
    ]);

    assert.deepEqual(manifest.entries.map(({ path: entryPath }) => entryPath), [
      'I.txt',
      decomposed,
      composed,
      'ı.txt',
    ]);
    assert.throws(
      () => createCanonicalEntryManifest([
        nonFileEntry('İ.txt', 'directory'),
        nonFileEntry('i\u0307.txt', 'directory'),
      ]),
      /case.*collision|collision.*case/i,
    );
  });

  await t.test('rejects invalid segments, duplicates, and case collisions', async (t) => {
    const invalidPaths = [
      '',
      '/absolute',
      'trailing/',
      'double//separator',
      './leading-dot',
      'embedded/./dot',
      '../escape',
      'embedded/../escape',
      String.raw`backslash\segment`,
      'control\nsegment',
      'nul\0segment',
    ];

    for (const invalidPath of invalidPaths) {
      await t.test(JSON.stringify(invalidPath), () => {
        assert.throws(
          () => createCanonicalEntryManifest([
            nonFileEntry(invalidPath, 'directory'),
          ]),
          /path|segment|escape|control|backslash/i,
        );
      });
    }

    assert.throws(
      () => createCanonicalEntryManifest([
        nonFileEntry('same', 'directory'),
        nonFileEntry('same', 'symbolic-link'),
      ]),
      /duplicate/i,
    );
    assert.throws(
      () => createCanonicalEntryManifest([
        regularFileEntry('Readme.md', Buffer.from('one')),
        regularFileEntry('README.md', Buffer.from('two')),
      ]),
      /case.*collision|collision.*case/i,
    );
  });

  await t.test('does not invent reserved-name or segment-length rules', () => {
    const longSegment = 'x'.repeat(300);

    const manifest = createCanonicalEntryManifest([
      nonFileEntry('CON', 'directory'),
      regularFileEntry('aux.txt', Buffer.alloc(0)),
      regularFileEntry(longSegment, Buffer.alloc(0)),
    ]);

    assert.deepEqual(manifest.entries.map(({ path: entryPath }) => entryPath), [
      'CON',
      'aux.txt',
      longSegment,
    ]);
  });
});

test('analyzeLocalDirectory refuses 257 reverse-created entries at the entry limit', async () => {
  await withTempSource(async ({ root }) => {
    for (let index = EXPECTED_LOCAL_LIMITS.max_entries; index >= 0; index -= 1) {
      fs.mkdirSync(path.join(root, `entry-${String(index).padStart(3, '0')}`));
    }

    await assertRefuses(
      () => analyzeLocalDirectory(root),
      /entry limit|limit.*entr(?:y|ies)|entr(?:y|ies).*limit/i,
    );
  });
});

test('analyzeLocalDirectory stops enumeration at the 257th entry before descendant I/O', { concurrency: false }, async () => {
  await withTempSource(async ({ root }) => {
    for (let index = 0; index <= EXPECTED_LOCAL_LIMITS.max_entries; index += 1) {
      fs.mkdirSync(path.join(root, `entry-${String(index).padStart(3, '0')}`));
    }

    const originalOpendirSync = fs.opendirSync;
    const originalReaddirSync = fs.readdirSync;
    const originalLstatSync = fs.lstatSync;
    const originalOpenSync = fs.openSync;
    const originalReadSync = fs.readSync;
    let dirReadSyncCalls = 0;
    let dirCloseSyncCalls = 0;
    let bulkReaddirSyncCalls = 0;
    let descendantLstatSyncCalls = 0;
    let descendantOpenSyncCalls = 0;
    let descendantReadSyncCalls = 0;
    const descendantDescriptors = new Set();
    const isDescendant = (candidate) => {
      const relativePath = path.relative(root, String(candidate));
      return relativePath !== ''
        && relativePath !== '..'
        && !relativePath.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relativePath);
    };

    try {
      fs.opendirSync = function instrumentedOpendirSync(...args) {
        const directory = originalOpendirSync.apply(this, args);
        const originalDirReadSync = directory.readSync;
        const originalDirCloseSync = directory.closeSync;
        directory.readSync = function instrumentedDirReadSync(...readArgs) {
          dirReadSyncCalls += 1;
          return originalDirReadSync.apply(this, readArgs);
        };
        directory.closeSync = function instrumentedDirCloseSync(...closeArgs) {
          dirCloseSyncCalls += 1;
          return originalDirCloseSync.apply(this, closeArgs);
        };
        return directory;
      };
      fs.readdirSync = function instrumentedReaddirSync(...args) {
        bulkReaddirSyncCalls += 1;
        return originalReaddirSync.apply(this, args);
      };
      fs.lstatSync = function instrumentedLstatSync(candidate, ...args) {
        if (isDescendant(candidate)) descendantLstatSyncCalls += 1;
        return originalLstatSync.call(this, candidate, ...args);
      };
      fs.openSync = function instrumentedOpenSync(candidate, ...args) {
        const descriptor = originalOpenSync.call(this, candidate, ...args);
        if (isDescendant(candidate)) {
          descendantOpenSyncCalls += 1;
          descendantDescriptors.add(descriptor);
        }
        return descriptor;
      };
      fs.readSync = function instrumentedReadSync(descriptor, ...args) {
        if (descendantDescriptors.has(descriptor)) descendantReadSyncCalls += 1;
        return originalReadSync.call(this, descriptor, ...args);
      };

      await assertRefuses(
        () => analyzeLocalDirectory(root),
        /entry limit|limit.*entr(?:y|ies)|entr(?:y|ies).*limit/i,
      );
    } finally {
      fs.opendirSync = originalOpendirSync;
      fs.readdirSync = originalReaddirSync;
      fs.lstatSync = originalLstatSync;
      fs.openSync = originalOpenSync;
      fs.readSync = originalReadSync;
    }

    assert.equal(dirReadSyncCalls, 257, 'the 257th read returns the over-limit child without reading to null');
    assert.equal(dirCloseSyncCalls, 1, 'the opened directory is closed exactly once');
    assert.equal(bulkReaddirSyncCalls, 0, 'enumeration does not bulk-materialize directory names');
    assert.equal(descendantLstatSyncCalls, 0, 'over-limit handling does not stat descendants');
    assert.equal(descendantOpenSyncCalls, 0, 'over-limit handling does not open descendants');
    assert.equal(descendantReadSyncCalls, 0, 'over-limit handling does not read descendants');
  });
});

test('analyzeLocalDirectory returns exact canonical entries, cached bytes, and no writes', async () => {
  await withTempSource(async ({ root }) => {
    const fileFixtures = [
      ['Z-empty.txt', Buffer.alloc(0), 'text'],
      ['a-bom.txt', Buffer.from([0xef, 0xbb, 0xbf, 0x74, 0x65, 0x78, 0x74]), 'text'],
      ['b-crlf.txt', Buffer.from('first\r\nsecond\r\n'), 'text'],
      ['c-unicode.txt', Buffer.from('Zażółć gęślą jaźń\n'), 'text'],
      ['d-invalid.bin', Buffer.from([0xc3, 0x28]), 'opaque'],
      ['e-nul.bin', Buffer.from([0x61, 0x00, 0x62]), 'opaque'],
    ];
    fs.mkdirSync(path.join(root, 'nested'));
    for (const [relativePath, bytes] of fileFixtures) {
      fs.writeFileSync(path.join(root, relativePath), bytes);
    }
    fs.writeFileSync(path.join(root, 'nested', 'child.txt'), 'nested\n');
    const before = snapshotTree(root);
    const expectedEntries = [
      ...fileFixtures.map(([relativePath, bytes, contentClass]) => (
        regularFileEntry(String(relativePath), Buffer.from(bytes), String(contentClass))
      )),
      nonFileEntry('nested', 'directory'),
      regularFileEntry('nested/child.txt', Buffer.from('nested\n')),
    ].sort((left, right) => compareRawPaths(left.path, right.path));

    const analysis = await analyzeLocalDirectory(root);
    const repeated = await analyzeLocalDirectory(root);

    assert.deepEqual(analysis.source, {
      provider: 'local-directory',
      input: root,
      identity: { root_path: fs.realpathSync(root) },
    });
    assert.deepEqual(analysis.entries, expectedEntries);
    assert.equal(analysis.entries.some(({ path: entryPath }) => entryPath === ''), false, 'root is excluded');
    assert.equal(analysis.manifest_sha256, canonicalManifestSha256(expectedEntries));
    assert.match(analysis.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(repeated.entries, analysis.entries);
    assert.equal(repeated.manifest_sha256, analysis.manifest_sha256);

    const firstCopy = await analysis.getFileBytes('c-unicode.txt');
    const secondCopy = await analysis.getFileBytes('c-unicode.txt');
    assert.ok(Buffer.isBuffer(firstCopy));
    assert.ok(Buffer.isBuffer(secondCopy));
    assert.notStrictEqual(firstCopy, secondCopy);
    firstCopy.fill(0);
    assert.deepEqual(secondCopy, Buffer.from('Zażółć gęślą jaźń\n'));
    assert.deepEqual(await analysis.getFileBytes('c-unicode.txt'), secondCopy);

    await assertRefuses(() => analysis.getFileBytes('missing.txt'), /unknown|missing|not found/i);
    await assertRefuses(() => analysis.getFileBytes('nested'), /regular file|not a file|directory/i);
    await assertRefuses(() => analysis.getFileBytes('../outside'), /path|unknown|missing|not found/i);
    assert.deepEqual(snapshotTree(root), before, 'analysis and cached reads must not write');
  });
});

test('analyzeLocalDirectory rejects raw non-UTF-8 filenames when the filesystem preserves them', async (t) => {
  if (path.sep !== '/') {
    t.skip('raw-byte filename fixture requires a POSIX filesystem');
    return;
  }

  await withTempSource(async ({ root }) => {
    const rawName = Buffer.from([0x69, 0x6e, 0x76, 0x61, 0x6c, 0x69, 0x64, 0x2d, 0xff]);
    const rawPath = Buffer.concat([Buffer.from(root), Buffer.from(path.sep), rawName]);
    try {
      fs.writeFileSync(rawPath, 'invalid UTF-8 name\n', { flag: 'wx' });
    } catch (error) {
      if (
        error
        && typeof error === 'object'
        && 'code' in error
        && ['EEXIST', 'EILSEQ', 'EINVAL', 'ENOTSUP'].includes(String(error.code))
      ) {
        t.skip(`temporary filesystem refused the raw-byte filename: ${String(error.code)}`);
        return;
      }
      throw error;
    }

    const preserved = fs.readdirSync(root, { encoding: 'buffer' })
      .some((entryName) => entryName.equals(rawName));
    if (!preserved) {
      t.skip('temporary filesystem did not preserve the raw filename bytes');
      return;
    }

    await assertRefuses(() => analyzeLocalDirectory(root), /non-UTF-?8|UTF-?8/i);
  });
});

test('analyzeLocalDirectory preserves distinct NFC and NFD filenames when the filesystem permits', async (t) => {
  await withTempSource(async ({ root }) => {
    const composed = 'é.txt';
    const decomposed = 'e\u0301.txt';
    fs.writeFileSync(path.join(root, composed), 'composed\n', { flag: 'wx' });
    try {
      fs.writeFileSync(path.join(root, decomposed), 'decomposed\n', { flag: 'wx' });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        t.skip('temporary filesystem normalizes NFC and NFD filenames as one entry');
        return;
      }
      throw error;
    }

    const discoveredNames = fs.readdirSync(root);
    if (!discoveredNames.includes(composed) || !discoveredNames.includes(decomposed)) {
      t.skip('temporary filesystem did not preserve both Unicode normalization forms');
      return;
    }

    const analysis = await analyzeLocalDirectory(root);

    assert.deepEqual(analysis.entries, [
      regularFileEntry(decomposed, Buffer.from('decomposed\n')),
      regularFileEntry(composed, Buffer.from('composed\n')),
    ]);
  });
});

test('analyzeLocalDirectory never follows links and requires non-link directory roots and ancestors', async (t) => {
  await t.test('keeps entry links visible without reading their targets', async () => {
    await withTempSource(async ({ fixture, root }) => {
      const external = path.join(fixture, 'external');
      fs.mkdirSync(external);
      fs.writeFileSync(path.join(external, 'oversized.bin'), Buffer.alloc(EXPECTED_LOCAL_LIMITS.max_file_bytes + 1));
      fs.symlinkSync(external, path.join(root, 'linked-directory'), 'dir');
      fs.symlinkSync(path.join(fixture, 'absent-target'), path.join(root, 'dangling-link'));

      const analysis = await analyzeLocalDirectory(root);

      assert.deepEqual(analysis.entries, [
        nonFileEntry('dangling-link', 'symbolic-link'),
        nonFileEntry('linked-directory', 'symbolic-link'),
      ]);
      assert.equal(analysis.entries.some(({ path: entryPath }) => entryPath.includes('oversized.bin')), false);
      await assertRefuses(() => analysis.getFileBytes('linked-directory'), /regular file|not a file|link/i);
    });
  });

  await t.test('rejects a missing path, regular file, link root, and link-backed ancestor', async (t) => {
    const cases = [
      {
        name: 'missing root',
        arrange({ fixture }) {
          return path.join(fixture, 'missing');
        },
        expected: /directory|missing|not found/i,
      },
      {
        name: 'regular-file root',
        arrange({ fixture }) {
          const source = path.join(fixture, 'file.txt');
          fs.writeFileSync(source, 'not a directory\n');
          return source;
        },
        expected: /directory/i,
      },
      {
        name: 'symbolic-link root',
        arrange({ fixture }) {
          const target = path.join(fixture, 'target-root');
          const source = path.join(fixture, 'linked-root');
          fs.mkdirSync(target);
          fs.symlinkSync(target, source, 'dir');
          return source;
        },
        expected: /link|directory/i,
      },
      {
        name: 'symbolic-link ancestor',
        arrange({ fixture }) {
          const targetParent = path.join(fixture, 'target-parent');
          const linkedParent = path.join(fixture, 'linked-parent');
          fs.mkdirSync(path.join(targetParent, 'child'), { recursive: true });
          fs.symlinkSync(targetParent, linkedParent, 'dir');
          return path.join(linkedParent, 'child');
        },
        expected: /ancestor|link/i,
      },
    ];

    for (const fixtureCase of cases) {
      await t.test(fixtureCase.name, async () => {
        await withTempSource(async ({ fixture, root }) => {
          fs.rmSync(root, { recursive: true, force: true });
          const source = fixtureCase.arrange({ fixture });

          await assertRefuses(() => analyzeLocalDirectory(source), fixtureCase.expected);
        });
      });
    }
  });

  await t.test('rejects discoverable control and backslash segments', { skip: path.sep !== '/' }, async (t) => {
    for (const invalidName of ['bad\nname.txt', String.raw`bad\name.txt`]) {
      await t.test(JSON.stringify(invalidName), async () => {
        await withTempSource(async ({ root }) => {
          fs.writeFileSync(path.join(root, invalidName), 'invalid path\n');

          await assertRefuses(
            () => analyzeLocalDirectory(root),
            /path|segment|control|backslash/i,
          );
        });
      });
    }
  });

  await t.test('rejects case-colliding discovered paths when the filesystem can represent them', async (t) => {
    await withTempSource(async ({ root }) => {
      fs.writeFileSync(path.join(root, 'Case.txt'), 'upper\n');
      try {
        fs.writeFileSync(path.join(root, 'case.txt'), 'lower\n', { flag: 'wx' });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
          t.skip('temporary filesystem is case-insensitive');
          return;
        }
        throw error;
      }

      await assertRefuses(
        () => analyzeLocalDirectory(root),
        /case.*collision|collision.*case/i,
      );
    });
  });
});

test('analyzeLocalDirectory inventories a FIFO as non-regular when the platform supports it', async (t) => {
  await withTempSource(async ({ root }) => {
    const fifo = path.join(root, 'events.fifo');
    const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    if (created.error || created.status !== 0) {
      t.skip(`mkfifo unavailable: ${created.error?.message ?? created.stderr.trim()}`);
      return;
    }

    const analysis = await analyzeLocalDirectory(root);

    assert.deepEqual(analysis.entries, [nonFileEntry('events.fifo', 'non-regular')]);
    await assertRefuses(() => analysis.getFileBytes('events.fifo'), /regular file|not a file|non-regular/i);
  });
});

test('analyzeLocalDirectory accepts every exact local bound and rejects plus one', async (t) => {
  const oneMiB = Buffer.alloc(EXPECTED_LOCAL_LIMITS.max_file_bytes);
  const boundaryCases = [
    {
      name: 'depth 12',
      arrange(root) {
        let current = root;
        for (let depth = 1; depth <= EXPECTED_LOCAL_LIMITS.max_depth; depth += 1) {
          current = path.join(current, `d${String(depth).padStart(2, '0')}`);
          fs.mkdirSync(current);
        }
        return current;
      },
      assertExact(analysis) {
        const deepest = analysis.entries.at(-1);
        assert.ok(deepest);
        assert.equal(deepest.path.split('/').length, EXPECTED_LOCAL_LIMITS.max_depth);
      },
      exceed(deepest) {
        fs.mkdirSync(path.join(deepest, 'too-deep'));
      },
      expected: /depth/i,
    },
    {
      name: '256 discovered entries',
      arrange(root) {
        for (let index = 0; index < EXPECTED_LOCAL_LIMITS.max_entries; index += 1) {
          fs.mkdirSync(path.join(root, `entry-${String(index).padStart(3, '0')}`));
        }
        return root;
      },
      assertExact(analysis) {
        assert.equal(analysis.entries.length, EXPECTED_LOCAL_LIMITS.max_entries);
      },
      exceed(root) {
        fs.mkdirSync(path.join(root, 'entry-over-limit'));
      },
      expected: /entr(?:y|ies)/i,
    },
    {
      name: '128 regular files',
      arrange(root) {
        for (let index = 0; index < EXPECTED_LOCAL_LIMITS.max_regular_files; index += 1) {
          fs.writeFileSync(path.join(root, `file-${String(index).padStart(3, '0')}`), Buffer.alloc(0));
        }
        return root;
      },
      assertExact(analysis) {
        assert.equal(
          analysis.entries.filter(({ entry_type: entryType }) => entryType === 'regular-file').length,
          EXPECTED_LOCAL_LIMITS.max_regular_files,
        );
      },
      exceed(root) {
        fs.writeFileSync(path.join(root, 'file-over-limit'), Buffer.alloc(0));
      },
      expected: /regular[- ]file|file count/i,
    },
    {
      name: '1 MiB per file',
      arrange(root) {
        const file = path.join(root, 'payload.bin');
        fs.writeFileSync(file, oneMiB);
        return file;
      },
      assertExact(analysis) {
        assert.equal(analysis.entries[0].byte_count, EXPECTED_LOCAL_LIMITS.max_file_bytes);
      },
      exceed(file) {
        fs.appendFileSync(file, Buffer.from([0]));
      },
      expected: /per[- ]file|file (?:size|byte)|1 MiB|1048576/i,
    },
    {
      name: '4 MiB total regular-file bytes',
      arrange(root) {
        for (let index = 0; index < 4; index += 1) {
          fs.writeFileSync(path.join(root, `one-mib-${index}.bin`), oneMiB);
        }
        return root;
      },
      assertExact(analysis) {
        const totalBytes = analysis.entries.reduce((total, entry) => total + entry.byte_count, 0);
        assert.equal(totalBytes, EXPECTED_LOCAL_LIMITS.max_total_bytes);
      },
      exceed(root) {
        fs.writeFileSync(path.join(root, 'one-byte-over-total.bin'), Buffer.from([0]));
      },
      expected: /total|aggregate|4 MiB|4194304/i,
    },
  ];

  for (const boundaryCase of boundaryCases) {
    await t.test(boundaryCase.name, async () => {
      await withTempSource(async ({ root }) => {
        const mutationTarget = boundaryCase.arrange(root);

        const exactAnalysis = await analyzeLocalDirectory(root);

        boundaryCase.assertExact(exactAnalysis);
        boundaryCase.exceed(mutationTarget);
        await assertRefuses(() => analyzeLocalDirectory(root), boundaryCase.expected);
      });
    });
  }
});

test('revalidate detects observed local content, membership, type, and identity drift', async (t) => {
  function populate(root) {
    fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'alpha.txt'), 'alpha');
  }

  const driftCases = [
    {
      name: 'same-size file content change',
      mutate({ root }) {
        fs.writeFileSync(path.join(root, 'alpha.txt'), 'omega');
      },
    },
    {
      name: 'file growth',
      mutate({ root }) {
        fs.appendFileSync(path.join(root, 'alpha.txt'), '-expanded');
      },
    },
    {
      name: 'file shrink',
      mutate({ root }) {
        fs.truncateSync(path.join(root, 'alpha.txt'), 1);
      },
    },
    {
      name: 'file membership addition',
      mutate({ root }) {
        fs.writeFileSync(path.join(root, 'added.txt'), 'added');
      },
    },
    {
      name: 'file membership removal',
      mutate({ root }) {
        fs.rmSync(path.join(root, 'alpha.txt'));
      },
    },
    {
      name: 'file type change',
      mutate({ root }) {
        fs.rmSync(path.join(root, 'alpha.txt'));
        fs.mkdirSync(path.join(root, 'alpha.txt'));
      },
    },
    {
      name: 'file identity change with identical bytes',
      mutate({ fixture, root }) {
        fs.renameSync(path.join(root, 'alpha.txt'), path.join(fixture, 'held-file'));
        fs.writeFileSync(path.join(root, 'alpha.txt'), 'alpha');
      },
    },
    {
      name: 'directory identity change',
      mutate({ fixture, root }) {
        fs.renameSync(path.join(root, 'nested'), path.join(fixture, 'held-directory'));
        fs.mkdirSync(path.join(root, 'nested'));
      },
    },
    {
      name: 'root identity change',
      mutate({ fixture, root }) {
        fs.renameSync(root, path.join(fixture, 'held-root'));
        fs.mkdirSync(root);
        populate(root);
      },
    },
    {
      name: 'ancestor identity change',
      mutate({ fixture, ancestor, root }) {
        fs.renameSync(ancestor, path.join(fixture, 'held-ancestor'));
        fs.mkdirSync(root, { recursive: true });
        populate(root);
      },
    },
  ];

  for (const driftCase of driftCases) {
    await t.test(driftCase.name, async () => {
      await withTempSource(async ({ fixture, root: initialRoot }) => {
        fs.rmSync(initialRoot, { recursive: true, force: true });
        const ancestor = path.join(fixture, 'ancestor');
        const root = path.join(ancestor, 'source');
        populate(root);
        const analysis = await analyzeLocalDirectory(root);
        await assert.doesNotReject(async () => analysis.revalidate());

        driftCase.mutate({ fixture, ancestor, root });

        await assert.rejects(async () => analysis.revalidate());
      });
    });
  }
});

test('GitHub directory source constants publish the fixed transport bounds', { concurrency: false }, () => {
  const networkLimits = Object.fromEntries(
    Object.keys(EXPECTED_NETWORK_LIMITS).map((key) => [key, DIRECTORY_SOURCE_LIMITS[key]]),
  );

  assert.deepEqual(networkLimits, EXPECTED_NETWORK_LIMITS);
  assert.equal(Object.isFrozen(DIRECTORY_SOURCE_LIMITS), true);
});

test('analyzeGitHubDirectory accepts only exact canonical public tree URLs', { concurrency: false }, async (t) => {
  const canonical = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/tree/${GITHUB_REF}/artifacts/example`;
  const invalidSources = [
    ['non-string', /** @type {any} */ (new URL(canonical))],
    ['HTTP scheme', canonical.replace('https:', 'http:')],
    ['scheme case variant', canonical.replace('https:', 'HTTPS:')],
    ['host case variant', canonical.replace('github.com', 'GitHub.com')],
    ['host variant', canonical.replace('github.com', 'www.github.com')],
    ['credentials', canonical.replace('github.com', 'user:secret@github.com')],
    ['explicit default port', canonical.replace('github.com', 'github.com:443')],
    ['non-default port', canonical.replace('github.com', 'github.com:444')],
    ['query', `${canonical}?download=1`],
    ['fragment', `${canonical}#readme`],
    ['tree case variant', canonical.replace('/tree/', '/Tree/')],
    ['repository .git suffix', canonical.replace('/widgets/', '/widgets.git/')],
    ['empty owner', canonical.replace('/acme/widgets/', '//widgets/')],
    ['empty repository', canonical.replace('/widgets/tree/', '//tree/')],
    ['empty ref', canonical.replace('/main/', '//')],
    ['empty subtree', canonical.replace('/artifacts/example', '/')],
    ['empty path segment', canonical.replace('/artifacts/example', '/artifacts//example')],
    ['literal dot segment', canonical.replace('/artifacts/example', '/artifacts/./example')],
    ['encoded dot segment', canonical.replace('/artifacts/example', '/artifacts/%2e/example')],
    ['literal parent segment', canonical.replace('/artifacts/example', '/artifacts/../example')],
    ['encoded parent segment', canonical.replace('/artifacts/example', '/artifacts/%2E%2E/example')],
    ['literal backslash', canonical.replace('/artifacts/example', String.raw`/artifacts\example`)],
    ['encoded slash in ref', canonical.replace('/main/', '/feature%2Fbranch/')],
    ['encoded slash in subtree', canonical.replace('/artifacts/example', '/artifacts%2fexample')],
    ['encoded backslash', canonical.replace('/artifacts/example', '/artifacts%5Cexample')],
    ['encoded unreserved owner', canonical.replace('/acme/', '/%61cme/')],
    ['malformed escape', canonical.replace('/artifacts/example', '/artifacts/%')],
    ['malformed UTF-8', canonical.replace('/artifacts/example', '/artifacts/%C3%28')],
    ['control character', canonical.replace('/artifacts/example', '/artifacts/%00example')],
    ['unsafe ref dot sequence', canonical.replace('/main/', '/release..candidate/')],
    ['unsafe ref reflog token', canonical.replace('/main/', '/release@{1}/')],
    ['unsafe ref lock suffix', canonical.replace('/main/', '/release.lock/')],
    ['unsafe ref metacharacter', canonical.replace('/main/', '/release^candidate/')],
  ];

  for (const [name, source] of invalidSources) {
    await t.test(String(name), async () => {
      await withMockFetch(
        async () => assert.fail('invalid source must not fetch'),
        async ({ calls }) => {
          await assertRefuses(
            () => analyzeGitHubDirectory(source),
            /GitHub|source|URL|tree|path|ref|string|canonical|invalid/i,
          );
          assert.equal(calls.length, 0);
        },
      );
    });
  }

  await t.test('publishes source-only APIs with no caller options parameter', () => {
    assert.equal(analyzeGitHubDirectory.length, 1);
    assert.equal(analyzeDirectorySource.length, 1);
  });
});

test('analyzeDirectorySource is a closed GitHub-or-local dispatcher', { concurrency: false }, async (t) => {
  await t.test('routes a canonical GitHub tree URL through the GitHub provider', async () => {
    const fixture = githubProtocolFixture({ selectedItems: [], includeRawSteps: false });
    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeDirectorySource(fixture.source);
      assert.equal(analysis.source.provider, 'github-tree');
    });
  });

  await t.test('routes an ordinary local path through the existing local provider', async () => {
    await withTempSource(async ({ root }) => {
      fs.writeFileSync(path.join(root, 'local.txt'), 'local\n');
      await withMockFetch(
        async () => assert.fail('local source must not fetch'),
        async ({ calls }) => {
          const dispatched = await analyzeDirectorySource(root);
          const direct = await analyzeLocalDirectory(root);
          assert.equal(dispatched.source.provider, 'local-directory');
          assert.deepEqual(dispatched.source, direct.source);
          assert.deepEqual(dispatched.entries, direct.entries);
          assert.equal(dispatched.manifest_sha256, direct.manifest_sha256);
          assert.equal(calls.length, 0);
        },
      );
    });
  });

  await t.test('keeps Windows drive paths on the local branch', async () => {
    await withMockFetch(
      async () => assert.fail('Windows path must not fetch'),
      async ({ calls }) => {
        await assert.rejects(
          () => analyzeDirectorySource(String.raw`C:\Users\dev\artifact`),
          (error) => !/GitHub.*URL|invalid.*URL|canonical.*URL/i.test(String(error?.message)),
        );
        assert.equal(calls.length, 0);
      },
    );
  });

  await t.test('does not fall back to a planted local directory for URI-shaped malformed input', async () => {
    await withTempSource(async ({ fixture }) => {
      const malformed = 'https:/github.com/acme/widgets/tree/main/artifacts/example';
      const originalCwd = process.cwd();
      try {
        process.chdir(fixture);
        const planted = path.resolve(malformed);
        fs.mkdirSync(planted, { recursive: true });
        fs.writeFileSync(path.join(planted, 'local.txt'), 'must not be read\n');
        await withMockFetch(
          async () => assert.fail('malformed URI must not fetch'),
          async ({ calls }) => {
            await assertRefuses(
              () => analyzeDirectorySource(malformed),
              /GitHub|source|URL|canonical|invalid/i,
            );
            assert.equal(calls.length, 0);
          },
        );
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  for (const malformed of [
    '//github.com/acme/widgets/tree/main/artifacts/example',
    'data:text/plain,artifact',
    'https:github.com/acme/widgets/tree/main/artifacts/example',
  ]) {
    await t.test(`rejects URI-shaped ${JSON.stringify(malformed)}`, async () => {
      await withMockFetch(
        async () => assert.fail('malformed URI must not fetch'),
        async ({ calls }) => {
          await assertRefuses(
            () => analyzeDirectorySource(malformed),
            /GitHub|source|URL|canonical|invalid/i,
          );
          assert.equal(calls.length, 0);
        },
      );
    });
  }
});

test('analyzeGitHubDirectory follows the lean metadata/raw protocol and matches local entries', { concurrency: false }, async () => {
  const selectedItems = [
    githubBlobItem('run.sh', GITHUB_PARITY_FILES['run.sh'], '100755'),
    githubBlobItem('nested/data.bin', GITHUB_PARITY_FILES['nested/data.bin']),
    githubTreeItem('nested'),
    githubBlobItem('README.md', GITHUB_PARITY_FILES['README.md']),
  ];
  const fixture = githubProtocolFixture({ selectedItems });
  const readmeGitSha = selectedItems.at(-1)?.sha;
  assert.equal(
    readmeGitSha,
    crypto.createHash('sha1')
      .update(Buffer.concat([
        Buffer.from(`blob ${GITHUB_PARITY_FILES['README.md'].length}\0`),
        GITHUB_PARITY_FILES['README.md'],
      ]))
      .digest('hex'),
  );
  assert.notEqual(
    readmeGitSha,
    crypto.createHash('sha1').update(GITHUB_PARITY_FILES['README.md']).digest('hex'),
    'Git blob verification includes the blob header, not just content bytes',
  );

  await withTempSource(async ({ root }) => {
    fs.mkdirSync(path.join(root, 'nested'));
    for (const [relativePath, bytes] of Object.entries(GITHUB_PARITY_FILES)) {
      fs.writeFileSync(path.join(root, ...relativePath.split('/')), bytes);
    }
    const local = await analyzeLocalDirectory(root);

    await withFetchScript(fixture.steps, async ({ calls, maximumConcurrency }) => {
      const analysis = await analyzeGitHubDirectory(fixture.source);

      assert.deepEqual(analysis.source, {
        provider: 'github-tree',
        input: fixture.source,
        identity: {
          owner: GITHUB_OWNER,
          repository: GITHUB_REPOSITORY,
          requested_ref: GITHUB_REF,
          resolved_commit: GITHUB_COMMIT,
          subtree: fixture.subtree,
          tree_sha: fixture.selectedTreeSha,
        },
      });
      assert.deepEqual(analysis.entries, local.entries);
      assert.equal(analysis.manifest_sha256, local.manifest_sha256);
      assert.equal(analysis.entries.some(({ path: entryPath }) => entryPath === ''), false);
      assert.deepEqual(analysis.entries.map(({ path: entryPath }) => entryPath), [
        'README.md',
        'nested',
        'nested/data.bin',
        'run.sh',
      ]);
      assert.equal(analysis.entries.find(({ path: entryPath }) => entryPath === 'nested/data.bin')?.content_class, 'opaque');
      assert.equal(analysis.entries.find(({ path: entryPath }) => entryPath === 'run.sh')?.content_class, 'text');

      const firstCopy = await analysis.getFileBytes('README.md');
      const secondCopy = await analysis.getFileBytes('README.md');
      assert.notStrictEqual(firstCopy, secondCopy);
      firstCopy.fill(0);
      assert.deepEqual(secondCopy, GITHUB_PARITY_FILES['README.md']);
      assert.deepEqual(await analysis.getFileBytes('README.md'), GITHUB_PARITY_FILES['README.md']);
      await assertRefuses(() => analysis.getFileBytes('nested'), /regular file|not a file/i);
      await assertRefuses(() => analysis.getFileBytes('missing.txt'), /unknown|missing|not found/i);

      const expectedUrls = fixture.steps.map(({ url }) => url);
      assert.deepEqual(calls.map(({ url }) => url), expectedUrls);
      assert.equal(calls.at(-1)?.url, githubCommitUrl(), 'the final call rechecks the requested ref');
      const rawCalls = calls.filter(({ url }) => url.startsWith('https://raw.githubusercontent.com/'));
      assert.deepEqual(rawCalls.map(({ url }) => url), [
        githubRawUrl(GITHUB_COMMIT, ['artifacts', 'example'], 'README.md'),
        githubRawUrl(GITHUB_COMMIT, ['artifacts', 'example'], 'nested/data.bin'),
        githubRawUrl(GITHUB_COMMIT, ['artifacts', 'example'], 'run.sh'),
      ]);
      assert.equal(rawCalls.every(({ url }) => url.includes(`/${GITHUB_COMMIT}/`)), true);
      assert.equal(rawCalls.some(({ url }) => url.includes(`/${GITHUB_REF}/`)), false);
      assert.equal(calls.some(({ url }) => url === MALICIOUS_RESPONSE_URL), false);
      assert.equal(calls.some(({ url }) => /graphql|\/git\/blobs\/|archive|\.git(?:\/|$)/i.test(url)), false);
      assert.equal(maximumConcurrency(), 1, 'metadata and raw requests are sequential');
    });
  });
});

test('analyzeGitHubDirectory maps fixed Git modes without fetching links or submodules', { concurrency: false }, async () => {
  const regularBytes = Buffer.from('regular\n');
  const executableBytes = Buffer.from('#!/bin/sh\n');
  const files = {
    'regular.txt': regularBytes,
    'tool.sh': executableBytes,
  };
  const selectedItems = [
    { ...githubTreeItem('folder'), size: 99 },
    githubBlobItem('regular.txt', regularBytes, '100644'),
    githubBlobItem('tool.sh', executableBytes, '100755'),
    {
      path: 'linked',
      mode: '120000',
      type: 'blob',
      sha: gitBlobSha1(Buffer.from('../outside')),
      size: 10,
      url: MALICIOUS_RESPONSE_URL,
    },
    {
      path: 'vendor',
      mode: '160000',
      type: 'commit',
      sha: '5'.repeat(40),
      url: MALICIOUS_RESPONSE_URL,
    },
  ];
  const fixture = githubProtocolFixture({ selectedItems, files });

  await withFetchScript(fixture.steps, async ({ calls }) => {
    const analysis = await analyzeGitHubDirectory(fixture.source);

    assert.deepEqual(analysis.entries, [
      nonFileEntry('folder', 'directory'),
      nonFileEntry('linked', 'symbolic-link'),
      regularFileEntry('regular.txt', regularBytes),
      regularFileEntry('tool.sh', executableBytes),
      nonFileEntry('vendor', 'non-regular'),
    ]);
    const rawUrls = calls
      .map(({ url }) => url)
      .filter((url) => url.startsWith('https://raw.githubusercontent.com/'));
    assert.equal(rawUrls.length, 2);
    assert.equal(rawUrls.some((url) => /\/linked$|\/vendor$/.test(url)), false);
    await assertRefuses(() => analysis.getFileBytes('linked'), /regular file|not a file|link/i);
    await assertRefuses(() => analysis.getFileBytes('vendor'), /regular file|not a file|non-regular/i);
  });
});

test('analyzeGitHubDirectory rejects malformed modes, types, identities, and tree records', { concurrency: false }, async (t) => {
  const validBytes = Buffer.from('valid\n');
  const validItem = githubBlobItem('valid.txt', validBytes);
  const malformedItems = [
    ['unknown mode', { ...validItem, mode: '100664' }],
    ['short mode', { ...validItem, mode: '10064' }],
    ['non-string mode', { ...validItem, mode: 100644 }],
    ['mode/type mismatch for directory', { ...githubTreeItem('folder'), type: 'blob' }],
    ['mode/type mismatch for regular file', { ...validItem, type: 'tree' }],
    ['mode/type mismatch for link', { ...validItem, mode: '120000', type: 'tree' }],
    ['mode/type mismatch for submodule', { ...validItem, mode: '160000', type: 'blob' }],
    ['unknown type', { ...validItem, type: 'file' }],
    ['missing mode', { path: 'valid.txt', type: 'blob', sha: validItem.sha, size: validBytes.length }],
    ['missing type', { path: 'valid.txt', mode: '100644', sha: validItem.sha, size: validBytes.length }],
    ['missing path', { mode: '100644', type: 'blob', sha: validItem.sha, size: validBytes.length }],
    ['missing regular-file size', { path: 'valid.txt', mode: '100644', type: 'blob', sha: validItem.sha }],
    ['negative regular-file size', { ...validItem, size: -1 }],
    ['fractional regular-file size', { ...validItem, size: 1.5 }],
    ['unsafe regular-file size', { ...validItem, size: Number.MAX_SAFE_INTEGER + 1 }],
    ['malformed object ID', { ...validItem, sha: 'not-a-git-object-id' }],
  ];

  for (const [name, item] of malformedItems) {
    await t.test(String(name), async () => {
      const fixture = githubProtocolFixture({
        selectedItems: [item],
        includeRawSteps: false,
      });
      await withFetchScript(fixture.steps, async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(fixture.source),
          /mode|type|tree|path|size|byte|SHA|object|malformed|invalid/i,
        );
        assert.equal(
          calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')),
          false,
        );
      }, { requireAll: false });
    });
  }

  const malformedTrees = [
    ['truncated tree', (value) => ({ ...value, truncated: true })],
    ['missing truncation marker', ({ truncated, ...value }) => value],
    ['non-boolean truncation marker', (value) => ({ ...value, truncated: 'false' })],
    ['missing tree array', ({ tree, ...value }) => value],
    ['non-array tree', (value) => ({ ...value, tree: {} })],
    ['wrong selected tree identity', (value) => ({ ...value, sha: '9'.repeat(40) })],
    ['duplicate path', (value) => ({ ...value, tree: [validItem, { ...validItem }] })],
    ['case-colliding path', (value) => ({
      ...value,
      tree: [validItem, { ...validItem, path: 'VALID.txt' }],
    })],
    ['parent path escape', (value) => ({ ...value, tree: [{ ...validItem, path: '../valid.txt' }] })],
    ['empty path segment', (value) => ({ ...value, tree: [{ ...validItem, path: 'bad//valid.txt' }] })],
    ['backslash path', (value) => ({ ...value, tree: [{ ...validItem, path: String.raw`bad\valid.txt` }] })],
  ];

  for (const [name, mutate] of malformedTrees) {
    await t.test(String(name), async () => {
      const fixture = githubProtocolFixture({ selectedItems: [validItem], includeRawSteps: false });
      const recursiveStep = fixture.steps.at(-2);
      assert.ok(recursiveStep);
      recursiveStep.reply = () => jsonResponse(mutate(recursiveStep.value));

      await withFetchScript(fixture.steps, async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(fixture.source),
          /tree|truncat|duplicate|case|collision|path|identity|malformed|invalid/i,
        );
        assert.equal(calls.at(-1)?.url, githubTreeUrl(fixture.selectedTreeSha, true));
      }, { requireAll: false });
    });
  }
});

test('analyzeGitHubDirectory enforces the derived metadata-request and inventory bounds', { concurrency: false }, async (t) => {
  await t.test('accepts 13 subtree segments in exactly 16 metadata requests', async () => {
    const subtreeSegments = Array.from({ length: 13 }, (_, index) => `s${String(index).padStart(2, '0')}`);
    const fixture = githubProtocolFixture({
      subtreeSegments,
      selectedItems: [],
      includeRawSteps: false,
    });
    assert.equal(fixture.steps.length, EXPECTED_NETWORK_LIMITS.max_metadata_requests);

    await withFetchScript(fixture.steps, async ({ calls }) => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.deepEqual(analysis.entries, []);
      assert.equal(calls.length, EXPECTED_NETWORK_LIMITS.max_metadata_requests);
      assert.equal(calls.at(-1)?.url, githubCommitUrl());
    });
  });

  await t.test('rejects a 14-segment subtree before exceeding 16 metadata requests', async () => {
    const subtree = Array.from({ length: 14 }, (_, index) => `s${index}`).join('/');
    const source = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/tree/${GITHUB_REF}/${subtree}`;
    await withMockFetch(
      async () => assert.fail('derived over-limit source must not fetch'),
      async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(source),
          /metadata|request|subtree|segment|limit|16/i,
        );
        assert.equal(calls.length, 0);
      },
    );
  });

  function nestedItems(depth, bytes = Buffer.from('deep\n')) {
    const directories = Array.from({ length: depth - 1 }, (_, index) => (
      Array.from({ length: index + 1 }, (__, segmentIndex) => `d${segmentIndex}`).join('/')
    ));
    const filePath = [...directories.at(-1)?.split('/') ?? [], 'leaf.txt'].join('/');
    return {
      files: { [filePath]: bytes },
      items: [
        ...directories.map((directoryPath) => githubTreeItem(directoryPath)),
        githubBlobItem(filePath, bytes),
      ],
      filePath,
    };
  }

  await t.test('accepts depth 12 and rejects depth 13 before raw content', async () => {
    const exact = nestedItems(EXPECTED_LOCAL_LIMITS.max_depth);
    const exactFixture = githubProtocolFixture({ selectedItems: exact.items, files: exact.files });
    await withFetchScript(exactFixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(exactFixture.source);
      assert.equal(analysis.entries.at(-1)?.path, exact.filePath);
      assert.equal(exact.filePath.split('/').length, EXPECTED_LOCAL_LIMITS.max_depth);
    });

    const over = nestedItems(EXPECTED_LOCAL_LIMITS.max_depth + 1);
    const overFixture = githubProtocolFixture({
      selectedItems: over.items,
      files: over.files,
      includeRawSteps: false,
    });
    await withFetchScript(overFixture.steps, async ({ calls }) => {
      await assertRefuses(() => analyzeGitHubDirectory(overFixture.source), /depth|12/i);
      assert.equal(calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')), false);
    }, { requireAll: false });
  });

  await t.test('accepts 256 entries and rejects entry 257 before raw content', async () => {
    const exactItems = Array.from(
      { length: EXPECTED_LOCAL_LIMITS.max_entries },
      (_, index) => githubTreeItem(`entry-${String(index).padStart(3, '0')}`),
    );
    const exactFixture = githubProtocolFixture({ selectedItems: exactItems, includeRawSteps: false });
    await withFetchScript(exactFixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(exactFixture.source);
      assert.equal(analysis.entries.length, EXPECTED_LOCAL_LIMITS.max_entries);
    });

    const overFixture = githubProtocolFixture({
      selectedItems: [...exactItems, githubTreeItem('entry-over-limit')],
      includeRawSteps: false,
    });
    await withFetchScript(overFixture.steps, async ({ calls }) => {
      await assertRefuses(() => analyzeGitHubDirectory(overFixture.source), /entr(?:y|ies)|256|limit/i);
      assert.equal(calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')), false);
    }, { requireAll: false });
  });

  await t.test('accepts 128 regular files/raw requests and rejects file 129 before raw content', async () => {
    const files = Object.fromEntries(Array.from(
      { length: EXPECTED_LOCAL_LIMITS.max_regular_files },
      (_, index) => [`file-${String(index).padStart(3, '0')}.txt`, Buffer.alloc(0)],
    ));
    const exactItems = Object.entries(files).map(([relativePath, bytes]) => githubBlobItem(relativePath, bytes));
    const exactFixture = githubProtocolFixture({ selectedItems: exactItems, files });
    await withFetchScript(exactFixture.steps, async ({ calls, maximumConcurrency }) => {
      const analysis = await analyzeGitHubDirectory(exactFixture.source);
      assert.equal(analysis.entries.length, EXPECTED_LOCAL_LIMITS.max_regular_files);
      assert.equal(
        calls.filter(({ url }) => url.startsWith('https://raw.githubusercontent.com/')).length,
        EXPECTED_NETWORK_LIMITS.max_raw_requests,
      );
      assert.equal(maximumConcurrency(), 1);
    });

    const overItems = [
      ...exactItems,
      githubBlobItem('file-over-limit.txt', Buffer.alloc(0)),
    ];
    const overFixture = githubProtocolFixture({ selectedItems: overItems, includeRawSteps: false });
    await withFetchScript(overFixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(overFixture.source),
        /regular[- ]file|file count|raw request|128|limit/i,
      );
      assert.equal(calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')), false);
    }, { requireAll: false });
  });

  await t.test('accepts exact per-file and aggregate bytes', async () => {
    const oneMiB = Buffer.alloc(EXPECTED_LOCAL_LIMITS.max_file_bytes, 0x61);
    const files = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [`one-mib-${index}.bin`, Buffer.from(oneMiB)]),
    );
    const items = Object.entries(files).map(([relativePath, bytes]) => githubBlobItem(relativePath, bytes));
    const fixture = githubProtocolFixture({ selectedItems: items, files });
    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.equal(
        analysis.entries.reduce((total, entry) => total + entry.byte_count, 0),
        EXPECTED_LOCAL_LIMITS.max_total_bytes,
      );
      assert.equal(analysis.entries.every((entry) => entry.byte_count === oneMiB.length), true);
    });
  });

  await t.test('rejects metadata-declared per-file and aggregate byte limits before raw content', async (t) => {
    const overFileBytes = Buffer.alloc(EXPECTED_LOCAL_LIMITS.max_file_bytes + 1);
    const perFileFixture = githubProtocolFixture({
      selectedItems: [githubBlobItem('too-large.bin', overFileBytes)],
      includeRawSteps: false,
    });
    await withFetchScript(perFileFixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(perFileFixture.source),
        /per[- ]file|file (?:size|byte)|1 MiB|1048576/i,
      );
      assert.equal(calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')), false);
    }, { requireAll: false });

    const oneMiB = Buffer.alloc(EXPECTED_LOCAL_LIMITS.max_file_bytes);
    const aggregateFiles = {
      'a.bin': oneMiB,
      'b.bin': oneMiB,
      'c.bin': oneMiB,
      'd.bin': oneMiB,
      'extra.bin': Buffer.from('x'),
    };
    const aggregateFixture = githubProtocolFixture({
      selectedItems: Object.entries(aggregateFiles)
        .map(([relativePath, bytes]) => githubBlobItem(relativePath, bytes)),
      includeRawSteps: false,
    });
    await withFetchScript(aggregateFixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(aggregateFixture.source),
        /aggregate|total|4 MiB|4194304/i,
      );
      assert.equal(calls.some(({ url }) => url.startsWith('https://raw.githubusercontent.com/')), false);
    }, { requireAll: false });
  });
});

test('analyzeGitHubDirectory binds raw bytes to metadata size, Git blob SHA-1, and SHA-256', { concurrency: false }, async (t) => {
  const expectedBytes = Buffer.from('verified content\n');
  const baseItem = githubBlobItem('verified.txt', expectedBytes);
  const integrityCases = [
    {
      name: 'metadata size is smaller than raw bytes',
      item: { ...baseItem, size: expectedBytes.length - 1 },
      rawBytes: expectedBytes,
      expected: /size|byte count|metadata|mismatch/i,
    },
    {
      name: 'metadata size is larger than raw bytes',
      item: { ...baseItem, size: expectedBytes.length + 1 },
      rawBytes: expectedBytes,
      expected: /size|byte count|metadata|mismatch/i,
    },
    {
      name: 'Git blob SHA does not match exact bytes',
      item: { ...baseItem, sha: gitBlobSha1(Buffer.from('different content\n')) },
      rawBytes: expectedBytes,
      expected: /Git|blob|SHA|hash|integrity|mismatch/i,
    },
    {
      name: 'same-length raw content differs from tree identity',
      item: baseItem,
      rawBytes: Buffer.from('VERIFIED CONTENT\n'),
      expected: /Git|blob|SHA|hash|integrity|mismatch/i,
    },
  ];

  for (const integrityCase of integrityCases) {
    await t.test(integrityCase.name, async () => {
      assert.equal(integrityCase.rawBytes.length, expectedBytes.length);
      const fixture = githubProtocolFixture({
        selectedItems: [integrityCase.item],
        files: { 'verified.txt': expectedBytes },
      });
      const raw = fixture.steps.find(({ kind }) => kind === 'raw');
      assert.ok(raw);
      raw.reply = () => rawResponse(integrityCase.rawBytes);

      await withFetchScript(fixture.steps, async ({ calls }) => {
        await assertRefuses(() => analyzeGitHubDirectory(fixture.source), integrityCase.expected);
        assert.equal(calls.at(-1)?.url, githubRawUrl(GITHUB_COMMIT, ['artifacts', 'example'], 'verified.txt'));
        assert.equal(
          calls.filter(({ url }) => url === githubCommitUrl()).length,
          1,
          'integrity failure occurs before the final ref check',
        );
      }, { requireAll: false });
    });
  }

  await t.test('successful entry SHA-256 is independent of the Git blob SHA-1', async () => {
    const fixture = githubProtocolFixture({
      selectedItems: [baseItem],
      files: { 'verified.txt': expectedBytes },
    });
    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.equal(analysis.entries[0].sha256, sha256(expectedBytes));
      assert.equal(baseItem.sha, gitBlobSha1(expectedBytes));
      assert.notEqual(analysis.entries[0].sha256, baseItem.sha);
    });
  });
});

test('analyzeGitHubDirectory requires exact HTTP 200 responses and disposes rejected bodies', { concurrency: false }, async (t) => {
  const responseCases = [
    {
      name: 'metadata valid JSON with HTTP 206',
      target: 'commit',
      expectedStatus: 206,
      reply(value, onCancel) {
        return streamResponse([Buffer.from(JSON.stringify(value))], {
          status: 206,
          headers: { 'content-type': 'application/json' },
          onCancel,
        });
      },
    },
    {
      name: 'raw valid bytes with HTTP 206',
      target: 'raw',
      expectedStatus: 206,
      reply(value, onCancel) {
        return streamResponse([value], { status: 206, onCancel });
      },
    },
  ];

  for (const responseCase of responseCases) {
    await t.test(`rejects ${responseCase.name}`, async () => {
      const rawBytes = Buffer.from('partial response bytes\n');
      const fixture = githubProtocolFixture({
        selectedItems: [githubBlobItem('partial.txt', rawBytes)],
        files: { 'partial.txt': rawBytes },
      });
      const targetStep = responseCase.target === 'commit'
        ? fixture.steps[0]
        : fixture.steps.find(({ kind }) => kind === 'raw');
      assert.ok(targetStep);
      let cancelCalls = 0;
      targetStep.reply = () => responseCase.reply(
        responseCase.target === 'commit' ? targetStep.value : rawBytes,
        () => {
          cancelCalls += 1;
        },
      );

      await withFetchScript(fixture.steps, async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(fixture.source),
          new RegExp(
            `(?:HTTP|status).*${responseCase.expectedStatus}|${responseCase.expectedStatus}.*(?:HTTP|status)`,
            'i',
          ),
        );
        const targetUrl = responseCase.target === 'commit'
          ? githubCommitUrl()
          : githubRawUrl(GITHUB_COMMIT, ['artifacts', 'example'], 'partial.txt');
        const request = calls.find(({ url }) => url === targetUrl);
        assert.ok(request);
        assert.deepEqual(
          { requestAborted: request.signal.aborted, cancelCalls },
          { requestAborted: true, cancelCalls: 1 },
          'a rejected response aborts its request and cancels its body best-effort',
        );
      }, { requireAll: false });
    });
  }

  await t.test('rejects a raw empty Git blob with HTTP 204 and no response body', async () => {
    const rawBytes = Buffer.alloc(0);
    const fixture = githubProtocolFixture({
      selectedItems: [githubBlobItem('empty.txt', rawBytes)],
      files: { 'empty.txt': rawBytes },
    });
    const raw = fixture.steps.find(({ kind }) => kind === 'raw');
    assert.ok(raw);
    raw.reply = () => {
      const response = rawResponse(null, { status: 204 });
      assert.equal(response.body, null, 'HTTP 204 has no body to cancel');
      return response;
    };

    await withFetchScript(fixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(fixture.source),
        /(?:HTTP|status).*204|204.*(?:HTTP|status)/i,
      );
      const request = calls.find(({ url }) => url.endsWith('/empty.txt'));
      assert.ok(request);
      assert.equal(request.signal.aborted, true, 'bodyless rejection still aborts its request');
    }, { requireAll: false });
  });
});

test('analyzeGitHubDirectory bounds metadata and raw response bodies while streaming', { concurrency: false }, async (t) => {
  const oneMiB = EXPECTED_NETWORK_LIMITS.max_metadata_response_bytes;
  const oneMiBPlusOne = oneMiB + 1;

  const responseCases = [
    {
      name: 'metadata rejects an oversized declared Content-Length before reading',
      target: 'commit',
      reply(onCancel) {
        return streamResponse([Buffer.from(JSON.stringify(
          githubCommitValue(GITHUB_COMMIT, GITHUB_ROOT_TREE),
        ))], {
          headers: { 'content-length': String(oneMiBPlusOne) },
          onCancel,
        });
      },
      expected: /metadata.*(?:response|body|size)|(?:response|body|size).*metadata|1 MiB|1048576/i,
    },
    {
      name: 'metadata rejects a malformed Content-Length',
      target: 'commit',
      reply(onCancel) {
        return streamResponse([Buffer.from(JSON.stringify(
          githubCommitValue(GITHUB_COMMIT, GITHUB_ROOT_TREE),
        ))], {
          headers: { 'content-length': '12x' },
          onCancel,
        });
      },
      expected: /content-length|header|malformed|invalid/i,
    },
    {
      name: 'metadata rejects a streamed plus-one body with no Content-Length',
      target: 'commit',
      reply(onCancel) {
        return streamResponse([Buffer.alloc(oneMiB), Buffer.from('x')], { onCancel });
      },
      expected: /metadata.*(?:response|body|size)|(?:response|body|size).*metadata|1 MiB|1048576/i,
    },
    {
      name: 'metadata rejects a lying-small Content-Length by streamed bytes',
      target: 'commit',
      reply(onCancel) {
        return streamResponse([Buffer.alloc(oneMiB), Buffer.from('x')], {
          headers: { 'content-length': '16' },
          onCancel,
        });
      },
      expected: /metadata.*(?:response|body|size)|(?:response|body|size).*metadata|1 MiB|1048576/i,
    },
    {
      name: 'raw rejects an oversized declared Content-Length before reading',
      target: 'raw',
      reply(onCancel) {
        return streamResponse([Buffer.from('x')], {
          headers: { 'content-length': String(oneMiBPlusOne) },
          onCancel,
        });
      },
      expected: /raw.*(?:response|body|size)|(?:response|body|size).*raw|1 MiB|1048576/i,
    },
    {
      name: 'raw rejects a malformed Content-Length',
      target: 'raw',
      reply(onCancel) {
        return streamResponse([Buffer.from('x')], {
          headers: { 'content-length': '-1' },
          onCancel,
        });
      },
      expected: /content-length|header|malformed|invalid/i,
    },
    {
      name: 'raw rejects a streamed plus-one body with no Content-Length',
      target: 'raw',
      reply(onCancel) {
        return streamResponse([Buffer.alloc(oneMiB), Buffer.from('x')], { onCancel });
      },
      expected: /raw.*(?:response|body|size)|(?:response|body|size).*raw|1 MiB|1048576/i,
    },
    {
      name: 'raw rejects a lying-small Content-Length by streamed bytes',
      target: 'raw',
      reply(onCancel) {
        return streamResponse([Buffer.alloc(oneMiB), Buffer.from('x')], {
          headers: { 'content-length': '16' },
          onCancel,
        });
      },
      expected: /raw.*(?:response|body|size)|(?:response|body|size).*raw|1 MiB|1048576/i,
    },
  ];

  for (const responseCase of responseCases) {
    await t.test(responseCase.name, async () => {
      const rawBytes = Buffer.from('raw\n');
      const fixture = githubProtocolFixture({
        selectedItems: [githubBlobItem('raw.txt', rawBytes)],
        files: { 'raw.txt': rawBytes },
      });
      const targetStep = responseCase.target === 'commit'
        ? fixture.steps[0]
        : fixture.steps.find(({ kind }) => kind === 'raw');
      assert.ok(targetStep);
      let cancelCalls = 0;
      targetStep.reply = () => responseCase.reply(() => {
        cancelCalls += 1;
      });

      await withFetchScript(fixture.steps, async ({ calls }) => {
        await assertRefuses(() => analyzeGitHubDirectory(fixture.source), responseCase.expected);
        const requestSignal = calls.at(-1)?.signal;
        assert.deepEqual(
          { requestAborted: requestSignal?.aborted, cancelCalls },
          { requestAborted: true, cancelCalls: 1 },
          'bounded-response rejection aborts its request and cancels its body best-effort',
        );
      }, { requireAll: false });
    });
  }

  await t.test('accepts an exact 1 MiB raw body', async () => {
    const bytes = Buffer.alloc(oneMiB, 0x61);
    const fixture = githubProtocolFixture({
      selectedItems: [githubBlobItem('exact.bin', bytes)],
      files: { 'exact.bin': bytes },
    });
    const raw = fixture.steps.find(({ kind }) => kind === 'raw');
    assert.ok(raw);
    raw.reply = () => streamResponse([bytes], {
      headers: { 'content-length': String(bytes.length) },
    });

    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.equal(analysis.entries[0].byte_count, oneMiB);
    });
  });

  await t.test('accepts a lying-large in-bound Content-Length when delivered raw bytes are valid', async () => {
    const bytes = Buffer.from('decoded raw bytes\n');
    const fixture = githubProtocolFixture({
      selectedItems: [githubBlobItem('decoded.txt', bytes)],
      files: { 'decoded.txt': bytes },
    });
    const raw = fixture.steps.find(({ kind }) => kind === 'raw');
    assert.ok(raw);
    raw.reply = () => streamResponse([bytes], {
      headers: { 'content-length': String(bytes.length + 1024) },
    });

    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.equal(analysis.entries[0].byte_count, bytes.length);
      assert.deepEqual(await analysis.getFileBytes('decoded.txt'), bytes);
    });
  });

  await t.test('aborts before best-effort cancellation so a stalled cancel cannot stall rejection', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const bytes = Buffer.alloc(oneMiB, 0x63);
    const fixture = githubProtocolFixture({
      selectedItems: [githubBlobItem('overflow.bin', bytes)],
      files: { 'overflow.bin': bytes },
    });
    const raw = fixture.steps.find(({ kind }) => kind === 'raw');
    assert.ok(raw);
    let markCancelStarted;
    let abortedWhenCancelStarted = false;
    const cancelStarted = new Promise((resolve) => {
      markCancelStarted = resolve;
    });
    raw.reply = ({ init }) => streamResponse([bytes, Buffer.from('x')], {
      onCancel() {
        abortedWhenCancelStarted = init.signal.aborted;
        markCancelStarted();
        return new Promise(() => {});
      },
    });

    try {
      globalThis.setTimeout = ((callback, milliseconds, ...args) => ({
        callback,
        milliseconds,
        args,
      }));
      globalThis.clearTimeout = () => {};

      await withFetchScript(fixture.steps, async ({ calls }) => {
        const operation = analyzeGitHubDirectory(fixture.source).then(
          () => ({ outcome: 'resolved' }),
          (error) => ({ outcome: 'rejected', error }),
        );
        const outcome = await Promise.race([
          operation,
          cancelStarted.then(() => new Promise((resolve) => {
            setImmediate(() => resolve({ outcome: 'cancel-stalled' }));
          })),
        ]);

        assert.equal(abortedWhenCancelStarted, true, 'overflow aborts before cancellation starts');
        assert.equal(outcome.outcome, 'rejected', 'rejection must not await body cancellation');
        assert.match(outcome.error.message, /raw.*(?:response|body|size)|1 MiB|1048576/i);
        const request = calls.find(({ url }) => url.endsWith('/overflow.bin'));
        assert.ok(request);
        assert.equal(request.signal.aborted, true);
      }, { requireAll: false });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  await t.test('accepts exactly 4 MiB of metadata across four 1 MiB responses', async () => {
    const fixture = githubProtocolFixture({
      subtreeSegments: ['selected'],
      selectedItems: [],
      includeRawSteps: false,
    });
    assert.equal(fixture.steps.length, 4);
    for (const step of fixture.steps) {
      step.reply = () => paddedJsonResponse(step.value, oneMiB);
    }

    await withFetchScript(fixture.steps, async () => {
      const analysis = await analyzeGitHubDirectory(fixture.source);
      assert.deepEqual(analysis.entries, []);
    });
  });

  await t.test('rejects metadata aggregate byte 4 MiB plus one', async () => {
    const subtreeSegments = ['a', 'b'];
    const fixture = githubProtocolFixture({
      subtreeSegments,
      selectedItems: [],
      includeRawSteps: false,
    });
    const metadataSteps = fixture.steps.filter(({ kind }) => kind === 'metadata');
    assert.equal(metadataSteps.length, 5);
    for (let index = 0; index < 4; index += 1) {
      const step = metadataSteps[index];
      step.reply = () => paddedJsonResponse(step.value, oneMiB);
    }

    await withFetchScript(fixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(fixture.source),
        /metadata.*(?:aggregate|total)|(?:aggregate|total).*metadata|4 MiB|4194304/i,
      );
      assert.equal(calls.length, 5);
    });
  });

  await t.test('rejects raw aggregate byte 4 MiB plus one even when the final metadata size lies', async () => {
    const oneMiBBytes = Buffer.alloc(oneMiB, 0x62);
    const files = {
      'a.bin': oneMiBBytes,
      'b.bin': oneMiBBytes,
      'c.bin': oneMiBBytes,
      'd.bin': oneMiBBytes,
      'empty.bin': Buffer.alloc(0),
    };
    const items = Object.entries(files).map(([relativePath, bytes]) => githubBlobItem(relativePath, bytes));
    const fixture = githubProtocolFixture({ selectedItems: items, files });
    const emptyRaw = fixture.steps.find(({ url }) => url.endsWith('/empty.bin'));
    assert.ok(emptyRaw);
    emptyRaw.reply = () => rawResponse(Buffer.from('x'), { headers: { 'content-length': '1' } });

    await withFetchScript(fixture.steps, async ({ calls }) => {
      await assertRefuses(
        () => analyzeGitHubDirectory(fixture.source),
        /raw.*(?:aggregate|total)|(?:aggregate|total).*raw|4 MiB|4194304|size|mismatch/i,
      );
      assert.equal(
        calls.filter(({ url }) => url.startsWith('https://raw.githubusercontent.com/')).length,
        5,
      );
    }, { requireAll: false });
  });
});

test('analyzeGitHubDirectory aborts timed-out requests and refuses redirects and HTTP failures', { concurrency: false }, async (t) => {
  await t.test('uses a 30-second timeout signal and rejects on abort', async () => {
    const fixture = githubProtocolFixture({ selectedItems: [], includeRawSteps: false });
    const originalTimeout = AbortSignal.timeout;
    const originalSetTimeout = globalThis.setTimeout;
    const timeoutDurations = [];
    try {
      AbortSignal.timeout = (milliseconds) => {
        timeoutDurations.push(milliseconds);
        return AbortSignal.abort(new DOMException('request timed out', 'TimeoutError'));
      };
      globalThis.setTimeout = ((callback, milliseconds, ...args) => {
        if (milliseconds === EXPECTED_NETWORK_LIMITS.request_timeout_ms) {
          timeoutDurations.push(milliseconds);
          return originalSetTimeout(callback, 0, ...args);
        }
        return originalSetTimeout(callback, milliseconds, ...args);
      });
      await withMockFetch(async (_input, init) => {
        assert.equal(init?.redirect, 'error');
        assert.deepEqual(normalizedHeaders(init?.headers), GITHUB_API_HEADERS);
        assert.ok(init?.signal instanceof AbortSignal);
        if (init.signal.aborted) throw init.signal.reason;
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        });
      }, async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(fixture.source),
          /timeout|timed out|aborted|fetch/i,
        );
        assert.deepEqual(timeoutDurations, [EXPECTED_NETWORK_LIMITS.request_timeout_ms]);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].signal.aborted, true);
      });
    } finally {
      AbortSignal.timeout = originalTimeout;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  await t.test('aborts and cancels a streamed body whose read stalls until timeout', async () => {
    const fixture = githubProtocolFixture({ selectedItems: [], includeRawSteps: false });
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let fireTimeout;
    let pullStarted = false;
    let cancelCalls = 0;
    try {
      globalThis.setTimeout = ((callback, milliseconds, ...args) => {
        assert.equal(milliseconds, EXPECTED_NETWORK_LIMITS.request_timeout_ms);
        fireTimeout = () => callback(...args);
        return { milliseconds };
      });
      globalThis.clearTimeout = () => {};

      await withMockFetch(async (_input, init) => {
        assertGitHubRequestPolicy(init, 'metadata');
        return streamResponse([], {
          onPull() {
            pullStarted = true;
            queueMicrotask(() => fireTimeout());
            return new Promise(() => {});
          },
          onCancel() {
            cancelCalls += 1;
          },
        });
      }, async ({ calls }) => {
        await assertRefuses(
          () => analyzeGitHubDirectory(fixture.source),
          /timeout|timed out|aborted|fetch/i,
        );
        assert.equal(pullStarted, true, 'the response read reached the stalled stream');
        assert.equal(calls.length, 1);
        assert.deepEqual(
          { requestAborted: calls[0].signal.aborted, cancelCalls },
          { requestAborted: true, cancelCalls: 1 },
          'timeout aborts the request and ends the stalled body lifecycle',
        );
      });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  const failureCases = [
    {
      name: 'fetch redirect refusal',
      reply(_input, init) {
        assert.equal(init.redirect, 'error');
        throw new TypeError('fetch failed: redirect mode is error');
      },
      expected: /redirect|fetch/i,
    },
    {
      name: 'redirect status response',
      reply() {
        return responseWithUrl(null, {
          status: 302,
          headers: { location: MALICIOUS_RESPONSE_URL },
        });
      },
      expected: /302|redirect|HTTP|fetch/i,
    },
    {
      name: 'ordinary HTTP failure',
      disposeBody: true,
      reply(_input, _init, onCancel) {
        return streamResponse([Buffer.from('{"message":"server error"}')], {
          status: 500,
          headers: { 'content-type': 'application/json' },
          onCancel,
        });
      },
      expected: /500|HTTP|fetch/i,
    },
    {
      name: 'GitHub primary rate limit',
      disposeBody: true,
      reply(_input, _init, onCancel) {
        return streamResponse([Buffer.from('{"message":"API rate limit exceeded"}')], {
          status: 403,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '9999999999',
          },
          onCancel,
        });
      },
      expected: /rate limit|403|HTTP|fetch/i,
    },
    {
      name: 'GitHub too-many-requests response',
      reply() {
        return jsonResponse({ message: 'secondary rate limit' }, {
          status: 429,
          headers: { 'retry-after': '60' },
        });
      },
      expected: /rate limit|429|HTTP|fetch/i,
    },
  ];

  for (const failureCase of failureCases) {
    await t.test(failureCase.name, async () => {
      const fixture = githubProtocolFixture({ selectedItems: [], includeRawSteps: false });
      let fetchCount = 0;
      let cancelCalls = 0;
      await withMockFetch(async (input, init) => {
        fetchCount += 1;
        assert.equal(String(input), githubCommitUrl());
        assertGitHubRequestPolicy(init, 'metadata');
        return failureCase.reply(input, init, () => {
          cancelCalls += 1;
        });
      }, async ({ calls }) => {
        await assertRefuses(() => analyzeGitHubDirectory(fixture.source), failureCase.expected);
        assert.equal(fetchCount, 1, 'transport failures are not retried');
        assert.equal(calls.length, 1);
        assert.equal(calls.some(({ url }) => url === MALICIOUS_RESPONSE_URL), false);
        if (failureCase.disposeBody) {
          assert.deepEqual(
            { requestAborted: calls[0].signal.aborted, cancelCalls },
            { requestAborted: true, cancelCalls: 1 },
            'HTTP rejection aborts its request and cancels its body best-effort',
          );
        }
      });
    });
  }
});

test('analyzeGitHubDirectory refuses an initial acquisition when the requested ref moves', { concurrency: false }, async () => {
  const fixture = githubProtocolFixture({ finalCommitSha: GITHUB_MOVED_COMMIT });

  await withFetchScript(fixture.steps, async ({ calls }) => {
    await assertRefuses(
      () => analyzeGitHubDirectory(fixture.source),
      /ref|commit|revision|move|drift|changed/i,
    );
    assert.equal(calls.at(-1)?.url, githubCommitUrl(), 'the final requested-ref call occurs');
    assert.equal(
      calls.filter(({ url }) => url === githubCommitUrl()).length,
      2,
      'the requested ref is resolved before and after content acquisition',
    );
  });
});

test('GitHub revalidation detects ref, tree, and content drift and preserves cached bytes', { concurrency: false }, async (t) => {
  const initial = githubProtocolFixture();

  const driftCases = [
    {
      name: 'requested ref changed before revalidation',
      revalidation() {
        const fixture = githubProtocolFixture({ commitSha: GITHUB_MOVED_COMMIT });
        return { steps: [fixture.steps[0]], expected: /ref|commit|revision|move|drift|changed/i };
      },
    },
    {
      name: 'commit root tree changed under the same commit identity',
      revalidation() {
        const fixture = githubProtocolFixture({ rootTreeSha: '8'.repeat(40) });
        return { steps: [fixture.steps[0]], expected: /tree|source|identity|drift|changed/i };
      },
    },
    {
      name: 'subtree walk changed',
      revalidation() {
        const fixture = githubProtocolFixture({
          childTreeShas: ['7'.repeat(40), GITHUB_SELECTED_TREE],
        });
        return { steps: fixture.steps, expected: /tree|subtree|source|identity|drift|changed/i };
      },
    },
    {
      name: 'recursive tree membership changed',
      revalidation() {
        const changedItems = [
          githubBlobItem('README.md', GITHUB_PARITY_FILES['README.md']),
          githubTreeItem('nested'),
          githubBlobItem('nested/data.bin', GITHUB_PARITY_FILES['nested/data.bin']),
          githubBlobItem('run.sh', GITHUB_PARITY_FILES['run.sh'], '100755'),
          githubTreeItem('new-directory'),
        ];
        const fixture = githubProtocolFixture({ selectedItems: changedItems });
        return { steps: fixture.steps, expected: /tree|entr(?:y|ies)|membership|manifest|drift|changed/i };
      },
    },
    {
      name: 'raw content changed under stable metadata',
      revalidation() {
        const fixture = githubProtocolFixture();
        const raw = fixture.steps.find(({ url }) => url.endsWith('/README.md'));
        assert.ok(raw);
        raw.reply = () => rawResponse(Buffer.from('HELLO FROM GITHUB\n'));
        return { steps: fixture.steps, expected: /Git|blob|SHA|hash|content|integrity|drift|changed/i };
      },
    },
    {
      name: 'requested ref moves during revalidation',
      revalidation() {
        const fixture = githubProtocolFixture({ finalCommitSha: GITHUB_MOVED_COMMIT });
        return { steps: fixture.steps, expected: /ref|commit|revision|move|drift|changed/i };
      },
    },
  ];

  for (const driftCase of driftCases) {
    await t.test(driftCase.name, async () => {
      const revalidation = driftCase.revalidation();
      await withFetchScript(
        [...initial.steps, ...revalidation.steps],
        async () => {
          const analysis = await analyzeGitHubDirectory(initial.source);
          const originalCachedBytes = await analysis.getFileBytes('README.md');

          await assertRefuses(() => analysis.revalidate(), revalidation.expected);

          assert.deepEqual(await analysis.getFileBytes('README.md'), originalCachedBytes);
          originalCachedBytes.fill(0);
          assert.deepEqual(
            await analysis.getFileBytes('README.md'),
            GITHUB_PARITY_FILES['README.md'],
            'failed revalidation neither replaces nor exposes the original cache',
          );
        },
        { requireAll: false },
      );
    });
  }

  await t.test('unchanged revalidation passes with a fresh full protocol walk', async () => {
    const unchanged = githubProtocolFixture();
    await withFetchScript([...initial.steps, ...unchanged.steps], async ({ calls, maximumConcurrency }) => {
      const analysis = await analyzeGitHubDirectory(initial.source);
      const callerCopy = await analysis.getFileBytes('README.md');
      callerCopy.fill(0);

      await assert.doesNotReject(() => analysis.revalidate());

      assert.deepEqual(await analysis.getFileBytes('README.md'), GITHUB_PARITY_FILES['README.md']);
      assert.equal(calls.length, initial.steps.length + unchanged.steps.length);
      assert.equal(
        calls.filter(({ url }) => url === githubCommitUrl()).length,
        4,
        'analysis and revalidation each perform opening and final ref resolution',
      );
      assert.equal(maximumConcurrency(), 1);
    });
  });
});
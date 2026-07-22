// @ts-check
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeDirectoryArtifacts } from './directory-import.mjs';
import { createCanonicalEntryManifest } from './directory-source.mjs';

const COORDINATOR_PARAGRAPH =
  '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state ' +
  'glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, ' +
  '`<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report ' +
  'changes back to `@dude` instead.';

const RESULT_FIELDS = [
  'groups',
  'outputs',
  'blocking_diagnostics',
  'destination_facts',
  'getOutputBytes',
];
const GROUP_FIELDS = ['kind', 'entrypoint'];
const OUTPUT_FIELDS = [
  'source_path',
  'destination_path',
  'output_sha256',
  'transform_ids',
  'destination_state',
];
const DIAGNOSTIC_FIELDS = ['code', 'path', 'related_paths', 'message', 'guidance'];
const CLEAN_SOURCE_GUIDANCE =
  /single-file import\/adaptation|clean (?:directory )?source/i;
const ACTIONABLE_GUIDANCE =
  /\b(?:adapt|add|analyze|choose|clean|correct|fix|import|move|narrower|prepare|remove|rename|replace|resolve|restore|select|separate|use)\b/i;
const BOUNDARY_GUIDANCE =
  'Use focused single-file import/adaptation or prepare a clean source with exactly the canonical coordinator-only artifacts paragraph.';

/** @param {Buffer|string} bytes */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} left @param {string} right */
function compareRaw(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}


/** @param {readonly string[]} left @param {readonly string[]} right */
function compareRawArrays(left, right) {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const itemOrder = compareRaw(left[index], right[index]);
    if (itemOrder !== 0) return itemOrder;
  }
  return left.length - right.length;
}

/** @param {any} left @param {any} right */
function compareDiagnostics(left, right) {
  const codeOrder = compareRaw(left.code, right.code);
  if (codeOrder !== 0) return codeOrder;
  if (left.path === null && right.path !== null) return 1;
  if (left.path !== null && right.path === null) return -1;
  const pathOrder = compareRaw(left.path ?? '', right.path ?? '');
  if (pathOrder !== 0) return pathOrder;
  const relatedOrder = compareRawArrays(left.related_paths, right.related_paths);
  if (relatedOrder !== 0) return relatedOrder;
  return compareRaw(left.message, right.message);
}
/** @param {Buffer} bytes */
function classify(bytes) {
  return isUtf8(bytes) && !bytes.includes(0) ? 'text' : 'opaque';
}

/**
 * Build a provider-realistic T001/T002 result without exercising provider I/O.
 * Parent directories are included because both providers expose them.
 *
 * @param {Record<string, Buffer|string>} files
 * @param {{
 *   directories?: string[],
 *   sharedReadBuffers?: boolean,
 *   revalidateError?: Error|null,
 * }} [options]
 */
function sourceFixture(files, options = {}) {
  const bytesByPath = new Map();
  const directories = new Set(options.directories ?? []);
  for (const [relativePath, value] of Object.entries(files)) {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value);
    bytesByPath.set(relativePath, bytes);
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  for (const relativePath of [...directories]) {
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }

  const rawEntries = [
    ...[...directories].map((relativePath) => ({
      path: relativePath,
      entry_type: 'directory',
      byte_count: 0,
      sha256: null,
      content_class: 'none',
    })),
    ...[...bytesByPath].map(([relativePath, bytes]) => ({
      path: relativePath,
      entry_type: 'regular-file',
      byte_count: bytes.length,
      sha256: sha256(bytes),
      content_class: classify(bytes),
    })),
  ];
  const manifest = createCanonicalEntryManifest(rawEntries);
  const state = {
    events: /** @type {string[]} */ ([]),
    revalidateCalls: 0,
  };
  const sourceAnalysis = {
    source: {
      provider: /** @type {const} */ ('local-directory'),
      input: '/fixture/source',
      identity: { root_path: '/fixture/source' },
    },
    entries: manifest.entries.map((entry) => ({ ...entry })),
    manifest_sha256: manifest.manifest_sha256,
    async getFileBytes(relativePath) {
      state.events.push(`read:${relativePath}`);
      const bytes = bytesByPath.get(relativePath);
      if (bytes === undefined) throw new Error(`unknown fixture file: ${relativePath}`);
      return options.sharedReadBuffers ? bytes : Buffer.from(bytes);
    },
    async revalidate() {
      state.events.push('revalidate');
      state.revalidateCalls += 1;
      if (options.revalidateError) throw options.revalidateError;
    },
  };
  return { sourceAnalysis, state, bytesByPath };
}

/** @param {ReturnType<typeof sourceFixture>} fixture @param {string} relativePath @param {Record<string, unknown>} patch */
function replaceCanonicalEntry(fixture, relativePath, patch) {
  fixture.sourceAnalysis.entries = fixture.sourceAnalysis.entries.map((entry) => (
    entry.path === relativePath ? { ...entry, ...patch } : entry
  ));
  fixture.sourceAnalysis.manifest_sha256 = createCanonicalEntryManifest(
    fixture.sourceAnalysis.entries,
  ).manifest_sha256;
}

/**
 * @param {{
 *   name?: string,
 *   nameLine?: string,
 *   descriptionLine?: string,
 *   extra?: string[],
 *   body?: string,
 *   separator?: string,
 * }} [options]
 */
function skillDocument(options = {}) {
  const separator = options.separator ?? '\n';
  const name = options.name ?? 'sample';
  return [
    '---',
    '# preserve this metadata comment',
    options.nameLine ?? `name: ${name}`,
    options.descriptionLine ?? 'description: "A fixture skill"',
    ...(options.extra ?? []),
    '---',
    options.body ?? 'Use the fixture skill.',
    '',
  ].join(separator);
}

/**
 * @param {{
 *   name?: string,
 *   descriptionLine?: string,
 *   extra?: string[],
 *   body?: string,
 *   separator?: string,
 }} [options]
 */
function agentDocument(options = {}) {
  const separator = options.separator ?? '\n';
  return [
    '---',
    `name: "${options.name ?? 'Fixture Reviewer'}"`,
    options.descriptionLine ?? 'description: "Reviews fixture artifacts"',
    ...(options.extra ?? []),
    '---',
    options.body ?? COORDINATOR_PARAGRAPH,
    '',
  ].join(separator);
}

/** @param {(root: string) => Promise<void>} run */
async function withWorkspace(run) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const workspaceRoot = fs.mkdtempSync(path.join(temporaryRoot, 'dude-directory-import-'));
  try {
    await run(workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

/** @param {string} root @param {string} relativePath @param {Buffer|string} bytes */
function writeWorkspaceFile(root, relativePath, bytes) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
  return absolutePath;
}

/** @param {any} result */
function assertResultContract(result) {
  assert.deepEqual(Object.keys(result), RESULT_FIELDS);
  assert.ok(Array.isArray(result.groups));
  assert.ok(Array.isArray(result.outputs));
  assert.ok(Array.isArray(result.blocking_diagnostics));
  assert.ok(Array.isArray(result.destination_facts));
  assert.equal(typeof result.getOutputBytes, 'function');
  for (const group of result.groups) assert.deepEqual(Object.keys(group), GROUP_FIELDS);
  for (const output of result.outputs) {
    assert.deepEqual(Object.keys(output), OUTPUT_FIELDS);
    assert.match(output.output_sha256, /^[0-9a-f]{64}$/);
    assert.ok(
      output.destination_state.type === 'missing'
      || output.destination_state.type === 'regular-file',
    );
  }
}

/** @param {any} result @param {string} sourcePath */
function outputForSource(result, sourcePath) {
  const matches = result.outputs.filter((output) => output.source_path === sourcePath);
  assert.equal(matches.length, 1, `expected one public output for ${sourcePath}`);
  return matches[0];
}

/** @param {any} result @param {string} sourcePath */
function assertNoOutputForSource(result, sourcePath) {
  assert.equal(
    result.outputs.some((output) => output.source_path === sourcePath),
    false,
    `${sourcePath} must not be exposed as a legal output`,
  );
}

/** @param {any} result @param {string} code @param {string|null|undefined} [diagnosticPath] */
function diagnostic(result, code, diagnosticPath = undefined) {
  const matches = result.blocking_diagnostics.filter((item) => (
    item.code === code && (diagnosticPath === undefined || item.path === diagnosticPath)
  ));
  assert.equal(
    matches.length,
    1,
    `expected one ${code} diagnostic${diagnosticPath === undefined ? '' : ` for ${diagnosticPath}`}`,
  );
  const record = matches[0];
  assert.deepEqual(Object.keys(record), DIAGNOSTIC_FIELDS);
  assert.ok(record.path === null || typeof record.path === 'string');
  assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
  assert.equal(new Set(record.related_paths).size, record.related_paths.length);
  assert.equal(record.related_paths.includes(record.path), false);
  assert.equal(typeof record.message, 'string');
  assert.notEqual(record.message, '');
  assert.equal(typeof record.guidance, 'string');
  assert.notEqual(record.guidance, '');
  assert.match(record.guidance, ACTIONABLE_GUIDANCE);
  return record;
}

/** @param {any} result @param {string} code */
function assertNoDiagnostic(result, code) {
  assert.equal(
    result.blocking_diagnostics.some((item) => item.code === code),
    false,
    `did not expect ${code}`,
  );
}

/** @param {any} result @param {string} sourcePath @param {string} destinationPath */
function destinationFact(result, sourcePath, destinationPath) {
  const matches = result.destination_facts.filter((fact) => (
    fact.source_path === sourcePath && fact.destination_path === destinationPath
  ));
  assert.equal(
    matches.length,
    1,
    `expected one retained destination fact for ${sourcePath} -> ${destinationPath}`,
  );
  return matches[0];
}

/** @param {string} root */
function snapshotWorkspace(root) {
  const records = [];
  /** @param {string} absoluteDirectory @param {string} prefix */
  function visit(absoluteDirectory, prefix) {
    const names = fs.readdirSync(absoluteDirectory).sort(compareRaw);
    for (const name of names) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const absolutePath = path.join(absoluteDirectory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        records.push({ path: relativePath, type: 'symbolic-link', target: fs.readlinkSync(absolutePath) });
      } else if (stat.isDirectory()) {
        records.push({ path: relativePath, type: 'directory' });
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        records.push({ path: relativePath, type: 'regular-file', sha256: sha256(fs.readFileSync(absolutePath)) });
      } else {
        records.push({ path: relativePath, type: 'non-regular' });
      }
    }
  }
  visit(root, '');
  return records;
}

test('analyzeDirectoryArtifacts validates source-analysis integrity and returns defensive exact output bytes', async (t) => {
  await t.test('pins the two-argument API and complete return shape', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = skillDocument({
        nameLine: 'name:   sample   ',
        separator: '\r\n',
      });
      const fixture = sourceFixture(
        { 'artifact/SKILL.md': source },
        { sharedReadBuffers: true },
      );

      assert.deepEqual(fixture.sourceAnalysis.source, {
        provider: 'local-directory',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source' },
      });
      assert.equal(analyzeDirectoryArtifacts.length, 2);
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertResultContract(result);
      assert.deepEqual(result.groups, [{ kind: 'skill', entrypoint: 'artifact/SKILL.md' }]);
      const output = outputForSource(result, 'artifact/SKILL.md');
      assert.deepEqual(output, {
        source_path: 'artifact/SKILL.md',
        destination_path: '.github/skills/dude-local-sample/SKILL.md',
        output_sha256: sha256(source.replace('sample', 'dude-local-sample')),
        transform_ids: ['rewrite-skill-name'],
        destination_state: { type: 'missing' },
      });
      assert.equal(fixture.state.revalidateCalls, 1);
      assert.equal(fixture.state.events.at(-1), 'revalidate', 'revalidation follows all source reads');

      const expectedOutput = Buffer.from(source.replace('sample', 'dude-local-sample'));
      const first = await result.getOutputBytes(output.destination_path);
      const second = await result.getOutputBytes(output.destination_path);
      assert.ok(Buffer.isBuffer(first));
      assert.ok(Buffer.isBuffer(second));
      assert.notStrictEqual(first, second);
      first.fill(0);
      assert.deepEqual(second, expectedOutput);

      fixture.bytesByPath.get('artifact/SKILL.md')?.fill(0);
      assert.deepEqual(
        await result.getOutputBytes(output.destination_path),
        expectedOutput,
        'output bytes do not alias a provider-owned read buffer',
      );
      await assert.rejects(
        result.getOutputBytes('.github/skills/dude-local-sample/missing.txt'),
        /unknown|missing|output/i,
      );
    });
  });

  await t.test('accepts the exact GitHub provenance shape without provider I/O', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      /** @type {any} */ (fixture.sourceAnalysis).source = {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: {
          owner: 'example',
          repository: 'project',
          requested_ref: 'main',
          resolved_commit: 'a'.repeat(40),
          subtree: 'artifact',
          tree_sha: 'b'.repeat(40),
        },
      };

      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.equal(outputForSource(result, 'artifact/SKILL.md').destination_path,
        '.github/skills/dude-local-sample/SKILL.md');
    });
  });

  const githubIdentity = {
    owner: 'example',
    repository: 'project',
    requested_ref: 'main',
    resolved_commit: 'a'.repeat(40),
    subtree: 'artifact',
    tree_sha: 'b'.repeat(40),
  };
  const provenanceCases = [
    {
      name: 'unknown provider',
      source: {
        provider: 'archive',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source' },
      },
    },
    {
      name: 'local identity missing root_path',
      source: { provider: 'local-directory', input: '/fixture/source', identity: {} },
    },
    {
      name: 'local identity has an extra field',
      source: {
        provider: 'local-directory',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source', owner: 'example' },
      },
    },
    {
      name: 'GitHub identity missing tree_sha',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: (({ tree_sha, ...identity }) => identity)(githubIdentity),
      },
    },
    {
      name: 'GitHub identity has an extra field',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: { ...githubIdentity, root_path: '/fixture/source' },
      },
    },
  ];

  for (const fixtureCase of provenanceCases) {
    await t.test(`rejects ${fixtureCase.name}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
        /** @type {any} */ (fixture.sourceAnalysis).source = fixtureCase.source;

        await assert.rejects(
          analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
          /source|provider|provenance|identity|shape|field|integrity/i,
        );
      });
    });
  }

  const integrityCases = [
    {
      name: 'canonical manifest mismatch',
      mutate(fixture) {
        fixture.sourceAnalysis.manifest_sha256 = '0'.repeat(64);
      },
      expected: /manifest|canonical|integrity/i,
    },
    {
      name: 'byte length mismatch',
      mutate(fixture) {
        const entry = fixture.sourceAnalysis.entries.find(({ path: entryPath }) => entryPath === 'artifact/SKILL.md');
        assert.ok(entry);
        replaceCanonicalEntry(fixture, entry.path, { byte_count: entry.byte_count + 1 });
      },
      expected: /byte|length|size|integrity/i,
    },
    {
      name: 'byte hash mismatch',
      mutate(fixture) {
        replaceCanonicalEntry(fixture, 'artifact/SKILL.md', { sha256: 'f'.repeat(64) });
      },
      expected: /hash|sha-?256|integrity/i,
    },
    {
      name: 'text classification mismatch',
      mutate(fixture) {
        replaceCanonicalEntry(fixture, 'artifact/SKILL.md', { content_class: 'opaque' });
      },
      expected: /class|text|opaque|integrity/i,
    },
  ];

  for (const fixtureCase of integrityCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
        fixtureCase.mutate(fixture);

        await assert.rejects(
          analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
          fixtureCase.expected,
        );
      });
    });
  }

  await t.test('propagates source revalidation failure instead of returning stale facts', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture(
        { 'artifact/SKILL.md': skillDocument() },
        { revalidateError: new Error('fixture source changed') },
      );

      await assert.rejects(
        analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
        /source changed/i,
      );
      assert.equal(fixture.state.revalidateCalls, 1);
    });
  });
});

test('strict entrypoints require exact filenames, scalar identity fields, and no adaptation keys', async (t) => {
  const nonEntrypoints = [
    'artifact/skill.md',
    'artifact/SKILL.MD',
    'artifact/reviewer.agent.mdx',
    'artifact/reviewer.AGENT.md',
  ];
  for (const relativePath of nonEntrypoints) {
    await t.test(`does not broaden entrypoint matching for ${relativePath}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ [relativePath]: skillDocument() });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(result.groups, []);
        assert.deepEqual(result.outputs, []);
        diagnostic(result, 'ownership-unowned', relativePath);
      });
    });
  }

  const rejectedEntrypoints = [
    {
      name: 'missing frontmatter',
      bytes: '# Body only\n',
      code: 'entrypoint-frontmatter-invalid',
    },
    {
      name: 'malformed frontmatter',
      bytes: '--- \nname: sample\ndescription: malformed\n---\n',
      code: 'entrypoint-frontmatter-invalid',
    },
    {
      name: 'missing name',
      bytes: '---\ndescription: present\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'sequence name',
      bytes: '---\nname: [sample]\ndescription: present\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'missing description',
      bytes: '---\nname: sample\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'invalid skill name',
      bytes: skillDocument({ name: 'Not-Canonical' }),
      code: 'skill-name-invalid',
    },
    {
      name: 'opaque entrypoint',
      bytes: Buffer.from([0xff, 0x00, 0x2d, 0x2d, 0x2d]),
      code: 'entrypoint-frontmatter-invalid',
    },
  ];
  for (const fixtureCase of rejectedEntrypoints) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': fixtureCase.bytes });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(result.groups, []);
        assertNoOutputForSource(result, 'artifact/SKILL.md');
        const record = diagnostic(result, fixtureCase.code, 'artifact/SKILL.md');
        assert.deepEqual(record.related_paths, []);
        assert.match(record.guidance, CLEAN_SOURCE_GUIDANCE);
      });
    });
  }

  const adaptationEntries = [
    ['compatibility', 'compatibility: ">=1"'],
    ['model', 'model: gpt-4'],
    ['tools', 'tools: [Read]'],
    ['license', 'license: MIT'],
  ];
  for (const [key, entry] of adaptationEntries) {
    await t.test(`blocks exact adaptation key ${key}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ extra: [entry] }),
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        const record = diagnostic(result, 'entrypoint-adaptation-required', 'artifact/SKILL.md');
        assert.deepEqual(record.related_paths, []);
        assert.match(record.guidance, CLEAN_SOURCE_GUIDANCE);
        assertNoOutputForSource(result, 'artifact/SKILL.md');
      });
    });
  }

  await t.test('does not invent a frontmatter allowlist', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ extra: ['owner: platform-team'] }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      assert.equal(outputForSource(result, 'artifact/SKILL.md').transform_ids[0], 'rewrite-skill-name');
    });
  });
});

test('skill rewriting replaces only the scalar token and agent identity remains filename-driven', async (t) => {
  const scalarCases = [
    {
      name: 'plain LF',
      separator: '\n',
      sourceLine: 'name:   sample   ',
      expectedLine: 'name:   dude-local-sample   ',
    },
    {
      name: 'single-quoted CRLF',
      separator: '\r\n',
      sourceLine: "name:   'sample'   ",
      expectedLine: "name:   'dude-local-sample'   ",
    },
    {
      name: 'double-quoted LF',
      separator: '\n',
      sourceLine: 'name:   "sample"   ',
      expectedLine: 'name:   "dude-local-sample"   ',
    },
  ];
  for (const fixtureCase of scalarCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const source = skillDocument({
          nameLine: fixtureCase.sourceLine,
          separator: fixtureCase.separator,
          body: 'Body bytes and `name: sample` text stay untouched.',
        });
        const expected = source.replace(fixtureCase.sourceLine, fixtureCase.expectedLine);
        const fixture = sourceFixture({
          'artifact/SKILL.md': source,
          'artifact/support.txt': 'support bytes\r\n',
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        const entrypoint = outputForSource(result, 'artifact/SKILL.md');
        const support = outputForSource(result, 'artifact/support.txt');
        assert.deepEqual(entrypoint.transform_ids, ['rewrite-skill-name']);
        assert.deepEqual(support.transform_ids, []);
        assert.deepEqual(await result.getOutputBytes(entrypoint.destination_path), Buffer.from(expected));
        assert.deepEqual(
          await result.getOutputBytes(support.destination_path),
          Buffer.from('support bytes\r\n'),
        );
        assert.equal(expected.split(fixtureCase.separator).length, source.split(fixtureCase.separator).length);
      });
    });
  }

  await t.test('agent display name is byte-preserved while its filename drives the flat destination', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({ name: 'Display Name Has No Path Authority' });
      const fixture = sourceFixture({ 'agents/review.agent.md': source });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const output = outputForSource(result, 'agents/review.agent.md');

      assert.equal(output.destination_path, '.github/agents/dude-local-review.agent.md');
      assert.deepEqual(output.transform_ids, []);
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });
});

test('agent coordinator paragraph is accepted only as one exact standalone unfenced body line', async (t) => {
  await t.test('accepts the canonical paragraph unchanged', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({ body: `Purpose paragraph.\n\n${COORDINATOR_PARAGRAPH}\n\n## Scope` });
      const fixture = sourceFixture({ 'agents/review.agent.md': source });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      const output = outputForSource(result, 'agents/review.agent.md');
      assert.deepEqual(output.transform_ids, []);
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });

  /** @type {{name: string, code: string, body: string, message: string, descriptionLine?: string}[]} */
  const boundaryCases = [
    {
      name: 'missing',
      code: 'agent-boundary-missing',
      body: 'No coordinator boundary is present.',
      message: 'Agent entrypoint is missing the canonical coordinator-only artifacts paragraph.',
    },
    {
      name: 'malformed',
      code: 'agent-boundary-malformed',
      body: '**Coordinator-only artifacts:** do not edit coordinator state.\nThe required sentence is incomplete.',
      message: 'Agent entrypoint has a malformed coordinator-only artifacts paragraph.',
    },
    {
      name: 'duplicated by a fenced spoof heading',
      code: 'agent-boundary-duplicated',
      body: `${COORDINATOR_PARAGRAPH}\n\n\`\`\`text\n**Coordinator-only artifacts:** spoofed example\n\`\`\``,
      message: 'Agent entrypoint contains more than one coordinator-only artifacts heading occurrence.',
    },
    {
      name: 'duplicated by a frontmatter heading',
      code: 'agent-boundary-duplicated',
      descriptionLine: 'description: "**Coordinator-only artifacts:** frontmatter occurrence"',
      body: COORDINATOR_PARAGRAPH,
      message: 'Agent entrypoint contains more than one coordinator-only artifacts heading occurrence.',
    },
    {
      name: 'quoted full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `> ${COORDINATOR_PARAGRAPH}`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'prose-wrapped full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `Prefix ${COORDINATOR_PARAGRAPH} suffix`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'fenced full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `~~~text\n${COORDINATOR_PARAGRAPH}\n~~~`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'unbounded full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `Previous body line.\n${COORDINATOR_PARAGRAPH}\nFollowing body line.`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
  ];

  for (const fixtureCase of boundaryCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'agents/review.agent.md': agentDocument({
            body: fixtureCase.body,
            descriptionLine: fixtureCase.descriptionLine,
          }),
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assertNoOutputForSource(result, 'agents/review.agent.md');
        assert.deepEqual(
          diagnostic(result, fixtureCase.code, 'agents/review.agent.md'),
          {
            code: fixtureCase.code,
            path: 'agents/review.agent.md',
            related_paths: [],
            message: fixtureCase.message,
            guidance: BOUNDARY_GUIDANCE,
          },
        );
      });
    });
  }
});

test('nearest valid roots own descendants, invalid candidates are barriers, and root notices alone are shared', async (t) => {
  await t.test('chooses the nearest nested root rather than the first root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'outer/SKILL.md': skillDocument({ name: 'outer' }),
        'outer/outer.txt': 'outer owner\n',
        'outer/nested/SKILL.md': skillDocument({ name: 'inner' }),
        'outer/nested/owned.txt': 'nearest owner\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.groups, [
        { kind: 'skill', entrypoint: 'outer/SKILL.md' },
        { kind: 'skill', entrypoint: 'outer/nested/SKILL.md' },
      ]);
      assert.equal(
        outputForSource(result, 'outer/outer.txt').destination_path,
        '.github/skills/dude-local-outer/outer.txt',
      );
      assert.equal(
        outputForSource(result, 'outer/nested/owned.txt').destination_path,
        '.github/skills/dude-local-inner/owned.txt',
      );
      assert.equal(
        result.outputs.some(({ destination_path: destinationPath }) => (
          destinationPath === '.github/skills/dude-local-outer/nested/owned.txt'
        )),
        false,
        'a first-root implementation would incorrectly claim the nested file',
      );
    });
  });

  await t.test('does not fall through an invalid nearest candidate to an outer root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'outer/SKILL.md': skillDocument({ name: 'outer' }),
        'outer/bad/SKILL.md': '---\nname: bad\n---\nMissing description\n',
        'outer/bad/private.txt': 'must not belong to outer\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.groups, [{ kind: 'skill', entrypoint: 'outer/SKILL.md' }]);
      diagnostic(result, 'entrypoint-required-field-invalid', 'outer/bad/SKILL.md');
      const privateRecord = diagnostic(result, 'ownership-unowned', 'outer/bad/private.txt');
      assert.match(privateRecord.guidance, /narrower.*root|root.*narrower/i);
      assertNoOutputForSource(result, 'outer/bad/SKILL.md');
      assertNoOutputForSource(result, 'outer/bad/private.txt');
      assert.equal(
        result.destination_facts.some(({ source_path: sourcePath }) => sourcePath === 'outer/bad/private.txt'),
        false,
        'an invalid root is an ownership barrier, not a transparent directory',
      );
    });
  });

  await t.test('blocks multiple same-directory roots as ambiguous', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'bundle/SKILL.md': skillDocument({ name: 'bundle-skill' }),
        'bundle/review.agent.md': agentDocument(),
        'bundle/support.txt': 'equally near\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'entrypoint-root-ambiguous');

      assert.deepEqual(record.related_paths, [
        'bundle/SKILL.md',
        'bundle/review.agent.md',
      ]);
      assertNoOutputForSource(result, 'bundle/support.txt');
    });
  });

  await t.test('blocks an ordinary unowned root file with narrower-root guidance', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'README.md': 'unowned\n',
        'skill/SKILL.md': skillDocument({ name: 'owned' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'ownership-unowned', 'README.md');

      assert.match(record.guidance, /narrower.*root|root.*narrower/i);
      assertNoOutputForSource(result, 'README.md');
    });
  });

  await t.test('shares selected-root LICENSE and NOTICE variants but treats nested notices normally', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'LICENSE': 'shared license\n',
        'NOTICE.txt': 'shared notice\n',
        'one/SKILL.md': skillDocument({ name: 'one-skill' }),
        'one/NOTICE': 'one only\n',
        'two/SKILL.md': skillDocument({ name: 'two-skill' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'LICENSE')
          .map(({ destination_path: destinationPath }) => destinationPath),
        [
          '.github/skills/dude-local-one-skill/LICENSE',
          '.github/skills/dude-local-two-skill/LICENSE',
        ],
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'NOTICE.txt')
          .map(({ destination_path: destinationPath }) => destinationPath),
        [
          '.github/skills/dude-local-one-skill/NOTICE.txt',
          '.github/skills/dude-local-two-skill/NOTICE.txt',
        ],
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'one/NOTICE')
          .map(({ destination_path: destinationPath }) => destinationPath),
        ['.github/skills/dude-local-one-skill/NOTICE'],
      );
    });
  });
});

test('fixed mappings preserve skill trees, flatten agents into entrypoint plus support, and omit collisions', async (t) => {
  await t.test('maps complete owned trees with empty transforms outside the skill entrypoint', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const agent = agentDocument({ name: 'Filename Still Wins' });
      const fixture = sourceFixture({
        'skills/check/SKILL.md': skillDocument({ name: 'tree-check' }),
        'skills/check/scripts/run.mjs': 'export default true;\n',
        'agents/review.agent.md': agent,
        'agents/examples/sample.txt': 'sample\n',
        'agents/scripts/check.mjs': 'export default true;\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinations = Object.fromEntries(result.outputs.map((output) => [output.source_path, output.destination_path]));

      assert.deepEqual(destinations, {
        'agents/review.agent.md': '.github/agents/dude-local-review.agent.md',
        'agents/examples/sample.txt': '.github/agents/dude-local-review.support/examples/sample.txt',
        'agents/scripts/check.mjs': '.github/agents/dude-local-review.support/scripts/check.mjs',
        'skills/check/SKILL.md': '.github/skills/dude-local-tree-check/SKILL.md',
        'skills/check/scripts/run.mjs': '.github/skills/dude-local-tree-check/scripts/run.mjs',
      });
      assert.deepEqual(
        result.outputs.map(({ destination_path: destinationPath }) => destinationPath),
        result.outputs.map(({ destination_path: destinationPath }) => destinationPath).sort(compareRaw),
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => !sourcePath.endsWith('/SKILL.md'))
          .map(({ transform_ids: transformIds }) => transformIds),
        [[], [], [], []],
      );
      assert.deepEqual(
        await result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
        Buffer.from(agent),
      );
    });
  });

  await t.test('retains exact-collision candidate facts while exposing neither candidate as an output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'same-skill', body: 'first divergent body' }),
        'two/SKILL.md': skillDocument({ name: 'dude-pack-same-skill', body: 'second divergent body' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinationPath = '.github/skills/dude-local-same-skill/SKILL.md';
      const record = diagnostic(result, 'output-collision');

      assert.deepEqual(record.related_paths, ['one/SKILL.md', 'two/SKILL.md']);
      assertNoOutputForSource(result, 'one/SKILL.md');
      assertNoOutputForSource(result, 'two/SKILL.md');
      destinationFact(result, 'one/SKILL.md', destinationPath);
      destinationFact(result, 'two/SKILL.md', destinationPath);
      assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === 'one/SKILL.md'));
      assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === 'two/SKILL.md'));
      await assert.rejects(
        result.getOutputBytes(destinationPath),
        /ambiguous|collision|illegal|unknown|missing/i,
      );
    });
  });

  await t.test('retains case-collision candidate facts while exposing neither candidate as an output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/Review.agent.md': agentDocument(),
        'two/review.agent.md': agentDocument(),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'output-case-collision');

      assert.equal(record.path, null);
      assert.deepEqual(record.related_paths, [
        '.github/agents/dude-local-Review.agent.md',
        '.github/agents/dude-local-review.agent.md',
      ]);
      assertNoOutputForSource(result, 'one/Review.agent.md');
      assertNoOutputForSource(result, 'two/review.agent.md');
      destinationFact(
        result,
        'one/Review.agent.md',
        '.github/agents/dude-local-Review.agent.md',
      );
      destinationFact(
        result,
        'two/review.agent.md',
        '.github/agents/dude-local-review.agent.md',
      );
    });
  });
});

test('closed reference grammar detects only exact lexical forms and never rewrites reference bytes', async (t) => {
  const detectedCases = [
    {
      name: 'inline Markdown arbitrary extension',
      line: '[tool](./support/tool.mjs)',
      files: { 'pkg/support/tool.mjs': 'tool\n' },
      target: 'pkg/support/tool.mjs',
    },
    {
      name: 'inline image extensionless target',
      line: '![tool](./support/tool)',
      files: { 'pkg/support/tool': 'tool\n' },
      target: 'pkg/support/tool',
    },
    {
      name: 'single-quoted arbitrary extension',
      line: "'./support/config.data'",
      files: { 'pkg/support/config.data': 'config\n' },
      target: 'pkg/support/config.data',
    },
    {
      name: 'double-quoted extensionless target',
      line: '"./support/config"',
      files: { 'pkg/support/config': 'config\n' },
      target: 'pkg/support/config',
    },
    {
      name: 'single-backtick directory target',
      line: '`./support/docs`',
      files: { 'pkg/support/docs/readme.txt': 'docs\n' },
      target: 'pkg/support/docs',
    },
    {
      name: 'parent inline Markdown target',
      line: '[license](../LICENSE)',
      files: { LICENSE: 'shared\n' },
      target: 'LICENSE',
    },
  ];

  for (const fixtureCase of detectedCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const source = agentDocument({
          body: `${COORDINATOR_PARAGRAPH}\n\n${fixtureCase.line}`,
        });
        const fixture = sourceFixture({
          'pkg/review.agent.md': source,
          ...fixtureCase.files,
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
        const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/review.agent.md');

        assert.deepEqual(record.related_paths, [fixtureCase.target]);
        assert.match(record.guidance, /clean.*source|narrower.*root/i);
        assert.deepEqual(
          fixture.bytesByPath.get('pkg/review.agent.md'),
          Buffer.from(source),
          'reference analysis does not mutate provider bytes',
        );
        assertNoOutputForSource(result, 'pkg/review.agent.md');
        await assert.rejects(
          result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
          /blocked|illegal|unknown|missing|output/i,
        );
      });
    });
  }

  await t.test('omits a broken referencing output while retaining evidence and a safe target', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\n[tool](./support/tool)`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const referencingDestination = '.github/agents/dude-local-review.agent.md';

      diagnostic(result, 'reference-broken-by-mapping', 'pkg/review.agent.md');
      destinationFact(result, 'pkg/review.agent.md', referencingDestination);
      const targetOutput = outputForSource(result, 'pkg/support/tool');
      assert.equal(
        targetOutput.destination_path,
        '.github/agents/dude-local-review.support/support/tool',
      );
      assert.deepEqual(await result.getOutputBytes(targetOutput.destination_path), Buffer.from('tool\n'));

      const byteAccess = await result.getOutputBytes(referencingDestination).then(
        () => ({ rejected: false, message: '' }),
        (error) => ({ rejected: true, message: String(error?.message ?? error) }),
      );
      assert.deepEqual(
        {
          publicOutput: result.outputs.some(({ destination_path: destinationPath }) => (
            destinationPath === referencingDestination
          )),
          byteAccessRejected: byteAccess.rejected,
        },
        { publicOutput: false, byteAccessRejected: true },
      );
      if (byteAccess.rejected) {
        assert.match(byteAccess.message, /blocked|illegal|unknown|missing|output/i);
      }
    });
  });

  await t.test('exact quoted tokens remain lexical matches in code-like surrounding text', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\nconst selected = './support/tool';`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(
        result,
        'reference-broken-by-mapping',
        'pkg/review.agent.md',
      );
      assert.deepEqual(record.related_paths, ['pkg/support/tool']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });

  await t.test('exact single-quoted tokens remain lexical matches between comparison operators', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\nif (left < './support/tool' && right > 0) use(left);`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(
        result,
        'reference-broken-by-mapping',
        'pkg/review.agent.md',
      );
      assert.deepEqual(record.related_paths, ['pkg/support/tool']);
      assertNoOutputForSource(result, 'pkg/review.agent.md');
      await assert.rejects(
        result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
        /blocked|illegal|unknown|missing|output/i,
      );
    });
  });

  await t.test('excludes the complete negative grammar and ignores absent source targets', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const negativeLines = [
        '[tool]: ./support/tool',
        '<./support/tool>',
        '<img src="./support/tool">',
        "<img src='./support/tool'>",
        'See ./support/tool in prose.',
        '[leading space]( ./support/tool)',
        '[trailing space](./support/tool )',
        String.raw`[backslash](.\support\tool)`,
        String.raw`[escape](.\/support/tool)`,
        '[query](./support/tool?raw=1)',
        '[fragment](./support/tool#section)',
        '[delimiter](./support/(tool))',
        '[percent](./support%2Ftool)',
        "''./support/tool''",
        '""./support/tool""',
        '``./support/tool``',
        '[missing](./support/not-present)',
      ];
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\n${negativeLines.join('\n')}`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertNoDiagnostic(result, 'reference-broken-by-mapping');
      const output = outputForSource(result, 'pkg/review.agent.md');
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });

  await t.test('allows every exact form when skill-tree mapping preserves its target', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const referenceBody = [
        '[markdown](./support/tool)',
        '![image](./support/tool)',
        "'./support/tool'",
        '"./support/tool"',
        '`./support/tool`',
      ].join('\n');
      const source = skillDocument({ name: 'linked-skill', body: referenceBody });
      const fixture = sourceFixture({
        'pkg/SKILL.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertNoDiagnostic(result, 'reference-broken-by-mapping');
      const output = outputForSource(result, 'pkg/SKILL.md');
      assert.deepEqual(
        await result.getOutputBytes(output.destination_path),
        Buffer.from(source.replace('name: linked-skill', 'name: dude-local-linked-skill')),
      );
    });
  });

  await t.test('blocks an existing target whose fixed mapping escapes the artifact output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = skillDocument({ name: 'escape-check', body: '[license](../LICENSE)' });
      const fixture = sourceFixture({
        LICENSE: 'shared license\n',
        'pkg/SKILL.md': source,
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/SKILL.md');

      assert.deepEqual(record.related_paths, ['LICENSE']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });

  await t.test('blocks an existing empty directory target absent from destination outputs', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture(
        { 'pkg/SKILL.md': skillDocument({ name: 'empty-dir', body: '[empty](./empty)' }) },
        { directories: ['pkg/empty'] },
      );
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/SKILL.md');

      assert.deepEqual(record.related_paths, ['pkg/empty']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });
});

test('destination facts use no-follow states and public outputs contain legal candidates only', async (t) => {
  const sourcePath = 'artifact/SKILL.md';
  const destinationPath = '.github/skills/dude-local-safe-skill/SKILL.md';

  await t.test('accepts a missing destination and one safe regular replacement', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const missing = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.deepEqual(outputForSource(missing, sourcePath).destination_state, { type: 'missing' });

      const existing = Buffer.from('existing destination\n');
      writeWorkspaceFile(workspaceRoot, destinationPath, existing);
      const replacement = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.deepEqual(outputForSource(replacement, sourcePath).destination_state, {
        type: 'regular-file',
        sha256: sha256(existing),
      });
    });
  });

  const unsafeCases = [
    {
      name: 'symbolic-link ancestor',
      code: 'destination-unsafe-ancestor',
      arrange(root) {
        fs.mkdirSync(path.join(root, '.github'), { recursive: true });
        writeWorkspaceFile(
          root,
          'outside-skills/dude-local-safe-skill/external.txt',
          'must not be inventoried\n',
        );
        writeWorkspaceFile(root, 'outside-skills/unrelated.txt', 'unrelated\n');
        fs.symlinkSync('../outside-skills', path.join(root, '.github', 'skills'), 'dir');
      },
      noUnplanned: true,
    },
    {
      name: 'regular-file ancestor',
      code: 'destination-unsafe-ancestor',
      arrange(root) {
        writeWorkspaceFile(root, '.github/skills', 'not a directory\n');
      },
      noUnplanned: true,
    },
    {
      name: 'symbolic-link destination',
      code: 'destination-unsupported',
      arrange(root) {
        const target = writeWorkspaceFile(root, 'elsewhere.txt', 'elsewhere\n');
        const absoluteDestination = path.join(root, ...destinationPath.split('/'));
        fs.mkdirSync(path.dirname(absoluteDestination), { recursive: true });
        fs.symlinkSync(target, absoluteDestination);
      },
    },
    {
      name: 'unsupported destination type',
      code: 'destination-unsupported',
      arrange(root) {
        fs.mkdirSync(path.join(root, ...destinationPath.split('/')), { recursive: true });
      },
    },
    {
      name: 'multi-link regular destination',
      code: 'destination-multilink',
      arrange(root) {
        const destination = writeWorkspaceFile(root, destinationPath, 'linked\n');
        fs.linkSync(destination, path.join(root, 'destination-alias'));
      },
      maySkip: true,
    },
    {
      name: 'case alias at the exact destination',
      code: 'destination-case-collision',
      arrange(root) {
        writeWorkspaceFile(
          root,
          '.github/skills/dude-local-safe-skill/skill.md',
          'case alias\n',
        );
      },
    },
  ];

  for (const fixtureCase of unsafeCases) {
    await t.test(fixtureCase.name, async (subtest) => {
      await withWorkspace(async (workspaceRoot) => {
        try {
          fixtureCase.arrange(workspaceRoot);
        } catch (error) {
          if (
            fixtureCase.maySkip
            && error
            && typeof error === 'object'
            && 'code' in error
            && ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(error.code))
          ) {
            subtest.skip(`filesystem does not support the hard-link fixture: ${String(error.code)}`);
            return;
          }
          throw error;
        }
        const before = snapshotWorkspace(workspaceRoot);
        const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
        diagnostic(result, fixtureCase.code);
        assertNoOutputForSource(result, sourcePath);
        destinationFact(result, sourcePath, destinationPath);
        assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === sourcePath));
        if (fixtureCase.noUnplanned) assertNoDiagnostic(result, 'destination-unplanned-entry');
      });
    });
  }

  await t.test('reports every observable case alias in raw order', async (subtest) => {
    await withWorkspace(async (workspaceRoot) => {
      const aliasDirectory = path.join(
        workspaceRoot,
        '.github',
        'skills',
        'dude-local-safe-skill',
      );
      fs.mkdirSync(aliasDirectory, { recursive: true });
      fs.writeFileSync(path.join(aliasDirectory, 'Skill.md'), 'first alias\n');
      fs.writeFileSync(path.join(aliasDirectory, 'skill.md'), 'second alias\n');
      const aliasNames = fs.readdirSync(aliasDirectory)
        .filter((name) => name !== 'SKILL.md' && name.toLowerCase() === 'skill.md')
        .sort(compareRaw);
      if (aliasNames.length !== 2) {
        subtest.skip('filesystem cannot represent multiple case-only aliases');
        return;
      }

      const before = snapshotWorkspace(workspaceRoot);
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'destination-case-collision', destinationPath);

      assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
      assert.deepEqual(
        record.related_paths,
        aliasNames.map((name) => (
          `.github/skills/dude-local-safe-skill/${name}`
        )).sort(compareRaw),
      );
    });
  });

  await t.test('inventories unplanned descendants only beneath the relevant planned root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-safe-skill/stale.txt',
        'unplanned\n',
      );
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-unrelated/deep/keep.txt',
        'unrelated\n',
      );
      fs.symlinkSync(
        '../keep.txt',
        path.join(workspaceRoot, '.github/skills/dude-local-unrelated/deep/ignored-link'),
      );
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(result, 'destination-unplanned-entry');
      assert.deepEqual(record.related_paths, [
        '.github/skills/dude-local-safe-skill/stale.txt',
      ]);
      assert.equal(
        result.blocking_diagnostics.some(({ related_paths: relatedPaths }) => (
          relatedPaths.some((relatedPath) => relatedPath.includes('dude-local-unrelated'))
        )),
        false,
        'analysis must not recursively inventory unrelated .github artifact roots',
      );
      assertNoOutputForSource(result, sourcePath);
      destinationFact(result, sourcePath, destinationPath);
    });
  });

  await t.test('ignores an unsafe-looking unrelated artifact tree when the planned root is missing', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-unrelated/keep.txt',
        'keep\n',
      );
      fs.symlinkSync(
        'keep.txt',
        path.join(workspaceRoot, '.github/skills/dude-local-unrelated/link'),
      );
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      assert.deepEqual(outputForSource(result, sourcePath).destination_state, { type: 'missing' });
    });
  });
});

test('blocking diagnostics have exact fields, canonical related paths, stable identities, and stable sorting', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'README.md': 'unowned\n',
      'adapt/SKILL.md': skillDocument({ name: 'adapted', extra: ['model: gpt-4'] }),
      'bad/SKILL.md': '--- \nname: bad\ndescription: malformed\n---\n',
      'missing/review.agent.md': agentDocument({ body: 'No boundary here.' }),
    });

    const first = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const second = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

    assert.deepEqual(second.blocking_diagnostics, first.blocking_diagnostics);
    assert.ok(first.blocking_diagnostics.length >= 4);
    const expectedOrder = [...first.blocking_diagnostics].sort(compareDiagnostics);
    assert.deepEqual(first.blocking_diagnostics, expectedOrder);

    for (const record of first.blocking_diagnostics) {
      assert.deepEqual(Object.keys(record), DIAGNOSTIC_FIELDS);
      assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
      assert.equal(new Set(record.related_paths).size, record.related_paths.length);
      assert.equal(record.related_paths.includes(record.path), false);
    }
    const identities = first.blocking_diagnostics.map((record) => JSON.stringify([
      record.code,
      record.path,
      record.related_paths,
    ]));
    assert.equal(new Set(identities).size, identities.length);
  });
});

test('diagnostic sorting compares related paths as raw arrays rather than JSON text', async () => {
  assert.equal(compareRawArrays(['a'], ['a', 'a/b']), -1, 'a proper array prefix sorts first');

  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'a"/one/SKILL.md': skillDocument({ name: 'quote-collision', body: 'quote one' }),
      'a"/two/SKILL.md': skillDocument({ name: 'dude-pack-quote-collision', body: 'quote two' }),
      'a#/one/SKILL.md': skillDocument({ name: 'hash-collision', body: 'hash one' }),
      'a#/two/SKILL.md': skillDocument({ name: 'dude-pack-hash-collision', body: 'hash two' }),
    });
    const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const collisions = result.blocking_diagnostics.filter(({ code }) => code === 'output-collision');

    assert.deepEqual(collisions.map(({ related_paths: relatedPaths }) => relatedPaths), [
      ['a"/one/SKILL.md', 'a"/two/SKILL.md'],
      ['a#/one/SKILL.md', 'a#/two/SKILL.md'],
    ]);
    assert.deepEqual(result.blocking_diagnostics, [...result.blocking_diagnostics].sort(compareDiagnostics));
    for (const record of collisions) {
      assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
      assert.equal(new Set(record.related_paths).size, record.related_paths.length);
    }
  });
});

test('artifact analysis performs no destination writes', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const source = sourceFixture({
      'skills/check/SKILL.md': skillDocument({ name: 'write-check' }),
      'skills/check/support.txt': 'support\n',
      'agents/review.agent.md': agentDocument(),
      'agents/support.txt': 'agent support\n',
    });
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-write-check/SKILL.md',
      'reviewed existing skill\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-write-check/support.txt',
      'reviewed existing support\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/agents/dude-local-review.agent.md',
      'reviewed existing agent\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/agents/dude-local-review.support/support.txt',
      'reviewed existing support\n',
    );
    const before = snapshotWorkspace(workspaceRoot);
    const mutationCalls = [];
    const syncMutationNames = [
      'appendFileSync',
      'chmodSync',
      'copyFileSync',
      'linkSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'truncateSync',
      'unlinkSync',
      'writeFileSync',
    ];
    const originals = new Map();
    for (const name of syncMutationNames) {
      originals.set(name, fs[name]);
      fs[name] = (...args) => {
        mutationCalls.push({ name, args });
        throw new Error(`unexpected destination mutation through fs.${name}`);
      };
    }

    let result;
    try {
      result = await analyzeDirectoryArtifacts(source.sourceAnalysis, workspaceRoot);
    } finally {
      for (const [name, original] of originals) fs[name] = original;
    }

    assertResultContract(result);
    assert.equal(mutationCalls.length, 0);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
    assert.equal(source.state.revalidateCalls, 1);
  });
});
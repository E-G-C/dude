// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildDev } from '../../../scripts/build-dev.mjs';
import {
  cmdAdd,
  cmdList,
  cmdPreviewRefresh,
  cmdRefresh,
  cmdRemove,
  readProfile,
} from '../../../src/skills/dude-compose/compose.mjs';
import {
  loadAgentModelConfig,
  resolveCopilotModel,
} from '../../../src/skills/dude-engine/lib/agent-model-map.mjs';
import {
  copilotAgentPath,
  parseAgentSource,
  renderCopilotAgent,
  validateAgentSet,
} from '../../../src/skills/dude-engine/lib/agent-projection.mjs';
import {
  listProvide,
  parsePackManifestMetadata,
} from '../../../src/skills/dude-engine/lib/pack-manifest.mjs';
import { serializeProfileDocument } from '../../../src/skills/dude-engine/lib/profile.mjs';

const PACK_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(PACK_ROOT, '..', '..', '..');
const AGENT_STEM = 'dude-pack-a2a-javascript-specialist';
const AGENT_PATH = path.join(PACK_ROOT, 'agents', `${AGENT_STEM}.agent.md`);
const PROTOCOL_PATH = path.join(
  PACK_ROOT,
  'skills',
  'dude-pack-a2a-protocol',
  'SKILL.md',
);
const JAVASCRIPT_PATH = path.join(
  PACK_ROOT,
  'skills',
  'dude-pack-a2a-javascript',
  'SKILL.md',
);
const MAINTENANCE_PATH = path.join(
  PACK_ROOT,
  'skills',
  'dude-pack-a2a-protocol',
  'references',
  'maintenance.md',
);
const CONFIG_PATH = path.join(REPOSITORY_ROOT, 'src', 'config', 'agent-models.json');
const CONFIG = loadAgentModelConfig(CONFIG_PATH);
const INSTALL_LOCATIONS = Object.freeze([
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/prompts',
]);
const ORIGINAL_REFERENCES = Object.freeze([
  'https://github.com/a2aproject',
  'https://github.com/a2aproject/A2A/tree/main/docs',
  'https://a2a-protocol.org/latest/',
  'https://github.com/a2aproject/a2a-js',
]);
const EXPECTED_INSTALLED_FILES = Object.freeze([
  '.github/agents/dude-pack-a2a-javascript-specialist.agent.md',
  '.github/skills/dude-pack-a2a-javascript',
  '.github/skills/dude-pack-a2a-protocol',
]);
const OWNED_TEMP_PREFIX = 'dude-a2a-v1-';

/** @param {string} target */
function read(target) {
  return fs.readFileSync(target, 'utf8');
}

/** @param {string} target @param {string | Buffer} content */
function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @param {string} text */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} markdown
 * @param {number} level
 * @param {string} heading
 * @param {string} artifact
 */
function section(markdown, level, heading, artifact) {
  const lines = markdown.split(/\r?\n/);
  const marker = `${'#'.repeat(level)} ${heading}`;
  const starts = lines
    .map((line, index) => (line === marker ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(starts.length, 1, `${artifact} has exactly one ${marker} section`);
  const start = starts[0];
  const next = lines.findIndex((line, index) => {
    if (index <= start) return false;
    const match = /^(#{1,6}) /.exec(line);
    return Boolean(match && match[1].length <= level);
  });
  return lines.slice(start + 1, next === -1 ? lines.length : next).join('\n').trim();
}

/** @param {string} text @param {readonly string[]} fragments @param {string} label */
function assertFragments(text, fragments, label) {
  const normalized = normalizeWhitespace(text);
  for (const fragment of fragments) {
    assert.ok(
      normalized.includes(normalizeWhitespace(fragment)),
      `${label} retains ${JSON.stringify(normalizeWhitespace(fragment))}`,
    );
  }
}

/**
 * @param {string} markdown
 * @param {readonly string[]} headers
 * @param {string} artifact
 */
function tableRows(markdown, headers, artifact) {
  const lines = markdown.split(/\r?\n/);
  const header = `| ${headers.join(' | ')} |`;
  const start = lines.indexOf(header);
  assert.notEqual(start, -1, `${artifact} has table ${header}`);
  assert.match(lines[start + 1] || '', /^\|(?:\s*:?-+:?\s*\|)+$/);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    assert.equal(cells.length, headers.length, `${artifact} row has ${headers.length} cells`);
    rows.push(cells);
  }
  assert.ok(rows.length > 0, `${artifact} table has data rows`);
  return rows;
}

/** @param {string} markdown */
function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

/** @param {string} sourceFile @param {string} destination */
function resolveMarkdownLink(sourceFile, destination) {
  return path.resolve(path.dirname(sourceFile), ...destination.split('/'));
}

/** @param {string} directory */
function relativeFiles(directory) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} current @param {string} prefix */
  function visit(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      assert.equal(stat.isSymbolicLink(), false, `fixture/source path is not a link: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else {
        assert.equal(entry.isFile(), true, `fixture/source path is a file: ${relative}`);
        files.push(relative);
      }
    }
  }
  visit(directory, '');
  return files;
}

/** @param {string | Buffer} value */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** @param {string} rendered */
function renderedMetadata(rendered) {
  const closing = rendered.indexOf('\n---\n', 4);
  assert.notEqual(closing, -1, 'rendered A2A profile closes its frontmatter');
  return rendered.slice(0, closing + 4);
}

/**
 * @param {string} text
 * @param {{ id: string, obligation: string, companions: readonly string[] }} contract
 */
function assertProcedureObligation(text, contract) {
  for (const companion of contract.companions) {
    assert.ok(
      text.includes(companion),
      `${contract.id}: companion contract is invalid: ${JSON.stringify(companion)}`,
    );
  }
  assert.ok(
    text.includes(contract.obligation),
    `${contract.id}: required obligation is missing`,
  );
}

/** @param {string} text @param {string} obligation @param {string} label */
function deleteExactlyOnce(text, obligation, label) {
  const first = text.indexOf(obligation);
  assert.notEqual(first, -1, `${label}: deletion target exists`);
  assert.equal(
    text.indexOf(obligation, first + obligation.length),
    -1,
    `${label}: deletion target is unique`,
  );
  return normalizeWhitespace(`${text.slice(0, first)} ${text.slice(first + obligation.length)}`);
}

/** @param {string} source @param {string} destination @param {{ includeTests?: boolean }} [options] */
function copyFixtureSource(source, destination, { includeTests = false } = {}) {
  const sourceRoot = path.resolve(source);
  fs.cpSync(sourceRoot, destination, {
    recursive: true,
    errorOnExist: true,
    filter(candidate) {
      const relative = path.relative(sourceRoot, candidate);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      if (parts.includes('node_modules') || parts.includes('.git') || parts.includes('.dude')) {
        return false;
      }
      return includeTests || !/\.test\.(?:cjs|js|mjs)$/.test(relative);
    },
  });
}

/** @param {string} profileText @param {string} name */
function installedEntryBytes(profileText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `^    "${escaped}": \\{\\r?\\n[\\s\\S]*?^    \\}(?=,?\\r?$)`,
    'm',
  ).exec(profileText);
  assert.ok(match, `profile contains exact ${name} entry bytes`);
  return match[0];
}

/** @param {string} root */
function snapshotFiles(root) {
  const stat = fs.lstatSync(root);
  assert.equal(stat.isSymbolicLink(), false, `snapshot root is not a link: ${root}`);
  if (stat.isFile()) {
    return [{ path: '.', sha256: sha256(fs.readFileSync(root)) }];
  }
  assert.equal(stat.isDirectory(), true, `snapshot root is a file or directory: ${root}`);
  return relativeFiles(root).map((relative) => ({
    path: relative,
    sha256: sha256(fs.readFileSync(path.join(root, ...relative.split('/')))),
  }));
}

/** @param {string} root @param {string} library */
function builtCoreDiscovery(root, library) {
  const compose = path.join(root, '.github', 'skills', 'dude-compose', 'compose.mjs');
  const result = spawnSync(
    process.execPath,
    [
      compose,
      'list',
      '--root',
      root,
      '--library',
      library,
      '--use-case',
      'software-development',
      '--no-fetch',
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.error, undefined, `built Compose failed to start: ${result.error?.message || ''}`);
  assert.equal(
    result.status,
    0,
    `built Compose list failed: ${result.stderr || result.stdout || 'no output'}`,
  );
  return JSON.parse(result.stdout);
}

/** @param {string} root */
function assertNoInstalledA2aArtifacts(root) {
  for (const location of INSTALL_LOCATIONS) {
    const directory = path.join(root, ...location.split('/'));
    const leftovers = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((entry) => entry.startsWith('dude-pack-a2a-'))
      : [];
    assert.deepEqual(leftovers, [], `no A2A artifact remains in ${location}`);
  }
}

function createDisposableBundle() {
  const root = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), OWNED_TEMP_PREFIX)));
  try {
    const library = path.join(root, 'library', 'packs');
    copyFixtureSource(path.join(REPOSITORY_ROOT, 'src'), path.join(root, 'src'));
    copyFixtureSource(PACK_ROOT, path.join(library, 'a2a'), { includeTests: true });
    write(
      path.join(root, '.dude', 'metadata', 'bundle-manifest.md'),
      '# Bundle Manifest\n\n```json\n'
        + '{"source_repo":"https://example.invalid/dude","source_ref":"main","installed_ref":"a2a-v1-fixture"}\n'
        + '```\n',
    );
    buildDev({ repoRoot: root });

    const sentinelPath = '.github/instructions/dude-pack-sentinel-marker.instructions.md';
    const sentinelBytes = Buffer.from('# unrelated profile sentinel\n');
    write(path.join(root, ...sentinelPath.split('/')), sentinelBytes);
    const profile = {
      installed: {
        sentinel: {
          files: [sentinelPath],
          source: {
            type: 'local',
            location: fs.realpathSync(library),
          },
        },
      },
    };
    write(
      path.join(root, '.dude', 'metadata', 'profile.md'),
      serializeProfileDocument(profile, { root }),
    );
    return {
      root,
      library,
      sentinelPath,
      sentinelBytes,
    };
  } catch (error) {
    removeDisposableBundle(root);
    throw error;
  }
}

/** @param {string} root */
function removeDisposableBundle(root) {
  const resolved = fs.realpathSync(root);
  const temporaryDirectory = fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(resolved), temporaryDirectory, 'owned fixture is directly under the OS temp directory');
  assert.match(path.basename(resolved), /^dude-a2a-v1-/, 'owned fixture has the test prefix');
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('manifest, namespaces, leaf metadata, and Copilot projection are exact', () => {
  const manifest = read(path.join(PACK_ROOT, 'pack.md'));
  const metadata = parsePackManifestMetadata(manifest);
  const sourceFiles = relativeFiles(PACK_ROOT);
  const agentBytes = fs.readFileSync(AGENT_PATH);
  const parsed = parseAgentSource(agentBytes, { stem: AGENT_STEM, config: CONFIG });
  const rendered = renderCopilotAgent(parsed, CONFIG).toString('utf8');
  const model = resolveCopilotModel(CONFIG, 'reasoning').model;

  assert.deepEqual(metadata, {
    name: 'a2a',
    description: 'Optional catalog source for A2A protocol and JavaScript SDK guidance.',
    useCases: ['software-development'],
  });
  assert.deepEqual(listProvide(manifest, 'agents'), [AGENT_STEM]);
  assert.deepEqual(listProvide(manifest, 'skills'), [
    'dude-pack-a2a-javascript',
    'dude-pack-a2a-protocol',
  ]);
  assert.deepEqual(listProvide(manifest, 'instructions'), []);
  assert.deepEqual(listProvide(manifest, 'prompts'), []);
  assert.doesNotMatch(
    manifest.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '',
    /^(?:requires|hooks|routing_hints):/m,
  );
  assert.deepEqual(sourceFiles, [
    'a2a.test.mjs',
    'agents/dude-pack-a2a-javascript-specialist.agent.md',
    'pack.md',
    'skills/dude-pack-a2a-javascript/SKILL.md',
    'skills/dude-pack-a2a-protocol/references/maintenance.md',
    'skills/dude-pack-a2a-protocol/SKILL.md',
  ]);
  assert.equal(
    sourceFiles.every((relative) => !/(?:^|\/)(?:node_modules|package(?:-lock)?\.json)(?:\/|$)/.test(relative)),
    true,
  );
  for (const provider of [
    ...listProvide(manifest, 'agents'),
    ...listProvide(manifest, 'skills'),
  ]) {
    assert.match(provider, /^dude-pack-a2a-[a-z0-9-]+$/);
  }

  assert.deepEqual(Object.keys(parsed.frontmatter).sort(), [
    'description',
    'model-class',
    'name',
    'tools',
    'user-invocable',
  ]);
  assert.equal(parsed.frontmatter.name, 'A2A JavaScript Specialist');
  assert.equal(
    parsed.frontmatter.description,
    'Read-only advisor for Agent2Agent (A2A) protocol and the official JavaScript SDK. '
      + 'Use for source-backed protocol questions, SDK design and compatibility advice, '
      + 'or bounded knowledge-refresh and language-onboarding handoffs.',
  );
  assert.deepEqual(parsed.frontmatter.tools, ['read', 'search']);
  assert.equal(parsed.frontmatter['user-invocable'], false);
  assert.equal(parsed.frontmatter['model-class'], 'reasoning');
  assert.equal(Object.hasOwn(parsed.frontmatter, 'agents'), false);
  assert.doesNotThrow(() => validateAgentSet([parsed]));
  assert.equal(
    copilotAgentPath(AGENT_STEM),
    '.github/agents/dude-pack-a2a-javascript-specialist.agent.md',
  );
  assert.equal(
    renderedMetadata(rendered),
    [
      '---',
      'name: "A2A JavaScript Specialist"',
      `description: ${JSON.stringify(parsed.frontmatter.description)}`,
      'tools: ["read", "search"]',
      'user-invocable: false',
      `model: ${model}`,
      '---',
    ].join('\n'),
  );
  assert.doesNotMatch(rendered, /^model-class:/m);
  assert.match(rendered, /You are the A2A JavaScript Specialist, a read-only protocol and SDK advisor\./);
  assertFragments(
    parsed.body,
    [
      'Do not mutate Beads, Work, or task state, claim work, take over, or resume another stopped session.',
      'An absent or ambiguous owner stops the affected action;',
      'do not claim that runtime is implemented or available.',
    ],
    'A2A advisor boundary',
  );
});

test('protocol and JavaScript guidance retain official provenance and required facts', () => {
  const protocol = read(PROTOCOL_PATH);
  const javascript = read(JAVASCRIPT_PATH);
  const protocolLinks = new Set(markdownLinks(protocol));

  for (const reference of ORIGINAL_REFERENCES) {
    assert.equal(protocolLinks.has(reference), true, `protocol guidance retains ${reference}`);
  }

  const protocolBasis = section(protocol, 2, 'Source basis', 'protocol skill');
  const protocolRows = tableRows(
    protocolBasis,
    ['Topic', 'Official source', 'Revision or release', 'Checked (UTC)', 'Version scope and limit'],
    'protocol source basis',
  );
  const expectedProtocolDates = new Map([
    ['Participants, opacity, discovery, and data model', '2026-09-21T15:16:27Z'],
    ['Operations, task states, delivery modes, cancellation, and security', '2026-09-21T15:16:27Z'],
    ['Bindings and version negotiation', '2026-09-21T15:16:27Z'],
    ['Repository release comparison', '2026-09-21T15:16:27Z'],
    ['Official language SDK directory', '2026-09-21T15:16:27Z'],
    ['Conflicting topic summary', '2026-09-21T15:16:27Z'],
  ]);
  assert.deepEqual(protocolRows.map((row) => row[0]), [...expectedProtocolDates.keys()]);
  for (const [topic, source, revision, checked, scope] of protocolRows) {
    assert.match(source, /\]\(https:\/\/[^)]+\)/, `${topic} has an official source link`);
    assert.ok(revision, `${topic} has a revision or release`);
    assert.equal(checked, expectedProtocolDates.get(topic), `${topic} has its UTC checked basis`);
    assert.match(checked, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.ok(scope, `${topic} has a supported scope or limit`);
  }

  assertFragments(
    section(protocol, 3, 'Participants and discovery', 'protocol skill'),
    [
      'An A2A client acts for that user or another system and calls an A2A server (the remote agent).',
      'The remote agent is opaque.',
      'An Agent Card describes identity, skills, supported interfaces, capabilities, content modes, and authentication requirements.',
      'A card is descriptive input, not trust or permission by itself.',
    ],
    'protocol participants and discovery',
  );
  assertFragments(
    section(protocol, 3, 'Messages, tasks, and results', 'protocol skill'),
    [
      'A `Message` is one communication turn.',
      'A `Task` is a server-created, stateful protocol resource',
      '`Artifact` values are task outputs.',
      '`TASK_STATE_INPUT_REQUIRED` and `TASK_STATE_AUTH_REQUIRED` interrupt progress',
      'An A2A `Task` is not a Dude task claim, a Beads issue, a review verdict, or evidence that Dude work is complete.',
    ],
    'protocol messages, tasks, and results',
  );
  assertFragments(
    section(protocol, 3, 'Interaction choices', 'protocol skill'),
    [
      'Blocking send waits for a terminal or interrupted task state.',
      'Polling uses `GetTask`.',
      'Streaming uses `SendStreamingMessage` or `SubscribeToTask`',
      'Push notifications send task, message, status, or artifact events',
      '`CancelTask` is a request.',
    ],
    'protocol interaction choices',
  );
  assertFragments(
    section(protocol, 3, 'Bindings and versions', 'protocol skill'),
    [
      'Its standard bindings are JSON-RPC over HTTP, gRPC, and HTTP+JSON/REST.',
      'Clients select a compatible entry from `AgentCard.supportedInterfaces` and send the applicable `A2A-Version`.',
      'the retained evidence does not show that JavaScript SDK 1.2.0 was tested against every change represented by the protocol repository\'s v1.0.1 release.',
      'That SDK-to-release compatibility remains unknown.',
    ],
    'protocol bindings and versions',
  );
  assertFragments(
    section(protocol, 3, 'Security and authority', 'protocol skill'),
    [
      'Production transports use HTTPS or TLS.',
      'The server authenticates each request and applies its own authorization model',
      '`TASK_STATE_AUTH_REQUIRED` asks for authorization. The state itself grants nothing;',
      'A2A does not supply those policies or bypass Dude\'s coordinator, review, completion, or permission boundaries.',
    ],
    'protocol security and authority',
  );

  const javascriptBasis = section(javascript, 2, 'Source basis', 'JavaScript skill');
  const javascriptRows = tableRows(
    javascriptBasis,
    ['Topic', 'Official source', 'Revision or release', 'Checked (UTC)', 'Version scope and limit'],
    'JavaScript source basis',
  );
  const expectedJavascriptDates = new Map([
    ['Package identity, runtime, license, exports, and peer dependencies', '2026-09-21T15:16:30Z'],
    ['Client/server entry points, transports, streaming, cancellation, authentication, v0.3 opt-in, and examples', '2026-09-21T15:16:30Z'],
    ['Current SDK release', '2026-09-21T15:16:30Z'],
    ['Normative protocol comparison', '2026-09-21T15:16:27Z'],
  ]);
  assert.deepEqual(javascriptRows.map((row) => row[0]), [...expectedJavascriptDates.keys()]);
  for (const [topic, source, revision, checked, scope] of javascriptRows) {
    assert.match(source, /\]\(https:\/\/[^)]+\)/, `${topic} has an official source link`);
    assert.ok(revision, `${topic} has a revision or release`);
    assert.equal(checked, expectedJavascriptDates.get(topic), `${topic} has its UTC checked basis`);
    assert.match(checked, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.ok(scope, `${topic} has a supported scope or limit`);
  }
  assertFragments(
    section(javascript, 2, 'Procedure', 'JavaScript skill'),
    [
      'the inspected package and release are `@a2a-js/sdk` 1.2.0;',
      'package metadata requires Node.js 20 or newer and declares Apache-2.0;',
      'the inspected README says the SDK implements A2A specification v1.0.0;',
      'the protocol repository separately has release v1.0.1;',
      'the retained sources do not prove SDK 1.2.0 compatibility with every v1.0.1 repository change.',
      'Separate source facts, recommendations, and checks actually executed.',
    ],
    'JavaScript version procedure',
  );
  assertFragments(
    section(javascript, 2, 'Package and transport facts', 'JavaScript skill'),
    [
      'JSON-RPC',
      'HTTP+JSON/REST',
      'gRPC',
      'Node.js only; gRPC imports require the optional `@grpc/grpc-js` and `@bufbuild/protobuf` peer dependencies',
      'The SDK also exposes an opt-in v0.3 compatibility layer.',
    ],
    'JavaScript package and transport facts',
  );
  assertFragments(
    section(javascript, 2, 'Client responsibilities', 'JavaScript skill'),
    [
      '`ClientFactory.createFromUrl(...)` retrieves an Agent Card',
      '`JsonRpcTransportFactory`, `RestTransportFactory`, and, for Node.js gRPC, `GrpcTransportFactory`',
      '`sendMessageStream(...)` as an async generator',
      '`AuthenticationHandler` and `createAuthenticatingFetchWithRetry`',
    ],
    'JavaScript client responsibilities',
  );
  assertFragments(
    section(javascript, 2, 'Server responsibilities', 'JavaScript skill'),
    [
      'Implement `AgentExecutor` as application business logic.',
      '`DefaultRequestHandler` coordinates protocol requests, task storage, cancellation, and push notifications.',
      '`ExecutionEventBus`',
      'the executor implements its cancellation path',
      'Server authentication is application middleware.',
    ],
    'JavaScript server responsibilities',
  );
  assert.deepEqual(
    markdownLinks(section(javascript, 2, 'Official examples', 'JavaScript skill')),
    [
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/sample-agent',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/multi-transport-agent',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/cancellable-agent',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/push-notification-agent',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/authentication',
      'https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/client/interceptors',
    ],
  );

  const protocolMaintenance = markdownLinks(protocol)
    .find((destination) => destination === 'references/maintenance.md');
  const javascriptMaintenance = markdownLinks(javascript)
    .find((destination) => destination.endsWith('/references/maintenance.md'));
  assert.ok(protocolMaintenance, 'protocol skill links the shared maintenance procedure');
  assert.ok(javascriptMaintenance, 'JavaScript skill links the shared maintenance procedure');
  assert.equal(resolveMarkdownLink(PROTOCOL_PATH, protocolMaintenance), MAINTENANCE_PATH);
  assert.equal(resolveMarkdownLink(JAVASCRIPT_PATH, javascriptMaintenance), MAINTENANCE_PATH);
  assert.equal(fs.existsSync(MAINTENANCE_PATH), true);
});

test('maintenance procedures retain bounded inputs, authority, validation, and return contracts', () => {
  const maintenance = read(MAINTENANCE_PATH);
  const refresh = section(
    maintenance,
    2,
    'Refresh protocol and JavaScript knowledge',
    'maintenance reference',
  );
  const language = section(
    maintenance,
    2,
    'Onboard another language when a real task needs it',
    'maintenance reference',
  );

  assertFragments(
    section(refresh, 3, 'Required inputs', 'refresh procedure'),
    [
      'the authorized refresh request and its exact source-edit boundary;',
      'the current protocol and JavaScript baselines, including revisions, releases, supported version scopes, last successful checked times, and known conflicts;',
      'a concrete change signal, if one exists;',
      'Cadence remains TBD and unselected',
    ],
    'refresh inputs',
  );
  assertFragments(
    section(refresh, 3, '2. Check both source families', 'refresh procedure'),
    [
      'Check both families during every complete refresh',
      'public official URL;',
      'immutable commit, tag, or release;',
      'successful check time in UTC;',
      'specification or wire target;',
      'SDK package version and runtime constraints',
      'Compare claim content, not only version strings.',
    ],
    'refresh evidence comparison',
  );
  assertFragments(
    section(refresh, 3, '5. Validate and obtain independent review', 'refresh procedure'),
    [
      'check every changed public link, immutable revision, release, UTC time, and supported-version statement;',
      'run the current focused pack tests and source lint when they exist',
      'obtain independent review from a current reviewer who did not author the change.',
      'A failed check or rejected review blocks promotion.',
    ],
    'refresh validation',
  );
  assertFragments(
    section(refresh, 3, '6. Refresh an eligible installed target', 'refresh procedure'),
    [
      'Source edits do not update a live installation.',
      'run Compose `status --json`',
      'run `refresh a2a --dry-run --json`',
      'wait for the required confirmation;',
      'run `refresh a2a --json`;',
      'run Dude lint against that target and require zero failures.',
      'Refresh does not install an absent pack.',
    ],
    'installed refresh',
  );
  assertFragments(
    section(refresh, 3, 'Refresh return', 'refresh procedure'),
    [
      'affected authoritative paths and their current owners;',
      'the disposition for each affected claim;',
      'validation and independent-review results, clearly separated from planned checks;',
      'remaining compatibility, freshness, permission, or availability limits.',
      'Do not create a refresh ledger, registry, scheduler state, or persistent-memory claim.',
    ],
    'refresh return',
  );

  assertFragments(
    section(language, 3, 'Required inputs', 'language procedure'),
    [
      'a concrete task and requested language;',
      'the advice or design outcome needed from a specialist;',
      'target A2A wire version and required transports or capabilities;',
      'runtime, package, platform, and version constraints;',
      'authorization for research, plus separate authoring and installation authority',
      'If the language or task is speculative, stop.',
    ],
    'language inputs',
  );
  assertFragments(
    section(language, 3, '1. Establish official SDK evidence', 'language procedure'),
    [
      'pin the page to an immutable revision.',
      'do not guess a repository from the language name.',
      'read the README, package or build metadata, relevant release notes or tag, and examples that match the real task.',
      'Do not transfer JavaScript APIs or assumptions to another language.',
      'stop before authoring, installation, or affected implementation advice.',
    ],
    'language evidence',
  );
  assertFragments(
    section(language, 3, '4. Review, compose, and verify availability', 'language procedure'),
    [
      'Have an independent current reviewer inspect role overlap, provenance, version limits, boundaries, paths, minimal tools, and the task-relevant advice case.',
      'Rediscover the target\'s direct roster and matching skills from fresh files.',
      'Dispatch one bounded advice request',
      'Repeat the routing decision for the same request.',
      'Catalog or source presence alone is not installed availability.',
      'fixture must be isolated and discarded.',
    ],
    'language availability',
  );
  assertFragments(
    section(language, 3, 'Language onboarding return', 'language procedure'),
    [
      'the selected existing or newly reviewed canonical identity;',
      'official SDK repository, immutable revision, release, documented protocol target, checked time, and task-specific compatibility basis;',
      'reuse or create decision and the actual owners involved;',
      'installed discovery and advice evidence, only if actually observed;',
      'unsupported claims, missing authority, and availability limits.',
    ],
    'language return',
  );
});

test('targeted deletion falsifiers reject removal of each material procedure obligation', () => {
  const maintenance = read(MAINTENANCE_PATH);
  const refresh = section(
    maintenance,
    2,
    'Refresh protocol and JavaScript knowledge',
    'maintenance reference',
  );
  const language = section(
    maintenance,
    2,
    'Onboard another language when a real task needs it',
    'maintenance reference',
  );
  const contracts = [
    {
      id: 'source-conflict',
      target: normalizeWhitespace(section(refresh, 3, '3. Classify the result', 'refresh procedure')),
      obligation: 'identify the conflicting SDK or topic statement, and withhold the disputed compatibility or behavior claim.',
      companions: [
        'Preserve each source\'s actual label or claim.',
        'Prefer the selected normative contract for protocol semantics',
        'A reviewed conflict note may be promoted; the disputed conclusion may not.',
      ],
    },
    {
      id: 'unsuccessful-refresh-date',
      target: normalizeWhitespace(section(refresh, 3, '3. Classify the result', 'refresh procedure')),
      obligation: 'Record the failed attempt and missing source in the handoff, not as a successful review date.',
      companions: [
        'Preserve the last supported content, revision, version scope, and last successful checked time.',
        'Do not promote an affected freshness or compatibility claim.',
        'Never erase a useful dated baseline because a source failed.',
      ],
    },
    {
      id: 'reuse-before-create',
      target: normalizeWhitespace(section(language, 3, '2. Inspect the actual roster and catalog', 'language procedure')),
      obligation: 'Reuse an adequate role before creating anything.',
      companions: [
        'An existing role is adequate only if its documented scope covers the concrete advice need',
        'If the role exists only in the catalog, normal authorized installation may be enough; do not author a duplicate.',
        'Partial overlap or two equally credible owners is an ambiguity',
      ],
    },
    {
      id: 'missing-authoring-authority',
      target: normalizeWhitespace(section(language, 3, '3. Reuse or prepare a bounded authoring handoff', 'language procedure')),
      obligation: 'If no adequate specialist exists, creation may proceed only with explicit authoring authority and uniquely discovered current owners for the agent, skill, and pack artifacts.',
      companions: [
        'For reuse, select the existing canonical identity and exact source or installed paths.',
        'The advisor returns a handoff containing:',
        'It must not assume particular optional packs or invent an owner.',
      ],
    },
    {
      id: 'no-work-state',
      target: normalizeWhitespace(section(refresh, 3, '1. Establish ownership and evidence scope', 'refresh procedure')),
      obligation: 'A request to check freshness does not authorize a wire-version upgrade, SDK execution, agent rewrite, installation, or workflow-state mutation.',
      companions: [
        'Confirm the requested claims and authorized paths.',
        'Discover the current roster and installed skills.',
        'An A2A advisor may inspect evidence and prepare a bounded handoff.',
      ],
    },
  ];

  for (const contract of contracts) {
    assertProcedureObligation(contract.target, contract);
    const mutated = deleteExactlyOnce(contract.target, contract.obligation, contract.id);
    for (const companion of contract.companions) {
      assert.ok(mutated.includes(companion), `${contract.id}: companion remains valid after deletion`);
    }
    assert.throws(
      () => assertProcedureObligation(mutated, contract),
      new RegExp(`${contract.id}: required obligation is missing`),
      `${contract.id}: deleting only its obligation must fail`,
    );
  }
});

test('written walkthroughs cover all refresh and language decision branches without claiming execution', () => {
  const maintenance = read(MAINTENANCE_PATH);
  const decisions = section(
    maintenance,
    2,
    'Decision walkthroughs for inspection',
    'maintenance reference',
  );
  const decisionRows = new Map(tableRows(
    decisions,
    ['Case', 'Expected written outcome'],
    'maintenance decision walkthroughs',
  ).map(([name, outcome]) => [name, normalizeWhitespace(outcome)]));
  assert.deepEqual([...decisionRows.keys()], [
    'Both source families match the baseline',
    'Only the normative protocol material changes',
    'Only the SDK release or API guidance changes',
    'Specification, release, README, or topic claims disagree',
    'A required source cannot be read',
    'An adequate language specialist already exists',
    'Official SDK evidence exists, no role fits, and authority is complete',
    'Evidence, compatibility, authority, or ownership is missing',
  ]);

  const refreshCases = [
    ['Both source families match the baseline', ['`Unchanged`', 'both comparisons', 'no runtime claim']],
    ['Only the normative protocol material changes', ['`Protocol-only`', 'keep SDK compatibility unknown']],
    ['Only the SDK release or API guidance changes', ['`SDK-only`', 'without changing the documented wire target automatically']],
    ['Specification, release, README, or topic claims disagree', ['`Conflict`', 'prefer the normative contract', 'withhold the disputed conclusion']],
    ['A required source cannot be read', ['`Unavailable`', 'preserve the last supported baseline and its date', 'failed check separately']],
  ];
  for (const [name, fragments] of refreshCases) {
    assertFragments(decisionRows.get(name) || '', fragments, `refresh walkthrough ${name}`);
  }
  assertFragments(
    decisionRows.get('An adequate language specialist already exists') || '',
    ['Reuse its actual identity and guidance;', 'fresh discovery and advice', 'rather than authoring a duplicate.'],
    'language reuse walkthrough',
  );
  assertFragments(
    decisionRows.get('Official SDK evidence exists, no role fits, and authority is complete') || '',
    ['Return the bounded handoff', 'separate authoring', 'independent review', 'eligible Compose', 'fresh discovery', 'advice evidence.'],
    'language create walkthrough',
  );
  assertFragments(
    decisionRows.get('Evidence, compatibility, authority, or ownership is missing') || '',
    ['Stop before the affected action', 'exact gap', 'without a substitute.'],
    'language limited walkthrough',
  );

  const language = section(
    maintenance,
    2,
    'Onboard another language when a real task needs it',
    'maintenance reference',
  );
  const stops = new Map(tableRows(
    section(language, 3, 'Stop conditions', 'language procedure'),
    ['Condition', 'Required stop'],
    'language stop conditions',
  ).map(([condition, requiredStop]) => [condition, normalizeWhitespace(requiredStop)]));
  assertFragments(
    stops.get('No verified official SDK repository') || '',
    ['missing official basis', 'do not use a guessed or unofficial substitute.'],
    'missing-evidence stop',
  );
  assertFragments(
    stops.get('Missing research, authoring, review, Compose, or installation authority') || '',
    ['Stop before that action', 'needed authority to the coordinator', 'do not escalate it.'],
    'absent-authority stop',
  );
  assertFragments(
    stops.get('Missing or ambiguous artifact owner, or ambiguous role overlap') || '',
    ['Stop before edits', 'candidates and unresolved scope.'],
    'ambiguous-owner stop',
  );
});

test('real Compose lifecycle preserves unrelated state and core usability in an owned fixture', async () => {
  const fixture = createDisposableBundle();
  const profilePath = path.join(fixture.root, '.dude', 'metadata', 'profile.md');
  const coreAgentPath = path.join(fixture.root, '.github', 'agents', 'dude.agent.md');
  try {
    const initialProfile = read(profilePath);
    const sentinelEntry = installedEntryBytes(initialProfile, 'sentinel');
    const initialCoreAgent = fs.readFileSync(coreAgentPath);
    const directBefore = cmdList({
      root: fixture.root,
      library: fixture.library,
      fetch: false,
      useCase: 'software-development',
    });
    assert.equal(directBefore.ok, true, directBefore.error);
    assert.deepEqual(directBefore.result?.packs, [{
      name: 'a2a',
      installed: false,
      description: 'Optional catalog source for A2A protocol and JavaScript SDK guidance.',
      use_cases: ['software-development'],
    }]);
    assert.deepEqual(builtCoreDiscovery(fixture.root, fixture.library).packs, directBefore.result?.packs);

    const added = await cmdAdd({
      root: fixture.root,
      library: fixture.library,
      name: 'a2a',
      force: false,
      fetch: false,
    });
    assert.equal(added.ok, true, added.error);
    assert.deepEqual(added.result?.files, EXPECTED_INSTALLED_FILES);
    const installed = readProfile(fixture.root).installed.a2a;
    assert.deepEqual(installed.files, EXPECTED_INSTALLED_FILES);
    assert.deepEqual(installed.source, {
      type: 'local',
      location: fs.realpathSync(fixture.library),
    });
    assert.equal(installedEntryBytes(read(profilePath), 'sentinel'), sentinelEntry);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...fixture.sentinelPath.split('/'))),
      fixture.sentinelBytes,
    );
    assert.deepEqual(
      relativeFiles(path.join(fixture.root, '.github'))
        .filter((relative) => relative.endsWith('a2a.test.mjs')),
      [],
      'the authoring test is not projected into the consumer bundle',
    );
    const projectedAgent = read(path.join(
      fixture.root,
      '.github',
      'agents',
      'dude-pack-a2a-javascript-specialist.agent.md',
    ));
    assert.match(
      projectedAgent,
      new RegExp(`^model: ${resolveCopilotModel(CONFIG, 'reasoning').model}$`, 'm'),
    );
    assert.doesNotMatch(projectedAgent, /^model-class:/m);

    const installedSnapshots = EXPECTED_INSTALLED_FILES.map((relative) => ({
      path: relative,
      snapshot: snapshotFiles(path.join(fixture.root, ...relative.split('/'))),
    }));
    const profileBeforeBuild = fs.readFileSync(profilePath);
    buildDev({ repoRoot: fixture.root });
    assert.deepEqual(fs.readFileSync(profilePath), profileBeforeBuild);
    assert.deepEqual(fs.readFileSync(coreAgentPath), initialCoreAgent);
    for (const installedSnapshot of installedSnapshots) {
      assert.deepEqual(
        snapshotFiles(path.join(fixture.root, ...installedSnapshot.path.split('/'))),
        installedSnapshot.snapshot,
        `${installedSnapshot.path} survives the core rebuild`,
      );
    }
    assert.equal(builtCoreDiscovery(fixture.root, fixture.library).packs[0].installed, true);

    const fixtureJavascript = path.join(
      fixture.library,
      'a2a',
      'skills',
      'dude-pack-a2a-javascript',
      'SKILL.md',
    );
    fs.appendFileSync(fixtureJavascript, '\nFixture-only refresh marker.\n');
    const beforePreview = {
      profile: fs.readFileSync(profilePath),
      github: snapshotFiles(path.join(fixture.root, '.github')),
    };
    const previewed = await cmdPreviewRefresh({
      root: fixture.root,
      library: fixture.library,
      name: 'a2a',
      fetch: false,
    });
    assert.equal(previewed.ok, true, previewed.error);
    assert.deepEqual(previewed.result?.replaced, EXPECTED_INSTALLED_FILES);
    assert.deepEqual(previewed.result?.added, []);
    assert.deepEqual(previewed.result?.removed, []);
    assert.deepEqual(fs.readFileSync(profilePath), beforePreview.profile);
    assert.deepEqual(snapshotFiles(path.join(fixture.root, '.github')), beforePreview.github);

    const refreshed = await cmdRefresh({
      root: fixture.root,
      library: fixture.library,
      name: 'a2a',
      fetch: false,
    });
    assert.equal(refreshed.ok, true, refreshed.error);
    assert.deepEqual(refreshed.result?.replaced, previewed.result?.replaced);
    assert.deepEqual(refreshed.result?.added, previewed.result?.added);
    assert.deepEqual(refreshed.result?.removed, previewed.result?.removed);
    assert.match(
      read(path.join(
        fixture.root,
        '.github',
        'skills',
        'dude-pack-a2a-javascript',
        'SKILL.md',
      )),
      /Fixture-only refresh marker\./,
    );
    assert.equal(installedEntryBytes(read(profilePath), 'sentinel'), sentinelEntry);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...fixture.sentinelPath.split('/'))),
      fixture.sentinelBytes,
    );

    const removed = cmdRemove({ root: fixture.root, name: 'a2a' });
    assert.equal(removed.ok, true, removed.error);
    assert.deepEqual(removed.result?.files, EXPECTED_INSTALLED_FILES);
    assert.equal(Object.hasOwn(readProfile(fixture.root).installed, 'a2a'), false);
    assertNoInstalledA2aArtifacts(fixture.root);
    assert.equal(installedEntryBytes(read(profilePath), 'sentinel'), sentinelEntry);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...fixture.sentinelPath.split('/'))),
      fixture.sentinelBytes,
    );

    buildDev({ repoRoot: fixture.root });
    assert.deepEqual(fs.readFileSync(coreAgentPath), initialCoreAgent);
    assert.equal(builtCoreDiscovery(fixture.root, fixture.library).packs[0].installed, false);
    assertNoInstalledA2aArtifacts(fixture.root);
  } finally {
    removeDisposableBundle(fixture.root);
  }
});

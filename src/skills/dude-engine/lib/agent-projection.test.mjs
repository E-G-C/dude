// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentModelConfig, resolveCopilotModel } from './agent-model-map.mjs';
import * as projection from './agent-projection.mjs';

const CONFIG_PATH = fileURLToPath(new URL('../../../config/agent-models.json', import.meta.url));
const PACKS_DIRECTORY = fileURLToPath(new URL('../../../../library/packs/', import.meta.url));
const CONFIG = loadAgentModelConfig(CONFIG_PATH);
const COPILOT_TOOLS = Object.freeze([
  'read', 'edit', 'search', 'execute', 'todo', 'agent', 'workiq/*', 'workiq2/*',
]);
const DEFAULT_TOOLS = Object.freeze(['read', 'edit', 'search', 'execute', 'todo', 'agent']);

/**
 * The T005-approved catalog metadata. Logical classes and source tool selectors
 * are intentionally asserted here; concrete models are always read from CONFIG.
 */
const PACK_CATALOG = Object.freeze({
  authoring: {
    manifestAgents: [
      'dude-pack-authoring-agent-smith',
      'dude-pack-authoring-instruction-smith',
      'dude-pack-authoring-pack-smith',
      'dude-pack-authoring-prompt-smith',
      'dude-pack-authoring-skill-smith',
    ],
    agents: {
      'dude-pack-authoring-agent-smith': {
        modelClass: 'reasoning', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-authoring-instruction-smith': {
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-authoring-pack-smith': {
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-authoring-prompt-smith': {
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-authoring-skill-smith': {
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
      },
    },
  },
  beads: { manifestAgents: [], agents: {} },
  coding: {
    manifestAgents: [
      'dude-pack-coding-architect',
      'dude-pack-coding-coder',
      'dude-pack-coding-reviewer',
      'dude-pack-coding-tester',
    ],
    agents: {
      'dude-pack-coding-architect': {
        modelClass: 'reasoning', tools: ['read', 'edit', 'execute', 'search'],
      },
      'dude-pack-coding-coder': {
        modelClass: 'balanced', tools: ['read', 'edit', 'execute', 'search'],
      },
      'dude-pack-coding-reviewer': {
        modelClass: 'reasoning', tools: ['read', 'search'],
      },
      'dude-pack-coding-tester': {
        modelClass: 'balanced', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  'copilot-sdk': {
    manifestAgents: ['dude-pack-copilot-sdk-specialist'],
    agents: {
      'dude-pack-copilot-sdk-specialist': {
        modelClass: 'balanced', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  design: { manifestAgents: [], agents: {} },
  docsy: {
    manifestAgents: ['dude-pack-docsy-expert'],
    agents: {
      'dude-pack-docsy-expert': {
        modelClass: 'visual', tools: ['read', 'edit', 'search', 'execute'],
      },
    },
  },
  'fluent-ui': {
    manifestAgents: ['dude-pack-fluent-ui-specialist'],
    agents: {
      'dude-pack-fluent-ui-specialist': {
        modelClass: 'visual', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  hugo: {
    manifestAgents: [
      'dude-pack-hugo-site-architect',
      'dude-pack-hugo-template-specialist',
      'dude-pack-hugo-docs-researcher',
      'dude-pack-hugo-migration-specialist',
      'dude-pack-hugo-troubleshooter',
    ],
    agents: {
      'dude-pack-hugo-docs-researcher': {
        modelClass: 'fast', tools: ['read', 'search'],
      },
      'dude-pack-hugo-migration-specialist': {
        modelClass: 'reasoning',
        tools: ['read', 'search', 'edit', 'execute', 'todo', 'agent'],
        roster: [
          'dude-pack-hugo-docs-researcher',
          'dude-pack-hugo-template-specialist',
          'dude-pack-hugo-troubleshooter',
        ],
      },
      'dude-pack-hugo-site-architect': {
        modelClass: 'reasoning',
        tools: ['read', 'search', 'edit', 'execute', 'todo', 'agent'],
        roster: [
          'dude-pack-hugo-docs-researcher',
          'dude-pack-hugo-template-specialist',
          'dude-pack-hugo-troubleshooter',
          'dude-pack-hugo-migration-specialist',
        ],
      },
      'dude-pack-hugo-template-specialist': {
        modelClass: 'visual',
        tools: ['read', 'search', 'edit', 'execute', 'agent'],
        roster: ['dude-pack-hugo-docs-researcher'],
      },
      'dude-pack-hugo-troubleshooter': {
        modelClass: 'balanced',
        tools: ['read', 'search', 'edit', 'execute', 'todo', 'agent'],
        roster: [
          'dude-pack-hugo-docs-researcher',
          'dude-pack-hugo-template-specialist',
        ],
      },
    },
  },
  newsroom: {
    manifestAgents: [
      'dude-pack-newsroom-writer',
      'dude-pack-newsroom-event-deep-fetcher',
    ],
    agents: {
      'dude-pack-newsroom-event-deep-fetcher': {
        modelClass: 'fast',
        tools: ['workiq/*', 'workiq2/*', 'read', 'search', 'edit', 'execute'],
      },
      'dude-pack-newsroom-writer': {
        modelClass: 'balanced', tools: ['read', 'edit', 'search'],
      },
    },
  },
  practices: { manifestAgents: [], agents: {} },
  release: {
    manifestAgents: ['dude-pack-release-manager'],
    agents: {
      'dude-pack-release-manager': {
        modelClass: 'reasoning', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  rust: {
    manifestAgents: ['dude-pack-rust-specialist'],
    agents: {
      'dude-pack-rust-specialist': {
        modelClass: 'balanced', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  strata: {
    manifestAgents: ['dude-pack-strata-stylist'],
    agents: {
      'dude-pack-strata-stylist': {
        modelClass: 'visual', tools: ['read', 'edit', 'search', 'todo'],
      },
    },
  },
  'technical-docs': {
    manifestAgents: [
      'dude-pack-technical-docs-writer',
      'dude-pack-technical-docs-extractor',
      'dude-pack-technical-docs-planner',
      'dude-pack-technical-docs-drafter',
      'dude-pack-technical-docs-reviewer',
    ],
    agents: {
      'dude-pack-technical-docs-drafter': {
        modelClass: 'balanced', tools: ['read', 'edit'],
      },
      'dude-pack-technical-docs-extractor': {
        modelClass: 'fast', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-technical-docs-planner': {
        modelClass: 'balanced', tools: ['read', 'edit'],
      },
      'dude-pack-technical-docs-reviewer': {
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
      },
      'dude-pack-technical-docs-writer': {
        modelClass: 'reasoning',
        tools: ['read', 'edit', 'execute', 'search', 'agent'],
        roster: [
          'dude-pack-technical-docs-extractor',
          'dude-pack-technical-docs-planner',
          'dude-pack-technical-docs-drafter',
          'dude-pack-technical-docs-reviewer',
        ],
      },
    },
  },
  web: {
    manifestAgents: ['dude-pack-web-backend', 'dude-pack-web-frontend'],
    agents: {
      'dude-pack-web-backend': {
        modelClass: 'balanced', tools: ['read', 'edit', 'execute', 'search'],
      },
      'dude-pack-web-frontend': {
        modelClass: 'visual', tools: ['read', 'edit', 'execute', 'search'],
      },
    },
  },
  writing: { manifestAgents: [], agents: {} },
});

/** @param {string[]} lines @param {string} [body] */
function rawSource(lines, body = 'Prompt body.\n') {
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

/**
 * @param {{
 *   modelClass?: string,
 *   tools?: readonly string[],
 *   agents?: readonly string[],
 *   name?: string,
 *   description?: string,
 *   body?: string,
 *   userInvocable?: boolean,
 *   argumentHint?: string,
 * }} [options]
 */
function source(options = {}) {
  const lines = [
    `name: ${JSON.stringify(options.name ?? 'Testing Agent')}`,
    `description: ${JSON.stringify(options.description ?? 'Deterministic Copilot fixture')}`,
    `tools: [${(options.tools ?? DEFAULT_TOOLS).map((tool) => JSON.stringify(tool)).join(', ')}]`,
  ];
  if (options.agents !== undefined) {
    lines.push(`agents: [${options.agents.map((agent) => JSON.stringify(agent)).join(', ')}]`);
  }
  if (options.userInvocable !== undefined) lines.push(`user-invocable: ${options.userInvocable}`);
  if (options.argumentHint !== undefined) lines.push(`argument-hint: ${JSON.stringify(options.argumentHint)}`);
  lines.push(`model-class: ${options.modelClass ?? 'balanced'}`);
  return rawSource(lines, options.body);
}

/** @param {string | Buffer} bytes @param {string} [stem] @param {unknown} [config] */
function parse(bytes, stem = 'dude-tester', config = CONFIG) {
  return projection.parseAgentSource(bytes, { stem, config });
}

/** @param {string} stem @param {string} name @param {readonly string[] | undefined} [agents] */
function record(stem, name, agents) {
  return parse(source({ name, agents }), stem);
}

/** @param {() => unknown} action @param {RegExp} cause */
function assertAgentFailure(action, cause) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /^agent 'dude-tester' /);
    assert.match(error.message, cause);
    return true;
  });
}

/** @template T @param {(directory: string) => Promise<T>} action */
async function withTemporaryDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), 'dude-agent-projection-'));
  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** @param {string} text @param {string} pack */
function parseManifestMetadata(text, pack) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(block, `${pack} pack manifest has leading frontmatter`);
  const lines = block[1].split(/\r?\n/);
  const name = /^name: ([a-z][a-z0-9-]*)$/m.exec(block[1]);
  assert.ok(name, `${pack} pack manifest has a stable name`);
  const index = lines.indexOf('  agents:');
  if (index !== -1) {
    const agents = [];
    for (let current = index + 1; current < lines.length && lines[current].startsWith('    - '); current += 1) {
      agents.push(lines[current].slice('    - '.length));
    }
    return { name: name[1], agents };
  }
  const inline = lines.find((line) => /^  agents: \[.*\]$/.test(line));
  assert.ok(inline, `${pack} pack manifest declares provides.agents`);
  const values = inline.slice('  agents: ['.length, -1).trim();
  return {
    name: name[1],
    agents: values ? values.split(',').map((value) => value.trim()) : [],
  };
}

test('exports only the neutral parser, set validator, Copilot path, and Copilot renderer', () => {
  // Arrange
  const expected = ['copilotAgentPath', 'parseAgentSource', 'renderCopilotAgent', 'validateAgentSet'];

  // Act / Assert
  assert.deepEqual(Object.keys(projection).sort(), expected);
});

test('parses a leading canonical source block with comments and preserves its body byte-for-byte', () => {
  // Arrange
  const body = '# Prompt\n\nKeep these body bytes.\n';
  const input = rawSource([
    '# comments inside canonical frontmatter are allowed',
    'name: "Testing Agent"',
    'description: "Commented source fixture"',
    'tools: ["read", "workiq/*", "workiq2/*"]',
    'agents: ["dude-peer"]',
    'user-invocable: false',
    'argument-hint: "<request>"',
    'model-class: balanced',
  ], body);

  // Act
  const parsed = parse(Buffer.from(input, 'utf8'));

  // Assert
  assert.deepEqual(parsed.frontmatter, {
    name: 'Testing Agent',
    description: 'Commented source fixture',
    tools: ['read', 'workiq/*', 'workiq2/*'],
    agents: ['dude-peer'],
    'user-invocable': false,
    'argument-hint': '<request>',
    'model-class': 'balanced',
  });
  assert.equal(parsed.body, body);
});

test('preserves uniform CRLF source bytes and names malformed frontmatter delimiters', () => {
  // Arrange
  const crlf = [
    '---',
    'name: Agent',
    'description: Description',
    'tools: [read]',
    'model-class: fast',
    '---',
    'first body line',
    'second body line',
  ].join('\r\n');
  const bareCarriageReturn = '---\nname: Agent\r\ndescription: Description\ntools: [read]\nmodel-class: fast\n---\n';

  // Act
  const parsed = parse(crlf);

  // Assert
  assert.equal(parsed.body, 'first body line\r\nsecond body line');
  assertAgentFailure(() => parse(source().replace(/\n---\n/, '\n')), /closing delimiter/);
  assertAgentFailure(() => parse(bareCarriageReturn), /carriage return|mixed line endings/);
});

test('requires the caller-passed config when validating a source model class', async () => {
  // Arrange
  await withTemporaryDirectory(async (directory) => {
    const document = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const derivedModel = `${document.targets.copilot.models.fast}-fixture`;
    document.classes.fixture = { effort: 'low' };
    document.targets.copilot.models.fixture = derivedModel;
    const fixturePath = join(directory, 'agent-models.json');
    await writeFile(fixturePath, JSON.stringify(document), 'utf8');
    const fixtureConfig = loadAgentModelConfig(fixturePath);
    const input = source({ modelClass: 'fixture' });

    // Act / Assert
    assert.throws(() => parse(input), /unknown model class 'fixture'/);
    assert.doesNotThrow(() => parse(input, 'dude-tester', fixtureConfig));
    assert.deepEqual(resolveCopilotModel(fixtureConfig, 'fixture'), { model: derivedModel });
  });
});

test('rejects non-leading, concrete, obsolete, and speculative source fields with named diagnostics', () => {
  // Arrange
  const concrete = resolveCopilotModel(CONFIG, 'fast').model;
  assert.ok(concrete, 'fast has a concrete configured model for this rejection fixture');
  const cases = [
    ['prefix before delimiter', `# not frontmatter\n${source()}`, /opening delimiter/],
    ['concrete model', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', `model: ${concrete}`,
    ]), /must not declare concrete model/],
    ['concrete effort', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'effort: high',
    ]), /must not declare concrete effort/],
    ['concrete reasoning effort', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'reasoningEffort: high',
    ]), /must not declare concrete reasoningEffort/],
    ['obsolete composite declaration', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'composite: true',
    ]), /unsupported source frontmatter key composite/],
    ['speculative registry', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'registry: local',
    ]), /unsupported source frontmatter key registry/],
    ['speculative cycle setting', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'cycles: reject',
    ]), /unsupported source frontmatter key cycles/],
    ['obsolete source setting', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: fast', 'skills: [project]',
    ]), /unsupported source frontmatter key skills/],
    ['unknown class', rawSource([
      'name: Agent', 'description: Description', 'tools: [read]', 'model-class: absent-class',
    ]), /unknown model class 'absent-class'/],
  ];

  // Act / Assert
  for (const [label, input, expected] of cases) {
    assertAgentFailure(() => parse(input), /** @type {RegExp} */ (expected));
    assert.ok(label);
  }
});

test('accepts exactly the current Copilot selectors and rejects unmappable selectors by name', () => {
  // Arrange
  const invalidSelectors = ['search/codebase', 'read/readFile', 'workiq/query', 'workiq2/query', 'network'];

  // Act / Assert
  assert.doesNotThrow(() => parse(source({ tools: COPILOT_TOOLS })));
  for (const selector of invalidSelectors) {
    assertAgentFailure(
      () => parse(source({ tools: [selector] })),
      new RegExp(`tool selector '${selector.replace('*', '\\*')}' is unsupported for Copilot`),
    );
  }
});

test('renders deterministic Copilot profiles with only the supported fields and resolved model', () => {
  // Arrange
  const body = '# Prompt\n\nPreserve this body.\n';
  const classes = Object.keys(/** @type {Record<string, unknown>} */ (CONFIG.classes));

  // Act / Assert
  for (const modelClass of classes) {
    const parsed = parse(source({
      modelClass,
      tools: COPILOT_TOOLS,
      agents: ['dude-peer'],
      userInvocable: false,
      argumentHint: '<request>',
      body,
    }));
    const first = projection.renderCopilotAgent(parsed, CONFIG);
    const second = projection.renderCopilotAgent(parsed, CONFIG);
    const model = resolveCopilotModel(CONFIG, modelClass).model;
    const expected = [
      '---',
      `name: ${JSON.stringify('Testing Agent')}`,
      `description: ${JSON.stringify('Deterministic Copilot fixture')}`,
      `tools: [${COPILOT_TOOLS.map((tool) => JSON.stringify(tool)).join(', ')}]`,
      `agents: [${JSON.stringify('dude-peer')}]`,
      'user-invocable: false',
      `argument-hint: ${JSON.stringify('<request>')}`,
      ...(model ? [`model: ${model}`] : []),
      '---',
      body,
    ].join('\n');

    // Assert
    assert.ok(first.equals(second), `${modelClass} render is byte-stable`);
    assert.equal(first.toString('utf8'), expected, `${modelClass} render has exact Copilot fields`);
    assert.equal(first.toString('utf8').endsWith(body), true, `${modelClass} preserves its body`);
    assert.doesNotMatch(first.toString('utf8'), /^model-class:/m);
    assert.doesNotMatch(first.toString('utf8'), /^(?:effort|reasoningEffort):/m);
    if (model) assert.match(first.toString('utf8'), new RegExp(`^model: ${model}$`, 'm'));
    else assert.doesNotMatch(first.toString('utf8'), /^model:/m);
  }
});

test('returns exactly one stable Copilot destination path', () => {
  // Arrange / Act / Assert
  assert.equal(projection.copilotAgentPath('dude-tester'), '.github/agents/dude-tester.agent.md');
  for (const stem of ['', 'Dude', 'dude_tester', '../dude', 'dude/test']) {
    assert.throws(() => projection.copilotAgentPath(stem), /has an invalid stem/);
  }
});

test('validates leaves, identities, rosters, and the Dude-only unmixed wildcard', () => {
  // Arrange
  const leaf = record('dude-leaf', 'Leaf');
  const peer = record('dude-peer', 'Peer');
  const coordinator = record('dude', 'Coordinator', ['*']);

  // Act / Assert
  assert.equal(Object.hasOwn(leaf.frontmatter, 'agents'), false, 'omitted agents declares a leaf');
  assert.doesNotThrow(() => projection.validateAgentSet([leaf, peer]));
  assert.doesNotThrow(() => projection.validateAgentSet([coordinator, leaf]));
  assert.doesNotThrow(() => projection.validateAgentSet([
    record('dude-parent', 'Parent', ['dude-child']),
    record('dude-child', 'Child'),
  ]));
  assert.doesNotThrow(() => projection.validateAgentSet([
    record('dude-a', 'A', ['dude-b']),
    record('dude-b', 'B', ['dude-a']),
  ]), 'direct roster resolution does not introduce a cycle framework');

  assert.throws(
    () => projection.validateAgentSet([leaf, { ...leaf }]),
    /agent 'dude-leaf' duplicates source stem 'dude-leaf'/,
  );
  assert.throws(
    () => projection.validateAgentSet([leaf, record('dude-second', 'Leaf')]),
    /agent 'dude-second' duplicates display name 'Leaf'/,
  );
  assert.throws(
    () => projection.validateAgentSet([{ ...leaf, frontmatter: { ...leaf.frontmatter, agents: [] } }]),
    /agent 'dude-leaf' has a malformed or empty delegation roster/,
  );
  assert.throws(
    () => projection.validateAgentSet([{ ...leaf, frontmatter: { ...leaf.frontmatter, agents: ['dude-peer', 'dude-peer'] } }, peer]),
    /agent 'dude-leaf' has duplicate delegation roster entries/,
  );
  assert.throws(
    () => projection.validateAgentSet([{ ...leaf, frontmatter: { ...leaf.frontmatter, agents: ['Leaf'] } }]),
    /agent 'dude-leaf' delegation target 'Leaf' must be a stable stem, not a display name/,
  );
  assert.throws(
    () => projection.validateAgentSet([{ ...leaf, frontmatter: { ...leaf.frontmatter, agents: ['dude-leaf'] } }]),
    /agent 'dude-leaf' must not delegate to itself 'dude-leaf'/,
  );
  assert.throws(
    () => projection.validateAgentSet([{ ...leaf, frontmatter: { ...leaf.frontmatter, agents: ['dude-missing'] } }]),
    /agent 'dude-leaf' delegates to unknown stem 'dude-missing'/,
  );
  assert.throws(
    () => projection.validateAgentSet([record('dude-other', 'Other', ['*'])]),
    /agent 'dude-other' only coordinator stem dude may delegate to \*/,
  );
  assert.throws(
    () => projection.validateAgentSet([record('dude', 'Coordinator', ['*', 'dude-leaf']), leaf]),
    /agent 'dude' must not mix wildcard delegation with explicit stems/,
  );
  assertAgentFailure(() => parse(source({ agents: [] })), /agents must not be empty when declared/);
});

test('preserves the T005 catalog manifests, source metadata, and local delegation rosters', async () => {
  // Arrange
  const packEntries = (await readdir(PACKS_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  let sourceCount = 0;

  // Act / Assert
  assert.deepEqual(packEntries.map((entry) => entry.name), Object.keys(PACK_CATALOG));
  for (const entry of packEntries) {
    const pack = entry.name;
    const expected = PACK_CATALOG[/** @type {keyof typeof PACK_CATALOG} */ (pack)];
    const packDirectory = join(PACKS_DIRECTORY, pack);
    const manifest = await readFile(join(packDirectory, 'pack.md'), 'utf8');
    const metadata = parseManifestMetadata(manifest, pack);
    assert.equal(metadata.name, pack, `${pack} manifest name`);
    assert.deepEqual(metadata.agents, expected.manifestAgents, `${pack} manifest agent metadata`);

    let sourceEntries = [];
    try {
      sourceEntries = await readdir(join(packDirectory, 'agents'), { withFileTypes: true });
    } catch (error) {
      if (!(error && typeof error === 'object' && error.code === 'ENOENT')) throw error;
    }
    assert.ok(
      sourceEntries.every((agent) => agent.isFile() && agent.name.endsWith('.agent.md')),
      `${pack} agent directory contains only canonical agent source files`,
    );
    sourceEntries.sort((left, right) => left.name.localeCompare(right.name));
    const stems = sourceEntries.map((agent) => agent.name.slice(0, -'.agent.md'.length));
    assert.deepEqual(stems, Object.keys(expected.agents).sort(), `${pack} source roster`);

    const records = [];
    for (const agent of sourceEntries) {
      const stem = agent.name.slice(0, -'.agent.md'.length);
      const bytes = await readFile(join(packDirectory, 'agents', agent.name));
      const raw = bytes.toString('utf8');
      const parsed = parse(bytes, stem);
      const specification = expected.agents[/** @type {keyof typeof expected.agents} */ (stem)];
      records.push(parsed);
      sourceCount += 1;

      assert.equal(parsed.frontmatter['model-class'], specification.modelClass, `${stem} class`);
      assert.equal(parsed.frontmatter['user-invocable'], false, `${stem} remains specialist-only`);
      assert.deepEqual(parsed.frontmatter.tools, specification.tools, `${stem} canonical selectors`);
      if (specification.roster === undefined) {
        assert.equal(Object.hasOwn(parsed.frontmatter, 'agents'), false, `${stem} is a leaf`);
      } else {
        assert.deepEqual(parsed.frontmatter.agents, specification.roster, `${stem} roster`);
      }
      assert.doesNotMatch(raw, /^(?:model|effort|reasoningEffort|mcp|skills|disable-model-invocation):/m);
    }
    assert.doesNotThrow(() => projection.validateAgentSet(records), `${pack} local source set`);
  }
  assert.equal(sourceCount, 29, 'the complete catalog retains its 29 authoritative pack sources');
});

test('keeps the Technical Docs Writer roster exact and retains its agent selector', async () => {
  // Arrange
  const sourcePath = join(
    PACKS_DIRECTORY,
    'technical-docs',
    'agents',
    'dude-pack-technical-docs-writer.agent.md',
  );
  const bytes = await readFile(sourcePath);

  // Act
  const parsed = parse(bytes, 'dude-pack-technical-docs-writer');

  // Assert
  assert.deepEqual(parsed.frontmatter.agents, [
    'dude-pack-technical-docs-extractor',
    'dude-pack-technical-docs-planner',
    'dude-pack-technical-docs-drafter',
    'dude-pack-technical-docs-reviewer',
  ]);
  assert.ok(parsed.frontmatter.tools.includes('agent'));
  assert.ok(parsed.body.length > 0, 'the source body remains present');
});

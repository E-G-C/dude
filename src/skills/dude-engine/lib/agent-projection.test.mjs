// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentModelConfig, resolveCopilotModel } from './agent-model-map.mjs';
import { listProvide } from './pack-manifest.mjs';
import * as projection from './agent-projection.mjs';

const CONFIG_PATH = fileURLToPath(new URL('../../../config/agent-models.json', import.meta.url));
const PACKS_DIRECTORY = fileURLToPath(new URL('../../../../library/packs/', import.meta.url));
const CORE_AGENTS_DIRECTORY = fileURLToPath(new URL('../../../agents/', import.meta.url));
const GENERATED_AGENTS_DIRECTORY = fileURLToPath(new URL('../../../../.github/agents/', import.meta.url));
const CONFIG = loadAgentModelConfig(CONFIG_PATH);
const COPILOT_TOOLS = Object.freeze([
  'read', 'edit', 'search', 'execute', 'todo', 'agent', 'dude_needs_you', 'workiq/*', 'workiq2/*',
]);
const DEFAULT_TOOLS = Object.freeze(['read', 'edit', 'search', 'execute', 'todo', 'agent']);
const CODING_AGENT_APPLY_TO = '.github/agents/dude-pack-coding-*.agent.md';
const CODING_STANDARDS_PATH =
  '.github/instructions/dude-pack-coding-engineering-standards.instructions.md';
const CODING_STANDARDS_ID = 'dude-pack-coding-engineering-standards';
const CODING_HOST_CONTROLS_ID = 'dude-pack-coding-host-controls';
const CODING_PROFILES = Object.freeze([
  {
    role: 'Architect',
    stem: 'dude-pack-coding-architect',
    displayName: 'Architect',
    modelClass: 'reasoning',
    tools: ['read', 'edit', 'search'],
  },
  {
    role: 'Engineer',
    stem: 'dude-pack-coding-coder',
    displayName: 'Coder',
    modelClass: 'coding',
    tools: ['read', 'edit', 'execute', 'search'],
  },
  {
    role: 'Tester',
    stem: 'dude-pack-coding-tester',
    displayName: 'Tester',
    modelClass: 'balanced',
    tools: ['read', 'edit', 'execute', 'search'],
  },
  {
    role: 'Reviewer',
    stem: 'dude-pack-coding-reviewer',
    displayName: 'Code Reviewer',
    modelClass: 'reasoning',
    tools: ['read', 'search'],
  },
]);
const CANONICAL_COORDINATOR_PARAGRAPH = [
  '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in',
  '`tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or',
  '`status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.',
].join(' ');

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
  clearline: {
    manifestAgents: ['dude-pack-clearline-stylist'],
    agents: {
      'dude-pack-clearline-stylist': {
        modelClass: 'visual', tools: ['read', 'edit', 'search', 'todo'],
      },
    },
  },
  coding: {
    manifestAgents: [
      'dude-pack-coding-architect',
      'dude-pack-coding-coder',
      'dude-pack-coding-reviewer',
      'dude-pack-coding-tester',
    ],
    agents: {
      'dude-pack-coding-architect': {
        modelClass: 'reasoning', tools: ['read', 'edit', 'search'],
      },
      'dude-pack-coding-coder': {
        modelClass: 'coding', tools: ['read', 'edit', 'execute', 'search'],
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
        modelClass: 'reasoning', tools: ['read', 'search'],
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
        modelClass: 'balanced',
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
  'rubber-duck': {
    manifestAgents: ['dude-pack-rubber-duck-retrospective'],
    agents: {
      'dude-pack-rubber-duck-retrospective': {
        modelClass: 'reasoning', tools: ['read', 'search'],
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
        modelClass: 'balanced', tools: ['read', 'search', 'edit'],
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

/** @param {string} markdown @param {string} heading @param {string} artifact */
function secondLevelSection(markdown, heading, artifact) {
  const lines = markdown.split(/\r?\n/);
  const marker = `## ${heading}`;
  const starts = lines
    .map((line, index) => (line === marker ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(starts.length, 1, `${artifact} has exactly one ${marker} section`);
  const start = starts[0];
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, next === -1 ? lines.length : next).join('\n').trim();
}

/** @param {string} text @param {string} literal */
function countLiteral(text, literal) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(literal, offset)) !== -1) {
    count += 1;
    offset += literal.length;
  }
  return count;
}

/** @param {string} rendered @param {string} stem */
function renderedMetadata(rendered, stem) {
  const closing = rendered.indexOf('\n---\n', 4);
  assert.notEqual(closing, -1, `${stem} rendered profile closes its frontmatter`);
  return rendered.slice(0, closing + 4);
}

/** @param {string} markdown */
function parseCodingRoleRows(markdown) {
  const section = secondLevelSection(markdown, 'Agent selection', CODING_STANDARDS_ID);
  const lines = section.split(/\r?\n/);
  const header = lines.indexOf('| Role | Canonical agent | Display name |');
  assert.notEqual(header, -1, `${CODING_STANDARDS_ID} has the canonical role table`);
  assert.equal(lines[header + 1], '| --- | --- | --- |');

  const rows = [];
  for (let index = header + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const match = /^\| ([^|]+?) \| `([a-z][a-z0-9-]*)` \| ([^|]+?) \|$/.exec(lines[index]);
    assert.ok(match, `${CODING_STANDARDS_ID} has a canonical role row`);
    rows.push({ role: match[1], stem: match[2], displayName: match[3] });
  }
  return rows;
}

/** @param {string} text @param {string} artifact */
function leadingFrontmatterLines(text, artifact) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(block, `${artifact} has leading frontmatter`);
  return block[1].split(/\r?\n/);
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

test('projects the coordinator-only Needs You grant while Spec Lead keeps its existing scope', async () => {
  // Arrange
  const cases = [
    {
      stem: 'dude',
      expectedTools: ['read', 'edit', 'search', 'execute', 'todo', 'agent', 'dude_needs_you'],
    },
    {
      stem: 'dude-spec-lead',
      expectedTools: ['read', 'edit', 'search'],
    },
  ];

  // Act + Assert
  for (const { stem, expectedTools } of cases) {
    const sourceBytes = await readFile(join(CORE_AGENTS_DIRECTORY, `${stem}.agent.md`));
    const parsed = parse(sourceBytes, stem);
    const rendered = projection.renderCopilotAgent(parsed, CONFIG);
    const generated = await readFile(join(GENERATED_AGENTS_DIRECTORY, `${stem}.agent.md`), 'utf8');

    assert.deepEqual(parsed.frontmatter.tools, expectedTools, `${stem} source selectors`);
    assert.equal(
      generated,
      rendered.toString('utf8'),
      `${stem} generated profile is the current source projection`,
    );
    assert.equal(
      generated.split('\n').includes(
        `tools: [${expectedTools.map((tool) => JSON.stringify(tool)).join(', ')}]`,
      ),
      true,
      `${stem} generated selector roster`,
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
  assert.equal(sourceCount, 31, 'the complete catalog retains its 31 authoritative pack sources');
});

test('keeps coding roles on stable leaf identities and canonical Copilot projections', async () => {
  // Arrange
  const codingDirectory = join(PACKS_DIRECTORY, 'coding');
  const expectedFiles = CODING_PROFILES
    .map(({ stem }) => `${stem}.agent.md`)
    .sort();
  const sourceEntries = await readdir(join(codingDirectory, 'agents'), { withFileTypes: true });
  const sourceBytes = await Promise.all(CODING_PROFILES.map(async (expected) => ({
    expected,
    bytes: await readFile(join(codingDirectory, 'agents', `${expected.stem}.agent.md`)),
  })));
  const standards = await readFile(
    join(codingDirectory, 'instructions', `${CODING_STANDARDS_ID}.instructions.md`),
    'utf8',
  );

  // Act
  const profiles = sourceBytes.map(({ expected, bytes }) => {
    const parsed = parse(bytes, expected.stem);
    const rendered = projection.renderCopilotAgent(parsed, CONFIG).toString('utf8');
    return { expected, parsed, metadata: renderedMetadata(rendered, expected.stem) };
  });
  const roleRows = parseCodingRoleRows(standards);
  const profilesByStem = new Map(profiles.map((profile) => [profile.expected.stem, profile]));

  // Assert
  assert.equal(
    sourceEntries.every((entry) => entry.isFile() && entry.name.endsWith('.agent.md')),
    true,
    'coding agent sources use only canonical files',
  );
  assert.deepEqual(sourceEntries.map((entry) => entry.name).sort(), expectedFiles);
  assert.doesNotThrow(
    () => projection.validateAgentSet(profiles.map(({ parsed }) => parsed)),
    'coding roles resolve to unique source stems and display names',
  );
  assert.deepEqual(
    roleRows,
    CODING_PROFILES.map(({ role, stem, displayName }) => ({ role, stem, displayName })),
  );
  assert.equal(new Set(roleRows.map(({ role }) => role)).size, CODING_PROFILES.length);
  assert.equal(new Set(roleRows.map(({ stem }) => stem)).size, CODING_PROFILES.length);
  assert.equal(new Set(roleRows.map(({ displayName }) => displayName)).size, CODING_PROFILES.length);

  for (const { expected, parsed, metadata } of profiles) {
    const model = resolveCopilotModel(CONFIG, expected.modelClass).model;
    const expectedMetadata = [
      '---',
      `name: ${JSON.stringify(expected.displayName)}`,
      `description: ${JSON.stringify(parsed.frontmatter.description)}`,
      `tools: [${expected.tools.map((tool) => JSON.stringify(tool)).join(', ')}]`,
      'user-invocable: false',
      ...(model ? [`model: ${model}`] : []),
      '---',
    ].join('\n');

    assert.equal(parsed.frontmatter.name, expected.displayName, `${expected.stem} display name`);
    assert.equal(parsed.frontmatter['model-class'], expected.modelClass, `${expected.stem} class`);
    assert.equal(parsed.frontmatter['user-invocable'], false, `${expected.stem} visibility`);
    assert.deepEqual(parsed.frontmatter.tools, expected.tools, `${expected.stem} tool boundary`);
    assert.equal(Object.hasOwn(parsed.frontmatter, 'agents'), false, `${expected.stem} is a leaf`);
    assert.equal(
      /** @type {string[]} */ (parsed.frontmatter.tools).includes('agent'),
      false,
      `${expected.stem} has no agent tool`,
    );
    assert.equal(
      projection.copilotAgentPath(expected.stem),
      `.github/agents/${expected.stem}.agent.md`,
      `${expected.stem} generated path`,
    );
    assert.equal(metadata, expectedMetadata, `${expected.stem} generated metadata`);
  }

  for (const { stem, displayName } of roleRows) {
    assert.equal(
      profilesByStem.get(stem)?.parsed.frontmatter.name,
      displayName,
      `${stem} role resolves to its source profile`,
    );
  }
});

test('keeps coding profile scope, shared-standard loading, and coordinator ownership canonical', async () => {
  // Arrange
  const codingAgentsDirectory = join(PACKS_DIRECTORY, 'coding', 'agents');
  const standardsReference = `\`${CODING_STANDARDS_PATH}\``;
  const sources = await Promise.all(CODING_PROFILES.map(async ({ stem }) => ({
    stem,
    bytes: await readFile(join(codingAgentsDirectory, `${stem}.agent.md`)),
  })));

  // Act
  const structures = sources.map(({ stem, bytes }) => {
    const parsed = parse(bytes, stem);
    const coordinatorParagraphs = parsed.body
      .split(/\r?\n[ \t]*\r?\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.startsWith('**Coordinator-only artifacts:**'));
    return {
      stem,
      body: parsed.body,
      scope: secondLevelSection(parsed.body, 'Scope', stem),
      sharedStandards: secondLevelSection(parsed.body, 'Required shared standards', stem),
      coordinatorParagraphs,
    };
  });

  // Assert
  for (const { stem, body, scope, sharedStandards, coordinatorParagraphs } of structures) {
    assert.notEqual(scope, '', `${stem} has a nonempty Scope section`);
    assert.deepEqual(
      coordinatorParagraphs,
      [CANONICAL_COORDINATOR_PARAGRAPH],
      `${stem} has exactly one canonical coordinator paragraph`,
    );
    assert.equal(countLiteral(body, standardsReference), 1, `${stem} has one exact standards path`);
    assert.equal(
      sharedStandards.startsWith(`Before substantive work, read ${standardsReference} `),
      true,
      `${stem} explicitly reads the shared standards`,
    );
  }
});

test('keeps coding shared instructions manifested, colocated, and narrowly applied', async () => {
  // Arrange
  const codingDirectory = join(PACKS_DIRECTORY, 'coding');
  const instructionIds = [CODING_STANDARDS_ID, CODING_HOST_CONTROLS_ID];
  const expectedInstructionFiles = instructionIds.map((id) => `${id}.instructions.md`);
  const manifest = await readFile(join(codingDirectory, 'pack.md'), 'utf8');
  const instructionEntries = await readdir(join(codingDirectory, 'instructions'), {
    withFileTypes: true,
  });
  const instructionSources = await Promise.all(expectedInstructionFiles.map(async (filename) => ({
    filename,
    text: await readFile(join(codingDirectory, 'instructions', filename), 'utf8'),
  })));
  const specArtifactSkill = await readFile(
    join(codingDirectory, 'skills', 'dude-pack-coding-spec-artifacts', 'SKILL.md'),
    'utf8',
  );

  // Act
  const provides = {
    agents: listProvide(manifest, 'agents'),
    instructions: listProvide(manifest, 'instructions'),
    skills: listProvide(manifest, 'skills'),
  };
  const instructionMetadata = instructionSources.map(({ filename, text }) => ({
    filename,
    applyTo: leadingFrontmatterLines(text, filename)
      .filter((line) => line.startsWith('applyTo: ')),
  }));
  const standards = instructionSources.find(
    ({ filename }) => filename === `${CODING_STANDARDS_ID}.instructions.md`,
  )?.text;
  const hostControlsLink =
    `[host control requirements](${CODING_HOST_CONTROLS_ID}.instructions.md)`;

  // Assert
  assert.deepEqual(
    provides.agents,
    CODING_PROFILES.map(({ stem }) => stem).sort(),
    'manifest provides the exact coding profile roster',
  );
  assert.deepEqual(provides.instructions, instructionIds);
  assert.deepEqual(provides.skills, ['dude-pack-coding-spec-artifacts']);
  assert.equal(specArtifactSkill.trim().length > 0, true, 'the existing spec-artifacts skill remains');
  assert.equal(instructionEntries.every((entry) => entry.isFile()), true);
  assert.deepEqual(instructionEntries.map((entry) => entry.name).sort(), expectedInstructionFiles);
  for (const { filename, applyTo } of instructionMetadata) {
    assert.deepEqual(
      applyTo,
      [`applyTo: ${JSON.stringify(CODING_AGENT_APPLY_TO)}`],
      `${filename} has one narrow coding-profile scope`,
    );
  }
  assert.equal(typeof standards, 'string', 'the standards instruction is present');
  assert.equal(
    countLiteral(/** @type {string} */ (standards), hostControlsLink),
    1,
    'the standards instruction has one exact colocated host-controls link',
  );
  assert.equal(
    /** @type {string} */ (standards).includes(
      `Read the colocated ${hostControlsLink} unless already in context;`,
    ),
    true,
    'the standards instruction explicitly loads host controls',
  );
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

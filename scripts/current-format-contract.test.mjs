// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const ACTIVE_SOURCE_FILES = [
  'src/agents/dude-spec-lead.agent.md',
  'src/agents/dude.agent.md',
  'src/instructions/dude.instructions.md',
  'src/skills/dude-bundle-import/import.mjs',
  'src/skills/dude-feature-definition/SKILL.md',
  'src/skills/dude-generic-routing/SKILL.md',
  'src/skills/dude-lightweight-execution/SKILL.md',
  'src/skills/dude-lightweight-execution/board.mjs',
  'src/skills/dude-lint/SKILL.md',
  'src/skills/dude-lint/lint.mjs',
  'src/skills/dude-memory-ledger/SKILL.md',
  'src/skills/dude-memory-ledger/memory.mjs',
  'src/skills/dude-portability/SKILL.md',
  'src/skills/dude-skill-authoring/scaffold-skill.mjs',
  'src/skills/dude-team-expansion/scaffold-agent.mjs',
  'src/skills/dude-work-intake/SKILL.md',
  'src/skills/dude-work/SKILL.md',
];

const CURRENT_WRITERS = [
  'src/skills/dude-bundle-import/import.mjs',
  'src/skills/dude-lightweight-execution/board.mjs',
  'src/skills/dude-memory-ledger/memory.mjs',
  'src/skills/dude-skill-authoring/scaffold-skill.mjs',
  'src/skills/dude-team-expansion/scaffold-agent.mjs',
];

const RETIRED_EXACT_TOKENS = [
  '@dude draft',
  '@dude migrate layout',
  'dude-workspace-migration',
  'schema-v0',
  'reconcile-profile',
  'assertCanonicalMutationLayout',
  '.dude/brief',
  '.github/dudestuff',
];

const PROJECT_SKILL = '.github/skills/project/SKILL.md';

const PRIVATE_PROJECT_MEMORY = [
  '.dude/memory/guardrails.md',
  '.dude/memory/context.md',
  '.dude/memory/decisions.md',
  '.dude/memory/lessons.md',
];

const PROJECT_STANDING_GUIDANCE = [PROJECT_SKILL, ...PRIVATE_PROJECT_MEMORY];

const CURRENT_ONLY_DECISIONS_HEADING = '### Current-Only Supersessions';

const T008_PROMPT_SOURCES = [
  'src/agents/dude.agent.md',
  'src/agents/dude-spec-lead.agent.md',
  'src/agents/dude-reviewer.agent.md',
  'src/instructions/dude.instructions.md',
  'src/skills/dude-generic-routing/SKILL.md',
  'src/skills/dude-work-intake/SKILL.md',
  'src/skills/dude-feature-definition/SKILL.md',
  'src/skills/dude-lightweight-execution/SKILL.md',
  'src/skills/dude-work/SKILL.md',
  'src/skills/dude-parallel-dispatch/SKILL.md',
  'src/skills/dude-verification-before-completion/SKILL.md',
  'src/skills/dude-reviewer-protocol/SKILL.md',
  'src/skills/dude-receiving-code-review/SKILL.md',
];

const RECOVERY_POLICY_OWNER = 'src/skills/dude-work/SKILL.md';

const RECOVERY_POLICY_CONSUMERS = [
  'library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md',
  'src/agents/dude-spec-lead.agent.md',
  'src/agents/dude.agent.md',
  'src/instructions/dude.instructions.md',
  'src/skills/dude-feature-definition/SKILL.md',
  'src/skills/dude-learning-promotion/SKILL.md',
  'src/skills/dude-lightweight-execution/SKILL.md',
  'src/skills/dude-memory-ledger/SKILL.md',
  'src/skills/dude-skill-authoring/SKILL.md',
];

const RECOVERY_PROMPT_PROXY_SELECTORS = [
  {
    source: 'src/agents/dude.agent.md',
    line: /^The sole definition-write exception is Work-authorized unchanged-intent derived-artifact repair/,
  },
  {
    source: 'src/agents/dude-spec-lead.agent.md',
    line: /^- The sole exception is Work-authorized unchanged-intent derived-definition repair/,
  },
  {
    source: 'src/instructions/dude.instructions.md',
    line: /^Load detailed procedures only when their mode applies:/,
  },
];

const RECOVERY_DOC_SECTIONS = [
  ['docs/commands.md', '### `@dude work`'],
  ['docs/reference.md', '## Execution Workflow'],
  ['docs/workflow.md', '### Optional Continuous Work'],
];

const STALE_RECOVERY_PHRASES = [
  ['bounded target-unique fan-out', /\bbounded target-unique fan-out\b/i],
  ['simultaneous independently dispatchable targets', /\bsimultaneous independently dispatchable targets\b/i],
  ['recovery parallel capacity above one', /\brecovery[^\n]{0,48}(?:parallel[^\n]{0,24})?capacity[^\n]{0,24}(?:>|above|greater than|[2-9])/i],
  ['model-declared write-set dispatchability', /\bmodel[- ]declared[^\n]{0,32}write[- ]set[^\n]{0,32}dispatch/i],
];

const RETIRED_ACTIVE_GUIDANCE_PATTERNS = [
  /@dude draft\b/,
  /@dude migrate layout\b/,
  /\breconcile-profile\b/,
  /\bschema-v0\b/,
];

/** @param {string} relative */
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** @param {string} source @param {string} anchor */
function fencedBlockContaining(source, anchor) {
  const blocks = source.match(/```[^\n]*\n[\s\S]*?\n```/g) ?? [];
  const matches = blocks.filter((block) => block.includes(anchor));
  assert.equal(matches.length, 1, `exactly one fenced block contains ${JSON.stringify(anchor)}`);
  return matches[0];
}

/** @param {string} needle @param {string[]} files */
function filesContaining(needle, files = ACTIVE_SOURCE_FILES) {
  return files.filter((relative) => read(relative).includes(needle));
}

/** @param {string} relative @param {RegExp[]} patterns */
function assertMatchesAll(relative, patterns) {
  const content = read(relative);
  for (const pattern of patterns) assert.match(content, pattern, `${relative}: ${pattern}`);
}

/** @param {string} source */
function visibleMarkdown(source) {
  const lines = source.split('\n');
  const visible = [];
  let frontmatter = lines[0] === '---';
  let fence = null;
  let htmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (frontmatter) {
      if (index > 0 && line === '---') frontmatter = false;
      visible.push('');
      continue;
    }

    let remainder = line;
    let uncommented = '';
    while (remainder.length > 0) {
      if (htmlComment) {
        const end = remainder.indexOf('-->');
        if (end === -1) {
          remainder = '';
          continue;
        }
        htmlComment = false;
        remainder = remainder.slice(end + 3);
        continue;
      }
      const start = remainder.indexOf('<!--');
      if (start === -1) {
        uncommented += remainder;
        remainder = '';
        continue;
      }
      uncommented += remainder.slice(0, start);
      htmlComment = true;
      remainder = remainder.slice(start + 4);
    }

    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(uncommented);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      visible.push('');
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      visible.push('');
      continue;
    }
    visible.push(uncommented);
  }

  return visible.join('\n');
}

/** @param {string} source @param {string} heading */
function markdownSection(source, heading) {
  const lines = visibleMarkdown(source).split('\n');
  const target = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(heading);
  assert.ok(target, `invalid Markdown heading ${JSON.stringify(heading)}`);
  const targetLevel = target[1].length;
  const starts = lines
    .map((line, index) => (line.trim() === heading ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(starts.length, 1, `${heading}: expected one visible exact heading`);

  const start = starts[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = /^ {0,3}(#{1,6})[ \t]+/.exec(lines[index]);
    if (next && next[1].length <= targetLevel) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

/** @param {string} relative @param {string} heading @param {RegExp[]} patterns */
function assertSectionMatchesAll(relative, heading, patterns) {
  const content = markdownSection(read(relative), heading);
  for (const pattern of patterns) {
    assert.match(content, pattern, `${relative} ${heading}: ${pattern}`);
  }
}

/** @param {string} relative @param {string} heading @param {string[]} needles */
function assertSectionIncludesAll(relative, heading, needles) {
  const content = markdownSection(read(relative), heading);
  for (const needle of needles) {
    assert.ok(content.includes(needle), `${relative} ${heading}: ${JSON.stringify(needle)}`);
  }
}

/** @param {string} section @param {Array<[string, RegExp[] | RegExp[][]]>} requirements */
function missingParagraphRequirements(section, requirements) {
  const paragraphs = section.split(/\n\s*\n/);
  return requirements
    .filter(([, signalsOrClauses]) => {
      const clauses = signalsOrClauses[0] instanceof RegExp ? [signalsOrClauses] : signalsOrClauses;
      return !clauses.every((signals) => paragraphs.some((paragraph) => (
        signals.every((pattern) => pattern.test(paragraph))
      )));
    })
    .map(([label]) => label);
}

/** @param {string} section */
function staleRecoveryPhrases(section) {
  return STALE_RECOVERY_PHRASES
    .filter(([, pattern]) => pattern.test(section))
    .map(([label]) => `stale recovery phrase: ${label}`);
}

/** @param {string} relative @param {string} heading @param {string} ruleLine */
function assertSectionRuleRejectsMutations(relative, heading, ruleLine) {
  const source = read(relative);
  const matchingLines = markdownSection(source, heading)
    .split('\n')
    .filter((line) => line === ruleLine);
  assert.equal(matchingLines.length, 1, `${relative} ${heading}: one exact mutation target`);
  assert.equal(source.split(ruleLine).length - 1, 1, `${relative}: mutation target is globally unique`);
  const headingLevel = /^(#{1,6}) /.exec(heading)?.[1];
  assert.ok(headingLevel, `${heading}: heading level`);

  const mutations = new Map([
    ['deleted', source.replace(ruleLine, '')],
    ['moved into a fenced block', source.replace(ruleLine, `\`\`\`text\n${ruleLine}\n\`\`\``)],
    ['moved into an HTML comment', source.replace(ruleLine, `<!--\n${ruleLine}\n-->`)],
    [
      'moved into an irrelevant section',
      `${source.replace(ruleLine, '')}\n\n${headingLevel} Mutation Holding Area\n\n${ruleLine}\n`,
    ],
  ]);

  for (const [label, mutated] of mutations) {
    assert.throws(
      () => assert.ok(markdownSection(mutated, heading).includes(ruleLine)),
      `${relative} ${heading}: ${label}`,
    );
  }
}

/** @param {{id: string, parallel: boolean, dependencies: string[], blockers: string[], writes: string[] | null, sharedState?: boolean}} left @param {{id: string, parallel: boolean, dependencies: string[], blockers: string[], writes: string[] | null, sharedState?: boolean}} right */
function canDispatchTogether(left, right) {
  if (!left.parallel || !right.parallel) return false;
  if (left.dependencies.includes(right.id) || right.dependencies.includes(left.id)) return false;
  if (left.blockers.includes(right.id) || right.blockers.includes(left.id)) return false;
  if (left.writes === null || right.writes === null) return false;
  if (left.sharedState || right.sharedState) return false;
  return left.writes.every((file) => !right.writes.includes(file));
}

/** @param {{trackedIssues: number, lightweightChoice?: boolean, taskStates?: string[], kind?: 'draft' | 'defined', candidates?: number, unclearChoice?: boolean}} fixture */
function classifyStatusFixture(fixture) {
  if (fixture.trackedIssues > 0) return { lane: 'Tracked Execution' };
  const taskStates = fixture.taskStates ?? [];
  if (fixture.lightweightChoice || taskStates.some((state) => ['~', '!', 'x'].includes(state))) {
    const counts = Object.fromEntries([' ', '~', '!', 'x'].map((state) => [
      state,
      taskStates.filter((candidate) => candidate === state).length,
    ]));
    return { lane: 'Lightweight Execution', counts };
  }
  if ((fixture.candidates ?? 1) > 1 || fixture.unclearChoice) return { lane: 'ambiguous' };
  if (fixture.kind === 'draft') return { lane: 'Definition Only', live: 'idea' };
  return { lane: 'Definition Only', live: 'package' };
}

/** @param {{feature: string | null, file: string, kind: string, afterAnchor: boolean}[]} events @param {string} [namedFeature] */
function collectDiffFixture(events, namedFeature) {
  const selected = events.filter((event) => (
    event.afterAnchor
    && (namedFeature === undefined || event.feature === namedFeature)
  ));
  return selected.reduce((grouped, event) => {
    grouped[event.file] ??= [];
    grouped[event.file].push(event.kind);
    return grouped;
  }, {});
}

function installedAgentRoster() {
  const agentsDirectory = path.join(ROOT, '.github/agents');
  return fs.readdirSync(agentsDirectory, { withFileTypes: true })
    .filter((entry) => (
      entry.isFile()
      && entry.name.endsWith('.agent.md')
      && entry.name !== 'dude.agent.md'
    ))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const relative = `.github/agents/${entry.name}`;
      const content = read(relative);
      const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
      assert.ok(frontmatter, `${relative} has frontmatter`);

      const scalar = (key) => {
        const match = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(frontmatter[1]);
        assert.ok(match, `${relative} declares ${key}`);
        const value = match[1].trim();
        return value.startsWith('"') && value.endsWith('"')
          ? JSON.parse(value)
          : value;
      };

      const scopeHeading = /^## Scope[ \\t]*$/m.exec(content);
      assert.ok(scopeHeading, `${relative} declares Scope`);
      const scopeStart = scopeHeading.index + scopeHeading[0].length;
      const remaining = content.slice(scopeStart);
      const nextHeading = /^## [^\n]+$/m.exec(remaining);
      const scope = remaining.slice(0, nextHeading?.index ?? remaining.length).trim();

      return {
        canonicalStem: entry.name.slice(0, -'.agent.md'.length),
        content,
        description: scalar('description'),
        name: scalar('name'),
        relative,
        scope,
      };
    });
}

test('current-format contract scans an explicit deterministic active-source inventory', () => {
  assert.deepEqual(ACTIVE_SOURCE_FILES, [...ACTIVE_SOURCE_FILES].sort());
  assert.equal(new Set(ACTIVE_SOURCE_FILES).size, ACTIVE_SOURCE_FILES.length);
  assert.equal(ACTIVE_SOURCE_FILES.length, 17);
  for (const relative of ACTIVE_SOURCE_FILES) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }
});

test('Markdown section contracts exclude frontmatter, fences, comments, and irrelevant sections', () => {
  const required = 'Only this visible rule counts.';
  const fixture = `---
description: ${required}
---

## Required Workflow

${required}

\`\`\`markdown
${required}
\`\`\`

<!-- ${required} -->

## Irrelevant

${required}
`;
  assert.match(markdownSection(fixture, '## Required Workflow'), /Only this visible rule counts\./);

  const mutations = [
    fixture.replace(`\n${required}\n\n\`\`\`markdown`, '\n\n```markdown'),
    fixture.replace(`\n${required}\n\n\`\`\`markdown`, `\n\`\`\`text\n${required}\n\`\`\`\n\n\`\`\`markdown`),
    fixture.replace(`\n${required}\n\n\`\`\`markdown`, `\n<!-- ${required} -->\n\n\`\`\`markdown`),
    `${fixture.replace(`\n${required}\n\n\`\`\`markdown`, '\n\n```markdown')}\n\n## Elsewhere\n\n${required}\n`,
  ];
  for (const mutated of mutations) {
    assert.doesNotMatch(markdownSection(mutated, '## Required Workflow'), /Only this visible rule counts\./);
  }
});

test('specialist dispatch is closed over the direct roster and limits exact artifact precedence to requested artifacts', () => {
  const routing = markdownSection(
    read('src/skills/dude-generic-routing/SKILL.md'),
    '## Routing Algorithm',
  );
  assert.match(routing, /direct `\.github\/agents\/\*\.agent\.md` entries[^\n]*closed candidate set/i);
  assert.match(routing, /canonical file stem[^\n]*frontmatter `name`[^\n]*`description`[^\n]*`## Scope`/i);
  assert.match(routing, /unique literal artifact type or file suffix match[^\n]*outranks semantic overlap only when[^\n]*requested output[^\n]*explicit create, author, refine, or review target/i);
  assert.match(routing, /incidental mentions[^\n]*test subjects[^\n]*examples[^\n]*inputs[^\n]*references[^\n]*do not trigger artifact-owner precedence/i);
  assert.match(routing, /route those by the primary requested outcome and scope/i);
  assert.match(routing, /emitted identity[^\n]*resolve uniquely[^\n]*discovered entry/i);
  assert.match(routing, /copied[^\n]*canonical (?:file )?stem[^\n]*declared (?:frontmatter )?`name`/i);
  assert.match(routing, /never synthesize an identity/i);
  assert.match(routing, /zero matches[^\n]*ambiguous top matches[^\n]*(?:stop|report|escalate|ask)/i);
  assert.match(routing, /do not dispatch[^\n]*(?:invent|synthesize)/i);

  const coordinator = markdownSection(read('src/agents/dude.agent.md'), '## Routing');
  assert.match(coordinator, /specialist identities[^\n]*direct discovered `\.github\/agents\/\*\.agent\.md` entries/i);
  assert.match(coordinator, /(?:canonical )?stem[^\n]*declared `name`[^\n]*maps uniquely/i);
  assert.match(coordinator, /artifact-owner precedence applies only when[^\n]*unique literal artifact type or suffix match[^\n]*requested output[^\n]*explicit create, author, refine, or review target/i);
  assert.match(coordinator, /incidental mentions[^\n]*test subjects[^\n]*examples[^\n]*inputs[^\n]*references[^\n]*primary requested outcome and scope/i);
  assert.match(coordinator, /zero or ambiguous[^\n]*stop[^\n]*never invent/i);
  assert.match(coordinator, /`## Routing Algorithm` and `## Task Matching`/i);
  assert.doesNotMatch(coordinator, /## Beads Issue Matching/i);

  const roster = installedAgentRoster();
  assert.ok(roster.length > 0, 'installed direct agent roster');
  const artifactSuffix = '.instructions.md';
  const literalOwners = roster.filter((agent) => (
    `${agent.description}\n${agent.scope}`.includes(artifactSuffix)
  ));
  assert.equal(literalOwners.length, 1, `unique literal owner for ${artifactSuffix}`);

  const [owner] = literalOwners;
  assert.equal(owner.canonicalStem, 'dude-pack-authoring-instruction-smith');
  assert.equal(owner.name, 'Instruction Smith');
  assert.equal(
    roster.filter((agent) => agent.canonicalStem === owner.canonicalStem).length,
    1,
    'canonical stem resolves uniquely',
  );
  assert.equal(
    roster.filter((agent) => agent.name === owner.name).length,
    1,
    'declared name resolves uniquely',
  );
  assert.equal(owner.relative, `.github/agents/${owner.canonicalStem}.agent.md`);

  const artifactTargetPattern = /\b(?:create|author|refine|review)\b[^\n]*\.instructions\.md\b/i;
  const explicitAuthoringTask = 'author a scoped .instructions.md file';
  const explicitRoutePath = artifactTargetPattern.test(explicitAuthoringTask)
    ? 'artifact-owner precedence'
    : 'semantic scope';
  assert.equal(explicitRoutePath, 'artifact-owner precedence');
  assert.equal(owner.name, 'Instruction Smith', explicitAuthoringTask);

  const incidentalTask = 'add a regression for .instructions.md routing';
  const incidentalRoutePath = artifactTargetPattern.test(incidentalTask)
    ? 'artifact-owner precedence'
    : 'semantic scope';
  assert.equal(incidentalRoutePath, 'semantic scope');
  const semanticSignal = /\b(?:test|regression|edge case)\b/i.exec(incidentalTask)?.[0].toLowerCase();
  assert.equal(semanticSignal, 'regression');
  const semanticOwners = roster.filter((agent) => (
    `${agent.description}\n${agent.scope}`.toLowerCase().includes(semanticSignal)
  ));
  assert.equal(semanticOwners.length, 1, `unique semantic owner for ${incidentalTask}`);
  assert.equal(semanticOwners[0].name, 'Tester');
  assert.notEqual(semanticOwners[0].name, 'Instruction Smith');

  const inventedIdentity = 'dude-pack-authoring-bundle-author';
  assert.equal(
    roster.some((agent) => (
      agent.canonicalStem === inventedIdentity || agent.name === inventedIdentity
    )),
    false,
    `${inventedIdentity} is not an installed identity`,
  );
});

test('T008 prompt inventory and coordinator routing stay bounded and roster-driven', () => {
  assert.equal(T008_PROMPT_SOURCES.length, 13);
  assert.equal(new Set(T008_PROMPT_SOURCES).size, T008_PROMPT_SOURCES.length);
  for (const relative of T008_PROMPT_SOURCES) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }

  const coordinator = markdownSection(read('src/agents/dude.agent.md'), '## Core Duties');
  const routing = markdownSection(
    read('src/skills/dude-generic-routing/SKILL.md'),
    '## Routing Algorithm',
  );
  assert.match(coordinator, /coordinate the active execution lane/i);
  assert.match(read('src/agents/dude.agent.md'), /coordinator orchestrates[^^\n]*does not implement/i);
  assert.match(routing, /direct `\.github\/agents\/\*\.agent\.md` entries[^\n]*closed candidate set/i);
  assert.match(routing, /zero matches[^\n]*ambiguous top matches[^\n]*(?:stop|report|escalate|ask)/i);
  assert.match(routing, /never synthesize an identity|do not dispatch or invent/i);
  assert.doesNotMatch(`${coordinator}\n${routing}`, /@dude-pack-(?:authoring|coding)-[a-z0-9-]+/i);
});

test('T008 intake keeps brainstorm separate, user-owned intent intact, and guardrails consensual', () => {
  assertSectionMatchesAll('src/agents/dude-spec-lead.agent.md', '## Required Workflow', [
    /must load[^\n]*dude-feature-definition/i,
    /brainstorm[^\n]*(?:only|exactly one)[^\n]*\.dude\/ideas\/<slug>\.md/i,
    /brainstorm[^\n]*(?:does not|never)[^\n]*(?:create|write)[^\n]*\.dude\/specs/i,
    /explicit[^\n]*define/i,
    /`## Idea`[^\n]*`## Open Questions`[^\n]*`## Assumptions`[^\n]*user/i,
    /`status:`[^\n]*`spec_path:`[^\n]*`## Coordinator Log`[^\n]*(?:maintained|coordinator)/i,
    /append-only/i,
    /accept[^\n]*edit[^\n]*reject[^\n]*skip/i,
    /no new[^\n]*guardrails[^\n]*(?:continue|no pause|without pausing)/i,
  ]);

  assertSectionMatchesAll('src/skills/dude-feature-definition/SKILL.md', '## Brainstorm', [
    /brainstorm[^\n]*(?:does not|never)[^\n]*(?:create|write)[^\n]*\.dude\/specs/i,
  ]);
  assertSectionMatchesAll('src/skills/dude-feature-definition/SKILL.md', '## Ownership', [
    /`## Idea`[^\n]*`## Open Questions`[^\n]*`## Assumptions`[^\n]*user/i,
  ]);
  assertSectionMatchesAll('src/skills/dude-feature-definition/SKILL.md', '## Guardrail And Spec Gates', [
    /accept[^\n]*edit[^\n]*reject[^\n]*skip/i,
    /no new[^\n]*guardrails[^\n]*(?:continue|no pause|without pausing)/i,
    /spec[^\n]*before[^\n]*plan/i,
  ]);
});

test('T008 canonical feature ownership fails closed locally in every execution entry point', () => {
  const ownershipSurfaces = [
    ['src/agents/dude.agent.md', '## Canonical Ownership'],
    ['src/skills/dude-feature-definition/SKILL.md', '## Ownership'],
    ['src/skills/dude-lightweight-execution/SKILL.md', '## Authority And Ownership'],
    ['src/skills/dude-work/SKILL.md', '## Canonical Mutation Gate'],
  ];
  for (const [relative, heading] of ownershipSurfaces) {
    assertSectionMatchesAll(relative, heading, [
      /exact(?:ly)? one[^\n]*`status: defined`[^\n]*exact[^\n]*`spec_path:`/i,
      /diagnostic[^\n]*(?:zero|no owner)[^\n]*multiple[^\n]*stop[^\n]*before[^\n]*(?:write|mutation)/i,
      /(?:do not|never)[^\n]*(?:infer|fall back)[^\n]*slug[^\n]*directory[^\n]*name/i,
    ]);
  }
  assertSectionMatchesAll('src/agents/dude-spec-lead.agent.md', '## Required Workflow', [
    /exact(?:ly)? one[^\n]*defined owner[^\n]*exact[^\n]*`spec_path:`/i,
    /diagnostic[^\n]*(?:zero|no owner)[^\n]*multiple[^\n]*stop[^\n]*before[^\n]*(?:write|mutation)/i,
    /dude-lint/i,
  ]);
});

test('T008 execution lanes keep one live authority and Work never falls through from Tracked', () => {
  assertSectionMatchesAll('src/skills/dude-lightweight-execution/SKILL.md', '## Authority And Ownership', [
    /`tasks\.md`[^\n]*(?:sole|single)[^\n]*live[^\n]*(?:board|source of truth)/i,
    /generated[^\n]*(?:board|view)[^\n]*derived[^\n]*(?:not|never)[^\n]*(?:live|source of truth|canonical)/i,
    /after[^\n]*Beads[^\n]*import[^\n]*Beads[^\n]*(?:sole|only)[^\n]*(?:authority|source of truth|live board)/i,
    /`tasks\.md`[^\n]*one-way[^\n]*non-authoritative[^\n]*mirror/i,
  ]);
  assertSectionMatchesAll('src/skills/dude-work/SKILL.md', '## Detect The Lane Once', [
    /no ready Beads work[^\n]*(?:do not|never)[^\n]*fall through[^\n]*Lightweight/i,
  ]);
  assertSectionMatchesAll('src/skills/dude-work/SKILL.md', '## Boundaries', [
    /not a (?:new (?:workflow )?)?lane/i,
  ]);
});

test('T008 current-only handling refuses retired Dude migration without touching retired state', () => {
  assertSectionMatchesAll('src/instructions/dude.instructions.md', '# Dude Shared Rules', [
    /retired Dude[^\n]*(?:request|workflow|layout|state)[^\n]*unsupported/i,
    /(?:do not|never)[^\n]*scan[^\n]*translate[^\n]*migrat[^\n]*delet[^\n]*mutat/i,
  ]);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/skills/dude-workspace-migration')), false);
  assert.equal(fs.existsSync(path.join(ROOT, '.github/skills/dude-workspace-migration')), false);
});

test('T008 destructive operations fail closed on preview, expected state, and literal confirmation', () => {
  assertSectionMatchesAll('src/instructions/dude.instructions.md', '# Dude Shared Rules', [
    /destructive[^\n]*(?:preview|plan)[^\n]*expected[^\n]*state[^\n]*(?:literal|exact)[^\n]*confirmation[^\n]*refus[^\n]*before[^\n]*write/i,
  ]);
  assertSectionMatchesAll('src/agents/dude.agent.md', '## Destructive Apply', [
    /upgrade[^\n]*persisted[^\n]*fresh[^\n]*plan/i,
    /expected[^\n]*state[^\n]*`confirm-upgrade`[^\n]*(?:refuse|stop)[^\n]*before[^\n]*write/i,
  ]);
  for (const relative of T008_PROMPT_SOURCES) {
    assert.doesNotMatch(read(relative), /reviewed (?:plan )?digest/i, relative);
  }
});

test('T008 completion requires fresh evidence and independent revision ownership', () => {
  assertSectionMatchesAll('src/skills/dude-verification-before-completion/SKILL.md', '## Gate', [
    /fresh[^\n]*evidence[^\n]*before[^\n]*`\[x\]`/i,
    /fresh[^\n]*evidence[^\n]*before[^\n]*`bd close`/i,
  ]);
  assertSectionMatchesAll('src/agents/dude-reviewer.agent.md', '## Boundaries', [
    /read-only/i,
    /(?:do not|never)[^\n]*implement[^\n]*fix[^\n]*test[^\n]*close/i,
  ]);
  assertSectionMatchesAll('src/agents/dude-reviewer.agent.md', '## Verdict', [
    /APPROVE[^\n]*REJECT[^\n]*ESCALATE/i,
  ]);
  assertSectionMatchesAll('src/skills/dude-reviewer-protocol/SKILL.md', '## Rejection Procedure', [
    /different reviser[^\n]*if available/i,
    /second[^\n]*same finding[^\n]*escalat/i,
  ]);
  const combined = T008_PROMPT_SOURCES.map(read).join('\n');
  assert.doesNotMatch(combined, /close after implementation/i);
});

test('T008 definition authority, rerun safety, guardrails, gates, and reconciliation are section-bound', () => {
  const contracts = [
    {
      relative: 'src/instructions/dude.instructions.md',
      heading: '# Dude Shared Rules',
      needles: [
        'The coordinator exclusively owns execution-lane and tracked state',
        'During explicit `brainstorm` or `define`, the Spec Lead is the delegated definition writer',
        'Specialists otherwise do not mutate workflow state.',
      ],
      ruleLine: '1. The coordinator exclusively owns execution-lane and tracked state, task glyphs and metadata, generated boards and mirrors, archive/discovered/execution-history state, execution, execution-reconciliation, and close log events, and close. Ordinary definition authority has only the guarded Work exception below. During explicit `brainstorm` or `define`, the Spec Lead is the delegated definition writer for idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events under `dude-feature-definition`; on re-definition it stages reconciliation and proposed canonical task units but never applies coordinator-owned state. Specialists otherwise do not mutate workflow state.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Lifecycle',
      needles: [
        'A brainstorm rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`',
        '`status: draft` with an empty path applies only to a first or still-undefined draft',
      ],
      ruleLine: '- The delegated Spec Lead maintains `status:`, exact `spec_path:`, managed definition sections, and definition log events. A brainstorm rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`; `status: draft` with an empty path applies only to a first or still-undefined draft.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Lifecycle',
      needles: [
        'First definition atomically commits the prospective owner, exact path, package, and definition event or restores the pre-write state',
        'the Spec Lead returns staged definition artifacts, `kept`/`changed`/`dropped`/`new` reconciliation',
        'the coordinator re-verifies the exact owner and complete stage before any write',
        '`spec.md` must pass its quality gate before `plan.md` and tasks',
      ],
      ruleLine: '- That explicit `define <slug>` route creates or refreshes the package. First definition atomically commits the prospective owner, exact path, package, and definition event or restores the pre-write state. For re-definition, the Spec Lead returns staged definition artifacts, `kept`/`changed`/`dropped`/`new` reconciliation, proposed canonical task units, and archive/discovered/history preservation; the coordinator re-verifies the exact owner and complete stage before any write. `spec.md` must pass its quality gate before `plan.md` and tasks.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Lifecycle',
      needles: [
        'delegates only definition artifact/metadata/definition-log writes to the Spec Lead',
        'exclusively applies task glyphs, task metadata, generated board, archive/discovered/history state',
        'never leave or report half-applied state',
      ],
      ruleLine: '- After accepting a complete re-definition stage, the coordinator snapshots both halves, delegates only definition artifact/metadata/definition-log writes to the Spec Lead, and exclusively applies task glyphs, task metadata, generated board, archive/discovered/history state, and the execution-reconciliation log event. If either half or validation fails, restore all affected bytes and new paths; never leave or report half-applied state.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Lifecycle',
      needles: [
        'The Spec Lead has no terminal authority and does not claim lint execution',
        'The coordinator runs `node .github/skills/dude-lint/lint.mjs .`',
        'definition readiness requires the coordinator to report zero failures',
      ],
      ruleLine: '- The Spec Lead has no terminal authority and does not claim lint execution. The coordinator runs `node .github/skills/dude-lint/lint.mjs .`; definition readiness requires the coordinator to report zero failures.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Lifecycle',
      needles: [
        'This is a normal checkpoint, not an error.',
        '`accept` persists the proposed rules to `.dude/memory/guardrails.md`',
        '`edit` persists only the user-edited accepted rules',
        '`reject` persists none and continues with existing project/bundle guardrails',
        '`skip` persists none and continues with bundle defaults only',
        'Only ratified rules persist. No candidates means no pause.',
      ],
      ruleLine: '- When guardrail candidates exist, pause with `This is a normal checkpoint, not an error.` `accept` persists the proposed rules to `.dude/memory/guardrails.md`; `edit` persists only the user-edited accepted rules; both then resume definition. `reject` persists none and continues with existing project/bundle guardrails; `skip` persists none and continues with bundle defaults only. Only ratified rules persist. No candidates means no pause.',
    },
    {
      relative: 'src/agents/dude-spec-lead.agent.md',
      heading: '## Required Workflow',
      needles: [
        'Outside the sole Work exception below, only during explicit `brainstorm` or `define` does the coordinator delegate definition writes to the Spec Lead',
        'compute and return staged `kept`/`changed`/`dropped`/`new` reconciliation',
        'do not apply task glyphs, task metadata, boards, mirrors, execution-history state, execution-reconciliation events, or close logs',
        'A rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`',
      ],
      ruleLine: '- Outside the sole Work exception below, only during explicit `brainstorm` or `define` does the coordinator delegate definition writes to the Spec Lead: idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events. On re-definition, compute and return staged `kept`/`changed`/`dropped`/`new` reconciliation, proposed canonical task units, and archive/discovered/history preservation; do not apply task glyphs, task metadata, boards, mirrors, execution-history state, execution-reconciliation events, or close logs.',
    },
    {
      relative: 'src/agents/dude-spec-lead.agent.md',
      heading: '## Required Workflow',
      needles: [
        'Do not run terminal commands or claim lint execution',
        'Return staged definition artifacts to the coordinator',
        'runs `node .github/skills/dude-lint/lint.mjs .`',
        'do not claim definition readiness until the coordinator reports zero failures',
      ],
      ruleLine: '- Do not run terminal commands or claim lint execution. Return staged definition artifacts to the coordinator, which runs `node .github/skills/dude-lint/lint.mjs .`; do not claim definition readiness until the coordinator reports zero failures.',
    },
    {
      relative: 'src/agents/dude-spec-lead.agent.md',
      heading: '## Required Workflow',
      needles: [
        'A `flag` may request analysis and recommendations for a spec gap or contract mismatch',
        'it delegates no definition writes',
        'do not mutate definition artifacts until explicit `define <slug>`',
      ],
      ruleLine: '- A `flag` may request analysis and recommendations for a spec gap or contract mismatch, but it delegates no definition writes; do not mutate definition artifacts until explicit `define <slug>`.',
    },
    {
      relative: 'src/skills/dude-work-intake/SKILL.md',
      heading: '## Brainstorm',
      needles: [
        '`status: draft` with an empty `spec_path:` only for a first or still-undefined draft',
        'A brainstorm rerun of a ledger already at `status: defined` preserves that status and its exact `spec_path:`',
        'never demote it or orphan its package',
      ],
      ruleLine: '- Set `status: draft` with an empty `spec_path:` only for a first or still-undefined draft. A brainstorm rerun of a ledger already at `status: defined` preserves that status and its exact `spec_path:`; never demote it or orphan its package.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Ownership',
      needles: [
        'the coordinator delegates definition writes to the Spec Lead',
        'Other specialists do not mutate workflow state',
        'execution state and close events remain coordinator-only',
      ],
      ruleLine: '- During explicit `brainstorm` or `define`, the coordinator delegates definition writes to the Spec Lead: idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events. Other specialists do not mutate workflow state; execution state and close events remain coordinator-only. Never rewrite prior log entries.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Brainstorm',
      needles: [
        'preserve resolved questions, answers, assumptions, and user edits',
        'Set `status: draft` and empty `spec_path:` only for a first or still-undefined draft',
        'A rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`',
        'never demote it or orphan its package',
      ],
      ruleLine: 'On first capture, only clear language or transcription errors may be corrected. On rerun, re-normalize managed content without opportunistically rewriting user text. Keep active questions immediately after `## Idea`, preserve resolved questions, answers, assumptions, and user edits, and add only focused questions introduced by new ambiguity. Set `status: draft` and empty `spec_path:` only for a first or still-undefined draft. A rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`; never demote it or orphan its package.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Guardrail And Spec Gates',
      needles: [
        'This is a normal checkpoint, not an error.',
        '`accept` persists the proposed rules to `.dude/memory/guardrails.md`, then resumes definition',
        '`edit` persists only the user-edited accepted rules, then resumes',
        '`reject` persists none and continues with existing project/bundle guardrails',
        '`skip` persists none and continues with bundle defaults only',
        'Only ratified rules persist. With no new guardrails, continue without pausing.',
      ],
      ruleLine: 'Read project memory and conventions. If only bundle guardrails exist, infer a minimal project-specific candidate set. When candidates exist, pause and say `This is a normal checkpoint, not an error.` `accept` persists the proposed rules to `.dude/memory/guardrails.md`, then resumes definition. `edit` persists only the user-edited accepted rules, then resumes. `reject` persists none and continues with existing project/bundle guardrails. `skip` persists none and continues with bundle defaults only. Only ratified rules persist. With no new guardrails, continue without pausing.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Guardrail And Spec Gates',
      needles: [
        'Write and validate the technology-agnostic `spec.md` before `plan.md`',
        'Resolve all markers before planning or task derivation.',
      ],
      ruleLine: 'Write and validate the technology-agnostic `spec.md` before `plan.md`. The spec covers WHAT and WHY with prioritized, independently testable user scenarios, edge cases, numbered requirements, applicable entities, measurable success criteria, and assumptions. Allow at most three `[NEEDS CLARIFICATION: ...]` markers, ordered scope, security/privacy, UX, then technical; keep overflow visible as deferred clarification. Resolve all markers before planning or task derivation.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## First Definition Transaction',
      needles: [
        'prospective owner because no defined owner exists yet',
        'Return the complete stage to the coordinator',
        'as one delegated atomic transaction',
        'the coordinator restores every pre-write byte and removes every newly created path',
        'neither package nor owner transition may survive alone',
      ],
      ruleLine: "4. Return the complete stage to the coordinator. After it verifies the prospective owner and snapshots every affected path, commit the staged package artifacts, that same idea's `status: defined` plus exact `spec_path:`, and the definition event as one delegated atomic transaction. If any write or validation fails, the coordinator restores every pre-write byte and removes every newly created path; neither package nor owner transition may survive alone, and never report a half-transition as defined.",
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Re-definition',
      needles: [
        'computes and stages `kept`, `changed`, `dropped`, and `new` rows by durable task key',
        'proposed canonical task units',
        'must not apply task glyphs, task metadata, generated boards, archive/discovered/execution-history state, or execution-reconciliation log events',
        'Preserve state only for a true one-to-one surviving task',
      ],
      ruleLine: 'The Spec Lead computes and stages `kept`, `changed`, `dropped`, and `new` rows by durable task key, proposed canonical task units, and exact preservation of archives, `## Discovered During Execution`, and `## Lightweight Execution History`. It may write definition artifacts, metadata, and definition log events only through the explicit `define` delegation, except for the sole Work-authorized unchanged-intent derived-artifact repair in an existing Lightweight package above; it must not apply task glyphs, task metadata, generated boards, archive/discovered/execution-history state, or execution-reconciliation log events. Preserve state only for a true one-to-one surviving task. Splits, merges, scope changes, missing keys, or different keys remain open unless the mapping is explicit.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Re-definition',
      needles: [
        'Dropping any non-open task is a hard pause for user confirmation',
        '`## Lightweight Execution History`',
        'read-only evidence, and are never parsed or regenerated',
        'Preserve any `## Discovered During Execution` section verbatim immediately before history',
      ],
      ruleLine: 'Dropping any non-open task is a hard pause for user confirmation. The user may confirm, reject, force keep/drop, or archive dropped rows. Archived rows go in terminal `## Lightweight Execution History`, remain read-only evidence, and are never parsed or regenerated. Preserve any `## Discovered During Execution` section verbatim immediately before history; its synced `T9001`-`T9999` rows are outside spec-derived reconciliation.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Re-definition',
      needles: [
        'Return the complete staged definition and reconciliation to the coordinator before either actor writes',
        'The coordinator re-verifies the exact owner and staged mapping',
        'exclusively applies glyphs, task metadata, board, archive/discovered/history state, and the execution-reconciliation log event',
        'Never leave or report a half-applied re-definition',
      ],
      ruleLine: 'Return the complete staged definition and reconciliation to the coordinator before either actor writes. The coordinator re-verifies the exact owner and staged mapping, then delegates definition artifact/metadata/definition-log writes to the Spec Lead and exclusively applies glyphs, task metadata, board, archive/discovered/history state, and the execution-reconciliation log event. Pre-write snapshots cover both halves; if either half or lint fails, restore every changed byte and remove every new path. Never leave or report a half-applied re-definition.',
    },
    {
      relative: 'src/skills/dude-feature-definition/SKILL.md',
      heading: '## Validation And Handoff',
      needles: [
        'without claiming terminal or lint execution',
        'The coordinator runs:',
        'No definition readiness claim is allowed until the coordinator reports zero failures',
      ],
      ruleLine: 'No definition readiness claim is allowed until the coordinator reports zero failures. Before tracked import, `tasks.md` may be the sole Lightweight live board. After import, Beads is authoritative and markdown updates are only a one-way non-authoritative mirror. Return changed artifacts, exact `spec_path`, clarification or reconciliation state, readiness, and risks to the coordinator.',
    },
  ];

  for (const contract of contracts) {
    assertSectionIncludesAll(contract.relative, contract.heading, contract.needles);
    assertSectionRuleRejectsMutations(contract.relative, contract.heading, contract.ruleLine);
  }
});

test('T008 coordinator Status, Diff, Self-Check, and Flag procedures are section-bound', () => {
  const contracts = [
    {
      heading: '## Status',
      needles: [
        'Resolve the exact owner for each defined package and report `Ownership: ambiguous` on any resolver diagnostic',
        'a direct draft has no defined package owner',
        'any initialized or imported tracked issues mean `Tracked Execution`, even with none ready',
        'an explicit current-session Lightweight choice or any canonical `[~]`, `[!]`, or `[x]` task-state glyph means `Lightweight Execution`',
        'multiple candidate defined packages or an unclear active choice are `Ownership: ambiguous`',
        'a single draft is `Definition Only` with the idea live',
        'all `[ ]` with no execution evidence is `Definition Only` with the package live',
        'Show task counts only for Lightweight; all-open tasks alone are not execution evidence',
        'Report `Lane`, `Live`, `Next`, and `Blockers`',
        'never mutate, render, log, import, reconcile, or close',
      ],
      ruleLine: 'Read only. Resolve the exact owner for each defined package and report `Ownership: ambiguous` on any resolver diagnostic; a direct draft has no defined package owner. Apply deterministic precedence: (1) any initialized or imported tracked issues mean `Tracked Execution`, even with none ready; (2) without tracked import, an explicit current-session Lightweight choice or any canonical `[~]`, `[!]`, or `[x]` task-state glyph means `Lightweight Execution`; (3) multiple candidate defined packages or an unclear active choice are `Ownership: ambiguous`; (4) otherwise a single draft is `Definition Only` with the idea live, and a single defined package whose tasks are all `[ ]` with no execution evidence is `Definition Only` with the package live. Show task counts only for Lightweight; all-open tasks alone are not execution evidence. Report `Lane`, `Live`, `Next`, and `Blockers`; never mutate, render, log, import, reconcile, or close.',
    },
    {
      heading: '## Diff',
      needles: [
        'An optional named feature narrows the report',
        'by default inspect every relevant current-format idea `## Coordinator Log` plus session-known coordinator maintenance writes',
        'group qualifying writes by file',
        "Resolve each defined feature's exact owner independently",
        'include draft brainstorm, cross-feature and parallel writes',
        "Report one feature's ownership ambiguity for that feature without suppressing unrelated results",
        'Keep no second persistent ledger, perform no writes',
        'say plainly that nothing changed',
      ],
      ruleLine: "Read only. An optional named feature narrows the report; by default inspect every relevant current-format idea `## Coordinator Log` plus session-known coordinator maintenance writes since the previous message or a user-named anchor, and group qualifying writes by file. Resolve each defined feature's exact owner independently; include draft brainstorm, cross-feature and parallel writes, execution state, board renders, reconciliation, accepted manual completion, and reverts. Report one feature's ownership ambiguity for that feature without suppressing unrelated results. Keep no second persistent ledger, perform no writes, and when no event qualifies say plainly that nothing changed.",
    },
    {
      heading: '## Self-Check',
      needles: [
        'Read only. Inspect the last three routing replies for a lane banner',
        'unreverted or unrecorded manual `[x]`',
        'touched managed and board fences',
        'append-only log behavior since the prior check',
        'every defined package has one exact owner and an existing spec',
        'Report each item as `OK` or `Drift`',
        'recommend a correction without applying it',
      ],
      ruleLine: 'Read only. Inspect the last three routing replies for a lane banner; unreverted or unrecorded manual `[x]`; touched managed and board fences; append-only log behavior since the prior check; and whether every defined package has one exact owner and an existing spec. Report each item as `OK` or `Drift`, then recommend a correction without applying it.',
    },
    {
      heading: '## Flag',
      needles: [
        'Classify the strongest applicable execution blocker as `spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, or `external-dependency`',
        '`Classified as: <type>`',
        'only the coordinator persist blocked state through the active lane',
        'Route spec gaps and contract mismatches to the Spec Lead for analysis and recommendations',
        'plan gaps to planning authority',
        'test failures to the matching tester',
        'external dependencies to the user',
        'A flag never delegates definition writes',
        'must not mutate definition artifacts until explicit `define <slug>` is invoked',
        '`Next` points to that explicit define',
        '`status`, `diff`, and `self-check` remain read-only',
      ],
      ruleLine: 'Classify the strongest applicable execution blocker as `spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, or `external-dependency`, echo `Classified as: <type>`, and let only the coordinator persist blocked state through the active lane plus its execution log event. Route spec gaps and contract mismatches to the Spec Lead for analysis and recommendations, plan gaps to planning authority, test failures to the matching tester, and external dependencies to the user. A flag never delegates definition writes: for a spec gap or contract mismatch the Spec Lead must not mutate definition artifacts until explicit `define <slug>` is invoked, and `Next` points to that explicit define. `status`, `diff`, and `self-check` remain read-only.',
    },
  ];

  for (const contract of contracts) {
    assertSectionIncludesAll('src/agents/dude.agent.md', contract.heading, contract.needles);
    assertSectionRuleRejectsMutations(
      'src/agents/dude.agent.md',
      contract.heading,
      contract.ruleLine,
    );
  }

  const specLeadFrontmatter = /^---\n([\s\S]*?)\n---/.exec(read('src/agents/dude-spec-lead.agent.md'))?.[1] ?? '';
  assert.doesNotMatch(specLeadFrontmatter, /execute\/runInTerminal|terminal/i);
  assert.doesNotMatch(markdownSection(read('src/agents/dude-spec-lead.agent.md'), '## Required Workflow'), /I ran|I executed|lint passed/i);

  const flagDocs = markdownSection(read('docs/commands.md'), '### `@dude flag`');
  const flagDocsSource = read('docs/commands.md');
  assert.match(flagDocs, /analysis[\s\S]*explicit `@dude define <slug>`/i);
  assert.match(flagDocsSource, /Routed to @dude-spec-lead for analysis and recommendations/);
  assert.match(flagDocsSource, /Run @dude define authentication before any definition artifacts are changed/);

  const walkthroughFlag = fencedBlockContaining(read('docs/walkthrough.md'), 'Action: flag');
  assert.match(walkthroughFlag, /Routed to @dude-spec-lead for analysis and recommendations/);
  assert.match(walkthroughFlag, /Run @dude define authentication before any definition artifacts are changed/);
  assert.doesNotMatch(walkthroughFlag, /for definition updates/);
  assert.match(walkthroughFlag, /Blockers:[\s\S]*?(?:unchecked|blocked)/i);

  const lightweightStatus = markdownSection(
    read('src/skills/dude-lightweight-execution/SKILL.md'),
    '## Status And Handoff',
  ).replace(/\s+/g, ' ');
  assert.match(lightweightStatus, /coordinator first determines the active lane per its Status precedence/i);
  assert.match(lightweightStatus, /this detailed status applies only once that active lane is Lightweight Execution/i);
  assert.match(lightweightStatus, /stays `Definition Only`, so do not report `tasks\.md` counts for it/i);
  assert.match(lightweightStatus, /When Lightweight Execution is the active lane, report lane/i);
});

test('T008 Status precedence fixtures distinguish tracked, Lightweight, Definition Only, and ambiguity', () => {
  const fixtures = [
    { name: 'tracked wins with no ready issue', input: { trackedIssues: 1, lightweightChoice: true, taskStates: ['~'], candidates: 2 }, lane: 'Tracked Execution', counts: false },
    { name: 'explicit Lightweight choice', input: { trackedIssues: 0, lightweightChoice: true, taskStates: [' ', ' '] }, lane: 'Lightweight Execution', counts: true },
    { name: 'in-progress task is execution evidence', input: { trackedIssues: 0, taskStates: ['~'] }, lane: 'Lightweight Execution', counts: true },
    { name: 'blocked task is execution evidence', input: { trackedIssues: 0, taskStates: ['!'] }, lane: 'Lightweight Execution', counts: true },
    { name: 'done task is execution evidence', input: { trackedIssues: 0, taskStates: ['x'] }, lane: 'Lightweight Execution', counts: true },
    { name: 'draft has no execution lane', input: { trackedIssues: 0, kind: 'draft' }, lane: 'Definition Only', live: 'idea', counts: false },
    { name: 'all-open package is not Lightweight evidence', input: { trackedIssues: 0, kind: 'defined', taskStates: [' ', ' '] }, lane: 'Definition Only', live: 'package', counts: false },
    { name: 'all-open package with multiple candidates is ambiguous, not Definition Only', input: { trackedIssues: 0, kind: 'defined', taskStates: [' ', ' '], candidates: 2 }, lane: 'ambiguous', counts: false },
    { name: 'multiple candidates stay ambiguous', input: { trackedIssues: 0, candidates: 2 }, lane: 'ambiguous', counts: false },
    { name: 'unclear choice stays ambiguous', input: { trackedIssues: 0, unclearChoice: true }, lane: 'ambiguous', counts: false },
  ];

  for (const fixture of fixtures) {
    const result = classifyStatusFixture(fixture.input);
    assert.equal(result.lane, fixture.lane, fixture.name);
    if (fixture.live) assert.equal(result.live, fixture.live, fixture.name);
    assert.equal(Object.hasOwn(result, 'counts'), fixture.counts, `${fixture.name}: counts`);
  }

  const statusSection = markdownSection(read('src/agents/dude.agent.md'), '## Status');
  const ambiguityIndex = statusSection.indexOf('are `Ownership: ambiguous`');
  const allOpenFallbackIndex = statusSection.indexOf('all `[ ]` with no execution evidence is `Definition Only`');
  assert.ok(ambiguityIndex !== -1 && allOpenFallbackIndex !== -1, 'status precedence clauses present');
  assert.ok(
    ambiguityIndex < allOpenFallbackIndex,
    'ambiguity precedence is evaluated before the all-open Definition Only fallback',
  );
});

test('T008 commands.md work metadata delegates definition state and tracked status avoids Lightweight counts', () => {
  const commands = read('docs/commands.md');

  const workProse = markdownSection(commands, '### `@dude work`').replace(/\s+/g, ' ');
  assert.doesNotMatch(workProse, /Coordinator-maintained metadata/i);
  assert.doesNotMatch(workProse, /still updated per the coordinator-only mutation rule/i);
  assert.match(
    workProse,
    /Workflow metadata \(`## Coordinator Log`, `status:`, `spec_path:`\) is Dude-managed, not user-managed/i,
  );
  assert.match(
    workProse,
    /during explicit `brainstorm`\/`define` the Spec Lead maintains definition metadata and definition-log events/i,
  );
  assert.match(workProse, /the coordinator exclusively owns execution-state and close events/i);
  assert.match(workProse, /`@dude work` itself only appends coordinator execution events/i);

  const trackedStatus = fencedBlockContaining(commands, 'Current lane: Tracked Execution');
  assert.match(trackedStatus, /Tracked board from Beads: .*ready.*in progress/i);
  assert.match(trackedStatus, /tracker-provided, not coordinator-computed counts/i);
  assert.doesNotMatch(trackedStatus, /^- Ready tasks: \d/m);
  assert.doesNotMatch(trackedStatus, /^- In progress: \d/m);
  assert.doesNotMatch(trackedStatus, /^- Not started: \d/m);

  const lightweightStatus = fencedBlockContaining(commands, 'Current lane: Lightweight Execution');
  assert.match(lightweightStatus, /^- Not started: \d/m);
  assert.match(lightweightStatus, /^- In progress: \d/m);
  assert.match(lightweightStatus, /^- Blocked: \d/m);
  assert.match(lightweightStatus, /^- Done: \d/m);
});

test('T008 Diff fixtures include draft, cross-feature, ambiguous, parallel, and maintenance writes', () => {
  const events = [
    { feature: 'alpha', file: '.dude/ideas/alpha.md', kind: 'execution', afterAnchor: true },
    { feature: 'beta', file: '.dude/ideas/beta.md', kind: 'parallel', afterAnchor: true },
    { feature: 'draft', file: '.dude/ideas/draft.md', kind: 'brainstorm', afterAnchor: true },
    { feature: 'ambiguous', file: '.dude/ideas/ambiguous.md', kind: 'ownership ambiguity', afterAnchor: true },
    { feature: null, file: '.dude/memory/decisions.md', kind: 'maintenance', afterAnchor: true },
    { feature: 'alpha', file: '.dude/ideas/alpha.md', kind: 'before anchor', afterAnchor: false },
  ];
  const before = JSON.stringify(events);

  assert.deepEqual(collectDiffFixture(events), {
    '.dude/ideas/alpha.md': ['execution'],
    '.dude/ideas/beta.md': ['parallel'],
    '.dude/ideas/draft.md': ['brainstorm'],
    '.dude/ideas/ambiguous.md': ['ownership ambiguity'],
    '.dude/memory/decisions.md': ['maintenance'],
  });
  assert.deepEqual(collectDiffFixture(events, 'beta'), {
    '.dude/ideas/beta.md': ['parallel'],
  });
  assert.deepEqual(collectDiffFixture(events.map((event) => ({ ...event, afterAnchor: false }))), {});
  assert.equal(JSON.stringify(events), before, 'read-only fixture remains unchanged');
});

test('T008 same-feature parallel fixtures require [P], no relations, and known disjoint writes', () => {
  const base = { id: 'T001@aaaaaaaa', parallel: true, dependencies: [], blockers: [], writes: ['src/alpha.mjs'] };
  const fixtures = [
    { name: 'same-feature disjoint [P] tasks', left: base, right: { ...base, id: 'T002@bbbbbbbb', dependencies: ['T000@00000000'], writes: ['src/beta.mjs'] }, allowed: true },
    { name: 'overlapping file', left: base, right: { ...base, id: 'T002@bbbbbbbb', writes: ['src/alpha.mjs'] }, allowed: false },
    { name: 'dependency relation', left: { ...base, dependencies: ['T002@bbbbbbbb'] }, right: { ...base, id: 'T002@bbbbbbbb', writes: ['src/beta.mjs'] }, allowed: false },
    { name: 'blocker relation', left: base, right: { ...base, id: 'T002@bbbbbbbb', blockers: ['T001@aaaaaaaa'], writes: ['src/beta.mjs'] }, allowed: false },
    { name: 'unknown write set', left: base, right: { ...base, id: 'T002@bbbbbbbb', writes: null }, allowed: false },
    { name: 'shared state', left: base, right: { ...base, id: 'T002@bbbbbbbb', writes: ['src/beta.mjs'], sharedState: true }, allowed: false },
    { name: 'missing [P]', left: { ...base, parallel: false }, right: { ...base, id: 'T002@bbbbbbbb', writes: ['src/beta.mjs'] }, allowed: false },
  ];

  for (const fixture of fixtures) {
    assert.equal(canDispatchTogether(fixture.left, fixture.right), fixture.allowed, fixture.name);
  }
});

test('T008 reviewer, coordinator, and reviser responsibilities are section-bound', () => {
  const contracts = [
    {
      relative: 'src/agents/dude-reviewer.agent.md',
      heading: '## Boundaries',
      needles: [
        'Remain read-only: do not implement, fix, test, close, mutate workflow state, or edit artifacts.',
        'Never load `dude-receiving-code-review`, assign or perform a revision, or select the next reviewer.',
      ],
      ruleLine: '- Never load `dude-receiving-code-review`, assign or perform a revision, or select the next reviewer.',
    },
    {
      relative: 'src/agents/dude-reviewer.agent.md',
      heading: '## Verdict',
      needles: [
        'Return exactly one leading verdict: `APPROVE`, `REJECT`, or `ESCALATE`.',
        'Return only the verdict, concrete findings, and an optional reviser recommendation to the coordinator.',
        'A recommendation is advisory; the coordinator owns assignment.',
        'Never perform the revision yourself.',
      ],
      ruleLine: 'Return only the verdict, concrete findings, and an optional reviser recommendation to the coordinator. A recommendation is advisory; the coordinator owns assignment. Never perform the revision yourself.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Review Rejection',
      needles: [
        'The reviewer returns only its verdict, findings, and optional reviser recommendation.',
        'The coordinator records the findings, loads `dude-receiving-code-review`, and assigns a different credible reviser when possible',
        'The selected reviser validates each finding, addresses accepted findings, and reruns focused verification without self-approving or selecting the next reviewer.',
        'The coordinator sends the result to an independent reviewer.',
        'A second failure on the same finding escalates to the user.',
      ],
      ruleLine: 'The reviewer returns only its verdict, findings, and optional reviser recommendation. The coordinator records the findings, loads `dude-receiving-code-review`, and assigns a different credible reviser when possible; otherwise the original author may revise. The selected reviser validates each finding, addresses accepted findings, and reruns focused verification without self-approving or selecting the next reviewer. The coordinator sends the result to an independent reviewer. A second failure on the same finding escalates to the user.',
    },
    {
      relative: 'src/skills/dude-reviewer-protocol/SKILL.md',
      heading: '## Rejection Procedure',
      needles: [
        'The reviewer records and returns its verdict, concrete findings, and optional reviser recommendation; it does not load the receiving-review skill, assign, or revise.',
        'The coordinator records the findings, loads `dude-receiving-code-review`, and assigns a different reviser if available and credible',
        'The selected reviser validates each finding, addresses accepted findings, and reruns focused verification without self-approving or selecting a reviewer.',
        'The coordinator sends the revision to an independent reviewer for re-review.',
        'A second failure on the same finding escalates to the user',
      ],
      ruleLine: '1. The reviewer records and returns its verdict, concrete findings, and optional reviser recommendation; it does not load the receiving-review skill, assign, or revise.',
    },
    {
      relative: 'src/skills/dude-receiving-code-review/SKILL.md',
      heading: '## Revision Procedure',
      needles: [
        'The selected reviser or original author validates and addresses findings',
        'the coordinator owns assignment and selection of the next independent reviewer.',
        'report the result to the coordinator for independent re-review.',
        'self-approve, assign revision ownership, or select the next reviewer.',
      ],
      ruleLine: 'The selected reviser or original author validates and addresses findings; the coordinator owns assignment and selection of the next independent reviewer.',
    },
  ];

  for (const contract of contracts) {
    assertSectionIncludesAll(contract.relative, contract.heading, contract.needles);
    assertSectionRuleRejectsMutations(contract.relative, contract.heading, contract.ruleLine);
  }
});

test('T008 routing, lane, Work, and completion safety stay in their owning sections', () => {
  const contracts = [
    {
      relative: 'src/skills/dude-generic-routing/SKILL.md',
      heading: '## Routing Algorithm',
      needles: [
        'direct `.github/agents/*.agent.md` entries are the closed candidate set',
        'a unique literal artifact type or file suffix match',
        'Incidental mentions',
        'the emitted identity must resolve uniquely to one discovered entry',
        'zero matches or ambiguous top matches',
        'Do not dispatch or invent a specialist identity.',
      ],
      ruleLine: '6. **Fail closed**: zero matches or ambiguous top matches must be reported, escalated, or clarified. Do not dispatch or invent a specialist identity.',
    },
    {
      relative: 'src/skills/dude-lightweight-execution/SKILL.md',
      heading: '## Authority And Ownership',
      needles: [
        '`tasks.md` is the sole live execution board in Lightweight Execution.',
        'A generated board view is derived, not canonical or another live source of truth',
        'After Beads import, Beads is the sole authority and live board.',
        '`tasks.md` becomes only a one-way, non-authoritative mirror',
      ],
      ruleLine: 'After Beads import, Beads is the sole authority and live board. `tasks.md` becomes only a one-way, non-authoritative mirror; stop this lane and load the tracked workflow.',
    },
    {
      relative: 'src/skills/dude-lightweight-execution/SKILL.md',
      heading: '## Lightweight Close Protocol',
      needles: [
        'Fresh evidence must exist before `[x]`.',
        'Only the coordinator runs `board.mjs set ... done --write`',
        'Implementation alone never closes a task.',
      ],
      ruleLine: 'Implementation alone never closes a task. If evidence, review, ownership, render, or lint fails, do not mark `[x]`; report or route the blocker.',
    },
    {
      relative: 'src/skills/dude-work/SKILL.md',
      heading: '## Detect The Lane Once',
      needles: [
        'If `bd list --all --limit 0 --json` returns any imported issue, use Tracked Execution.',
        '`no ready Beads work` stops; do not fall through to Lightweight.',
        'Work never imports a feature or invents a lane.',
      ],
      ruleLine: '1. If `bd list --all --limit 0 --json` returns any imported issue, use Tracked Execution. Resume executable in-progress work, otherwise use `bd ready --json`. `no ready Beads work` stops; do not fall through to Lightweight.',
    },
    {
      relative: 'src/skills/dude-work/SKILL.md',
      heading: '## Boundaries',
      needles: [
        'Work is not a lane and never imports a feature.',
        'Do not edit user intent or definition artifacts',
        'Never create new state',
        'No auto-commit, push, or other VCS mutation.',
        'Never bypass verification, independent review when required, or coordinator-only state and close authority.',
      ],
      ruleLine: '- Never bypass verification, independent review when required, or coordinator-only state and close authority.',
    },
    {
      relative: 'src/skills/dude-verification-before-completion/SKILL.md',
      heading: '## Gate',
      needles: [
        'Run it now; prior output and specialist self-report are not fresh evidence.',
        'Fresh evidence is required before `[x]`.',
        'Fresh evidence is required before `bd close`.',
      ],
      ruleLine: 'Fresh evidence is required before `[x]`. Fresh evidence is required before `bd close`. Implementation, review, or an earlier green run alone cannot authorize either mutation.',
    },
    {
      relative: 'src/instructions/dude.instructions.md',
      heading: '# Dude Shared Rules',
      needles: [
        'Current-only rule: a retired Dude workflow, layout, state, or migration request is unsupported.',
        'Do not scan, translate, migrate, delete, or mutate retired Dude state',
        'Destructive rule: if the required persisted or fresh preview/plan, expected current state, or literal exact confirmation is missing or mismatched, refuse before any write.',
      ],
      ruleLine: '11. Destructive rule: if the required persisted or fresh preview/plan, expected current state, or literal exact confirmation is missing or mismatched, refuse before any write. Never claim an unobserved review or confirmation.',
    },
  ];

  for (const contract of contracts) {
    assertSectionIncludesAll(contract.relative, contract.heading, contract.needles);
    assertSectionRuleRejectsMutations(contract.relative, contract.heading, contract.ruleLine);
  }
});

test('T008 lint and public references resolve exact current heading names', () => {
  const lintWhen = markdownSection(read('src/skills/dude-lint/SKILL.md'), '## When To Run');
  const headingReferences = [
    ['`dude-feature-definition` (`## Validation And Handoff`)', 'src/skills/dude-feature-definition/SKILL.md', '## Validation And Handoff'],
    ['`dude-team-expansion` (`## Workflow`)', 'src/skills/dude-team-expansion/SKILL.md', '## Workflow'],
    ['`dude-skill-authoring` (`## Workflow`)', 'src/skills/dude-skill-authoring/SKILL.md', '## Workflow'],
    ['`dude-memory-ledger` (`## Verification`)', 'src/skills/dude-memory-ledger/SKILL.md', '## Verification'],
    ['`dude-lightweight-execution` (`## Lightweight Close Protocol`)', 'src/skills/dude-lightweight-execution/SKILL.md', '## Lightweight Close Protocol'],
    ['`dude-pack-beads-spec-import` (`## Import Algorithm`)', 'library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md', '## Import Algorithm'],
    ['`dude-portability` (`## Deploy Or Import`)', 'src/skills/dude-portability/SKILL.md', '## Deploy Or Import'],
    ['`dude-bundle-import` (`## Workflow`)', 'src/skills/dude-bundle-import/SKILL.md', '## Workflow'],
    ['`dude-bundle-upgrade` (`## Workflow`)', 'src/skills/dude-bundle-upgrade/SKILL.md', '## Workflow'],
  ];
  for (const [reference, target, heading] of headingReferences) {
    assert.ok(lintWhen.includes(reference), `lint reference ${reference}`);
    assert.doesNotThrow(() => markdownSection(read(target), heading), `${target} ${heading}`);
  }
  assert.doesNotMatch(lintWhen, /\b(?:Step|step) \d+\b/);

  const lintChecks = markdownSection(read('src/skills/dude-lint/SKILL.md'), '## Checks');
  const definitionException = 'Spec Lead is exempt because `Spec Lead ## Required Workflow` and `Feature Definition ## First Definition Transaction` explicitly delegate definition-time maintenance';
  assert.ok(lintChecks.includes(definitionException));
  assert.doesNotThrow(() => markdownSection(read('src/agents/dude-spec-lead.agent.md'), '## Required Workflow'));
  assert.doesNotThrow(() => markdownSection(read('src/skills/dude-feature-definition/SKILL.md'), '## First Definition Transaction'));
  assertSectionRuleRejectsMutations(
    'src/skills/dude-lint/SKILL.md',
    '## Checks',
    '   - Fail when any `.github/agents/*.agent.md` (except `dude.agent.md` and `dude-spec-lead.agent.md`) is missing the `**Coordinator-only artifacts:**` block from `dude-team-expansion`. Spec Lead is exempt because `Spec Lead ## Required Workflow` and `Feature Definition ## First Definition Transaction` explicitly delegate definition-time maintenance of `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events.',
  );

  const responsibilityMap = markdownSection(read('docs/reference.md'), '## Responsibility Map');
  assert.ok(responsibilityMap.includes('[`Routing Algorithm`](../.github/skills/dude-generic-routing/SKILL.md#routing-algorithm)'));
  assert.doesNotThrow(() => markdownSection(read('src/skills/dude-generic-routing/SKILL.md'), '## Routing Algorithm'));
  assertSectionRuleRejectsMutations(
    'docs/reference.md',
    '## Responsibility Map',
    '[`Routing Algorithm`](../.github/skills/dude-generic-routing/SKILL.md#routing-algorithm)',
  );
});

test('T008 Work retains limits, all natural stops, and non-negotiable boundaries', () => {
  const work = read('src/skills/dude-work/SKILL.md');
  assert.match(work, /Default `3`[^\n]*Hard floor `1`[^\n]*soft ceiling `25`/i);
  for (const stop of [
    'no ready task',
    'no ready Beads work',
    'blocked',
    'verification failed',
    'reviewer rejected',
    'clarification required',
    'two failed attempts',
    'ambiguous state',
    'tool error',
    'iteration limit reached',
  ]) {
    assert.ok(work.includes(stop), `Work stop: ${stop}`);
  }
  for (const boundary of [
    /never silently retry/i,
    /no auto-commit/i,
    /never imports? (?:a )?feature/i,
    /(?:never|do not)[^\n]*(?:edit|change)[^\n]*(?:intent|definition artifacts)/i,
    /(?:never|do not)[^\n]*create[^\n]*new state/i,
  ]) assert.match(work, boundary, `Work boundary: ${boundary}`);

  assertMatchesAll('src/skills/dude-parallel-dispatch/SKILL.md', [
    /cap[^\n]*2/i,
    /explicit[^\n]*(?:opt-in|confirmation)[^\n]*(?:above|over)[^\n]*2/i,
    /`\[P\]` is only a candidate signal/i,
    /same-companion[^\n]*same-package[^\n]*only when each is `\[P\]`/i,
    /known and disjoint/i,
    /unknown sets[^\n]*shared files or state[^\n]*dependencies[^\n]*blockers[^\n]*sequential/i,
    /serial/i,
  ]);

  assertSectionRuleRejectsMutations(
    'src/skills/dude-parallel-dispatch/SKILL.md',
    '## Rules',
    '- Prefer different companion ideas and spec packages. Same-companion and same-package tasks may run together only when each is `[P]` and the no-relation, known-disjoint-write proof passes.',
  );
});

test('active consumers and writers contain no retired workflow contract tokens', () => {
  for (const token of RETIRED_EXACT_TOKENS) {
    assert.deepEqual(filesContaining(token), [], `retired token ${JSON.stringify(token)}`);
  }

  const oldRootContracts = [
    /root\s+`brief\/`/i,
    /root\s+`specs\/`/i,
  ];
  for (const pattern of oldRootContracts) {
    const matches = ACTIVE_SOURCE_FILES.filter((relative) => pattern.test(read(relative)));
    assert.deepEqual(matches, [], `retired root contract ${pattern}`);
  }
});

test('active workflow retains canonical intake, ownership, task, and memory contracts', () => {
  assert.ok(filesContaining('@dude brainstorm <idea>').length > 0, 'brainstorm command');
  assert.ok(filesContaining('.dude/ideas/<slug>.md').length > 0, 'flat canonical ideas');
  assert.ok(filesContaining('.dude/specs/<feature>/spec.md').length > 0, 'canonical package spec');

  const ownershipFiles = ACTIVE_SOURCE_FILES.filter((relative) => {
    const content = read(relative);
    return content.includes('spec_path:')
      && content.includes('status: defined')
      && /exact(?:ly)?[^\n]*spec_path|spec_path[^\n]*exact/i.test(content);
  });
  assert.ok(ownershipFiles.length > 0, 'exact spec_path ownership');

  const lightweight = read('src/skills/dude-lightweight-execution/SKILL.md');
  assert.match(lightweight, /T001@a1b2c3d4/);
  for (const glyph of ['- [ ]', '- [~]', '- [!]', '- [x]']) {
    assert.ok(lightweight.includes(glyph), `canonical task glyph ${glyph}`);
  }

  const memory = read('src/skills/dude-memory-ledger/SKILL.md');
  for (const target of ['decisions.md', 'guardrails.md', 'context.md', 'lessons.md']) {
    assert.ok(memory.includes(`.dude/memory/${target}`), `canonical memory target ${target}`);
  }
});

test('continuous work uses only the canonical ownership gate wording', () => {
  const work = read('src/skills/dude-work/SKILL.md');
  assert.equal(work.includes('After the ownership and legacy gates pass'), false);
  assert.equal(
    work.includes('After the canonical ownership gate passes but before the first claim'),
    true,
  );
});

test('every current writer keeps mutation path containment checks', () => {
  for (const relative of CURRENT_WRITERS) {
    const content = read(relative);
    assert.match(content, /import\s+\{[^}]*resolveMutationPath[^}]*\}\s+from\s+'\.\.\/dude-engine\/lib\/workspace-paths\.mjs'/s, relative);
    assert.match(content, /resolveMutationPath\s*\(/, relative);
  }
});

test('project-owned standing guidance is current-only while decision history stays immutable', () => {
  assert.equal(fs.statSync(path.join(ROOT, PROJECT_SKILL)).isFile(), true, PROJECT_SKILL);

  const projectSkill = read(PROJECT_SKILL);
  for (const token of RETIRED_EXACT_TOKENS) {
    assert.equal(projectSkill.includes(token), false, `retired project guidance ${JSON.stringify(token)}`);
  }

  const existingPrivateMemory = PRIVATE_PROJECT_MEMORY.filter((relative) => (
    fs.existsSync(path.join(ROOT, relative))
  ));
  assert.ok(
    existingPrivateMemory.length === 0 || existingPrivateMemory.length === PRIVATE_PROJECT_MEMORY.length,
    `private project memory must be complete or absent; found ${existingPrivateMemory.length}/${PRIVATE_PROJECT_MEMORY.length}`,
  );
  if (existingPrivateMemory.length === 0) return;
  for (const relative of PRIVATE_PROJECT_MEMORY) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }

  const decisions = read('.dude/memory/decisions.md');
  const currentStart = decisions.indexOf(CURRENT_ONLY_DECISIONS_HEADING);
  assert.ok(currentStart > 0, 'current-only decisions heading');
  const historicalDecisions = decisions.slice(0, currentStart);
  const currentDecisions = decisions.slice(currentStart);
  assert.match(historicalDecisions, /@dude draft\b/, 'earlier decision bytes remain historical evidence');

  const activeMemory = [
    read('.dude/memory/guardrails.md'),
    read('.dude/memory/context.md'),
    currentDecisions,
    read('.dude/memory/lessons.md'),
  ].join('\n');
  for (const pattern of RETIRED_ACTIVE_GUIDANCE_PATTERNS) {
    assert.doesNotMatch(activeMemory, pattern, `retired active memory guidance ${pattern}`);
  }
  assert.match(currentDecisions, /sole intake command/);
  assert.match(currentDecisions, /supported lifecycle verbs/);
  assert.match(currentDecisions, /external\/manual recovery/);
});

test('project-owned dogfood footprint is separate and excludes feature history', () => {
  const manifest = JSON.parse(read('scripts/prompt-audit-profiles.json'));
  assert.deepEqual(manifest.dogfood_guidance.members, PROJECT_STANDING_GUIDANCE);

  const releaseMembers = Object.values(manifest.profiles)
    .flatMap((profile) => profile.members);
  for (const member of PROJECT_STANDING_GUIDANCE) {
    assert.equal(releaseMembers.includes(member), false, `${member} stays outside release/source totals`);
  }
  assert.equal(
    manifest.dogfood_guidance.members.some((member) => /^\.dude\/(?:ideas|specs)\//.test(member)),
    false,
    'idea and specification history is not standing dogfood guidance',
  );
});

// Deterministic maintenance consumers that were decoupled from schema-v0
// reconciliation and legacy-workspace gating. Kept as its own additive
// inventory so later slices can extend the active lists above without conflict.
const MAINTENANCE_CONSUMERS = [
  'scripts/build-dev.mjs',
  'src/skills/dude-compose/compose.mjs',
  'src/skills/dude-bundle-upgrade/upgrade.mjs',
];

const RETIRED_MAINTENANCE_TOKENS = [
  'reconcile-profile',
  'schema-v0',
  'PROFILE_RECONCILE',
  'legacy_layout',
  '.github/dudestuff',
  'assertCanonicalMutationLayout',
  'mutationLayoutIssues',
  'legacyWorkspacePaths',
  'belongsToLegacyRoot',
  'OBSOLETE_GENERATED_MANIFEST',
  '@dude migrate layout',
];

test('maintenance consumers dropped schema-v0 reconciliation and legacy-workspace coupling', () => {
  assert.equal(new Set(MAINTENANCE_CONSUMERS).size, MAINTENANCE_CONSUMERS.length);
  for (const relative of MAINTENANCE_CONSUMERS) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }

  for (const token of RETIRED_MAINTENANCE_TOKENS) {
    assert.deepEqual(
      filesContaining(token, MAINTENANCE_CONSUMERS),
      [],
      `retired maintenance token ${JSON.stringify(token)}`,
    );
  }

  for (const relative of MAINTENANCE_CONSUMERS) {
    assert.match(read(relative), /resolveMutationPath/, relative);
  }
});

test('upgrade recovery guidance is current-only in source and generated copies', () => {
  const source = read('src/skills/dude-bundle-upgrade/SKILL.md');
  const generated = read('.github/skills/dude-bundle-upgrade/SKILL.md');

  for (const content of [source, generated]) {
    assert.doesNotMatch(content, /@dude migrate layout\b/);
    assert.match(content, /external or manual recovery/i);
    assert.match(content, /install or copy a current bundle engine|reinstall the current bundle/i);
    assert.match(content, /no in-bundle migration/i);
    assert.match(content, /cryptographically random suffix/);
    assert.match(content, /existing plan bytes are never overwritten/);
    assert.match(content, /metadata manifest, log, branch, and commit transition/i);
    assert.match(content, /hooks are disabled only for.*branch checkout.*commit/i);
    assert.match(content, /safety tag and upgrade branch/i);
    assert.match(content, /locally controlled workspace without concurrent hostile mutation/);
  }
  assert.equal(generated, source);
});

const OPTIONAL_PACK_ACTIVE_SOURCE_FILES = [
  'library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md',
  'library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md',
  'library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs',
  'library/packs/design/skills/dude-pack-design-workflow/SKILL.md',
];

const OPTIONAL_PACK_TEST_FILES = [
  'library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs',
  'library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs',
];

const PUBLIC_DOC_FILES = [
  'README.md',
  'docs/README.md',
  'docs/commands.md',
  'docs/prd-drafts.md',
  'docs/reference.md',
  'docs/setup.md',
  'docs/upgrading.md',
  'docs/walkthrough.md',
  'docs/workflow.md',
];

const RELEASE_BUILD_FILES = [
  'scripts/build-release.mjs',
  'scripts/build-release.test.mjs',
];

const T005_ACTIVE_CONSUMERS = [
  ...OPTIONAL_PACK_ACTIVE_SOURCE_FILES,
  ...PUBLIC_DOC_FILES,
  'scripts/build-release.mjs',
];

const T005_RETIRED_EXACT_TOKENS = [
  '@dude draft',
  '@dude migrate layout',
  'dude-workspace-migration',
  'reconcile-profile',
  'schema-v0',
  'assertCanonicalMutationLayout',
  'mutationLayoutIssues',
  '.dude/brief',
  '.github/dudestuff',
  'spec: specs/',
  'migrate-dude-layout',
  'reconcile-dude-profile',
  '@dude upgrade --allow-dirty',
];

const T005_RETIRED_CONTEXT_PATTERNS = [
  /\blegacy(?:\s+[a-z-]+){0,3}\s+(?:layout|state|intake|path|fallback)\b/i,
  /\b(?:layout|state|intake|path|fallback)(?:\s+[a-z-]+){0,3}\s+legacy\b/i,
];

test('T005 contract inventories optional-pack sources, public docs, and release files deterministically', () => {
  for (const inventory of [
    OPTIONAL_PACK_ACTIVE_SOURCE_FILES,
    OPTIONAL_PACK_TEST_FILES,
    PUBLIC_DOC_FILES,
    RELEASE_BUILD_FILES,
  ]) {
    assert.deepEqual(inventory, [...inventory].sort());
    assert.equal(new Set(inventory).size, inventory.length);
    for (const relative of inventory) {
      assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
    }
  }
  assert.equal(OPTIONAL_PACK_ACTIVE_SOURCE_FILES.length, 4);
  assert.equal(OPTIONAL_PACK_TEST_FILES.length, 2);
  assert.equal(PUBLIC_DOC_FILES.length, 9);
  assert.equal(RELEASE_BUILD_FILES.length, 2);
  for (const excluded of [
    'docs/context-footprint.md',
    'docs/context-footprint-snapshots/baseline.json',
  ]) {
    assert.equal(T005_ACTIVE_CONSUMERS.includes(excluded), false, excluded);
  }
  assert.equal(
    T005_ACTIVE_CONSUMERS.some((relative) => /^\.dude\/(?:ideas|specs)\//.test(relative)),
    false,
    'feature history stays outside the active contract inventory',
  );
  assert.equal(
    T005_ACTIVE_CONSUMERS.includes('scripts/build-release.test.mjs'),
    false,
    'negative release fixtures are tests, not active consumers',
  );
});

test('T005 active optional-pack, documentation, and release consumers contain no compatibility contract', () => {
  for (const token of T005_RETIRED_EXACT_TOKENS) {
    assert.deepEqual(
      filesContaining(token, T005_ACTIVE_CONSUMERS),
      [],
      `retired T005 token ${JSON.stringify(token)}`,
    );
  }
  for (const pattern of T005_RETIRED_CONTEXT_PATTERNS) {
    const matches = T005_ACTIVE_CONSUMERS.filter((relative) => pattern.test(read(relative)));
    assert.deepEqual(matches, [], `retired T005 context ${pattern}`);
  }
});

test('optional-pack contracts retain target safety, exact ownership, complete inventory, and ambiguity refusal', () => {
  const helper = read('library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs');
  assert.match(helper, /import\s+\{\s*resolveMutationPath\s*\}\s+from\s+'\.\.\/dude-engine\/lib\/workspace-paths\.mjs'/);
  assert.ok((helper.match(/resolveMutationPath\s*\(/g) || []).length >= 2, 'both canonical feature targets are resolved');
  assert.match(helper, /import \{ resolveFeatureOwner \} from '\.\.\/dude-engine\/lib\/feature\.mjs'/, 'shared feature resolver');
  assert.match(helper, /resolveFeatureOwner\(\{ root, specPath \}\)/, 'exact canonical owner query');
  assert.match(helper, /result\.diagnostics\.length !== 0 \|\| !result\.owner/, 'fail closed on every diagnostic or missing owner');
  assert.doesNotMatch(helper, /readdirSync\(ideasDir\)|parseFrontmatterScalars|resolveSpecIdentity/, 'no local ownership scan');
  assert.match(helper, /Object\.freeze\(\['list', '--all', '--limit', '0', '--json'\]\)/, 'complete Beads inventory');

  const design = read('library/packs/design/skills/dude-pack-design-workflow/SKILL.md');
  assert.match(design, /If zero or multiple ideas claim that exact path,[\s\S]{0,220}stop before any idea, spec, log, status, routing, or task mutation/);
  assert.match(design, /exact canonical `spec_path` equality is the only owner match/);
});

test('public docs retain current verbs, lifecycle draft status, canonical manifest, and upgrade rollback', () => {
  const commands = read('docs/commands.md');
  for (const verb of ['brainstorm', 'define', 'status', 'track', 'work', 'flag', 'diff', 'self-check']) {
    assert.ok(commands.includes(`@dude ${verb}`), `supported public verb ${verb}`);
  }
  assert.match(read('README.md'), /status: draft\|defined/);
  assert.match(read('docs/walkthrough.md'), /^status: draft$/m);
  assert.match(read('docs/prd-drafts.md'), /PRD draft or product brief/);

  const setup = read('docs/setup.md');
  assert.match(setup, /\.dude\/metadata\/bundle-manifest\.md` as the sole manifest/);
  const upgrading = read('docs/upgrading.md');
  assert.match(upgrading, /one manifest at `\.dude\/metadata\/bundle-manifest\.md`/);
  assert.match(upgrading, /@dude upgrade --dry-run/);
  assert.match(upgrading, /@dude upgrade --rollback/);
  assert.match(upgrading, /does not translate project-state, profile, or manifest\s+formats/);
});

test('release assertions do not positively require or forbid the transitional migration provider', () => {
  const releaseTest = read('scripts/build-release.test.mjs');
  assert.doesNotMatch(releaseTest, /dude-workspace-migration/);
  assert.match(releaseTest, /must contain exactly one canonical manifest/);
  assert.match(releaseTest, /assert\.doesNotMatch\(text, \/@dude draft/);
  assert.match(releaseTest, /assert\.doesNotMatch\(text, \/\\\.dude\\\/brief/);
  assert.match(releaseTest, /assert\.doesNotMatch\(text, \/\(\?:\^\|\\n\)## Draft/);
});

test('atomic definition recovery exports a filesystem-free tracked refusal guard', () => {
  const source = read('src/skills/dude-feature-definition/atomic-file-batch.mjs');
  const guardStart = source.indexOf('export function assertDefinitionRecoveryWritable');
  const batchStart = source.indexOf('export function applyAtomicFileBatch');
  assert.ok(guardStart >= 0, 'tracked definition recovery guard is exported');
  assert.ok(batchStart > guardStart, 'tracked refusal is declared before the file batch helper');

  const guard = source.slice(guardStart, batchStart);
  assert.match(guard, /options\.lane === 'tracked'/);
  assert.match(guard, /tracked definition recovery is unsupported before filesystem mutation/);
  assert.match(guard, /code: 'tracked-definition-recovery-unsupported'/);
  assert.doesNotMatch(guard, /\bfs\./);
});

test('T006 authority keeps one guarded Lightweight derived-artifact repair exception', () => {
  const authorityFiles = [
    'src/agents/dude.agent.md',
    'src/agents/dude-spec-lead.agent.md',
    'src/instructions/dude.instructions.md',
    'src/skills/dude-feature-definition/SKILL.md',
  ];
  const absoluteClaims = [
    /Only explicit `define <slug>` may create or refresh a package/i,
    /Only during explicit `brainstorm` or `define`,[^\n]*definition writes/i,
    /maintains definition metadata and history only during the explicit definition workflow/i,
    /definition artifacts, metadata, and definition log events only through the explicit `define` delegation/i,
    /During explicit `brainstorm` or `define`,[^\n]*Specialists otherwise do not mutate workflow state/i,
  ];
  const contradictory = authorityFiles.flatMap((relative) => visibleMarkdown(read(relative)).split('\n'))
    .filter((line) => absoluteClaims.some((pattern) => pattern.test(line)))
    .filter((line) => !/(?:Work-authorized|unchanged-intent|exception|except|ordinary package)/i.test(line));
  assert.deepEqual(contradictory, [], 'absolute definition-write claims must state the guarded Work exception');

  assertSectionMatchesAll('src/agents/dude.agent.md', '## Lifecycle', [
    /^(?=[^\n]*(?:sole|only))(?=[^\n]*explicit `brainstorm(?: <idea>)?`)(?=[^\n]*(?:user[- ]intent|intent change)).+$/im,
    /^(?=[^\n]*(?:sole|only))(?=[^\n]*explicit `define(?: <slug>)?`)(?=[^\n]*(?:package|create|refresh)).+$/im,
  ]);
  assertSectionMatchesAll('src/agents/dude.agent.md', '## Work', [
    /^(?=[^\n]*Work-authorized)(?=[^\n]*unchanged-intent)(?=[^\n]*derived[- ](?:artifact|definition))(?=[^\n]*existing Lightweight package).+$/im,
    /^(?=[^\n]*tracked(?: definition)? recovery)(?=[^\n]*refus)(?=[^\n]*before writes).+$/im,
  ]);
  assertSectionMatchesAll('src/agents/dude.agent.md', '## Flag', [
    /flag never delegates definition writes[^\n]*(?:must not|never)[^\n]*(?:mutate|write)[^\n]*definition artifacts/i,
  ]);
  assertSectionMatchesAll('src/agents/dude-spec-lead.agent.md', '## Required Workflow', [
    /^(?=[^\n]*Work-authorized)(?=[^\n]*unchanged-intent)(?=[^\n]*existing Lightweight package)(?=[^\n]*stag).+$/im,
    /flag[^\n]*delegates no definition writes/i,
    /^(?=[^\n]*tracked definition recovery)(?=[^\n]*refus)(?=[^\n]*before writes).+$/im,
  ]);
  assertSectionMatchesAll('src/instructions/dude.instructions.md', '# Dude Shared Rules', [
    /^(?=[^\n]*(?:sole|only) exception)(?=[^\n]*Work-authorized)(?=[^\n]*unchanged-intent)(?=[^\n]*existing Lightweight package).+$/im,
    /^(?=[^\n]*tracked(?: definition)? recovery)(?=[^\n]*refus)(?=[^\n]*before writes).+$/im,
  ]);
  assertSectionMatchesAll('src/skills/dude-feature-definition/SKILL.md', '## Re-definition', [
    /Work-authorized[\s\S]*unchanged-intent[\s\S]*existing Lightweight package/i,
    /exact[- ]owner[\s\S]*Spec Lead[\s\S]*stag/i,
    /coordinator[\s\S]*reconciliation[\s\S]*(?:execution[- ]state|state ownership)/i,
    /(?:atomic|all-or-restored)[\s\S]*verification[\s\S]*review/i,
    /tracked[\s\S]*refus[\s\S]*before writes/i,
  ]);
});

test('T006 Beads host supplies complete captured evidence to core recovery policy', () => {
  const section = markdownSection(
    read('library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md'),
    '### Continuous Work',
  );
  assert.match(section, /^(?=[^\n]*capture)(?=[^\n]*complete[^\n]*list)(?=[^\n]*detail)(?=[^\n]*history).+$/im);
  assert.match(section, /^(?=[^\n]*(?:supply|pass|inject))(?=[^\n]*trusted)(?=[^\n]*`normalizeRecoveryEvidence`)(?=[^\n]*`normalizeTrackedEvidence`)(?=[^\n]*recovery).+$/im);
  assert.match(section, /`dude-work`[^\n]*owns[^\n]*(?:inspection and recovery|detailed)[^\n]*policy/i);
  assert.equal(section.split(/\n\s*\n/).length, 1, 'Beads recovery integration stays one terse pointer');
});

test('T007 Work is the sole detailed normative inspection and recovery owner', () => {
  assert.equal(new Set(RECOVERY_POLICY_CONSUMERS).size, RECOVERY_POLICY_CONSUMERS.length);
  for (const relative of [RECOVERY_POLICY_OWNER, ...RECOVERY_POLICY_CONSUMERS]) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }

  const owner = markdownSection(read(RECOVERY_POLICY_OWNER), '## Inspection And Recovery');
  assert.match(owner, /one complete model packet/i);
  assert.match(owner, /Only `--recover-on-block` permits recovery/i);
  assert.match(owner, /`authorizeAttempt`[^\n]*`completeAttempt`/i);
  assert.match(owner, /unchanged-intent[^\n]*definition recovery/i);

  const headingOwners = [RECOVERY_POLICY_OWNER, ...RECOVERY_POLICY_CONSUMERS]
    .filter((relative) => visibleMarkdown(read(relative)).split('\n')
      .some((line) => line.trim() === '## Inspection And Recovery'));
  assert.deepEqual(headingOwners, [RECOVERY_POLICY_OWNER]);

  const forbiddenDetails = [
    ['command grammar', /(?:@dude work[^\n]*(?:--max|--until blocked|--parallel)|--(?:recover-on-block|recovery-cycles)\b)/i],
    ['numeric packet bounds', /(?:\b16\b[^\n]{0,48}\b(?:available )?(?:evidence )?items?\b|\b65[,_]?536\b[^\n]{0,48}\b(?:UTF-8 )?bytes?\b)/i],
    ['runtime transition fields', /\b(?:authorizeAttempt|completeAttempt|RunState|evidenceHash|approachHash|resultHash|recoveryUsed)\b/],
    ['CLI or source wire schema', /\bcanonical base64\b|\{`?substantive`?,`?presentation\?`?\}/i],
  ];
  for (const relative of RECOVERY_POLICY_CONSUMERS) {
    const content = visibleMarkdown(read(relative));
    for (const [label, pattern] of forbiddenDetails) {
      assert.doesNotMatch(content, pattern, `${relative} duplicates recovery ${label}`);
    }
    const detailedTransitionParagraphs = content.split(/\n\s*\n/)
      .filter((paragraph) => [
        /\b(?:authorize|authorization|attempt)\b/i,
        /\b(?:charge|increment|counter|pending|budget)\b/i,
        /\b(?:complete|completion|interrupt|clear|refund)\b/i,
      ].every((pattern) => pattern.test(paragraph)));
    assert.deepEqual(
      detailedTransitionParagraphs,
      [],
      `${relative} duplicates a detailed recovery transition paragraph`,
    );
  }
});

test('T008 Work detailed owner defines the sequential-v1 recovery trust boundary', () => {
  const source = read(RECOVERY_POLICY_OWNER);
  const grammar = markdownSection(source, '## Grammar And Limits');
  const recovery = markdownSection(source, '## Inspection And Recovery');
  const failures = [
    ...missingParagraphRequirements(grammar, [
      ['every positive --parallel value is compatibility-only', [
        [/--parallel/i, /positive/i, /compatib/i],
        [/(?:effective|normaliz)[^\n]{0,32}(?:capacity|policy\.parallel|parallel)[^\n]{0,16}(?:`1`|1|one)/i],
      ]],
      ['invalid --parallel values reject before mutation', [/--parallel/i, /(?:zero|`0`)/i, /signed/i, /unsafe/i, /non-ASCII/i, /unlimited/i, /symbolic/i, /missing/i, /malformed/i, /duplicate/i, /reject|refus/i]],
    ]),
    ...missingParagraphRequirements(recovery, [
      ['one Assessment is bound to its Inspection evidenceHash', [
        [/one[^\n]{0,24}(?:model )?Assessment/i, /`?evidenceHash`?/i],
        [/(?:Assessment[^\n]{0,80}(?:bound|carr)[^\n]{0,48}Inspection|Inspection[^\n]{0,80}(?:bound|carr)[^\n]{0,48}Assessment)/i, /`?evidenceHash`?/i],
      ]],
      ['authorization freshly refuses evidence drift without state changes', [/authoriz/i, /fresh(?:ly)?[^\n]{0,32}(?:recompute|rebuild|Inspection)/i, /evidence-drift/i, /unchanged[^\n]{0,32}(?:state|counter|pending|completed)/i]],
      ['CLI byte fields use canonical base64', [/CLI/i, /byte/i, /canonical[^\n]{0,16}base64/i, /(?:RFC ?4648|padding|re-encod)/i]],
      ['captured source records use exact shallow source-specific envelopes', [
        [/\{`?substantive`?,`?presentation\?`?\}/i, /exact|closed/i],
        [/presentation/i, /(?:shallow|top-level|non-recursive)/i, /source-specific/i],
        [/substantive/i, /(?:nested|every)/i, /(?:`?id`?|`?summary`?)/i, /hash/i],
      ]],
      ['actions retain their hardcoded check sets', [
        [/hardcoded|exact/i, /check/i],
        [/execute-task/i, /retry-task/i, /verification/i],
        [/address-test/i, /lint/i, /verification/i],
        [/address-review/i, /review/i, /verification/i],
        [/reconcile-derived-definition/i, /lint/i, /review/i, /verification/i],
        [/retain-learning/i, /lint/i],
        [/action[^\n]{0,12}(?:`none`|none)/i, /(?:no checks|empty)/i],
      ]],
      ['recovery permits only one pending authorization and no concurrency', [
        [/at most one|zero or one|single/i, /pending[^\n]{0,24}authorization/i],
        [/(?:no|never)[^\n]{0,32}concurrent[^\n]{0,24}pending/i],
        [/(?:no|never)[^\n]{0,32}fan-out[^\n]{0,24}authority/i],
      ]],
      ['tracked definition refusal occurs after inspection and Assessment validation', [
        [/tracked[^\n]{0,32}definition recovery/i, /(?:only )?after[^\n]{0,48}(?:fresh )?Inspection/i, /Assessment[^\n]{0,24}validat/i, /before[^\n]{0,32}(?:helper|write)/i, /refus|unsupported/i],
      ]],
      ['Lightweight definition recovery has the exact four-path scope', [/exact[^\n]{0,24}(?:four|4)[- ]path|exact owner/i, /owner[^\n]{0,16}(?:ledger|idea)/i, /`spec\.md`/i, /`plan\.md`/i, /`tasks\.md`/i, /`contracts\/schemas\.md`[^\n]{0,24}(?:exclude|refus|explicit definition)/i]],
      ['definition recovery byte-preserves all user-owned sections', [/byte/i, /`?## Idea`?/i, /`?## Open Questions`?/i, /`?## Assumptions`?/i, /preserv|compar/i]],
      ['durable retention depends on owner-inspected current state', [/retention|durable/i, /owner/i, /inspect/i, /current/i, /duplicates/i, /overlaps/i, /destinations?/i, /caller|model/i, /(?:cannot|must not|never)/i]],
    ]),
    ...staleRecoveryPhrases(visibleMarkdown(source)),
  ];
  assert.deepEqual(failures, [], `${RECOVERY_POLICY_OWNER}: sequential-v1 recovery contract`);
});

test('T007 recovery-specific always-loaded prompt proxy is deterministic and bounded', () => {
  assert.deepEqual(
    [...new Set(RECOVERY_PROMPT_PROXY_SELECTORS.map(({ source }) => source))].sort(),
    [
      'src/agents/dude-spec-lead.agent.md',
      'src/agents/dude.agent.md',
      'src/instructions/dude.instructions.md',
    ],
  );

  const selectedLines = RECOVERY_PROMPT_PROXY_SELECTORS.map(({ source, line }) => {
    const matchingLines = read(source).split('\n').filter((candidate) => line.test(candidate));
    assert.equal(matchingLines.length, 1, `${source}: recovery proxy line selector must match once`);
    return matchingLines[0];
  });
  const promptProxy = selectedLines.join('');
  const promptBytes = Buffer.byteLength(promptProxy, 'utf8');
  assert.equal(promptBytes, 1112, 'current recovery-specific always-loaded prompt proxy');
  assert.ok(promptBytes <= 1200, `recovery prompt proxy is ${promptBytes} bytes (limit 1200)`);
});

test('T007 feature-005 policy selection and autonomous definition-plan evidence are documented in commands', () => {
  const raw = read('docs/commands.md');
  const section = markdownSection(raw, '### `@dude work`');

  // `--policy guarded|autonomous` selector with a guarded default and explicit autonomous opt-in.
  assert.match(section, /`--policy guarded\|autonomous`/);
  assert.match(section, /The default is\s+`guarded`/);
  assert.match(section, /`autonomous` is an explicit opt-in/);
  assert.match(
    section,
    /relaxes\s+no hard stop, budget, verification, review, owner, evidence, lane, or close/i,
  );
  assert.match(
    section,
    /orthogonal to the numeric budgets and to the compatibility-only\s+`--parallel`/i,
  );
  assert.match(raw, /@dude work[^\n]*\[--policy guarded\|autonomous\]/);

  // Autonomous-only `definition-plan` evidence ordered between task-history and lane-history;
  // guarded performs no plan read.
  assert.match(section, /Under `autonomous`[\s\S]*?`definition-plan` evidence item[\s\S]*?`plan\.md`/);
  assert.match(section, /ordered between\s+`task-history`\s+and\s+`lane-history`/);
  assert.match(section, /`guarded` opens no plan path and reads no\s+plan/);
});

test('T007 feature-005 objective evaluation is documented in reference without an active registry marker', () => {
  const raw = read('docs/reference.md');
  const section = markdownSection(raw, '## Execution Workflow');

  // Objective registry: definition-compiled, plan-owned, durable task keys, placeholder-only markers.
  assert.match(section, /objective registry is definition-compiled and plan-owned/i);
  assert.match(section, /keyed by durable task keys/i);
  assert.match(
    section,
    /consumed by runtime\s+only through the `definition-plan` evidence item, never inferred/i,
  );
  assert.match(section, /markers are documented with placeholders only/i);
  assert.match(section, /Feature 005's own plan carries no active marker pair/i);
  assert.match(raw, /<OBJECTIVE_REGISTRY_START>/);
  assert.match(raw, /<OBJECTIVE_REGISTRY_END>/);

  // Exactly five retention gates in fixed order with no sixth/optional/caller-selected gate, plus
  // the always-present candidate-bound-completion verification.
  assert.match(
    section,
    /`authorization`,\s*`checkpoint`,\s*`hard-constraints`,\s*`comparison`,\s*and\s*`independent-review`/,
  );
  assert.match(section, /no sixth, optional, alias, or caller-selected\s+gate/i);
  assert.match(section, /`candidate-bound-completion`[\s\S]*?always[\s\S]*?zero objective checks/i);

  // Comparators, equivalent-tie handling, keep-or-restore, and drift/rebaseline.
  assert.match(section, /numeric threshold, ordinal levels, or a\s+unanimous rubric/i);
  assert.match(section, /Equivalent defaults to non-keep/i);
  assert.match(section, /binding drift makes the comparison incomparable, restores[\s\S]*?stops/i);
  assert.match(
    section,
    /rebaseline after explicit re-definition also\s+stops the old sequence and restores/i,
  );
  assert.match(section, /every non-keep outcome\s+restores first/i);

  // Events, dual projection into current-run and lane-history, the lane line, and no second ledger.
  assert.match(
    section,
    /comparison, learning-review, and sequence-closed events project into\s+both existing surfaces/i,
  );
  assert.match(section, /current-run capture and lane history/i);
  assert.match(section, /`- dude-run-event: `/);
  assert.match(section, /no second\s+ledger is created/i);

  // AuditSummary with exactly the four outcomes; no-objective yields no row / an empty array;
  // the audit renderer writes no file and the `no-objective` token is never listed as an outcome.
  assert.match(section, /`AuditSummary` renderer[\s\S]*?writes no file/i);
  assert.match(section, /`kept`,\s*`discarded`,\s*`blocked`,\s*or\s*`unsettled`/);
  assert.match(section, /task with no objective contributes no\s+`objectiveSequences` row/i);
  assert.match(section, /whole run with no objective yields an empty\s+`objectiveSequences` array/i);
  assert.doesNotMatch(section, /no-objective/);

  // No assembled active start/end marker occupies a standalone line in any of the three docs.
  const activeStart = '<' + '!-- dude:objective-registry:start --' + '>';
  const activeEnd = '<' + '!-- dude:objective-registry:end --' + '>';
  for (const [relative] of RECOVERY_DOC_SECTIONS) {
    const lines = read(relative).split('\n');
    assert.equal(
      lines.some((line) => line.trim() === activeStart || line.trim() === activeEnd),
      false,
      `${relative}: no active objective-registry marker on a standalone line`,
    );
  }
});

test('T007 feature-005 autonomous modes and objective lifecycle are documented in workflow', () => {
  const section = markdownSection(read('docs/workflow.md'), '### Optional Continuous Work');

  // Autonomous work modes: guarded default vs autonomous auto-authorizing; sequential; no fan-out.
  assert.match(
    section,
    /Autonomous work modes: `guarded` is the default; `autonomous` is an explicit\s+opt-in/i,
  );
  assert.match(
    section,
    /auto-authorizes the next guarded attempt at recoverable post-block,\s+post-failure, and post-review checkpoints/i,
  );
  assert.match(
    section,
    /Every settled hard stop, both numeric\s+budgets, fresh verification, and independent review still apply/i,
  );
  assert.match(section, /scheduling\s+stays sequential, with no concurrency or fan-out/i);

  // Objective lifecycle at a glance: definition-compiled, never inferred, consumed via definition-plan;
  // candidate -> checkpoint -> five gates -> keep-or-restore; non-keep restores; drift/rebaseline stops.
  assert.match(section, /Progress Objective is compiled only during\s+definition and never inferred at runtime/i);
  assert.match(section, /consumed only through the\s+`definition-plan` evidence item/i);
  assert.match(
    section,
    /candidate that a\s+checkpoint captures, then five retention gates decide keep-or-restore/i,
  );
  assert.match(section, /non-keep outcome restores the exact prestate first/i);
  assert.match(section, /drift or an\s+explicit rebaseline stops the sequence and restores/i);

  // Projection and audit line.
  assert.match(
    section,
    /comparison, learning-review, and sequence-closed events project into\s+the existing current-run and lane-history surfaces/i,
  );
  assert.match(section, /run audit is a concise renderer[\s\S]*?writes no file and creates no second ledger/i);

  // No-objective behavior: present definition-plan, registryHash null, no sequence, ordinary path.
  assert.match(
    section,
    /With no compiled objective, `autonomous` still yields a present\s+`definition-plan` evidence item with `registryHash: null`/i,
  );
  assert.match(section, /creates no evaluation\s+sequence, and follows the ordinary autonomous path/i);
});

for (const [relative, heading] of RECOVERY_DOC_SECTIONS) {
  test(`T008 ${relative} documents sequential-v1 Work recovery in its owning section`, () => {
    const section = markdownSection(read(relative), heading);
    const requirements = {
      'docs/commands.md': [
        ['optional pre-flag feature selector', [/(?:optional|zero or one)/i, /(?:`?<feature>`?|feature selector)/i, /(?:before|ahead of|precedes?)[^\n]{0,48}(?:all|any)?\s*flags?/i]],
        ['finite or unlimited overall maximum', [/(?:--max|overall[^\n]{0,32}(?:max|budget))/i, /(?:finite|positive|<N)/i, /unlimited/i]],
        ['positive --parallel input is compatibility-only and effectively sequential', [
          [/--parallel/i, /positive/i, /(?:ASCII|safe integer)/i, /compatib/i],
          [/--parallel|accepted value/i, /(?:effective|normaliz)[^\n]{0,32}(?:capacity|policy|parallel)[^\n]{0,16}(?:`1`|1|one)/i, /no[^\n]{0,32}(?:concurr|fan-out)/i],
        ]],
        ['invalid --parallel values are fully defined', [/--parallel/i, /(?:zero|`0`)/i, /signed/i, /unsafe/i, /non-ASCII/i, /unlimited/i, /symbolic/i, /missing/i, /malformed/i, /duplicate/i, /reject|invalid/i]],
        ['explicit --recover-on-block flag', [/--recover-on-block/]],
        ['finite or unlimited --recovery-cycles with default 1', [/--recovery-cycles/i, /(?:finite|positive|<N)/i, /unlimited/i, /default(?:s)?(?: to)?[^\n]{0,16}(?:`1`|1|one)/i]],
        ['ordinary post-block inspection and stop', [/(?:ordinary|without[^\n]*--recover-on-block)/i, /(?:post-block|after[^\n]*block)/i, /inspect/i, /stop/i]],
        ['independent budgets and unlimited no-progress hard stops', [/independent|separate/i, /overall|--max/i, /recovery|--recovery-cycles/i, /unlimited/i, /no-progress/i, /(?:hard|must|still)[^\n]{0,48}stop|never[^\n]{0,48}bypass|remain[^\n]{0,48}in force/i]],
        ['Assessment advice is bound to fresh Inspection evidence', [/(?:Assessment[^\n]{0,80}(?:bound|carr)[^\n]{0,48}(?:Inspection|evidenceHash)|(?:Inspection|evidenceHash)[^\n]{0,80}bound[^\n]{0,48}Assessment)/i]],
        ['CLI byte transport is canonical base64', [/CLI|implementation boundary/i, /byte/i, /canonical[^\n]{0,16}base64/i]],
        ['runtime definition recovery has exactly four paths', [/unchanged(?:[- ]intent|[^.\n]{0,40}user intent)/i, /existing\s+Lightweight/i, /exact owner/i, /owner[^\n]{0,16}(?:ledger|idea)/i, /`spec\.md`/i, /`plan\.md`/i, /`tasks\.md`/i, /exactly|only/i]],
        ['tracked definition repair inspects first and refuses before writes', [/tracked/i, /definition/i, /recovery|repair/i, /(?:inspection[- ]first|only after[^\n]{0,32}(?:fresh )?inspect)/i, /Assessment/i, /refus|unsupported/i, /before[^\n]*write/i]],
        ['durable retention requires owner inspection', [/retain|durable/i, /owner/i, /inspect/i, /current/i, /duplicates|overlaps|destination/i]],
      ],
      'docs/workflow.md': [
        ['Lightweight-only optional selector ignored in Tracked Execution', [[/optional/i, /feature selector/i, /Lightweight/i, /ignored[^\n]*Tracked/i]]],
        ['positive --parallel input has effective sequential behavior', [[/--parallel/i, /positive|accepted/i, /compatib/i, /(?:effective|normaliz)[^\n]{0,32}(?:`1`|1|one)/i, /no[^\n]{0,32}(?:concurr|simultaneous|fan-out)/i]]],
        ['explicit --recover-on-block flag', [[/--recover-on-block/]]],
        ['independent finite-or-unlimited overall and exact-target budgets with recovery default 1', [
          [/overall|--max/i, /recovery|exact target|--recovery-cycles/i, /finite|positive/i, /unlimited/i, /default(?:s)?(?: to)?[^\n]{0,24}(?:`1`|1|one)/i],
          [/independent|separate/i, /overall|--max/i, /recovery|exact-target|--recovery-cycles/i],
        ]],
        ['ordinary post-block inspection and stop', [[/(?:ordinary|without[^\n]*--recover-on-block)/i, /(?:post-block|after[^\n]*block)/i, /inspect/i, /stop/i]]],
        ['unlimited leaves hard and no-progress stops in force', [[/unlimited/i, /no-progress/i, /(?:intent|approval|authority|safety|hard)/i, /(?:stops?[\s\S]{0,48}remain[\s\S]{0,48}in force|never[\s\S]{0,48}bypass|must[\s\S]{0,48}stop)/i]]],
        ['Assessment advice is bound to fresh Inspection evidence', [[/(?:evidence[- ]bound[^\n]{0,32}(?:Assessment|advice)|(?:Assessment|advice)[^\n]{0,80}bound[^\n]{0,32}(?:Inspection|evidence)|evidenceHash)/i]]],
        ['runtime definition recovery has exactly four paths', [[/unchanged[- ]intent/i, /existing\s+Lightweight/i, /exact owner/i, /owner[^\n]{0,16}(?:ledger|idea)/i, /`spec\.md`/i, /`plan\.md`/i, /`tasks\.md`/i, /exactly|only/i]]],
        ['tracked definition repair inspects first and refuses before writes', [[/tracked/i, /definition/i, /recovery|repair/i, /(?:inspection[- ]first|only after[^\n]{0,32}(?:fresh )?inspect)/i, /Assessment/i, /refus|unsupported/i, /before[^\n]*write/i]]],
        ['durable retention requires owner inspection', [[/retain|durable/i, /owner/i, /inspect/i, /current/i, /duplicates|overlaps|destination/i]]],
        ['links to commands and the Work skill', [[/\]\(commands\.md#dude-work\)/i], [/\]\(\.\.\/\.github\/skills\/dude-work\/SKILL\.md\)/i]]],
      ],
      'docs/reference.md': [
        ['ordinary post-block inspection and stop versus explicit recovery', [[/ordinary/i, /post-block|after[^\n]*block/i, /inspect/i, /stop/i, /explicit[^\n]*recovery/i]]],
        ['positive --parallel input has effective sequential behavior', [[/--parallel/i, /positive|accepted/i, /compatib/i, /(?:effective|normaliz)[^\n]{0,32}(?:`1`|1|one)/i, /no[^\n]{0,32}(?:concurr|simultaneous|fan-out)/i]]],
        ['independent budgets and unlimited no-progress hard stops', [
          [/independent|separate/i, /overall/i, /(?:exact[- ]target|per[- ]target)[^\n]*recovery|recovery[^\n]*(?:exact[- ]target|per[- ]target)/i],
          [/unlimited/i, /no-progress/i, /(?:intent|approval|authority|safety|hard)/i, /(?:(?:does not|cannot|never)[^\n]*bypass|stop[^\n]*remain[^\n]*in force|must[^\n]*stop)/i],
        ]],
        ['Assessment advice is bound to fresh Inspection evidence', [[/(?:evidence[- ]bound[^\n]{0,32}(?:Assessment|advice)|(?:Assessment|advice)[^\n]{0,80}bound[^\n]{0,32}(?:Inspection|evidence)|evidenceHash)/i]]],
        ['runtime definition recovery has exactly four paths', [[/unchanged[- ]intent/i, /existing\s+Lightweight/i, /exact owner/i, /owner[^\n]{0,16}(?:ledger|idea)/i, /`spec\.md`/i, /`plan\.md`/i, /`tasks\.md`/i, /exactly|only/i]]],
        ['tracked definition repair inspects first and refuses before writes', [[/tracked/i, /definition/i, /recovery|repair/i, /(?:inspection[- ]first|only after[^\n]{0,32}(?:fresh )?inspect)/i, /Assessment/i, /refus|unsupported/i, /before[^\n]*write/i]]],
        ['durable retention requires owner inspection', [[/retain|durable/i, /owner/i, /inspect/i, /current/i, /duplicates|overlaps|destination/i]]],
        ['links to commands and the Work skill', [[/\]\(commands\.md#dude-work\)/i], [/\]\(\.\.\/\.github\/skills\/dude-work\/SKILL\.md\)/i]]],
      ],
    }[relative];
    assert.ok(requirements, `${relative}: recovery documentation contract`);
    const failures = [
      ...missingParagraphRequirements(section, requirements),
      ...staleRecoveryPhrases(section),
    ];
    assert.deepEqual(failures, [], `${relative} ${heading}: recovery documentation contract`);
  });
}

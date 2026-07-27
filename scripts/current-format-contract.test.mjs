// @ts-check
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFeatureOwner } from '../src/skills/dude-engine/lib/feature.mjs';
import { classifyPath, TIER } from '../src/skills/dude-engine/lib/ownership.mjs';
import { readTaskState } from '../src/skills/dude-engine/lib/task-state.mjs';
import { parseTasks } from '../src/skills/dude-engine/lib/tasks.mjs';
import {
  canonicalJson as recoveryCanonicalJson,
  sha256 as recoverySha256,
  validateAcceptedFeatureEvidenceV1,
} from '../src/skills/dude-work/recovery.mjs';
import { buildDev } from './build-dev.mjs';
import { isReleaseFile, srcToDeploy } from './build-release.mjs';

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
const CORE_DOGFOOD_LOCAL_SKILL =
  '.github/skills/dude-local-core-dogfood-promotion/SKILL.md';
const CI_WORKFLOW = '.github/workflows/ci.yml';

const CORE_DOGFOOD_BASELINE_LINE =
  '- <UTC> - core-dogfood-baseline v1 terminal=<taskKey> head=<gitOid> src_tree=<gitTreeOid>';
const CORE_DOGFOOD_ACCEPTED_LINE =
  '- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>';
const CORE_DOGFOOD_OWNED_ROOTS = ['src', '.github', '.dude'];
const CORE_DOGFOOD_GUARD_FENCE_MARKER = 'SRC_INDEX_ENTRY';
const GIT_VISIBLE_STATUS_ARGS = ['status', '--porcelain', '--untracked-files=all'];
const GIT_OWNED_IGNORED_STATUS_ARGS = [
  'status',
  '--porcelain',
  '--ignored',
  '--untracked-files=all',
  '--',
  ...CORE_DOGFOOD_OWNED_ROOTS,
];
const GIT_VISIBLE_STATUS_COMMAND = `git ${GIT_VISIBLE_STATUS_ARGS.join(' ')}`;
const GIT_OWNED_IGNORED_STATUS_COMMAND = `git ${GIT_OWNED_IGNORED_STATUS_ARGS.join(' ')}`;
const GIT_VISIBLE_STATUS_COMMAND_PATTERN =
  /\bgit status --porcelain --untracked-files=all(?=[ \t]*(?:$|[|;&"')\]}]))/m;
const GIT_OWNED_IGNORED_STATUS_COMMAND_PATTERN =
  /\bgit status --porcelain --ignored --untracked-files=all -- src \.github \.dude(?=[ \t]*(?:$|[|;&"')\]}]))/m;

const PRIVATE_PROJECT_MEMORY = [
  '.dude/memory/guardrails.md',
  '.dude/memory/context.md',
  '.dude/memory/decisions.md',
  '.dude/memory/lessons.md',
];

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

/** @param {string} source @param {string} heading */
function rawMarkdownSection(source, heading) {
  const rawLines = source.split('\n');
  const visibleLines = visibleMarkdown(source).split('\n');
  const target = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(heading);
  assert.ok(target, `invalid Markdown heading ${JSON.stringify(heading)}`);
  const targetLevel = target[1].length;
  const starts = visibleLines
    .map((line, index) => (line.trim() === heading ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(starts.length, 1, `${heading}: expected one visible exact heading`);

  const start = starts[0];
  let end = visibleLines.length;
  for (let index = start + 1; index < visibleLines.length; index += 1) {
    const next = /^ {0,3}(#{1,6})[ \t]+/.exec(visibleLines[index]);
    if (next && next[1].length <= targetLevel) {
      end = index;
      break;
    }
  }
  return rawLines.slice(start + 1, end).join('\n').trim();
}

/** @param {string} source @param {string} key */
function yamlTopLevelBlock(source, key) {
  const lines = source.split('\n');
  const starts = lines
    .map((line, index) => (line === `${key}:` ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(starts.length, 1, `${key}: expected one top-level YAML key`);

  const start = starts[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[^ \t#]/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}

/** @param {string} source @param {string} jobName */
function workflowJobSteps(source, jobName) {
  const lines = source.split('\n');
  const jobStarts = lines
    .map((line, index) => (line === `  ${jobName}:` ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(jobStarts.length, 1, `${jobName}: expected one workflow job`);

  const jobStart = jobStarts[0];
  let jobEnd = lines.length;
  for (let index = jobStart + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      jobEnd = index;
      break;
    }
  }
  const stepsStarts = lines
    .map((line, index) => (index > jobStart && index < jobEnd && line === '    steps:' ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(stepsStarts.length, 1, `${jobName}: expected one steps block`);

  /** @type {string[][]} */
  const blocks = [];
  for (let index = stepsStarts[0] + 1; index < jobEnd; index += 1) {
    if (/^      - /.test(lines[index])) blocks.push([]);
    if (blocks.length > 0) blocks.at(-1)?.push(lines[index]);
  }
  return blocks.map((block) => block.join('\n').trimEnd());
}

/** @param {string} step */
function workflowStepUses(step) {
  return /^      - uses:\s*([^\s#]+)\s*$/m.exec(step)?.[1] ?? null;
}

/** @param {string} step */
function workflowStepName(step) {
  return /^      - name:\s*(.+?)\s*$/m.exec(step)?.[1] ?? null;
}

/** @param {string} step */
function workflowStepRun(step) {
  const lines = step.split('\n');
  const runIndex = lines.findIndex((line) => /^        run:\s*/.test(line));
  if (runIndex === -1) return '';
  const scalar = lines[runIndex].replace(/^        run:\s*/, '');
  if (!/^\|[+-]?$/.test(scalar)) return scalar;

  const body = [];
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '') {
      body.push('');
      continue;
    }
    const indentation = /^ */.exec(lines[index])?.[0].length ?? 0;
    if (indentation <= 8) break;
    body.push(lines[index].slice(Math.min(indentation, 10)));
  }
  return body.join('\n').trimEnd();
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** @param {string} root @param {string[]} args */
function gitNulPaths(root, args) {
  const output = execFileSync('git', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (output.length === 0) return [];
  assert.equal(output[output.length - 1], 0, `git ${args.join(' ')}: NUL-terminated output`);
  const body = output.subarray(0, -1);
  return new TextDecoder('utf-8', { fatal: true }).decode(body).split('\0').filter(Boolean);
}

/** @param {string} root @param {string[]} args */
function gitNulTaggedPaths(root, args) {
  const output = execFileSync('git', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (output.length === 0) return [];
  assert.equal(output[output.length - 1], 0, `git ${args.join(' ')}: NUL-terminated output`);
  const body = output.subarray(0, -1);
  return new TextDecoder('utf-8', { fatal: true }).decode(body).split('\0').filter(Boolean)
    .map((entry) => {
      assert.match(entry, /^[A-Za-z?] /, `git ${args.join(' ')}: tagged path`);
      return { tag: entry[0], path: entry.slice(2) };
    });
}

/** @param {{tag: string, path: string}[]} entries */
function nonNormalGitIndexEntries(entries) {
  return entries.filter(({ tag }) => tag !== 'H');
}

/** @param {string} root */
function coreDogfoodBaselineLayers(root) {
  const source = {
    sourceIndex: gitNulPaths(root, [
      '-c', 'core.fileMode=true',
      'diff', '--cached', '--no-renames', '--name-only', '-z', '--', 'src',
    ]),
    sourceWorktree: gitNulPaths(root, [
      '-c', 'core.fileMode=true',
      'diff', '--no-renames', '--name-only', '-z', '--', 'src',
    ]),
    sourceUntracked: gitNulPaths(root, [
      'ls-files', '--others', '--exclude-standard', '-z', '--', 'src',
    ]),
    sourceIgnored: gitNulPaths(root, [
      'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', 'src',
    ]),
    sourceHiddenFlags: nonNormalGitIndexEntries(gitNulTaggedPaths(root, [
      'ls-files', '-v', '-z', '--', 'src',
    ])),
  };
  const generatedCandidates = {
    generatedIndex: gitNulPaths(root, [
      '-c', 'core.fileMode=true',
      'diff', '--cached', '--no-renames', '--name-only', '-z', '--', '.github',
    ]),
    generatedWorktree: gitNulPaths(root, [
      '-c', 'core.fileMode=true',
      'diff', '--no-renames', '--name-only', '-z', '--', '.github',
    ]),
    generatedUntracked: gitNulPaths(root, [
      'ls-files', '--others', '--exclude-standard', '-z', '--', '.github',
    ]),
    generatedIgnored: gitNulPaths(root, [
      'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', '.github',
    ]),
  };
  const knownTiers = new Set(Object.values(TIER));
  const generatedTier = (layer, candidate) => {
    assert.ok(candidate.startsWith('.github/'), `${layer}: generated path stays in .github`);
    const tier = classifyPath(candidate);
    assert.ok(knownTiers.has(tier), `${layer}: ${candidate} has a known ownership tier`);
    return tier;
  };
  const generated = Object.fromEntries(Object.entries(generatedCandidates).map(([layer, paths]) => [
    layer,
    paths.filter((candidate) => generatedTier(layer, candidate) === TIER.CORE),
  ]));
  const generatedTracked = gitNulTaggedPaths(root, [
    'ls-files', '-v', '-z', '--', '.github',
  ]).filter(({ path: candidate }) => (
    generatedTier('generatedHiddenFlags', candidate) === TIER.CORE
  ));
  const layers = {
    ...source,
    ...generated,
    generatedHiddenFlags: nonNormalGitIndexEntries(generatedTracked),
  };
  return {
    accepted: Object.values(layers).every((paths) => paths.length === 0),
    ...layers,
  };
}

/** @param {string} root @param {string} relative @param {string} content */
function writeFixture(root, relative, content) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

/**
 * Write a fixture file that Git genuinely ignores. The rule lives in the
 * repository's own `.git/info/exclude`, which is outside the worktree and the
 * index, so establishing it adds no dirt of its own to the layers under test.
 * `git clone` never copies `info/exclude`, so the file is created here and
 * appended to rather than clobbered.
 * @param {string} root @param {string} relative @param {string} content
 */
function writeIgnoredFixture(root, relative, content) {
  const exclude = path.join(root, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(exclude, `${existing}${separator}/${relative}\n`);
  writeFixture(root, relative, content);
  const verdict = spawnSync('git', ['check-ignore', '--verbose', '--', relative], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(verdict.status, 0, `${relative}: fixture path must be genuinely ignored by Git`);
  assert.ok(
    verdict.stdout.startsWith('.git/info/exclude:')
      && verdict.stdout.trimEnd().endsWith(`:/${relative}\t${relative}`),
    `${relative}: ignore verdict must come from the repository-local exclude file`,
  );
}

function temporaryCoreDogfoodRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-core-dogfood-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Dude Test']);
  git(root, ['config', 'user.email', 'dude-test@example.invalid']);
  writeFixture(root, '.gitignore', [
    '/src/ignored.txt',
    '/.github/ignored.txt',
    '/.github/skills/dude-ignored/',
    '/.dude/ignored.txt',
    '/dist/ignored.txt',
    '',
  ].join('\n'));
  for (const relative of [
    'src/tracked.txt',
    '.github/tracked.txt',
    '.dude/tracked.txt',
    'dist/tracked.txt',
  ]) {
    writeFixture(root, relative, 'baseline\n');
  }
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', 'baseline']);
  return root;
}

/** @param {string} root */
function coreDogfoodGitPredicates(root) {
  const visible = git(root, GIT_VISIBLE_STATUS_ARGS).split('\n').filter(Boolean);
  const ownedIgnored = git(root, GIT_OWNED_IGNORED_STATUS_ARGS)
    .split('\n')
    .filter((line) => line.startsWith('!! '));
  return {
    accepted: visible.length === 0 && ownedIgnored.length === 0,
    ownedIgnored,
    visible,
  };
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

test('T001 Core Dogfood Close source contract proves policy coverage only, not future Spec Lead, Reviewer, or close behavior', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const projectSkill = read(PROJECT_SKILL);
  const visibleHeadingCount = visibleMarkdown(projectSkill)
    .split('\n')
    .filter((line) => line.trim() === heading)
    .length;

  // Act
  assert.equal(
    visibleHeadingCount,
    1,
    `${PROJECT_SKILL}: expected exactly one visible ${heading} section`,
  );
  const section = markdownSection(projectSkill, heading);
  const rawSection = rawMarkdownSection(projectSkill, heading);
  const failures = missingParagraphRequirements(section, [
    ['repository-local scope is exactly authoritative core under src/** and its base-owned generated projection', [
      /repository-local/i,
      /authoritative core/i,
      /`src\/\*\*`/i,
      /base-owned/i,
      /generated/i,
    ]],
    ['static tests expressly prove policy coverage only', [
      /static tests?/i,
      /(?:policy coverage only|(?:prove|verify|check) only that (?:this|required )?policy (?:exists|is present))/i,
    ]],
    ['static tests disclaim future Spec Lead, Reviewer, and close behavior proof', [
      /static tests?/i,
      /(?:do not|never)/i,
      /prove/i,
      /future/i,
      /Spec Lead/i,
      /Reviewer/i,
      /close behavior/i,
    ]],
    ['planned exact src/** file writes require exactly one open non-parallel Shared terminal', [
      /planned/i,
      /exact/i,
      /`src\/\*\*`/i,
      /files?/i,
      /exactly one/i,
      /open/i,
      /terminal task/i,
      /\[Shared\]/i,
      /(?:non-`?\[P\]`?|without `?\[P\]`?|must not add `?\[P\]`?)/i,
    ]],
    ['declared-src is complete, unique, UTF-8-bytewise sorted, exact, and backticked', [
      /`declared-src:`/i,
      /one (?:complete )?(?:clause|declaration)|one `declared-src:` clause/i,
      /complete/i,
      /unique/i,
      /sorted/i,
      /UTF-8 bytewise lexical order/i,
      /exact/i,
      /backticked/i,
      /file paths?/i,
    ]],
    ['declared-src rejects directories and globs', [
      /`declared-src:`/i,
      /director/i,
      /glob/i,
      /invalid|reject/i,
    ]],
    ['the terminal depends by durable key on every source contributor', [
      /terminal/i,
      /depend/i,
      /durable/i,
      /every/i,
      /(?:source-contributing|contribute an accepted source change)/i,
    ]],
    ['independent definition readiness review returns REJECT', [
      /independent/i,
      /definition readiness review/i,
      /`REJECT`/i,
    ]],
    ['readiness rejects a missing terminal', [/(?:missing|no) (?:core )?terminal/i, /reject/i]],
    ['readiness rejects more than one terminal', [/(?:more than one|multiple) terminal/i, /reject/i]],
    ['readiness rejects a terminal that is not open', [/terminal/i, /not open|closed/i, /reject/i]],
    ['readiness rejects P or missing Shared', [/\[P\]/i, /(?:lacks|missing)[^\n]*\[Shared\]/i, /reject/i]],
    ['readiness rejects missing, duplicate, unsorted, incomplete, directory, or glob declarations', [
      /declaration|`declared-src:`/i,
      /missing/i,
      /duplicate/i,
      /unsorted/i,
      /incomplete/i,
      /director/i,
      /glob/i,
      /reject/i,
    ]],
    ['readiness rejects a missing contributing dependency', [
      /missing/i,
      /contribut/i,
      /depend/i,
      /reject/i,
    ]],
    ['normal definitions with no planned source write derive no terminal', [
      /no planned source write|normal no-source definition/i,
      /no (?:normal )?(?:core )?terminal/i,
    ]],
    ['feature 008 declared-src none is only a bootstrap empty-set exception', [
      /(?:this package|Feature 008)/i,
      /`declared-src: none`/i,
      /bootstrap/i,
      /exception/i,
      /empty/i,
    ]],
    ['Lightweight declaration authority is the canonical open task header', [
      /Lightweight/i,
      /canonical/i,
      /open task header/i,
      /declaration authority/i,
    ]],
    ['tracked declaration authority is corresponding Beads issue text, never tasks mirror', [
      /Tracked/i,
      /corresponding Beads issue text/i,
      /declaration authority/i,
      /`tasks\.md`/i,
      /(?:not consulted|non-authoritative mirror|not live authority)/i,
    ]],
    ['the unique owner Coordinator Log is the common evidence carrier in both lanes', [
      /unique owner/i,
      /`## Coordinator Log`/i,
      /evidence carrier/i,
      /both lanes|either lane/i,
    ]],
    ['baseline preflight binds immutable HEAD and HEAD:src after clean visible, ignored, and parity checks', [
      /baseline preflight/i,
      /immutable `HEAD`/i,
      /`HEAD:src`/i,
      /tracked/i,
      /untracked/i,
      /ignored/i,
      /`src\/\*\*`/i,
      /base-owned generated core/i,
      /parity/i,
    ]],
    ['baseline append is followed by a fresh recheck before the first source mutation', [
      /baseline line/i,
      /append/i,
      /fresh recheck|repeat/i,
      /immediately before/i,
      /first source mutation/i,
    ]],
    ['dirty preflight waits or uses a worktree only after user approval', [
      /preflight/i,
      /fail/i,
      /wait/i,
      /worktree/i,
      /user/i,
      /approv|opt-in/i,
    ]],
    ['the core interval is serialized from baseline through materialization', [
      /serializ/i,
      /baseline/i,
      /through materialization/i,
      /one core/i,
    ]],
    ['every changed source path is declared and active declaration must match acceptance', [
      /every changed source path/i,
      /declared/i,
      /active/i,
      /declaration/i,
      /match/i,
      /acceptance/i,
    ]],
    ['observed or suspected concurrency blocks without claiming actor attribution', [
      /observed or suspected concurrency/i,
      /block/i,
      /actor attribution/i,
      /locally controlled/i,
    ]],
  ]);

  const baselineCount = rawSection
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => line.trim() === CORE_DOGFOOD_BASELINE_LINE)
    .length;
  if (baselineCount !== 1) failures.push('exact baseline Coordinator Log line shape');

  // Assert
  assert.deepEqual(
    failures,
    [],
    `${PROJECT_SKILL} ${heading}: policy-only Core Dogfood Close contract`,
  );
});

test('T004 Core Dogfood project route retains the executable pre-terminal contract without post-readiness duplication', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const projectSkill = read(PROJECT_SKILL);
  const section = markdownSection(projectSkill, heading);
  const rawSection = rawMarkdownSection(projectSkill, heading);
  const failures = missingParagraphRequirements(section, [
    ['exact selected spec_path resolves one direct owner and one Coordinator Log', [
      [
        /exact selected feature `spec_path`/i,
        /(?:never|not)[^\n]*(?:slug|package directory|title|branch|task prose)/i,
      ],
      [
        /exact direct owner/i,
        /one `## Coordinator Log`/i,
        /diagnostic|multiple-owner|absent owner/i,
        /block/i,
      ],
    ]],
    ['active lane alone resolves one open non-P Shared terminal and declaration', [
      [/active lane only/i],
      [/Lightweight/i, /`tasks\.md`|canonical units/i],
      [/Tracked/i, /Beads issue text/i],
      [
        /exactly one open/i,
        /non-`?\[P\]`?|without `?\[P\]`?/i,
        /`?\[Shared\]`?/i,
        /durable task key/i,
        /`declared-src:`/i,
      ],
    ]],
    ['HEAD and HEAD:src are immutable transient base identities', [
      [/immutable/i, /`HEAD`/i, /`HEAD:src`/i, /transient/i],
      [/byte-identical/i, /block/i],
    ]],
    ['source and generated tracked layers cannot cancel', [
      /index-versus-`HEAD`/i,
      /worktree-versus-index/i,
      /independent/i,
      /offsetting|cannot cancel/i,
      /staged/i,
      /deletion/i,
      /type change/i,
      /unmerged|conflict/i,
    ]],
    ['tracked comparisons force mode-only detection despite repository configuration', [
      /`core\.fileMode=true`/i,
      /mode-only/i,
      /block|reject/i,
    ]],
    ['tracked boundaries accept only normal H tags and reject hidden index flags', [
      /tracked/i,
      /normal tag/i,
      /`H`/i,
      /assume-unchanged/i,
      /skip-worktree/i,
      /block|reject/i,
    ]],
    ['generated candidates use authoritative fail-closed ownership classification', [
      /generated/i,
      /authoritative/i,
      /classif/i,
      /fail(?:s)? closed|failure[^\n]*block/i,
      /`TIER\.CORE`/i,
      /invalid UTF-8/i,
    ]],
    ['baseline appends only after the complete clean preflight and final identity comparison', [
      /baseline/i,
      /append/i,
      /only after/i,
      /all eight/i,
      /clean/i,
      /parity/i,
      /final identity/i,
    ]],
    ['append is followed by the full immediate pre-source recheck', [
      /after the append/i,
      /immediately before the first source mutation/i,
      /owner/i,
      /terminal/i,
      /identity|`BASE_HEAD`/i,
      /clean/i,
      /parity/i,
      /stale audit history/i,
    ]],
    ['one serialized interval blocks concurrency without actor attribution', [
      /one locally controlled core interval/i,
      /baseline/i,
      /materialization/i,
      /observed or suspected concurrent/i,
      /block/i,
      /(?:do not|never)[^\n]*actor/i,
    ]],
    ['worktree fallback requires explicit user opt-in and reruns the whole contract', [
      /wait/i,
      /isolated worktree/i,
      /explicit user opt-in/i,
      /entire|whole/i,
      /contract/i,
      /afresh/i,
    ]],
    ['terminal readiness routes to the exact local skill after prerequisites clear', [
      /terminal/i,
      /ready/i,
      /source-contributing dependenc/i,
      /pre-promotion acceptance/i,
      /discover|load|route/i,
      /`dude-local-core-dogfood-promotion`/i,
    ]],
    ['specification completion alone is not a trigger', [
      /specification completion/i,
      /alone/i,
      /not a trigger|does not trigger/i,
    ]],
  ]);

  for (const needle of [
    'node src/skills/dude-engine/feature.mjs resolve',
    '--spec "$SPEC_PATH"',
    'result.owner.specPath !== specPath',
    'BASE_HEAD="$(git rev-parse --verify \'HEAD^{commit}\')"',
    'BASE_SRC_TREE="$(git rev-parse --verify \'HEAD:src\')"',
    'git -c core.fileMode=true diff --cached --no-renames --name-only -z -- src',
    'git -c core.fileMode=true diff --no-renames --name-only -z -- src',
    'git ls-files --others --exclude-standard -z -- src',
    'git ls-files --others --ignored --exclude-standard -z -- src',
    'git ls-files -v -z -- src',
    'git -c core.fileMode=true diff --cached --no-renames --name-only -z -- .github',
    'git -c core.fileMode=true diff --no-renames --name-only -z -- .github',
    'git ls-files --others --exclude-standard -z -- .github',
    'git ls-files --others --ignored --exclude-standard -z -- .github',
    'git ls-files -v -z -- .github',
    "import { classifyPath, TIER } from './src/skills/dude-engine/lib/ownership.mjs';",
    "--test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source'",
    'scripts/build-dev.test.mjs',
    CORE_DOGFOOD_BASELINE_LINE,
    CORE_DOGFOOD_LOCAL_SKILL,
  ]) {
    if (!rawSection.includes(needle)) failures.push(`pre-terminal executable contract: ${needle}`);
  }

  for (const [label, pattern] of [
    ['declared hash schema', /`declared` hashes|declared[^\n]*canonical JSON array/i],
    ['source hash schema', /`source` hashes|\{"path":"src\/example\.mjs","type":"100644","content":/i],
    ['changed hash schema', /`changed` hashes|\{"path":"src\/removed\.mjs","type":"absent"\}/i],
    ['review hash schema', /`review`[^\n]*hash|\{"version":1,"terminal":/i],
    ['protected snapshot and materializer sequence', /snapshot[^\n]*(?:`dude-pack-|protected)|`node scripts\/build-dev\.mjs`/i],
    ['full post-readiness verification matrix', /focused tests[^\n]*full repository suite[^\n]*Dude lint[^\n]*compose verification/i],
    ['accepted-line construction', /core-dogfood-accepted v1/],
    ['final-close runbook', /close uses only the latest matching accepted line/i],
  ]) {
    if (pattern.test(rawSection)) failures.push(`post-readiness detail remains in project route: ${label}`);
  }

  // Act and assert
  assert.deepEqual(failures, [], `${PROJECT_SKILL} ${heading}: concise pre-terminal route`);
});

test('T004 Core Dogfood pre-resolver gate proves hidden src index flags before any repository source executes', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const projectSkill = read(PROJECT_SKILL);
  const section = markdownSection(projectSkill, heading);
  const rawSection = rawMarkdownSection(projectSkill, heading);
  const failures = missingParagraphRequirements(section, [
    ['pre-resolver gate adds the src hidden-index-flag query and requires normal H tags', [[
      /before (?:invoking|running|executing) the source resolver/i,
      /four raw `src` dirt queries/i,
      /`git ls-files -v -z -- src`/,
      /every returned tag/i,
      /normal uppercase `H`/,
      /before[^\n]*(?:`src\/\*\*`|repository source)[^\n]*(?:invok|execut|run)/i,
    ]]],
    ['pre-resolver gate blocks lowercase and skip-worktree tags before repository source', [[
      /before (?:invoking|running|executing) the source resolver/i,
      /lowercase tag/i,
      /assume-unchanged/i,
      /`S` skip-worktree/i,
      /block/i,
      /before[^\n]*(?:invoking|executing|running)[^\n]*repository source/i,
    ]]],
  ]);

  // Act
  const anchors = [
    ['pre-resolver guard fence', CORE_DOGFOOD_GUARD_FENCE_MARKER],
    ['source resolver invocation', 'node src/skills/dude-engine/feature.mjs resolve'],
    ['ownership classifier import', 'src/skills/dude-engine/lib/ownership.mjs'],
  ].map(([label, needle]) => ({ label, index: rawSection.indexOf(needle) }));

  for (const { label, index } of anchors) {
    if (index === -1) failures.push(`missing source-execution ordering anchor: ${label}`);
  }
  const [flagQuery, ...sourceExecutions] = anchors;
  if (flagQuery.index !== -1) {
    for (const { label, index } of sourceExecutions) {
      if (index !== -1 && flagQuery.index > index) {
        failures.push(`hidden src index flags must be proven before ${label}`);
      }
    }
  }

  // Assert
  assert.deepEqual(
    failures,
    [],
    `${PROJECT_SKILL} ${heading}: fail-closed hidden-index-flag gate at the source-execution boundary`,
  );
});

test('T005 Core Dogfood pre-resolver guard blocks hidden index flags and a failing git ls-files', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const rawSection = rawMarkdownSection(read(PROJECT_SKILL), heading);
  const guardBlocks = (rawSection.match(/```bash\n[\s\S]*?\n```/g) ?? []).filter((block) => (
    block.includes(CORE_DOGFOOD_GUARD_FENCE_MARKER) && !block.includes('BASELINE_TMP')
  ));
  assert.equal(
    guardBlocks.length,
    1,
    `${PROJECT_SKILL} ${heading}: exactly one pre-resolver guard block outside the full preflight`,
  );
  const guard = guardBlocks[0].replace(/^```bash\n/, '').replace(/\n```$/, '');
  /** @param {string} cwd */
  const runGuard = (cwd) => spawnSync('bash', ['-c', guard], {
    cwd,
    encoding: 'utf8',
    stdio: 'ignore',
  });

  /** @type {Array<{name: string, arrange?: (root: string) => void, accepted: boolean}>} */
  const cases = [
    { name: 'clean src index', accepted: true },
    {
      name: 'assume-unchanged src entry',
      arrange(root) { git(root, ['update-index', '--assume-unchanged', '--', 'src/tracked.txt']); },
      accepted: false,
    },
    {
      name: 'skip-worktree src entry',
      arrange(root) { git(root, ['update-index', '--skip-worktree', '--', 'src/tracked.txt']); },
      accepted: false,
    },
  ];

  for (const fixture of cases) {
    const root = temporaryCoreDogfoodRepository();
    try {
      fixture.arrange?.(root);

      // Act
      const result = runGuard(root);

      // Assert
      assert.equal(result.error, undefined, `${fixture.name}: Bash invocation`);
      if (fixture.accepted) {
        assert.equal(result.status, 0, `${fixture.name}: normal uppercase H tags exit zero`);
      } else {
        assert.notEqual(result.status, 0, `${fixture.name}: hidden index flag blocks`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-core-dogfood-nongit-'));
  try {
    const probe = spawnSync('git', ['rev-parse', '--git-dir'], {
      cwd: outside,
      encoding: 'utf8',
      stdio: 'ignore',
    });
    assert.notEqual(probe.status, 0, 'git-failure fixture must not be a Git repository');

    // Act
    const failed = runGuard(outside);

    // Assert
    assert.equal(failed.error, undefined, 'git-failure guard: Bash invocation');
    assert.notEqual(
      failed.status,
      0,
      'a failing git ls-files must block instead of reading an empty stream',
    );
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('T005 Core Dogfood preflight block carries no stale command-count label', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const rawSection = rawMarkdownSection(read(PROJECT_SKILL), heading);

  // Act
  const failures = (rawSection.match(/\b[A-Za-z]+-command\b/g) ?? [])
    .filter((label) => !/^ten-command$/i.test(label))
    .map((label) => `stale preflight command-count label: ${label}`);
  if (!/\bten-command\b/i.test(rawSection) && !/\ball ten commands?\b/i.test(rawSection)) {
    failures.push('preflight block is never labelled as ten commands');
  }

  // Assert
  assert.deepEqual(
    failures,
    [],
    `${PROJECT_SKILL} ${heading}: preflight block labelled as ten commands`,
  );
});

test('T004 Core Dogfood local skill owns the visible post-readiness contract, not future model behavior', () => {
  // Arrange
  assert.equal(
    fs.existsSync(path.join(ROOT, CORE_DOGFOOD_LOCAL_SKILL)),
    true,
    `${CORE_DOGFOOD_LOCAL_SKILL}: exact local skill must exist`,
  );
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(localSkill);
  assert.ok(frontmatter, `${CORE_DOGFOOD_LOCAL_SKILL}: YAML frontmatter`);
  assert.match(
    frontmatter[1],
    /^name: "dude-local-core-dogfood-promotion"\s*$/m,
    `${CORE_DOGFOOD_LOCAL_SKILL}: exact frontmatter identity`,
  );
  const description = /^description:\s*"([^"]+)"\s*$/m.exec(frontmatter[1])?.[1] ?? '';
  assert.match(
    description,
    /^Use when .*canonical terminal core dogfood promotion task.*ready.*source-contributing dependencies.*pre-promotion acceptance prerequisites.*clear/i,
    `${CORE_DOGFOOD_LOCAL_SKILL}: terminal-readiness trigger`,
  );
  const contract = visibleMarkdown(localSkill);
  const failures = missingParagraphRequirements(contract, [
    ['refuse before the canonical terminal is ready; spec completion is not a trigger', [
      [/refus|block/i, /canonical terminal/i, /ready/i],
      [/specification completion/i, /not a trigger|does not trigger/i],
    ]],
    ['validate and consume the existing baseline without invention or repair', [
      /validat|revalidat/i,
      /existing|already-recorded/i,
      /baseline/i,
      /(?:never|must not|does not)/i,
      /invent/i,
      /repair/i,
      /replace/i,
      /retroactive/i,
    ]],
    ['lane declaration authority stays canonical in Lightweight and Beads in Tracked', [
      [/Lightweight/i, /canonical task/i],
      [
        /Tracked/i,
        /Beads issue text/i,
        /`tasks\.md`/i,
        /non-authoritative|ignore|not consulted/i,
      ],
    ]],
    ['canonical evidence covers declared, source, changed, and review identities', [
      /canonical/i,
      /`declared`/i,
      /`source`/i,
      /`changed`/i,
      /`review`/i,
      /SHA-256/i,
      /UTF-8/i,
      /JSON/i,
    ]],
    ['validated evidence uses Node JSON.stringify with exact key insertion order', [
      /validat/i,
      /Node/i,
      /`JSON\.stringify`/i,
      /exact key insertion order/i,
    ]],
    ['canonical evidence performs no Unicode normalization', [
      /no Unicode normalization/i,
    ]],
    ['declared source and changed inventories use UTF-8 bytewise path ordering', [
      /`declared`/i,
      /`source`/i,
      /`changed`/i,
      /UTF-8 bytewise/i,
      /sort|order/i,
    ]],
    ['baseline is consume-only and cannot be locally constructed or repaired', [
      /baseline/i,
      /never|must not/i,
      /construct/i,
      /append/i,
      /create/i,
      /record/i,
      /repair/i,
      /replace/i,
      /retroactively establish/i,
    ]],
    ['build-dev is conditional and the empty changed set is a read-only no-op', [
      [/`node scripts\/build-dev\.mjs`/i, /only when/i, /`changed`/i, /nonempty/i],
      [
        /`changed`/i,
        /empty/i,
        /(?:do not|must not)/i,
        /`node scripts\/build-dev\.mjs`/i,
        /read-only parity/i,
      ],
    ]],
    ['materialization preserves pack, local, project, workflow, and Dude state', [
      /preserv/i,
      /`dude-pack-\*`/i,
      /`\.github\/skills\/dude-local-core-dogfood-promotion\/\*\*`/i,
      /`\.github\/skills\/project\/\*\*`/i,
      /`\.github\/workflows\/\*\*`/i,
      /`\.dude\/\*\*`/i,
    ]],
    ['acceptance runs focused, full, compose, release, parity, and independent review checks', [
      /focused tests/i,
      /full repository suite/i,
      /Dude lint/i,
      /compose verification/i,
      /pristine(?: external)? release/i,
      /parity/i,
      /(?:independent final|final independent) review/i,
    ]],
    ['accepted append is followed by an immediate complete identity recheck', [
      /accepted line/i,
      /append/i,
      /immediately/i,
      /recompute|recheck/i,
      /every|all/i,
      /bound identit/i,
    ]],
    ['close uses the latest matching accepted line and failures block', [
      [/close/i, /latest matching accepted line/i],
      [
        /missing baseline/i,
        /undeclared/i,
        /declaration mismatch/i,
        /post-review drift/i,
        /generated drift/i,
        /failed verification/i,
        /`REJECT`|rejected review/i,
        /block/i,
      ],
    ]],
    ['the procedure is project-only and not shipped', [
      /project-owned|project-only/i,
      /not shipped|non-shipped/i,
      /`src\/\*\*`/i,
      /pack manifest/i,
      /bundle manifest/i,
      /release output/i,
    ]],
    ['the policy adds no implementation or persistent reporting surface', [
      /(?:no new|do not add|must not add)/i,
      /compiler/i,
      /runtime/i,
      /helper/i,
      /command/i,
      /state/i,
      /ledger/i,
      /Beads notes/i,
      /persistent/i,
      /report/i,
    ]],
  ]);

  for (const needle of [
    '["src/agents/dude.agent.md","src/skills/dude-work/SKILL.md"]',
    '{"path":"src/example.mjs","type":"100644","content":"<base64-exact-bytes>"}',
    '{"path":"src/removed.mjs","type":"absent"}',
    '{"version":1,"terminal":"T004@1234abcd","head":"<gitOid>","declared":"<sha256>","source":"<sha256>","changed":"<sha256>","verdict":"APPROVE","record":"<exact substantive Reviewer response>"}',
  ]) {
    if (!localSkill.includes(needle)) failures.push(`canonical post-readiness evidence shape: ${needle}`);
  }
  const acceptedCount = localSkill
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => line.trim() === CORE_DOGFOOD_ACCEPTED_LINE)
    .length;
  if (acceptedCount !== 1) failures.push('exact accepted Coordinator Log line shape');

  // Act and assert
  assert.deepEqual(
    failures,
    [],
    `${CORE_DOGFOOD_LOCAL_SKILL}: visible post-readiness policy contract only`,
  );
});

const T006_FIRST_ADOPTER_IDENTITIES = Object.freeze({
  bridgeTask: 'T006@62726964',
  feature: 'Feature 009',
  interval: 'original',
  owner: '.dude/ideas/feature-009.md',
  terminal: 'T009@696e6369',
});

/**
 * @param {unknown} value
 * @param {string[]} keys
 */
function hasExactFixtureKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * @param {unknown} left
 * @param {unknown} right
 */
function sameFixtureStringList(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.every((entry) => typeof entry === 'string')
    && right.every((entry) => typeof entry === 'string')
    && left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function firstAdopterPolicyPacketFixture() {
  const declaredPaths = ['src/a.mjs', 'src/b.mjs'];
  return {
    feature: T006_FIRST_ADOPTER_IDENTITIES.feature,
    terminal: T006_FIRST_ADOPTER_IDENTITIES.terminal,
    bridge: {
      task: T006_FIRST_ADOPTER_IDENTITIES.bridgeTask,
      focusedEvidence: true,
      independentlyAccepted: true,
      currentPolicyBytes: true,
    },
    baseline: {
      kind: 'original-valid-pre-source',
      owner: T006_FIRST_ADOPTER_IDENTITIES.owner,
      terminal: T006_FIRST_ADOPTER_IDENTITIES.terminal,
      valid: true,
      beforeSource: true,
      lifecycleBound: true,
      void: false,
      replacement: false,
    },
    ancestry: {
      originalBaseHead: 'base-head',
      checkoutHead: 'current-head',
      descendant: true,
    },
    authorization: {
      present: true,
      current: true,
      owner: T006_FIRST_ADOPTER_IDENTITIES.owner,
      terminal: T006_FIRST_ADOPTER_IDENTITIES.terminal,
      interval: T006_FIRST_ADOPTER_IDENTITIES.interval,
      head: 'current-head',
    },
    t008: {
      accepted: true,
      acceptedDeclarationIdentity: 'declared-v1',
      acceptedChangedIdentity: 'changed-v1',
      currentDeclarationIdentity: 'declared-v1',
      currentChangedIdentity: 'changed-v1',
    },
    declaration: {
      identity: 'declared-v1',
      changedIdentity: 'changed-v1',
      livePaths: [...declaredPaths],
      changedAgainstOriginalPaths: [...declaredPaths],
      knownSourceFiles: [...declaredPaths],
    },
    generatedPrestate: {
      originalIdentity: 'generated-v1',
      currentIdentity: 'generated-v1',
    },
    source: {
      capturedCurrentIdentity: 'source-v1',
      recheckedCurrentIdentity: 'source-v1',
    },
    authority: {
      owner: { present: true, current: true, value: T006_FIRST_ADOPTER_IDENTITIES.owner },
      terminal: { present: true, current: true, value: T006_FIRST_ADOPTER_IDENTITIES.terminal },
      lane: { present: true, current: true, value: 'lightweight' },
      dependencies: { present: true, current: true, complete: true },
      protectedBoundaries: { present: true, current: true, accepted: true },
      prePromotion: { present: true, current: true, accepted: true },
    },
    concurrency: {
      observedOrSuspected: false,
    },
  };
}

/**
 * Deterministic closed-packet policy fixture only; it does not model Reviewer or coordinator judgment.
 * @param {unknown} candidate
 */
function acceptsFirstAdopterPolicyPacketFixture(candidate) {
  const topLevelKeys = [
    'feature',
    'terminal',
    'bridge',
    'baseline',
    'ancestry',
    'authorization',
    't008',
    'declaration',
    'generatedPrestate',
    'source',
    'authority',
    'concurrency',
  ];
  if (!hasExactFixtureKeys(candidate, topLevelKeys)) return false;
  const packet = /** @type {Record<string, any>} */ (candidate);
  if (!hasExactFixtureKeys(packet.bridge, [
    'task', 'focusedEvidence', 'independentlyAccepted', 'currentPolicyBytes',
  ])) return false;
  if (!hasExactFixtureKeys(packet.baseline, [
    'kind', 'owner', 'terminal', 'valid', 'beforeSource', 'lifecycleBound', 'void', 'replacement',
  ])) return false;
  if (!hasExactFixtureKeys(packet.ancestry, [
    'originalBaseHead', 'checkoutHead', 'descendant',
  ])) return false;
  if (!hasExactFixtureKeys(packet.authorization, [
    'present', 'current', 'owner', 'terminal', 'interval', 'head',
  ])) return false;
  if (!hasExactFixtureKeys(packet.t008, [
    'accepted',
    'acceptedDeclarationIdentity',
    'acceptedChangedIdentity',
    'currentDeclarationIdentity',
    'currentChangedIdentity',
  ])) return false;
  if (!hasExactFixtureKeys(packet.declaration, [
    'identity',
    'changedIdentity',
    'livePaths',
    'changedAgainstOriginalPaths',
    'knownSourceFiles',
  ])) return false;
  if (!hasExactFixtureKeys(packet.generatedPrestate, [
    'originalIdentity', 'currentIdentity',
  ])) return false;
  if (!hasExactFixtureKeys(packet.source, [
    'capturedCurrentIdentity', 'recheckedCurrentIdentity',
  ])) return false;
  if (!hasExactFixtureKeys(packet.authority, [
    'owner', 'terminal', 'lane', 'dependencies', 'protectedBoundaries', 'prePromotion',
  ])) return false;
  if (!hasExactFixtureKeys(packet.authority.owner, ['present', 'current', 'value'])) return false;
  if (!hasExactFixtureKeys(packet.authority.terminal, ['present', 'current', 'value'])) return false;
  if (!hasExactFixtureKeys(packet.authority.lane, ['present', 'current', 'value'])) return false;
  if (!hasExactFixtureKeys(packet.authority.dependencies, [
    'present', 'current', 'complete',
  ])) return false;
  if (!hasExactFixtureKeys(packet.authority.protectedBoundaries, [
    'present', 'current', 'accepted',
  ])) return false;
  if (!hasExactFixtureKeys(packet.authority.prePromotion, [
    'present', 'current', 'accepted',
  ])) return false;
  if (!hasExactFixtureKeys(packet.concurrency, ['observedOrSuspected'])) return false;

  const livePaths = packet.declaration.livePaths;
  const changedPaths = packet.declaration.changedAgainstOriginalPaths;
  const knownFiles = packet.declaration.knownSourceFiles;
  if (![livePaths, changedPaths, knownFiles].every((value) => (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  ))) return false;
  const exactLiveFiles = livePaths.every((entry) => (
    entry.startsWith('src/')
    && !entry.endsWith('/')
    && !/[*?\[\]]/.test(entry)
    && knownFiles.includes(entry)
  ));
  const sortedUniqueLivePaths = livePaths.every((entry, index) => (
    index === 0 || Buffer.compare(Buffer.from(livePaths[index - 1]), Buffer.from(entry)) < 0
  ));

  return packet.feature === T006_FIRST_ADOPTER_IDENTITIES.feature
    && packet.terminal === T006_FIRST_ADOPTER_IDENTITIES.terminal
    && packet.bridge.task === T006_FIRST_ADOPTER_IDENTITIES.bridgeTask
    && packet.bridge.focusedEvidence === true
    && packet.bridge.independentlyAccepted === true
    && packet.bridge.currentPolicyBytes === true
    && packet.baseline.kind === 'original-valid-pre-source'
    && packet.baseline.owner === T006_FIRST_ADOPTER_IDENTITIES.owner
    && packet.baseline.terminal === T006_FIRST_ADOPTER_IDENTITIES.terminal
    && packet.baseline.valid === true
    && packet.baseline.beforeSource === true
    && packet.baseline.lifecycleBound === true
    && packet.baseline.void === false
    && packet.baseline.replacement === false
    && packet.ancestry.originalBaseHead === 'base-head'
    && packet.ancestry.checkoutHead === 'current-head'
    && packet.ancestry.descendant === true
    && packet.authorization.present === true
    && packet.authorization.current === true
    && packet.authorization.owner === T006_FIRST_ADOPTER_IDENTITIES.owner
    && packet.authorization.terminal === T006_FIRST_ADOPTER_IDENTITIES.terminal
    && packet.authorization.interval === T006_FIRST_ADOPTER_IDENTITIES.interval
    && packet.authorization.head === packet.ancestry.checkoutHead
    && packet.t008.accepted === true
    && packet.t008.currentDeclarationIdentity === packet.t008.acceptedDeclarationIdentity
    && packet.t008.currentChangedIdentity === packet.t008.acceptedChangedIdentity
    && packet.declaration.identity === packet.t008.currentDeclarationIdentity
    && packet.declaration.changedIdentity === packet.t008.currentChangedIdentity
    && exactLiveFiles
    && sortedUniqueLivePaths
    && sameFixtureStringList(livePaths, changedPaths)
    && packet.generatedPrestate.currentIdentity === packet.generatedPrestate.originalIdentity
    && packet.source.recheckedCurrentIdentity === packet.source.capturedCurrentIdentity
    && packet.authority.owner.present === true
    && packet.authority.owner.current === true
    && packet.authority.owner.value === T006_FIRST_ADOPTER_IDENTITIES.owner
    && packet.authority.terminal.present === true
    && packet.authority.terminal.current === true
    && packet.authority.terminal.value === T006_FIRST_ADOPTER_IDENTITIES.terminal
    && packet.authority.lane.present === true
    && packet.authority.lane.current === true
    && ['lightweight', 'tracked'].includes(packet.authority.lane.value)
    && packet.authority.dependencies.present === true
    && packet.authority.dependencies.current === true
    && packet.authority.dependencies.complete === true
    && packet.authority.protectedBoundaries.present === true
    && packet.authority.protectedBoundaries.current === true
    && packet.authority.protectedBoundaries.accepted === true
    && packet.authority.prePromotion.present === true
    && packet.authority.prePromotion.current === true
    && packet.authority.prePromotion.accepted === true
    && packet.concurrency.observedOrSuspected === false;
}

/** @param {string} source */
function firstAdopterPolicyFixtureContractFailures(source) {
  const contract = visibleMarkdown(source);
  /** @type {Array<[string, RegExp]>} */
  const clauses = [
    ['exact first adopter', /Feature 009 `T009@696e6369` alone owns/i],
    ['accepted bridge authority', /T006 acceptance|bridge acceptance/i],
    ['ancestry alone blocks', /\bAncestry alone blocks\./],
    [
      'wrong or stale authorization blocks',
      /Authorization for another revision, owner, terminal, or interval, or stale or ambiguous authorization, blocks\./,
    ],
    ['failed gates select no replacement baseline', /does not select a new baseline, another baseline, or a replacement baseline/i],
    ['later features receive no bridge authority', /Every later feature receives zero first-adopter bridge authority/i],
  ];
  return clauses.filter(([, pattern]) => !pattern.test(contract)).map(([label]) => label);
}

/** @param {string} source */
function firstAdopterPreflightReuseFailures(source) {
  const contract = visibleMarkdown(source);
  const exactChecks = [
    'git ls-files --others --ignored --exclude-standard -z -- src',
    'git ls-files -v -z -- src',
    'git ls-files --others --ignored --exclude-standard -z -- .github',
    'git ls-files -v -z -- .github',
  ];
  /** @type {string[]} */
  const failures = [];
  if (!/ordinary ten-command preflight/i.test(contract)
    && !exactChecks.every((command) => source.includes(command))) {
    failures.push('reuse the ordinary ten-command preflight or its exact hidden/ignored checks');
  }
  /** @type {Array<[string, RegExp]>} */
  const clauses = [
    ['source boundary', /\bsource\b/i],
    ['base-owned generated-core boundary', /base-owned generated core/i],
    ['assume-unchanged handling', /assume-unchanged/i],
    ['skip-worktree handling', /skip-worktree/i],
    ['ignored-entry handling', /ignored entr(?:y|ies)/i],
    ['fail-closed result', /block|reject|refuse/i],
  ];
  for (const [label, pattern] of clauses) {
    if (!pattern.test(contract)) failures.push(label);
  }
  return failures;
}

test('T006 Core Dogfood project route names the sole first adopter and exact cross-feature sequence', () => {
  // Arrange
  const heading = '## Core Dogfood Close';
  const section = markdownSection(read(PROJECT_SKILL), heading);
  const paragraphs = section.split(/\n\s*\n/);
  const bridgeParagraphs = paragraphs.filter((paragraph) => (
    /first-adopter|`T006@62726964`|`T009@696e6369`/i.test(paragraph)
  ));
  const bridgeText = bridgeParagraphs.join('\n\n');
  const sequenceKeys = [
    'T001@8f2c1a47',
    'T004@e2a91f6c',
    'T005@3d7b0af5',
    'T006@62726964',
    'T009@696e6369',
    'T002@5b7d930e',
    'T003@c4e6812d',
  ];

  // Act
  const failures = missingParagraphRequirements(section, [
    ['only Feature 009 T009 is the exact first adopter under accepted Feature 008 T006 policy', [[
      /(?:sole|only|exclusive)/i,
      /Feature 009/i,
      /`T009@696e6369`/,
      /Feature 008/i,
      /`T006@62726964`/,
      /first adopter|first-adopter/i,
    ]]],
    ['bridge entry begins only after T006 focused evidence and independent acceptance', [[
      /(?:enter|entry|begin|eligib|apply)/i,
      /only after|after/i,
      /`T006@62726964`/,
      /focused (?:test )?evidence/i,
      /independent(?:ly)? accept/i,
    ]]],
    ['sequence completes T001 T004 T005 before T006 then T009 then green T002 then T003', [[
      /completed/i,
      /`T001@8f2c1a47`/,
      /`T004@e2a91f6c`/,
      /`T005@3d7b0af5`/,
      /`T006@62726964`/,
      /`T009@696e6369`/,
      /`T002@5b7d930e`/,
      /full[\s\S]{0,80}verification[\s\S]{0,40}green/i,
      /`T003@c4e6812d`/,
    ]]],
    ['normal future features retain exact baseline HEAD and HEAD:src plus every lifecycle gate', [[
      /normal future|every later feature/i,
      /exact[\s\S]{0,48}(?:baseline[\s\S]{0,24})?`HEAD`/i,
      /`HEAD:src`/,
      /(?:all|every)[\s\S]{0,32}(?:existing )?lifecycle gate/i,
      /(?:does not|must not|never)[\s\S]{0,48}(?:weaken|generaliz|substitute)/i,
    ]]],
  ]);
  const sequenceParagraphs = paragraphs.filter((paragraph) => (
    sequenceKeys.every((key) => paragraph.includes(`\`${key}\``))
  ));
  if (sequenceParagraphs.length !== 1) {
    failures.push('exact sequence appears together in one concise route paragraph');
  } else {
    const positions = sequenceKeys.map((key) => sequenceParagraphs[0].indexOf(key));
    if (!positions.every((position, index) => index === 0 || position > positions[index - 1])) {
      failures.push('exact sequence order is T001 -> T004 -> T005 -> T006 -> T009 -> T002 -> T003');
    }
  }
  const duplicatedSourcePaths = bridgeText.match(/`src\/(?!\*\*)[^`\r\n]+`/g) ?? [];
  if (duplicatedSourcePaths.length > 0) {
    failures.push(`first-adopter route duplicates literal source paths: ${duplicatedSourcePaths.join(', ')}`);
  }
  for (const [label, pattern] of [
    ['Feature 009 declaration runbook', /`declared-src:`/i],
    ['T008 continuity detail', /\bT008\b/i],
    ['executable ancestry detail', /\bgit merge-base\b|\bORIGINAL_BASE_HEAD\b/i],
    ['changed or generated projection detail', /original-baseline (?:changed|generated)|generated baseline prestate/i],
    ['materializer command', /node scripts\/build-dev\.mjs/i],
    ['evidence schema', /core-dogfood-(?:baseline|accepted) v1|JSON\.stringify|SHA-256/i],
  ]) {
    if (pattern.test(bridgeText)) failures.push(`concise project route duplicates ${label}`);
  }

  // Assert
  assert.deepEqual(failures, [], `${PROJECT_SKILL} ${heading}: bounded first-adopter route`);
});

test('T006 Core Dogfood local skill requires original-baseline continuity and current T009 authority', () => {
  // Arrange
  const contract = visibleMarkdown(read(CORE_DOGFOOD_LOCAL_SKILL));

  // Act
  const failures = missingParagraphRequirements(contract, [
    ['original valid pre-source baseline comes from the exact Feature 009 owner history', [[
      /exact Feature 009 owner/i,
      /`## Coordinator Log`/,
      /original valid pre-source baseline/i,
      /`T009@696e6369`/,
    ]]],
    ['the original record is the same baseline bound by accepted Feature 009 lifecycle history', [[
      /same (?:record|line|baseline)/i,
      /accepted Feature 009 lifecycle history/i,
      /before source mutation/i,
    ]]],
    ['baseline selection never chooses the latest merely syntactically matching line', [[
      /(?:do not|must not|never)/i,
      /latest|most recent/i,
      /syntactically matching/i,
      /baseline|line|record/i,
    ]]],
    ['replacement repaired transplanted post-source stale and explicitly void baselines authorize nothing', [[
      /replacement/i,
      /repaired/i,
      /transplanted/i,
      /post-source/i,
      /stale/i,
      /explicitly void/i,
      /authoriz(?:es|e)? (?:nothing|zero)|reject|block/i,
    ]]],
    ['the known explicitly void Feature 009 replacement remains non-authorizing history', [[
      /Feature 009|`T009@696e6369`/i,
      /known|existing/i,
      /explicitly void/i,
      /replacement/i,
      /authoriz(?:es|e)? (?:nothing|zero)|non-authorizing/i,
    ]]],
    ['current HEAD must descend from the original baseline and failures block', [[
      /current `HEAD`/i,
      /descendant/i,
      /original baseline/i,
      /failure|missing commit|non-descendant/i,
      /block/i,
    ]]],
    ['exact current authorization covers every intervening commit or merge and ancestry alone blocks', [[
      /exact explicit authorization/i,
      /every intervening commit|intervening commit and merge|commit or merge continuity/i,
      /current/i,
      /ancestry alone/i,
      /block/i,
    ]]],
    ['T008 contributes only its exact declaration and changed identity evidence that exists', [[
      /T008/i,
      /declaration/i,
      /changed identity/i,
      /actually exist|exact T008 evidence that exists/i,
      /(?:does not|must not|never)[\s\S]{0,80}(?:require|reconstruct|claim)/i,
      /historical/i,
      /complete source identity/i,
    ]]],
    ['complete changed set is measured against the original baseline and equals live T009 declaration coverage', [[
      /complete changed/i,
      /original baseline source tree|original-baseline/i,
      /exact equal|exactly equal|exact equality/i,
      /`T009@696e6369`|T009/i,
      /live declaration/i,
      /duplicate/i,
      /director/i,
      /glob/i,
      /unsorted/i,
      /missing|undeclared/i,
    ]]],
    ['generated core exactly matches original-baseline inventory types and bytes before materialization', [[
      /current base-owned generated core/i,
      /original baseline/i,
      /inventory/i,
      /types/i,
      /bytes/i,
      /before materialization/i,
      /hand edit/i,
      /early materialization/i,
      /unrelated generated drift/i,
      /block/i,
    ]]],
    ['complete current source is freshly derived and every changed byte is bound', [[
      /freshly derive/i,
      /current `HEAD`/i,
      /current source tree/i,
      /complete original-baseline delta/i,
      /content identity/i,
      /bytes/i,
      /block/i,
    ]]],
    ['current authority re-resolves owner terminal lane dependencies both bridge acceptances boundaries and pre-promotion acceptance', [[
      /re-resolve|current authority/i,
      /exact owner/i,
      /terminal/i,
      /lane/i,
      /completed dependenc/i,
      /T008 evidence/i,
      /T006 acceptance/i,
      /T007 acceptance/i,
      /protected boundar/i,
      /pre-promotion acceptance/i,
      /block/i,
    ]]],
    ['observed or suspected source or generated concurrency blocks without attribution', [[
      /observed or suspected/i,
      /concurren|overlap/i,
      /source/i,
      /generated/i,
      /block/i,
      /actor attribution/i,
    ]]],
    ['any failed gate appends and selects no replacement baseline', [[
      /(?:any|every) failed|failure|mismatch|stale gate/i,
      /(?:append|record)[\s\S]{0,20}no|(?:does not|must not|never)[\s\S]{0,20}(?:append|record)/i,
      /select[\s\S]{0,20}no|(?:does not|must not|never)[\s\S]{0,20}select/i,
      /new|another|replacement baseline/i,
    ]]],
    ['continuity remains one uninterrupted original interval and never rebases after source change', [[
      /one uninterrupted original|same original serialized interval/i,
      /(?:does not|must not|never)[\s\S]{0,40}(?:new interval|rebas)/i,
      /after source (?:change|modification)/i,
    ]]],
    ['Feature 009 T009 alone owns materialization and its live declaration', [[
      /Feature 009/i,
      /`T009@696e6369`/,
      /(?:sole|only|alone)/i,
      /actual repository materialization|materialization/i,
      /live declared source set|live declaration/i,
    ]]],
    ['Feature 009 retains parity protected-boundary full verification and final review ownership', [[
      /Feature 009|`T009@696e6369`/i,
      /parity/i,
      /protected-boundary|protected boundar/i,
      /focused/i,
      /full/i,
      /lint/i,
      /compose/i,
      /release/i,
      /fresh final independent review/i,
    ]]],
    ['Feature 009 retains accepted Feature 008 evidence Feature 007 correction and terminal state', [[
      /Feature 009|`T009@696e6369`/i,
      /accepted Feature 008 evidence/i,
      /Feature 007 correction/i,
      /terminal state/i,
    ]]],
  ]);

  // Assert
  assert.deepEqual(
    failures,
    [],
    `${CORE_DOGFOOD_LOCAL_SKILL}: fail-closed Feature 009 continuity contract`,
  );
});

test('T006 Core Dogfood first-adopter policy fixture rejects every invalid closed packet', () => {
  // Arrange
  /** @type {Array<[string, (packet: Record<string, any>) => void]>} */
  const invalidCases = [
    ['unknown packet member', (packet) => { packet.unexpected = true; }],
    ['missing packet member', (packet) => { delete packet.concurrency; }],
    ['wrong terminal', (packet) => { packet.terminal = 'T010@00000000'; }],
    ['bridge T006 not accepted', (packet) => { packet.bridge.independentlyAccepted = false; }],
    ['non-descendant checkout', (packet) => { packet.ancestry.descendant = false; }],
    ['ancestry only with missing authorization', (packet) => { packet.authorization.present = false; }],
    ['stale authorization', (packet) => { packet.authorization.current = false; }],
    ['mismatched authorization', (packet) => { packet.authorization.head = 'other-head'; }],
    ['current source identity drift', (packet) => {
      packet.source.recheckedCurrentIdentity = 'source-v2';
    }],
    ['live declaration mismatch', (packet) => {
      packet.declaration.livePaths[1] = 'src/c.mjs';
      packet.declaration.knownSourceFiles.push('src/c.mjs');
    }],
    ['duplicate declaration', (packet) => { packet.declaration.livePaths[1] = 'src/a.mjs'; }],
    ['directory declaration', (packet) => { packet.declaration.livePaths[1] = 'src/lib/'; }],
    ['glob declaration', (packet) => { packet.declaration.livePaths[1] = 'src/*.mjs'; }],
    ['unsorted declaration', (packet) => { packet.declaration.livePaths.reverse(); }],
    ['missing declaration coverage', (packet) => {
      packet.declaration.changedAgainstOriginalPaths.push('src/c.mjs');
      packet.declaration.knownSourceFiles.push('src/c.mjs');
    }],
    ['generated-prestate drift', (packet) => {
      packet.generatedPrestate.currentIdentity = 'generated-v2';
    }],
    ['unrelated source drift', (packet) => {
      packet.source.capturedCurrentIdentity = 'source-v2';
    }],
    ['missing owner authority', (packet) => { packet.authority.owner.present = false; }],
    ['stale owner authority', (packet) => { packet.authority.owner.current = false; }],
    ['missing lane authority', (packet) => { packet.authority.lane.present = false; }],
    ['stale lane authority', (packet) => { packet.authority.lane.current = false; }],
    ['missing dependency authority', (packet) => { packet.authority.dependencies.present = false; }],
    ['stale dependency authority', (packet) => { packet.authority.dependencies.current = false; }],
    ['missing protected-boundary authority', (packet) => {
      packet.authority.protectedBoundaries.present = false;
    }],
    ['stale protected-boundary authority', (packet) => {
      packet.authority.protectedBoundaries.current = false;
    }],
    ['missing pre-promotion acceptance', (packet) => {
      packet.authority.prePromotion.present = false;
    }],
    ['stale pre-promotion acceptance', (packet) => {
      packet.authority.prePromotion.current = false;
    }],
    ['missing terminal authority', (packet) => { packet.authority.terminal.present = false; }],
    ['stale terminal authority', (packet) => { packet.authority.terminal.current = false; }],
    ['concurrent activity', (packet) => { packet.concurrency.observedOrSuspected = true; }],
    ['void baseline', (packet) => { packet.baseline.void = true; }],
    ['replacement baseline', (packet) => { packet.baseline.replacement = true; }],
    ['later feature', (packet) => { packet.feature = 'Feature 010'; }],
  ];
  assert.equal(invalidCases.length, 33, 'closed first-adopter rejection matrix size');
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);

  // Act and assert
  assert.equal(
    acceptsFirstAdopterPolicyPacketFixture(firstAdopterPolicyPacketFixture()),
    true,
    'the one exact valid packet is accepted',
  );
  for (const [name, mutate] of invalidCases) {
    const packet = firstAdopterPolicyPacketFixture();
    mutate(packet);
    assert.equal(
      acceptsFirstAdopterPolicyPacketFixture(packet),
      false,
      `${name}: deterministic packet rejection only`,
    );
  }
  assert.deepEqual(
    firstAdopterPolicyFixtureContractFailures(localSkill),
    [],
    'the packet fixture is anchored to current first-adopter policy clauses',
  );
  const invertedPolicy = localSkill.replace(
    'Ancestry alone blocks.',
    'Ancestry alone authorizes the bridge.',
  );
  assert.notEqual(invertedPolicy, localSkill, 'semantic policy mutation changes its source clause');
  assert.ok(
    firstAdopterPolicyFixtureContractFailures(invertedPolicy).includes('ancestry alone blocks'),
    'source-contract assertions catch an inverted ancestry clause',
  );
});

test('T006 Core Dogfood executable ancestry gate accepts a descendant and rejects an unrelated commit', () => {
  // Arrange
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const exactOriginalBinding =
    'ORIGINAL_BASE_HEAD="$(git rev-parse --verify "${ORIGINAL_BASE_HEAD}^{commit}")"';
  const exactCurrentBinding =
    'CURRENT_HEAD="$(git rev-parse --verify \'HEAD^{commit}\')"';
  const exactAncestryCommand =
    'git merge-base --is-ancestor "$ORIGINAL_BASE_HEAD" "$CURRENT_HEAD"';
  const commandLines = localSkill.split('\n')
    .filter((line) => line.trim() === exactAncestryCommand);
  const ancestryBlocks = (localSkill.match(/```bash\n[\s\S]*?\n```/g) ?? [])
    .filter((block) => block.split('\n').some((line) => line.trim() === exactAncestryCommand));
  const failures = [];
  if (commandLines.length !== 1) {
    failures.push('exact executable ancestry command appears once');
  }
  if (ancestryBlocks.length !== 1) {
    failures.push('one executable bash fence owns the complete ancestry gate');
  }
  const ancestryGate = ancestryBlocks.length === 1
    ? ancestryBlocks[0].replace(/^```bash\n/, '').replace(/\n```$/, '')
    : '';
  const gateLines = ancestryGate.split('\n').map((line) => line.trim()).filter(Boolean);
  const failClosedIndex = gateLines.indexOf('set -eu');
  const originalBindingIndex = gateLines.indexOf(exactOriginalBinding);
  const currentBindingIndex = gateLines.indexOf(exactCurrentBinding);
  const ancestryIndex = gateLines.indexOf(exactAncestryCommand);
  if (failClosedIndex === -1) failures.push('ancestry fence enables fail-closed set -eu');
  if (originalBindingIndex === -1) {
    failures.push('ORIGINAL_BASE_HEAD is freshly validated as a commit');
  }
  if (currentBindingIndex === -1) {
    failures.push('CURRENT_HEAD is freshly bound to checkout HEAD^{commit}');
  }
  if (!(failClosedIndex < originalBindingIndex
    && originalBindingIndex < currentBindingIndex
    && currentBindingIndex < ancestryIndex)) {
    failures.push('commit validation and fresh checkout binding precede ancestry');
  }
  const root = temporaryCoreDogfoodRepository();
  try {
    const originalBaselineHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    writeFixture(root, 'src/descendant.txt', 'descendant\n');
    git(root, ['add', '--', 'src/descendant.txt']);
    git(root, ['commit', '--quiet', '-m', 'descendant']);
    const descendantHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    const baselineTree = git(root, ['rev-parse', '--verify', `${originalBaselineHead}^{tree}`]).trim();
    const unrelatedHead = git(root, ['commit-tree', baselineTree, '-m', 'unrelated root']).trim();
    /** @param {string} injectedCurrentHead */
    const runAncestryGate = (injectedCurrentHead) => spawnSync('bash', ['-c', ancestryGate], {
      cwd: root,
      env: {
        ...process.env,
        ORIGINAL_BASE_HEAD: originalBaselineHead,
        CURRENT_HEAD: injectedCurrentHead,
      },
      encoding: 'utf8',
      stdio: 'ignore',
    });

    // Act
    const descendantCheckout = runAncestryGate(unrelatedHead);
    git(root, ['checkout', '--quiet', '--detach', unrelatedHead]);
    const unrelatedCheckout = runAncestryGate(descendantHead);

    // Assert
    if (descendantCheckout.error !== undefined) failures.push('descendant ancestry Bash invocation');
    if (descendantCheckout.status !== 0) {
      failures.push('descendant checkout passes despite an injected unrelated CURRENT_HEAD');
    }
    if (unrelatedCheckout.error !== undefined) failures.push('unrelated ancestry Bash invocation');
    if (unrelatedCheckout.status === 0) {
      failures.push('unrelated checkout fails despite an injected descendant CURRENT_HEAD');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.deepEqual(
    failures,
    [],
    `${CORE_DOGFOOD_LOCAL_SKILL}: fresh checkout HEAD controls the fail-closed ancestry gate`,
  );
});

test('T006 Core Dogfood first-adopter reuses ordinary hidden and ignored boundary predicates', () => {
  // Arrange
  /** @type {Array<{
   *   name: string,
   *   tracked: string,
   *   ignored: string,
   *   hiddenLayer: 'sourceHiddenFlags' | 'generatedHiddenFlags',
   *   ignoredLayer: 'sourceIgnored' | 'generatedIgnored',
   * }>} */
  const boundaries = [
    {
      name: 'source',
      tracked: 'src/tracked.txt',
      ignored: 'src/ignored.txt',
      hiddenLayer: 'sourceHiddenFlags',
      ignoredLayer: 'sourceIgnored',
    },
    {
      name: 'base-owned generated core',
      tracked: '.github/skills/dude-example/SKILL.md',
      ignored: '.github/skills/dude-ignored/SKILL.md',
      hiddenLayer: 'generatedHiddenFlags',
      ignoredLayer: 'generatedIgnored',
    },
  ];
  assert.equal(classifyPath(boundaries[1].tracked), TIER.CORE, 'generated tracked fixture');
  assert.equal(classifyPath(boundaries[1].ignored), TIER.CORE, 'generated ignored fixture');
  /** @type {Array<{
   *   name: string,
   *   arrange: (root: string, relative: string) => void,
   *   tag: 'h' | 'S' | null,
   * }>} */
  const states = [
    {
      name: 'assume-unchanged',
      arrange(root, relative) {
        git(root, ['update-index', '--assume-unchanged', '--', relative]);
      },
      tag: 'h',
    },
    {
      name: 'skip-worktree',
      arrange(root, relative) {
        git(root, ['update-index', '--skip-worktree', '--', relative]);
      },
      tag: 'S',
    },
    {
      name: 'ignored entry',
      arrange(root, relative) { writeFixture(root, relative, 'ignored\n'); },
      tag: null,
    },
  ];

  // Act and assert
  for (const boundary of boundaries) {
    for (const state of states) {
      const root = temporaryCoreDogfoodRepository();
      try {
        if (boundary.name === 'base-owned generated core') {
          writeFixture(root, boundary.tracked, 'baseline\n');
          git(root, ['add', '--', boundary.tracked]);
          git(root, ['commit', '--quiet', '-m', 'generated core representative']);
        }
        assert.equal(coreDogfoodBaselineLayers(root).accepted, true, `${boundary.name}: clean`);
        const relative = state.tag === null ? boundary.ignored : boundary.tracked;
        state.arrange(root, relative);
        const actual = coreDogfoodBaselineLayers(root);
        assert.equal(actual.accepted, false, `${boundary.name}: ${state.name} blocks`);
        assert.deepEqual(
          actual[boundary.hiddenLayer],
          state.tag === null ? [] : [{ tag: state.tag, path: relative }],
          `${boundary.name}: ${state.name}: hidden-index predicate`,
        );
        assert.deepEqual(
          actual[boundary.ignoredLayer],
          state.tag === null ? [relative] : [],
          `${boundary.name}: ${state.name}: ignored-entry predicate`,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }

  const validPolicyFixture = [
    'Before the first-adopter decision, reuse the ordinary ten-command preflight for source',
    'and base-owned generated core. Assume-unchanged, skip-worktree, and ignored entries block.',
  ].join(' ');
  assert.deepEqual(firstAdopterPreflightReuseFailures(validPolicyFixture), []);
  const omittedReuseMutation = validPolicyFixture.replace(
    'reuse the ordinary ten-command preflight',
    'run a generic cleanliness check',
  );
  assert.deepEqual(
    firstAdopterPreflightReuseFailures(omittedReuseMutation),
    ['reuse the ordinary ten-command preflight or its exact hidden/ignored checks'],
    'policy mutation omitting ordinary preflight reuse fails',
  );
  const firstAdopterSection = rawMarkdownSection(
    read(CORE_DOGFOOD_LOCAL_SKILL),
    '## One-Time Feature 009 First Adopter',
  );
  assert.deepEqual(
    firstAdopterPreflightReuseFailures(firstAdopterSection),
    [],
    `${CORE_DOGFOOD_LOCAL_SKILL}: first-adopter hidden and ignored boundary contract`,
  );
});

test('T006 Core Dogfood bridge stays policy-only and cannot weaken later-feature baselines', () => {
  // Arrange
  const policies = [PROJECT_SKILL, CORE_DOGFOOD_LOCAL_SKILL]
    .map((relative) => ({ relative, raw: read(relative) }));
  const localContract = visibleMarkdown(
    policies.find(({ relative }) => relative === CORE_DOGFOOD_LOCAL_SKILL)?.raw ?? '',
  );

  // Act
  const failures = missingParagraphRequirements(localContract, [
    ['every later feature is denied the bridge and keeps exact ordinary HEAD and HEAD:src matching', [[
      /every later feature|normal future feature/i,
      /(?:zero|no)[\s\S]{0,32}(?:first-adopter|bridge) authority|only[\s\S]{0,32}`T009@696e6369`/i,
      /exact[\s\S]{0,32}(?:recorded |ordinary )?baseline `HEAD`/i,
      /`HEAD:src`/,
      /(?:all|every)[\s\S]{0,32}(?:existing )?lifecycle gate/i,
    ]]],
    ['descendant or authorized continuity never substitutes for later exact baseline equality', [[
      /later feature|normal future/i,
      /(?:descendant|ancestry)/i,
      /authoriz(?:ed|ation)[\s\S]{0,24}(?:commit|merge|continuity)/i,
      /(?:must not|never|no)[\s\S]{0,48}(?:substitute|exception|weaken|generaliz)/i,
      /exact baseline|baseline equality|matching/i,
    ]]],
    ['T006 is policy-only and does not run build-dev or materialize', [[
      /`T006@62726964`/,
      /policy-only|policy interpretation/i,
      /(?:does not|must not|never|no)/i,
      /`node scripts\/build-dev\.mjs`/,
      /materializ/i,
    ]]],
    ['T006 changes no authoritative source or base-owned generated core', [[
      /`T006@62726964`/,
      /(?:does not|must not|never|no)/i,
      /authoritative source|`src\/\*\*`/i,
      /base-owned generated core/i,
      /chang|writ|mutat/i,
    ]]],
    ['T006 appends no baseline or accepted evidence', [[
      /`T006@62726964`/,
      /(?:append|record)/i,
      /(?:no|does not|must not|never)/i,
      /baseline/i,
      /accepted evidence|acceptance evidence/i,
    ]]],
    ['T006 mutates no Feature 009 artifact owner log board snapshot or state', [[
      /`T006@62726964`/,
      /(?:does not|must not|never|no)/i,
      /mutat/i,
      /Feature 009/i,
      /artifact/i,
      /owner log/i,
      /board/i,
      /snapshot/i,
      /task state|state/i,
    ]]],
    ['T006 closes neither Feature 008 nor any of its tasks', [[
      /`T006@62726964`/,
      /(?:does not|must not|never|no)/i,
      /close/i,
      /Feature 008/i,
      /task|feature/i,
    ]]],
    ['T006 copies no T009 source declaration or implementation runbook', [[
      /`T006@62726964`/,
      /(?:does not|must not|never|no)/i,
      /(?:copy|duplicate|list)/i,
      /T009|Feature 009/i,
      /source (?:paths|declaration|set)|declared source/i,
      /implementation|steps|runbook/i,
    ]]],
  ]);
  for (const { relative, raw } of policies) {
    const literalOids = raw.match(/\b[0-9a-f]{40}\b/gi) ?? [];
    if (literalOids.length > 0) {
      failures.push(`${relative}: literal historical baseline OID is forbidden (${literalOids.join(', ')})`);
    }
  }

  // Assert
  assert.deepEqual(failures, [], 'T006 remains a bounded policy bridge with no generalized authority');
});

test('T007 Core Dogfood transient packet replaces historical composed acceptance prerequisites', () => {
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const visible = visibleMarkdown(localSkill);
  assert.doesNotMatch(
    visible,
    /^### Current T007 Composed Evidence Overlay$/m,
    'the obsolete historical/composed overlay must be removed rather than retained beside the new route',
  );

  const packet = markdownSection(localSkill, '### Current T007 Transient Fresh Packet');
  const failures = missingParagraphRequirements(packet, [
    ['exact current-main event after current T006 and T007 acceptance', [[
      /current main checkout/i,
      /(?:without|no) isolation/i,
      /`T009@696e6369`/,
      /`T006@62726964`/,
      /`T007@9a4e7c12`/,
      /focused evidence/i,
      /independent acceptance/i,
    ]]],
    ['fresh packet replaces unavailable historical identity requirements', [[
      /fresh/i,
      /transient/i,
      /(?:does not|must not|never)[\s\S]{0,80}(?:require|reconstruct|claim)/i,
      /historical/i,
      /accepted `HEAD`|accepted HEAD/i,
      /complete source identity/i,
      /dual-review/i,
      /Features? 003/i,
      /Features? 006/i,
      /T008/i,
    ]]],
    ['two independent approvals and unchanged immediate use are materialization-only authority', [
      [/Tester/i, /Reviewer/i, /independently reacquire|independently verify/i],
      [/immediate unchanged recheck/i, /materialization only/i, /one immediate/i],
      [/(?:does not|do not|must not|never)[\s\S]{0,80}(?:transfer ownership|expand[^\n]*declaration|re-accept)/i],
    ]],
    ['interruption or drift invalidates without persistence or reconstruction', [
      [/interruption/i, /drift|change/i, /invalidat/i, /complete fresh reacquisition/i],
      [/(?:no|do not|never|must not)[\s\S]{0,80}(?:persist|reconstruct)/i],
    ]],
  ]);
  assert.deepEqual(failures, [], `${CORE_DOGFOOD_LOCAL_SKILL}: transient fresh packet replacement`);
});

const T007_TRANSIENT_IDENTITIES = Object.freeze({
  policyOwner: '.dude/ideas/automatic-core-dogfood-promotion.md',
  policySpec: '.dude/specs/008-automatic-core-dogfood-promotion/spec.md',
  adopterOwner: '.dude/ideas/autonomous-learning-governance.md',
  adopterSpec: '.dude/specs/009-autonomous-learning-governance/spec.md',
  adopterAcceptanceTask: 'T008@70726f6f',
  adopterTerminal: 'T009@696e6369',
  contributor003Owner: '.dude/ideas/guarded-directory-artifact-import.md',
  contributor003Spec: '.dude/specs/003-guarded-directory-artifact-import/spec.md',
  contributor003Terminal: 'T009@c4a2f865',
  contributor006Owner: '.dude/ideas/simplify-context-footprint-audit.md',
  contributor006Spec: '.dude/specs/006-simplify-context-footprint-audit/spec.md',
  contributor006Task: 'T005@4f8a2c71',
  contributor006Terminal: 'T006@b3d9e560',
  priorBridgeTask: 'T006@62726964',
  transientPacketTask: 'T007@9a4e7c12',
});

const T007_FEATURE_003_CHAINS = Object.freeze({
  'src/skills/dude-bundle-import/SKILL.md': ['T007@4d2c9a76'],
  'src/skills/dude-bundle-import/import.mjs': ['T007@4d2c9a76'],
  'src/skills/dude-bundle-import/import.test.mjs': ['T007@4d2c9a76'],
  'src/skills/dude-bundle-import/lib/directory-import.mjs': [
    'T003@3c7f5a92',
    'T005@7a91d4c2',
    'T006@b83e5f10',
    'T010@1d7a4c82',
    'T011@e6b3f905',
    'T007@4d2c9a76',
  ],
  'src/skills/dude-bundle-import/lib/directory-import.test.mjs': [
    'T003@3c7f5a92',
    'T005@7a91d4c2',
    'T006@b83e5f10',
    'T010@1d7a4c82',
    'T011@e6b3f905',
    'T007@4d2c9a76',
  ],
  'src/skills/dude-bundle-import/lib/directory-risk.mjs': [
    'T004@9e1b6d43',
    'T005@7a91d4c2',
    'T006@b83e5f10',
    'T010@1d7a4c82',
    'T011@e6b3f905',
    'T007@4d2c9a76',
  ],
  'src/skills/dude-bundle-import/lib/directory-risk.test.mjs': [
    'T004@9e1b6d43',
    'T005@7a91d4c2',
    'T006@b83e5f10',
    'T010@1d7a4c82',
    'T011@e6b3f905',
    'T007@4d2c9a76',
  ],
  'src/skills/dude-lint/lint.mjs': ['T007@4d2c9a76'],
  'src/skills/dude-lint/lint.test.mjs': ['T007@4d2c9a76'],
});

const T007_FEATURE_003_PATHS = Object.freeze(Object.keys(T007_FEATURE_003_CHAINS));
const T007_FEATURE_006_PATHS = Object.freeze([
  'src/skills/dude-engine/lib/agent-frontmatter.test.mjs',
]);
const T007_ADOPTER_DEPENDENCIES = Object.freeze([
  'T001@7365616c',
  'T002@6964656e',
  'T003@7075626c',
  'T004@68616c74',
  'T005@7065726d',
  'T006@6c616e65',
  'T007@646f6373',
  T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask,
]);
const T007_ADOPTER_BLOCKER =
  'external-dependency: Feature008 T007@9a4e7c12 composed-bridge policy and evidence must complete with focused verification and independent acceptance before T009 resumes';

/** @param {string[]} values */
function sortFixturePaths(values) {
  return [...values].sort((left, right) => Buffer.compare(
    Buffer.from(left, 'utf8'),
    Buffer.from(right, 'utf8'),
  ));
}

/** @param {string} source @param {string} taskKey */
function canonicalFixtureTaskLine(source, taskKey) {
  const lines = source.split('\n').filter((line) => (
    line.startsWith('- [') && line.includes(`] ${taskKey} `)
  ));
  assert.equal(lines.length, 1, `${taskKey}: one canonical task line`);
  return lines[0];
}

function currentT009DeclaredPathsFixture() {
  const line = canonicalFixtureTaskLine(
    read('.dude/specs/009-autonomous-learning-governance/tasks.md'),
    T007_TRANSIENT_IDENTITIES.adopterTerminal,
  );
  const clause = /declared-src:\s*(.+?);\s+after unchanged T008 source acceptance/.exec(line)?.[1];
  assert.ok(clause, 'T009 current declaration clause');
  const paths = [...clause.matchAll(/`(src\/[^`]+)`/g)].map((match) => match[1]);
  assert.equal(paths.length, 10, 'T009 current declaration retains ten paths');
  assert.deepEqual(paths, sortFixturePaths(paths), 'T009 current declaration is bytewise sorted');
  assert.equal(new Set(paths).size, 10, 'T009 current declaration paths are unique');
  return paths;
}

/** @param {unknown} value */
function fixtureIdentity(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * @param {string} root
 * @param {string} revision
 * @param {string} boundary
 */
function gitTreeFixture(root, revision, boundary) {
  const output = execFileSync('git', [
    'ls-tree', '-r', '-z', '--full-tree', revision, '--', boundary,
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  if (output.length === 0) return new Map();
  assert.equal(output.at(-1), 0, `git ls-tree ${revision}: NUL-delimited facts`);
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output.subarray(0, -1));
  const entries = new Map();
  for (const record of decoded.split('\0')) {
    const tab = record.indexOf('\t');
    assert.ok(tab > 0, `git ls-tree ${revision}: header and path`);
    const header = /^(\d{6}) ([a-z]+) ([0-9a-f]+)$/.exec(record.slice(0, tab));
    assert.ok(header, `git ls-tree ${revision}: canonical header`);
    const candidate = record.slice(tab + 1);
    entries.set(candidate, {
      mode: header[1],
      objectType: header[2],
      oid: header[3],
      path: candidate,
    });
  }
  return entries;
}

/** @param {string} root @param {string} oid */
function gitBlobFixture(root, oid) {
  return execFileSync('git', ['cat-file', 'blob', oid], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** @param {string} sourceRoot @param {string} revision @param {string} relative @param {string} targetRoot */
function materializeGitPathFixture(sourceRoot, revision, relative, targetRoot) {
  const entry = gitTreeFixture(sourceRoot, revision, relative).get(relative);
  removeFixturePath(targetRoot, relative);
  if (!entry) return;
  assert.equal(entry.objectType, 'blob', `${relative}: materialized Git path blob`);
  assert.ok(['100644', '100755', '120000'].includes(entry.mode), `${relative}: materialized Git path mode`);
  const absolute = path.join(targetRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const bytes = gitBlobFixture(sourceRoot, entry.oid);
  if (entry.mode === '120000') fs.symlinkSync(bytes.toString(), absolute);
  else {
    fs.writeFileSync(absolute, bytes);
    fs.chmodSync(absolute, entry.mode === '100755' ? 0o755 : 0o644);
  }
}

/** @param {Map<string, any>} entries @param {string} root @param {string[]} [paths] */
function canonicalGitRowsFixture(entries, root, paths = sortFixturePaths([...entries.keys()])) {
  return paths.map((candidate) => {
    const entry = entries.get(candidate);
    assert.ok(entry, `${candidate}: current Git source entry`);
    assert.equal(entry.objectType, 'blob', `${candidate}: blob source entry`);
    assert.ok(['100644', '100755', '120000'].includes(entry.mode), `${candidate}: supported mode`);
    return {
      path: candidate,
      type: entry.mode,
      content: gitBlobFixture(root, entry.oid).toString('base64'),
    };
  });
}

/** @param {string} root @param {string} originalHead @param {string} currentHead */
function deriveGitDeltaFixture(root, originalHead, currentHead) {
  const original = gitTreeFixture(root, originalHead, 'src');
  const current = gitTreeFixture(root, currentHead, 'src');
  const paths = sortFixturePaths(new Set([...original.keys(), ...current.keys()]));
  const changedPaths = paths.filter((candidate) => {
    const before = original.get(candidate);
    const after = current.get(candidate);
    return !before || !after
      || before.mode !== after.mode
      || before.objectType !== after.objectType
      || before.oid !== after.oid;
  });
  const changedRows = changedPaths.map((candidate) => {
    const entry = current.get(candidate);
    if (!entry) return { path: candidate, type: 'absent' };
    assert.equal(entry.objectType, 'blob', `${candidate}: changed Git source entry`);
    assert.ok(['100644', '100755', '120000'].includes(entry.mode), `${candidate}: changed mode`);
    return {
      path: candidate,
      type: entry.mode,
      content: gitBlobFixture(root, entry.oid).toString('base64'),
    };
  });
  return { changedPaths, changedRows, current, original };
}

/** @param {string} root @param {string} revision */
function expectedCompleteProjectionFixture(root, revision) {
  const source = gitTreeFixture(root, revision, 'src');
  return sortFixturePaths([...source.keys()])
    .filter((sourcePath) => isReleaseFile(srcToDeploy(sourcePath)))
    .map((sourcePath) => {
      const entry = source.get(sourcePath);
      assert.equal(entry.objectType, 'blob', `${sourcePath}: projected blob`);
      return {
        path: srcToDeploy(sourcePath),
        type: entry.mode,
        content: gitBlobFixture(root, entry.oid).toString('base64'),
      };
    });
}

/** @param {string} root */
function filesystemCoreProjectionFixture(root) {
  const githubRoot = path.join(root, '.github');
  /** @type {string[]} */
  const files = [];
  const visit = (absolute) => {
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else files.push(child);
    }
  };
  visit(githubRoot);
  return sortFixturePaths(files.map((absolute) => path.relative(root, absolute).replaceAll(path.sep, '/')))
    .filter((relative) => classifyPath(relative) === TIER.CORE)
    .map((relative) => {
      const absolute = path.join(root, ...relative.split('/'));
      const stat = fs.lstatSync(absolute);
      assert.ok(stat.isFile(), `${relative}: materialized core file`);
      return {
        path: relative,
        type: (stat.mode & 0o111) === 0 ? '100644' : '100755',
        content: fs.readFileSync(absolute).toString('base64'),
      };
    });
}

/** @param {string} root */
function filesystemCoreRemovalRootsFixture(root) {
  const roots = [];
  for (const subdirectory of ['agents', 'instructions']) {
    const absolute = path.join(root, '.github', subdirectory);
    if (!fs.existsSync(absolute)) continue;
    for (const entry of fs.readdirSync(absolute)) {
      const relative = `.github/${subdirectory}/${entry}`;
      if (classifyPath(relative) === TIER.CORE) roots.push(relative);
    }
  }
  const skills = path.join(root, '.github', 'skills');
  if (fs.existsSync(skills)) {
    for (const entry of fs.readdirSync(skills)) {
      const relative = `.github/skills/${entry}`;
      if (classifyPath(`${relative}/`) === TIER.CORE) roots.push(relative);
    }
  }
  return sortFixturePaths(roots);
}

/** @param {string} root */
function protectedFilesystemRowsFixture(root) {
  /** @type {string[]} */
  const files = [];
  const visit = (absolute) => {
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else files.push(child);
    }
  };
  for (const relative of ['.github', '.dude']) visit(path.join(root, relative));
  return sortFixturePaths(files.map((absolute) => path.relative(root, absolute).replaceAll(path.sep, '/')))
    .filter((relative) => (
      relative.startsWith('.dude/')
      || relative.startsWith('.github/workflows/')
      || relative.startsWith('.github/skills/project/')
      || relative.startsWith('.github/skills/dude-local-')
      || relative.startsWith('.github/skills/dude-pack-')
      || relative.startsWith('.github/agents/dude-pack-')
      || relative.startsWith('.github/instructions/dude-pack-')
      || relative.startsWith('.github/prompts/dude-pack-')
    ))
    .map((relative) => {
      const absolute = path.join(root, ...relative.split('/'));
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        return {
          path: relative,
          type: '120000',
          content: Buffer.from(fs.readlinkSync(absolute)).toString('base64'),
        };
      }
      assert.equal(stat.isFile(), true, `${relative}: protected path is a file or symlink`);
      return {
        path: relative,
        type: (stat.mode & 0o111) === 0 ? '100644' : '100755',
        content: fs.readFileSync(absolute).toString('base64'),
      };
    });
}

/** @param {Array<{path:string,type:string,content?:string}>} before @param {Array<{path:string,type:string,content?:string}>} after */
function projectionDeltaRowsFixture(before, after) {
  const beforeByPath = new Map(before.map((row) => [row.path, row]));
  const afterByPath = new Map(after.map((row) => [row.path, row]));
  return sortFixturePaths(new Set([...beforeByPath.keys(), ...afterByPath.keys()]))
    .filter((candidate) => (
      JSON.stringify(beforeByPath.get(candidate) ?? { path: candidate, type: 'absent' })
      !== JSON.stringify(afterByPath.get(candidate) ?? { path: candidate, type: 'absent' })
    ))
    .map((candidate) => ({
      path: candidate,
      before: beforeByPath.get(candidate) ?? { path: candidate, type: 'absent' },
      after: afterByPath.get(candidate) ?? { path: candidate, type: 'absent' },
    }));
}

/** @param {string} sourceRoot */
function cloneFixtureRepository(sourceRoot) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-transient-clone-'));
  const root = path.join(parent, 'repo');
  git(parent, ['clone', '--quiet', '--no-hardlinks', sourceRoot, root]);
  for (const entry of fs.readdirSync(sourceRoot).filter((candidate) => candidate !== '.git')) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(root, entry), {
      recursive: true,
      force: true,
    });
  }
  git(root, ['config', 'user.name', 'Dude Test']);
  git(root, ['config', 'user.email', 'dude-test@example.invalid']);
  return { parent, root };
}

/** @param {string} sourceRoot */
function materializedCompleteProjectionFixture(sourceRoot) {
  const clone = cloneFixtureRepository(sourceRoot);
  try {
    const generatedBefore = filesystemCoreProjectionFixture(clone.root);
    const expectedRemoved = filesystemCoreRemovalRootsFixture(clone.root);
    const protectedBefore = protectedFilesystemRowsFixture(clone.root);
    const result = buildDev({ repoRoot: clone.root });
    const inventory = filesystemCoreProjectionFixture(clone.root);
    const protectedAfter = protectedFilesystemRowsFixture(clone.root);
    return {
      generatedBefore,
      expectedRemoved,
      inventory,
      observedDelta: projectionDeltaRowsFixture(generatedBefore, inventory),
      protectedAfter,
      protectedBefore,
      result,
    };
  } finally {
    fs.rmSync(clone.parent, { recursive: true, force: true });
  }
}

/** @param {Map<string, any>} entries @param {string} root @param {string[]} paths */
function canonicalPathRowsFixture(entries, root, paths) {
  return paths.map((candidate) => {
    const entry = entries.get(candidate);
    if (!entry) return { path: candidate, type: 'absent' };
    assert.equal(entry.objectType, 'blob', `${candidate}: canonical path row is a blob`);
    assert.ok(['100644', '100755', '120000'].includes(entry.mode), `${candidate}: canonical path mode`);
    return {
      path: candidate,
      type: entry.mode,
      content: gitBlobFixture(root, entry.oid).toString('base64'),
    };
  });
}

/** @param {string} root @param {string} revision */
function coreProjectionAtRevisionFixture(root, revision) {
  const entries = gitTreeFixture(root, revision, '.github');
  const paths = sortFixturePaths([...entries.keys()].filter((candidate) => (
    classifyPath(candidate) === TIER.CORE
  )));
  return canonicalGitRowsFixture(entries, root, paths);
}

/** @param {string} source */
function coordinatorLogLinesFixture(source) {
  const headings = [...source.matchAll(/^## Coordinator Log\r?$/gm)];
  if (headings.length !== 1) return [];
  const start = /** @type {number} */ (headings[0].index) + headings[0][0].length;
  const tail = source.slice(start);
  const nextHeading = /^## /m.exec(tail);
  const body = nextHeading ? tail.slice(0, nextHeading.index) : tail;
  return body.split(/\r?\n/).filter((line) => line.startsWith('- '));
}

/** @param {string} source @param {string} taskKey */
function latestTerminalEventFixture(source, taskKey) {
  return coordinatorLogLinesFixture(source).filter((line) => line.includes(taskKey)).at(-1) ?? null;
}

/** @param {string} line */
function ownerEventTokensFixture(line) {
  return Object.fromEntries([...line.matchAll(/\b([a-z_]+)=([^\s]+)/g)].map((match) => (
    [match[1], match[2]]
  )));
}

/** @param {string} description @param {'declared-src'|'attributed-src'} label */
function taskPathClauseFixture(description, label) {
  const match = new RegExp(`${label}:\\s*(.+?)(?:;|$)`).exec(description);
  if (!match) return [];
  return [...match[1].matchAll(/`(src\/[^`]+)`/g)].map((entry) => entry[1]);
}

/** @param {string} root @param {string} relative */
function removeFixturePath(root, relative) {
  fs.rmSync(path.join(root, ...relative.split('/')), { recursive: true, force: true });
}

/** @param {string} root @param {string} relative @param {(source:string) => string} transform */
function rewriteTextFixture(root, relative, transform) {
  const absolute = path.join(root, ...relative.split('/'));
  const source = fs.readFileSync(absolute, 'utf8');
  const updated = transform(source);
  assert.notEqual(updated, source, `${relative}: fixture mutation changes bytes`);
  fs.writeFileSync(absolute, updated);
}

/** @param {string} root @param {string} message */
function commitFixture(root, message) {
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function createTransientPacketRepositoryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-transient-event-'));
  git(path.dirname(root), ['clone', '--quiet', '--no-hardlinks', ROOT, root]);
  git(root, ['config', 'user.name', 'Dude Test']);
  git(root, ['config', 'user.email', 'dude-test@example.invalid']);
  git(root, ['config', 'core.fileMode', 'true']);
  fs.cpSync(path.join(ROOT, '.dude'), path.join(root, '.dude'), {
    recursive: true,
    force: true,
  });
  for (const relative of [
    PROJECT_SKILL,
    CORE_DOGFOOD_LOCAL_SKILL,
    'scripts/current-format-contract.test.mjs',
  ]) {
    writeFixture(root, relative, read(relative));
  }

  const t009Paths = currentT009DeclaredPathsFixture();
  const baselineHead = '136f6bb8353de887a94afc26b5197524cb78d935';
  const currentHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const currentDelta = deriveGitDeltaFixture(root, baselineHead, currentHead);
  assert.equal(currentDelta.changedRows.length, 20, 'real current event has twenty source rows');
  assert.deepEqual(
    currentDelta.changedPaths,
    sortFixturePaths([...t009Paths, ...T007_FEATURE_003_PATHS, ...T007_FEATURE_006_PATHS]),
    'real current event has the exact 10/9/1 source partition',
  );

  const policyTasksPath = T007_TRANSIENT_IDENTITIES.policySpec.replace(/\/spec\.md$/, '/tasks.md');
  const policyTasks = parseTasks(
    fs.readFileSync(path.join(root, policyTasksPath), 'utf8'),
    { path: policyTasksPath },
  );
  assert.deepEqual(policyTasks.warnings, [], `${policyTasksPath}: valid canonical tasks`);
  const policyTaskMatches = policyTasks.tasks.filter(
    (task) => task.id === T007_TRANSIENT_IDENTITIES.transientPacketTask,
  );
  assert.equal(policyTaskMatches.length, 1, `${policyTasksPath}: exactly one canonical T007 task`);
  const policyTaskGlyph = policyTaskMatches[0].glyph;
  assert.ok(policyTaskGlyph === '~' || policyTaskGlyph === 'x', `${policyTasksPath}: T007 is in progress or done`);
  if (policyTaskGlyph === '~') {
    rewriteTextFixture(root, policyTasksPath, (source) => source.replace(
      `- [~] ${T007_TRANSIENT_IDENTITIES.transientPacketTask}`,
      `- [x] ${T007_TRANSIENT_IDENTITIES.transientPacketTask}`,
    ));
  }

  const adopterTasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
  const adopterTasks = parseTasks(
    fs.readFileSync(path.join(root, adopterTasksPath), 'utf8'),
    { path: adopterTasksPath },
  );
  assert.deepEqual(adopterTasks.warnings, [], `${adopterTasksPath}: valid canonical tasks`);
  const adopterTaskMatches = adopterTasks.tasks.filter(
    (task) => task.id === T007_TRANSIENT_IDENTITIES.adopterTerminal,
  );
  assert.equal(adopterTaskMatches.length, 1, `${adopterTasksPath}: exactly one canonical T009 task`);
  const adopterTaskGlyph = adopterTaskMatches[0].glyph;
  assert.ok(adopterTaskGlyph === '~' || adopterTaskGlyph === 'x', `${adopterTasksPath}: T009 is in progress or done`);
  if (adopterTaskGlyph === 'x') {
    rewriteTextFixture(root, adopterTasksPath, (source) => {
      const taskLine = canonicalFixtureTaskLine(source, T007_TRANSIENT_IDENTITIES.adopterTerminal);
      assert.ok(
        taskLine.startsWith(`- [x] ${T007_TRANSIENT_IDENTITIES.adopterTerminal} `),
        `${adopterTasksPath}: T009 exact done header`,
      );
      return source.replace(taskLine, taskLine.replace('- [x]', '- [~]'));
    });
  }

  const taskState = readTaskState(root);
  assert.equal(taskState.status, 'ok', '.dude/state/task-state.json: valid task state');
  const policySnapshot = taskState.status === 'ok' ? taskState.state[policyTasksPath] : null;
  assert.ok(policySnapshot, `${policyTasksPath}: task state entry exists`);
  const policySnapshotGlyph = policySnapshot.glyphs[T007_TRANSIENT_IDENTITIES.transientPacketTask];
  assert.ok(
    policySnapshotGlyph === '~' || policySnapshotGlyph === 'x',
    `${policyTasksPath}: T007 snapshot is in progress or done`,
  );
  if (policySnapshotGlyph === '~') {
    rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
      const snapshot = JSON.parse(source);
      snapshot[policyTasksPath].glyphs[T007_TRANSIENT_IDENTITIES.transientPacketTask] = 'x';
      return `${JSON.stringify(snapshot, null, 2)}\n`;
    });
  }
  const adopterSnapshot = taskState.status === 'ok' ? taskState.state[adopterTasksPath] : null;
  assert.ok(adopterSnapshot, `${adopterTasksPath}: task state entry exists`);
  assert.ok(
    Object.hasOwn(adopterSnapshot.glyphs, T007_TRANSIENT_IDENTITIES.adopterTerminal),
    `${adopterTasksPath}: T009 task state glyph exists`,
  );
  const adopterSnapshotGlyph = adopterSnapshot.glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal];
  assert.ok(
    adopterSnapshotGlyph === '~' || adopterSnapshotGlyph === 'x',
    `${adopterTasksPath}: T009 snapshot is in progress or done`,
  );
  if (adopterSnapshotGlyph === 'x') {
    rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
      const snapshot = JSON.parse(source);
      snapshot[adopterTasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = '~';
      return `${JSON.stringify(snapshot, null, 2)}\n`;
    });
  }

  const normalizedAdopterTasks = parseTasks(
    fs.readFileSync(path.join(root, adopterTasksPath), 'utf8'),
    { path: adopterTasksPath },
  );
  assert.deepEqual(normalizedAdopterTasks.warnings, [], `${adopterTasksPath}: normalized canonical tasks`);
  const normalizedAdopterMatches = normalizedAdopterTasks.tasks.filter(
    (task) => task.id === T007_TRANSIENT_IDENTITIES.adopterTerminal,
  );
  assert.equal(normalizedAdopterMatches.length, 1, `${adopterTasksPath}: one normalized T009 task`);
  const normalizedAdopterTask = normalizedAdopterMatches[0];
  assert.equal(normalizedAdopterTask.glyph, '~', `${adopterTasksPath}: T009 normalized in progress`);
  assert.equal(normalizedAdopterTask.blockedBy, null, `${adopterTasksPath}: T009 has no blocker`);
  assert.deepEqual(
    normalizedAdopterTask.deps,
    T007_ADOPTER_DEPENDENCIES,
    `${adopterTasksPath}: T009 dependencies remain intact`,
  );
  const normalizedTaskState = readTaskState(root);
  assert.equal(normalizedTaskState.status, 'ok', '.dude/state/task-state.json: normalized task state');
  const normalizedAdopterSnapshot = normalizedTaskState.status === 'ok'
    ? normalizedTaskState.state[adopterTasksPath]
    : null;
  assert.ok(normalizedAdopterSnapshot, `${adopterTasksPath}: normalized task state entry exists`);
  assert.equal(
    normalizedAdopterSnapshot.glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal],
    normalizedAdopterTask.glyph,
    `${adopterTasksPath}: normalized T009 task and snapshot agree`,
  );
  const policyIdentity = fixtureIdentity([
    read(PROJECT_SKILL),
    read(CORE_DOGFOOD_LOCAL_SKILL),
    read('scripts/current-format-contract.test.mjs'),
  ]);
  rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.policyOwner, (source) => `${source.trimEnd()}\n- 2026-07-26 UTC - closed ${T007_TRANSIENT_IDENTITIES.transientPacketTask}: focused verification PASS; independent Tester PASS; independent Code Reviewer APPROVE; head=${currentHead} policy=${policyIdentity}\n`);

  const continuityChain = git(root, [
    'rev-list', '--reverse', '--topo-order', `${baselineHead}..${currentHead}`,
  ]).trim().split('\n').filter(Boolean);
  assert.equal(continuityChain.at(-1), currentHead, 'continuity chain reaches current HEAD');
  return {
    baselineHead,
    continuityChain,
    currentHead,
    root,
    t009Paths,
  };
}

/**
 * @param {string} root
 * @param {{spec:string,owner:string,taskKeys:string[],terminal:string,terminalMustBeDone:boolean,sourcePaths:string[],attributionOnly?:boolean,sourceTasks?:Record<string,string>}} expected
 * @param {string[]} failures
 */
function resolveTransientAuthorityFixture(root, expected, failures) {
  const resolved = resolveFeatureOwner({ root, specPath: expected.spec });
  if (resolved.diagnostics.length > 0) {
    failures.push(`authority-resolver:${expected.spec}`);
  }
  if (resolved.owner?.ideaPath !== expected.owner || resolved.owner?.specPath !== expected.spec) {
    failures.push(`authority-owner:${expected.spec}`);
  }
  const tasksPath = expected.spec.replace(/\/spec\.md$/, '/tasks.md');
  const parsed = parseTasks(fs.readFileSync(path.join(root, tasksPath), 'utf8'), { path: tasksPath });
  if (parsed.warnings.length > 0) failures.push(`authority-board:${expected.spec}`);
  for (const taskKey of expected.taskKeys) {
    const matches = parsed.tasks.filter((task) => task.id === taskKey);
    if (matches.length !== 1 || (!expected.attributionOnly && matches[0].state !== 'done')) {
      failures.push(`authority-task:${taskKey}`);
    }
  }
  const terminalMatches = parsed.tasks.filter((task) => task.id === expected.terminal);
  if (terminalMatches.length !== 1 || (!expected.attributionOnly && (
    (expected.terminalMustBeDone && terminalMatches[0].state !== 'done')
    || (!expected.terminalMustBeDone && terminalMatches[0].state === 'done')
  ))) {
    failures.push(`authority-terminal:${expected.terminal}`);
  }
  const ownerText = fs.readFileSync(path.join(root, expected.owner), 'utf8');
  const event = latestTerminalEventFixture(ownerText, expected.terminal);
  const claims = expected.attributionOnly
    ? Object.entries(expected.sourceTasks ?? {}).map(([sourcePath, taskKey]) => ({ sourcePath, taskKey }))
    : parsed.tasks.flatMap((task) => taskPathClauseFixture(task.description, 'attributed-src').map((sourcePath) => ({
      sourcePath,
      taskKey: task.id,
    })));
  if (expected.attributionOnly) {
    const packageRoot = path.dirname(path.join(root, expected.spec));
    const packageText = fs.readdirSync(packageRoot)
      .filter((entry) => entry.endsWith('.md'))
      .sort()
      .map((entry) => fs.readFileSync(path.join(packageRoot, entry), 'utf8'))
      .join('\n');
    for (const { sourcePath, taskKey } of claims) {
      const task = parsed.byId.get(taskKey);
      const parent = path.posix.dirname(sourcePath);
      const basename = path.posix.basename(sourcePath);
      if (!task || task.state !== 'done'
        || !(packageText.includes(sourcePath)
          || (packageText.includes(parent) && packageText.includes(basename)))) {
        failures.push(`authority-source-attribution:${sourcePath}`);
      }
    }
  }
  if (!sameFixtureStringList(sortFixturePaths(claims.map(({ sourcePath }) => sourcePath)), expected.sourcePaths)) {
    failures.push(`authority-source-claims:${expected.terminal}`);
  }
  return { claims, event, ownerText, parsed, resolved, terminal: terminalMatches[0] ?? null };
}

const T007_PARITY_TEST_NAME =
  'checked-in dev core is a byte-identical non-mutating projection of authoritative source';
const T007_RUNTIME_TEST_NAME =
  'T005 incident contracts: the exact-evidence branch derives intent, events, batches, preview, and mutation acyclically';
const T007_POLICY_TEST_NAME =
  'T006 Core Dogfood first-adopter policy fixture rejects every invalid closed packet';
const T007_LANE_RUNTIME_TEST_NAME =
  'T006 lightweight incident supersession commits both permitted blocked transitions';

/** @param {string} output */
function substantiveCommandOutputFixture(output) {
  return output
    .replace(/duration_ms: [0-9.]+/g, 'duration_ms: <presentation>')
    .replace(/^# duration_ms [0-9.]+$/gm, '# duration_ms <presentation>');
}

/** @param {string} root @param {string[]} args */
function runNodeCommandFixture(root, args) {
  const { NODE_TEST_CONTEXT: _parentTestContext, ...childEnv } = process.env;
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.error, undefined, `node ${args.join(' ')}: process launch`);
  const stdout = substantiveCommandOutputFixture(result.stdout ?? '');
  const stderr = substantiveCommandOutputFixture(result.stderr ?? '');
  const command = [process.execPath, ...args];
  return {
    command,
    commandIdentity: fixtureIdentity({ command, exitCode: result.status, stderr, stdout }),
    exitCode: result.status,
    stderr,
    stdout,
  };
}

/** @param {ReturnType<typeof runNodeCommandFixture>} command */
function tapCommandFactsFixture(command) {
  const output = `${command.stdout}\n${command.stderr}`;
  const readCount = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(output)?.[1] ?? -1);
  return {
    ...command,
    selected: [...output.matchAll(/^# Subtest: (.+)$/gm)].map((match) => match[1]),
    failed: [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]),
    counts: {
      tests: readCount('tests'),
      pass: readCount('pass'),
      fail: readCount('fail'),
      cancelled: readCount('cancelled'),
      skipped: readCount('skipped'),
      todo: readCount('todo'),
    },
  };
}

/** @param {string} root @param {string} testFile @param {string} exactName */
function runExactNamedTestFixture(root, testFile, exactName) {
  return tapCommandFactsFixture(runNodeCommandFixture(root, [
    '--test',
    '--test-reporter=tap',
    `--test-name-pattern=^${exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    testFile,
  ]));
}

/** @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function parityProbeFixture(facts) {
  return structuredClone(facts.parityCommand);
}

/** @param {unknown} candidate @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function acceptsParityProbeFixture(candidate, facts) {
  if (!hasExactFixtureKeys(candidate, [
    'command', 'commandIdentity', 'exitCode', 'stdout', 'stderr', 'selected', 'failed', 'counts', 'observedDelta',
  ])) return false;
  const probe = /** @type {Record<string, any>} */ (candidate);
  return JSON.stringify(probe) === JSON.stringify(facts.parityCommand)
    && probe.exitCode === 1
    && sameFixtureStringList(probe.failed, [T007_PARITY_TEST_NAME])
    && sameFixtureStringList(probe.selected, [T007_PARITY_TEST_NAME])
    && hasExactFixtureKeys(probe.counts, ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'])
    && probe.counts.tests === 1
    && probe.counts.pass === 0
    && probe.counts.fail === 1
    && probe.counts.cancelled === 0
    && probe.counts.skipped === 0
    && probe.counts.todo === 0
    && JSON.stringify(probe.observedDelta) === JSON.stringify(facts.expectedProjectionDelta);
}

/** @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function preMaterializationVerificationFixture(facts) {
  const checks = structuredClone(facts.focusedCommands);
  const parity = parityProbeFixture(facts);
  return {
    checks,
    parity,
    identity: fixtureIdentity({ checks, parity }),
  };
}

/** @param {unknown} candidate @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function acceptsPreMaterializationVerificationFixture(candidate, facts) {
  if (!hasExactFixtureKeys(candidate, ['checks', 'parity', 'identity'])) return false;
  const verification = /** @type {Record<string, any>} */ (candidate);
  if (!Array.isArray(verification.checks)
    || verification.checks.length !== 3
    || !sameFixtureStringList(verification.checks.map(({ kind }) => kind), [
      'source', 'policy', 'runtime',
    ])
    || verification.checks.some((check) => (
      !hasExactFixtureKeys(check, [
        'kind', 'status', 'parityDependent', 'command', 'commandIdentity', 'exitCode', 'stdout', 'stderr', 'selected', 'failed', 'counts',
      ])
      || check.status !== 'PASS'
      || check.parityDependent !== false
      || check.exitCode !== 0
      || !hasExactFixtureKeys(check.counts, ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'])
      || check.counts.tests !== 1
      || check.counts.pass !== 1
      || check.counts.fail !== 0
      || check.counts.cancelled !== 0
      || check.counts.skipped !== 0
      || check.counts.todo !== 0
      || check.failed.length !== 0
    ))) return false;
  if (!acceptsParityProbeFixture(verification.parity, facts)) return false;
  return verification.identity === fixtureIdentity({
    checks: verification.checks,
    parity: verification.parity,
  });
}

/**
 * @param {ReturnType<typeof deriveTransientPacketFixture>} facts
 * @param {'Tester'|'Reviewer'} role
 */
function packetApprovalRecordFixture(facts, role) {
  const verification = preMaterializationVerificationFixture(facts);
  const authorityPath = role === 'Tester'
    ? '.github/agents/dude-pack-coding-tester.agent.md'
    : '.github/agents/dude-pack-coding-reviewer.agent.md';
  const authorityBytes = read(authorityPath);
  assert.match(authorityBytes, new RegExp(`^name: "${role === 'Reviewer' ? 'Code Reviewer' : role}"$`, 'm'));
  const authorityIdentity = fixtureIdentity({ authorityPath, authorityBytes });
  const invocationIdentity = fixtureIdentity({
    role,
    authorityIdentity,
    packet: facts.packetIdentity,
    verification: verification.identity,
  });
  const approval = {
    version: 1,
    role,
    verdict: role === 'Tester' ? 'PASS' : 'APPROVE',
    acquisition: 'independently-reacquired',
    authorityPath,
    authorityIdentity,
    invocationIdentity,
    lane: facts.lane,
    laneIdentity: facts.laneIdentity,
    terminal: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    head: facts.currentHead,
    srcTree: facts.currentSrcTree,
    baselineHead: facts.baselineHead,
    baselineSrcTree: facts.baselineSrcTree,
    continuity: facts.continuityIdentity,
    policyAcceptance: facts.policyAcceptanceIdentity,
    authority: facts.authorityIdentity,
    declaration: facts.acceptedDeclarationIdentity,
    t008Changed: facts.acceptedChangedIdentity,
    source: facts.completeSourceIdentity,
    changed: facts.completeChangedIdentity,
    partition: facts.contributorPartitionIdentity,
    dirt: facts.dirtIdentity,
    mapping: facts.mappingIdentity,
    generatedPrestate: facts.generatedPrestateIdentity,
    projection: facts.expectedProjectionIdentity,
    projectionDelta: facts.expectedProjectionDeltaIdentity,
    materializerResult: facts.materializerResultIdentity,
    protectedPrestate: facts.protectedPrestateIdentity,
    verification: verification.identity,
    packet: facts.packetIdentity,
    record: '',
  };
  approval.record = [
    role === 'Tester' ? 'Tester PASS' : 'Code Reviewer APPROVE',
    `authority=${approval.authorityIdentity}`,
    `invocation=${approval.invocationIdentity}`,
    `lane=${approval.lane}`,
    `lane_identity=${approval.laneIdentity}`,
    `terminal=${approval.terminal}`,
    `head=${approval.head}`,
    `src_tree=${approval.srcTree}`,
    `baseline=${approval.baselineHead}`,
    `continuity=${approval.continuity}`,
    `policy_acceptance=${approval.policyAcceptance}`,
    `task_authority=${approval.authority}`,
    `declared=${approval.declaration}`,
    `t008_changed=${approval.t008Changed}`,
    `source=${approval.source}`,
    `changed=${approval.changed}`,
    `partition=${approval.partition}`,
    `dirt=${approval.dirt}`,
    `mapping=${approval.mapping}`,
    `generated_prestate=${approval.generatedPrestate}`,
    `projection=${approval.projection}`,
    `projection_delta=${approval.projectionDelta}`,
    `materializer_result=${approval.materializerResult}`,
    `protected_prestate=${approval.protectedPrestate}`,
    `verification=${approval.verification}`,
    `packet=${approval.packet}`,
  ].join(' ');
  return approval;
}

/** @param {string} root @param {'Tester'|'Reviewer'} role */
function independentlyReacquirePacketApprovalFixture(root, role) {
  const facts = deriveTransientPacketFixture(root);
  assert.deepEqual(
    facts.failures,
    [],
    `${role}: independent authoritative reacquisition\n${JSON.stringify({
      focusedCommands: facts.focusedCommands.map((command) => ({
        kind: command.kind,
        exitCode: command.exitCode,
        selected: command.selected,
        failed: command.failed,
        counts: command.counts,
        stdout: command.stdout.slice(0, 240),
        stderr: command.stderr.slice(0, 240),
      })),
      parityCommand: {
        exitCode: facts.parityCommand.exitCode,
        selected: facts.parityCommand.selected,
        failed: facts.parityCommand.failed,
        counts: facts.parityCommand.counts,
        stdout: facts.parityCommand.stdout.slice(0, 240),
        stderr: facts.parityCommand.stderr.slice(0, 240),
      },
    }, null, 2)}`,
  );
  return packetApprovalRecordFixture(facts, role);
}

/**
 * @param {unknown} candidate
 * @param {'Tester'|'Reviewer'} role
 * @param {ReturnType<typeof deriveTransientPacketFixture>} facts
 */
function acceptsPacketApprovalFixture(candidate, role, facts) {
  const expected = packetApprovalRecordFixture(facts, role);
  return hasExactFixtureKeys(candidate, Object.keys(expected))
    && JSON.stringify(candidate) === JSON.stringify(expected);
}

/** @param {string} root */
function deriveTransientPacketFixture(root) {
  /** @type {string[]} */
  const failures = [];
  const currentHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const currentSrcTree = git(root, ['rev-parse', '--verify', 'HEAD:src']).trim();
  const branch = git(root, ['branch', '--show-current']).trim();
  if (branch !== 'main') failures.push('checkout-main');
  const gitDir = path.resolve(root, git(root, ['rev-parse', '--git-dir']).trim());
  const gitCommonDir = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
  if (gitDir !== gitCommonDir || gitDir !== path.join(path.resolve(root), '.git')) {
    failures.push('checkout-isolation');
  }
  const lane = 'lightweight';
  const taskState = readTaskState(root);
  const policyTasksPath = T007_TRANSIENT_IDENTITIES.policySpec.replace(/\/spec\.md$/, '/tasks.md');
  const adopterTasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
  if (taskState.status !== 'ok') failures.push('lane-task-state');
  const policySnapshot = taskState.status === 'ok' ? taskState.state[policyTasksPath] : null;
  const adopterSnapshot = taskState.status === 'ok' ? taskState.state[adopterTasksPath] : null;
  const policy = resolveTransientAuthorityFixture(root, {
    spec: T007_TRANSIENT_IDENTITIES.policySpec,
    owner: T007_TRANSIENT_IDENTITIES.policyOwner,
    taskKeys: [
      T007_TRANSIENT_IDENTITIES.priorBridgeTask,
      T007_TRANSIENT_IDENTITIES.transientPacketTask,
    ],
    terminal: T007_TRANSIENT_IDENTITIES.transientPacketTask,
    terminalMustBeDone: true,
    sourcePaths: [],
  }, failures);
  const adopter = resolveTransientAuthorityFixture(root, {
    spec: T007_TRANSIENT_IDENTITIES.adopterSpec,
    owner: T007_TRANSIENT_IDENTITIES.adopterOwner,
    taskKeys: [T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask],
    terminal: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    terminalMustBeDone: false,
    sourcePaths: [],
  }, failures);
  const feature003 = resolveTransientAuthorityFixture(root, {
    spec: T007_TRANSIENT_IDENTITIES.contributor003Spec,
    owner: T007_TRANSIENT_IDENTITIES.contributor003Owner,
    taskKeys: sortFixturePaths(new Set(Object.values(T007_FEATURE_003_CHAINS).flat())),
    terminal: T007_TRANSIENT_IDENTITIES.contributor003Terminal,
    terminalMustBeDone: true,
    sourcePaths: T007_FEATURE_003_PATHS,
    attributionOnly: true,
    sourceTasks: Object.fromEntries(Object.entries(T007_FEATURE_003_CHAINS).map(([
      sourcePath,
      chain,
    ]) => [sourcePath, chain[0]])),
  }, failures);
  const feature006 = resolveTransientAuthorityFixture(root, {
    spec: T007_TRANSIENT_IDENTITIES.contributor006Spec,
    owner: T007_TRANSIENT_IDENTITIES.contributor006Owner,
    taskKeys: [T007_TRANSIENT_IDENTITIES.contributor006Task],
    terminal: T007_TRANSIENT_IDENTITIES.contributor006Terminal,
    terminalMustBeDone: true,
    sourcePaths: T007_FEATURE_006_PATHS,
    attributionOnly: true,
    sourceTasks: {
      [T007_FEATURE_006_PATHS[0]]: T007_TRANSIENT_IDENTITIES.contributor006Task,
    },
  }, failures);

  const currentPolicyIdentity = fixtureIdentity([
    fs.readFileSync(path.join(root, PROJECT_SKILL), 'utf8'),
    fs.readFileSync(path.join(root, CORE_DOGFOOD_LOCAL_SKILL), 'utf8'),
    fs.readFileSync(path.join(root, 'scripts/current-format-contract.test.mjs'), 'utf8'),
  ]);
  const policyAcceptanceRecords = [];
  for (const taskKey of [
    T007_TRANSIENT_IDENTITIES.priorBridgeTask,
    T007_TRANSIENT_IDENTITIES.transientPacketTask,
  ]) {
    const event = coordinatorLogLinesFixture(policy.ownerText)
      .filter((line) => line.includes(`closed ${taskKey}`))
      .at(-1) ?? null;
    if (!event
      || !/closed/i.test(event)
      || !/(?:independent )?Tester(?: verification)? (?:PASS|passed|ACCEPT)/i.test(event)
      || !/(?:independent )?(?:Code )?Reviewer (?:returned )?(?:APPROVE|approved)/i.test(event)) {
      failures.push(`policy-acceptance:${taskKey}`);
    }
    if (taskKey === T007_TRANSIENT_IDENTITIES.priorBridgeTask) {
      if (!/final targeted contracts passed 7\/7/.test(event ?? '')
        || !/full current-format contracts passed 69\/69/.test(event ?? '')
        || !/Dude lint passed 0 warnings and 0 failures/.test(event ?? '')
        || !/`git diff --check` was clean/.test(event ?? '')
        || !/`src\/\*\*` and base-owned generated core remained unchanged/.test(event ?? '')
        || !/Feature 009 definition and owner files remained byte-identical/.test(event ?? '')
        || !/independent Tester verification passed/.test(event ?? '')
        || !/independent Reviewer returned APPROVE/.test(event ?? '')) {
        failures.push(`policy-acceptance:${taskKey}`);
      }
    } else {
      const tokens = ownerEventTokensFixture(event ?? '');
      if (!/focused verification PASS; independent Tester PASS; independent Code Reviewer APPROVE/.test(event ?? '')
        || tokens.head !== currentHead
        || tokens.policy !== currentPolicyIdentity) {
        failures.push(`policy-acceptance:${taskKey}`);
      }
    }
    policyAcceptanceRecords.push(event ?? '');
  }
  if (!policySnapshot || !adopterSnapshot) failures.push('lane-task-state');
  for (const [parsed, snapshot, taskKey] of [
    [policy.parsed, policySnapshot, T007_TRANSIENT_IDENTITIES.priorBridgeTask],
    [policy.parsed, policySnapshot, T007_TRANSIENT_IDENTITIES.transientPacketTask],
    [adopter.parsed, adopterSnapshot, T007_TRANSIENT_IDENTITIES.adopterTerminal],
  ]) {
    const task = parsed.byId.get(taskKey);
    if (!task || snapshot?.glyphs?.[taskKey] !== task.glyph) {
      failures.push(`lane-snapshot:${taskKey}`);
    }
  }

  for (const [sourcePath, chain] of Object.entries(T007_FEATURE_003_CHAINS)) {
    const claim = feature003.claims.filter((entry) => entry.sourcePath === sourcePath);
    if (claim.length !== 1 || claim[0].taskKey !== chain[0]) {
      failures.push(`authority-source-task:${sourcePath}`);
    }
    const fullChain = [...chain, T007_TRANSIENT_IDENTITIES.contributor003Terminal];
    for (let index = 1; index < fullChain.length; index += 1) {
      if (!feature003.parsed.byId.get(fullChain[index])?.deps.includes(fullChain[index - 1])) {
        failures.push(`authority-task-chain:${sourcePath}:${fullChain[index]}`);
      }
    }
  }
  if (!feature006.parsed.byId.get(T007_TRANSIENT_IDENTITIES.contributor006Terminal)
    ?.deps.includes(T007_TRANSIENT_IDENTITIES.contributor006Task)) {
    failures.push(`authority-task-chain:${T007_FEATURE_006_PATHS[0]}`);
  }

  const t009Paths = taskPathClauseFixture(adopter.terminal?.description ?? '', 'declared-src');
  if (t009Paths.length !== 10
    || new Set(t009Paths).size !== 10
    || !sameFixtureStringList(t009Paths, sortFixturePaths(t009Paths))) {
    failures.push('t009-declaration-shape');
  }
  const adopterLogLines = coordinatorLogLinesFixture(adopter.ownerText);
  const baselineCandidates = adopterLogLines.flatMap((line, index, lines) => {
    const match = /core-dogfood-baseline v1 terminal=([^\s]+) head=([0-9a-f]{40}) src_tree=([0-9a-f]{40})/.exec(line);
    if (!match) return [];
    const nextBaseline = lines.findIndex((candidate, candidateIndex) => (
      candidateIndex > index && candidate.includes('core-dogfood-baseline v1')
    ));
    const context = lines.slice(index + 1, nextBaseline === -1 ? lines.length : nextBaseline).join('\n');
    return [{
      canonical: / - core-dogfood-baseline v1 terminal=/.test(line),
      context,
      head: match[2],
      index,
      line,
      postSource: /post-source|after source modification/i.test(`${line}\n${context}`),
      replacement: /replacement/i.test(`${line}\n${context}`),
      srcTree: match[3],
      terminal: match[1],
      void: /\bVOID:/i.test(context)
        || lines.some((candidate) => /\bVOID:/i.test(candidate) && candidate.includes(match[2])),
    }];
  });
  const validBaselines = baselineCandidates.filter((candidate) => (
    candidate.canonical
    && candidate.terminal === T007_TRANSIENT_IDENTITIES.adopterTerminal
    && !candidate.postSource
    && !candidate.replacement
    && !candidate.void
  ));
  if (validBaselines.length === 0) failures.push('baseline-original-missing');
  if (validBaselines.length > 1) failures.push('baseline-duplicate');
  if (baselineCandidates.some((candidate) => candidate.postSource && !candidate.void)) {
    failures.push('baseline-post-source');
  }
  if (baselineCandidates.some((candidate) => candidate.replacement && !candidate.void)) {
    failures.push('baseline-replacement');
  }
  if (validBaselines.length === 0 && baselineCandidates.some((candidate) => candidate.void)) {
    failures.push('baseline-void');
  }
  const selectedBaseline = validBaselines[0] ?? baselineCandidates[0] ?? {
    head: currentHead,
    index: Number.MAX_SAFE_INTEGER,
    line: '',
    srcTree: currentSrcTree,
  };
  const baselineEvent = selectedBaseline.line;
  const baselineTokens = ownerEventTokensFixture(baselineEvent);
  const t008Claim = adopterLogLines
    .filter((line) => line.includes(`claimed ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`))
    .at(-1) ?? '';
  const t008Close = adopterLogLines
    .filter((line) => line.includes(`closed ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`))
    .at(-1) ?? '';
  const committedAdopterText = git(root, [
    'show', `${currentHead}:${T007_TRANSIENT_IDENTITIES.adopterOwner}`,
  ]);
  const committedAdopterLines = coordinatorLogLinesFixture(committedAdopterText);
  const committedT008Claim = committedAdopterLines
    .filter((line) => line.includes(`claimed ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`))
    .at(-1) ?? '';
  const committedT008Close = committedAdopterLines
    .filter((line) => line.includes(`closed ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`))
    .at(-1) ?? '';
  if (t008Claim !== committedT008Claim) failures.push('t008-changed-identity');
  if (t008Close !== committedT008Close) failures.push('t008-close-identity-binding');
  const t008ClaimIndex = adopterLogLines.indexOf(t008Claim);
  const t008ClaimMatch = new RegExp(
    `terminal ${T007_TRANSIENT_IDENTITIES.adopterTerminal} declaration[^\\n]*`
    + 'declaration identity ([0-9a-f]{64}) and changed-source identity ([0-9a-f]{64})',
  ).exec(t008Claim);
  const baselineHead = baselineTokens.head ?? '';
  const baselineSrcTree = baselineTokens.src_tree ?? '';
  if (!/^[0-9a-f]{40}$/.test(baselineHead)) failures.push('baseline-owner-event-identity');
  const baselineObjectType = /^[0-9a-f]{40}$/.test(baselineSrcTree)
    ? spawnSync('git', ['cat-file', '-t', baselineSrcTree], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    : { status: 1, stdout: '' };
  if (baselineObjectType.status !== 0 || baselineObjectType.stdout.trim() !== 'tree') {
    failures.push('baseline-src-tree-object');
  }
  const expectedBaselineSrcTree = /^[0-9a-f]{40}$/.test(baselineHead)
    ? spawnSync('git', ['rev-parse', '--verify', `${baselineHead}:src`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    : { status: 1, stdout: '' };
  if (expectedBaselineSrcTree.status !== 0
    || expectedBaselineSrcTree.stdout.trim() !== baselineSrcTree) {
    failures.push('baseline-src-tree-equality');
  }
  if (selectedBaseline.index >= t008ClaimIndex || t008ClaimIndex === -1) {
    failures.push('baseline-chronology');
  }
  if (spawnSync('git', ['merge-base', '--is-ancestor', baselineHead, currentHead], {
    cwd: root,
    stdio: 'ignore',
  }).status !== 0) failures.push('baseline-ancestry');
  const continuityEvents = adopterLogLines.filter((line) => (
    line.includes(`user explicitly authorized ${T007_TRANSIENT_IDENTITIES.adopterTerminal} continuity`)
  ));
  if (continuityEvents.length !== 1) failures.push('continuity-authorization-count');
  const continuityEvent = continuityEvents[0] ?? '';
  const continuityMatch = new RegExp(
    `user explicitly authorized ${T007_TRANSIENT_IDENTITIES.adopterTerminal} continuity from original baseline ([0-9a-f]{40}) through revisions (.+), to current HEAD ([0-9a-f]{40}); authorization is bound to the original Feature009 owner, terminal, and serialized interval and grants no authority after HEAD or chain drift`,
  ).exec(continuityEvent);
  const authorizedBaseline = continuityMatch?.[1] ?? '';
  const authorizedHead = continuityMatch?.[3] ?? '';
  const authorizedChain = continuityMatch
    ? [...continuityMatch[2].split(',').map((entry) => entry.trim()), authorizedHead]
    : [];
  const expectedContinuityChain = /^[0-9a-f]{40}$/.test(baselineHead)
    ? git(root, ['rev-list', '--reverse', '--topo-order', `${baselineHead}..${currentHead}`])
      .trim().split('\n').filter(Boolean)
    : [];
  if (authorizedBaseline !== baselineHead) failures.push('continuity-baseline');
  if (authorizedHead !== currentHead) failures.push('continuity-head');
  if (!sameFixtureStringList(authorizedChain, expectedContinuityChain)) {
    failures.push('continuity-chain');
  }

  const terminal = adopter.terminal;
  const declaredTerminals = adopter.parsed.tasks.filter((task) => (
    taskPathClauseFixture(task.description, 'declared-src').length > 0
  ));
  if (declaredTerminals.length !== 1 || declaredTerminals[0]?.id !== T007_TRANSIENT_IDENTITIES.adopterTerminal) {
    failures.push('terminal-unique');
  }
  if (terminal?.parallel !== false) failures.push('terminal-parallel');
  if (terminal?.label !== 'Shared') failures.push('terminal-shared');
  for (const dependency of terminal?.deps ?? []) {
    if (adopter.parsed.byId.get(dependency)?.state !== 'done') {
      failures.push(`terminal-dependency:${dependency}`);
    }
  }
  if (!sameFixtureStringList(terminal?.deps ?? [], T007_ADOPTER_DEPENDENCIES)) {
    failures.push('terminal-dependency-set');
  }
  const terminalBeforeT007Acceptance = terminal?.state === 'blocked'
    && terminal.blockedBy === T007_ADOPTER_BLOCKER;
  const terminalAfterT007Claim = terminal?.state === 'in-progress'
    && terminal.blockedBy === null;
  if (!terminalBeforeT007Acceptance && !terminalAfterT007Claim) {
    failures.push('terminal-unrelated-blocker');
  }
  const policyBridge = policy.parsed.byId.get(T007_TRANSIENT_IDENTITIES.priorBridgeTask);
  const policyPacket = policy.parsed.byId.get(T007_TRANSIENT_IDENTITIES.transientPacketTask);
  if (policyBridge?.state !== 'done'
    || policyPacket?.state !== 'done'
    || !sameFixtureStringList(policyPacket.deps, [T007_TRANSIENT_IDENTITIES.priorBridgeTask])) {
    failures.push('terminal-t007-resolution');
  }

  const currentDelta = deriveGitDeltaFixture(root, baselineHead, currentHead);
  if (currentDelta.changedRows.length !== 20) failures.push('complete-delta-count');
  const acceptedDeclarationIdentity = fixtureIdentity(t009Paths);
  const t009PathSet = new Set(t009Paths);
  const t009ChangedRows = currentDelta.changedRows.filter(({ path: candidate }) => (
    t009PathSet.has(candidate)
  ));
  const acceptedChangedIdentity = t008ClaimMatch?.[2] ?? '';
  if (t008ClaimMatch?.[1] !== acceptedDeclarationIdentity) failures.push('t008-declaration-identity');
  if (!/^[0-9a-f]{64}$/.test(acceptedChangedIdentity)) failures.push('t008-changed-identity');
  if (!t008Close
    || !/independent source acceptance bound the same frozen identity/i.test(t008Close)
    || !/changed-source identity was re-verified unchanged/i.test(t008Close)) {
    failures.push('t008-close-identity-binding');
  }
  if (!sameFixtureStringList(t009ChangedRows.map(({ path: candidate }) => candidate), t009Paths)) {
    failures.push('t008-accepted-declaration-coverage');
  }
  const currentT009Rows = canonicalPathRowsFixture(currentDelta.current, root, t009Paths);
  const currentT009SourceIdentity = fixtureIdentity(currentT009Rows);
  const acceptedRevisionCandidates = expectedContinuityChain.filter((revision) => {
    const revisionTree = gitTreeFixture(root, revision, 'src');
    return JSON.stringify(canonicalPathRowsFixture(revisionTree, root, t009Paths))
      === JSON.stringify(currentT009Rows);
  });
  const t008AcceptedRevision = acceptedRevisionCandidates[0] ?? '';
  const acceptedRevisionIndex = expectedContinuityChain.indexOf(t008AcceptedRevision);
  const acceptedDescendants = /^[0-9a-f]{40}$/.test(t008AcceptedRevision)
    ? expectedContinuityChain.filter((revision) => spawnSync(
      'git',
      ['merge-base', '--is-ancestor', t008AcceptedRevision, revision],
      { cwd: root, stdio: 'ignore' },
    ).status === 0)
    : [];
  if (!/^[0-9a-f]{40}$/.test(t008AcceptedRevision)
    || acceptedRevisionIndex === -1
    || acceptedRevisionCandidates.length !== acceptedDescendants.length
    || acceptedDescendants.some((revision, index) => (
      revision !== acceptedRevisionCandidates[index]
    ))) {
    failures.push('t008-current-row-drift');
    failures.push('t008-changed-identity');
  }

  const claims = [
    { authority: 'T009', paths: t009Paths },
    { authority: 'Feature 003', paths: feature003.claims.map(({ sourcePath }) => sourcePath) },
    { authority: 'Feature 006', paths: feature006.claims.map(({ sourcePath }) => sourcePath) },
  ];
  const claimedPaths = claims.flatMap(({ paths }) => paths);
  if (claims[0].paths.length !== 10 || claims[1].paths.length !== 9 || claims[2].paths.length !== 1) {
    failures.push('coverage-counts');
  }
  if (claims.some(({ paths }) => new Set(paths).size !== paths.length)) {
    failures.push('coverage-duplicate-claim');
  }
  const pathAuthorities = new Map();
  for (const { authority, paths } of claims) {
    for (const sourcePath of new Set(paths)) {
      if (!pathAuthorities.has(sourcePath)) pathAuthorities.set(sourcePath, new Set());
      pathAuthorities.get(sourcePath).add(authority);
    }
  }
  if ([...pathAuthorities.values()].some((authorities) => authorities.size > 1)) {
    failures.push('coverage-overlap');
  }
  const claimedSorted = sortFixturePaths(claimedPaths);
  if (!sameFixtureStringList(claimedSorted, currentDelta.changedPaths)) {
    const deltaSet = new Set(currentDelta.changedPaths);
    const claimSet = new Set(claimedPaths);
    if (currentDelta.changedPaths.some((candidate) => !claimSet.has(candidate))) {
      failures.push('coverage-unclaimed-delta');
      if (currentDelta.changedPaths.some((candidate) => (
        !claimSet.has(candidate)
        && currentDelta.current.has(candidate)
        && isReleaseFile(srcToDeploy(candidate))
      ))) failures.push('generated-extra-source-output');
    }
    if (claimedPaths.some((candidate) => !deltaSet.has(candidate))) failures.push('coverage-claim-outside-delta');
  }
  const changeKinds = {
    addition: false,
    content: false,
    deletion: false,
    mode: false,
    rename: false,
    type: false,
  };
  const deletedByOid = new Map();
  const addedByOid = new Map();
  for (const sourcePath of currentDelta.changedPaths) {
    const before = currentDelta.original.get(sourcePath);
    const after = currentDelta.current.get(sourcePath);
    if (!before && after) {
      changeKinds.addition = true;
      addedByOid.set(after.oid, sourcePath);
    } else if (before && !after) {
      changeKinds.deletion = true;
      deletedByOid.set(before.oid, sourcePath);
    } else if (before && after) {
      if (before.mode !== after.mode) {
        if (before.mode === '120000' || after.mode === '120000') changeKinds.type = true;
        else changeKinds.mode = true;
      }
      if (before.oid !== after.oid) changeKinds.content = true;
    }
  }
  changeKinds.rename = [...deletedByOid.keys()].some((oid) => addedByOid.has(oid));

  const currentTree = currentDelta.current;

  const dirt = coreDogfoodBaselineLayers(root);
  if (!dirt.accepted) {
    for (const [layer, entries] of Object.entries(dirt)) {
      if (layer !== 'accepted' && Array.isArray(entries) && entries.length > 0) {
        failures.push(`dirt:${layer}`);
      }
    }
  }

  const mapping = [...feature003.claims, ...feature006.claims].map(({ sourcePath }) => {
    const destination = srcToDeploy(sourcePath);
    return {
      authority: T007_FEATURE_006_PATHS.includes(sourcePath) ? 'Feature 006' : 'Feature 003',
      destination: isReleaseFile(destination) ? destination : null,
      noOutput: !isReleaseFile(destination),
      source: canonicalPathRowsFixture(currentTree, root, [sourcePath])[0],
      sourcePath,
    };
  });
  const generatedMapping = mapping.filter(({ noOutput }) => !noOutput);
  const noOutputMapping = mapping.filter(({ noOutput }) => noOutput);
  if (generatedMapping.length !== 5 || noOutputMapping.length !== 5) failures.push('mapping-five-five');
  const t009GeneratedPaths = sortFixturePaths(t009Paths
    .filter((sourcePath) => isReleaseFile(srcToDeploy(sourcePath)))
    .map((sourcePath) => srcToDeploy(sourcePath)));
  const contributorGeneratedPaths = sortFixturePaths(generatedMapping
    .map(({ destination }) => /** @type {string} */ (destination)));
  if (t009GeneratedPaths.length !== 8) failures.push('generated-t009-eight');
  if (t009GeneratedPaths.some((candidate) => contributorGeneratedPaths.includes(candidate))) {
    failures.push('generated-scope-overlap');
  }
  const expectedCompleteProjection = expectedCompleteProjectionFixture(root, currentHead);
  const baselineProjection = coreProjectionAtRevisionFixture(root, baselineHead);
  const expectedPrestateMap = new Map(baselineProjection.map((row) => [row.path, row]));
  const completeProjectionMap = new Map(expectedCompleteProjection.map((row) => [row.path, row]));
  for (const row of mapping) {
    if (row.noOutput) expectedPrestateMap.delete(srcToDeploy(row.sourcePath));
    else expectedPrestateMap.set(/** @type {string} */ (row.destination), completeProjectionMap.get(row.destination));
  }
  const expectedGeneratedPrestate = sortFixturePaths([...expectedPrestateMap.keys()])
    .map((candidate) => expectedPrestateMap.get(candidate));
  const currentGeneratedPrestate = filesystemCoreProjectionFixture(root);
  if (JSON.stringify(currentGeneratedPrestate) !== JSON.stringify(expectedGeneratedPrestate)) {
    failures.push('generated-composed-prestate');
  }
  const expectedPrestateByPath = new Map(expectedGeneratedPrestate.map((row) => [row.path, row]));
  const currentPrestateByPath = new Map(currentGeneratedPrestate.map((row) => [row.path, row]));
  if (currentGeneratedPrestate.some((row) => !expectedPrestateByPath.has(row.path))) {
    failures.push('generated-unauthorized-extra-output');
  }
  if (expectedGeneratedPrestate.some((row) => !currentPrestateByPath.has(row.path))) {
    failures.push('generated-stale-removal');
  }
  if (expectedGeneratedPrestate.some((row) => {
    const current = currentPrestateByPath.get(row.path);
    return current && JSON.stringify(current) !== JSON.stringify(row);
  })) {
    failures.push('generated-tracked-rewrite');
  }
  for (const row of noOutputMapping) {
    if (currentGeneratedPrestate.some((entry) => entry.path === srcToDeploy(row.sourcePath))) {
      failures.push(`generated-no-output:${row.sourcePath}`);
    }
  }
  const materialized = materializedCompleteProjectionFixture(root);
  if (JSON.stringify(materialized.generatedBefore) !== JSON.stringify(currentGeneratedPrestate)) {
    failures.push('generated-filesystem-prestate');
  }
  if (JSON.stringify(materialized.inventory) !== JSON.stringify(expectedCompleteProjection)) {
    failures.push('generated-complete-projection');
  }
  if (!sameFixtureStringList(materialized.result.written, expectedCompleteProjection.map(({ path: candidate }) => candidate))) {
    failures.push('generated-materializer-written');
  }
  if (!sameFixtureStringList(materialized.result.removed, materialized.expectedRemoved)) {
    failures.push('generated-materializer-removed');
  }
  const expectedProjectionDelta = projectionDeltaRowsFixture(
    currentGeneratedPrestate,
    expectedCompleteProjection,
  );
  if (JSON.stringify(materialized.observedDelta) !== JSON.stringify(expectedProjectionDelta)) {
    failures.push('generated-observed-projection-delta');
  }
  if (!sameFixtureStringList(
    expectedProjectionDelta.map(({ path: candidate }) => candidate),
    t009GeneratedPaths,
  )) failures.push('generated-t009-delta-scope');
  if (JSON.stringify(materialized.protectedAfter) !== JSON.stringify(materialized.protectedBefore)) {
    failures.push('protected-materializer-drift');
  }

  const focusedCommandDefinitions = [
    ['source', 'src/skills/dude-work/recovery.test.mjs', T007_RUNTIME_TEST_NAME],
    ['policy', 'scripts/current-format-contract.test.mjs', T007_POLICY_TEST_NAME],
    ['runtime', 'src/skills/dude-lightweight-execution/board.test.mjs', T007_LANE_RUNTIME_TEST_NAME],
  ];
  const focusedCommands = focusedCommandDefinitions.map(([kind, testFile, exactName]) => {
    const command = runExactNamedTestFixture(root, testFile, exactName);
    const accepted = command.exitCode === 0
      && sameFixtureStringList(command.selected, [exactName])
      && command.failed.length === 0
      && command.counts.tests === 1
      && command.counts.pass === 1
      && command.counts.fail === 0
      && command.counts.cancelled === 0
      && command.counts.skipped === 0
      && command.counts.todo === 0;
    if (!accepted) failures.push(`focused-command:${kind}`);
    return {
      kind,
      status: accepted ? 'PASS' : 'FAIL',
      parityDependent: false,
      ...command,
    };
  });
  const parityResult = runExactNamedTestFixture(
    root,
    'scripts/build-dev.test.mjs',
    T007_PARITY_TEST_NAME,
  );
  const parityCommand = {
    ...parityResult,
    observedDelta: materialized.observedDelta,
  };
  if (parityResult.exitCode !== 1
    || !sameFixtureStringList(parityResult.selected, [T007_PARITY_TEST_NAME])
    || !sameFixtureStringList(parityResult.failed, [T007_PARITY_TEST_NAME])
    || parityResult.counts.tests !== 1
    || parityResult.counts.pass !== 0
    || parityResult.counts.fail !== 1
    || parityResult.counts.cancelled !== 0
    || parityResult.counts.skipped !== 0
    || parityResult.counts.todo !== 0
    || JSON.stringify(parityCommand.observedDelta) !== JSON.stringify(expectedProjectionDelta)) {
    failures.push('parity-command');
  }

  const completeSourceRows = canonicalGitRowsFixture(currentTree, root);
  const completeSourceIdentity = fixtureIdentity(completeSourceRows);
  const completeChangedIdentity = fixtureIdentity(currentDelta.changedRows);
  const contributorPartition = claims.slice(1).map(({ authority, paths }) => ({
    authority,
    paths: sortFixturePaths(paths),
    rows: canonicalPathRowsFixture(currentTree, root, sortFixturePaths(paths)),
  }));
  const contributorPartitionIdentity = fixtureIdentity(contributorPartition);
  const laneIdentity = fixtureIdentity({
    lane,
    policyTasksPath,
    policyGlyphs: policySnapshot?.glyphs ?? null,
    adopterTasksPath,
    adopterGlyphs: adopterSnapshot?.glyphs ?? null,
  });
  const continuityIdentity = fixtureIdentity({
    event: continuityEvent,
    baseline: authorizedBaseline,
    chain: authorizedChain,
    head: authorizedHead,
  });
  const policyAcceptanceIdentity = fixtureIdentity(policyAcceptanceRecords);
  const authorityIdentity = fixtureIdentity([
    policy.resolved.owner,
    adopter.resolved.owner,
    feature003.resolved.owner,
    feature006.resolved.owner,
    policyAcceptanceRecords,
    continuityEvent,
    t008Claim,
    t008Close,
    laneIdentity,
    ...claims.map(({ authority, paths }) => ({ authority, paths })),
  ]);
  const mappingIdentity = fixtureIdentity(mapping);
  const generatedPrestateIdentity = fixtureIdentity(currentGeneratedPrestate);
  const expectedProjectionIdentity = fixtureIdentity(expectedCompleteProjection);
  const expectedProjectionDeltaIdentity = fixtureIdentity(expectedProjectionDelta);
  const materializerResultIdentity = fixtureIdentity({
    written: materialized.result.written,
    removed: materialized.result.removed,
    finalInventory: materialized.inventory,
    observedDelta: materialized.observedDelta,
  });
  const protectedPrestate = protectedFilesystemRowsFixture(root);
  const protectedPrestateIdentity = fixtureIdentity(protectedPrestate);
  const dirtIdentity = fixtureIdentity(dirt);
  const verification = preMaterializationVerificationFixture({
    focusedCommands,
    parityCommand,
    expectedProjectionDelta,
  });
  const packetIdentity = fixtureIdentity({
    version: 1,
    lane,
    laneIdentity,
    terminal: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    head: currentHead,
    srcTree: currentSrcTree,
    baselineHead,
    baselineSrcTree,
    continuity: continuityIdentity,
    policyAcceptance: policyAcceptanceIdentity,
    authority: authorityIdentity,
    declaration: acceptedDeclarationIdentity,
    t008Changed: acceptedChangedIdentity,
    source: completeSourceIdentity,
    changed: completeChangedIdentity,
    contributorPartition: contributorPartitionIdentity,
    dirt: dirtIdentity,
    mapping: mappingIdentity,
    generatedPrestate: generatedPrestateIdentity,
    expectedProjection: expectedProjectionIdentity,
    expectedProjectionDelta: expectedProjectionDeltaIdentity,
    materializerResult: materializerResultIdentity,
    protectedPrestate: protectedPrestateIdentity,
    verification: verification.identity,
  });
  return {
    acceptedChangedIdentity,
    acceptedDeclarationIdentity,
    authorityIdentity,
    baselineHead,
    baselineSrcTree,
    changeKinds,
    changedPaths: currentDelta.changedPaths,
    changedRows: currentDelta.changedRows,
    completeChangedIdentity,
    completeSourceIdentity,
    completeSourceRows,
    contributorGeneratedPaths,
    contributorPartition,
    contributorPartitionIdentity,
    continuityIdentity,
    currentHead,
    currentSrcTree,
    currentT009SourceIdentity,
    dirt,
    dirtIdentity,
    expectedProjection: expectedCompleteProjection,
    expectedProjectionDelta,
    expectedProjectionDeltaIdentity,
    expectedProjectionIdentity,
    expectedProjectionPaths: expectedCompleteProjection.map(({ path: candidate }) => candidate),
    failures,
    focusedCommands,
    generatedPrestateIdentity,
    materializedObservedDelta: materialized.observedDelta,
    materializedPaths: materialized.inventory.map(({ path: candidate }) => candidate),
    materializerRemoved: materialized.result.removed,
    materializerResultIdentity,
    materializerWritten: materialized.result.written,
    mappingIdentity,
    lane,
    laneIdentity,
    noOutputPaths: noOutputMapping.map(({ sourcePath }) => sourcePath),
    packetIdentity,
    parityCommand,
    protectedPrestate,
    protectedPrestateIdentity,
    policyAcceptanceIdentity,
    t009GeneratedPaths,
  };
}

/**
 * @param {string} root
 * @param {{tester:unknown,reviewer:unknown,interrupted?:boolean}} approvals
 * @param {ReturnType<typeof deriveTransientPacketFixture>} initialFacts
 */
function inspectTransientPacketFixture(root, approvals, initialFacts) {
  const failures = [...initialFacts.failures];
  if (!acceptsPacketApprovalFixture(approvals.tester, 'Tester', initialFacts)) {
    failures.push('tester-approval-binding');
  }
  if (!acceptsPacketApprovalFixture(approvals.reviewer, 'Reviewer', initialFacts)) {
    failures.push('reviewer-approval-binding');
  }
  if (approvals.interrupted === true) failures.push('packet-interrupted');
  const recheck = deriveTransientPacketFixture(root);
  failures.push(...recheck.failures.map((failure) => `recheck:${failure}`));
  if (recheck.packetIdentity !== initialFacts.packetIdentity) failures.push('packet-drift');
  return {
    accepted: failures.length === 0,
    facts: initialFacts,
    failures,
    recheck,
  };
}

/**
 * @param {string} sourceRoot
 * @param {(root:string) => void} mutate
 * @param {{commit?:boolean,message?:string,approval?:(approval:Record<string,any>) => void}} [options]
 */
function inspectTransientMutationFixture(sourceRoot, mutate, options = {}) {
  const clone = cloneFixtureRepository(sourceRoot);
  try {
    mutate(clone.root);
    if (options.commit !== false) commitFixture(clone.root, options.message ?? 'transient packet fixture mutation');
    const facts = deriveTransientPacketFixture(clone.root);
    const tester = packetApprovalRecordFixture(facts, 'Tester');
    const reviewer = packetApprovalRecordFixture(facts, 'Reviewer');
    options.approval?.(reviewer);
    return inspectTransientPacketFixture(clone.root, { tester, reviewer }, facts);
  } finally {
    fs.rmSync(clone.parent, { recursive: true, force: true });
  }
}

/**
 * @param {string} sourceRoot
 * @param {(root:string) => void} mutate
 * @param {{commit?:boolean,interrupted?:boolean,message?:string}} [options]
 */
function inspectPostApprovalMutationFixture(sourceRoot, mutate, options = {}) {
  const clone = cloneFixtureRepository(sourceRoot);
  try {
    const facts = deriveTransientPacketFixture(clone.root);
    const approvals = {
      tester: independentlyReacquirePacketApprovalFixture(clone.root, 'Tester'),
      reviewer: independentlyReacquirePacketApprovalFixture(clone.root, 'Reviewer'),
      interrupted: options.interrupted,
    };
    mutate(clone.root);
    if (options.commit !== false) commitFixture(clone.root, options.message ?? 'post-approval drift');
    return inspectTransientPacketFixture(clone.root, approvals, facts);
  } finally {
    fs.rmSync(clone.parent, { recursive: true, force: true });
  }
}

const T007_POST_MATERIALIZATION_GATES = Object.freeze([
  'recursively-discovered-full-suite',
  'exact-parity',
  'dude-lint',
  'compose-verify',
  'pristine-release-build-and-lint',
  'intended-scope',
  'whitespace',
  'all-terminal-gates',
  'final-independent-review',
]);

/** @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function postMaterializationVerificationFixture(facts) {
  return T007_POST_MATERIALIZATION_GATES.map((gate) => ({
    gate,
    head: facts.currentHead,
    projection: facts.expectedProjectionIdentity,
    status: 'PASS',
  }));
}

/** @param {ReturnType<typeof deriveTransientPacketFixture>} facts */
function oneTimeFinalEvidenceFixture(facts) {
  const verification = postMaterializationVerificationFixture(facts);
  const verificationIdentity = fixtureIdentity(verification);
  const record = [
    'APPROVE',
    `terminal=${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
    `head=${facts.currentHead}`,
    `declared=${facts.acceptedDeclarationIdentity}`,
    `source=${facts.completeSourceIdentity}`,
    `changed=${facts.completeChangedIdentity}`,
    `partition=${facts.contributorPartitionIdentity}`,
    `projection=${facts.expectedProjectionIdentity}`,
    `verification=${verificationIdentity}`,
    `ownership=${facts.authorityIdentity}`,
    'scope=t009-eight/contributor-five/no-output-five',
  ].join(' ');
  const reviewEnvelope = {
    version: 1,
    terminal: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    head: facts.currentHead,
    declared: facts.acceptedDeclarationIdentity,
    source: facts.completeSourceIdentity,
    changed: facts.completeChangedIdentity,
    verdict: 'APPROVE',
    record,
  };
  const review = fixtureIdentity(reviewEnvelope);
  const line = [
    '- <UTC> - core-dogfood-accepted v1',
    `terminal=${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
    `head=${facts.currentHead}`,
    `declared=${facts.acceptedDeclarationIdentity}`,
    `source=${facts.completeSourceIdentity}`,
    `changed=${facts.completeChangedIdentity}`,
    `review=${review}`,
  ].join(' ');
  return { line, record, review, reviewEnvelope, verification, verificationIdentity };
}

/**
 * @param {ReturnType<typeof deriveTransientPacketFixture>} facts
 * @param {ReturnType<typeof oneTimeFinalEvidenceFixture>} evidence
 */
function acceptsOneTimeFinalEvidenceFixture(facts, evidence) {
  const expected = oneTimeFinalEvidenceFixture(facts);
  if (JSON.stringify(evidence) !== JSON.stringify(expected)) return false;
  if (facts.changedRows.length !== 20
    || facts.contributorPartition[0].rows.length !== 9
    || facts.contributorPartition[1].rows.length !== 1
    || facts.t009GeneratedPaths.length !== 8
    || facts.contributorGeneratedPaths.length !== 5
    || facts.noOutputPaths.length !== 5) return false;
  if (new Set(facts.changedPaths).size !== 20
    || facts.t009GeneratedPaths.some((candidate) => facts.contributorGeneratedPaths.includes(candidate))) {
    return false;
  }
  if (!sameFixtureStringList(
    evidence.verification.map(({ gate }) => gate),
    T007_POST_MATERIALIZATION_GATES,
  ) || evidence.verification.some(({ status, head, projection }) => (
    status !== 'PASS' || head !== facts.currentHead || projection !== facts.expectedProjectionIdentity
  ))) return false;
  return evidence.line.startsWith('- <UTC> - core-dogfood-accepted v1 ')
    && Buffer.byteLength(evidence.line, 'utf8') < 512;
}

/** @param {string} source @param {string} line */
function appendOwnerLogLineFixture(source, line) {
  return `${source.trimEnd()}\n${line}\n`;
}

/**
 * @param {string} root
 * @param {ReturnType<typeof deriveTransientPacketFixture>} facts
 * @param {ReturnType<typeof oneTimeFinalEvidenceFixture>} evidence
 * @param {string} ownerBeforeAppend
 * @param {string} acceptedLine
 */
function inspectOneTimeFinalCloseFixture(root, facts, evidence, ownerBeforeAppend, acceptedLine) {
  const failures = [];
  const currentHead = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const currentSrcTree = git(root, ['rev-parse', '--verify', 'HEAD:src']).trim();
  if (currentHead !== facts.currentHead) failures.push('close-head-drift');
  if (currentSrcTree !== facts.currentSrcTree) failures.push('close-src-tree-drift');

  const sourceLayers = coreDogfoodBaselineLayers(root);
  for (const layer of [
    'sourceIndex',
    'sourceWorktree',
    'sourceUntracked',
    'sourceIgnored',
    'sourceHiddenFlags',
  ]) {
    if (sourceLayers[layer].length > 0) failures.push(`close-${layer}`);
  }

  const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
  const parsed = parseTasks(fs.readFileSync(path.join(root, tasksPath), 'utf8'), { path: tasksPath });
  const terminal = parsed.tasks.filter((task) => task.id === T007_TRANSIENT_IDENTITIES.adopterTerminal);
  const declaration = terminal.length === 1
    ? taskPathClauseFixture(terminal[0].description, 'declared-src')
    : [];
  if (parsed.warnings.length > 0 || terminal.length !== 1) failures.push('close-terminal-authority');
  if (declaration.length !== 10
    || new Set(declaration).size !== 10
    || !sameFixtureStringList(declaration, sortFixturePaths(declaration))
    || fixtureIdentity(declaration) !== facts.acceptedDeclarationIdentity) {
    failures.push('close-declared-10');
  }

  const delta = deriveGitDeltaFixture(root, facts.baselineHead, currentHead);
  const sourceRows = canonicalGitRowsFixture(delta.current, root);
  if (delta.changedRows.length !== 20
    || new Set(delta.changedPaths).size !== 20
    || fixtureIdentity(delta.changedRows) !== facts.completeChangedIdentity) {
    failures.push('close-changed-20');
  }
  if (fixtureIdentity(sourceRows) !== facts.completeSourceIdentity) failures.push('close-source-drift');
  const contributorPartition = [
    { authority: 'Feature 003', paths: T007_FEATURE_003_PATHS },
    { authority: 'Feature 006', paths: T007_FEATURE_006_PATHS },
  ].map(({ authority, paths }) => ({
    authority,
    paths: sortFixturePaths(paths),
    rows: canonicalPathRowsFixture(delta.current, root, sortFixturePaths(paths)),
  }));
  if (contributorPartition[0].rows.length !== 9
    || contributorPartition[1].rows.length !== 1
    || fixtureIdentity(contributorPartition) !== facts.contributorPartitionIdentity) {
    failures.push('close-partition-9-1');
  }

  const generated = filesystemCoreProjectionFixture(root);
  if (JSON.stringify(generated) !== JSON.stringify(facts.expectedProjection)) {
    failures.push('close-generated-drift');
  }
  if (!acceptsOneTimeFinalEvidenceFixture(facts, evidence)) failures.push('close-review-or-verification-drift');

  const ownerPath = path.join(root, T007_TRANSIENT_IDENTITIES.adopterOwner);
  const ownerAfterAppend = fs.readFileSync(ownerPath, 'utf8');
  if (ownerAfterAppend !== appendOwnerLogLineFixture(ownerBeforeAppend, acceptedLine)) {
    failures.push('close-owner-append-drift');
  }
  const acceptedLines = coordinatorLogLinesFixture(ownerAfterAppend)
    .filter((line) => line.includes('core-dogfood-accepted v1'));
  const latestAccepted = acceptedLines.at(-1) ?? '';
  if (latestAccepted !== acceptedLine) failures.push('close-latest-accepted-mismatch');
  const latestTokens = ownerEventTokensFixture(latestAccepted);
  const expectedTokens = {
    terminal: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    head: facts.currentHead,
    declared: facts.acceptedDeclarationIdentity,
    source: facts.completeSourceIdentity,
    changed: facts.completeChangedIdentity,
    review: evidence.review,
  };
  if (JSON.stringify(latestTokens) !== JSON.stringify(expectedTokens)) {
    failures.push('close-latest-accepted-mismatch');
  }

  const protectedAfter = protectedFilesystemRowsFixture(root);
  const protectedBeforeByPath = new Map(facts.protectedPrestate.map((row) => [row.path, row]));
  const protectedAfterByPath = new Map(protectedAfter.map((row) => [row.path, row]));
  const protectedPaths = sortFixturePaths(new Set([
    ...protectedBeforeByPath.keys(),
    ...protectedAfterByPath.keys(),
  ]));
  for (const candidate of protectedPaths) {
    if (candidate === T007_TRANSIENT_IDENTITIES.adopterOwner) continue;
    if (JSON.stringify(protectedBeforeByPath.get(candidate))
      !== JSON.stringify(protectedAfterByPath.get(candidate))) {
      failures.push(`close-protected-drift:${candidate}`);
    }
  }

  const definitionPaths = [
    'spec.md',
    'plan.md',
    'research.md',
    'data-model.md',
    'contracts/schemas.md',
    'quickstart.md',
    'checklists/test.md',
    'checklists/security.md',
    'tasks.md',
  ].map((relative) => T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/spec\.md$/, relative));
  const definitionContractIdentity = fixtureIdentity(definitionPaths.map((relative) => ({
    path: relative,
    content: fs.readFileSync(path.join(root, relative), 'base64'),
  })));
  const baselineLine = coordinatorLogLinesFixture(ownerAfterAppend)
    .find((line) => line.includes('core-dogfood-baseline v1')
      && line.includes(`head=${facts.baselineHead}`)) ?? '';
  const coreEvidence = {
    version: 1,
    mode: 'core-close',
    featureSpecPath: T007_TRANSIENT_IDENTITIES.adopterSpec,
    definitionContractIdentity,
    terminalTaskKey: T007_TRANSIENT_IDENTITIES.adopterTerminal,
    baselineEvidenceLineHash: recoverySha256(baselineLine),
    acceptedEvidenceLineHash: recoverySha256(acceptedLine),
    head: facts.currentHead,
    declared: facts.acceptedDeclarationIdentity,
    source: facts.completeSourceIdentity,
    changed: facts.completeChangedIdentity,
    verificationSetIdentity: evidence.verificationIdentity,
    finalReviewEnvelopeIdentity: recoverySha256(recoveryCanonicalJson(evidence.reviewEnvelope)),
    review: evidence.review,
  };
  const acceptedFeatureEvidence = {
    ...coreEvidence,
    acceptedFeatureEvidenceIdentity: recoverySha256(recoveryCanonicalJson(coreEvidence)),
  };
  try {
    validateAcceptedFeatureEvidenceV1(acceptedFeatureEvidence);
  } catch {
    failures.push('close-accepted-feature-evidence');
  }
  return {
    acceptedFeatureEvidence,
    authorized: failures.length === 0,
    failures,
    latestAccepted,
  };
}

/** @param {string} sourceRoot @param {string|null} [olderAcceptedLine] */
function prepareOneTimeFinalCloseFixture(sourceRoot, olderAcceptedLine = null) {
  const clone = cloneFixtureRepository(sourceRoot);
  const facts = deriveTransientPacketFixture(clone.root);
  assert.deepEqual(facts.failures, [], 'final-close preparation packet');
  const protectedBefore = protectedFilesystemRowsFixture(clone.root);
  const materialized = buildDev({ repoRoot: clone.root });
  assert.deepEqual(materialized.written, facts.materializerWritten);
  assert.deepEqual(materialized.removed, facts.materializerRemoved);
  assert.deepEqual(protectedFilesystemRowsFixture(clone.root), protectedBefore);
  const evidence = oneTimeFinalEvidenceFixture(facts);
  const acceptedLine = evidence.line.replace('<UTC>', '2026-07-26T23:59:00Z');
  const ownerPath = path.join(clone.root, T007_TRANSIENT_IDENTITIES.adopterOwner);
  let ownerBeforeAppend = fs.readFileSync(ownerPath, 'utf8');
  if (olderAcceptedLine) {
    ownerBeforeAppend = appendOwnerLogLineFixture(ownerBeforeAppend, olderAcceptedLine);
    fs.writeFileSync(ownerPath, ownerBeforeAppend);
  }
  fs.writeFileSync(ownerPath, appendOwnerLogLineFixture(ownerBeforeAppend, acceptedLine));
  return {
    ...clone,
    acceptedLine,
    evidence,
    facts,
    ownerBeforeAppend,
  };
}

/** @param {string} source */
function transientPacketPolicyFailures(source) {
  const contract = visibleMarkdown(source);
  return missingParagraphRequirements(contract, [
    ['exact event is current-main without isolation after accepted T006 and T007', [[
      /`T009@696e6369`/,
      /current main checkout/i,
      /(?:without|no) isolation/i,
      /`T006@62726964`/,
      /`T007@9a4e7c12`/,
      /focused evidence/i,
      /independent acceptance/i,
    ]]],
    ['T008 supplies only declaration and changed identity that exist', [[
      /T008/i,
      /declaration/i,
      /changed identity/i,
      /actually exist|recorded/i,
      /(?:does not|must not|never)[\s\S]{0,80}(?:require|reconstruct|claim)/i,
      /historical/i,
      /accepted `HEAD`|accepted HEAD/i,
      /complete source identity/i,
      /dual-review/i,
    ]]],
    ['Feature 003 and Feature 006 facts are current attribution only', [[
      /\.dude\/specs\/003-guarded-directory-artifact-import\/spec\.md/,
      /\.dude\/specs\/006-simplify-context-footprint-audit\/spec\.md/,
      /exact `spec_path`|exact spec/i,
      /zero diagnostics/i,
      /current task attribution/i,
      /attribution context only/i,
      /historical[\s\S]{0,80}(?:does not|do not|must not|never)[\s\S]{0,80}(?:authoriz|prerequisite)/i,
    ]]],
    ['packet freshly binds complete current 20-row source delta and 10 9 1 partition', [[
      /fresh/i,
      /current `HEAD`/i,
      /source tree/i,
      /exactly 20|20-path/i,
      /path/i,
      /type/i,
      /mode/i,
      /object|content identity/i,
      /bytes/i,
      /exactly ten|ten T009/i,
      /nine/i,
      /one Feature 006/i,
      /disjoint/i,
      /gap/i,
      /overlap/i,
      /duplicate/i,
      /block/i,
    ]]],
    ['all source and generated dirt layers and protected prestate are bound', [[
      /source/i,
      /base-owned generated/i,
      /index/i,
      /worktree/i,
      /untracked/i,
      /ignored/i,
      /hidden-index/i,
      /command failure/i,
      /protected-boundary prestate/i,
      /path/i,
      /type/i,
      /mode/i,
      /bytes/i,
    ]]],
    ['live mapping derives complete projection cleanup and five five contributor results', [[
      /existing deterministic/i,
      /mapping/i,
      /live/i,
      /complete generated inventory/i,
      /stale-output cleanup/i,
      /type/i,
      /mode/i,
      /content identity/i,
      /bytes/i,
      /exactly five[\s\S]{0,32}generated destinations/i,
      /five explicit no-output/i,
      /(?:do not|must not|never)[\s\S]{0,48}freeze/i,
    ]]],
    ['pre-materialization checks pass and exact isolated parity delta is the sole failure', [[
      /focused source/i,
      /policy/i,
      /runtime/i,
      /do not depend on current generated parity|parity-independent/i,
      /checked-in dev core is a byte-identical non-mutating projection of authoritative source/,
      /anchored exact-name filter/i,
      /exactly that one/i,
      /zero other failed/i,
      /cancelled/i,
      /path/i,
      /type/i,
      /mode/i,
      /byte/i,
      /observed[\s\S]{0,48}expected projection delta/i,
      /any other|unrelated/i,
      /block/i,
    ]]],
    ['Tester and Reviewer independently reacquire complete packet facts', [[
      /Tester/i,
      /Reviewer/i,
      /each/i,
      /independently reacquire|independently verify/i,
      /Git/i,
      /byte/i,
      /mapping/i,
      /ownership/i,
      /command result/i,
      /substantive/i,
      /generic/i,
      /echo/i,
      /block/i,
    ]]],
    ['approvals authorize one immediate materialization only after unchanged recheck', [[
      /immediate unchanged recheck/i,
      /one immediate/i,
      /materializer invocation|materialization/i,
      /materialization only/i,
      /without historical/i,
      /interruption/i,
      /invalidat/i,
      /complete fresh reacquisition/i,
      /both new approvals|new Tester and Reviewer/i,
    ]]],
    ['packet is transient and transfers no ownership or acceptance', [[
      /transient/i,
      /(?:does not|do not|must not|never)[\s\S]{0,80}(?:persist|write)/i,
      /packet/i,
      /approval body/i,
      /inventory/i,
      /snapshot/i,
      /ledger/i,
      /schema/i,
      /helper/i,
      /report/i,
      /(?:does not|do not|must not|never)[\s\S]{0,80}(?:transfer ownership|expand[^\n]*declaration|re-accept|close Features? 003)/i,
    ]]],
    ['ordinary future exact baseline gates are not weakened', [[
      /ordinary future|every later feature/i,
      /exact[\s\S]{0,32}(?:recorded )?baseline `HEAD`/i,
      /`HEAD:src`/,
      /every existing lifecycle gate/i,
      /(?:never|must not|does not)[\s\S]{0,48}(?:substitute|weaken|generaliz)/i,
    ]]],
  ]);
}

test('T007 Core Dogfood project route adds the bounded transient prerequisite, ownership, and sequence', () => {
  // Arrange
  const section = markdownSection(read(PROJECT_SKILL), '## Core Dogfood Close');
  const paragraphs = section.split(/\n\s*\n/);
  const sequence = [
    'T006@62726964',
    'T007@9a4e7c12',
    'T009@696e6369',
    'T002@5b7d930e',
    'T003@c4e6812d',
  ];

  // Act
  const failures = missingParagraphRequirements(section, [
    ['transient evidence begins after current focused and independent T006 and T007 acceptance', [[
      /transient/i,
      /`T006@62726964`/,
      /`T007@9a4e7c12`/,
      /focused/i,
      /independent(?:ly)? accept/i,
      /current/i,
    ]]],
    ['only the current Feature 009 T009 event consumes the transient route', [[
      /only|exclusive/i,
      /current/i,
      /Feature 009/i,
      /`T009@696e6369`/,
      /event|materialization/i,
    ]]],
    ['concise route names exact 10 9 1 coverage and five generated five no-output results', [[
      /10\/9\/1|ten[\s\S]{0,20}nine[\s\S]{0,20}one/i,
      /five generated/i,
      /five[\s\S]{0,20}no-output/i,
    ]]],
    ['contributors retain ownership and T009 claims only its work', [[
      /contributor/i,
      /ownership/i,
      /T009/i,
      /only its own work|limited to its own work/i,
    ]]],
    ['normal future exact baseline and lifecycle gates remain strict', [[
      /normal future|every later feature/i,
      /exact[\s\S]{0,32}(?:baseline )?`HEAD`/i,
      /`HEAD:src`/,
      /every existing lifecycle gate/i,
      /(?:never|must not|does not)[\s\S]{0,48}(?:weaken|generaliz|substitute)/i,
    ]]],
  ]);
  const sequenceParagraphs = paragraphs.filter((paragraph) => (
    sequence.every((taskKey) => paragraph.includes(`\`${taskKey}\``))
  ));
  if (sequenceParagraphs.length !== 1) {
    failures.push('one concise paragraph contains T006 -> T007 -> T009 -> T002 -> T003');
  } else {
    const indexes = sequence.map((taskKey) => sequenceParagraphs[0].indexOf(taskKey));
    if (!indexes.every((index, position) => position === 0 || index > indexes[position - 1])) {
      failures.push('exact T006 -> T007 -> T009 -> T002 -> T003 order');
    }
  }
  for (const [label, pattern] of [
    ['contributor owner paths', /guarded-directory-artifact-import|simplify-context-footprint-audit/i],
    ['contributor task chains', /T003@3c7f5a92|T005@4f8a2c71|T009@c4a2f865/i],
    ['mapping mechanics', /srcToDeploy|isReleaseFile|build-release\.mjs/i],
    ['continuity commit clue', /a540f459/i],
  ]) {
    if (pattern.test(section)) failures.push(`concise project route duplicates ${label}`);
  }

  // Assert
  assert.deepEqual(failures, [], `${PROJECT_SKILL}: concise T007 transient route`);
});

test('T007 Core Dogfood transient packet names exact authorities coverage projection and strict failure gates', () => {
  // Arrange
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const packet = markdownSection(localSkill, '### Current T007 Transient Fresh Packet');

  // Act
  const failures = transientPacketPolicyFailures(packet);
  const literalOids = packet.match(/\b[0-9a-f]{40}\b/gi) ?? [];
  if (literalOids.length > 0) failures.push('no frozen 40-character commit or content identity');

  // Assert
  assert.deepEqual(failures, [], `${CORE_DOGFOOD_LOCAL_SKILL}: detailed T007 transient packet`);
});

test('T007 Core Dogfood valid live 20-path event passes every transient packet gate', () => {
  // Arrange
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const initialFacts = deriveTransientPacketFixture(fixture.root);
    const tester = independentlyReacquirePacketApprovalFixture(fixture.root, 'Tester');
    const reviewer = independentlyReacquirePacketApprovalFixture(fixture.root, 'Reviewer');

    // Act
    const inspection = inspectTransientPacketFixture(
      fixture.root,
      { tester, reviewer },
      initialFacts,
    );

    // Assert
    assert.deepEqual(initialFacts.failures, [], 'valid event derives without a failed gate');
    assert.deepEqual(inspection.failures, [], 'valid event passes complete transient packet gates');
    assert.equal(inspection.accepted, true, 'valid event is accepted');
    assert.deepEqual(inspection.facts.changeKinds, {
      addition: true,
      content: true,
      deletion: false,
      mode: false,
      rename: false,
      type: false,
    }, 'independent Git trees retain the actual current additions and content changes');

    const ordinary = firstAdopterPolicyPacketFixture();
    assert.equal(acceptsFirstAdopterPolicyPacketFixture(ordinary), true, 'ordinary exact equality still passes');
    ordinary.declaration.changedAgainstOriginalPaths.push('src/contributor.mjs');
    ordinary.declaration.knownSourceFiles.push('src/contributor.mjs');
    assert.equal(
      acceptsFirstAdopterPolicyPacketFixture(ordinary),
      false,
      'the old declaration equality still rejects an ordinary or later packet',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood consumes the recorded T008 claim and close shapes without manufactured fields', () => {
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const ownerText = fs.readFileSync(
      path.join(fixture.root, T007_TRANSIENT_IDENTITIES.adopterOwner),
      'utf8',
    );
    const taskKey = T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask;
    assert.match(
      ownerText,
      new RegExp(
        `claimed ${taskKey}[^\n]*declaration identity [0-9a-f]{64}`
        + ' and changed-source identity [0-9a-f]{64}',
      ),
      'T008 identities come from its recorded claim',
    );
    assert.match(
      ownerText,
      new RegExp(`closed ${taskKey}[^\n]*independent source acceptance[^\n]*same frozen identity`),
      'T008 close binds approval to the previously claimed frozen identity',
    );
    assert.doesNotMatch(
      ownerText,
      new RegExp(`closed ${taskKey}[^\n]*terminal=`),
      'T008 close must not manufacture a terminal field',
    );
    assert.doesNotMatch(
      ownerText,
      new RegExp(`closed ${taskKey}[^\n]*(?:declared|changed)=`),
      'T008 close must not manufacture canonical identity fields',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood requires exact main checkout baseline continuity and terminal readiness', () => {
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const valid = deriveTransientPacketFixture(fixture.root);
    assert.deepEqual(valid.failures, [], 'live in-progress terminal without a blocker is accepted');

    const historical = cloneFixtureRepository(fixture.root);
    try {
      const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
      rewriteTextFixture(historical.root, tasksPath, (source) => source
        .replace(
          `- [~] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
          `- [!] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
        )
        .replace(
          `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}`,
          `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}\n    blocked-by: ${T007_ADOPTER_BLOCKER}`,
        ));
      rewriteTextFixture(historical.root, '.dude/state/task-state.json', (source) => {
        const snapshot = JSON.parse(source);
        snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = '!';
        return `${JSON.stringify(snapshot, null, 2)}\n`;
      });
      const blocked = deriveTransientPacketFixture(historical.root);
      assert.deepEqual(blocked.failures, [], 'blocked terminal with the exact T007 blocker is accepted');
    } finally {
      fs.rmSync(historical.parent, { recursive: true, force: true });
    }

    const cases = [
      ['wrong branch', (root) => {
        git(root, ['branch', '-m', 'feature/transient']);
      }, 'checkout-main'],
      ['linked isolation', (root) => {
        fs.renameSync(path.join(root, '.git'), path.join(root, '.git-linked'));
        writeFixture(root, '.git', 'gitdir: .git-linked\n');
      }, 'checkout-isolation'],
      ['baseline source tree is not a tree', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          /src_tree=[0-9a-f]{40}/,
          `src_tree=${fixture.baselineHead}`,
        ));
      }, 'baseline-src-tree-object'],
      ['baseline source tree mismatches baseline head', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          /src_tree=[0-9a-f]{40}/,
          `src_tree=${git(root, ['rev-parse', `${fixture.currentHead}:src`]).trim()}`,
        ));
      }, 'baseline-src-tree-equality'],
      ['duplicate original baseline', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          /^## Coordinator Log$/m,
          `## Coordinator Log\n\n- 2026-07-22 UTC - core-dogfood-baseline v1 terminal=${T007_TRANSIENT_IDENTITIES.adopterTerminal} head=${fixture.baselineHead} src_tree=${git(root, ['rev-parse', `${fixture.baselineHead}:src`]).trim()}`,
        ));
      }, 'baseline-duplicate'],
      ['void original baseline', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => `${source}\n- 2026-07-26 UTC - VOID: original baseline head=${fixture.baselineHead} authorizes nothing\n`);
      }, 'baseline-void'],
      ['replacement baseline', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => `${source}\n- 2026-07-26 UTC - replacement core-dogfood-baseline v1 terminal=${T007_TRANSIENT_IDENTITIES.adopterTerminal} head=${fixture.currentHead} src_tree=${git(root, ['rev-parse', `${fixture.currentHead}:src`]).trim()}\n`);
      }, 'baseline-replacement'],
      ['post-source baseline', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          /core-dogfood-baseline v1 terminal=/,
          'post-source core-dogfood-baseline v1 terminal=',
        ));
      }, 'baseline-post-source'],
      ['missing continuity commit', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source
          .split('\n')
          .map((line) => line.includes('user explicitly authorized')
            ? line.replace(fixture.continuityChain[1], '')
            : line)
          .join('\n'));
      }, 'continuity-chain'],
      ['reordered continuity commits', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          `${fixture.continuityChain[0]}, ${fixture.continuityChain[1]}`,
          `${fixture.continuityChain[1]}, ${fixture.continuityChain[0]}`,
        ));
      }, 'continuity-chain'],
      ['continuity stops before current head', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
          `to current HEAD ${fixture.currentHead}`,
          `to current HEAD ${fixture.continuityChain.at(-2)}`,
        ));
      }, 'continuity-head'],
      ['T007 acceptance binds wrong head', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.policyOwner, (source) => source
          .split('\n')
          .map((line) => line.includes(`closed ${T007_TRANSIENT_IDENTITIES.transientPacketTask}`)
            ? line.replace(`head=${fixture.currentHead}`, `head=${fixture.continuityChain.at(-2)}`)
            : line)
          .join('\n'));
      }, `policy-acceptance:${T007_TRANSIENT_IDENTITIES.transientPacketTask}`],
      ['T007 acceptance binds wrong policy bytes', (root) => {
        rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.policyOwner, (source) => source
          .split('\n')
          .map((line) => line.includes(`closed ${T007_TRANSIENT_IDENTITIES.transientPacketTask}`)
            ? line.replace(/policy=[0-9a-f]{64}/, `policy=${fixtureIdentity('wrong policy bytes')}`)
            : line)
          .join('\n'));
      }, `policy-acceptance:${T007_TRANSIENT_IDENTITIES.transientPacketTask}`],
      ['missing Lightweight snapshot', (root) => {
        removeFixturePath(root, '.dude/state/task-state.json');
      }, 'lane-task-state'],
      ['T007 snapshot disagrees with canonical task', (root) => {
        rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
          const snapshot = JSON.parse(source);
          const tasksPath = T007_TRANSIENT_IDENTITIES.policySpec.replace(/\/spec\.md$/, '/tasks.md');
          snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.transientPacketTask] = '~';
          return `${JSON.stringify(snapshot, null, 2)}\n`;
        });
      }, `lane-snapshot:${T007_TRANSIENT_IDENTITIES.transientPacketTask}`],
      ['T009 snapshot disagrees with canonical task', (root) => {
        rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
          const snapshot = JSON.parse(source);
          const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
          snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = ' ';
          return `${JSON.stringify(snapshot, null, 2)}\n`;
        });
      }, `lane-snapshot:${T007_TRANSIENT_IDENTITIES.adopterTerminal}`],
      ['parallel terminal', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `] ${T007_TRANSIENT_IDENTITIES.adopterTerminal} [Shared]`,
          `] ${T007_TRANSIENT_IDENTITIES.adopterTerminal} [P] [Shared]`,
        ));
      }, 'terminal-parallel'],
      ['non-Shared terminal', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `] ${T007_TRANSIENT_IDENTITIES.adopterTerminal} [Shared]`,
          `] ${T007_TRANSIENT_IDENTITIES.adopterTerminal} [US9]`,
        ));
      }, 'terminal-shared'],
      ['incomplete adopter dependency', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `- [x] ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`,
          `- [ ] ${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`,
        ));
      }, `terminal-dependency:${T007_TRANSIENT_IDENTITIES.adopterAcceptanceTask}`],
      ['blocked terminal with unrelated blocker', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source
          .replace(
            `- [~] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
            `- [!] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
          )
          .replace(
            `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}`,
            `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}\n    blocked-by: external-dependency: unrelated service unavailable`,
          ));
        rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
          const snapshot = JSON.parse(source);
          snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = '!';
          return `${JSON.stringify(snapshot, null, 2)}\n`;
        });
      }, 'terminal-unrelated-blocker'],
      ['in-progress terminal with a blocker', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}`,
          `    deps: ${T007_ADOPTER_DEPENDENCIES.join(', ')}\n    blocked-by: ${T007_ADOPTER_BLOCKER}`,
        ));
      }, 'terminal-unrelated-blocker'],
      ['todo terminal', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `- [~] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
          `- [ ] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
        ));
        rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
          const snapshot = JSON.parse(source);
          snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = ' ';
          return `${JSON.stringify(snapshot, null, 2)}\n`;
        });
      }, 'terminal-unrelated-blocker'],
      ['done terminal', (root) => {
        const tasksPath = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
        rewriteTextFixture(root, tasksPath, (source) => source.replace(
          `- [~] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
          `- [x] ${T007_TRANSIENT_IDENTITIES.adopterTerminal}`,
        ));
        rewriteTextFixture(root, '.dude/state/task-state.json', (source) => {
          const snapshot = JSON.parse(source);
          snapshot[tasksPath].glyphs[T007_TRANSIENT_IDENTITIES.adopterTerminal] = 'x';
          return `${JSON.stringify(snapshot, null, 2)}\n`;
        });
      }, 'terminal-unrelated-blocker'],
    ];

    for (const [name, mutate, expectedFailure] of cases) {
      const clone = cloneFixtureRepository(fixture.root);
      try {
        mutate(clone.root);
        const actual = deriveTransientPacketFixture(clone.root);
        assert.ok(actual.failures.includes(expectedFailure), name);
      } finally {
        fs.rmSync(clone.parent, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood fresh Git delta is exactly 20 rows with a disjoint current 10 9 1 partition', () => {
  // Arrange
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const unclaimed = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, 'src/skills/dude-unclaimed/SKILL.md', 'unclaimed twenty-first path\n');
    }, { message: 'add unclaimed source path' });
    assert.ok(unclaimed.failures.includes('coverage-unclaimed-delta'));
    assert.ok(unclaimed.failures.includes('generated-extra-source-output'));

    const outside = inspectTransientMutationFixture(fixture.root, (root) => {
      materializeGitPathFixture(
        root,
        fixture.baselineHead,
        T007_FEATURE_006_PATHS[0],
        root,
      );
      writeFixture(root, 'src/skills/dude-stable/SKILL.md', 'replacement source delta\n');
    }, { message: 'move Feature 006 change outside its attributed path' });
    assert.ok(outside.failures.includes('coverage-claim-outside-delta'));
    assert.ok(outside.failures.includes('coverage-unclaimed-delta'));

    const overlap = inspectTransientMutationFixture(fixture.root, (root) => {
      const taskFile = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
      rewriteTextFixture(root, taskFile, (source) => source.replaceAll(
        fixture.t009Paths[0],
        T007_FEATURE_003_PATHS[0],
      ));
    }, { commit: false });
    assert.ok(overlap.failures.includes('coverage-overlap'));

    const duplicate = inspectTransientMutationFixture(fixture.root, (root) => {
      const taskFile = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
      rewriteTextFixture(root, taskFile, (source) => source.replaceAll(
        fixture.t009Paths[1],
        fixture.t009Paths[0],
      ));
    }, { commit: false });
    assert.ok(duplicate.failures.includes('coverage-duplicate-claim'));
    assert.ok(duplicate.failures.includes('coverage-unclaimed-delta'));

    // Assert the complete current packet comes from Git rows, not a caller summary.
    const base = deriveTransientPacketFixture(fixture.root);
    assert.equal(base.changedRows.length, 20);
    assert.equal(base.contributorPartition[0].rows.length, 9);
    assert.equal(base.contributorPartition[1].rows.length, 1);
    assert.deepEqual(base.changedPaths, sortFixturePaths([
      ...fixture.t009Paths,
      ...T007_FEATURE_003_PATHS,
      ...T007_FEATURE_006_PATHS,
    ]));
    assert.equal(base.changeKinds.deletion, false, 'the actual current event has no deletion');
    assert.equal(base.changeKinds.mode, false, 'the actual current event has no mode change');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood derives current authority and rejects generic approval interruption and drift', () => {
  // Arrange
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const wrongOwner = inspectTransientMutationFixture(fixture.root, (root) => {
      rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.contributor003Owner, (source) => source.replace(
        `spec_path: ${T007_TRANSIENT_IDENTITIES.contributor003Spec}`,
        'spec_path: .dude/specs/010-forged/spec.md',
      ));
    }, { message: 'forge contributor owner' });
    assert.ok(wrongOwner.failures.includes(`authority-resolver:${T007_TRANSIENT_IDENTITIES.contributor003Spec}`));

    const t008CurrentDrift = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, fixture.t009Paths[1], 'later T009 source revision\n');
    }, { message: 'later T009 source revision' });
    assert.ok(t008CurrentDrift.failures.includes('continuity-head'));

    const t008IdentityTamper = inspectTransientMutationFixture(fixture.root, (root) => {
      rewriteTextFixture(root, T007_TRANSIENT_IDENTITIES.adopterOwner, (source) => source.replace(
        /changed-source identity [0-9a-f]{64}/,
        `changed-source identity ${fixtureIdentity('forged T008 changed identity')}`,
      ));
    }, { commit: false });
    assert.ok(t008IdentityTamper.failures.includes('t008-changed-identity'));

    const declarationSubstitution = inspectTransientMutationFixture(fixture.root, (root) => {
      const taskFile = T007_TRANSIENT_IDENTITIES.adopterSpec.replace(/\/spec\.md$/, '/tasks.md');
      const replacement = 'src/skills/dude-stable/SKILL.md';
      rewriteTextFixture(root, taskFile, (source) => source.replaceAll(fixture.t009Paths[0], replacement));
    }, { commit: false });
    assert.ok(declarationSubstitution.failures.includes('t008-declaration-identity'));

    const forgedGeneratedSource = inspectTransientMutationFixture(fixture.root, (root) => {
      const packageRoot = path.dirname(path.join(root, T007_TRANSIENT_IDENTITIES.contributor003Spec));
      for (const entry of fs.readdirSync(packageRoot).filter((candidate) => candidate.endsWith('.md'))) {
        const relative = path.relative(root, path.join(packageRoot, entry)).replaceAll(path.sep, '/');
        const source = fs.readFileSync(path.join(packageRoot, entry), 'utf8');
        if (source.includes('directory-import.mjs')) {
          rewriteTextFixture(root, relative, (text) => text.replaceAll(
            'directory-import.mjs',
            'directory-install.mjs',
          ));
        }
      }
    }, { commit: false });
    assert.ok(forgedGeneratedSource.failures.includes(
      'authority-source-attribution:src/skills/dude-bundle-import/lib/directory-import.mjs',
    ));

    const forgedNoOutputSource = inspectTransientMutationFixture(fixture.root, (root) => {
      const packageRoot = path.dirname(path.join(root, T007_TRANSIENT_IDENTITIES.contributor003Spec));
      for (const entry of fs.readdirSync(packageRoot).filter((candidate) => candidate.endsWith('.md'))) {
        const relative = path.relative(root, path.join(packageRoot, entry)).replaceAll(path.sep, '/');
        const source = fs.readFileSync(path.join(packageRoot, entry), 'utf8');
        if (source.includes('directory-import.test.mjs')) {
          rewriteTextFixture(root, relative, (text) => text.replaceAll(
            'directory-import.test.mjs',
            'directory-install.test.mjs',
          ));
        }
      }
    }, { commit: false });
    assert.ok(forgedNoOutputSource.failures.includes(
      'authority-source-attribution:src/skills/dude-bundle-import/lib/directory-import.test.mjs',
    ));

    const baseFacts = deriveTransientPacketFixture(fixture.root);
    const tester = packetApprovalRecordFixture(baseFacts, 'Tester');
    const forgedReviewer = packetApprovalRecordFixture(baseFacts, 'Reviewer');
    forgedReviewer.source = fixtureIdentity('forged current source');
    const reviewInspection = inspectTransientPacketFixture(
      fixture.root,
      { tester, reviewer: forgedReviewer },
      baseFacts,
    );
    assert.ok(reviewInspection.failures.includes('reviewer-approval-binding'));

    const genericReviewer = { role: 'Reviewer', verdict: 'APPROVE' };
    const genericInspection = inspectTransientPacketFixture(
      fixture.root,
      { tester, reviewer: genericReviewer },
      baseFacts,
    );
    assert.ok(genericInspection.failures.includes('reviewer-approval-binding'));

    const echoedTester = { ...packetApprovalRecordFixture(baseFacts, 'Reviewer'), role: 'Tester' };
    const echoedInspection = inspectTransientPacketFixture(
      fixture.root,
      { tester: echoedTester, reviewer: packetApprovalRecordFixture(baseFacts, 'Reviewer') },
      baseFacts,
    );
    assert.ok(echoedInspection.failures.includes('tester-approval-binding'));

    const interrupted = inspectTransientPacketFixture(
      fixture.root,
      {
        tester: packetApprovalRecordFixture(baseFacts, 'Tester'),
        reviewer: packetApprovalRecordFixture(baseFacts, 'Reviewer'),
        interrupted: true,
      },
      baseFacts,
    );
    assert.ok(interrupted.failures.includes('packet-interrupted'));

    const sourceDrift = inspectPostApprovalMutationFixture(fixture.root, (root) => {
      writeFixture(root, fixture.t009Paths[1], 'post-approval source drift\n');
    }, { message: 'post-approval source drift' });
    assert.ok(sourceDrift.failures.includes('packet-drift'));

    const protectedDrift = inspectPostApprovalMutationFixture(fixture.root, (root) => {
      writeFixture(root, '.github/skills/project/SKILL.md', '# Changed after approvals\n');
    }, { commit: false });
    assert.ok(protectedDrift.failures.includes('packet-drift'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood rejects every live Git dirt and hidden-index layer', () => {
  // Arrange
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const sourcePath = fixture.t009Paths[1];
    const generatedPath = srcToDeploy(T007_FEATURE_003_PATHS.find((candidate) => (
      isReleaseFile(srcToDeploy(candidate))
    )));
    const indexDirt = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, sourcePath, 'staged source dirt\n');
      git(root, ['add', '--', sourcePath]);
    }, { commit: false });
    assert.ok(indexDirt.failures.includes('dirt:sourceIndex'));

    const worktreeDirt = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, sourcePath, 'unstaged source dirt\n');
    }, { commit: false });
    assert.ok(worktreeDirt.failures.includes('dirt:sourceWorktree'));

    const untrackedDirt = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, 'src/untracked.mjs', 'untracked source dirt\n');
    }, { commit: false });
    assert.ok(untrackedDirt.failures.includes('dirt:sourceUntracked'));

    const ignoredDirt = inspectTransientMutationFixture(fixture.root, (root) => {
      writeIgnoredFixture(root, 'src/ignored.mjs', 'ignored source dirt\n');
    }, { commit: false });
    assert.ok(ignoredDirt.failures.includes('dirt:sourceIgnored'));

    const assumeUnchanged = inspectTransientMutationFixture(fixture.root, (root) => {
      git(root, ['update-index', '--assume-unchanged', '--', sourcePath]);
    }, { commit: false });
    assert.ok(assumeUnchanged.failures.includes('dirt:sourceHiddenFlags'));

    const skipWorktree = inspectTransientMutationFixture(fixture.root, (root) => {
      git(root, ['update-index', '--skip-worktree', '--', sourcePath]);
    }, { commit: false });
    assert.ok(skipWorktree.failures.includes('dirt:sourceHiddenFlags'));

    const generatedIndex = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, generatedPath, 'staged generated dirt\n');
      git(root, ['add', '--', generatedPath]);
    }, { commit: false });
    assert.ok(generatedIndex.failures.includes('dirt:generatedIndex'));

    const generatedWorktree = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, generatedPath, 'unstaged generated dirt\n');
    }, { commit: false });
    assert.ok(generatedWorktree.failures.includes('dirt:generatedWorktree'));

    const generatedUntracked = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, '.github/skills/dude-untracked/SKILL.md', 'untracked generated dirt\n');
    }, { commit: false });
    assert.ok(generatedUntracked.failures.includes('dirt:generatedUntracked'));

    const generatedIgnored = inspectTransientMutationFixture(fixture.root, (root) => {
      writeIgnoredFixture(root, '.github/skills/dude-ignored/SKILL.md', 'ignored generated dirt\n');
    }, { commit: false });
    assert.ok(generatedIgnored.failures.includes('dirt:generatedIgnored'));

    for (const [name, flag, expectedTag] of [
      ['assume-unchanged', '--assume-unchanged', 'h'],
      ['skip-worktree', '--skip-worktree', 'S'],
    ]) {
      const generatedHidden = inspectTransientMutationFixture(fixture.root, (root) => {
        git(root, ['update-index', flag, '--', generatedPath]);
      }, { commit: false });
      assert.deepEqual(
        generatedHidden.facts.dirt.generatedHiddenFlags,
        [{ tag: expectedTag, path: generatedPath }],
        `generated ${name} remains visible`,
      );
      assert.ok(generatedHidden.failures.includes('dirt:generatedHiddenFlags'));
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood compares the complete temp-materializer projection and cleanup inventory', () => {
  // Arrange
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const validFacts = deriveTransientPacketFixture(fixture.root);
    const expectedPaths = new Set(validFacts.expectedProjectionPaths);
    for (const requiredPath of [validFacts.t009GeneratedPaths[1], validFacts.contributorGeneratedPaths[0]]) {
      assert.ok(expectedPaths.has(requiredPath), `complete projection includes ${requiredPath}`);
    }
    assert.equal(validFacts.t009GeneratedPaths.length, 8, 'T009 retains eight owned output effects');
    assert.equal(validFacts.contributorGeneratedPaths.length, 5, 'mapping derives five contributor outputs');
    assert.equal(validFacts.noOutputPaths.length, 5, 'mapping derives five explicit no-output results');
    assert.deepEqual(
      validFacts.t009GeneratedPaths.filter((candidate) => (
        validFacts.contributorGeneratedPaths.includes(candidate)
      )),
      [],
      'T009 and contributor output sets are disjoint',
    );
    assert.deepEqual(validFacts.materializedObservedDelta, validFacts.expectedProjectionDelta);
    assert.equal(validFacts.expectedProjectionDelta.length, 8, 'observed parity delta is exactly T009 scope');
    assert.ok(validFacts.expectedProjectionDelta.every(({ before, after }) => (
      before.type !== 'absent' && after.type !== 'absent'
    )), 'the actual current eight-path parity delta is eight in-place output updates');
    assert.ok(validFacts.protectedPrestate.length >= 4, 'protected prestate is complete and nonempty');
    assert.deepEqual(validFacts.materializedPaths, validFacts.expectedProjectionPaths);
    assert.equal(validFacts.materializerWritten.length, validFacts.expectedProjectionPaths.length);
    assert.deepEqual(validFacts.materializerWritten, validFacts.expectedProjectionPaths);
    assert.ok(validFacts.materializerRemoved.length > 20, 'complete cleanup removes every existing core root');
    assert.equal(new Set(validFacts.materializerRemoved).size, validFacts.materializerRemoved.length);
    assert.ok(validFacts.noOutputPaths.every(
      (candidate) => !expectedPaths.has(srcToDeploy(candidate)),
    ), 'complete projection excludes every explicit no-output source test');

    const staleTrackedClone = cloneFixtureRepository(fixture.root);
    try {
      writeFixture(staleTrackedClone.root, '.github/skills/dude-stale/SKILL.md', 'tracked stale output\n');
      git(staleTrackedClone.root, ['add', '--', '.github/skills/dude-stale/SKILL.md']);
      git(staleTrackedClone.root, ['commit', '--quiet', '-m', 'tracked stale output']);
      const expectedRemoved = filesystemCoreRemovalRootsFixture(staleTrackedClone.root);
      const result = buildDev({ repoRoot: staleTrackedClone.root });
      assert.deepEqual(result.removed, expectedRemoved, 'tracked stale cleanup report is complete');
      assert.equal(fs.existsSync(path.join(staleTrackedClone.root, '.github/skills/dude-stale')), false);
    } finally {
      fs.rmSync(staleTrackedClone.parent, { recursive: true, force: true });
    }

    const staleUntrackedClone = cloneFixtureRepository(fixture.root);
    try {
      writeFixture(staleUntrackedClone.root, '.github/skills/dude-stale/SKILL.md', 'untracked stale output\n');
      const expectedRemoved = filesystemCoreRemovalRootsFixture(staleUntrackedClone.root);
      const result = buildDev({ repoRoot: staleUntrackedClone.root });
      assert.deepEqual(result.removed, expectedRemoved, 'untracked stale cleanup report is complete');
      assert.equal(fs.existsSync(path.join(staleUntrackedClone.root, '.github/skills/dude-stale')), false);
    } finally {
      fs.rmSync(staleUntrackedClone.parent, { recursive: true, force: true });
    }

    const trackedRewrite = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, '.github/agents/dude-reviewer.agent.md', 'unauthorized tracked rewrite\n');
    }, { commit: false });
    assert.ok(trackedRewrite.failures.includes('generated-tracked-rewrite'));

    const staleRemoval = inspectTransientMutationFixture(fixture.root, (root) => {
      removeFixturePath(root, '.github/agents/dude-reviewer.agent.md');
    }, { commit: false });
    assert.ok(staleRemoval.failures.includes('generated-stale-removal'));

    const extraSourceOutput = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, 'src/skills/dude-extra/SKILL.md', 'unaccepted source output\n');
    }, { message: 'add unaccepted source output' });
    assert.ok(extraSourceOutput.failures.includes('generated-extra-source-output'));

    const noOutputViolation = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, srcToDeploy(T007_FEATURE_003_PATHS[2]), 'forbidden test output\n');
    }, { message: 'materialize explicit no-output test source' });
    assert.ok(noOutputViolation.failures.includes(`generated-no-output:${T007_FEATURE_003_PATHS[2]}`));

    const unauthorizedExtra = inspectTransientMutationFixture(fixture.root, (root) => {
      writeFixture(root, '.github/skills/dude-unauthorized/SKILL.md', 'unauthorized output\n');
    }, { message: 'add unauthorized generated output' });
    assert.ok(unauthorizedExtra.failures.includes('generated-unauthorized-extra-output'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood derives deletion mode symlink type-change and rename rows from Git objects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-transient-types-'));
  try {
    git(root, ['init', '--quiet', '--initial-branch=main']);
    git(root, ['config', 'user.name', 'Dude Test']);
    git(root, ['config', 'user.email', 'dude-test@example.invalid']);
    git(root, ['config', 'core.fileMode', 'true']);
    writeFixture(root, 'src/deleted.mjs', 'delete me\n');
    writeFixture(root, 'src/mode.mjs', 'mode\n');
    writeFixture(root, 'src/rename-from.mjs', 'rename bytes\n');
    writeFixture(root, 'src/type-change.mjs', 'regular bytes\n');
    const baselineHead = commitFixture(root, 'baseline source types');

    removeFixturePath(root, 'src/deleted.mjs');
    fs.chmodSync(path.join(root, 'src/mode.mjs'), 0o755);
    fs.renameSync(path.join(root, 'src/rename-from.mjs'), path.join(root, 'src/rename-to.mjs'));
    removeFixturePath(root, 'src/type-change.mjs');
    fs.symlinkSync('../target with spaces', path.join(root, 'src/type-change.mjs'));
    fs.symlinkSync('../new target', path.join(root, 'src/new-link.mjs'));
    const currentHead = commitFixture(root, 'current source types');

    const delta = deriveGitDeltaFixture(root, baselineHead, currentHead);
    const byPath = new Map(delta.changedRows.map((row) => [row.path, row]));
    assert.deepEqual(byPath.get('src/deleted.mjs'), { path: 'src/deleted.mjs', type: 'absent' });
    assert.equal(byPath.get('src/mode.mjs')?.type, '100755');
    assert.deepEqual(byPath.get('src/rename-from.mjs'), {
      path: 'src/rename-from.mjs',
      type: 'absent',
    });
    assert.equal(byPath.get('src/rename-to.mjs')?.type, '100644');
    assert.equal(byPath.get('src/type-change.mjs')?.type, '120000');
    assert.equal(
      Buffer.from(byPath.get('src/type-change.mjs')?.content ?? '', 'base64').toString(),
      '../target with spaces',
    );
    assert.equal(byPath.get('src/new-link.mjs')?.type, '120000');
    assert.equal(
      Buffer.from(byPath.get('src/new-link.mjs')?.content ?? '', 'base64').toString(),
      '../new target',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood pre-materialization verification isolates one exact parity delta', () => {
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const facts = deriveTransientPacketFixture(fixture.root);
    const valid = preMaterializationVerificationFixture(facts);
    assert.equal(acceptsPreMaterializationVerificationFixture(valid, facts), true);

    const cases = [
      ['generic expected failure', (candidate) => {
        candidate.parity.failed = ['generated parity failed as expected'];
      }],
      ['second failure', (candidate) => {
        candidate.parity.failed.push('unrelated failure');
      }],
      ['cancelled test', (candidate) => {
        candidate.parity.counts.cancelled = 1;
      }],
      ['unexpected selected test', (candidate) => {
        candidate.parity.selected.push('another parity test');
      }],
      ['unexpected delta', (candidate) => {
        candidate.parity.observedDelta = [];
      }],
      ['failed focused check', (candidate) => {
        candidate.checks[0].status = 'FAIL';
      }],
      ['pre-materialization full suite', (candidate) => {
        candidate.checks.push({ kind: 'full-suite', status: 'PASS', parityDependent: true });
      }],
    ];
    for (const [name, mutate] of cases) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      candidate.identity = fixtureIdentity({ checks: candidate.checks, parity: candidate.parity });
      assert.equal(
        acceptsPreMaterializationVerificationFixture(candidate, facts),
        false,
        name,
      );
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood final evidence keeps the accepted line and binds 10 declared 20 changed through close', () => {
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const facts = deriveTransientPacketFixture(fixture.root);
    const evidence = oneTimeFinalEvidenceFixture(facts);
    assert.equal(acceptsOneTimeFinalEvidenceFixture(facts, evidence), true);
    assert.match(
      evidence.line,
      /^- <UTC> - core-dogfood-accepted v1 terminal=T009@696e6369 head=[0-9a-f]{40} declared=[0-9a-f]{64} source=[0-9a-f]{64} changed=[0-9a-f]{64} review=[0-9a-f]{64}$/,
    );
    assert.equal(facts.changedRows.length, 20);
    assert.equal(facts.contributorPartition.flatMap(({ rows }) => rows).length, 10);
    assert.notEqual(facts.acceptedDeclarationIdentity, facts.completeChangedIdentity);
    for (const token of [
      `declared=${facts.acceptedDeclarationIdentity}`,
      `changed=${facts.completeChangedIdentity}`,
      `partition=${facts.contributorPartitionIdentity}`,
      `projection=${facts.expectedProjectionIdentity}`,
      `verification=${evidence.verificationIdentity}`,
      `ownership=${facts.authorityIdentity}`,
    ]) assert.ok(evidence.record.includes(token), token);

    const missingGate = structuredClone(evidence);
    missingGate.verification.pop();
    assert.equal(acceptsOneTimeFinalEvidenceFixture(facts, missingGate), false);

    const genericReview = structuredClone(evidence);
    genericReview.reviewEnvelope.record = 'APPROVE';
    genericReview.review = fixtureIdentity(genericReview.reviewEnvelope);
    genericReview.line = genericReview.line.replace(/review=[0-9a-f]{64}/, `review=${genericReview.review}`);
    assert.equal(acceptsOneTimeFinalEvidenceFixture(facts, genericReview), false);

    const expandedDeclaration = structuredClone(evidence);
    expandedDeclaration.reviewEnvelope.declared = facts.completeChangedIdentity;
    assert.equal(acceptsOneTimeFinalEvidenceFixture(facts, expandedDeclaration), false);

    const truncatedChanged = structuredClone(evidence);
    truncatedChanged.reviewEnvelope.changed = facts.acceptedChangedIdentity;
    assert.equal(acceptsOneTimeFinalEvidenceFixture(facts, truncatedChanged), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood appends rechecks selects latest accepted evidence and blocks every close drift', () => {
  const fixture = createTransientPacketRepositoryFixture();
  try {
    const olderMismatch = '- 2026-07-25T00:00:00Z - core-dogfood-accepted v1 terminal=T009@696e6369 head=0000000000000000000000000000000000000000 declared=0000000000000000000000000000000000000000000000000000000000000000 source=0000000000000000000000000000000000000000000000000000000000000000 changed=0000000000000000000000000000000000000000000000000000000000000000 review=0000000000000000000000000000000000000000000000000000000000000000';
    const valid = prepareOneTimeFinalCloseFixture(fixture.root, olderMismatch);
    try {
      const result = inspectOneTimeFinalCloseFixture(
        valid.root,
        valid.facts,
        valid.evidence,
        valid.ownerBeforeAppend,
        valid.acceptedLine,
      );
      assert.deepEqual(result.failures, [], 'valid append and immediate recheck authorize close');
      assert.equal(result.authorized, true);
      assert.equal(result.latestAccepted, valid.acceptedLine);
      assert.equal(result.acceptedFeatureEvidence.mode, 'core-close');
      assert.equal(
        result.acceptedFeatureEvidence.acceptedFeatureEvidenceIdentity,
        recoverySha256(recoveryCanonicalJson((({
          acceptedFeatureEvidenceIdentity: _identity,
          ...body
        }) => body)(result.acceptedFeatureEvidence))),
      );
    } finally {
      fs.rmSync(valid.parent, { recursive: true, force: true });
    }

    const newerMismatch = prepareOneTimeFinalCloseFixture(fixture.root);
    try {
      const ownerPath = path.join(newerMismatch.root, T007_TRANSIENT_IDENTITIES.adopterOwner);
      fs.appendFileSync(ownerPath, `${olderMismatch.replace('2026-07-25', '2026-07-27')}\n`);
      const result = inspectOneTimeFinalCloseFixture(
        newerMismatch.root,
        newerMismatch.facts,
        newerMismatch.evidence,
        newerMismatch.ownerBeforeAppend,
        newerMismatch.acceptedLine,
      );
      assert.ok(result.failures.includes('close-owner-append-drift'));
      assert.ok(result.failures.includes('close-latest-accepted-mismatch'));
      assert.equal(result.authorized, false);
    } finally {
      fs.rmSync(newerMismatch.parent, { recursive: true, force: true });
    }

    const cases = [
      ['source bytes', (prepared) => {
        writeFixture(prepared.root, prepared.facts.changedPaths[0], 'post-append source drift\n');
      }, 'close-sourceWorktree'],
      ['generated bytes', (prepared) => {
        writeFixture(prepared.root, prepared.facts.t009GeneratedPaths[0], 'post-append generated drift\n');
      }, 'close-generated-drift'],
      ['review identity', (prepared) => {
        prepared.evidence.reviewEnvelope.record = 'APPROVE';
      }, 'close-review-or-verification-drift'],
      ['verification set', (prepared) => {
        prepared.evidence.verification.pop();
      }, 'close-review-or-verification-drift'],
      ['partition identity', (prepared) => {
        prepared.facts.contributorPartitionIdentity = fixtureIdentity('wrong partition');
      }, 'close-partition-9-1'],
      ['declared identity', (prepared) => {
        prepared.facts.acceptedDeclarationIdentity = fixtureIdentity('wrong declaration');
      }, 'close-declared-10'],
      ['changed identity', (prepared) => {
        prepared.facts.completeChangedIdentity = fixtureIdentity('wrong changed set');
      }, 'close-changed-20'],
      ['owner append bytes', (prepared) => {
        fs.appendFileSync(
          path.join(prepared.root, T007_TRANSIENT_IDENTITIES.adopterOwner),
          '- later unrelated owner event\n',
        );
      }, 'close-owner-append-drift'],
    ];
    for (const [name, mutate, expectedFailure] of cases) {
      const prepared = prepareOneTimeFinalCloseFixture(fixture.root);
      try {
        mutate(prepared);
        const result = inspectOneTimeFinalCloseFixture(
          prepared.root,
          prepared.facts,
          prepared.evidence,
          prepared.ownerBeforeAppend,
          prepared.acceptedLine,
        );
        assert.ok(result.failures.includes(expectedFailure), `${name}: ${result.failures.join(', ')}`);
        assert.equal(result.authorized, false, name);
      } finally {
        fs.rmSync(prepared.parent, { recursive: true, force: true });
      }
    }

    const ordinaryFuture = firstAdopterPolicyPacketFixture();
    ordinaryFuture.declaration.changedAgainstOriginalPaths.push('src/contributor.mjs');
    ordinaryFuture.declaration.knownSourceFiles.push('src/contributor.mjs');
    assert.equal(
      acceptsFirstAdopterPolicyPacketFixture(ordinaryFuture),
      false,
      'ordinary future declaration mismatch remains blocked',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T007 Core Dogfood policy retains every named post-materialization gate and event-only close interpretation', () => {
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const evidence = markdownSection(localSkill, '### One-Time Final Evidence And Close');
  const verification = markdownSection(localSkill, '## Verification And Close');
  const failures = [
    ...missingParagraphRequirements(evidence, [
      ['accepted line shape stays unchanged', [
        /accepted line/i,
        /unchanged/i,
        /`declared`/i,
        /ten/i,
        /`source`/i,
        /complete current/i,
        /`changed`/i,
        /20/i,
      ]],
      ['extra changed rows are exact disjoint 9 and 1 attribution', [
        /ten[\s\S]{0,48}outside `declared`/i,
        /nine/i,
        /one/i,
        /disjoint/i,
        /Feature 003/i,
        /Feature 006/i,
      ]],
      ['review binds identities partition projection verification and ownership', [
        /`review`/i,
        /declared/i,
        /changed/i,
        /partition/i,
        /complete projection/i,
        /post-materialization verification/i,
        /ownership/i,
      ]],
      ['event interpretation governs authorization recheck latest match and close', [
        /changed-set validation/i,
        /materialization authorization/i,
        /post-materialization acceptance/i,
        /immediate/i,
        /latest-match/i,
        /close/i,
      ]],
      ['ordinary and later behavior remains declaration equals changed', [
        /ordinary|later/i,
        /declaration-equals-changed/i,
      ]],
    ]),
    ...missingParagraphRequirements(verification, [
      ['all post-materialization terminal gates remain mandatory', [
        /after materialization/i,
        /recursively discovered full repository suite/i,
        /exact parity/i,
        /Dude lint/i,
        /compose/i,
        /pristine release build/i,
        /release lint/i,
        /intended-scope/i,
        /whitespace/i,
        /all terminal gates/i,
        /final independent review/i,
      ]],
    ]),
  ];
  assert.deepEqual(failures, [], `${CORE_DOGFOOD_LOCAL_SKILL}: final evidence and gates`);
});

test('T007 Core Dogfood current contributor owners tasks and path attribution resolve without historical acceptance authority', () => {
  // Arrange
  const authorities = [
    {
      spec: T007_TRANSIENT_IDENTITIES.contributor003Spec,
      owner: T007_TRANSIENT_IDENTITIES.contributor003Owner,
      tasks: sortFixturePaths(new Set(Object.values(T007_FEATURE_003_CHAINS).flat())),
      terminal: T007_TRANSIENT_IDENTITIES.contributor003Terminal,
      taskFile: '.dude/specs/003-guarded-directory-artifact-import/tasks.md',
      packageFiles: [
        '.dude/specs/003-guarded-directory-artifact-import/plan.md',
        '.dude/specs/003-guarded-directory-artifact-import/spec.md',
        '.dude/specs/003-guarded-directory-artifact-import/tasks.md',
      ],
      sourcePaths: T007_FEATURE_003_PATHS,
    },
    {
      spec: T007_TRANSIENT_IDENTITIES.contributor006Spec,
      owner: T007_TRANSIENT_IDENTITIES.contributor006Owner,
      tasks: [T007_TRANSIENT_IDENTITIES.contributor006Task],
      terminal: T007_TRANSIENT_IDENTITIES.contributor006Terminal,
      taskFile: '.dude/specs/006-simplify-context-footprint-audit/tasks.md',
      packageFiles: [
        '.dude/specs/006-simplify-context-footprint-audit/plan.md',
        '.dude/specs/006-simplify-context-footprint-audit/research.md',
        '.dude/specs/006-simplify-context-footprint-audit/spec.md',
        '.dude/specs/006-simplify-context-footprint-audit/tasks.md',
      ],
      sourcePaths: T007_FEATURE_006_PATHS,
    },
  ];

  // Act and assert
  for (const authority of authorities) {
    const resolved = JSON.parse(execFileSync(process.execPath, [
      'src/skills/dude-engine/feature.mjs',
      'resolve',
      '--root',
      '.',
      '--spec',
      authority.spec,
      '--json',
    ], { cwd: ROOT, encoding: 'utf8' }));
    assert.deepEqual(resolved.diagnostics, [], `${authority.spec}: zero diagnostics`);
    assert.equal(resolved.owner?.ideaPath, authority.owner, `${authority.spec}: exact owner`);
    assert.equal(resolved.owner?.specPath, authority.spec, `${authority.spec}: exact spec`);
    assert.match(read(authority.owner), /^status: defined$/m, `${authority.owner}: defined status`);
    const taskText = read(authority.taskFile);
    for (const taskKey of [...authority.tasks, authority.terminal]) {
      assert.ok(canonicalFixtureTaskLine(taskText, taskKey), `${taskKey}: current task context`);
    }
    const packageText = authority.packageFiles.map(read).join('\n');
    for (const sourcePath of authority.sourcePaths) {
      const parent = path.posix.dirname(sourcePath);
      const basename = path.posix.basename(sourcePath);
      assert.ok(
        packageText.includes(sourcePath)
        || (packageText.includes(parent) && packageText.includes(basename)),
        `${sourcePath}: current attribution context`,
      );
    }
  }
});

test('T007 Core Dogfood strict ordinary future gate is mutation-sensitive', () => {
  // Arrange
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const packet = markdownSection(localSkill, '### Current T007 Transient Fresh Packet');
  const weakened = packet.replace(
    'requires exact recorded baseline `HEAD` and `HEAD:src` equality and every existing lifecycle gate',
    'may use descendant continuity instead of exact baseline equality',
  );

  // Act and assert
  assert.notEqual(weakened, packet, 'future-gate policy mutation changes the exact clause');
  assert.deepEqual(transientPacketPolicyFailures(packet), [], 'current packet policy is complete');
  assert.ok(
    transientPacketPolicyFailures(weakened).includes('ordinary future exact baseline gates are not weakened'),
    'future-gate weakening is rejected by section-aware policy assertions',
  );
});

test('T007 Core Dogfood transient policy obligations and immediate-use authority are modality-sensitive', () => {
  // Arrange
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const packet = markdownSection(localSkill, '### Current T007 Transient Fresh Packet');
  const weakenedApproval = packet.replace(
    'Each must independently reacquire authoritative Git identities and bytes, mapping and cleanup results, ownership and task facts, every dirt layer, protected prestate, and command results, or independently verify every supplied value against those authorities.',
    'Tester and Reviewer may echo a coordinator summary.',
  );
  const durablePacket = packet.replace(
    'materialization only',
    'durable close authority',
  );

  // Act
  const currentFailures = transientPacketPolicyFailures(packet);

  // Assert
  assert.deepEqual(currentFailures, [], 'current transient packet policy is complete');
  assert.notEqual(weakenedApproval, packet, 'approval mutation changes the policy');
  assert.ok(
    transientPacketPolicyFailures(weakenedApproval).includes(
      'Tester and Reviewer independently reacquire complete packet facts',
    ),
    'echoed packet approval is rejected',
  );
  assert.notEqual(durablePacket, packet, 'authority-lifetime mutation changes the policy');
  assert.ok(
    transientPacketPolicyFailures(durablePacket).includes(
      'approvals authorize one immediate materialization only after unchanged recheck',
    ),
    'turning transient authority into durable close authority is rejected',
  );
});

test('T004 Core Dogfood canonical fixtures pin JSON.stringify bytes, Unicode, ordering, and SHA-256', () => {
  // Arrange
  const compareUtf8Paths = (left, right) => Buffer.compare(
    Buffer.from(left.path ?? left, 'utf8'),
    Buffer.from(right.path ?? right, 'utf8'),
  );
  const declared = [
    'src/\u{1f600}.mjs',
    'src/\u00e9.mjs',
    'src/quote".mjs',
    'src/line\nbreak.mjs',
    'src/e\u0301.mjs',
  ].sort(compareUtf8Paths);
  const source = [
    { path: 'src/\u{1f600}.mjs', type: '100644', content: '8J+YgA==' },
    { path: 'src/\u00e9.mjs', type: '100644', content: 'w6k=' },
    { path: 'src/quote".mjs', type: '120000', content: 'dGFyZ2V0' },
    { path: 'src/line\nbreak.mjs', type: '100755', content: 'bGluZQo=' },
    { path: 'src/e\u0301.mjs', type: '100644', content: 'ZQ==' },
  ].sort(compareUtf8Paths);
  const changed = [
    { path: 'src/\u{1f600}.mjs', type: 'absent' },
    { path: 'src/\u00e9.mjs', type: '100644', content: 'w6k=' },
    { path: 'src/quote".mjs', type: '120000', content: 'dGFyZ2V0' },
    { path: 'src/line\nbreak.mjs', type: 'absent' },
    { path: 'src/e\u0301.mjs', type: 'absent' },
  ].sort(compareUtf8Paths);
  const fixtures = [
    {
      name: 'declared',
      value: declared,
      json: '["src/e\u0301.mjs","src/line\\nbreak.mjs","src/quote\\".mjs","src/\u00e9.mjs","src/\u{1f600}.mjs"]',
      sha256: '5fcfddac034dca0194720a20916e4fc20b35388872407af28667945a08bf2560',
    },
    {
      name: 'source',
      value: source,
      json: '[{"path":"src/e\u0301.mjs","type":"100644","content":"ZQ=="},{"path":"src/line\\nbreak.mjs","type":"100755","content":"bGluZQo="},{"path":"src/quote\\".mjs","type":"120000","content":"dGFyZ2V0"},{"path":"src/\u00e9.mjs","type":"100644","content":"w6k="},{"path":"src/\u{1f600}.mjs","type":"100644","content":"8J+YgA=="}]',
      sha256: '5e773a1986cde69f7b58f54767bc613e4bf6aea91d99f5ee2599d84ec1cc942e',
    },
    {
      name: 'changed',
      value: changed,
      json: '[{"path":"src/e\u0301.mjs","type":"absent"},{"path":"src/line\\nbreak.mjs","type":"absent"},{"path":"src/quote\\".mjs","type":"120000","content":"dGFyZ2V0"},{"path":"src/\u00e9.mjs","type":"100644","content":"w6k="},{"path":"src/\u{1f600}.mjs","type":"absent"}]',
      sha256: '4e2b4cbbddcb1b9c93cdeb06d5818a1c894c3532a073b093c795562324805b42',
    },
  ];

  // Act and assert
  assert.deepEqual(declared, [
    'src/e\u0301.mjs',
    'src/line\nbreak.mjs',
    'src/quote".mjs',
    'src/\u00e9.mjs',
    'src/\u{1f600}.mjs',
  ], 'declared, source, and changed paths use UTF-8 bytewise order');
  assert.equal(declared[0].normalize('NFC'), declared[3], 'fixture has canonically equivalent paths');
  assert.notEqual(declared[0], declared[3], 'JSON.stringify performs no Unicode normalization');
  for (const fixture of fixtures) {
    const bytes = Buffer.from(JSON.stringify(fixture.value), 'utf8');
    assert.deepEqual(bytes, Buffer.from(fixture.json, 'utf8'), `${fixture.name}: exact UTF-8 bytes`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      fixture.sha256,
      `${fixture.name}: fixed SHA-256`,
    );
  }
});

test('T004 Core Dogfood baseline ownership is project-only and local promotion is consume-only', () => {
  // Arrange
  const projectSkill = read(PROJECT_SKILL);
  const localSkill = read(CORE_DOGFOOD_LOCAL_SKILL);
  const exactBaselineCount = (source) => source.split('\n')
    .filter((line) => line.trim() === CORE_DOGFOOD_BASELINE_LINE)
    .length;
  const authorizingVerb =
    "(?:construct|append|create|recreate|record|repair|replace|(?:retroactively\\s+)?establish)";
  // The authorizing verb must actually govern the baseline: after the verb only
  // determiners and modifiers may stand between it and the `baseline` head noun.
  // A bare verb elsewhere in the paragraph, or a verb governing some other object,
  // does not authorize baseline ownership.
  const governsBaseline = new RegExp(
    `\\b${authorizingVerb}\\b\\s+(?:[\\w][\\w'-]*,?\\s+){0,6}baselines?\\b`,
    'i',
  );
  const negatedAuthorizingVerb = new RegExp(
    `\\b(?:never|must not|does not|do not|cannot|may not)\\b[^.\\n]*\\b${authorizingVerb}\\b`,
    'i',
  );
  const authorizingBaselineParagraphs = (source) => visibleMarkdown(source)
    .split(/\n\s*\n/)
    .filter((paragraph) => /baseline/i.test(paragraph))
    .filter((paragraph) => (
      governsBaseline.test(paragraph) && !negatedAuthorizingVerb.test(paragraph)
    ));
  const assertLocalConsumesOnly = (source) => {
    assert.equal(exactBaselineCount(source), 0, 'local skill contains zero exact baseline lines');
    assert.deepEqual(
      authorizingBaselineParagraphs(source),
      [],
      'local skill contains no phrase authorizing baseline construction or repair',
    );
  };

  // Act and assert
  assert.equal(exactBaselineCount(projectSkill), 1, 'project guidance owns exactly one baseline line');
  assertLocalConsumesOnly(localSkill);
  for (const mutation of [
    `${localSkill}\n\n${CORE_DOGFOOD_BASELINE_LINE}\n`,
    `${localSkill}\n\nConstruct, append, create, or record a baseline when one is missing.\n`,
    `${localSkill}\n\nRepair, replace, or retroactively establish the baseline after verification.\n`,
    `${localSkill}\n\nThe promotion route may append a baseline line when none exists.\n`,
    `${localSkill}\n\nRecreate the baseline from the current source tree.\n`,
    `${localSkill}\n\nRecord a replacement baseline and continue.\n`,
    `${localSkill}\n\nAppend a fresh, correctly ordered, original pre-source baseline line to the owner log.\n`,
    `${localSkill}\n\nCreate the missing baseline from the current source tree when the owner log has none.\n`,
  ]) {
    assert.throws(
      () => assertLocalConsumesOnly(mutation),
      'consume-only guard rejects a local baseline ownership mutation',
    );
  }
});

test('T004 Core Dogfood baseline predicates reject tracked, hidden, untracked, and ignored dirt', () => {
  // Arrange
  const boundaries = [
    {
      name: 'source',
      relative: 'src/example.txt',
      untrackedRelative: 'src/new-example.txt',
      ignoredRelative: 'src/ignored.txt',
      indexLayer: 'sourceIndex',
      worktreeLayer: 'sourceWorktree',
      untrackedLayer: 'sourceUntracked',
      ignoredLayer: 'sourceIgnored',
      hiddenLayer: 'sourceHiddenFlags',
      otherPrefix: 'generated',
    },
    {
      name: 'base-owned generated',
      relative: '.github/skills/dude-example/SKILL.md',
      untrackedRelative: '.github/skills/dude-untracked/SKILL.md',
      ignoredRelative: '.github/skills/dude-ignored/SKILL.md',
      indexLayer: 'generatedIndex',
      worktreeLayer: 'generatedWorktree',
      untrackedLayer: 'generatedUntracked',
      ignoredLayer: 'generatedIgnored',
      hiddenLayer: 'generatedHiddenFlags',
      otherPrefix: 'source',
    },
  ];
  for (const relative of [
    boundaries[1].relative,
    boundaries[1].untrackedRelative,
    boundaries[1].ignoredRelative,
  ]) {
    assert.equal(classifyPath(relative), TIER.CORE, `${relative}: generated fixture is base-owned`);
  }

  /** @type {Array<{
   *   name: string,
   *   relativeKey?: 'untrackedRelative' | 'ignoredRelative',
   *   arrange: (root: string, relative: string) => void,
   *   expected: {
   *     index?: boolean,
   *     worktree?: boolean,
   *     untracked?: boolean,
   *     ignored?: boolean,
   *     hiddenTag?: string,
   *     skipHiddenCheck?: boolean,
   *   },
   * }>} */
  const cases = [
    {
      name: 'staged-only',
      arrange(root, relative) {
        writeFixture(root, relative, 'B\n');
        git(root, ['add', '--', relative]);
      },
      expected: { index: true, worktree: false },
    },
    {
      name: 'unstaged-only',
      arrange(root, relative) { writeFixture(root, relative, 'B\n'); },
      expected: { index: false, worktree: true },
    },
    {
      name: 'offsetting HEAD=A index=B worktree=A',
      arrange(root, relative) {
        writeFixture(root, relative, 'B\n');
        git(root, ['add', '--', relative]);
        writeFixture(root, relative, 'A\n');
        assert.deepEqual(
          gitNulPaths(root, ['diff', 'HEAD', '--no-renames', '--name-only', '-z', '--', relative]),
          [],
          `${relative}: net HEAD-to-worktree view cancels`,
        );
      },
      expected: { index: true, worktree: true },
    },
    {
      name: 'mode-only with repository core.fileMode=false',
      arrange(root, relative) {
        git(root, ['config', 'core.fileMode', 'false']);
        fs.chmodSync(path.join(root, ...relative.split('/')), 0o755);
        assert.deepEqual(
          gitNulPaths(root, ['diff', '--no-renames', '--name-only', '-z', '--', relative]),
          [],
          `${relative}: repository configuration hides mode-only drift`,
        );
      },
      expected: { worktree: true },
    },
    {
      name: 'staged deletion',
      arrange(root, relative) { git(root, ['rm', '--quiet', '--', relative]); },
      expected: { index: true, worktree: false },
    },
    {
      name: 'staged type change',
      arrange(root, relative) {
        fs.unlinkSync(path.join(root, ...relative.split('/')));
        fs.symlinkSync('type-change-target', path.join(root, ...relative.split('/')));
        git(root, ['add', '--', relative]);
      },
      expected: { index: true, worktree: false },
    },
    {
      name: 'unmerged conflict',
      arrange(root, relative) {
        const mainBranch = git(root, ['branch', '--show-current']).trim();
        git(root, ['switch', '--quiet', '-c', 't004-conflict-side']);
        writeFixture(root, relative, 'side\n');
        git(root, ['add', '--', relative]);
        git(root, ['commit', '--quiet', '-m', 'conflict side']);
        git(root, ['switch', '--quiet', mainBranch]);
        writeFixture(root, relative, 'main\n');
        git(root, ['add', '--', relative]);
        git(root, ['commit', '--quiet', '-m', 'conflict main']);
        const merge = spawnSync('git', ['merge', '--no-edit', 't004-conflict-side'], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        assert.equal(merge.error, undefined, `${relative}: merge invocation`);
        assert.equal(merge.status, 1, `${relative}: merge must produce a conflict`);
        assert.notEqual(
          git(root, ['ls-files', '--unmerged', '--', relative]),
          '',
          `${relative}: unmerged index entries`,
        );
      },
      expected: { index: true, worktree: true, skipHiddenCheck: true },
    },
    {
      name: 'assume-unchanged index flag',
      arrange(root, relative) {
        git(root, ['update-index', '--assume-unchanged', '--', relative]);
      },
      expected: { hiddenTag: 'h' },
    },
    {
      name: 'skip-worktree index flag',
      arrange(root, relative) {
        git(root, ['update-index', '--skip-worktree', '--', relative]);
      },
      expected: { hiddenTag: 'S' },
    },
    {
      name: 'untracked',
      relativeKey: 'untrackedRelative',
      arrange(root, relative) { writeFixture(root, relative, 'untracked\n'); },
      expected: { untracked: true },
    },
    {
      name: 'ignored',
      relativeKey: 'ignoredRelative',
      arrange(root, relative) { writeFixture(root, relative, 'ignored\n'); },
      expected: { ignored: true },
    },
  ];

  for (const boundary of boundaries) {
    for (const fixture of cases) {
      const root = temporaryCoreDogfoodRepository();
      try {
        for (const candidate of boundaries) writeFixture(root, candidate.relative, 'A\n');
        git(root, ['add', '--', ...boundaries.map(({ relative }) => relative)]);
        git(root, ['commit', '--quiet', '-m', 'baseline layer fixtures']);
        const clean = coreDogfoodBaselineLayers(root);
        assert.equal(clean.accepted, true, `${boundary.name}: normal H tags are clean`);
        assert.deepEqual(clean.sourceHiddenFlags, [], `${boundary.name}: source normal H tags`);
        assert.deepEqual(clean.generatedHiddenFlags, [], `${boundary.name}: generated normal H tags`);
        const relative = fixture.relativeKey === undefined
          ? boundary.relative
          : boundary[fixture.relativeKey];
        fixture.arrange(root, relative);

        // Act
        const actual = coreDogfoodBaselineLayers(root);

        // Assert
        assert.equal(actual.accepted, false, `${boundary.name}: ${fixture.name}`);
        assert.deepEqual(
          [...new Set(actual[boundary.indexLayer])],
          fixture.expected.index ? [relative] : [],
          `${boundary.name}: ${fixture.name}: index versus HEAD`,
        );
        assert.deepEqual(
          [...new Set(actual[boundary.worktreeLayer])],
          fixture.expected.worktree ? [relative] : [],
          `${boundary.name}: ${fixture.name}: worktree versus index`,
        );
        assert.deepEqual(
          actual[boundary.untrackedLayer],
          fixture.expected.untracked ? [relative] : [],
          `${boundary.name}: ${fixture.name}: untracked`,
        );
        assert.deepEqual(
          actual[boundary.ignoredLayer],
          fixture.expected.ignored ? [relative] : [],
          `${boundary.name}: ${fixture.name}: ignored`,
        );
        if (!fixture.expected.skipHiddenCheck) {
          assert.deepEqual(
            actual[boundary.hiddenLayer],
            fixture.expected.hiddenTag ? [{ tag: fixture.expected.hiddenTag, path: relative }] : [],
            `${boundary.name}: ${fixture.name}: normal or hidden index tags`,
          );
        }
        for (const [layer, paths] of Object.entries(actual)) {
          if (layer === 'accepted' || !layer.startsWith(boundary.otherPrefix)) continue;
          assert.deepEqual(paths, [], `${boundary.name}: ${fixture.name}: ${layer} stays clean`);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test('T001 CI source contract proves bounded policy/Git predicate coverage only, not future Spec Lead, Reviewer, or close behavior', () => {
  // Arrange
  const workflow = read(CI_WORKFLOW);
  /** @type {string[]} */
  const failures = [];
  const permissionKeys = workflow
    .split('\n')
    .filter((line) => /^\s*permissions:\s*$/.test(line));
  if (permissionKeys.length !== 1 || permissionKeys[0] !== 'permissions:') {
    failures.push('permissions must be one top-level block');
  }
  try {
    const permissions = yamlTopLevelBlock(workflow, 'permissions')
      .split('\n')
      .filter((line) => line.trim() !== '' && !/^\s*#/.test(line));
    if (JSON.stringify(permissions) !== JSON.stringify(['permissions:', '  contents: read'])) {
      failures.push('top-level permissions must contain only contents: read');
    }
  } catch {
    failures.push('top-level permissions must contain only contents: read');
  }

  /** @type {string[]} */
  let steps = [];
  try {
    steps = workflowJobSteps(workflow, 'validate');
  } catch {
    failures.push('validate job must have one parseable steps block');
  }
  const checkoutIndexes = steps
    .map((step, index) => workflowStepUses(step)?.startsWith('actions/checkout@') ? index : -1)
    .filter((index) => index !== -1);
  if (checkoutIndexes.length !== 1) {
    failures.push('validate must have exactly one actions/checkout step');
  } else if (!/^          persist-credentials:\s*false\s*$/m.test(steps[checkoutIndexes[0]])) {
    failures.push('checkout must set persist-credentials: false in its with block');
  }

  const setupIndexes = steps
    .map((step, index) => workflowStepUses(step)?.startsWith('actions/setup-node@') ? index : -1)
    .filter((index) => index !== -1);
  const driftIndexes = steps
    .map((step, index) => workflowStepName(step) === 'Dev-bundle drift check' ? index : -1)
    .filter((index) => index !== -1);
  if (setupIndexes.length !== 1) failures.push('validate must have exactly one actions/setup-node step');
  if (driftIndexes.length !== 1) failures.push('validate must have exactly one Dev-bundle drift check step');
  if (
    setupIndexes.length === 1
    && driftIndexes.length === 1
    && driftIndexes[0] !== setupIndexes[0] + 1
  ) {
    failures.push('Dev-bundle drift check must directly follow actions/setup-node');
  }

  // Act
  if (driftIndexes.length === 1) {
    const run = workflowStepRun(steps[driftIndexes[0]]);
    const runLines = run.split('\n');
    const buildIndexes = runLines
      .map((line, index) => (line.trim() === 'node scripts/build-dev.mjs' ? index : -1))
      .filter((index) => index !== -1);
    if (buildIndexes.length !== 1) {
      failures.push('drift step must run node scripts/build-dev.mjs exactly once');
    } else {
      const preBuild = runLines.slice(0, buildIndexes[0]).join('\n');
      const postBuild = runLines.slice(buildIndexes[0] + 1).join('\n');
      for (const [phase, source] of [['pre-build', preBuild], ['post-build', postBuild]]) {
        if (!GIT_VISIBLE_STATUS_COMMAND_PATTERN.test(source)) {
          failures.push(`${phase} must run exact ${GIT_VISIBLE_STATUS_COMMAND}`);
        }
        if (!GIT_OWNED_IGNORED_STATUS_COMMAND_PATTERN.test(source)) {
          failures.push(`${phase} must check ignored entries under exactly src .github .dude`);
        }
        if (!source.includes('!!')) failures.push(`${phase} must reject ignored !! entries`);
        if (!/\bexit 1\b/.test(source)) failures.push(`${phase} predicates must fail the step`);
      }
      if (run.includes('git status --porcelain -- .github')) {
        failures.push('legacy .github-only visible status is too narrow');
      }
      const ignoredCommandLines = runLines.filter((line) => (
        line.includes('git status') && line.includes('--ignored')
      ));
      if (ignoredCommandLines.some((line) => /(?:^|[ /])dist(?:[ /"')]|$)/.test(line))) {
        failures.push('ignored dist must remain outside the named-root predicate');
      }
    }
  }

  const forbiddenAction = steps
    .map(workflowStepUses)
    .filter((uses) => uses !== null)
    .find((uses) => /(?:release|publish|deploy|pages)/i.test(uses));
  if (forbiddenAction) failures.push(`remote or release action is forbidden: ${forbiddenAction}`);
  const runSource = steps.map(workflowStepRun).filter(Boolean).join('\n');
  const forbiddenCommands = [
    ['Git repository mutation', /\bgit(?:\s+-c\s+\S+)*\s+(?:add|commit|push|tag|remote)\b/i],
    ['GitHub release', /\bgh\s+release\b/i],
    ['package publish', /\b(?:npm|pnpm|yarn|cargo)\s+publish\b/i],
    ['release or publish command', /(?:^|\n)\s*(?:release|publish)\b/i],
    ['HTTP remote mutation', /\bcurl\b[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i],
  ];
  for (const [label, pattern] of forbiddenCommands) {
    if (pattern.test(runSource)) failures.push(`${label} operation is forbidden`);
  }
  if (/\b(?:secrets\.|github\.token|GITHUB_TOKEN|GH_TOKEN)\b/i.test(workflow)) {
    failures.push('credential-bearing workflow input is forbidden');
  }

  // Assert
  assert.deepEqual(
    failures,
    [],
    `${CI_WORKFLOW}: bounded policy/Git-predicate source contract`,
  );
});

test('T001 actual Bash ignored guards prove fail-closed shell behavior only, not future Spec Lead, Reviewer, or close behavior', () => {
  // Arrange
  const workflow = read(CI_WORKFLOW);
  const driftStep = workflowJobSteps(workflow, 'validate')
    .find((step) => workflowStepName(step) === 'Dev-bundle drift check');
  assert.ok(driftStep, `${CI_WORKFLOW}: Dev-bundle drift check step`);
  const runLines = workflowStepRun(driftStep).split('\n');
  const ignoredAssignment = `ignored_status="$(${GIT_OWNED_IGNORED_STATUS_COMMAND})"`;
  const guardStarts = runLines
    .map((line, index) => (line.trim() === ignoredAssignment ? index : -1))
    .filter((index) => index !== -1);
  assert.equal(guardStarts.length, 2, `${CI_WORKFLOW}: exact pre-build and post-build ignored guards`);
  const guards = guardStarts.map((start) => {
    const endOffset = runLines.slice(start).findIndex((line) => line.trim() === 'fi');
    assert.notEqual(endOffset, -1, `${CI_WORKFLOW}: ignored guard closes with fi`);
    return runLines.slice(start, start + endOffset + 1).join('\n');
  });
  const root = temporaryCoreDogfoodRepository();
  const runGuard = (guard) => spawnSync('bash', ['-o', 'pipefail', '-c', guard], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'ignore',
  });

  try {
    // Act and assert: no ignored entry is clean.
    for (const [index, guard] of guards.entries()) {
      const clean = runGuard(guard);
      assert.equal(clean.error, undefined, `clean guard ${index + 1}: Bash invocation`);
      assert.equal(clean.status, 0, `clean guard ${index + 1}: no ignored entry exits zero`);
    }

    const ignoredPrefix = 'ignored-stress-';
    fs.appendFileSync(
      path.join(root, '.git', 'info', 'exclude'),
      `\n/src/${ignoredPrefix}*\n`,
    );
    const longSuffix = 'x'.repeat(200);
    for (let index = 0; index < 12_000; index += 1) {
      const filename = `${ignoredPrefix}${String(index).padStart(5, '0')}-${longSuffix}.txt`;
      fs.writeFileSync(path.join(root, 'src', filename), 'ignored\n');
    }
    const ignoredStatus = execFileSync('git', GIT_OWNED_IGNORED_STATUS_ARGS, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ok(
      Buffer.byteLength(ignoredStatus, 'utf8') > 2 * 1024 * 1024,
      'stress fixture must produce more than 2 MiB of owned-root ignored status',
    );
    assert.equal(
      ignoredStatus.split('\n').filter((line) => line.startsWith('!! ')).length,
      12_000,
      'stress fixture must expose every ignored owned-root path',
    );

    // Act and assert: each exact CI guard must reject ignored entries under pipefail.
    for (const [index, guard] of guards.entries()) {
      const ignored = runGuard(guard);
      assert.equal(ignored.error, undefined, `ignored guard ${index + 1}: Bash invocation`);
      assert.equal(ignored.status, 1, `ignored guard ${index + 1}: ignored entries fail closed`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 temporary Git repositories prove policy/Git predicate coverage only, not future Spec Lead, Reviewer, or close behavior', () => {
  // Arrange
  assert.deepEqual(CORE_DOGFOOD_OWNED_ROOTS, ['src', '.github', '.dude']);
  /** @type {Array<{
   *   name: string,
   *   arrange: (root: string) => void,
   *   expected: {accepted: boolean, visible: string[], ownedIgnored: string[]},
   * }>} */
  const cases = [
    {
      name: 'clean pass',
      arrange() {},
      expected: { accepted: true, visible: [], ownedIgnored: [] },
    },
    {
      name: 'tracked modification rejects',
      arrange(root) { writeFixture(root, 'src/tracked.txt', 'modified\n'); },
      expected: { accepted: false, visible: [' M src/tracked.txt'], ownedIgnored: [] },
    },
    {
      name: 'untracked file rejects',
      arrange(root) { writeFixture(root, 'untracked.txt', 'untracked\n'); },
      expected: { accepted: false, visible: ['?? untracked.txt'], ownedIgnored: [] },
    },
    {
      name: 'ignored src entry rejects',
      arrange(root) { writeFixture(root, 'src/ignored.txt', 'ignored\n'); },
      expected: { accepted: false, visible: [], ownedIgnored: ['!! src/ignored.txt'] },
    },
    {
      name: 'ignored .github entry rejects',
      arrange(root) { writeFixture(root, '.github/ignored.txt', 'ignored\n'); },
      expected: { accepted: false, visible: [], ownedIgnored: ['!! .github/ignored.txt'] },
    },
    {
      name: 'ignored .dude entry rejects',
      arrange(root) { writeFixture(root, '.dude/ignored.txt', 'ignored\n'); },
      expected: { accepted: false, visible: [], ownedIgnored: ['!! .dude/ignored.txt'] },
    },
    {
      name: 'ignored dist only stays outside named-root result',
      arrange(root) { writeFixture(root, 'dist/ignored.txt', 'ignored\n'); },
      expected: { accepted: true, visible: [], ownedIgnored: [] },
    },
  ];

  for (const fixture of cases) {
    const root = temporaryCoreDogfoodRepository();
    try {
      fixture.arrange(root);

      // Act
      const actual = coreDogfoodGitPredicates(root);

      // Assert
      assert.deepEqual(actual, fixture.expected, fixture.name);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

// --- T007: one detailed autonomous learning-governance owner ------------------

const GOVERNANCE_POLICY_OWNER = 'src/skills/dude-work/SKILL.md';
const GOVERNANCE_POLICY_SECTION = '## Autonomous Learning Governance';

const GOVERNANCE_POINTER_SURFACES = [
  'src/agents/dude.agent.md',
  'src/instructions/dude.instructions.md',
  'src/skills/dude-lightweight-execution/SKILL.md',
  'src/skills/dude-receiving-code-review/SKILL.md',
  'src/skills/dude-reviewer-protocol/SKILL.md',
];

const GOVERNANCE_DOC_SECTIONS = [
  ['docs/commands.md', '### `@dude work`'],
  ['docs/reference.md', '## Execution Workflow'],
  ['docs/workflow.md', '### Optional Continuous Work'],
];

// Detailed policy that only the owner may state. Each marker is separately
// proven to match the owner section, so none of them can pass vacuously.
const GOVERNANCE_DETAIL_MARKERS = [
  ['governance state fields', /\b(?:pendingCompletion|learningGovernance|learning-governance-capacity|learning-governance-conflict|occurrence-retention-conflict|learning-required)\b/],
  ['governance phase names', /\b(?:alternative-inspected|no-progress-verified)\b/],
  ['runtime transition routes', /`transition (?:prepare-projection|verify-projection|bind-post-learning-inspection|verify-no-progress|issue-attempt-permit|issue-lane-permit|commit-lane-receipt|controlled-end|resume-governance)`/],
  ['projection batch bounds', /\b17 events\b|\bexactly one approach event\b/],
  ['equivalence and comparison bases', /\bnormalized basis\b|\bfailed-approach set\b/],
  ['end-form authority', /\bcontrolled-end authority\b|\bimmediate halt end\b/i],
];

// One acyclic permit order. Nodes are the literal backticked route tokens the
// owner section must present, so a documented reordering breaks the contract.
const GOVERNANCE_PERMIT_EDGES = [
  ['`learn`', '`transition prepare-projection`'],
  ['`transition prepare-projection`', '`transition verify-projection`'],
  ['`transition verify-projection`', '`transition bind-post-learning-inspection`'],
  ['`transition verify-projection`', '`transition verify-no-progress`'],
  ['`transition bind-post-learning-inspection`', '`transition issue-attempt-permit`'],
  ['`transition bind-post-learning-inspection`', '`transition controlled-end`'],
  ['`transition verify-no-progress`', '`transition controlled-end`'],
  ['`transition issue-attempt-permit`', '`transition issue-lane-permit`'],
  ['`transition issue-lane-permit`', '`transition commit-lane-receipt`'],
];

const GOVERNANCE_PUBLIC_COMMANDS = ['inspect', 'authorize', 'complete', 'learn', 'transition', 'audit'];

// Runtime routes are reachable, but none of them is a user-facing verb.
const FORBIDDEN_USER_COMMANDS = [
  ...GOVERNANCE_PUBLIC_COMMANDS,
  'govern', 'learning', 'project', 'projection', 'resume', 'suspend', 'halt', 'permit',
].map((verb) => `@dude ${verb}`);

const WORK_GRAMMAR_LINE = '@dude work [<feature>] [--max <N|unlimited>] [--until blocked] [--parallel <N>] [--recover-on-block] [--recovery-cycles <N|unlimited>] [--policy guarded|autonomous]';

// The eight generated core paths T009 alone may materialize.
const GENERATED_CORE_PAIRS = [
  ['src/agents/dude.agent.md', '.github/agents/dude.agent.md'],
  ['src/instructions/dude.instructions.md', '.github/instructions/dude.instructions.md'],
  ['src/skills/dude-lightweight-execution/SKILL.md', '.github/skills/dude-lightweight-execution/SKILL.md'],
  ['src/skills/dude-lightweight-execution/board.mjs', '.github/skills/dude-lightweight-execution/board.mjs'],
  ['src/skills/dude-receiving-code-review/SKILL.md', '.github/skills/dude-receiving-code-review/SKILL.md'],
  ['src/skills/dude-reviewer-protocol/SKILL.md', '.github/skills/dude-reviewer-protocol/SKILL.md'],
  ['src/skills/dude-work/SKILL.md', '.github/skills/dude-work/SKILL.md'],
  ['src/skills/dude-work/recovery.mjs', '.github/skills/dude-work/recovery.mjs'],
];

const CONCURRENCY_TOKEN = /\b(?:concurrent|concurrently|concurrency|fan-out|fanned-out|simultaneous|simultaneously|in parallel|at the same time)\b/i;
const CONCURRENCY_DENIAL = /\b(?:no|not|never|none|nothing|zero|without|refuse[sd]?|reject[sd]?|forbid[s]?|prohibit[s]?|fails?|discard(?:s|ed)?|normalize[sd]?|sequential(?:ly)?|one at a time|compatibility-only)\b/i;

// The lookahead admits digits so a numbered list item starts a new sentence;
// otherwise a whole list collapses into one "sentence" and a denial word in an
// unrelated item exonerates a concurrency token elsewhere in it.
/** @param {string} text */
function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[0-9A-Z`"'(\[])/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length > 0);
}

/** Sentences that grant concurrency without any denial or scoping token. @param {string} text */
function concurrencyGrants(text) {
  return sentences(text).filter((sentence) => (
    CONCURRENCY_TOKEN.test(sentence) && !CONCURRENCY_DENIAL.test(sentence)
  ));
}

/**
 * Report generated-core files that carry governance content while the declared
 * pairs are not at exact parity, which is what a hand copy of part of the
 * source produces. Exact parity is accepted because it is also what the
 * sanctioned T009 `build-dev` materialization produces: the two are
 * byte-identical, so no static predicate can separate them. Premature
 * materialization is detected out of band by `git status --porcelain -- .github`,
 * which Phase 9 already records.
 * @param {{label: string, source: string, generated: string}[]} pairs
 */
function governanceInGeneratedCoreIssues(pairs) {
  if (pairs.every((pair) => pair.source === pair.generated)) return [];
  /** @type {string[]} */
  const issues = [];
  for (const pair of pairs) {
    if (pair.generated.includes(GOVERNANCE_POLICY_SECTION)) issues.push(`${pair.label}: governance section`);
    for (const [marker, pattern] of GOVERNANCE_DETAIL_MARKERS) {
      if (pattern.test(pair.generated)) issues.push(`${pair.label}: ${marker}`);
    }
  }
  return issues;
}

/** @param {[string, string][]} edges */
function assertAcyclicEdges(edges) {  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const [from, to] of edges) {
    if (!graph.has(from)) graph.set(from, []);
    if (!graph.has(to)) graph.set(to, []);
    /** @type {string[]} */ (graph.get(from)).push(to);
  }
  /** @type {Map<string, number>} */
  const mark = new Map();
  const visit = (/** @type {string} */ node) => {
    const state = mark.get(node) ?? 0;
    if (state === 1) assert.fail(`permit order cycle reaches ${node}`);
    if (state === 2) return;
    mark.set(node, 1);
    for (const next of /** @type {string[]} */ (graph.get(node))) visit(next);
    mark.set(node, 2);
  };
  for (const node of graph.keys()) visit(node);
  return graph.size;
}

/** @param {string} source @param {string} label */
function runtimeStringList(source, label) {
  const patterns = {
    'public commands': /!\[((?:'[a-z-]+',\s*)*'[a-z-]+')\]\.includes\(command\)/,
    'transition modes': /assertEnum\(\s*\n?\s*mode,\s*\n?\s*\[([\s\S]*?)\],\s*\n?\s*'transition request\.mode'/,
  };
  const match = patterns[label].exec(source);
  assert.ok(match, `recovery.mjs declares its ${label}`);
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map((entry) => entry[1]);
}

test('T007 detailed autonomous learning governance lives only in the Work owner', () => {
  for (const relative of [GOVERNANCE_POLICY_OWNER, ...GOVERNANCE_POINTER_SURFACES]) {
    assert.equal(fs.statSync(path.join(ROOT, relative)).isFile(), true, relative);
  }
  assert.deepEqual(GOVERNANCE_POINTER_SURFACES, [...GOVERNANCE_POINTER_SURFACES].sort());
  assert.equal(GOVERNANCE_POINTER_SURFACES.includes(GOVERNANCE_POLICY_OWNER), false);

  const ownerSource = read(GOVERNANCE_POLICY_OWNER);
  const owner = markdownSection(ownerSource, GOVERNANCE_POLICY_SECTION);

  const headingOwners = [GOVERNANCE_POLICY_OWNER, ...GOVERNANCE_POINTER_SURFACES]
    .filter((relative) => visibleMarkdown(read(relative)).split('\n')
      .some((line) => line.trim() === GOVERNANCE_POLICY_SECTION));
  assert.deepEqual(headingOwners, [GOVERNANCE_POLICY_OWNER]);

  // Each duplication marker must be real policy the owner actually states.
  for (const [label, pattern] of GOVERNANCE_DETAIL_MARKERS) {
    assert.match(owner, pattern, `owner must state ${label}`);
  }

  const scanned = [
    ...GOVERNANCE_POINTER_SURFACES.map((relative) => [relative, visibleMarkdown(read(relative))]),
    ...GOVERNANCE_DOC_SECTIONS.map(([relative, heading]) => (
      [`${relative} ${heading}`, markdownSection(read(relative), heading)]
    )),
  ];
  for (const [label, content] of scanned) {
    for (const [marker, pattern] of GOVERNANCE_DETAIL_MARKERS) {
      assert.doesNotMatch(content, pattern, `${label} duplicates ${marker}`);
    }
  }

  // A pointer is one sentence. Growing or repeating it is duplication.
  for (const relative of GOVERNANCE_POINTER_SURFACES) {
    const pointers = sentences(visibleMarkdown(read(relative)))
      .filter((sentence) => /learning governance/i.test(sentence));
    assert.equal(pointers.length, 1, `${relative}: exactly one learning-governance pointer`);
    assert.ok(
      Buffer.byteLength(pointers[0], 'utf8') <= 260,
      `${relative}: pointer is ${Buffer.byteLength(pointers[0], 'utf8')} bytes (limit 260)`,
    );
  }
});

test('T007 autonomous disposition defers away from the generic reviewer with guarded parity intact', () => {
  const deferrals = [
    {
      relative: 'src/skills/dude-reviewer-protocol/SKILL.md',
      heading: '# Reviewer Protocol',
      ruleLine: 'For explicit autonomous Work, supply the grounded finding and occurrence evidence and defer every repeat-triggered disposition to `dude-work` learning governance. Guarded and non-Work disposition remains unchanged.',
    },
    {
      relative: 'src/skills/dude-receiving-code-review/SKILL.md',
      heading: '## Revision Procedure',
      ruleLine: 'For explicit autonomous Work, preserve the exact finding and attempt evidence and defer every repeat-triggered disposition to `dude-work` learning governance; guarded and non-Work revision behavior remains unchanged.',
    },
    {
      relative: 'src/agents/dude.agent.md',
      heading: '## Work',
      ruleLine: 'During explicit autonomous Work, preserve exact repeat evidence and defer every affected-target disposition to the learning governance owned by `dude-work`; guarded and non-Work disposition remains unchanged.',
    },
    {
      relative: 'src/instructions/dude.instructions.md',
      heading: '# Dude Shared Rules',
      ruleLine: '13. During explicit autonomous Work, preserve exact repeat evidence and defer every affected-target disposition to `dude-work` learning governance; guarded and non-Work behavior remains unchanged.',
    },
    {
      relative: 'src/skills/dude-lightweight-execution/SKILL.md',
      heading: '## Autonomous Work Lane Wrapper',
      ruleLine: 'The boundary freshly rereads `tasks.md`, `.dude/state/task-state.json`, and the unique owner idea, recomputes every binding and identity it was handed, and applies all three as one all-or-restored transaction. Every failure returns one closed result: a refusal that leaves all three surfaces byte-for-byte unchanged, or an indeterminate rollback that is a run-wide hard stop. `dude-work` owns the autonomous learning governance that decides when such a request may be made.',
    },
  ];

  for (const deferral of deferrals) {
    assertSectionRuleRejectsMutations(deferral.relative, deferral.heading, deferral.ruleLine);
    const section = markdownSection(read(deferral.relative), deferral.heading);
    assert.match(section, /`dude-work`[^\n]{0,96}learning governance|learning governance[^\n]{0,96}`dude-work`/i, deferral.relative);
  }

  // Guarded and non-Work parity is stated wherever governance is mentioned.
  for (const relative of GOVERNANCE_POINTER_SURFACES) {
    assert.match(
      visibleMarkdown(read(relative)),
      /guarded[^\n]{0,96}non-Work[^\n]{0,96}(?:unchanged|retain)/i,
      `${relative}: guarded and non-Work parity`,
    );
  }
  assert.match(
    markdownSection(read(GOVERNANCE_POLICY_OWNER), GOVERNANCE_POLICY_SECTION),
    /guarded[^\n]{0,96}non-Work[^\n]{0,96}(?:unchanged|retain)/i,
    `${GOVERNANCE_POLICY_OWNER}: guarded and non-Work parity`,
  );

  // The reviewer never regains autonomous repeat disposition.
  for (const relative of ['src/skills/dude-reviewer-protocol/SKILL.md', 'src/agents/dude-reviewer.agent.md']) {
    assert.doesNotMatch(
      visibleMarkdown(read(relative)),
      /reviewer[^\n]{0,96}(?:decides|applies|owns|retains)[^\n]{0,96}autonomous[^\n]{0,64}disposition/i,
      relative,
    );
  }
});

test('T007 the Work owner states every governed ordering, scope, and evidence rule', () => {
  const owner = markdownSection(read(GOVERNANCE_POLICY_OWNER), GOVERNANCE_POLICY_SECTION);
  const failures = [
    ...missingParagraphRequirements(owner, [
      ['sole detailed owner and pointer-only peers', [
        [/sole detailed owner/i, /repeat-triggered learning governance/i],
        [/authority/i, /deferral/i, /evidence/i, /wrapper-use/i, /pointer/i],
      ]],
      ['no new lane, store, ledger, or command', [
        [/(?:no lane|no[^\n]{0,32}lane)/i, /no[^\n]{0,32}(?:persistent )?store/i, /no second ledger/i, /no user-facing command/i],
      ]],
      ['all six public routes stay runtime-only', [
        [/`inspect`/, /`authorize`/, /`complete`/, /`learn`/, /`transition`/, /`audit`/, /runtime/i, /only/i],
      ]],
      ['retention-first completion', [
        [/retention/i, /first/i],
        [/`pendingCompletion`/, /hash-only/i, /`learningGovernance`/, /`required`/],
        [/before[^\n]{0,80}(?:admitted|finalized)/i],
        [
          /never overwrite/i,
          /occupied[^\n]{0,64}`learning-governance-conflict`/i,
          /conflicting[^\n]{0,64}`occurrence-retention-conflict`/i,
          /`learning-governance-capacity`[^\n]{0,64}reserved[^\n]{0,64}failed-approach/i,
        ],
      ]],
      ['trusted source evidence only', [
        [/trusted source evidence/i, /Inspection source mechanism/i, /caller cannot submit/i],
        [/stale/i, /partial/i, /duplicate/i, /conflicting/i, /wrong-target/i, /wrong-authority/i, /reject/i],
        [/normalized basis/i, /failure class/i, /check definition/i],
        [/distinct valid occurrences/i, /equal full occurrence identities do not/i],
      ]],
      ['unresolved seal blocks affected-target disposition', [
        [/refuse another attempt/i, /escalation/i, /no-progress/i, /block/i, /close/i, /resolving status/i],
        [/authorizes no[^\n]{0,80}(?:alternative|controlled end)/i],
      ]],
      ['bounded projection batches verified on both surfaces', [
        [/one bounded batch/i, /17 events/, /exactly one approach event/i, /sixteen finding events/i],
        [/current-run evidence/i, /authoritative lane history/i, /(?:reacquire|verify)/i],
        [/missing/i, /one-sided/i, /stale/i, /conflicting/i, /unresolved/i, /blocks/i],
      ]],
      ['complete failed-approach comparison', [
        [/complete failed-approach set/i, /rather than the most recent attempt/i],
        [/deterministic identity/i, /material difference/i, /discriminating check/i],
        [/disguised repetition/i, /never materially different/i],
        [/no credible alternative/i, /`no-progress-verified`/],
      ]],
      ['fixed acyclic permit order', [
        [/permit order/i, /acyclic/i, /no route returns to an earlier phase/i],
        [/`projected`/, /no permit/i, /no controlled end/i],
      ]],
      ['lane mutation only through the lane Work boundary', [
        [/lane mutation/i, /Work boundary/i, /permit/i, /receipt/i],
        [/never mutates a lane/i, /ordinary CLI/i, /direct edit/i],
        [/Lightweight and tracked/i, /ambiguous tracked mapping/i, /fails closed/i],
      ]],
      ['scoped halts and budgets', [
        [/target-scoped hard stop/i, /per-target recovery budget/i, /that target alone/i, /no unrelated scheduling authority/i],
        [/run-wide/i, /overall budget/i, /stops the invocation/i],
        [/no halt/i, /clears/i, /controlled-end authority/i],
      ]],
      ['sequential disjoint scheduling without concurrency', [
        [/scheduling stays sequential/i],
        [/suspended unchanged/i, /dependency and change-set rules/i, /disjoint and independent/i],
        [/scheduler action/i, /not a target disposition/i],
        [/no concurrent/i, /one at a time/i],
        [/never revisited/i, /new distinguishing evidence/i, /materially different alternative/i],
      ]],
      ['controlled unresolved end eligibility', [
        [/`transition controlled-end`/, /`alternative-inspected`/, /before attempt-permit issuance/i],
        [/`no-progress-verified`/, /before the lane no-progress disposition/i],
        [/branch for audit/i, /pending and unchanged/i, /authorizes no attempt/i],
        [/immediate halt end/i, /no controlled-end permit, mutation, record, or receipt/i],
      ]],
      ['resume restores or re-derives before any transition', [
        [/`transition resume-governance`/, /(?:restores|re-derives)/i, /before any normal transition/i],
        [/exact captured basis/i, /chronology/i, /existing history/i],
        [/neither safely retained nor deterministically re-derivable/i, /stop/i],
      ]],
      ['conditional audit over existing history', [
        [/`audit`/, /current-run/i, /lane history/i, /never a second store/i],
        [/always reports/i, /affected target/i, /governance status/i, /invocation outcome/i],
        [/conditional/i, /resolved alternative/i, /resolved no-progress/i, /immediate halt end/i, /controlled end/i],
        [/no audit claims/i, /target completion/i],
      ]],
      ['objective independence', [
        [/objective/i, /no objective/i, /never invents an objective/i],
      ]],
    ]),
    ...staleRecoveryPhrases(owner),
  ];
  assert.deepEqual(failures, [], `${GOVERNANCE_POLICY_OWNER} ${GOVERNANCE_POLICY_SECTION}`);
});

test('T007 the documented permit order is acyclic and matches the runtime routes', () => {
  assert.equal(assertAcyclicEdges(GOVERNANCE_PERMIT_EDGES), 9);
  assert.throws(
    () => assertAcyclicEdges([...GOVERNANCE_PERMIT_EDGES, ['`transition commit-lane-receipt`', '`learn`']]),
    /permit order cycle/,
    'the acyclicity check must reject a back edge',
  );

  const owner = markdownSection(read(GOVERNANCE_POLICY_OWNER), GOVERNANCE_POLICY_SECTION);
  const firstIndex = (/** @type {string} */ token) => {
    const index = owner.indexOf(token);
    assert.notEqual(index, -1, `owner documents ${token}`);
    return index;
  };
  for (const [earlier, later] of GOVERNANCE_PERMIT_EDGES) {
    assert.ok(
      firstIndex(earlier) < firstIndex(later),
      `owner documents ${earlier} before ${later}`,
    );
  }

  const runtime = read('src/skills/dude-work/recovery.mjs');
  assert.deepEqual(runtimeStringList(runtime, 'public commands'), GOVERNANCE_PUBLIC_COMMANDS);
  const modes = runtimeStringList(runtime, 'transition modes');
  const documentedModes = [...new Set(GOVERNANCE_PERMIT_EDGES.flat())]
    .filter((token) => token.startsWith('`transition '))
    .map((token) => token.slice('`transition '.length, -1))
    .sort();
  assert.deepEqual(
    documentedModes.filter((mode) => modes.includes(mode)),
    documentedModes,
    'every documented transition route is a real runtime mode',
  );
  for (const command of GOVERNANCE_PUBLIC_COMMANDS) {
    assert.ok(owner.includes(`\`${command}\``), `owner names the public \`${command}\` route`);
  }
});

test('T007 governance introduces no user-facing command and no new grammar', () => {
  const surfaces = [
    GOVERNANCE_POLICY_OWNER,
    ...GOVERNANCE_POINTER_SURFACES,
    ...PUBLIC_DOC_FILES,
  ];
  for (const relative of surfaces) {
    const content = read(relative);
    for (const forbidden of FORBIDDEN_USER_COMMANDS) {
      assert.equal(content.includes(forbidden), false, `${relative} presents ${forbidden}`);
    }
  }

  for (const relative of [GOVERNANCE_POLICY_OWNER, 'docs/commands.md']) {
    assert.deepEqual(
      read(relative).split('\n').filter((line) => line.startsWith('@dude work [')),
      [WORK_GRAMMAR_LINE],
      `${relative} keeps the exact unchanged Work grammar`,
    );
  }

  const grammarFlags = [...new Set(
    [...WORK_GRAMMAR_LINE.matchAll(/--[a-z][a-z-]*/g)].map((entry) => entry[0]),
  )].sort();
  assert.deepEqual(
    grammarFlags,
    ['--max', '--parallel', '--policy', '--recover-on-block', '--recovery-cycles', '--until'],
  );
  const proseFlags = [
    ...markdownSection(read(GOVERNANCE_POLICY_OWNER), '## Grammar And Limits').matchAll(/--[a-z][a-z-]*/g),
    ...markdownSection(read('docs/commands.md'), '### `@dude work`').matchAll(/^- `(--[a-z][a-z-]*)/gm),
  ].map((entry) => entry[1] ?? entry[0]);
  assert.ok(proseFlags.length >= grammarFlags.length, 'both surfaces document the Work flags');
  for (const flag of proseFlags) {
    assert.ok(grammarFlags.includes(flag), `undeclared Work flag ${flag}`);
  }
  for (const flag of grammarFlags) {
    assert.ok(proseFlags.includes(flag), `undocumented Work flag ${flag}`);
  }
});

test('T007 governed scheduling never broadens to concurrency', () => {
  assert.deepEqual(
    concurrencyGrants('Work may run two proven disjoint targets concurrently.'),
    ['Work may run two proven disjoint targets concurrently.'],
    'the concurrency scan must catch a permissive sentence',
  );
  assert.deepEqual(
    concurrencyGrants('Nothing is fanned out.\n2. two disjoint targets may run concurrently.'),
    ['2. two disjoint targets may run concurrently.'],
    'a digit-led list item starts its own sentence, so no neighbouring denial exonerates it',
  );

  const scanned = [
    [GOVERNANCE_POLICY_OWNER, markdownSection(read(GOVERNANCE_POLICY_OWNER), GOVERNANCE_POLICY_SECTION)],
    ...GOVERNANCE_POINTER_SURFACES.map((relative) => [relative, visibleMarkdown(read(relative))]),
    ...GOVERNANCE_DOC_SECTIONS.map(([relative, heading]) => {
      const governance = markdownSection(read(relative), heading)
        .split(/\n\s*\n/)
        .filter((paragraph) => /requires learning/i.test(paragraph));
      assert.equal(governance.length, 1, `${relative} ${heading}: one governance paragraph`);
      return [`${relative} ${heading}`, governance[0]];
    }),
  ];
  for (const [label, content] of scanned) {
    assert.deepEqual(concurrencyGrants(content), [], `${label} grants concurrency`);
  }
});

test('T007 generated core carries no governance content outside a complete materialization', () => {
  // Self-proof: governance content in a non-parity generated file is reported,
  // and exact parity reports nothing. Parity cannot distinguish the sanctioned
  // T009 materialization from an early one, so this scan does not claim to.
  const probe = [
    { label: 'probe-untouched', source: 'source-a', generated: 'stale-a' },
    {
      label: 'probe-handcopied',
      source: 'source-b',
      generated: `${GOVERNANCE_POLICY_SECTION}\n\nbind one exact affected target in \`learningGovernance\` at \`required\`.`,
    },
  ];
  assert.deepEqual(governanceInGeneratedCoreIssues(probe), [
    'probe-handcopied: governance section',
    'probe-handcopied: governance state fields',
  ]);
  assert.deepEqual(
    governanceInGeneratedCoreIssues(probe.map((pair) => ({ ...pair, generated: pair.source }))),
    [],
  );

  assert.equal(new Set(GENERATED_CORE_PAIRS.map(([, generated]) => generated)).size, GENERATED_CORE_PAIRS.length);
  for (const [source, generated] of GENERATED_CORE_PAIRS) {
    assert.equal(fs.statSync(path.join(ROOT, source)).isFile(), true, source);
    assert.equal(fs.statSync(path.join(ROOT, generated)).isFile(), true, generated);
  }
  assert.deepEqual(
    governanceInGeneratedCoreIssues(GENERATED_CORE_PAIRS.map(([source, generated]) => ({
      label: generated,
      source: read(source),
      generated: read(generated),
    }))),
    [],
  );

  // Every governance assertion above reads source, never generated core.
  for (const relative of [GOVERNANCE_POLICY_OWNER, ...GOVERNANCE_POINTER_SURFACES]) {
    assert.equal(relative.startsWith('src/'), true, relative);
  }
});

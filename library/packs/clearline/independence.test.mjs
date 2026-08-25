// @ts-check
// Clearline authoring-only independence and canonical-validator checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packRoot = fileURLToPath(new URL('./', import.meta.url));
const packPath = path.join(packRoot, 'pack.md');
const agentPath = path.join(
  packRoot,
  'agents',
  'dude-pack-clearline-stylist.agent.md',
);
const skillRoot = path.join(packRoot, 'skills', 'dude-pack-clearline-visual');
const skillPath = path.join(skillRoot, 'SKILL.md');
const promptPath = path.join(
  packRoot,
  'prompts',
  'dude-pack-clearline-apply-visual-system.prompt.md',
);
const instructionsPath = path.join(packRoot, 'instructions');
const cssPath = path.join(skillRoot, 'tokens', 'clearline.css');
const scssPath = path.join(skillRoot, 'tokens', 'clearline.scss');
const tailwindPath = path.join(skillRoot, 'tokens', 'tailwind.preset.cjs');
const validatorPath = path.join(skillRoot, 'scripts', 'validate.mjs');
const bashCheckerPath = path.join(skillRoot, 'scripts', 'style-check.sh');
const powerShellCheckerPath = path.join(skillRoot, 'scripts', 'style-check.ps1');
const legacyTailwindPreset = `tailwind.preset.${'js'}`;
const retiredAccent = `--cl-${'yel' + 'low'}`;
const retiredMarkSizeAttribute = `data-cl-mark-${'size'}`;

const expectedFiles = [
  'agents/dude-pack-clearline-stylist.agent.md',
  'independence.test.mjs',
  'pack.md',
  'prompts/dude-pack-clearline-apply-visual-system.prompt.md',
  'skills/dude-pack-clearline-visual/README.md',
  'skills/dude-pack-clearline-visual/SKILL.md',
  'skills/dude-pack-clearline-visual/examples/button-styles.html',
  'skills/dude-pack-clearline-visual/examples/header-footer.html',
  'skills/dude-pack-clearline-visual/examples/placeholder-mark.svg',
  'skills/dude-pack-clearline-visual/examples/themed-page.html',
  'skills/dude-pack-clearline-visual/reference/brand-mark.md',
  'skills/dude-pack-clearline-visual/reference/colors.md',
  'skills/dude-pack-clearline-visual/reference/layout-and-iconography.md',
  'skills/dude-pack-clearline-visual/reference/sources.md',
  'skills/dude-pack-clearline-visual/reference/typography.md',
  'skills/dude-pack-clearline-visual/scripts/style-check.ps1',
  'skills/dude-pack-clearline-visual/scripts/style-check.sh',
  'skills/dude-pack-clearline-visual/scripts/validate.mjs',
  'skills/dude-pack-clearline-visual/tokens/clearline-tokens.json',
  'skills/dude-pack-clearline-visual/tokens/clearline.css',
  'skills/dude-pack-clearline-visual/tokens/clearline.scss',
  'skills/dude-pack-clearline-visual/tokens/tailwind.preset.cjs',
].sort();

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(absolute);
    return [path.relative(packRoot, absolute).split(path.sep).join('/')];
  });
}

function frontmatterOf(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'missing YAML frontmatter');
  return match[1];
}

function descriptionField(text) {
  const lines = frontmatterOf(text).split('\n');
  const start = lines.findIndex((line) => /^description:/.test(line));
  assert.notEqual(start, -1, 'missing frontmatter description');
  const collected = [lines[start].replace(/^description:[ \t]*/, '')];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] === '' || /^\s/.test(lines[index])) collected.push(lines[index]);
    else break;
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

function sectionBetween(content, start, end) {
  const startIndex = content.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section after ${start}: ${end}`);
  return content.slice(startIndex, endIndex).replace(/\s+/g, ' ').trim();
}

function localMarkdownLinks(text) {
  return [...text.matchAll(/\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1])
    .filter((destination) => {
      const target = destination.split('#', 1)[0];
      return target
        && !target.startsWith('/')
        && !target.startsWith('http:')
        && !target.startsWith('https:')
        && !target.startsWith('mailto:');
    })
    .map((destination) => destination.split('#', 1)[0]);
}

function htmlAttribute(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attributes.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(["'])([^"']*)\\1`, 'i'),
  );
  return match?.[2] ?? null;
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `node ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
  );
  return result.stdout;
}

const pack = fs.readFileSync(packPath, 'utf8');
const agent = fs.readFileSync(agentPath, 'utf8');
const skill = fs.readFileSync(skillPath, 'utf8');
const prompt = fs.readFileSync(promptPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const scss = fs.readFileSync(scssPath, 'utf8');
const bashChecker = fs.readFileSync(bashCheckerPath, 'utf8');
const powerShellChecker = fs.readFileSync(powerShellCheckerPath, 'utf8');
const activationSurfaces = [
  { name: 'agent description', text: descriptionField(agent) },
  { name: 'skill description', text: descriptionField(skill) },
  {
    name: 'skill "When to use this skill"',
    text: sectionBetween(skill, '## When to use this skill', '## Workflow'),
  },
];

test('the Clearline tree contains exactly the intended 22 files', () => {
  assert.deepEqual(filesBelow(packRoot).sort(), expectedFiles);
});

test('the manifest provides only the namespaced agent, skill, and prompt', () => {
  const frontmatter = frontmatterOf(pack);
  const providesBlock = frontmatter.slice(frontmatter.indexOf('provides:'));

  assert.match(frontmatter, /^name: clearline$/m);
  assert.match(frontmatter, /^use-cases: \[ui, visual-design]$/m);
  assert.match(providesBlock, /dude-pack-clearline-stylist/);
  assert.match(providesBlock, /dude-pack-clearline-visual/);
  assert.match(
    providesBlock,
    /dude-pack-clearline-apply-visual-system\.prompt\.md/,
  );
  assert.equal(fs.existsSync(promptPath), true, 'the provided prompt must exist');
});

test('no ambient instruction directory or instruction artifact ships with Clearline', () => {
  const frontmatter = frontmatterOf(pack);
  const instructionArtifacts = filesBelow(packRoot)
    .filter((file) => file.endsWith('.instructions.md'));

  assert.equal(
    fs.existsSync(instructionsPath),
    false,
    'an ambient instructions directory must not exist',
  );
  assert.deepEqual(
    instructionArtifacts,
    [],
    'no instruction artifact may claim generic visual globs',
  );
  assert.doesNotMatch(
    frontmatter,
    /^[ \t]*instructions:/m,
    'the manifest must not provide instructions',
  );
});

test('shipped artifacts name no sibling package or source-repository anecdote', () => {
  const prohibited = [
    {
      label: 'non-Clearline Dude pack handle',
      expression: /\bdude-pack-(?!clearline(?:\b|-))/i,
    },
    { label: 'Strata', expression: /\bstrata\b/i },
    { label: 'diagram package', expression: /\bdiagram-design\b/i },
    { label: 'Hugo', expression: /\bhugo\b/i },
    { label: 'Docsy', expression: /\bdocsy\b/i },
    { label: 'source mark path', expression: /\/brand\//i },
    { label: 'source monogram', expression: /\begc\b/i },
  ];
  const shippedFiles = filesBelow(packRoot)
    .filter((file) => file !== 'independence.test.mjs');
  const hits = [];

  for (const relative of shippedFiles) {
    const text = fs.readFileSync(path.join(packRoot, relative), 'utf8');
    for (const { label, expression } of prohibited) {
      if (expression.test(text)) hits.push(`${relative}: ${label}`);
    }
  }

  assert.deepEqual(hits, [], `prohibited reference(s) found: ${hits.join(', ')}`);
});

test('activation surfaces require explicit Clearline identity or evidence', () => {
  const explicitTriggers = [
    'apply clearline',
    'clearline tokens',
    '--cl-',
    'existing clearline surface',
  ];
  const genericRoutingPhrases = [
    /use the house style/i,
    /theme this page/i,
    /make this look clean and consistent/i,
    /add our logo to the header/i,
    /theme a (?:react|html|markdown|slide)/i,
    /audit an existing page against a single coherent visual identity/i,
  ];

  for (const { name, text } of activationSurfaces) {
    const lower = text.toLowerCase();
    const missing = explicitTriggers.filter((trigger) => !lower.includes(trigger));
    assert.deepEqual(
      missing,
      [],
      `${name} is missing explicit Clearline trigger(s): ${missing.join(', ')}`,
    );
    for (const expression of genericRoutingPhrases) {
      assert.doesNotMatch(
        text,
        expression,
        `${name} retains a generic visual routing phrase`,
      );
    }
  }
});

test('local links, skill name, and coordinator-only agent boundary remain coherent', () => {
  const skillFrontmatter = frontmatterOf(skill);
  const coordinatorOnly = [
    '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state',
    'glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`,',
    '`<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report',
    'changes back to `@dude` instead.',
  ].join('\n');

  assert.match(skillFrontmatter, /^name: dude-pack-clearline-visual$/m);
  assert.match(agent, /^## Scope$/m);
  assert.ok(
    agent.trimEnd().endsWith(coordinatorOnly),
    'the agent must end with the canonical coordinator-only paragraph',
  );

  for (const relative of filesBelow(packRoot).filter((file) => file.endsWith('.md'))) {
    const absolute = path.join(packRoot, relative);
    const text = fs.readFileSync(absolute, 'utf8');
    for (const destination of localMarkdownLinks(text)) {
      const target = path.resolve(path.dirname(absolute), destination);
      assert.equal(
        fs.existsSync(target),
        true,
        `${relative} links to a missing local destination: ${destination}`,
      );
    }
  }
});

test('the agent reports command-based verification instead of claiming shell access', () => {
  assert.doesNotMatch(frontmatterOf(agent), /\bexecute\b/i);
  assert.match(agent, /Do not claim to run shell checks\./);
  assert.match(
    agent,
    /report\s+the\s+applicable\s+folder-local\s+checker\s+command/i,
  );
});

test('thin wrappers delegate to one canonical validator and declare no-argument usage', () => {
  for (const [label, checker] of [
    ['Bash checker', bashChecker],
    ['PowerShell checker', powerShellChecker],
  ]) {
    assert.match(checker, /validate\.mjs/, `${label} must invoke the canonical validator`);
    assert.doesNotMatch(checker, /caller-|Target|Select-String|grep|@'|const fs/i);
  }
  assert.match(bashChecker, /if \[ "\$#" -ne 0 \]/);
  assert.match(powerShellChecker, /\$args\.Count -ne 0/);
});

test('the canonical validator reports its finite parity scope and contrast evidence', () => {
  const output = runNode([validatorPath]);

  assert.match(output, /Checked parity scope: semantic fills and links; light\/dark Clearline surfaces; control borders; focus ring\/halo roles;/);
  assert.match(output, /Checked examples: no raw hex\/rgb\/rgba in color declarations/);
  assert.match(output, /Contrast report:/);
  assert.match(output, /control border light \/ #FFFFFF: 4\.54:1/);
  assert.match(
    output,
    /Checked themed page interactions: two local action links target existing sections; no button or form controls\./,
  );
  assert.match(output, /OK: Clearline canonical validation passed\./);
});

test('the copied CommonJS Tailwind preset loads from an isolated type-module project', () => {
  const temporaryProject = fs.mkdtempSync(path.join(os.tmpdir(), 'clearline-esm-'));

  try {
    fs.writeFileSync(
      path.join(temporaryProject, 'package.json'),
      `${JSON.stringify({ type: 'module' })}\n`,
    );
    fs.copyFileSync(
      tailwindPath,
      path.join(temporaryProject, 'tailwind.preset.cjs'),
    );
    const configPath = path.join(temporaryProject, 'tailwind.config.cjs');
    fs.writeFileSync(
      configPath,
      [
        'const preset = require("./tailwind.preset.cjs");',
        'const extension = preset.theme.extend;',
        'console.log(JSON.stringify({',
        '  primaryBackground: extension.colors.cl["primary-bg"],',
        '  focusHalo: extension.colors.cl["focus-halo"],',
        '  defaultControlHeight: extension.height["cl-control-default"],',
        '}));',
      ].join('\n'),
    );

    assert.deepEqual(
      JSON.parse(runNode([configPath], { cwd: temporaryProject })),
      {
        primaryBackground: '#0067B8',
        focusHalo: '#FFFFFF',
        defaultControlHeight: '40px',
      },
    );
  } finally {
    fs.rmSync(temporaryProject, { recursive: true, force: true });
  }
});

test('unused tab and SCSS map APIs stay absent', () => {
  assert.doesNotMatch(css, /\.cl-docs-tabs\b|\.cl-docs-tab\b|\[role="tab(?:list)?"]/);
  assert.doesNotMatch(scss, /\$cl-colors\s*:/);
});

test('the retired mark-size data attribute stays absent from shipped artifacts', () => {
  const hits = filesBelow(packRoot)
    .filter((file) => file !== 'independence.test.mjs')
    .filter((file) => fs.readFileSync(path.join(packRoot, file), 'utf8')
      .includes(retiredMarkSizeAttribute));

  assert.deepEqual(hits, [], `retired mark-size data attribute found: ${hits.join(', ')}`);
});

test('examples demonstrate paired mark variants and accessible names', () => {
  const headerFooter = fs.readFileSync(
    path.join(skillRoot, 'examples', 'header-footer.html'),
    'utf8',
  );
  const themedPage = fs.readFileSync(
    path.join(skillRoot, 'examples', 'themed-page.html'),
    'utf8',
  );
  const svg = fs.readFileSync(
    path.join(skillRoot, 'examples', 'placeholder-mark.svg'),
    'utf8',
  );

  assert.match(headerFooter, /class="cl-lockup"/);
  assert.match(headerFooter, /class="cl-lockup cl-lockup--compact"/);
  assert.match(headerFooter, /class="cl-lockup cl-lockup--hero"/);
  assert.match(
    headerFooter,
    /class="cl-lockup cl-lockup--hero"[\s\S]*?role="img" aria-label="Project name"/,
  );
  assert.match(
    headerFooter,
    /class="cl-lockup">[\s\S]*?class="cl-mark"[\s\S]*?aria-hidden="true"[\s\S]*?class="cl-wordmark">Project name/,
  );
  assert.match(themedPage, /class="cl-lockup cl-lockup--compact"/);
  assert.doesNotMatch(`${headerFooter}\n${themedPage}`, /--cl-mark-size:\s*var\(/);
  assert.match(svg, /^<svg\b[^>]*xmlns=/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('the themed page has only honest local action links', () => {
  const themedPage = fs.readFileSync(
    path.join(skillRoot, 'examples', 'themed-page.html'),
    'utf8',
  );
  const ids = new Set(
    [...themedPage.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)]
      .map((match) => match[2]),
  );
  const controls = [
    ...themedPage.matchAll(/<(a|button|input|select|textarea|form)\b([^>]*)>/gi),
  ];

  assert.equal(controls.length, 2, 'the themed page should contain two local action links');
  const hrefs = controls.map(([, tag, attributes]) => {
    assert.equal(tag.toLowerCase(), 'a', `themed page retains an interactive ${tag}`);
    const href = htmlAttribute(attributes, 'href');
    assert.match(href ?? '', /^#[A-Za-z][\w-]*$/, 'themed-page link must use a local fragment');
    const target = href?.slice(1) ?? '';
    assert.equal(ids.has(target), true, `themed-page link targets missing section #${target}`);
    return href;
  });

  assert.deepEqual(hrefs, ['#color-roles', '#typography']);
});

test('documentation retains the stated spacing, color, radius, and weight policy', () => {
  const shippedText = filesBelow(packRoot)
    .filter((file) => file !== 'independence.test.mjs')
    .map((file) => fs.readFileSync(path.join(packRoot, file), 'utf8'))
    .join('\n');
  const colorReference = fs.readFileSync(
    path.join(skillRoot, 'reference', 'colors.md'),
    'utf8',
  );
  const layoutReference = fs.readFileSync(
    path.join(skillRoot, 'reference', 'layout-and-iconography.md'),
    'utf8',
  );
  const markReference = fs.readFileSync(
    path.join(skillRoot, 'reference', 'brand-mark.md'),
    'utf8',
  );

  assert.doesNotMatch(shippedText, /\b700\b|\bELI5\b|—/);
  assert.match(colorReference, /gray is a neutral support color, not a fifth accent/i);
  assert.match(colorReference, /--cl-orange/);
  assert.doesNotMatch(colorReference, new RegExp(retiredAccent));
  assert.match(layoutReference, /8-point grid with 4-point half steps/i);
  assert.match(layoutReference, /--cl-radius-lg` for `\.cl-card`/i);
  assert.match(layoutReference, /40 px outer height for\s+`\.cl-btn` and `\.cl-input`/);
  assert.match(markReference, /combined lockup/i);
  assert.match(markReference, /declared 24 px mark\s+is 24 px at its outer edge/i);
  assert.match(shippedText, /tailwind\.preset\.cjs/);
  assert.doesNotMatch(shippedText, new RegExp(legacyTailwindPreset.replaceAll('.', '\\.')));
});

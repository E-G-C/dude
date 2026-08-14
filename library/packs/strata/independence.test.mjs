// @ts-check
// Feature 032 T002 regression: Strata is an explicit-only, independent visual
// system. This pack-root file (not declared in `provides`, so not projected)
// pins the *independence* contract for the strata pack:
//   - the ambient always-on instruction is deleted and unlisted in the manifest;
//   - the agent + skill activate only on explicit Strata identity or existing
//     Strata evidence, never on generic visual phrasing;
//   - the narrowing bans only the FULL generic routing phrases inside the
//     activation surfaces (frontmatter `description` + the skill's "When to use
//     this skill" section), never the bare Strata vocabulary that stays
//     legitimate in the substantive body;
//   - the pack/agent/skill reference the design lane by no identity/handle/
//     phrase, while generic "design system" disclaimers remain allowed;
//   - the prompt stays provided and no dependency / new provides key appears.
// The substantive Strata rules/reference/token/validator body is intentionally
// left intact and unchecked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Robust, file-relative reads so the regression travels with the pack subtree.
const packPath = fileURLToPath(new URL('./pack.md', import.meta.url));
const agentPath = fileURLToPath(
  new URL('./agents/dude-pack-strata-stylist.agent.md', import.meta.url),
);
const skillPath = fileURLToPath(
  new URL('./skills/dude-pack-strata-visual/SKILL.md', import.meta.url),
);
const promptPath = fileURLToPath(
  new URL('./prompts/dude-pack-strata-apply-visual-system.prompt.md', import.meta.url),
);
const instructionPath = fileURLToPath(
  new URL('./instructions/dude-pack-strata-visual-system.instructions.md', import.meta.url),
);

const pack = fs.readFileSync(packPath, 'utf8');
const agent = fs.readFileSync(agentPath, 'utf8');
const skill = fs.readFileSync(skillPath, 'utf8');

// Collapse whitespace so prose assertions survive harmless line re-wrapping.
const flat = (text) => text.replace(/\s+/g, ' ').trim();

function frontmatterOf(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, 'missing YAML frontmatter');
  return m[1];
}

// Extract *only* the frontmatter `description` value — an inline quoted string
// or an indented multi-line block scalar — flattened. Never reads the body, so
// the routing-phrase ban below cannot reach the substantive rules.
function descriptionField(text) {
  const lines = frontmatterOf(text).split('\n');
  const start = lines.findIndex((l) => /^description:/.test(l));
  assert.notEqual(start, -1, 'missing frontmatter description');
  const collected = [lines[start].replace(/^description:[ \t]*/, '')];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '' || /^\s/.test(lines[i])) collected.push(lines[i]);
    else break; // a non-indented line is the next top-level key
  }
  return flat(collected.join(' '));
}

function sectionBetween(content, start, end) {
  const startIndex = content.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section after ${start}: ${end}`);
  return content.slice(startIndex, endIndex);
}

// The three activation surfaces the narrowing governs — and the *only* places
// the explicit-trigger and generic-routing-phrase checks apply. The substantive
// body (Strata rules, reference, tokens, validator) is deliberately out of scope.
const agentDescription = descriptionField(agent);
const skillDescription = descriptionField(skill);
const skillWhenToUse = flat(sectionBetween(skill, '## When to use this skill', '## Workflow'));
const activationSurfaces = [
  { name: 'agent description', text: agentDescription },
  { name: 'skill description', text: skillDescription },
  { name: 'skill "When to use this skill"', text: skillWhenToUse },
];

test('the ambient Strata instruction is deleted and the manifest lists no instructions entry', () => {
  // Arrange
  const frontmatter = frontmatterOf(pack);

  // Act / Assert — the always-on rules artifact is gone on disk ...
  assert.equal(
    fs.existsSync(instructionPath),
    false,
    'ambient instruction dude-pack-strata-visual-system.instructions.md must not exist',
  );

  // ... and `provides` no longer declares an `instructions:` entry.
  assert.doesNotMatch(
    frontmatter,
    /^[ \t]*instructions:/m,
    'pack.md provides must not list an instructions entry',
  );
});

test('the prompt stays provided and no dependency or new provides key is introduced', () => {
  // Arrange — read the `provides` block (the last frontmatter key).
  const frontmatter = frontmatterOf(pack);
  const providesBlock = frontmatter.slice(frontmatter.indexOf('provides:'));
  const provideKinds = [...providesBlock.matchAll(/^  ([a-z][\w-]*):/gm)]
    .map((m) => m[1])
    .sort();

  // Assert — the prompt remains provided, both in the manifest and on disk.
  assert.match(providesBlock, /dude-pack-strata-apply-visual-system\.prompt\.md/);
  assert.equal(fs.existsSync(promptPath), true, 'the apply-visual-system prompt must still exist');

  // Assert — `provides` declares exactly the pre-existing artifact kinds; the
  // only change is the *removal* of instructions. No registry/adapter/discovery/
  // schema provides key is added (YAGNI), and no cross-pack dependency is declared.
  assert.deepEqual(provideKinds, ['agents', 'prompts', 'skills']);
  assert.doesNotMatch(
    frontmatter,
    /^[ \t]*requires:/m,
    'no cross-pack dependency may be introduced',
  );
});

test('the agent and skill activation surfaces advertise explicit Strata identity/evidence triggers', () => {
  // Arrange — explicit-Strata triggers: identity (name, tokens, named palettes)
  // and evidence (an existing Strata surface). Matched case-insensitively, so
  // wording case ("apply Strata" vs "Apply Strata") does not matter.
  const explicitTriggers = [
    'apply strata',
    'use the strata tokens',
    '--strata-',
    'switch to the spectrum palette',
    'use the pigment palette',
    'existing strata surface',
  ];

  // Act / Assert — every activation surface carries every explicit trigger.
  for (const { name, text } of activationSurfaces) {
    const hay = text.toLowerCase();
    const missing = explicitTriggers.filter((t) => !hay.includes(t));
    assert.deepEqual(
      missing,
      [],
      `${name} is missing explicit Strata trigger(s): ${missing.join(', ')}`,
    );
  }
});

test('the activation surfaces reject the full generic routing phrases', () => {
  // Arrange — the FULL generic routing phrases T002 removes (both wording
  // variants each). These are multi-word phrases, never bare tokens: banning
  // "put this on the spacing scale" must not touch a legitimate "spacing scale".
  const genericRoutingPhrases = [
    { label: 'theme this app', re: /theme this app/i },
    { label: 'style this chart', re: /style this chart/i },
    { label: 'pick colours for these data series', re: /pick colou?rs for these data series/i },
    { label: 'add a / give this a dark theme', re: /(?:add a|give this a) dark theme/i },
    { label: 'put this on the spacing scale', re: /put this on the spacing scale/i },
    { label: 'fix (the) contrast', re: /fix (?:the )?contrast/i },
    { label: 'fix (the) focus rings', re: /fix (?:the )?focus rings/i },
    { label: 'make this less rounded', re: /make this less rounded/i },
    { label: 'get rid of / remove these drop shadows', re: /(?:get rid of|remove) these drop shadows/i },
  ];

  // Act — collect every full routing phrase surviving in any activation surface.
  const hits = [];
  for (const { name, text } of activationSurfaces) {
    for (const { label, re } of genericRoutingPhrases) {
      if (re.test(text)) hits.push(`${name}: "${label}"`);
    }
  }

  // Assert — none survives.
  assert.deepEqual(hits, [], `generic routing phrase(s) still select Strata: ${hits.join(', ')}`);
});

test('the narrowing bans only full routing phrases — bare Strata vocabulary stays legitimate', () => {
  // Assert — the bare tokens live *inside* a scanned activation surface (the
  // skill description reads "no drop shadows", "4/8 spacing", "WCAG contrast",
  // "radius ceiling"), proving the phrase ban above is phrase-scoped, not a
  // token ban. A future over-correction that stripped them would fail here.
  for (const bare of ['drop shadows', 'spacing', 'contrast', 'radius']) {
    assert.ok(
      skillDescription.toLowerCase().includes(bare),
      `skill description should retain the bare token "${bare}"`,
    );
  }

  // Assert — the substantive agent body (rules/principles, out of scope for the
  // narrowing) keeps the bare visual vocabulary untouched and unbanned.
  const agentBody = agent.replace(/^---\n[\s\S]*?\n---/, '');
  for (const bare of ['contrast', 'focus', 'spacing', 'radius', 'shadow']) {
    assert.match(agentBody, new RegExp(`\\b${bare}`, 'i'), `agent body should keep bare "${bare}"`);
  }
});

test('the pack, agent, and skill never reference the design lane by identity', () => {
  // Arrange — design-lane identity: the skill/handle namespace and the named
  // lane phrases. Generic "design" / "design system" prose stays allowed.
  const designLaneRefs = [
    { label: 'dude-pack-design* handle', re: /dude-pack-design\b/i },
    { label: '"design lane"', re: /design lane/i },
    { label: '"design pack"', re: /design pack/i },
    { label: '"design workflow"', re: /design workflow/i },
  ];
  const files = [
    { name: 'pack.md', text: pack },
    { name: 'agent', text: agent },
    { name: 'skill', text: skill },
  ];

  // Act — collect any design-lane identity reference.
  const hits = [];
  for (const { name, text } of files) {
    for (const { label, re } of designLaneRefs) {
      if (re.test(text)) hits.push(`${name}: ${label}`);
    }
  }

  // Assert — none of the three files couples to the design lane by identity ...
  assert.deepEqual(hits, [], `design-lane identity reference(s) found: ${hits.join(', ')}`);

  // ... while the generic "design system" disclaimer stays present and allowed,
  // proving the ban is narrow and did not scrub legitimate generic prose.
  for (const { name, text } of files) {
    assert.match(
      text,
      /design system/i,
      `${name} should keep the generic "design system" disclaimer`,
    );
  }
});

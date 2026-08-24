// @ts-check
// Feature 032 T001 regression: the design lane is a generic, technology- and
// theme-independent visual-design proposal workflow. This file pins the
// *independence* contract (no Hugo/Docsy/specific-visual-system/React/SCSS/Microsoft coupling,
// target-capability-aware functional realism, generic in-workflow quality
// gates, a standalone manifest, and no new theme machinery). Lane authority,
// ownership, and lifecycle guarantees stay pinned by the untouched colocated
// design-workflow.test.mjs. This regression is pack-root and not projected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Robust, file-relative reads so the regression travels with the pack subtree.
const packPath = fileURLToPath(new URL('./pack.md', import.meta.url));
const workflowSkillPath = fileURLToPath(
  new URL('./skills/dude-pack-design-workflow/SKILL.md', import.meta.url),
);
const skillsPath = fileURLToPath(new URL('./skills/', import.meta.url));
const pack = fs.readFileSync(packPath, 'utf8');
const skill = fs.readFileSync(workflowSkillPath, 'utf8');

// Collapse whitespace so prose assertions survive harmless line re-wrapping.
const flat = (text) => text.replace(/\s+/g, ' ');
const packFlat = flat(pack);
const skillFlat = flat(skill);
const skillTexts = fs.readdirSync(skillsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: `skills/${entry.name}/SKILL.md`,
    text: flat(fs.readFileSync(path.join(skillsPath, entry.name, 'SKILL.md'), 'utf8')),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function sectionBetween(content, start, end) {
  const startIndex = content.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section after ${start}: ${end}`);
  return content.slice(startIndex, endIndex);
}

// The exact technology / theme / brand handles Feature 032 T001 removes.
// The visual-system matcher subsumes its related handles; `/scss/i` subsumes
// SCSS and .scss. `React` is
// matched case-sensitively with word boundaries so it pins the web framework
// proper noun without banning generic English ("interactive", "reachable").
// The list is the narrow set of removed handles, not an exhaustive word ban:
// generic design/brand/site/component/theme vocabulary stays legitimate.
const removedVisualSystem = ['s', 't', 'r', 'a', 't', 'a'].join('');
const coupling = [
  { label: 'Hugo', re: /hugo/i },
  { label: 'Docsy', re: /docsy/i },
  { label: 'removed visual-system handles', re: new RegExp(removedVisualSystem, 'i') },
  { label: 'Microsoft', re: /microsoft/i },
  { label: 'Brand Central', re: /brand central/i },
  { label: 'React (web framework)', re: /\bReact\b/ },
  { label: 'SCSS / .scss', re: /scss/i },
];

test('design pack and skills name no specific technology, theme, or brand', () => {
  // Arrange
  const targets = [
    { name: 'pack.md', text: packFlat },
    ...skillTexts,
  ];

  // Act — collect every removed coupling handle that still survives.
  const hits = [];
  for (const { name, text } of targets) {
    for (const { label, re } of coupling) {
      if (re.test(text)) hits.push(`${name}: ${label}`);
    }
  }

  // Assert — zero specific technology/theme/brand coupling remains ...
  assert.deepEqual(hits, [], `unexpected coupling: ${hits.join(', ')}`);

  // ... while legitimate generic design vocabulary is preserved, proving the
  // scrub did not become a broad design/brand/site/component ban.
  assert.match(skillFlat, /brand direction/);
  assert.match(skill, /## Brand Fit/);
  assert.match(skillFlat, /tokens, typography/);
  assert.match(packFlat, /propose\/approve\/apply loop/);
});

test('Functional Realism validates affordances against a declared target capability envelope', () => {
  // Arrange
  const realism = flat(sectionBetween(skill, '## Functional Realism', '## Design-Shaped'));

  // Assert — the envelope is declared by the actual target's implementation owner.
  assert.match(realism, /capability envelope/);
  assert.match(realism, /implementation owner declares/);
  assert.match(realism, /installed specialist who owns that surface/);

  // Assert — each affordance is checked against that declared envelope, never a
  // fixed static premise; both static and dynamic targets are acknowledged.
  assert.match(realism, /against the declared envelope for this target, never against a fixed assumption/);
  assert.match(realism, /Some targets are static with no backend; others have a server/);

  // Assert — when no owner has declared an envelope, request one first.
  assert.match(realism, /If no implementation owner has declared an envelope, request one/);

  // Assert — the existing replace / drop / flag resolution survives.
  assert.match(realism, /replace it with a real equivalent the envelope does support/);
  assert.match(realism, /drop the element and record the limitation under/);
  assert.match(realism, /flag it as `design-gap` and route it back/);
});

test('accessibility, contrast, provenance, and functional realism stay generic in-workflow gates', () => {
  // Arrange
  const close = flat(sectionBetween(skill, '## Design Close Protocol', '## Post-Implementation Refinement Loop'));

  // Assert — accessibility + contrast are judged inside the workflow against
  // spec.md, explicitly NOT delegated to a theme or external validator.
  assert.match(close, /Confirm accessibility and contrast on the rendered surface itself/);
  assert.match(close, /meet WCAG AA contrast/);
  assert.match(close, /not against any theme or external validator/);

  // Assert — provenance is a workflow responsibility at both mock and close.
  assert.match(skillFlat, /every field shown in the mock must map to a real content or front-matter source/);
  assert.match(close, /every displayed field traces to real content, data, or configuration/);

  // Assert — functional realism is an owned workflow section the close references.
  assert.match(skill, /## Functional Realism/);
  assert.match(close, /Functional Realism/);
});

test('the design manifest stays standalone with generic target-owner routing and no new machinery', () => {
  // Arrange
  const frontmatter = (pack.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
  const independence = flat(sectionBetween(pack, '## Independence', '## Install / remove'));
  const routing = flat(sectionBetween(skill, '## Routing', '## Avoid'));

  // Assert — the standalone claim is retained.
  assert.match(independence, /This lane stands on its own\./);
  assert.match(independence, /works in any project with no other packs installed/);
  assert.match(independence, /accessibility, contrast, provenance, and functional realism/);
  assert.match(independence, /entirely inside this lane/);

  // Assert — the manifest declares no technology/theme requirement and keeps no
  // related-pack coupling (the "requires" check targets the YAML frontmatter
  // only; the word also appears legitimately in Independence prose).
  assert.doesNotMatch(frontmatter, /^requires:/m);
  const providedSkills = [...frontmatter.matchAll(/^    - ([^\n]+)$/gm)]
    .map(([, name]) => name);
  assert.deepEqual(providedSkills, [
    'dude-pack-design-workflow',
    'dude-pack-design-frontend-aesthetics',
  ]);
  assert.equal(pack.includes('## Related packs'), false, 'no Related packs coupling section');

  // Assert — implementation routing names no default owner, in both the
  // manifest and the workflow, and asks when no owner is installed.
  assert.match(independence, /routes to whichever installed specialist owns the actual target surface/);
  assert.match(independence, /the lane names none as a default/);
  assert.match(independence, /asks which specialist owns the target rather than assuming one/);
  assert.match(routing, /to the installed specialist that owns the actual target surface; name no specialist as a default/);
  assert.match(routing, /If no owner is installed for the target, ask which specialist owns it rather than assuming one/);

  // Assert — a chosen visual system introduces no registry/adapter/schema/
  // discovery machinery; it is named only in ordinary approved-direction prose.
  assert.match(independence, /no registry, adapter, or schema/);
  assert.match(independence, /recorded only in the ordinary approved-direction and task wording/);
  assert.match(independence, /references, requires, and activates no visual system of its own/);
});

// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addProvide, listProvide } from './pack-manifest.mjs';

const BLOCK = `---
name: hugo
description: "Hugo pack"
provides:
  agents:
    - dude-pack-hugo-site-architect
    - dude-pack-hugo-troubleshooter
  skills:
    - dude-pack-hugo-site-builder
requires:
  tools: [hugo]
---

# Hugo Pack
`;

const INLINE = `---
name: web
description: "Web pack"
provides:
  agents: [dude-pack-web-backend, dude-pack-web-frontend]
  skills: []
---

# Web
`;

const NO_PROVIDES = `---
name: mini
description: "no provides yet"
---

# Mini
`;

test('addProvide inserts into an existing block list, sorted + deduped', () => {
  const out = addProvide(BLOCK, 'agents', 'dude-pack-hugo-docs-researcher');
  const agents = listProvide(out, 'agents');
  assert.deepEqual(agents, [
    'dude-pack-hugo-docs-researcher',
    'dude-pack-hugo-site-architect',
    'dude-pack-hugo-troubleshooter',
  ]);
  // idempotent
  assert.equal(addProvide(out, 'agents', 'dude-pack-hugo-docs-researcher'), out);
  // untouched sections preserved
  assert.ok(out.includes('  tools: [hugo]'));
  assert.deepEqual(listProvide(out, 'skills'), ['dude-pack-hugo-site-builder']);
});

test('addProvide inserts into an inline list, keeping inline style', () => {
  const out = addProvide(INLINE, 'agents', 'dude-pack-web-worker');
  assert.match(out, /agents: \[dude-pack-web-backend, dude-pack-web-frontend, dude-pack-web-worker\]/);
  assert.deepEqual(listProvide(out, 'agents'), [
    'dude-pack-web-backend',
    'dude-pack-web-frontend',
    'dude-pack-web-worker',
  ]);
});

test('addProvide creates a missing kind under an existing provides', () => {
  const out = addProvide(BLOCK, 'instructions', 'hugo-x.instructions.md');
  assert.deepEqual(listProvide(out, 'instructions'), ['hugo-x.instructions.md']);
  // existing kinds still intact
  assert.equal(listProvide(out, 'agents').length, 2);
});

test('addProvide creates a provides block when none exists', () => {
  const out = addProvide(NO_PROVIDES, 'skills', 'dude-pack-mini-s');
  assert.deepEqual(listProvide(out, 'skills'), ['dude-pack-mini-s']);
  assert.ok(out.includes('provides:'));
});

test('addProvide throws on malformed frontmatter', () => {
  assert.throws(() => addProvide('no frontmatter here', 'agents', 'x'), /frontmatter/);
});

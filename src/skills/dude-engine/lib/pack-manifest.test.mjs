// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addProvide,
  listProvide,
  parsePackManifestMetadata,
  USE_CASE_ID_RE,
} from './pack-manifest.mjs';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const EXPECTED_CATALOG_USE_CASES = new Map([
  ['authoring', ['bundle-authoring']],
  ['beads', ['work-tracking']],
  ['clearline', ['ui', 'visual-design']],
  ['coding', ['software-development']],
  ['copilot-sdk', ['software-development']],
  ['design', ['ui', 'visual-design']],
  ['docsy', ['documentation', 'web-development']],
  ['fluent-ui', ['ui']],
  ['hugo', ['web-development']],
  ['newsroom', ['web-development', 'writing']],
  ['practices', ['software-development']],
  ['release', ['release-management']],
  ['rubber-duck', ['retrospective']],
  ['rust', ['software-development']],
  ['strata', ['ui', 'visual-design']],
  ['technical-docs', ['documentation', 'writing']],
  ['web', ['api', 'ui', 'web-development']],
  ['writing', ['writing']],
]);

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

/** @param {string} fields */
function manifest(fields) {
  return `---
${fields}
---

# Pack
`;
}

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

test('parsePackManifestMetadata defaults omitted use-cases and reads only the first block', () => {
  const parsed = parsePackManifestMetadata(`---
name: 'demo'
description: "Demo pack"
---
use-cases: [ignored]
---
use-cases: [also-ignored]
---
`);

  assert.deepEqual(parsed, {
    name: 'demo',
    description: 'Demo pack',
    useCases: [],
  });
});

test('parsePackManifestMetadata accepts ordered inline use-cases with simple quotes', () => {
  const parsed = parsePackManifestMetadata(manifest(
    'name: demo\ndescription: Demo pack\nuse-cases: [web-development, "api", \'ui\']',
  ));

  assert.deepEqual(parsed, {
    name: 'demo',
    description: 'Demo pack',
    useCases: ['web-development', 'api', 'ui'],
  });
  assert.equal(USE_CASE_ID_RE.test('web-development'), true);
  assert.equal(USE_CASE_ID_RE.test('web--development'), false);
});

test('USE_CASE_ID_RE enforces exact use-case identifier boundaries', () => {
  const accepted = ['a', 'a1', 'a-1', 'web-development'];
  const rejected = ['A', 'aB', 'a_b', 'a b', 'a\tb', 'a\n', '1a', '-a', 'a-', 'a--b'];

  for (const value of accepted) {
    assert.equal(USE_CASE_ID_RE.test(value), true, `expected ${JSON.stringify(value)} to be accepted`);
  }
  for (const value of rejected) {
    assert.equal(USE_CASE_ID_RE.test(value), false, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('parsePackManifestMetadata accepts ordered block use-cases', () => {
  const parsed = parsePackManifestMetadata(manifest(
    'use-cases:\n  - writing\n  - "software-development"\n  - \'api\'',
  ));

  assert.deepEqual(parsed.useCases, ['writing', 'software-development', 'api']);
});

test('parsePackManifestMetadata rejects malformed block structure without partial parsing', () => {
  /** @type {Array<[string, string]>} */
  const cases = [
    ['deeper indentation', 'use-cases:\n    - api'],
    ['inconsistent indentation', 'use-cases:\n  - api\n    - ui'],
    ['one-space indentation', 'use-cases:\n - api'],
    ['no indentation', 'use-cases:\n- api'],
    ['tab indentation', 'use-cases:\n\t- api'],
    ['mixed space-tab indentation', 'use-cases:\n \t- api'],
    ['two-spaces-then-tab indentation', 'use-cases:\n  \t- api'],
    ['nested-looking item', 'use-cases:\n  - api\n    - ui'],
    ['blank line hiding a malformed item', 'use-cases:\n  - api\n\n  - API'],
    ['comment hiding a duplicate', 'use-cases:\n  - api\n# comment\n  - api'],
    ['arbitrary content hiding a malformed item', 'use-cases:\n  - api\nnot a key\n  - API'],
    ['deeper indentation hiding a duplicate', 'use-cases:\n  - api\n    - ui\n  - api'],
  ];

  // Arrange / Act / Assert: every non-item must reject rather than end the block.
  for (const [label, fields] of cases) {
    assert.throws(
      () => parsePackManifestMetadata(manifest(fields)),
      /use-cases.*must be a list/,
      label,
    );
  }
});

test('parsePackManifestMetadata ends a block list at the next top-level key', () => {
  const parsed = parsePackManifestMetadata(manifest(
    'use-cases:\n  - api\ndescription: Demo pack',
  ));

  assert.deepEqual(parsed, {
    name: null,
    description: 'Demo pack',
    useCases: ['api'],
  });
});

test('parsePackManifestMetadata rejects invalid use-cases declarations with actionable errors', () => {
  /** @type {Array<[string, string, RegExp]>} */
  const cases = [
    ['explicit empty list', 'use-cases: []', /use-cases.*non-empty list/],
    ['empty block', 'use-cases:', /use-cases.*non-empty list/],
    ['scalar', 'use-cases: api', /use-cases.*must be a list/],
    ['mapping', 'use-cases:\n  api: enabled', /use-cases.*must be a list/],
    ['empty inline item', 'use-cases: [api, ]', /use-cases.*empty item/],
    ['empty block item', 'use-cases:\n  -', /use-cases.*empty item/],
    ['malformed identifier', 'use-cases: [api--docs]', /use-cases.*invalid value "api--docs"/],
    ['duplicate decoded value', 'use-cases: ["api", api]', /use-cases.*duplicate value "api"/],
    ['repeated key', 'use-cases: [api]\nuse-cases: [ui]', /use-cases.*must not be repeated/],
  ];

  for (const [label, fields, message] of cases) {
    assert.throws(
      () => parsePackManifestMetadata(manifest(fields)),
      message,
      label,
    );
  }
});

test('maintained catalog manifests declare the required discovery use-cases', () => {
  const catalogDir = path.join(REPOSITORY_ROOT, 'library', 'packs');
  const manifests = fs.readdirSync(catalogDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      manifestPath: path.join(catalogDir, entry.name, 'pack.md'),
    }))
    .filter(({ manifestPath }) => fs.existsSync(manifestPath))
    .sort((first, second) => first.name.localeCompare(second.name));

  assert.deepEqual(
    manifests.map(({ name }) => name),
    [...EXPECTED_CATALOG_USE_CASES.keys()].sort(),
    'the maintained catalog must contain exactly the expected direct pack.md manifests',
  );

  for (const { name, manifestPath } of manifests) {
    let metadata;
    try {
      metadata = parsePackManifestMetadata(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      assert.fail(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    assert.deepEqual(
      metadata.useCases,
      EXPECTED_CATALOG_USE_CASES.get(name),
      `${name}: expected declared discovery use-cases`,
    );
  }
});

test('addProvide preserves adjacent use-cases bytes and listProvide remains scoped', () => {
  const beforeProvides = BLOCK.replace(
    'provides:',
    'use-cases: [web-development, "api"]\nprovides:',
  );
  const beforePrefix = beforeProvides.slice(0, beforeProvides.indexOf('provides:'));
  const beforeOut = addProvide(beforeProvides, 'agents', 'dude-pack-hugo-docs-researcher');
  assert.equal(beforeOut.slice(0, beforeOut.indexOf('provides:')), beforePrefix);

  const afterProvides = BLOCK.replace(
    'requires:',
    'use-cases: [web-development, "api"]\nrequires:',
  );
  const afterSuffix = afterProvides.slice(afterProvides.indexOf('use-cases:'));
  const afterOut = addProvide(afterProvides, 'agents', 'dude-pack-hugo-docs-researcher');
  assert.equal(afterOut.slice(afterOut.indexOf('use-cases:')), afterSuffix);
  assert.deepEqual(listProvide(afterOut, 'agents'), [
    'dude-pack-hugo-docs-researcher',
    'dude-pack-hugo-site-architect',
    'dude-pack-hugo-troubleshooter',
  ]);
});

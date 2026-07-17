// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPEC_IDENTITY_KIND,
  canonicalSpecIdentity,
  parseFrontmatterScalars,
  parseSpecIdentity,
} from './feature-identity.mjs';

test('strict frontmatter parser supports quoted CRLF scalars', () => {
  const parsed = parseFrontmatterScalars('---\r\nstatus: "defined"\r\nspec_path: \'.dude/specs/x/spec.md\'\r\n---\r\n');
  assert.equal(parsed.newline, '\r\n');
  assert.equal(parsed.scalars.get('status')?.value, 'defined');
  assert.equal(parsed.scalars.get('spec_path')?.value, '.dude/specs/x/spec.md');
  assert.equal(parsed.scalars.get('spec_path')?.quote, "'");
});

test('strict frontmatter parser rejects duplicate and dangling metadata', () => {
  assert.throws(
    () => parseFrontmatterScalars('---\nspec_path: a\nspec_path: b\n---\n'),
    /duplicate frontmatter key 'spec_path'/,
  );
  assert.throws(
    () => parseFrontmatterScalars('---\nspec_path: a\n'),
    /frontmatter closing delimiter/,
  );
});

test('spec identity parser accepts only canonical paths and rejects legacy and traversal', () => {
  const canonical = parseSpecIdentity('.dude/specs/001-x/spec.md');
  assert.equal(parseSpecIdentity('specs/001-x/spec.md'), null);
  assert.equal(canonical?.kind, SPEC_IDENTITY_KIND.CANONICAL);
  assert.equal(canonicalSpecIdentity(canonical), '.dude/specs/001-x/spec.md');
  assert.equal(parseSpecIdentity('specs/..\\outside/spec.md'), null);
  assert.equal(parseSpecIdentity('.dude/specs/../spec.md'), null);
});

// FR-029 (T034): opt-in strict canonical owner-metadata grammar. The mode is
// entered only by the feature inventory via { canonicalKeys }; every syntactic
// violation must THROW, while the default (optionless) mode stays generic.
const CANONICAL_OWNER_KEYS = ['title', 'slug', 'status', 'spec_path'];

test('strict canonical-key mode rejects quoted keys, alternate keys, flow values, and block entries', () => {
  const rejected = [
    { name: 'double-quoted canonical key', content: '---\n"status": defined\nspec_path: .dude/specs/x/spec.md\n---\n' },
    { name: 'single-quoted canonical key', content: "---\n'slug': example\nstatus: defined\n---\n" },
    { name: 'noncanonical key', content: '---\nstatus: defined\npriority: high\n---\n' },
    { name: 'alternate-case status key', content: '---\nStatus: defined\n---\n' },
    { name: 'hyphenated spec_path key', content: '---\nstatus: defined\nspec-path: .dude/specs/x/spec.md\n---\n' },
    { name: 'unquoted flow sequence value', content: '---\ntitle: [a, b]\nstatus: defined\n---\n' },
    { name: 'unquoted flow mapping value', content: '---\nslug: {x: 1}\nstatus: defined\n---\n' },
    { name: 'top-level list entry', content: '---\nstatus: defined\n- orphan\n---\n' },
    { name: 'indented block continuation', content: '---\ntitle: Example\n  nested: value\nstatus: defined\n---\n' },
  ];

  for (const fixture of rejected) {
    let threw = false;
    try {
      parseFrontmatterScalars(fixture.content, { canonicalKeys: CANONICAL_OWNER_KEYS });
    } catch {
      threw = true;
    }
    assert.ok(threw, `strict mode must reject ${fixture.name}`);
  }
});

test('strict canonical-key mode accepts clean blocks, preserves default tolerance, and keeps existing throws', () => {
  // Accepts a clean canonical block with plain and matched-quoted scalar values.
  const clean = parseFrontmatterScalars(
    '---\ntitle: Plain\nslug: "Quoted"\nstatus: \'defined\'\nspec_path: .dude/specs/x/spec.md\n---\n',
    { canonicalKeys: CANONICAL_OWNER_KEYS },
  );
  assert.equal(clean.scalars.get('slug')?.value, 'Quoted');
  assert.equal(clean.scalars.get('status')?.value, 'defined');
  assert.equal(clean.scalars.get('spec_path')?.value, '.dude/specs/x/spec.md');

  // The default (optionless) mode stays generic and tolerates noncanonical keys.
  const tolerant = parseFrontmatterScalars('---\npriority: high\nstatus: defined\n---\n');
  assert.equal(tolerant.scalars.get('priority')?.value, 'high');
  assert.equal(tolerant.scalars.get('status')?.value, 'defined');

  // Strict mode preserves the existing duplicate-key and malformed-quote throws.
  assert.throws(
    () => parseFrontmatterScalars('---\nspec_path: a\nspec_path: b\n---\n', { canonicalKeys: CANONICAL_OWNER_KEYS }),
    /duplicate frontmatter key 'spec_path'/,
  );
  assert.throws(
    () => parseFrontmatterScalars('---\nstatus: "x\n---\n', { canonicalKeys: CANONICAL_OWNER_KEYS }),
    /malformed quoted scalar/,
  );
});

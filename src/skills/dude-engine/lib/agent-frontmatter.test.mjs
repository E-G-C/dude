// @ts-check
/**
 * Tests for src/skills/dude-engine/lib/agent-frontmatter.mjs — the host-editor
 * `model:` frontmatter normalizer used by compose parity and the prompt audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentFrontmatter } from './agent-frontmatter.mjs';

test('strips a model line before the closing --- (architect/coder shape)', () => {
  const clean =
    '---\nname: dude-pack-coding-architect\ndescription: "Design authority"\ntools: [\'read\']\n---\n# Architect\n\nBody text.\n';
  const injected =
    '---\nname: dude-pack-coding-architect\ndescription: "Design authority"\ntools: [\'read\']\nmodel: Claude Sonnet 4.5\n---\n# Architect\n\nBody text.\n';

  const out = normalizeAgentFrontmatter(injected);
  assert.ok(out.equals(Buffer.from(clean, 'utf8')));
});

test('absorbs a single blank line after a stripped model line', () => {
  const clean = '---\nname: dude-pack-coding-reviewer\ndescription: "Reviewer"\n---\n# Reviewer\n';
  const injectedAfter =
    '---\nname: dude-pack-coding-reviewer\nmodel: Claude Opus 4.1\n\ndescription: "Reviewer"\n---\n# Reviewer\n';

  const out = normalizeAgentFrontmatter(injectedAfter);
  assert.ok(out.equals(Buffer.from(clean, 'utf8')));
});

test('absorbs a single blank line before a stripped model line (reviewer shape)', () => {
  const clean = '---\nname: dude-pack-coding-reviewer\ndescription: "Reviewer"\n---\n# Reviewer\n';
  const injectedBefore =
    '---\nname: dude-pack-coding-reviewer\n\nmodel: Claude Opus 4.1\ndescription: "Reviewer"\n---\n# Reviewer\n';

  const out = normalizeAgentFrontmatter(injectedBefore);
  assert.ok(out.equals(Buffer.from(clean, 'utf8')));
});

test('is a strict byte-identical no-op on model-less input (tester shape)', () => {
  const tester = '---\nname: dude-pack-coding-tester\ndescription: "Tester"\ntools: [\'read\']\n---\n# Tester\n';
  const buf = Buffer.from(tester, 'utf8');

  const out = normalizeAgentFrontmatter(buf);
  assert.equal(out, buf, 'returns the original buffer reference');
  assert.ok(out.equals(Buffer.from(tester, 'utf8')));
});

test('leaves a model: line in the body (after the closing ---) untouched', () => {
  const withBodyModel = '---\nname: foo\ndescription: "x"\n---\n# Body\nmodel: Claude Sonnet 4.5\n';
  const buf = Buffer.from(withBodyModel, 'utf8');

  const out = normalizeAgentFrontmatter(buf);
  assert.equal(out, buf);
  assert.ok(out.equals(Buffer.from(withBodyModel, 'utf8')));
});

test('leaves input without leading frontmatter untouched (body model: line)', () => {
  const noFrontmatter = '# Doc\nmodel: foo\n';
  const buf = Buffer.from(noFrontmatter, 'utf8');

  const out = normalizeAgentFrontmatter(buf);
  assert.equal(out, buf);
  assert.ok(out.equals(Buffer.from(noFrontmatter, 'utf8')));
});

test('retains genuine non-model drift after stripping the injected model line', () => {
  const clean = '---\nname: foo\ndescription: "original"\n---\n# Body\n';
  const driftPlain = '---\nname: foo\ndescription: "CHANGED"\n---\n# Body\n';
  const driftWithModel = '---\nname: foo\ndescription: "CHANGED"\nmodel: Claude Sonnet 4.5\n---\n# Body\n';

  const normalizedClean = normalizeAgentFrontmatter(clean);
  const normalizedDriftPlain = normalizeAgentFrontmatter(driftPlain);
  const normalizedDriftWithModel = normalizeAgentFrontmatter(driftWithModel);

  assert.ok(!normalizedDriftPlain.equals(normalizedClean), 'model-less drift still differs');
  assert.ok(!normalizedDriftWithModel.equals(normalizedClean), 'drift survives model stripping');
  assert.ok(
    normalizedDriftWithModel.equals(Buffer.from(driftPlain, 'utf8')),
    'stripping model yields the model-less drifted bytes',
  );
});

test('does not strip malformed or quoted model: values', () => {
  for (const line of ['model: {a: b}', 'model:', 'model: "x"']) {
    const source = `---\nname: foo\n${line}\n---\n# Body\n`;
    const buf = Buffer.from(source, 'utf8');
    const out = normalizeAgentFrontmatter(buf);
    assert.equal(out, buf, `unchanged: ${line}`);
    assert.ok(out.equals(Buffer.from(source, 'utf8')), `byte-identical: ${line}`);
  }
});

test('is idempotent', () => {
  const inputs = [
    '---\nname: foo\ndescription: "x"\ntools: [\'read\']\nmodel: Claude Sonnet 4.5\n---\n# Body\n',
    '---\nname: foo\nmodel: Claude Opus 4.1\n\ndescription: "x"\n---\n# Body\n',
    '---\nname: foo\n\nmodel: Claude Opus 4.1\ndescription: "x"\n---\n# Body\n',
    '---\nname: foo\ndescription: "x"\n---\n# Body\n',
  ];
  for (const input of inputs) {
    const once = normalizeAgentFrontmatter(input);
    const twice = normalizeAgentFrontmatter(once);
    assert.ok(twice.equals(once), `idempotent for: ${JSON.stringify(input)}`);
  }
});

test('preserves CRLF line endings', () => {
  const cleanCRLF = '---\r\nname: foo\r\ndescription: "x"\r\n---\r\n# Body\r\n';
  const injectedCRLF =
    '---\r\nname: foo\r\ndescription: "x"\r\nmodel: Claude Sonnet 4.5\r\n---\r\n# Body\r\n';

  const out = normalizeAgentFrontmatter(injectedCRLF);
  assert.ok(out.equals(Buffer.from(cleanCRLF, 'utf8')), 'CRLF injected normalizes to CRLF clean');

  const cleanBuf = Buffer.from(cleanCRLF, 'utf8');
  assert.equal(normalizeAgentFrontmatter(cleanBuf), cleanBuf, 'model-less CRLF is a strict no-op');
});

test('rebuilds a sole model: key frontmatter without a spurious blank line (LF)', () => {
  const input = '---\nmodel: Claude Opus 4.8 (copilot)\n---\n# Body\n';
  const expected = '---\n---\n# Body\n';

  const out = normalizeAgentFrontmatter(input);
  assert.ok(out.equals(Buffer.from(expected, 'utf8')), 'no blank line, LF preserved');

  const twice = normalizeAgentFrontmatter(out);
  assert.ok(twice.equals(out), 'idempotent on sole model: key (LF)');
});

test('rebuilds a sole model: key frontmatter without mixed EOL (CRLF)', () => {
  const input = '---\r\nmodel: GPT-5.6 Sol (copilot)\r\n---\r\n# Body\r\n';
  const expected = '---\r\n---\r\n# Body\r\n';

  const out = normalizeAgentFrontmatter(input);
  assert.ok(
    out.equals(Buffer.from(expected, 'utf8')),
    'no blank line, CRLF preserved, no mixed EOL',
  );

  const twice = normalizeAgentFrontmatter(out);
  assert.ok(twice.equals(out), 'idempotent on sole model: key (CRLF)');
});

// --- T032 (FR-028 / plan section 15): duplicate / valid-plus-semantic / mixed-EOL drift ---
// Contract: normalize EXACTLY ONE well-formed host-injected `model:` key; zero
// keys is a byte-identical no-op; MULTIPLE keys, or one key combined with a
// malformed/quoted/otherwise-semantic `model` line, is DRIFT and must be left
// byte-for-byte unchanged (no-op) so downstream hashing catches the drift —
// rather than stripping several lines and masking it.

test('treats multiple well-formed model: keys as drift and returns the original bytes (no-op)', () => {
  // MULTIPLE well-formed keys are drift, not the single host-injected key.
  // Normalize must NOT strip several lines; it returns the ORIGINAL bytes.
  const sources = [
    // adjacent duplicates (LF)
    '---\nname: foo\nmodel: Claude Sonnet 4.5\nmodel: Claude Opus 4.1\ndescription: "x"\n---\n# Body\n',
    // non-adjacent duplicates (LF) — guards a fix that only rejects adjacency
    '---\nmodel: Claude Sonnet 4.5\nname: foo\nmodel: Claude Opus 4.1\n---\n# Body\n',
    // adjacent duplicates (CRLF)
    '---\r\nmodel: Claude Sonnet 4.5\r\nmodel: Claude Opus 4.1\r\n---\r\n# Body\r\n',
  ];
  for (const source of sources) {
    const buf = Buffer.from(source, 'utf8');
    const out = normalizeAgentFrontmatter(buf);
    assert.ok(out.equals(buf), `duplicate model: keys are a drift no-op: ${JSON.stringify(source)}`);
  }
});

test('treats one well-formed model: key plus a second semantic model line as drift (no-op)', () => {
  // A well-formed key COMBINED with a malformed, quoted, or otherwise semantic
  // `model` line is drift. Normalize must return the ORIGINAL bytes unchanged,
  // not strip the valid line and leave the semantic one behind.
  const validLine = 'model: Claude Sonnet 4.5';
  const semanticLines = [
    'model: {a: b}', // flow-mapping value
    'model: "x"', // double-quoted scalar value
    'model:', // empty value
    '"model": Claude X', // quoted key
  ];
  for (const semantic of semanticLines) {
    const validThenSemantic = `---\nname: foo\n${validLine}\n${semantic}\n---\n# Body\n`;
    const semanticThenValid = `---\nname: foo\n${semantic}\n${validLine}\n---\n# Body\n`;
    for (const source of [validThenSemantic, semanticThenValid]) {
      const buf = Buffer.from(source, 'utf8');
      const out = normalizeAgentFrontmatter(buf);
      assert.ok(
        out.equals(buf),
        `drift no-op for a valid key beside "${semantic}": ${JSON.stringify(source)}`,
      );
    }
  }
});

test('treats inconsistent-EOL frontmatter as drift and returns the original bytes (no-op)', () => {
  // Chosen mixed-EOL contract: a frontmatter block with INCONSISTENT line
  // terminators (mixed LF/CRLF) is drift, so normalize returns the ORIGINAL
  // bytes unchanged. Rationale: the normalizer exists only to neutralize the
  // single, uniformly-terminated host-injected key; mixed EOL is never that
  // injection shape, and rebuilding on one detected EOL silently rewrites the
  // terminators of untouched lines. Treating it as a no-op keeps the module
  // lean (per the locally-controlled-workspace threat model) and consistent
  // with the rest of FR-028: ambiguous input is drift, not silently normalized.

  // A CRLF block carrying one LF-terminated untouched line, plus one well-formed
  // model: key. The current single-EOL rebuild rewrites `keep-lf`'s LF to CRLF
  // (and strips the key), corrupting bytes it should never have touched.
  const mixed = '---\r\nkeep-lf: yes\nname: foo\r\nmodel: Claude Sonnet 4.5\r\n---\r\n# Body\r\n';
  const buf = Buffer.from(mixed, 'utf8');
  const out = normalizeAgentFrontmatter(buf);
  assert.ok(out.equals(buf), 'inconsistent-EOL frontmatter is returned byte-for-byte unchanged');

  // The reverse shape: an LF block carrying one CRLF-terminated untouched line.
  const mixed2 = '---\nkeep-crlf: yes\r\nname: foo\nmodel: Claude Sonnet 4.5\n---\n# Body\n';
  const buf2 = Buffer.from(mixed2, 'utf8');
  const out2 = normalizeAgentFrontmatter(buf2);
  assert.ok(out2.equals(buf2), 'inconsistent-EOL frontmatter (reverse) is returned byte-for-byte unchanged');
});

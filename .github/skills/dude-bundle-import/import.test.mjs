// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveRawUrl,
  splitFrontmatter,
  readFrontmatterKey,
  stripFrontmatterKeys,
  detectKind,
  normalizeAgentDest,
  normalizeSkillDir,
  analyze,
  applyPlan,
} from './import.mjs';

test('resolveRawUrl rewrites github blob urls and passes others through', () => {
  assert.equal(
    resolveRawUrl('https://github.com/o/r/blob/main/agents/x.agent.md'),
    'https://raw.githubusercontent.com/o/r/main/agents/x.agent.md'
  );
  assert.equal(resolveRawUrl('https://raw.githubusercontent.com/o/r/main/x.md'), 'https://raw.githubusercontent.com/o/r/main/x.md');
  assert.equal(resolveRawUrl('/local/path.md'), '/local/path.md');
});

test('frontmatter read + strip removes keys and their block continuations', () => {
  const src = '---\nname: X\ndescription: "d"\ncompatibility: ">=1"\nmodel: gpt-4\ntools:\n  - Bash\n  - Read\n---\nbody\n';
  assert.equal(readFrontmatterKey(src, 'name'), 'X');
  assert.equal(readFrontmatterKey(src, 'model'), 'gpt-4');
  const stripped = stripFrontmatterKeys(src, ['compatibility', 'model', 'tools']);
  assert.ok(!/compatibility:/.test(stripped));
  assert.ok(!/model:/.test(stripped));
  assert.ok(!/tools:/.test(stripped));
  assert.ok(!/- Bash/.test(stripped), 'block continuation removed');
  assert.ok(/name: X/.test(stripped) && /description: "d"/.test(stripped), 'kept keys survive');
  assert.ok(/body/.test(stripped), 'body survives');
});

test('detectKind + dest normalization', () => {
  assert.equal(detectKind('x/SKILL.md', ''), 'skill');
  assert.equal(detectKind('x/foo.agent.md', ''), 'agent');
  assert.equal(detectKind('repo/agents/foo.md', '---\nname: Y\n---\n'), 'agent');
  assert.equal(detectKind('notes.md', 'plain text'), 'unknown');
  assert.equal(normalizeAgentDest('security.agent.md'), 'dude-local-security.agent.md');
  assert.equal(normalizeAgentDest('dude-pack-web-backend.agent.md'), 'dude-local-backend.agent.md');
  assert.equal(normalizeSkillDir('dude-pack-hugo-site-builder'), 'dude-local-site-builder');
  assert.equal(normalizeSkillDir('my-skill'), 'dude-local-my-skill');
});

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-import-'));
  fs.mkdirSync(path.join(root, '.github', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github', 'skills'), { recursive: true });
  return root;
}

const SOURCE_AGENT =
  '---\r\n' +
  'name: Security Reviewer\r\n' +
  'description: "Reviews code for security vulnerabilities and OWASP top ten issues"\r\n' +
  'compatibility: ">=1.0"\r\n' +
  'model: gpt-4\r\n' +
  'tools:\r\n' +
  '  - Bash\r\n' +
  '  - Read\r\n' +
  'license: MIT\r\n' +
  '---\r\n' +
  'You are a security reviewer.\r\n';

test('analyze reports kind, dest, strip plan, license, endings, overlaps', async () => {
  const root = tmpRoot();
  const srcFile = path.join(root, 'security-reviewer.agent.md');
  try {
    fs.writeFileSync(srcFile, SOURCE_AGENT);
    // an existing local agent with an overlapping description
    fs.writeFileSync(
      path.join(root, '.github/agents/dude-local-secreview.agent.md'),
      '---\nname: SecReview\ndescription: "Reviews code for security vulnerabilities and OWASP issues"\n---\nx\n'
    );
    const rep = await analyze({ source: srcFile, root });
    assert.equal(rep.kind, 'agent');
    assert.equal(rep.destRel, '.github/agents/dude-local-security-reviewer.agent.md');
    assert.deepEqual(rep.frontmatter.strip.sort(), ['compatibility', 'model']);
    assert.equal(rep.frontmatter.toolsPresent, true);
    assert.equal(rep.frontmatter.hasLicense, true);
    assert.equal(rep.requiresLicenseDecision, true);
    assert.equal(rep.lineEndings, 'crlf');
    assert.ok(rep.overlaps.some((o) => o.id === 'dude-local-secreview.agent.md' && o.score >= 0.6));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan refuses without license disposition, then writes stripped+normalized', async () => {
  const root = tmpRoot();
  const srcFile = path.join(root, 'security-reviewer.agent.md');
  try {
    fs.writeFileSync(srcFile, SOURCE_AGENT);
    const plan = await analyze({ source: srcFile, root });
    await assert.rejects(applyPlan({ source: srcFile, root, plan }), /license_disposition/);
    plan.license_disposition = 'source-license-section';
    const r = await applyPlan({ source: srcFile, root, plan });
    assert.equal(r.written, '.github/agents/dude-local-security-reviewer.agent.md');
    const body = fs.readFileSync(path.join(root, r.written), 'utf8');
    assert.ok(!body.includes('\r'), 'normalized to LF');
    assert.ok(!/compatibility:|model:|tools:/.test(body), 'stripped fields');
    assert.ok(/name: Security Reviewer/.test(body), 'kept name');
    assert.ok(body.endsWith('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveRawUrl,
  splitFrontmatter,
  readFrontmatterKey,
  detectKind,
  normalizeAgentDest,
  normalizeSkillDir,
  analyze,
  applyPlan,
} from './import.mjs';
import { ImportFrontmatterError } from './lib/import-frontmatter.mjs';

const SCRIPT = fileURLToPath(new URL('./import.mjs', import.meta.url));

test('resolveRawUrl authorizes only canonical GitHub remote-file URLs', async (t) => {
  await t.test('accepts blob, raw, and explicit default-port URLs', () => {
    const accepted = [
      [
        'https://github.com/o/r/blob/main/agents/x.agent.md',
        'https://raw.githubusercontent.com/o/r/main/agents/x.agent.md',
      ],
      [
        'https://raw.githubusercontent.com/o/r/main/x.md',
        'https://raw.githubusercontent.com/o/r/main/x.md',
      ],
      [
        'https://raw.githubusercontent.com:443/o/r/main/x.md',
        'https://raw.githubusercontent.com/o/r/main/x.md',
      ],
    ];

    for (const [input, expected] of accepted) {
      assert.equal(resolveRawUrl(input), expected, input);
    }
  });

  await t.test('rejects non-canonical remote URL categories', () => {
    const rejected = [
      ['HTTP scheme', 'http://raw.githubusercontent.com/o/r/main/x.md'],
      ['other scheme', 'ftp://raw.githubusercontent.com/o/r/main/x.md'],
      ['userinfo', 'https://user@raw.githubusercontent.com/o/r/main/x.md'],
      ['fragment', 'https://raw.githubusercontent.com/o/r/main/x.md#fragment'],
      ['query', 'https://raw.githubusercontent.com/o/r/main/x.md?download=1'],
      ['non-default port', 'https://raw.githubusercontent.com:444/o/r/main/x.md'],
      ['other host', 'https://example.com/o/r/main/x.md'],
      ['localhost', 'https://localhost/o/r/main/x.md'],
      ['IP host', 'https://127.0.0.1/o/r/main/x.md'],
      ['internal host', 'https://metadata.internal/o/r/main/x.md'],
      ['subdomain', 'https://cdn.raw.githubusercontent.com/o/r/main/x.md'],
      ['GitHub tree shape', 'https://github.com/o/r/tree/main/x.md'],
      ['GitHub API shape', 'https://api.github.com/repos/o/r/contents/x.md'],
      ['empty owner', 'https://raw.githubusercontent.com//r/main/x.md'],
      ['empty repo', 'https://raw.githubusercontent.com/o//main/x.md'],
      ['empty ref', 'https://raw.githubusercontent.com/o/r//x.md'],
      ['empty path', 'https://raw.githubusercontent.com/o/r/main/'],
      ['literal backslash', String.raw`https://raw.githubusercontent.com/o/r/main\x.md`],
      ['encoded slash', 'https://raw.githubusercontent.com/o/r/feature%2fbranch/x.md'],
      ['encoded backslash', 'https://raw.githubusercontent.com/o/r/main/x%5C.md'],
      ['literal dot segment', 'https://raw.githubusercontent.com/o/r/main/../x.md'],
      ['encoded dot segment', 'https://raw.githubusercontent.com/o/r/main/%2E%2e/x.md'],
    ];

    for (const [label, input] of rejected) {
      assert.throws(
        () => resolveRawUrl(input),
        { message: 'invalid remote import URL' },
        label
      );
    }
  });
});

test('readFrontmatterKey reads top-level keys for local overlap scanning', () => {
  const src = '---\nname: X\ndescription: "d"\ncompatibility: ">=1"\nmodel: gpt-4\ntools:\n  - Bash\n  - Read\n---\nbody\n';
  assert.equal(readFrontmatterKey(src, 'name'), 'X');
  assert.equal(readFrontmatterKey(src, 'description'), 'd');
  assert.equal(readFrontmatterKey(src, 'model'), 'gpt-4');
  assert.equal(readFrontmatterKey(src, 'absent'), null);
  assert.equal(readFrontmatterKey('no frontmatter here\n', 'name'), null);
});

test('detectKind + dest normalization', () => {
  assert.equal(detectKind('x/SKILL.md', ''), 'skill');
  assert.equal(detectKind('x/foo.agent.md', ''), 'agent');
  assert.equal(detectKind('repo/agents/foo.md', '---\nname: Y\n---\n'), 'agent');
  assert.equal(detectKind('notes.md', 'plain text'), 'unknown');
  assert.equal(normalizeAgentDest('security.agent.md'), 'dude-local-security.agent.md');
  assert.equal(normalizeAgentDest('dude-pack-web-backend.agent.md'), 'dude-local-web-backend.agent.md');
  assert.equal(normalizeAgentDest('dude-pack-ms-brand-stylist.agent.md'), 'dude-local-ms-brand-stylist.agent.md');
});

test('normalizeSkillDir accepts one lowercase skill segment and rejects invalid names', async (t) => {
  await t.test('accepts bare, local, and pack-prefixed names', () => {
    const accepted = [
      ['my-skill', 'dude-local-my-skill'],
      ['dude-local-my-skill', 'dude-local-my-skill'],
      ['dude-pack-my-skill', 'dude-local-my-skill'],
    ];

    for (const [input, expected] of accepted) {
      assert.equal(normalizeSkillDir(input), expected, input);
    }
  });

  await t.test('rejects empty, unsafe, encoded, and malformed names', () => {
    const invalid = [
      ['missing', undefined],
      ['empty', ''],
      ['empty local stem', 'dude-local-'],
      ['empty pack stem', 'dude-pack-'],
      ['uppercase', 'My-skill'],
      ['slash', 'my/skill'],
      ['backslash', String.raw`my\skill`],
      ['dot segment', '.'],
      ['parent dot segment', '..'],
      ['control character', 'my\nskill'],
      ['encoded slash', 'my%2Fskill'],
      ['encoded backslash', 'my%5cskill'],
      ['leading digit', '1skill'],
      ['single character', 'a'],
      ['trailing hyphen', 'my-skill-'],
    ];

    for (const [label, input] of invalid) {
      assert.throws(() => normalizeSkillDir(input), /invalid skill name/i, label);
    }
  });
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

const SOURCE_SKILL =
  '---\n' +
  'name: dude-pack-release-notes\n' +
  'description: "Drafts structured release notes"\n' +
  '---\n' +
  'Draft release notes from the supplied changes.\n';

const SOURCE_SKILL_WITH_LICENSE = SOURCE_SKILL.replace(
  '---\nDraft release notes',
  'license: Apache-2.0\n---\nDraft release notes'
);

const SOURCE_AGENT_WITHOUT_LICENSE = SOURCE_AGENT.replace('license: MIT\r\n', '');
const SOURCE_AGENT_WITHOUT_TOOLS = SOURCE_AGENT.replace('tools:\r\n  - Bash\r\n  - Read\r\n', '');

const UNSUPPORTED_LICENSE_FORMS = [
  ['indented root key', 'license: MIT\n', ' '],
  ['anchor', 'license: &spdx MIT\n'],
  ['alias', 'spdx: &spdx MIT\nlicense: *spdx\n'],
  ['tag', 'license: !spdx MIT\n'],
  ['reserved indicator', 'license: @MIT\n'],
  ['directive indicator', 'license: %MIT\n'],
  ['mapping-like value', 'license: SPDX: MIT\n'],
  ['colon content', 'license: MIT:custom\n'],
  ['hash content', 'license: MIT#custom\n'],
  ['literal block scalar', 'license: |\n  MIT\n'],
  ['folded block scalar', 'license: >\n  MIT\n'],
  ['block collection', 'license:\n  - MIT\n'],
  ['flow object', 'license: { id: MIT }\n'],
  ['flow array', 'license: [MIT, Apache-2.0]\n'],
  ['empty value', 'license:\n'],
  ['indented continuation', 'license:\n  MIT\n'],
  ['duplicate keys', 'license: MIT\nlicense: Apache-2.0\n'],
  ['double-quoted scalar', 'license: "MIT"\n'],
  ['single-quoted scalar', "license: 'MIT'\n"],
  ['inline comment', 'license: MIT # SPDX identifier\n'],
  ['spaced key', 'license : MIT\n'],
  ['double-quoted key', '"license": MIT\n'],
  ['escaped double-quoted key', '"lic\\u0065nse": MIT\n'],
  ['single-quoted key', "'license': MIT\n"],
  ['tagged key', '!!str license: MIT\n'],
  ['aliased key', 'key-name: &key-name license\n*key-name: MIT\n'],
  ['explicit key', '? license\n: MIT\n'],
  ['canonical plus quoted semantic duplicate', 'license: MIT\n"license": Apache-2.0\n'],
  ['spaced plus canonical semantic duplicate', 'license : MIT\nlicense: Apache-2.0\n'],
];

function sourceWithLicenseMetadata(kind, licenseMetadata, rootIndent = '') {
  const indentedMetadata = licenseMetadata
    .split('\n')
    .map((line) => line.length > 0 ? `${rootIndent}${line}` : line)
    .join('\n');
  if (kind === 'agent') {
    return `---\n${rootIndent}name: Unsupported License\n${rootIndent}description: Rejects lossy license metadata\n${indentedMetadata}---\nYou are a reviewer.\n`;
  }
  return `---\n${rootIndent}name: dude-pack-release-notes\n${rootIndent}description: Drafts structured release notes\n${indentedMetadata}---\nDraft release notes.\n`;
}

function reviewPlan(plan) {
  const destinationAction = plan.destinationState.type === 'missing' ? 'create' : 'replace';
  plan.destinationDecision = {
    action: destinationAction,
    state: structuredClone(plan.destinationState),
  };
  if (plan.frontmatter.toolsPresent) plan.strip_tools = true;
  else plan.strip_tools = false;
  if (plan.frontmatter.hasLicense && plan.kind === 'agent') {
    plan.license_disposition = {
      license: plan.frontmatter.license,
      materialization: 'agent-source-license-section',
    };
  } else if (plan.frontmatter.hasLicense) {
    const state = plan.licenseSiblingStates.LICENSE;
    plan.license_disposition = {
      license: plan.frontmatter.license,
      materialization: 'skill-license-sibling',
      sibling: {
        filename: 'LICENSE',
        decision: {
          action: state.type === 'missing' ? 'create' : 'replace',
          state: structuredClone(state),
        },
      },
    };
  }
  return plan;
}

test('analyze binds destination state', async () => {
  const root = tmpRoot();
  const source = path.join(root, 'incoming', 'security-reviewer.agent.md');
  const destination = path.join(root, '.github/agents/dude-local-security-reviewer.agent.md');
  try {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, SOURCE_AGENT);

    const createPlan = await analyze({ source, root });
    assert.deepEqual(createPlan.destinationState, { type: 'missing' });
    assert.equal(Object.hasOwn(createPlan, 'destinationDecision'), false);

    const existing = Buffer.from('existing destination\n');
    fs.writeFileSync(destination, existing);
    const replacePlan = await analyze({ source, root });
    const stat = fs.statSync(destination, { bigint: true });
    assert.deepEqual(replacePlan.destinationState, {
      type: 'file',
      identity: {
        device: stat.dev.toString(),
        inode: stat.ino.toString(),
      },
      nlink: stat.nlink.toString(),
      sha256: crypto.createHash('sha256').update(existing).digest('hex'),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan requires reviewed replace authorization and rejects destination drift', async (t) => {
  async function replacementFixture() {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'security-reviewer.agent.md');
    const destination = path.join(root, '.github/agents/dude-local-security-reviewer.agent.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, SOURCE_AGENT);
    fs.writeFileSync(destination, 'reviewed destination\n');
    const plan = await analyze({ source, root });
    return { root, source, destination, plan };
  }

  await t.test('replace requires the exact reviewed decision', async () => {
    const fixture = await replacementFixture();
    try {
      fixture.plan.strip_tools = true;
      fixture.plan.license_disposition = {
        license: fixture.plan.frontmatter.license,
        materialization: 'agent-source-license-section',
      };
      await assert.rejects(
        applyPlan({ source: fixture.source, root: fixture.root, plan: fixture.plan }),
        /exact reviewed replace decision/i
      );
      assert.equal(fs.readFileSync(fixture.destination, 'utf8'), 'reviewed destination\n');

      reviewPlan(fixture.plan);
      fixture.plan.destinationDecision.action = 'create';
      await assert.rejects(
        applyPlan({ source: fixture.source, root: fixture.root, plan: fixture.plan }),
        /exact reviewed replace decision/i
      );
      assert.equal(fs.readFileSync(fixture.destination, 'utf8'), 'reviewed destination\n');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test('an exact replace decision permits the reviewed file', async () => {
    const fixture = await replacementFixture();
    try {
      const result = await applyPlan({
        source: fixture.source,
        root: fixture.root,
        plan: reviewPlan(fixture.plan),
      });
      assert.equal(result.written, fixture.plan.destRel);
      assert.match(fs.readFileSync(fixture.destination, 'utf8'), /^## Source License$/m);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test('a pre-existing unselected hard-link alias rejects replacement without writes', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'security-reviewer.agent.md');
    const destination = path.join(root, '.github/agents/dude-local-security-reviewer.agent.md');
    const alias = path.join(root, 'unselected', 'security-reviewer-backup.agent.md');
    const sourceBytes = Buffer.from(SOURCE_AGENT);
    const destinationBytes = Buffer.from('reviewed destination\n');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.mkdirSync(path.dirname(alias), { recursive: true });
      fs.writeFileSync(source, sourceBytes);
      fs.writeFileSync(destination, destinationBytes);
      fs.linkSync(destination, alias);
      const plan = reviewPlan(await analyze({ source, root }));
      assert.equal(plan.destinationState.nlink, '2');

      await assert.rejects(
        applyPlan({ source, root, plan }),
        /hard-link count.*1|multiple hard links/i
      );
      assert.deepEqual(fs.readFileSync(source), sourceBytes);
      assert.deepEqual(fs.readFileSync(destination), destinationBytes);
      assert.deepEqual(fs.readFileSync(alias), destinationBytes);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('an unselected hard-link alias added after analyze is link-count drift', async () => {
    const fixture = await replacementFixture();
    const alias = path.join(fixture.root, 'unselected', 'security-reviewer-backup.agent.md');
    const sourceBytes = fs.readFileSync(fixture.source);
    const destinationBytes = fs.readFileSync(fixture.destination);
    try {
      reviewPlan(fixture.plan);
      assert.equal(fixture.plan.destinationState.nlink, '1');
      fs.mkdirSync(path.dirname(alias), { recursive: true });
      fs.linkSync(fixture.destination, alias);

      await assert.rejects(
        applyPlan({ source: fixture.source, root: fixture.root, plan: fixture.plan }),
        /link count drifted after analysis/i
      );
      assert.deepEqual(fs.readFileSync(fixture.source), sourceBytes);
      assert.deepEqual(fs.readFileSync(fixture.destination), destinationBytes);
      assert.deepEqual(fs.readFileSync(alias), destinationBytes);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test('appearance is rejected', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));
      const destination = path.join(root, plan.destRel);
      fs.writeFileSync(destination, 'appeared\n');
      await assert.rejects(applyPlan({ source, root, plan }), /appeared after analysis/i);
      assert.equal(fs.readFileSync(destination, 'utf8'), 'appeared\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [name, mutate, pattern] of [
    ['disappearance', (destination) => fs.rmSync(destination), /disappeared after analysis/i],
    ['type drift', (destination) => { fs.rmSync(destination); fs.mkdirSync(destination); }, /type drifted/i],
    ['content drift', (destination) => fs.writeFileSync(destination, 'changed in place\n'), /content drifted/i],
    ['identity drift', (destination) => {
      const replacement = `${destination}.replacement`;
      fs.writeFileSync(replacement, 'reviewed destination\n');
      fs.renameSync(replacement, destination);
    }, /identity drifted/i],
  ]) {
    await t.test(name, async () => {
      const fixture = await replacementFixture();
      try {
        reviewPlan(fixture.plan);
        mutate(fixture.destination);
        await assert.rejects(
          applyPlan({ source: fixture.source, root: fixture.root, plan: fixture.plan }),
          pattern
        );
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test('applyPlan materializes structured agent and skill license dispositions', async (t) => {
  await t.test('agent license becomes a Source License section', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));
      const result = await applyPlan({ source, root, plan });
      const body = fs.readFileSync(path.join(root, result.written), 'utf8');
      assert.doesNotMatch(body, /^license:/m);
      assert.match(body, /\n## Source License\n\nMIT\n$/);
      assert.deepEqual(result.writtenSiblings, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('skill license becomes a confirmed LICENSE sibling', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
      const plan = reviewPlan(await analyze({ source, root }));
      const result = await applyPlan({ source, root, plan });
      const body = fs.readFileSync(path.join(root, result.written), 'utf8');
      const licensePath = '.github/skills/dude-local-release-notes/LICENSE';
      assert.doesNotMatch(body, /^license:/m);
      assert.equal(fs.readFileSync(path.join(root, licensePath), 'utf8'), 'Apache-2.0\n');
      assert.deepEqual(result.writtenSiblings, [licensePath]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('hard-linked selected targets are rejected before writing', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
      const primaryPath = path.join(
        root,
        '.github/skills/dude-local-release-notes/SKILL.md'
      );
      const licensePath = path.join(path.dirname(primaryPath), 'LICENSE');
      const original = Buffer.from('reviewed shared destination\n');
      fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
      fs.writeFileSync(primaryPath, original);
      fs.linkSync(primaryPath, licensePath);
      const plan = reviewPlan(await analyze({ source, root }));

      await assert.rejects(
        applyPlan({ source, root, plan }),
        /selected write targets.*same file identity/i
      );
      assert.deepEqual(fs.readFileSync(primaryPath), original);
      assert.deepEqual(fs.readFileSync(licensePath), original);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('license value and every selected target are preflighted before writing', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
      const plan = reviewPlan(await analyze({ source, root }));
      plan.license_disposition.license = 'MIT';
      await assert.rejects(
        applyPlan({ source, root, plan }),
        /exactly bind the observed license/i
      );
      assert.equal(fs.existsSync(path.join(root, plan.destRel)), false);

      plan.license_disposition.license = plan.frontmatter.license;
      const siblingPath = path.join(root, path.dirname(plan.destRel), 'LICENSE');
      fs.mkdirSync(path.dirname(siblingPath), { recursive: true });
      fs.writeFileSync(siblingPath, 'appeared before apply\n');
      await assert.rejects(
        applyPlan({ source, root, plan }),
        /license sibling destination appeared after analysis/i
      );
      assert.equal(fs.existsSync(path.join(root, plan.destRel)), false);
      assert.equal(fs.readFileSync(siblingPath, 'utf8'), 'appeared before apply\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('CLI apply reports every written path', async () => {
  const root = tmpRoot();
  const source = path.join(root, 'incoming', 'SKILL.md');
  const planPath = path.join(root, 'import-plan.json');
  try {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
    const plan = reviewPlan(await analyze({ source, root }));
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'apply', source, '--plan', planPath, '--root', root],
      { encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(
      result.stdout,
      '[OK] wrote .github/skills/dude-local-release-notes/SKILL.md\n'
        + '[OK] wrote .github/skills/dude-local-release-notes/LICENSE\n'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Probe whether this OS actually blocks new-file creation inside a read-only
// directory. Root (and a few CI filesystems) ignore the mode, so the partial-
// write regression below skips cleanly instead of asserting a false negative.
function canEnforceUnwritableSibling() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-import-probe-'));
  try {
    fs.chmodSync(probe, 0o555);
    try {
      fs.writeFileSync(path.join(probe, 'probe'), 'x');
      return false;
    } catch {
      return true;
    }
  } finally {
    try {
      fs.chmodSync(probe, 0o755);
    } catch {}
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

test('apply reports the already-written primary when a later sibling write fails', async (t) => {
  if (!canEnforceUnwritableSibling()) {
    t.skip('OS cannot represent an unwritable sibling directory (e.g. running as root)');
    return;
  }
  const primaryRel = '.github/skills/dude-local-release-notes/SKILL.md';
  const siblingRel = '.github/skills/dude-local-release-notes/LICENSE';
  const original = 'existing reviewed skill\n';

  await t.test('applyPlan surfaces the completed primary path on partial failure', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    const primaryAbs = path.join(root, primaryRel);
    const dirAbs = path.dirname(primaryAbs);
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
      // A pre-existing, reviewed primary makes its write an in-place replace,
      // which stays legal in a read-only parent, while the missing LICENSE
      // sibling cannot be created there.
      fs.mkdirSync(dirAbs, { recursive: true });
      fs.writeFileSync(primaryAbs, original);
      const plan = reviewPlan(await analyze({ source, root }));
      fs.chmodSync(dirAbs, 0o555);

      /** @type {any} */
      let thrown;
      try {
        await applyPlan({ source, root, plan });
      } catch (err) {
        thrown = err;
      }
      fs.chmodSync(dirAbs, 0o755);

      assert.ok(thrown, 'applyPlan rejected on the failed sibling write');
      assert.equal(thrown.name, 'PartialApplyError', 'throws the typed partial-apply error');
      assert.equal(thrown.written, primaryRel, 'error carries the completed primary path');
      assert.deepEqual(thrown.writtenSiblings, []);
      assert.notEqual(fs.readFileSync(primaryAbs, 'utf8'), original, 'primary was rewritten');
      assert.equal(fs.existsSync(path.join(root, siblingRel)), false, 'sibling never created');
    } finally {
      try {
        fs.chmodSync(dirAbs, 0o755);
      } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('CLI prints [OK] wrote for the primary before [FAIL]', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    const planPath = path.join(root, 'import-plan.json');
    const primaryAbs = path.join(root, primaryRel);
    const dirAbs = path.dirname(primaryAbs);
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL_WITH_LICENSE);
      fs.mkdirSync(dirAbs, { recursive: true });
      fs.writeFileSync(primaryAbs, original);
      const plan = reviewPlan(await analyze({ source, root }));
      fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
      fs.chmodSync(dirAbs, 0o555);

      const result = spawnSync(
        process.execPath,
        [SCRIPT, 'apply', source, '--plan', planPath, '--root', root],
        { encoding: 'utf8' }
      );

      fs.chmodSync(dirAbs, 0o755);

      assert.equal(result.status, 2, `expected exit 2, got ${result.status}: ${result.stderr}`);
      assert.match(result.stderr, /^\[FAIL\] /m);
      assert.equal(result.stdout, `[OK] wrote ${primaryRel}\n`);
      assert.notEqual(fs.readFileSync(primaryAbs, 'utf8'), original, 'primary was rewritten');
      assert.equal(fs.existsSync(path.join(root, siblingRel)), false, 'sibling never created');
    } finally {
      try {
        fs.chmodSync(dirAbs, 0o755);
      } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

async function assertRejectedWithSentinel({ root, source, plan, pattern = /integrity|snapshot|decision/i }) {
  const target = path.join(root, plan.destRel);
  const sentinel = Buffer.from('preserve-existing-target\r\n');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, sentinel);
  await assert.rejects(applyPlan({ source, root, plan }), pattern);
  assert.deepEqual(fs.readFileSync(target), sentinel);
}

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
    assert.equal(rep.sourceIdentity, path.resolve(srcFile));
    assert.equal(rep.sourceSha256, crypto.createHash('sha256').update(Buffer.from(SOURCE_AGENT)).digest('hex'));
    assert.match(rep.sourceSha256, /^[0-9a-f]{64}$/);
    assert.equal(rep.kind, 'agent');
    assert.equal(rep.destRel, '.github/agents/dude-local-security-reviewer.agent.md');
    assert.deepEqual(rep.frontmatter.strip, ['compatibility', 'model']);
    assert.equal(rep.frontmatter.toolsPresent, true);
    assert.equal(rep.frontmatter.hasLicense, true);
    assert.equal(rep.frontmatter.license, 'MIT');
    assert.equal(rep.requiresLicenseDecision, true);
    assert.equal(rep.strip_tools, true);
    assert.equal(rep.lineEndings, 'crlf');
    assert.ok(rep.overlaps.some((o) => o.id === 'dude-local-secreview.agent.md' && o.score >= 0.6));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('license classifier rejects bypass syntax before writes', async (t) => {
  for (const kind of ['agent', 'skill']) {
    for (const [name, licenseMetadata, rootIndent] of UNSUPPORTED_LICENSE_FORMS) {
      await t.test(`${kind}: ${name}`, async () => {
        const root = tmpRoot();
        const source = kind === 'agent'
          ? path.join(root, 'incoming', 'unsupported-license.agent.md')
          : path.join(root, 'incoming', 'SKILL.md');
        const destination = kind === 'agent'
          ? path.join(root, '.github/agents/dude-local-unsupported-license.agent.md')
          : path.join(
            root,
            `.github/skills/dude-local-${rootIndent ? 'incoming' : 'release-notes'}/SKILL.md`
          );
        const protectedFiles = [
          [destination, Buffer.from(`${kind} primary sentinel\r\n`)],
          [path.join(path.dirname(destination), 'LICENSE'), Buffer.from(`${kind} license sentinel\r\n`)],
          [path.join(path.dirname(destination), 'NOTICE'), Buffer.from(`${kind} notice sentinel\r\n`)],
        ];
        try {
          fs.mkdirSync(path.dirname(source), { recursive: true });
          const sourceBytes = Buffer.from(
            sourceWithLicenseMetadata(kind, licenseMetadata, rootIndent)
          );
          fs.writeFileSync(source, sourceBytes);
          for (const [protectedPath, bytes] of protectedFiles) {
            fs.mkdirSync(path.dirname(protectedPath), { recursive: true });
            fs.writeFileSync(protectedPath, bytes);
          }

          await assert.rejects(
            async () => {
              const plan = reviewPlan(await analyze({ source, root }));
              await applyPlan({ source, root, plan });
            },
            /invalid import frontmatter/i
          );
          assert.deepEqual(fs.readFileSync(source), sourceBytes);
          for (const [protectedPath, bytes] of protectedFiles) {
            assert.deepEqual(fs.readFileSync(protectedPath), bytes);
          }
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }
});

// Structural bypass attempts that the strict parser rejects but the retired ad
// hoc classifier tolerated: a license hidden by mixed indentation, semantic
// duplicates, delimiter-shaped openers/closers, bare CR line endings, and
// non-scalar license values. Each must fail analyze and the analyze -> apply
// pipeline closed, writing nothing.
const STRICT_ZERO_WRITE_LICENSE_CASES = [
  {
    name: 'mixed-indentation hidden license after column-zero fields',
    build: (kind) => sourceWithLicenseMetadata(kind, ' license: MIT\n'),
    code: 'ERR_IMPORT_FRONTMATTER_INDENTATION',
  },
  {
    name: 'canonical duplicate license keys',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license: MIT\nlicense: Apache-2.0\n'),
    code: 'ERR_IMPORT_FRONTMATTER_DUPLICATE_KEY',
  },
  {
    name: 'spaced semantic duplicate license key',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license : MIT\nlicense: Apache-2.0\n'),
    code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
  },
  {
    name: 'block scalar license value',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license: |\n  MIT\n'),
    code: 'ERR_IMPORT_FRONTMATTER_LICENSE',
  },
  {
    name: 'flow sequence license value',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license: [MIT, Apache-2.0]\n'),
    code: 'ERR_IMPORT_FRONTMATTER_LICENSE',
  },
  {
    name: 'anchored license value',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license: &spdx MIT\n'),
    code: 'ERR_IMPORT_FRONTMATTER_LICENSE',
  },
  {
    name: 'tagged license value',
    build: (kind) => sourceWithLicenseMetadata(kind, 'license: !spdx MIT\n'),
    code: 'ERR_IMPORT_FRONTMATTER_LICENSE',
  },
];

const STRICT_ZERO_WRITE_DELIMITER_CASES = [
  {
    name: 'CR-only delimiter-shaped frontmatter',
    build: (kind) => (kind === 'agent'
      ? '---\rname: CR Only\rdescription: Hidden by bare carriage returns\rlicense: MIT\r---\rYou are a reviewer.\r'
      : '---\rname: dude-pack-release-notes\rdescription: Hidden by bare carriage returns\rlicense: MIT\r---\rDraft release notes.\r'),
    code: 'ERR_IMPORT_FRONTMATTER_LINE_ENDING',
  },
  {
    name: 'comment-shaped opening delimiter',
    build: (kind) => (kind === 'agent'
      ? '--- # metadata\nname: Comment Opener\ndescription: Delimiter carries a trailing comment\nlicense: MIT\n---\nYou are a reviewer.\n'
      : '--- # metadata\nname: dude-pack-release-notes\ndescription: Delimiter carries a trailing comment\nlicense: MIT\n---\nDraft release notes.\n'),
    code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
  },
  {
    name: 'malformed closing delimiter',
    build: (kind) => (kind === 'agent'
      ? '---\nname: Bad Closer\ndescription: Closing delimiter is indented\nlicense: MIT\n ---\n---\nYou are a reviewer.\n'
      : '---\nname: dude-pack-release-notes\ndescription: Closing delimiter is indented\nlicense: MIT\n ---\n---\nDraft release notes.\n'),
    code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
  },
];

test('strict frontmatter integration fails analyze and apply closed with zero writes', async (t) => {
  const cases = [...STRICT_ZERO_WRITE_LICENSE_CASES, ...STRICT_ZERO_WRITE_DELIMITER_CASES];
  for (const kind of ['agent', 'skill']) {
    for (const { name, build, code } of cases) {
      await t.test(`${kind}: ${name}`, async () => {
        const root = tmpRoot();
        const source = kind === 'agent'
          ? path.join(root, 'incoming', 'strict-zero-write.agent.md')
          : path.join(root, 'incoming', 'SKILL.md');
        const destination = kind === 'agent'
          ? path.join(root, '.github/agents/dude-local-strict-zero-write.agent.md')
          : path.join(root, '.github/skills/dude-local-release-notes/SKILL.md');
        const protectedFiles = [
          [destination, Buffer.from(`${kind} primary sentinel\r\n`)],
          [path.join(path.dirname(destination), 'LICENSE'), Buffer.from(`${kind} license sentinel\r\n`)],
          [path.join(path.dirname(destination), 'NOTICE'), Buffer.from(`${kind} notice sentinel\r\n`)],
        ];
        try {
          fs.mkdirSync(path.dirname(source), { recursive: true });
          const sourceBytes = Buffer.from(build(kind));
          fs.writeFileSync(source, sourceBytes);
          for (const [protectedPath, bytes] of protectedFiles) {
            fs.mkdirSync(path.dirname(protectedPath), { recursive: true });
            fs.writeFileSync(protectedPath, bytes);
          }

          // analyze fails closed with the exact strict-parser diagnostic.
          await assert.rejects(analyze({ source, root }), (error) => {
            assert.ok(error instanceof ImportFrontmatterError, `expected ImportFrontmatterError, got ${error}`);
            assert.equal(error.code, code);
            assert.match(error.message, /invalid import frontmatter/i);
            return true;
          });

          // The full analyze -> apply pipeline also fails closed and writes nothing.
          await assert.rejects(
            async () => {
              const plan = reviewPlan(await analyze({ source, root }));
              await applyPlan({ source, root, plan });
            },
            (error) => error instanceof ImportFrontmatterError
          );

          assert.deepEqual(fs.readFileSync(source), sourceBytes);
          for (const [protectedPath, bytes] of protectedFiles) {
            assert.deepEqual(fs.readFileSync(protectedPath), bytes);
          }
          // No primary or sibling was created beyond the pre-placed sentinels.
          assert.equal(fs.readdirSync(path.dirname(destination)).length, protectedFiles.length);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }
});

test('license classifier accepts supported plain values with exact observed binding', async (t) => {
  for (const kind of ['agent', 'skill']) {
    for (const license of ['MIT', 'Apache-2.0']) {
      await t.test(`${kind}: ${license}`, async () => {
        const root = tmpRoot();
        const source = kind === 'agent'
          ? path.join(root, 'incoming', 'supported-license.agent.md')
          : path.join(root, 'incoming', 'SKILL.md');
        try {
          fs.mkdirSync(path.dirname(source), { recursive: true });
          fs.writeFileSync(source, sourceWithLicenseMetadata(kind, `license: ${license}\n`));
          const plan = reviewPlan(await analyze({ source, root }));

          assert.equal(plan.frontmatter.hasLicense, true);
          assert.equal(plan.frontmatter.license, license);
          assert.equal(plan.license_disposition.license, license);

          const result = await applyPlan({ source, root, plan });
          if (kind === 'agent') {
            assert.equal(
              fs.readFileSync(path.join(root, result.written), 'utf8').endsWith(
                `\n## Source License\n\n${license}\n`
              ),
              true
            );
          } else {
            assert.equal(
              fs.readFileSync(path.join(root, result.writtenSiblings[0]), 'utf8'),
              `${license}\n`
            );
          }
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }
});

test('license classifier distinguishes absence from ordinary unrelated frontmatter', async (t) => {
  for (const [kind, sourceName, content] of [
    ['agent', 'ordinary.agent.md', SOURCE_AGENT_WITHOUT_LICENSE],
    ['skill', 'SKILL.md', SOURCE_SKILL],
  ]) {
    await t.test(kind, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'incoming', sourceName);
      try {
        fs.mkdirSync(path.dirname(source), { recursive: true });
        fs.writeFileSync(source, content);
        const plan = reviewPlan(await analyze({ source, root }));

        assert.equal(plan.frontmatter.hasLicense, false);
        assert.equal(plan.frontmatter.license, null);
        assert.equal(plan.requiresLicenseDecision, false);
        assert.equal(Object.hasOwn(plan, 'license_disposition'), false);

        const result = await applyPlan({ source, root, plan });
        assert.equal(fs.existsSync(path.join(root, result.written)), true);
        assert.deepEqual(result.writtenSiblings, []);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('analyze binds canonical remote identity and apply fetches current source once', async () => {
  const root = tmpRoot();
  const blobUrl = 'https://github.com/example/reviewers/blob/main/agents/security-reviewer.agent.md';
  const rawUrl = 'https://raw.githubusercontent.com/example/reviewers/main/agents/security-reviewer.agent.md';
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  try {
    globalThis.fetch = async (input, init) => {
      fetchCount++;
      assert.equal(String(input), rawUrl);
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(SOURCE_AGENT, { status: 200 });
    };

    const plan = await analyze({ source: blobUrl, root });
    assert.equal(plan.sourceIdentity, rawUrl);
    assert.equal(fetchCount, 1);
    reviewPlan(plan);

    const result = await applyPlan({ source: rawUrl, root, plan });
    assert.equal(result.written, '.github/agents/dude-local-security-reviewer.agent.md');
    assert.equal(fetchCount, 2, 'apply performs exactly one fetch');
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('analyze routes malformed and protocol-relative URL syntax through strict remote authorization', async (t) => {
  const AGENT_SOURCE =
    '---\n' +
    'name: X\n' +
    'description: "Regression fixture for URL-shaped local bypass"\n' +
    '---\n' +
    'You are X.\n';

  // Each source is URL-shaped but evades a naive `scheme://` classifier, so the
  // buggy path falls through to the LOCAL-file branch and reads from disk. The
  // fix must route any leading URI scheme or `//` authority through strict
  // remote authorization and reject it as a remote-URL policy error instead.
  const bypassForms = [
    ['single-slash scheme', 'https:/raw.githubusercontent.com/o/r/main/agents/x.agent.md'],
    ['opaque scheme', 'https:raw.githubusercontent.com/o/r/main/agents/x.agent.md'],
    ['non-github scheme', 'data:text/plain,whatever'],
    ['protocol-relative authority', '//raw.githubusercontent.com/o/r/main/agents/x.agent.md'],
  ];

  await t.test('rejects each URL-shaped bypass form as a remote-URL policy error', async () => {
    const root = tmpRoot();
    try {
      for (const [label, source] of bypassForms) {
        await assert.rejects(analyze({ source, root }), /invalid remote import URL/, label);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('rejects a single-slash bypass whose resolved local path exists, mutating nothing', async () => {
    const root = tmpRoot();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-import-cwd-'));
    const source = 'https:/raw.githubusercontent.com/o/r/main/agents/x.agent.md';
    const destination = path.join(root, '.github/agents/dude-local-x.agent.md');
    const originalCwd = process.cwd();
    try {
      // Plant a REAL local file exactly where `path.resolve(source)` would read
      // it, so the only thing separating "remote reject" from "local accept" is
      // the classifier under test.
      process.chdir(cwd);
      const fixture = path.resolve(source);
      const fixtureBytes = Buffer.from(AGENT_SOURCE);
      fs.mkdirSync(path.dirname(fixture), { recursive: true });
      fs.writeFileSync(fixture, fixtureBytes);

      await assert.rejects(analyze({ source, root }), /invalid remote import URL/);

      // Discriminator: proves the source was rejected as remote, never read as a
      // local agent — no destination is produced and the planted bytes are intact.
      assert.equal(fs.existsSync(destination), false, 'no destination file created');
      assert.deepEqual(fs.readFileSync(fixture), fixtureBytes, 'planted fixture bytes unchanged');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('still imports ordinary local paths as local sources', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'security-reviewer.agent.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_AGENT);

      const report = await analyze({ source, root });
      assert.equal(report.kind, 'agent');
      assert.equal(report.sourceIdentity, path.resolve(source));
      assert.equal(report.resolvedUrl, null, 'local sources carry no resolved remote URL');
      assert.equal(report.destRel, '.github/agents/dude-local-security-reviewer.agent.md');

      // Portable, non-network Windows-drive guard: a drive-letter path stays on
      // the local branch (surfacing a filesystem error), never rerouted into
      // remote authorization.
      await assert.rejects(
        analyze({ source: String.raw`C:\Users\dev\SKILL.md`, root }),
        (err) => !/invalid remote import URL/.test(err.message),
        'Windows-drive local path must not be treated as a remote URL'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('analyze refuses remote redirects without inspecting destinations', async () => {
  const root = tmpRoot();
  const source = 'https://raw.githubusercontent.com/example/reviewers/main/agents/security-reviewer.agent.md';
  const destination = path.join(root, '.github', 'agents', 'dude-local-security-reviewer.agent.md');
  const rootSentinel = path.join(root, 'root-sentinel.bin');
  const destinationBytes = Buffer.from('preserve remote destination\r\n');
  const rootBytes = Buffer.from('preserve remote root\r\n');
  const originalFetch = globalThis.fetch;
  try {
    fs.writeFileSync(destination, destinationBytes);
    fs.writeFileSync(rootSentinel, rootBytes);
    globalThis.fetch = async (_input, init) => {
      if (init?.redirect === 'error') throw new Error('redirect refused by test fetch');
      return new Response(SOURCE_AGENT, { status: 200 });
    };

    await assert.rejects(analyze({ source, root }), /redirect refused by test fetch/i);
    assert.deepEqual(fs.readFileSync(destination), destinationBytes);
    assert.deepEqual(fs.readFileSync(rootSentinel), rootBytes);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remote reads enforce the 1 MiB streaming cap before destination mutation', async (t) => {
  const byteLimit = 1_048_576;
  const source = 'https://raw.githubusercontent.com/example/reviewers/main/agents/security-reviewer.agent.md';
  const sourcePrefix = Buffer.from(SOURCE_AGENT);
  const exactBytes = Buffer.concat([sourcePrefix, Buffer.alloc(byteLimit - sourcePrefix.length, 0x20)]);
  const oversizedBytes = Buffer.concat([exactBytes, Buffer.from('x')]);

  await t.test('exactly 1 MiB is accepted', async () => {
    const root = tmpRoot();
    const destination = path.join(root, '.github', 'agents', 'dude-local-security-reviewer.agent.md');
    const sentinel = Buffer.from('preserve exact-cap destination\n');
    const originalFetch = globalThis.fetch;
    try {
      fs.writeFileSync(destination, sentinel);
      globalThis.fetch = async () => new Response(exactBytes, { status: 200 });

      const report = await analyze({ source, root });
      assert.equal(report.kind, 'agent');
      assert.equal(report.sourceIdentity, source);
      assert.deepEqual(fs.readFileSync(destination), sentinel);
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [name, contentLength, streamBody] of [
    ['1 MiB + 1 without Content-Length is rejected', null, true],
    ['1 MiB + 1 with a lying-small Content-Length is rejected', '16', false],
  ]) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const destination = path.join(root, '.github', 'agents', 'dude-local-security-reviewer.agent.md');
      const sentinel = Buffer.from('preserve oversize destination\n');
      const originalFetch = globalThis.fetch;
      let bodyCancelled = false;
      let requestSignal;
      try {
        fs.writeFileSync(destination, sentinel);
        globalThis.fetch = async (_input, init) => {
          requestSignal = init?.signal;
          if (!streamBody) {
            return new Response(oversizedBytes, {
              status: 200,
              headers: { 'Content-Length': contentLength },
            });
          }

          let chunkIndex = 0;
          const body = new ReadableStream({
            pull(controller) {
              if (chunkIndex === 0) {
                controller.enqueue(exactBytes);
                chunkIndex++;
              } else if (chunkIndex === 1) {
                controller.enqueue(Buffer.from('x'));
                chunkIndex++;
                setImmediate(() => {
                  try {
                    controller.close();
                  } catch {}
                });
              }
            },
            cancel() {
              bodyCancelled = true;
            },
          });
          return new Response(body, { status: 200 });
        };

        await assert.rejects(
          analyze({ source, root }),
          /remote import source exceeds.*(?:1 MiB|1048576)/i
        );
        assert.deepEqual(fs.readFileSync(destination), sentinel);
        if (streamBody) {
          assert.equal(bodyCancelled || requestSignal?.aborted, true, 'oversize read must cancel or abort');
        }
      } finally {
        globalThis.fetch = originalFetch;
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('analyze rejects invalid skill names before destination inspection or mutation', async (t) => {
  for (const [name, skillName, unsafeRelativePath] of [
    ['slash', 'unsafe/nested', 'dude-local-unsafe'],
    ['encoded separator', 'unsafe%2Fname', 'dude-local-unsafe%2Fname'],
  ]) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const external = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-import-external-'));
      const source = path.join(root, 'incoming', 'SKILL.md');
      const unsafeDestination = path.join(root, '.github', 'skills', unsafeRelativePath);
      const rootSentinel = path.join(root, 'root-sentinel.bin');
      const externalSentinel = path.join(external, 'external-sentinel.bin');
      const sourceBytes = Buffer.from(SOURCE_SKILL.replace('dude-pack-release-notes', skillName));
      const rootBytes = Buffer.from('preserve local root\r\n');
      const externalBytes = Buffer.from('preserve external root\r\n');
      try {
        fs.mkdirSync(path.dirname(source), { recursive: true });
        fs.writeFileSync(source, sourceBytes);
        fs.writeFileSync(rootSentinel, rootBytes);
        fs.writeFileSync(externalSentinel, externalBytes);
        fs.symlinkSync(external, unsafeDestination, 'dir');

        await assert.rejects(analyze({ source, root }), /invalid skill name/i);
        assert.deepEqual(fs.readFileSync(source), sourceBytes);
        assert.deepEqual(fs.readFileSync(rootSentinel), rootBytes);
        assert.deepEqual(fs.readFileSync(externalSentinel), externalBytes);
        assert.deepEqual(fs.readdirSync(external), ['external-sentinel.bin']);
        assert.equal(fs.readlinkSync(unsafeDestination), external);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(external, { recursive: true, force: true });
      }
    });
  }
});

test('applyPlan revalidates a changed skill name before destination preflight', async () => {
  const root = tmpRoot();
  const source = path.join(root, 'incoming', 'SKILL.md');
  try {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, SOURCE_SKILL);
    const plan = reviewPlan(await analyze({ source, root }));
    const destination = path.join(root, plan.destRel);
    const destinationBytes = Buffer.from('preserve planned skill destination\r\n');
    const invalidSource = Buffer.from(SOURCE_SKILL.replace('dude-pack-release-notes', 'unsafe/name'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, destinationBytes);
    fs.writeFileSync(source, invalidSource);
    plan.sourceSha256 = crypto.createHash('sha256').update(invalidSource).digest('hex');

    await assert.rejects(applyPlan({ source, root, plan }), /invalid skill name/i);
    assert.deepEqual(fs.readFileSync(destination), destinationBytes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan binds exact source identity and bytes before mutation', async (t) => {
  await t.test('equivalent absolute local paths share one canonical identity', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'security-reviewer.agent.md');
    const equivalentSource = path.join(root, 'incoming', 'unused', '..', 'security-reviewer.agent.md');
    try {
      fs.mkdirSync(path.join(root, 'incoming', 'unused'), { recursive: true });
      fs.writeFileSync(source, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));

      const result = await applyPlan({ source: equivalentSource, root, plan });
      assert.equal(result.written, plan.destRel);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('a different local path with identical bytes is rejected', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'first', 'security-reviewer.agent.md');
    const otherSource = path.join(root, 'second', 'security-reviewer.agent.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.mkdirSync(path.dirname(otherSource), { recursive: true });
      fs.writeFileSync(source, SOURCE_AGENT);
      fs.writeFileSync(otherSource, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));

      await assertRejectedWithSentinel({ root, source: otherSource, plan, pattern: /source identity/i });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('a mutated source identity snapshot is rejected before parent creation', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL);
      const plan = reviewPlan(await analyze({ source, root }));
      const parent = path.dirname(path.join(root, plan.destRel));
      plan.sourceIdentity = path.join(root, 'other', 'SKILL.md');
      assert.equal(fs.existsSync(parent), false);

      await assert.rejects(applyPlan({ source, root, plan }), /source identity/i);
      assert.equal(fs.existsSync(parent), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('a mutated source hash snapshot is rejected before parent creation', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, SOURCE_SKILL);
      const plan = reviewPlan(await analyze({ source, root }));
      const parent = path.dirname(path.join(root, plan.destRel));
      plan.sourceSha256 = '0'.repeat(64);
      assert.equal(fs.existsSync(parent), false);

      await assert.rejects(applyPlan({ source, root, plan }), /source SHA-256/i);
      assert.equal(fs.existsSync(parent), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('applyPlan rejects source byte drift and preserves existing targets', async (t) => {
  const driftCases = [
    ['body drift', SOURCE_AGENT, SOURCE_AGENT.replace('You are a security reviewer.', 'You are a changed reviewer.')],
    ['frontmatter drift', SOURCE_AGENT, SOURCE_AGENT.replace('Security Reviewer', 'Changed Reviewer')],
    [
      'added license',
      SOURCE_AGENT_WITHOUT_LICENSE,
      SOURCE_AGENT_WITHOUT_LICENSE.replace('---\r\nYou are', 'license: MIT\r\n---\r\nYou are'),
    ],
    ['removed license', SOURCE_AGENT, SOURCE_AGENT_WITHOUT_LICENSE],
    ['changed license', SOURCE_AGENT, SOURCE_AGENT.replace('license: MIT', 'license: Apache-2.0')],
    [
      'added tools',
      SOURCE_AGENT_WITHOUT_TOOLS,
      SOURCE_AGENT_WITHOUT_TOOLS.replace('license: MIT', 'tools:\r\n  - Read\r\nlicense: MIT'),
    ],
    ['removed tools', SOURCE_AGENT, SOURCE_AGENT_WITHOUT_TOOLS],
    ['changed tools', SOURCE_AGENT, SOURCE_AGENT.replace('  - Bash', '  - Write')],
    ['line endings', SOURCE_AGENT, SOURCE_AGENT.replaceAll('\r\n', '\n')],
  ];

  for (const [name, analyzedBytes, currentBytes] of driftCases) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'security-reviewer.agent.md');
      try {
        fs.writeFileSync(source, analyzedBytes);
        const plan = reviewPlan(await analyze({ source, root }));
        fs.writeFileSync(source, currentBytes);

        await assertRejectedWithSentinel({ root, source, plan, pattern: /source SHA-256/i });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('applyPlan requires an exact mechanical plan snapshot', async (t) => {
  const mutations = [
    ['kind', (plan) => { plan.kind = 'skill'; }],
    ['destination', (plan) => { plan.destRel = '.github/agents/dude-local-other.agent.md'; }],
    ['license requirement', (plan) => { plan.requiresLicenseDecision = false; }],
    ['tools presence', (plan) => { plan.frontmatter.toolsPresent = false; }],
    ['license presence', (plan) => { plan.frontmatter.hasLicense = false; }],
    ['strip order', (plan) => { plan.frontmatter.strip = ['model', 'compatibility']; }],
    ['strip extra key', (plan) => { plan.frontmatter.strip = ['compatibility', 'model', 'description']; }],
    ['strip license key', (plan) => { plan.frontmatter.strip = ['compatibility', 'model', 'license']; }],
  ];

  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'security-reviewer.agent.md');
      try {
        fs.writeFileSync(source, SOURCE_AGENT);
        const plan = reviewPlan(await analyze({ source, root }));
        mutate(plan);

        await assertRejectedWithSentinel({ root, source, plan, pattern: /mechanical plan snapshot/i });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  const malformedSnapshots = [
    ['missing frontmatter snapshot', (plan) => { delete plan.frontmatter; }],
    ['null frontmatter snapshot', (plan) => { plan.frontmatter = null; }],
    ['non-array strip snapshot', (plan) => { plan.frontmatter.strip = 'compatibility,model'; }],
    ['missing tools snapshot', (plan) => { delete plan.frontmatter.toolsPresent; }],
  ];

  for (const [name, mutate] of malformedSnapshots) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'security-reviewer.agent.md');
      try {
        fs.writeFileSync(source, SOURCE_AGENT);
        const plan = reviewPlan(await analyze({ source, root }));
        mutate(plan);

        await assertRejectedWithSentinel({ root, source, plan, pattern: /mechanical plan snapshot/i });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('applyPlan validates reviewed tool and license decisions', async (t) => {
  const invalidToolDecisions = [
    ['missing tools decision', (plan) => { delete plan.strip_tools; }],
    ['string tools decision', (plan) => { plan.strip_tools = 'true'; }],
  ];
  for (const [name, mutate] of invalidToolDecisions) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'security-reviewer.agent.md');
      try {
        fs.writeFileSync(source, SOURCE_AGENT);
        const plan = reviewPlan(await analyze({ source, root }));
        mutate(plan);
        await assertRejectedWithSentinel({ root, source, plan, pattern: /strip_tools.*boolean/i });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  await t.test('true tools decision is rejected when current source has no tools', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT_WITHOUT_TOOLS);
      const plan = reviewPlan(await analyze({ source, root }));
      plan.strip_tools = true;
      await assertRejectedWithSentinel({ root, source, plan, pattern: /strip_tools.*no tools/i });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const invalidLicenseDecisions = [
    ['missing license decision', (plan) => { delete plan.license_disposition; }, /structured license_disposition is required/i],
    ['free-form license decision', (plan) => { plan.license_disposition = 'reviewed'; }, /license_disposition must exactly bind/i],
    ['wrong license value', (plan) => { plan.license_disposition.license = 'Apache-2.0'; }, /license_disposition must exactly bind/i],
    ['wrong materialization', (plan) => { plan.license_disposition.materialization = 'keep-frontmatter'; }, /license_disposition must exactly bind/i],
  ];
  for (const [name, mutate, pattern] of invalidLicenseDecisions) {
    await t.test(name, async () => {
      const root = tmpRoot();
      const source = path.join(root, 'security-reviewer.agent.md');
      try {
        fs.writeFileSync(source, SOURCE_AGENT);
        const plan = reviewPlan(await analyze({ source, root }));
        mutate(plan);
        await assertRejectedWithSentinel({ root, source, plan, pattern });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  await t.test('license decision is rejected when current source has no license', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT_WITHOUT_LICENSE);
      const plan = reviewPlan(await analyze({ source, root }));
      plan.license_disposition = {
        license: 'MIT',
        materialization: 'agent-source-license-section',
      };
      await assertRejectedWithSentinel({ root, source, plan, pattern: /license_disposition.*no license/i });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('applyPlan uses recomputed strip keys and valid reviewed controls', async (t) => {
  await t.test('true strips tools and always-strip keys while materializing license', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));
      plan.strip_tools = true;

      const result = await applyPlan({ source, root, plan });
      const body = fs.readFileSync(path.join(root, result.written), 'utf8');
      assert.doesNotMatch(body, /^(?:compatibility|model|tools|license):/m);
      assert.match(body, /\n## Source License\n\nMIT\n$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('false preserves tools while always-strip keys are removed', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source, root }));
      plan.strip_tools = false;

      const result = await applyPlan({ source, root, plan });
      const body = fs.readFileSync(path.join(root, result.written), 'utf8');
      assert.doesNotMatch(body, /^(?:compatibility|model):/m);
      assert.match(body, /^tools:$/m);
      assert.match(body, /^  - Bash$/m);
      assert.doesNotMatch(body, /^license:/m);
      assert.match(body, /\n## Source License\n\nMIT\n$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('false is the explicit valid default when tools are absent', async () => {
    const root = tmpRoot();
    const source = path.join(root, 'security-reviewer.agent.md');
    try {
      fs.writeFileSync(source, SOURCE_AGENT_WITHOUT_TOOLS);
      const plan = reviewPlan(await analyze({ source, root }));
      assert.equal(plan.strip_tools, false);

      const result = await applyPlan({ source, root, plan });
      assert.equal(fs.existsSync(path.join(root, result.written)), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('applyPlan refuses without structured review decisions, then writes stripped+normalized', async () => {
  const root = tmpRoot();
  const srcFile = path.join(root, 'security-reviewer.agent.md');
  try {
    fs.writeFileSync(srcFile, SOURCE_AGENT);
    const plan = await analyze({ source: srcFile, root });
    await assert.rejects(applyPlan({ source: srcFile, root, plan }), /structured license_disposition/);
    reviewPlan(plan);
    const r = await applyPlan({ source: srcFile, root, plan });
    assert.equal(r.written, '.github/agents/dude-local-security-reviewer.agent.md');
    const body = fs.readFileSync(path.join(root, r.written), 'utf8');
    assert.ok(!body.includes('\r'), 'normalized to LF');
    assert.ok(!/compatibility:|model:|tools:|license:/.test(body), 'stripped frontmatter fields');
    assert.ok(/name: Security Reviewer/.test(body), 'kept name');
    assert.match(body, /\n## Source License\n\nMIT\n$/);
    assert.ok(body.endsWith('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan writes beside retired-root content without changing it', async () => {
  const root = tmpRoot();
  const srcFile = path.join(root, 'security-reviewer.agent.md');
  try {
    fs.writeFileSync(srcFile, SOURCE_AGENT);
    const retiredFiles = [
      ['brief/notes.md', '# Notes\n'],
      ['.dude/brief/archive.md', '# Archive\n'],
      ['specs/example/spec.md', '# Example\n'],
      ['.github/dudestuff/context.md', '# Context\n'],
    ];
    for (const [relative, content] of retiredFiles) {
      const retiredPath = path.join(root, relative);
      fs.mkdirSync(path.dirname(retiredPath), { recursive: true });
      fs.writeFileSync(retiredPath, content);
    }
    const plan = reviewPlan(await analyze({ source: srcFile, root }));

    const result = await applyPlan({ source: srcFile, root, plan });

    assert.equal(result.written, plan.destRel);
    assert.equal(fs.existsSync(path.join(root, plan.destRel)), true);
    for (const [relative, content] of retiredFiles) {
      assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), content);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan accepts canonical ideas and creates the intended artifact', async () => {
  const root = tmpRoot();
  const srcFile = path.join(root, 'security-reviewer.agent.md');
  try {
    fs.writeFileSync(srcFile, SOURCE_AGENT);
    const ideaPath = path.join(root, '.dude/ideas/security-review.md');
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.writeFileSync(ideaPath, '# Canonical idea\n');
    const plan = reviewPlan(await analyze({ source: srcFile, root }));

    const result = await applyPlan({ source: srcFile, root, plan });

    assert.equal(result.written, plan.destRel);
    assert.equal(fs.existsSync(path.join(root, plan.destRel)), true);
    assert.equal(fs.readFileSync(ideaPath, 'utf8'), '# Canonical idea\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyPlan binds the analyzed source to its canonical import destination', async (t) => {
  await t.test('valid analyzed agent and skill plans write their normalized destinations', async () => {
    const root = tmpRoot();
    const agentSource = path.join(root, 'security-reviewer.agent.md');
    const skillSource = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.writeFileSync(agentSource, SOURCE_AGENT);
      fs.mkdirSync(path.dirname(skillSource), { recursive: true });
      fs.writeFileSync(skillSource, SOURCE_SKILL);

      const agentPlan = reviewPlan(await analyze({ source: agentSource, root }));
      const agentResult = await applyPlan({ source: agentSource, root, plan: agentPlan });
      assert.equal(agentResult.written, '.github/agents/dude-local-security-reviewer.agent.md');
      assert.equal(fs.existsSync(path.join(root, agentResult.written)), true);

      const skillPlan = reviewPlan(await analyze({ source: skillSource, root }));
      const skillResult = await applyPlan({ source: skillSource, root, plan: skillPlan });
      assert.equal(skillResult.written, '.github/skills/dude-local-release-notes/SKILL.md');
      assert.equal(fs.existsSync(path.join(root, skillResult.written)), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('a mutated memory destination is rejected without changing existing bytes', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'security-reviewer.agent.md');
    const memoryPath = path.join(root, '.dude', 'memory', 'context.md');
    const originalMemory = Buffer.from('# Durable context\r\nPreserve these bytes.\r\n');
    try {
      fs.writeFileSync(srcFile, SOURCE_AGENT);
      fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
      fs.writeFileSync(memoryPath, originalMemory);
      const plan = reviewPlan(await analyze({ source: srcFile, root }));
      plan.destRel = '.dude/memory/context.md';

      await assert.rejects(
        applyPlan({ source: srcFile, root, plan }),
        /destination\/source mismatch/i
      );
      assert.deepEqual(fs.readFileSync(memoryPath), originalMemory);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('an agent plan cannot create a cross-kind local skill destination', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'security-reviewer.agent.md');
    const crossKindParent = path.join(root, '.github', 'skills', 'dude-local-security-reviewer');
    try {
      fs.writeFileSync(srcFile, SOURCE_AGENT);
      const plan = reviewPlan(await analyze({ source: srcFile, root }));
      plan.destRel = '.github/skills/dude-local-security-reviewer/SKILL.md';
      assert.equal(fs.existsSync(crossKindParent), false);

      await assert.rejects(
        applyPlan({ source: srcFile, root, plan }),
        /destination\/source mismatch/i
      );
      assert.equal(fs.existsSync(crossKindParent), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('source kind drift after analysis is rejected', async () => {
    const root = tmpRoot();
    const agentSource = path.join(root, 'security-reviewer.agent.md');
    const skillSource = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.writeFileSync(agentSource, SOURCE_AGENT);
      fs.mkdirSync(path.dirname(skillSource), { recursive: true });
      fs.writeFileSync(skillSource, SOURCE_SKILL);
      const plan = reviewPlan(await analyze({ source: agentSource, root }));

      await assert.rejects(
        applyPlan({ source: skillSource, root, plan }),
        /destination\/source mismatch/i
      );
      assert.equal(fs.existsSync(path.join(root, plan.destRel)), false);
      assert.equal(fs.existsSync(path.join(root, '.github/skills/dude-local-release-notes')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('an unknown current source is rejected', async () => {
    const root = tmpRoot();
    const analyzedSource = path.join(root, 'security-reviewer.agent.md');
    const currentSource = path.join(root, 'notes.md');
    try {
      fs.writeFileSync(analyzedSource, SOURCE_AGENT);
      fs.writeFileSync(currentSource, 'plain notes\n');
      const plan = reviewPlan(await analyze({ source: analyzedSource, root }));

      await assert.rejects(
        applyPlan({ source: currentSource, root, plan }),
        /destination\/source mismatch/i
      );
      assert.equal(fs.existsSync(path.join(root, plan.destRel)), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('source destination drift after analysis is rejected before parent creation', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'incoming', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      fs.writeFileSync(srcFile, SOURCE_SKILL);
      const plan = await analyze({ source: srcFile, root });
      const plannedParent = path.dirname(path.join(root, plan.destRel));
      fs.writeFileSync(srcFile, SOURCE_SKILL.replace('dude-pack-release-notes', 'dude-pack-change-summary'));
      assert.equal(fs.existsSync(plannedParent), false);

      await assert.rejects(
        applyPlan({ source: srcFile, root, plan }),
        /destination\/source mismatch/i
      );
      assert.equal(fs.existsSync(plannedParent), false);
      assert.equal(fs.existsSync(path.join(root, '.github/skills/dude-local-change-summary')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

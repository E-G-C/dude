// @ts-check
/**
 * Integration test for the beads pack script. Because beads.mjs imports the core
 * engine at `../dude-engine/lib/...` (a path that only resolves once installed
 * under `.github/skills/`), this test STAGES the installed layout in a temp dir
 * and spawns the script — exactly how it runs after `@dude add pack beads`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const engineSrc = path.join(repo, '.github', 'skills', 'dude-engine');
const beadsSrc = path.join(here, 'beads.mjs');

const FIXTURE = `## Setup
- [x] T001@aaaaaaaa Setup

## Foundational
- [ ] T002@bbbbbbbb [US1] Schema
   deps: T001@aaaaaaaa

## User Story 1
- [~] T003@cccccccc [US1] Build
`;

/** @param {string} src @param {string} dest */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

/** Stage the installed .github/skills layout + a tasks.md fixture. */
function stage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-beads-'));
  const skills = path.join(root, '.github', 'skills');
  copyDir(engineSrc, path.join(skills, 'dude-engine'));
  fs.mkdirSync(path.join(skills, 'dude-pack-beads-workflow'), { recursive: true });
  fs.copyFileSync(beadsSrc, path.join(skills, 'dude-pack-beads-workflow', 'beads.mjs'));
  const file = path.join(root, 'tasks.md');
  fs.writeFileSync(file, FIXTURE);
  return { root, script: path.join(skills, 'dude-pack-beads-workflow', 'beads.mjs'), file };
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('beads.mjs resolves the core engine post-install and plans an import', () => {
  const { root, script, file } = stage();
  try {
    const r = runNode(script, ['plan-import', file, '--spec', 'specs/x/spec.md', '--json']);
    assert.equal(r.code, 0, r.out);
    const plan = JSON.parse(r.out);
    // T001 is done -> skipped; T002 + T003 open
    assert.deepEqual(plan.skipped_done, ['T001@aaaaaaaa']);
    assert.deepEqual(plan.issues.map((i) => i.key).sort(), ['T002@bbbbbbbb', 'T003@cccccccc']);
    // dep among open tasks: US1 (T003) depends on Foundational (T002); the
    // explicit T002->T001 edge is dropped because T001 is already done.
    assert.ok(plan.deps.some((e) => e.from === 'T003@cccccccc' && e.to === 'T002@bbbbbbbb'));
    assert.ok(!plan.deps.some((e) => e.to === 'T001@aaaaaaaa'));
    // each issue description carries the canonical identity + priority
    assert.ok(plan.issues.every((i) => i.description.startsWith('spec: specs/x/spec.md')));
    assert.ok(plan.epic.status === 'deferred');
    assert.ok(plan.commands.some((c) => c.startsWith('bd create') && c.includes('-t epic')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs plan-import refuses a malformed tasks.md', () => {
  const { root, script, file } = stage();
  try {
    fs.writeFileSync(file, '## Setup\n- [ ] T001@aaaaaaaa ok\n- [z] T002@bbbbbbbb bad glyph\n');
    const r = runNode(script, ['plan-import', file, '--spec', 'specs/x/spec.md']);
    assert.equal(r.code, 2);
    assert.match(r.out, /structural issues|malformed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror applies bd statuses back into tasks.md', () => {
  const { root, script, file } = stage();
  try {
    const bd = [
      { title: 'T002@bbbbbbbb Schema', description: 'spec: specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
      { title: 'x', description: 'T003@cccccccc build', status: 'in_progress' },
      { title: 'unrelated', description: 'T999@zzzzzzzz ghost', status: 'open' },
    ];
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify(bd));
    const r = runNode(script, ['mirror', file, '--from', bdFile, '--write']);
    assert.equal(r.code, 0, r.out);
    const out = fs.readFileSync(file, 'utf8');
    assert.ok(out.includes('- [x] T002@bbbbbbbb [US1] Schema'), out);
    assert.match(r.out, /bd issue key not in tasks.md: T999@zzzzzzzz/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

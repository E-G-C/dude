// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ENGINE_PATHS,
  WORKSPACE_PATHS,
  resolveMutationPath,
  resolveWorkspacePath,
} from './workspace-paths.mjs';

test('workspace path constants encode the canonical contract', () => {
  assert.equal(WORKSPACE_PATHS.IDEAS_DIR, '.dude/ideas');
  assert.equal(WORKSPACE_PATHS.SPECS_DIR, '.dude/specs');
  assert.equal(WORKSPACE_PATHS.TASK_STATE, '.dude/state/task-state.json');
  assert.equal(WORKSPACE_PATHS.BUNDLE_MANIFEST, '.dude/metadata/bundle-manifest.md');
  assert.equal(ENGINE_PATHS.SKILLS_DIR, '.github/skills');
});

test('resolveWorkspacePath accepts safe relative paths and rejects traversal', () => {
  const root = path.resolve('/tmp/dude-workspace-paths');
  assert.equal(
    resolveWorkspacePath(root, '.dude/specs/x/spec.md'),
    path.join(root, '.dude/specs/x/spec.md'),
  );
  assert.throws(() => resolveWorkspacePath(root, '../outside'), /unsafe workspace-relative path/);
  assert.throws(() => resolveWorkspacePath(root, '/tmp/outside'), /unsafe workspace-relative path/);
  assert.throws(() => resolveWorkspacePath(root, 'specs/./x'), /unsafe workspace-relative path/);
});

test('resolveMutationPath accepts normal nested targets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-mutation-path-'));
  try {
    fs.mkdirSync(path.join(root, '.dude/specs/001-x'), { recursive: true });
    fs.writeFileSync(path.join(root, '.dude/specs/001-x/tasks.md'), '# Tasks\n');
    assert.equal(
      resolveMutationPath(root, '.dude/specs/001-x/tasks.md'),
      path.join(root, '.dude/specs/001-x/tasks.md'),
    );
    assert.equal(
      resolveMutationPath(root, '.dude/memory/context.md'),
      path.join(root, '.dude/memory/context.md'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveMutationPath rejects descendant and final symlinks', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-mutation-path-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-mutation-outside-'));
  try {
    fs.mkdirSync(path.join(root, '.dude/specs'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, '.dude/specs/001-x'));
    assert.throws(
      () => resolveMutationPath(root, '.dude/specs/001-x/tasks.md'),
      /contains symbolic link.*\.dude\/specs\/001-x/,
    );

    fs.mkdirSync(path.join(root, '.dude/memory'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'context.md'), '# Outside\n');
    fs.symlinkSync(path.join(outside, 'context.md'), path.join(root, '.dude/memory/context.md'));
    assert.throws(
      () => resolveMutationPath(root, '.dude/memory/context.md'),
      /contains symbolic link.*context\.md/,
    );
    assert.equal(fs.readFileSync(path.join(outside, 'context.md'), 'utf8'), '# Outside\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

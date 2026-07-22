// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  authorizeAttempt,
  buildInspection,
  collectEvidence,
  completeAttempt,
} from '../dude-work/recovery.mjs';
import * as atomicRuntime from './atomic-file-batch.mjs';
import {
  applyAtomicFileBatch,
  assertDefinitionRecoveryWritable,
} from './atomic-file-batch.mjs';

/** @typedef {{path: string, type: string, bytes?: string, target?: string}} TreeEntry */

const DEFINITION_SPEC_PATH = '.dude/specs/004-pre-work-log-learning/spec.md';
const DEFINITION_ROOT = DEFINITION_SPEC_PATH.slice(0, -'spec.md'.length);
const DEFINITION_IDEA_PATH = '.dude/ideas/pre-work-log-learning.md';
const DEFINITION_TASK_KEY = 'T008@c9b461e7';

function definitionRecoveryFunction() {
  assert.equal(
    typeof atomicRuntime.applyDefinitionRecovery,
    'function',
    'atomic-file-batch.mjs must export applyDefinitionRecovery',
  );
  return /** @type {(...args: any[]) => any} */ (atomicRuntime.applyDefinitionRecovery);
}

/** @param {string} relativePath @param {string | Buffer} bytes */
function definitionFile(relativePath, bytes) {
  return { relativePath, bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes) };
}

/**
 * @param {string} logEntry
 * @param {{idea?:string,openQuestions?:string,assumptions?:string,newline?:string,terminalNewline?:boolean}} [options]
 */
function definitionOwnerBytes(logEntry, options = {}) {
  const newline = options.newline ?? '\n';
  const text = [
    '---',
    'title: Pre-work Log Learning',
    'slug: pre-work-log-learning',
    'status: defined',
    `spec_path: ${DEFINITION_SPEC_PATH}`,
    '---',
    '',
    '## Idea',
    '',
    options.idea ?? 'Inspect exact work history before acting.',
    '',
    '## Open Questions',
    '',
    options.openQuestions ?? '- None.',
    '',
    '## Assumptions',
    '',
    options.assumptions ?? '- Recovery preserves user intent byte-for-byte.',
    '',
    '## Coordinator Log',
    '',
    `- ${logEntry}`,
  ].join(newline);
  return Buffer.from(options.terminalNewline === false ? text : `${text}${newline}`);
}

/** @param {string} description */
function definitionTasksBytes(description) {
  return Buffer.from([
    '# Tasks',
    '',
    `- [~] ${DEFINITION_TASK_KEY} [Shared] ${description}`,
    '',
    '## Discovered During Execution',
    '- [ ] T9001@aaaaaaaa [Shared] Preserve discovered work',
    '',
    '## Lightweight Execution History',
    '- retained execution event',
    '',
  ].join('\n'));
}

function definitionFixtureBytes() {
  return {
    owner: definitionOwnerBytes('recovery authorized'),
    spec: Buffer.from('# Feature Specification\n\nOriginal requirements.\n'),
    plan: Buffer.from('# Implementation Plan\n\nOriginal design.\n'),
    tasks: definitionTasksBytes('Original final review'),
  };
}

/** @param {string} root @param {ReturnType<typeof definitionFixtureBytes>} bytes */
function writeDefinitionFixture(root, bytes) {
  for (const { relativePath, bytes: content } of [
    definitionFile(DEFINITION_IDEA_PATH, bytes.owner),
    definitionFile(`${DEFINITION_ROOT}spec.md`, bytes.spec),
    definitionFile(`${DEFINITION_ROOT}plan.md`, bytes.plan),
    definitionFile(`${DEFINITION_ROOT}tasks.md`, bytes.tasks),
  ]) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
}

/**
 * @param {ReturnType<typeof definitionFixtureBytes>} expected
 * @param {ReturnType<typeof definitionFixtureBytes>} staged
 */
function definitionChanges(expected, staged) {
  return [
    { path: DEFINITION_IDEA_PATH, expected: expected.owner, staged: staged.owner },
    { path: `${DEFINITION_ROOT}spec.md`, expected: expected.spec, staged: staged.spec },
    { path: `${DEFINITION_ROOT}plan.md`, expected: expected.plan, staged: staged.plan },
    { path: `${DEFINITION_ROOT}tasks.md`, expected: expected.tasks, staged: staged.tasks },
  ];
}

function definitionScope() {
  return [
    DEFINITION_IDEA_PATH,
    `${DEFINITION_ROOT}plan.md`,
    `${DEFINITION_ROOT}spec.md`,
    `${DEFINITION_ROOT}tasks.md`,
  ];
}

/** @param {(root: string) => void} run */
function withTemporaryDirectory(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-atomic-batch-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** @param {string} left @param {string} right */
function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** @param {string} root */
function snapshotTree(root) {
  /** @type {TreeEntry[]} */
  const entries = [];

  /** @param {string} directory @param {string} prefix */
  function visit(directory, prefix) {
    const names = fs.readdirSync(directory).sort(compareBytes);
    for (const name of names) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: 'symlink', target: fs.readlinkSync(absolute) });
      } else if (stat.isDirectory()) {
        entries.push({ path: relative, type: 'directory' });
        visit(absolute, relative);
      } else if (stat.isFile()) {
        entries.push({ path: relative, type: 'file', bytes: fs.readFileSync(absolute).toString('hex') });
      } else {
        entries.push({ path: relative, type: 'other' });
      }
    }
  }

  visit(root, '');
  return entries;
}

/** @param {string} root */
function assertNoAtomicTemps(root) {
  const temporary = snapshotTree(root)
    .map((entry) => entry.path)
    .filter((relative) => relative.split('/').some((name) => name.startsWith('.dude-atomic-')));
  assert.deepEqual(temporary, []);
}

/** @param {string} root @param {ReadonlyArray<TreeEntry>} before */
function assertRestored(root, before) {
  assert.deepEqual(snapshotTree(root), before);
  assertNoAtomicTemps(root);
}

/** @param {string} relativePath @param {Buffer} [staged] */
function missingChange(relativePath, staged = Buffer.from('new')) {
  return { path: relativePath, expected: 'missing', staged };
}

/** @param {() => unknown} action */
function captureError(action) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  assert.fail('expected action to throw');
}

/** @param {string} target @param {string} link */
function createDirectoryLink(target, link) {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

test('replaces and creates exact Buffer bytes in byte-sorted order without mutating inputs', () => {
  withTemporaryDirectory((root) => {
    const replaceExpected = Buffer.from([0x7a, 0x00, 0xff]);
    const replaceStaged = Buffer.from([0x5a, 0xff, 0x00]);
    const asciiStaged = Buffer.from([0x41, 0x0a]);
    const unicodeStaged = Buffer.from([0xc3, 0xa4, 0x00]);
    fs.writeFileSync(path.join(root, 'z.bin'), replaceExpected);

    const unicode = missingChange('\u00e4.bin', unicodeStaged);
    const replace = { path: 'z.bin', expected: replaceExpected, staged: replaceStaged };
    const ascii = missingChange('A.bin', asciiStaged);
    const changes = [unicode, replace, ascii];
    Object.freeze(unicode);
    Object.freeze(replace);
    Object.freeze(ascii);
    Object.freeze(changes);
    const originalObjects = [...changes];
    const originalBuffers = [
      Buffer.from(unicodeStaged),
      Buffer.from(replaceExpected),
      Buffer.from(replaceStaged),
      Buffer.from(asciiStaged),
    ];

    const options = { root, changes };
    Object.freeze(options);
    const result = applyAtomicFileBatch(options);

    assert.deepEqual(result, { count: 3, paths: ['A.bin', 'z.bin', '\u00e4.bin'] });
    assert.deepEqual(fs.readFileSync(path.join(root, 'A.bin')), asciiStaged);
    assert.deepEqual(fs.readFileSync(path.join(root, 'z.bin')), replaceStaged);
    assert.deepEqual(fs.readFileSync(path.join(root, '\u00e4.bin')), unicodeStaged);
    assert.deepEqual(changes, originalObjects);
    assert.strictEqual(changes[0], unicode);
    assert.strictEqual(changes[1], replace);
    assert.strictEqual(changes[2], ascii);
    assert.deepEqual(unicodeStaged, originalBuffers[0]);
    assert.deepEqual(replaceExpected, originalBuffers[1]);
    assert.deepEqual(replaceStaged, originalBuffers[2]);
    assert.deepEqual(asciiStaged, originalBuffers[3]);
    assertNoAtomicTemps(root);
  });
});

test('rejects sparse or open input containers and records without invoking accessors', () => {
  withTemporaryDirectory((root) => {
    let getterCalls = 0;
    const valid = () => missingChange('target.bin');
    const cases = [
      ['a hole in changes', () => ({ root, changes: new Array(1) })],
      ['an accessor in changes', () => {
        const changes = [];
        Object.defineProperty(changes, '0', {
          enumerable: true,
          get() {
            getterCalls += 1;
            return valid();
          },
        });
        return { root, changes };
      }],
      ['an extra changes property', () => {
        const changes = Object.assign([valid()], { extra: true });
        return { root, changes };
      }],
      ['a symbol changes property', () => {
        const changes = [valid()];
        Object.defineProperty(changes, Symbol('extra'), { value: true, enumerable: true });
        return { root, changes };
      }],
      ['a hole in validators', () => ({ root, changes: [valid()], validators: new Array(1) })],
      ['an extra options field', () => ({ root, changes: [valid()], extra: true })],
      ['a non-enumerable options field', () => {
        const options = { changes: [valid()] };
        Object.defineProperty(options, 'root', { value: root, enumerable: false });
        return options;
      }],
      ['a symbol options field', () => {
        const options = { root, changes: [valid()] };
        Object.defineProperty(options, Symbol('extra'), { value: true, enumerable: true });
        return options;
      }],
      ['an options accessor', () => {
        const options = { changes: [valid()] };
        Object.defineProperty(options, 'root', {
          enumerable: true,
          get() {
            getterCalls += 1;
            return root;
          },
        });
        return options;
      }],
      ['an extra change field', () => ({ root, changes: [{ ...valid(), extra: true }] })],
      ['a non-enumerable change field', () => {
        const change = { expected: 'missing', staged: Buffer.from('new') };
        Object.defineProperty(change, 'path', { value: 'target.bin', enumerable: false });
        return { root, changes: [change] };
      }],
      ['a symbol change field', () => {
        const change = valid();
        Object.defineProperty(change, Symbol('extra'), { value: true, enumerable: true });
        return { root, changes: [change] };
      }],
      ['a change accessor', () => {
        const change = { expected: 'missing', staged: Buffer.from('new') };
        Object.defineProperty(change, 'path', {
          enumerable: true,
          get() {
            getterCalls += 1;
            return 'target.bin';
          },
        });
        return { root, changes: [change] };
      }],
    ];

    for (const [name, build] of cases) {
      getterCalls = 0;
      assert.throws(() => applyAtomicFileBatch(build()), { name: 'TypeError' }, name);
      assert.equal(getterCalls, 0, `${name}: getter calls`);
      assert.deepEqual(snapshotTree(root), [], `${name}: filesystem residue`);
    }
  });
});

test('rejects duplicate and ancestor-descendant targets before writing', () => {
  withTemporaryDirectory((root) => {
    const cases = [
      {
        name: 'duplicate targets',
        changes: [missingChange('same'), missingChange('same')],
        expected: /duplicate atomic file path/,
      },
      {
        name: 'ancestor before descendant',
        changes: [missingChange('parent'), missingChange('parent/child')],
        expected: /must not contain one another/,
      },
      {
        name: 'descendant before ancestor',
        changes: [missingChange('parent/child'), missingChange('parent')],
        expected: /must not contain one another/,
      },
    ];

    for (const scenario of cases) {
      assert.throws(
        () => applyAtomicFileBatch({ root, changes: scenario.changes }),
        scenario.expected,
        scenario.name,
      );
      assert.deepEqual(snapshotTree(root), []);
    }
  });
});

test('rejects absolute, dot, backslash, and traversal paths before writing', () => {
  withTemporaryDirectory((root) => {
    const unsafePaths = [
      '/absolute.bin',
      'C:/absolute.bin',
      '.',
      '..',
      './dot.bin',
      'nested/./dot.bin',
      'nested\\backslash.bin',
      '../traversal.bin',
      'nested/../../traversal.bin',
    ];

    for (const unsafePath of unsafePaths) {
      assert.throws(
        () => applyAtomicFileBatch({ root, changes: [missingChange(unsafePath)] }),
        /unsafe workspace-relative path/,
        unsafePath,
      );
      assert.deepEqual(snapshotTree(root), []);
    }
  });
});

test('refuses symlink-backed roots, parents, and targets plus non-file targets and parents', () => {
  const cases = [
    {
      name: 'symlink-backed root',
      setup(base) {
        const actual = path.join(base, 'actual');
        const root = path.join(base, 'root-link');
        fs.mkdirSync(actual);
        createDirectoryLink(actual, root);
        return { root, relativePath: 'target.bin' };
      },
    },
    {
      name: 'symlink-backed parent',
      setup(base) {
        const root = path.join(base, 'root');
        const outside = path.join(base, 'outside');
        fs.mkdirSync(root);
        fs.mkdirSync(outside);
        createDirectoryLink(outside, path.join(root, 'linked'));
        return { root, relativePath: 'linked/target.bin' };
      },
    },
    {
      name: 'symlink-backed target',
      setup(base) {
        const root = path.join(base, 'root');
        const outside = path.join(base, 'outside');
        fs.mkdirSync(root);
        fs.mkdirSync(outside);
        createDirectoryLink(outside, path.join(root, 'target'));
        return { root, relativePath: 'target' };
      },
    },
    {
      name: 'directory target',
      setup(base) {
        const root = path.join(base, 'root');
        fs.mkdirSync(path.join(root, 'target'), { recursive: true });
        return { root, relativePath: 'target' };
      },
    },
    {
      name: 'file parent',
      setup(base) {
        const root = path.join(base, 'root');
        fs.mkdirSync(root);
        fs.writeFileSync(path.join(root, 'parent'), 'not a directory');
        return { root, relativePath: 'parent/target.bin' };
      },
    },
  ];

  for (const scenario of cases) {
    withTemporaryDirectory((base) => {
      const { root, relativePath } = scenario.setup(base);
      const before = snapshotTree(base);
      assert.throws(
        () => applyAtomicFileBatch({ root, changes: [missingChange(relativePath)] }),
        /symbolic link|regular file|non-directory parent/,
        scenario.name,
      );
      assert.deepEqual(snapshotTree(base), before);
    });
  }
});

test('validators receive fresh sorted staged copies while every target remains unchanged', () => {
  withTemporaryDirectory((root) => {
    fs.mkdirSync(path.join(root, 'existing'));
    const prior = Buffer.from([0x6f, 0x6c, 0x64]);
    const created = Buffer.from([0x41, 0x00]);
    const replaced = Buffer.from([0x5a, 0xff]);
    fs.writeFileSync(path.join(root, 'existing/z.bin'), prior);
    let validations = 0;

    applyAtomicFileBatch({
      root,
      changes: [
        { path: 'existing/z.bin', expected: prior, staged: replaced },
        { path: 'created/a.bin', expected: 'missing', staged: created },
      ],
      validators: [
        (view) => {
          validations += 1;
          assert.deepEqual(view.map((entry) => entry.path), ['created/a.bin', 'existing/z.bin']);
          assert.equal(Object.isFrozen(view), true);
          assert.equal(view.every((entry) => Object.isFrozen(entry)), true);
          assert.notStrictEqual(view[0].staged, created);
          assert.notStrictEqual(view[1].staged, replaced);
          assert.deepEqual(fs.readFileSync(path.join(root, 'existing/z.bin')), prior);
          assert.equal(fs.existsSync(path.join(root, 'created/a.bin')), false);
          view[0].staged.fill(0x00);
          view[1].staged.fill(0x00);
        },
        (view) => {
          validations += 1;
          assert.deepEqual(view[0].staged, created);
          assert.deepEqual(view[1].staged, replaced);
          assert.deepEqual(fs.readFileSync(path.join(root, 'existing/z.bin')), prior);
          assert.equal(fs.existsSync(path.join(root, 'created/a.bin')), false);
        },
      ],
    });

    assert.equal(validations, 2);
    assert.deepEqual(fs.readFileSync(path.join(root, 'created/a.bin')), created);
    assert.deepEqual(fs.readFileSync(path.join(root, 'existing/z.bin')), replaced);
    assert.deepEqual(created, Buffer.from([0x41, 0x00]));
    assert.deepEqual(replaced, Buffer.from([0x5a, 0xff]));
    assertNoAtomicTemps(root);
  });
});

test('validator rejection and thenable results restore the tree without residue', () => {
  let thenCalls = 0;
  const cases = [
    {
      name: 'validator rejection',
      validator() {
        throw new Error('validator rejected staged files');
      },
      expected: /validator rejected staged files/,
    },
    {
      name: 'validator thenable',
      validator() {
        return {
          then() {
            thenCalls += 1;
          },
        };
      },
      expected: /validators must be synchronous/,
    },
  ];

  for (const scenario of cases) {
    withTemporaryDirectory((root) => {
      fs.writeFileSync(path.join(root, 'existing.bin'), Buffer.from('old'));
      const before = snapshotTree(root);
      assert.throws(
        () => applyAtomicFileBatch({
          root,
          changes: [
            { path: 'existing.bin', expected: Buffer.from('old'), staged: Buffer.from('changed') },
            missingChange('new/deep/created.bin'),
          ],
          validators: [scenario.validator],
        }),
        scenario.expected,
        scenario.name,
      );
      assertRestored(root, before);
    });
  }
  assert.equal(thenCalls, 0, 'thenable is rejected without invoking then');
});

test('expected mismatch and validator-induced drift refuse before an apply rename', () => {
  withTemporaryDirectory((root) => {
    fs.writeFileSync(path.join(root, 'target.bin'), Buffer.from('actual'));
    const before = snapshotTree(root);
    const events = [];
    assert.throws(
      () => applyAtomicFileBatch({
        root,
        changes: [{
          path: 'target.bin',
          expected: Buffer.from('stale expectation'),
          staged: Buffer.from('replacement'),
        }],
        failureInjector(event) {
          events.push(event);
        },
      }),
      /does not match expected bytes/,
    );
    assert.deepEqual(events, []);
    assertRestored(root, before);
  });

  withTemporaryDirectory((root) => {
    const prior = Buffer.from('prior');
    fs.writeFileSync(path.join(root, 'target.bin'), prior);
    const before = snapshotTree(root);
    const operations = [];
    assert.throws(
      () => applyAtomicFileBatch({
        root,
        changes: [{ path: 'target.bin', expected: prior, staged: Buffer.from('replacement') }],
        validators: [() => fs.writeFileSync(path.join(root, 'target.bin'), 'drift')],
        failureInjector(event) {
          operations.push(event.operation);
        },
      }),
      /does not match expected bytes/,
    );
    assert.equal(operations.includes('rename'), false, 'no staged file was applied');
    assert.equal(operations.includes('rollback-rename'), true, 'validator drift was restored');
    assertRestored(root, before);
  });
});

/** @type {Array<{
 *   name: string,
 *   expected: Buffer | 'missing',
 *   drift: Buffer,
 *   expectedMessage: RegExp,
 * }>} */
const renameDestinationDriftCases = [
  {
    name: 'existing destination byte drift',
    expected: Buffer.from('prior'),
    drift: Buffer.from('foreign replacement'),
    expectedMessage: /does not match expected bytes/,
  },
  {
    name: 'expected-missing destination creation',
    expected: 'missing',
    drift: Buffer.from('foreign creation'),
    expectedMessage: /expected atomic file target to be missing/,
  },
];

for (const scenario of renameDestinationDriftCases) {
  test(`rename seam rejects ${scenario.name} before replacement and restores the tree`, () => {
    withTemporaryDirectory((root) => {
      const target = path.join(root, 'target.bin');
      const staged = Buffer.from('staged replacement');
      if (scenario.expected !== 'missing') fs.writeFileSync(target, scenario.expected);
      const before = snapshotTree(root);
      let renameSeams = 0;

      const error = captureError(() => applyAtomicFileBatch({
        root,
        changes: [scenario.expected === 'missing'
          ? missingChange('target.bin', staged)
          : { path: 'target.bin', expected: scenario.expected, staged }],
        failureInjector(event) {
          if (event.operation === 'rename' && event.path === 'target.bin' && event.index === 0) {
            renameSeams += 1;
            fs.writeFileSync(target, scenario.drift);
          }
        },
      }));

      assert.equal(renameSeams, 1);
      assert.match(error.message, scenario.expectedMessage);
      assertRestored(root, before);
    });
  });
}

test('rename seam rejects staged-byte tampering before replacement and restores the tree', () => {
  withTemporaryDirectory((root) => {
    const before = snapshotTree(root);
    let renameSeams = 0;

    const error = captureError(() => applyAtomicFileBatch({
      root,
      changes: [missingChange('new/deep/target.bin', Buffer.from('staged bytes'))],
      failureInjector(event) {
        if (event.operation !== 'rename'
          || event.path !== 'new/deep/target.bin'
          || event.index !== 0) return;
        renameSeams += 1;
        const parent = path.join(root, 'new/deep');
        const stageTemps = fs.readdirSync(parent)
          .filter((name) => name.startsWith('.dude-atomic-stage-'));
        assert.equal(stageTemps.length, 1);
        fs.writeFileSync(path.join(parent, stageTemps[0]), Buffer.from('tampered bytes'));
      },
    }));

    assert.equal(renameSeams, 1);
    assert.match(error.message, /staged temporary file does not match staged bytes/);
    assertRestored(root, before);
  });
});

test('injected mkdir, stage-write, validate, recheck, and rename failures restore the exact tree', () => {
  const faults = [
    { operation: 'mkdir', path: 'new/deep', index: 1 },
    { operation: 'stage-write', path: 'new/deep/created.bin', index: 1 },
    { operation: 'validate', path: null, index: 0 },
    { operation: 'recheck', path: 'new/deep/created.bin', index: 1 },
    { operation: 'rename', path: 'z-existing.bin', index: 2 },
  ];

  for (const fault of faults) {
    withTemporaryDirectory((root) => {
      const first = Buffer.from('first-original');
      const last = Buffer.from('last-original');
      fs.writeFileSync(path.join(root, 'a-existing.bin'), first);
      fs.writeFileSync(path.join(root, 'z-existing.bin'), last);
      const before = snapshotTree(root);
      let injections = 0;

      assert.throws(
        () => applyAtomicFileBatch({
          root,
          changes: [
            { path: 'z-existing.bin', expected: last, staged: Buffer.from('last-staged') },
            missingChange('new/deep/created.bin', Buffer.from('created-staged')),
            { path: 'a-existing.bin', expected: first, staged: Buffer.from('first-staged') },
          ],
          validators: [() => {}],
          failureInjector(event) {
            if (event.operation === fault.operation
              && event.path === fault.path
              && event.index === fault.index) {
              injections += 1;
              throw new Error(`injected ${fault.operation} failure`);
            }
          },
        }),
        new RegExp(`injected ${fault.operation} failure`),
      );

      assert.equal(injections, 1, `${fault.operation}: deterministic injection point`);
      assertRestored(root, before);
      assert.equal(fs.existsSync(path.join(root, 'new')), false, `${fault.operation}: helper directories`);
    });
  }
});

test('rollback and cleanup faults surface AtomicFileBatchRollbackError distinctly', () => {
  withTemporaryDirectory((root) => {
    const first = Buffer.from('first-original');
    const second = Buffer.from('second-original');
    fs.writeFileSync(path.join(root, 'a.bin'), first);
    fs.writeFileSync(path.join(root, 'b.bin'), second);

    const error = captureError(() => applyAtomicFileBatch({
      root,
      changes: [
        { path: 'a.bin', expected: first, staged: Buffer.from('first-staged') },
        { path: 'b.bin', expected: second, staged: Buffer.from('second-staged') },
      ],
      failureInjector(event) {
        if (event.operation === 'rename' && event.index === 1) {
          throw new Error('primary rename failure');
        }
        if (event.operation === 'rollback-rename' && event.index === 0) {
          throw new Error('rollback rename failure');
        }
      },
    }));

    assert.equal(error.name, 'AtomicFileBatchRollbackError');
    assert.equal(error.code, 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED');
    assert.equal(error.cause?.message, 'primary rename failure');
    assert.ok(error.rollbackErrors.some((entry) => (
      entry.operation === 'restore-target'
      && entry.path === 'a.bin'
      && entry.message === 'rollback rename failure'
    )));
  });

  withTemporaryDirectory((root) => {
    const error = captureError(() => applyAtomicFileBatch({
      root,
      changes: [missingChange('new/deep/created.bin')],
      validators: [() => {}],
      failureInjector(event) {
        if (event.operation === 'validate') throw new Error('primary validation failure');
        if (event.operation === 'cleanup-temp') throw new Error('temporary cleanup failure');
      },
    }));

    assert.equal(error.name, 'AtomicFileBatchRollbackError');
    assert.equal(error.code, 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED');
    assert.equal(error.cause?.message, 'primary validation failure');
    assert.ok(error.rollbackErrors.some((entry) => (
      entry.operation === 'remove-temporary'
      && entry.path === 'new/deep/created.bin'
      && entry.message === 'temporary cleanup failure'
    )));
  });
});

test('retains foreign files and reports incomplete helper-created directory cleanup', () => {
  withTemporaryDirectory((root) => {
    const foreignBytes = Buffer.from('foreign bytes');
    const foreignPath = path.join(root, 'new/deep/foreign.bin');
    let foreignAdds = 0;

    const error = captureError(() => applyAtomicFileBatch({
      root,
      changes: [missingChange('new/deep/created.bin')],
      validators: [() => {}],
      failureInjector(event) {
        if (event.operation === 'validate') throw new Error('primary validation failure');
        if (event.operation === 'cleanup-directory' && event.path === 'new/deep') {
          foreignAdds += 1;
          fs.writeFileSync(foreignPath, foreignBytes);
        }
      },
    }));

    assert.equal(foreignAdds, 1);
    assert.deepEqual(fs.readFileSync(foreignPath), foreignBytes);
    assert.equal(error.name, 'AtomicFileBatchRollbackError');
    assert.equal(error.code, 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED');
    assert.equal(error.cause?.message, 'primary validation failure');
    assert.ok(error.rollbackErrors.some((entry) => (
      entry.operation === 'remove-directory'
      && entry.path === 'new/deep'
    )));
    assertNoAtomicTemps(root);
  });
});

test('tracked definition recovery refuses before filesystem access while lightweight is permitted', () => {
  const methods = [
    'lstatSync',
    'readFileSync',
    'writeFileSync',
    'mkdirSync',
    'openSync',
    'realpathSync',
    'renameSync',
  ];
  const originals = new Map(methods.map((method) => [method, fs[method]]));
  const accesses = [];
  try {
    for (const method of methods) {
      Reflect.set(fs, method, () => {
        accesses.push(method);
        throw new Error(`unexpected filesystem access through ${method}`);
      });
    }

    const error = captureError(() => assertDefinitionRecoveryWritable({ lane: 'tracked' }));
    assert.equal(error.name, 'DefinitionRecoveryRefusalError');
    assert.equal(error.code, 'tracked-definition-recovery-unsupported');
    assert.deepEqual(accesses, []);
  } finally {
    for (const [method, original] of originals) Reflect.set(fs, method, original);
  }

  assert.doesNotThrow(() => assertDefinitionRecoveryWritable({ lane: 'lightweight' }));
});

test('F: applyDefinitionRecovery refuses tracked requests before any filesystem access', () => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  const methods = [
    'lstatSync',
    'readFileSync',
    'writeFileSync',
    'mkdirSync',
    'openSync',
    'realpathSync',
    'renameSync',
    'readdirSync',
  ];
  const originals = new Map(methods.map((method) => [method, fs[method]]));
  const accesses = [];
  const expected = definitionFixtureBytes();
  try {
    for (const method of methods) {
      Reflect.set(fs, method, () => {
        accesses.push(method);
        throw new Error(`unexpected filesystem access through ${method}`);
      });
    }
    const error = captureError(() => applyDefinitionRecovery({
      lane: 'tracked',
      root: '/must-not-be-read',
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(expected, expected),
      validateReconciliation() {},
    }));
    assert.equal(error.code, 'tracked-definition-recovery-unsupported');
    assert.deepEqual(accesses, []);
  } finally {
    for (const [method, original] of originals) Reflect.set(fs, method, original);
  }
});

test('F: applyDefinitionRecovery requires one exact current and staged owner plus reconciliation validation', () => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  const ownerCases = [
    {
      name: 'missing current owner',
      setup(root) {
        fs.rmSync(path.join(root, DEFINITION_IDEA_PATH));
      },
      expected: /owner|defined/i,
    },
    {
      name: 'duplicate current owner',
      setup(root, current) {
        const duplicate = path.join(root, '.dude/ideas/duplicate.md');
        fs.writeFileSync(duplicate, current.owner);
      },
      expected: /owner|duplicate|ambiguous/i,
    },
  ];

  for (const fixture of ownerCases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      writeDefinitionFixture(root, current);
      fixture.setup(root, current);
      const before = snapshotTree(root);
      assert.throws(() => applyDefinitionRecovery({
        lane: 'lightweight',
        root,
        specPath: DEFINITION_SPEC_PATH,
        changes: definitionChanges(current, current),
        validateReconciliation() {},
      }), fixture.expected, fixture.name);
      assertRestored(root, before);
    });
  }

  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    writeDefinitionFixture(root, current);
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- recovery authorized\n',
        '- recovery authorized\n- recovery staged\n',
      )),
    };
    const before = snapshotTree(root);
    assert.throws(() => applyDefinitionRecovery({
      lane: 'lightweight',
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, staged),
    }), /validateReconciliation|reconciliation validator/i);
    assertRestored(root, before);

    const wrongOwner = {
      ...staged,
      owner: definitionOwnerBytes('recovery staged').map((byte) => byte),
    };
    const wrongOwnerText = Buffer.from(wrongOwner.owner).toString('utf8')
      .replace(`spec_path: ${DEFINITION_SPEC_PATH}`, 'spec_path: .dude/specs/999-other/spec.md');
    assert.throws(() => applyDefinitionRecovery({
      lane: 'lightweight',
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, { ...staged, owner: Buffer.from(wrongOwnerText) }),
      validateReconciliation() {},
    }), /owner|spec_path|specification/i);
    assertRestored(root, before);

    const wrongStatusText = staged.owner.toString('utf8')
      .replace('status: defined', 'status: draft');
    assert.throws(() => applyDefinitionRecovery({
      lane: 'lightweight',
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, { ...staged, owner: Buffer.from(wrongStatusText) }),
      validateReconciliation() {},
    }), /owner|status|defined/i);
    assertRestored(root, before);
  });
});

test('F: definition recovery requires exactly owner, spec, plan, and tasks before helper entry', async (context) => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  const scope = definitionScope();
  const cases = [
    ...scope.map((missingPath) => ({
      name: `missing ${missingPath}`,
      mutate(changes) {
        return changes.filter((change) => change.path !== missingPath);
      },
    })),
    {
      name: 'additional runtime path',
      mutate(changes) {
        return [...changes, {
          path: `${DEFINITION_ROOT}notes.md`,
          expected: 'missing',
          staged: Buffer.from('runtime recovery must not create this path\n'),
        }];
      },
    },
    {
      name: 'contracts schema path',
      mutate(changes) {
        return [...changes, {
          path: `${DEFINITION_ROOT}contracts/schemas.md`,
          expected: 'missing',
          staged: Buffer.from('# Explicit definition only\n'),
        }];
      },
    },
    {
      name: 'substituted schema for spec',
      mutate(changes) {
        return changes.map((change) => change.path === `${DEFINITION_ROOT}spec.md`
          ? {
            ...change,
            path: `${DEFINITION_ROOT}contracts/schemas.md`,
            expected: 'missing',
          }
          : change);
      },
    },
  ];

  for (const fixture of cases) {
    await context.test(fixture.name, () => {
      withTemporaryDirectory((root) => {
        const current = definitionFixtureBytes();
        writeDefinitionFixture(root, current);
        const before = snapshotTree(root);
        let helperEvents = 0;
        const error = captureError(() => applyDefinitionRecovery({
          lane: 'lightweight',
          root,
          specPath: DEFINITION_SPEC_PATH,
          changes: fixture.mutate(definitionChanges(current, current)),
          validateReconciliation() {},
          failureInjector() {
            helperEvents += 1;
          },
        }));
        assert.match(error.message, /exact|four|owner|spec|plan|tasks|scope|contracts/i);
        assert.equal(helperEvents, 0, 'scope refusal must precede atomic helper entry');
        assertRestored(root, before);
      });
    });
  }
});

test('F: definition recovery preserves complete user-owned section bytes and boundaries', async (context) => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  const changedCases = [
    ['Idea content', 'Inspect exact work history before acting.', 'Changed intent.'],
    ['Open Questions content', '- None.', '- Which behavior should change?'],
    ['Assumptions content', '- Recovery preserves user intent byte-for-byte.', '- Intent may change.'],
    ['section trailing blank line', '- None.\n\n## Assumptions', '- None.\n\n\n## Assumptions'],
  ];
  for (const [name, beforeText, afterText] of changedCases) {
    await context.test(`rejects changed ${name}`, () => {
      withTemporaryDirectory((root) => {
        const current = definitionFixtureBytes();
        writeDefinitionFixture(root, current);
        const staged = {
          ...current,
          owner: Buffer.from(current.owner.toString('utf8').replace(beforeText, afterText)),
        };
        const before = snapshotTree(root);
        let helperEvents = 0;
        const error = captureError(() => applyDefinitionRecovery({
          lane: 'lightweight',
          root,
          specPath: DEFINITION_SPEC_PATH,
          changes: definitionChanges(current, staged),
          validateReconciliation() {},
          failureInjector() {
            helperEvents += 1;
          },
        }));
        assert.match(error.message, /Idea|Open Questions|Assumptions|user-owned|section|intent|bytes/i);
        assert.equal(helperEvents, 0, 'protected-section refusal must precede atomic helper entry');
        assertRestored(root, before);
      });
    });
  }

  const malformedCases = [
    ['missing Idea', (text) => text.replace('## Idea\n\nInspect exact work history before acting.\n\n', '')],
    ['missing Open Questions', (text) => text.replace('## Open Questions\n\n- None.\n\n', '')],
    ['missing Assumptions', (text) => text.replace('## Assumptions\n\n- Recovery preserves user intent byte-for-byte.\n\n', '')],
    ['duplicate Idea', (text) => text.replace('## Open Questions', '## Idea\n\nDuplicate.\n\n## Open Questions')],
    ['duplicate Open Questions', (text) => text.replace('## Assumptions', '## Open Questions\n\nDuplicate.\n\n## Assumptions')],
    ['duplicate Assumptions', (text) => text.replace('## Coordinator Log', '## Assumptions\n\nDuplicate.\n\n## Coordinator Log')],
    ['reordered sections', (text) => text.replace(
      '## Open Questions\n\n- None.\n\n## Assumptions\n\n- Recovery preserves user intent byte-for-byte.',
      '## Assumptions\n\n- Recovery preserves user intent byte-for-byte.\n\n## Open Questions\n\n- None.',
    )],
    ['malformed fenced boundary', (text) => text.replace(
      'Inspect exact work history before acting.\n\n## Open Questions',
      'Inspect exact work history before acting.\n\n```md\nnot closed\n\n## Open Questions',
    )],
  ];
  for (const [name, mutate] of malformedCases) {
    for (const side of ['expected', 'staged']) {
      await context.test(`rejects ${name} in ${side} owner bytes`, () => {
        withTemporaryDirectory((root) => {
          const valid = definitionFixtureBytes();
          const malformed = {
            ...valid,
            owner: Buffer.from(mutate(valid.owner.toString('utf8'))),
          };
          const expected = side === 'expected' ? malformed : valid;
          const staged = side === 'staged' ? malformed : valid;
          writeDefinitionFixture(root, expected);
          const before = snapshotTree(root);
          let helperEvents = 0;
          const error = captureError(() => applyDefinitionRecovery({
            lane: 'lightweight',
            root,
            specPath: DEFINITION_SPEC_PATH,
            changes: definitionChanges(expected, staged),
            validateReconciliation() {},
            failureInjector() {
              helperEvents += 1;
            },
          }));
          assert.match(error.message, /Idea|Open Questions|Assumptions|section|heading|boundary|owner|defined/i);
          assert.equal(helperEvents, 0, 'malformed-section refusal must precede atomic helper entry');
          assertRestored(root, before);
        });
      });
    }
  }

  for (const fixture of [
    {
      name: 'fenced heading lookalikes',
      current: definitionOwnerBytes('recovery authorized', {
        idea: 'Intent.\n\n```md\n## Open Questions\n## Assumptions\n```',
      }),
      staged: definitionOwnerBytes('recovery staged', {
        idea: 'Intent.\n\n```md\n## Open Questions\n## Assumptions\n```',
      }),
    },
    {
      name: 'CRLF without terminal newline',
      current: definitionOwnerBytes('recovery authorized', { newline: '\r\n', terminalNewline: false }),
      staged: definitionOwnerBytes('recovery staged', { newline: '\r\n', terminalNewline: false }),
    },
  ]) {
    await context.test(`accepts preserved ${fixture.name}`, () => {
      withTemporaryDirectory((root) => {
        const current = { ...definitionFixtureBytes(), owner: fixture.current };
        const staged = { ...current, owner: fixture.staged };
        writeDefinitionFixture(root, current);
        const result = applyDefinitionRecovery({
          lane: 'lightweight',
          root,
          specPath: DEFINITION_SPEC_PATH,
          changes: definitionChanges(current, staged),
          validateReconciliation() {},
        });
        assert.deepEqual(result.paths, definitionScope());
        assert.deepEqual(fs.readFileSync(path.join(root, DEFINITION_IDEA_PATH)), staged.owner);
        assertNoAtomicTemps(root);
      });
    });
  }
});

test('F: applyDefinitionRecovery delegates one sorted batch and restores on reconciliation or apply failure', () => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  const faults = [
    {
      name: 'reconciliation rejection',
      validateReconciliation() {
        throw new Error('reconciliation rejected staged mapping');
      },
      failureInjector: undefined,
      expected: /reconciliation rejected staged mapping/,
    },
    {
      name: 'expected-state drift',
      drift: true,
      failureInjector: undefined,
      expected: /does not match expected bytes/,
    },
    {
      name: 'mid-apply rename failure',
      validateReconciliation() {},
      failureInjector(event) {
        if (event.operation === 'rename' && event.index === 2) {
          throw new Error('injected definition apply failure');
        }
      },
      expected: /injected definition apply failure/,
    },
  ];

  for (const fixture of faults) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = {
        owner: Buffer.from(current.owner.toString('utf8').replace(
          '- recovery authorized\n',
          '- recovery authorized\n- recovery applied\n',
        )),
        spec: Buffer.from('# Feature Specification\n\nRepaired requirements.\n'),
        plan: Buffer.from('# Implementation Plan\n\nRepaired design.\n'),
        tasks: definitionTasksBytes('Repaired final review'),
      };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      assert.throws(() => applyDefinitionRecovery({
        lane: 'lightweight',
        root,
        specPath: DEFINITION_SPEC_PATH,
        changes: definitionChanges(current, staged),
        validateReconciliation: fixture.drift
          ? () => fs.writeFileSync(path.join(root, `${DEFINITION_ROOT}plan.md`), 'foreign drift')
          : fixture.validateReconciliation,
        ...(fixture.failureInjector ? { failureInjector: fixture.failureInjector } : {}),
      }), fixture.expected, fixture.name);
      assertRestored(root, before);
    });
  }
});

test('F: authorized definition repair applies owner/spec/plan/tasks and completes only after all gates', () => {
  const applyDefinitionRecovery = definitionRecoveryFunction();
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const staged = {
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- recovery authorized\n',
        '- recovery authorized\n- recovery applied after reconciliation\n',
      )),
      spec: Buffer.from('# Feature Specification\n\nRepaired requirements without changing intent.\n'),
      plan: Buffer.from('# Implementation Plan\n\nRepaired bounded design.\n'),
      tasks: definitionTasksBytes('Repaired final review findings'),
    };
    writeDefinitionFixture(root, current);

    const target = {
      specPath: DEFINITION_SPEC_PATH,
      lane: 'lightweight',
      taskKey: DEFINITION_TASK_KEY,
    };
    const state = {
      policy: { overall: 3, recovery: 1, recover: true, untilBlocked: false, parallel: 1, mode: 'guarded' },
      overallUsed: 0,
      recoveryUsed: [],
      pending: [],
      completed: [],
    };
    const materialTargets = [
      DEFINITION_IDEA_PATH,
      `${DEFINITION_ROOT}plan.md`,
      `${DEFINITION_ROOT}spec.md`,
      `${DEFINITION_ROOT}tasks.md`,
    ];
    const rawInputs = {
      directIdeas: [{ path: DEFINITION_IDEA_PATH, bytes: current.owner }],
      tasks: { path: `${DEFINITION_ROOT}tasks.md`, bytes: current.tasks },
      lane: { kind: 'lightweight' },
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    };
    const assessment = {
      evidenceHash: buildInspection(target, collectEvidence(target, rawInputs)).evidenceHash,
      intent: 'unchanged',
      action: 'reconcile-derived-definition',
      materialInputs: {
        targets: materialTargets,
        operations: ['reconcile-derived-definition'],
        checks: ['lint', 'review', 'verification'],
      },
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Repair derived definition artifacts without changing intent.',
    };
    const authorized = authorizeAttempt(state, target, rawInputs, assessment, 'recovery');
    assert.equal(authorized.authorized, true);
    assert.deepEqual(authorized.state.pending[0].materialInputs.checks, ['lint', 'review', 'verification']);

    let reconciliationChecks = 0;
    const applied = applyDefinitionRecovery({
      lane: 'lightweight',
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, staged),
      validateReconciliation(view) {
        reconciliationChecks += 1;
        const tasks = view.find((entry) => entry.path === `${DEFINITION_ROOT}tasks.md`)?.staged.toString('utf8');
        assert.match(tasks || '', new RegExp(`\\[~\\] ${DEFINITION_TASK_KEY.replace('@', '\\@')}`));
        assert.match(tasks || '', /Preserve discovered work/);
        assert.match(tasks || '', /retained execution event/);
      },
    });
    assert.equal(reconciliationChecks, 1);
    assert.deepEqual(applied, {
      count: 4,
      paths: [
        DEFINITION_IDEA_PATH,
        `${DEFINITION_ROOT}plan.md`,
        `${DEFINITION_ROOT}spec.md`,
        `${DEFINITION_ROOT}tasks.md`,
      ],
    });
    assert.deepEqual(fs.readFileSync(path.join(root, DEFINITION_IDEA_PATH)), staged.owner);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}spec.md`)), staged.spec);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}plan.md`)), staged.plan);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), staged.tasks);

    const pending = authorized.state.pending[0];
    const completionInput = (checks) => ({
      target,
      evidenceHash: pending.evidenceHash,
      approachHash: pending.approachHash,
      result: {
        target,
        route: 'definition-reconciliation',
        outcome: 'succeeded',
        operations: ['reconcile-derived-definition'],
        changedTargets: materialTargets,
        checks,
      },
    });
    for (const omitted of ['verification', 'lint', 'review']) {
      const checks = {
        verification: omitted === 'verification' ? 'none' : 'passed',
        lint: omitted === 'lint' ? 'none' : 'passed',
        review: omitted === 'review' ? 'none' : 'accepted',
      };
      const refused = completeAttempt(authorized.state, completionInput(checks));
      assert.equal(refused.completed, false, omitted);
      assert.equal(refused.reason, 'action-mismatch', omitted);
      assert.strictEqual(refused.state, authorized.state, omitted);
    }
    const completed = completeAttempt(authorized.state, completionInput({
      verification: 'passed',
      lint: 'passed',
      review: 'accepted',
    }));
    assert.equal(completed.completed, true);
    assert.equal(completed.reason, 'completed');
    assert.equal(completed.state.pending.length, 0);
    assert.equal(completed.state.completed.length, 1);
  });
});

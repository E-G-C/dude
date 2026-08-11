// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  authorizeAttempt,
  buildInspection,
  collectEvidence,
  completeAttempt,
} from '../dude-work/recovery.mjs';
import { BOARD_NOTICE, parseTasks, renderBoard } from '../dude-engine/lib/tasks.mjs';
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
    '<!-- dude:managed:start -->',
    '## Normalized Intent',
    '',
    '- Keep the promised outcome unchanged.',
    '',
    '## Coordinator Log',
    '',
    `- ${logEntry}`,
    '<!-- dude:managed:end -->',
  ].join(newline);
  return Buffer.from(options.terminalNewline === false ? text : `${text}${newline}`);
}

/** @param {string} description */
function definitionTasksBytes(description) {
  return Buffer.from([
    `<!-- audit log: ${DEFINITION_IDEA_PATH}#coordinator-log -->`,
    '',
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
    owner: definitionOwnerBytes('2026-01-01 recovery authorized'),
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

/** @param {string | Buffer} value */
function definitionHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {ReturnType<typeof definitionFixtureBytes>} value */
function definitionBytesByPath(value) {
  return new Map([
    [DEFINITION_IDEA_PATH, value.owner],
    [`${DEFINITION_ROOT}plan.md`, value.plan],
    [`${DEFINITION_ROOT}spec.md`, value.spec],
    [`${DEFINITION_ROOT}tasks.md`, value.tasks],
  ]);
}

/** @param {ReturnType<typeof definitionFixtureBytes>} value */
function definitionDescriptors(value) {
  const bytesByPath = definitionBytesByPath(value);
  return definitionScope().map((relativePath) => {
    const bytes = bytesByPath.get(relativePath);
    assert.ok(bytes);
    return {
      path: relativePath,
      sha256: definitionHash(bytes),
      byteLength: bytes.byteLength,
    };
  });
}

/** @param {ReturnType<typeof definitionDescriptors>} descriptors */
function copyDefinitionDescriptors(descriptors) {
  return descriptors.map((descriptor) => ({ ...descriptor }));
}

/**
 * @param {ReturnType<typeof definitionFixtureBytes>} expected
 * @param {ReturnType<typeof definitionFixtureBytes>} staged
 * @param {{
 *   reconciliation?: (view:ReadonlyArray<Record<string, unknown>>) => unknown,
 *   historyAppend?: Buffer | null,
 *   postApply?: Record<string, Function>,
 *   calls?: Record<string, number>,
 * }} [options]
 */
function definitionRecoveryContract(expected, staged, options = {}) {
  const prestateDescriptors = definitionDescriptors(expected);
  const coordinatorFinalDescriptors = definitionDescriptors(staged);
  const proposalIdentity = definitionHash(`proposal:${JSON.stringify(coordinatorFinalDescriptors)}`);
  const reviewIdentity = definitionHash(`review:${proposalIdentity}`);
  const reconciliationIdentity = definitionHash(`reconciliation:${proposalIdentity}`);
  const binding = {
    proposalIdentity,
    prestateDescriptors: copyDefinitionDescriptors(prestateDescriptors),
    coordinatorFinalDescriptors: copyDefinitionDescriptors(coordinatorFinalDescriptors),
    reconciliationIdentity,
    review: {
      proposalIdentity,
      reviewIdentity,
      coordinatorFinalDescriptors: copyDefinitionDescriptors(coordinatorFinalDescriptors),
    },
  };
  const calls = options.calls ?? {};
  const observe = (name) => { calls[name] = (calls[name] ?? 0) + 1; };
  const identityResult = () => ({
    proposalIdentity,
    coordinatorFinalDescriptors: copyDefinitionDescriptors(coordinatorFinalDescriptors),
  });
  const reviewResult = () => ({
    proposalIdentity,
    reviewIdentity,
    coordinatorFinalDescriptors: copyDefinitionDescriptors(coordinatorFinalDescriptors),
  });
  const gateResult = (gate) => ({
    status: 'passed',
    proposalIdentity,
    reviewIdentity,
    coordinatorFinalDescriptors: copyDefinitionDescriptors(coordinatorFinalDescriptors),
    evidenceIdentity: definitionHash(`${gate}:${proposalIdentity}:${reviewIdentity}`),
  });
  const postApply = Object.freeze(options.postApply ?? {
    recomputeProposalIdentity(context) {
      observe('proposal');
      assert.equal(context.proposalIdentity, proposalIdentity);
      return identityResult();
    },
    validateReviewIdentity(context) {
      observe('review');
      assert.equal(context.reviewIdentity, reviewIdentity);
      return reviewResult();
    },
    lint() {
      observe('lint');
      return gateResult('lint');
    },
    verification() {
      observe('verification');
      return gateResult('verification');
    },
  });
  const validateReconciliation = (view) => {
      observe('reconciliation');
      if (options.reconciliation) {
        const result = options.reconciliation(view);
        if (result !== undefined) return result;
      }
      return {
        reconciliationIdentity,
        historyAppend: options.historyAppend === undefined || options.historyAppend === null
          ? null
          : {
            path: `${DEFINITION_ROOT}tasks.md`,
            bytes: Buffer.from(options.historyAppend),
          },
      };
  };
  return {
    binding,
    validateReconciliation,
    postApply,
  };
}

/** @param {Record<string, unknown>} contract @param {Record<string, unknown>} callbacks */
function replaceDefinitionRecoveryCallbacks(contract, callbacks) {
  return {
    ...contract,
    validateReconciliation: callbacks.validateReconciliation || contract.validateReconciliation,
    postApply: Object.freeze(callbacks.postApply || contract.postApply),
  };
}

/**
 * Drive `applyAtomicFileBatch` under a test-local restatement of the sealed
 * coordinator gate contract. The sealer is module-private, so this helper
 * cannot reach `applyDefinitionRecovery`; it exercises the atomic batch and the
 * reconciliation validator only. The production `validateAppliedDefinitionRecovery`
 * loop is covered by the `T004 integration post-apply` tests in
 * `../dude-work/recovery.test.mjs`, which drive `commitDefinitionRecoveryV1`.
 * @param {string} root
 * @param {ReturnType<typeof definitionFixtureBytes>} expected
 * @param {ReturnType<typeof definitionFixtureBytes>} staged
 * @param {Record<string, unknown>} [overrides]
 */
function applyDefinitionFixture(root, expected, staged, overrides = {}) {
  const { contractOptions, contractOverride, ...requestOverrides } = overrides;
  const contract = contractOverride || definitionRecoveryContract(expected, staged, contractOptions);
  const changes = definitionChanges(expected, staged);
  const transition = atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
    root,
    specPath: DEFINITION_SPEC_PATH,
    changes,
  });
  const exactDescriptors = (actual, expectedRows, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expectedRows)) {
      throw new Error(`${label} do not match exact artifact bytes`);
    }
  };
  exactDescriptors(
    contract.binding.prestateDescriptors,
    transition.prestateDescriptors,
    'definition recovery prestate descriptors',
  );
  exactDescriptors(
    contract.binding.coordinatorFinalDescriptors,
    transition.finalDescriptors,
    'definition recovery coordinator-final descriptors',
  );
  exactDescriptors(
    contract.binding.review.coordinatorFinalDescriptors,
    transition.finalDescriptors,
    'definition recovery review descriptors',
  );
  const expectedHistoryAppend = transition.historyAppend === null
    ? null
    : Buffer.from(transition.historyAppend.base64, 'base64');
  const validateEvidence = (evidence) => {
    assert.equal(evidence.reconciliationIdentity, contract.binding.reconciliationIdentity);
    if (expectedHistoryAppend === null) {
      assert.equal(evidence.historyAppend, null);
      return;
    }
    if (evidence.historyAppend === null || typeof evidence.historyAppend !== 'object') {
      throw new Error('reconciliation did not authorize the exact history archive append');
    }
    assert.equal(evidence.historyAppend.path, transition.taskPath);
    assert.deepEqual(evidence.historyAppend.bytes, expectedHistoryAppend);
  };
  return applyAtomicFileBatch({
    root,
    changes,
    validators: [(view) => validateEvidence(contract.validateReconciliation(view))],
    ...(requestOverrides.failureInjector
      ? { failureInjector: requestOverrides.failureInjector }
      : {}),
  }, () => {
    atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(staged, staged),
    });
    const context = Object.freeze({
      proposalIdentity: contract.binding.proposalIdentity,
      reviewIdentity: contract.binding.review.reviewIdentity,
      coordinatorFinalDescriptors: Object.freeze(
        copyDefinitionDescriptors(contract.binding.coordinatorFinalDescriptors).map(Object.freeze),
      ),
    });
    const expectedDescriptors = definitionDescriptors(staged);
    for (const field of ['recomputeProposalIdentity', 'validateReviewIdentity', 'lint', 'verification']) {
      const result = contract.postApply[field](context);
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        throw new TypeError(`${field} must be synchronous`);
      }
      if (result.proposalIdentity !== contract.binding.proposalIdentity) {
        throw new Error(`${field} proposal identity does not match the applied proposal`);
      }
      if (field !== 'recomputeProposalIdentity') {
        if (result.reviewIdentity !== contract.binding.review.reviewIdentity) {
          throw new Error(`${field} review identity does not match the independent review`);
        }
      }
      assert.deepEqual(result.coordinatorFinalDescriptors, expectedDescriptors);
      if (field === 'lint' || field === 'verification') {
        assert.equal(result.status, 'passed');
        assert.match(result.evidenceIdentity, /^[0-9a-f]{64}$/);
      }
    }
  });
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

test('T003 repair probe: Feature 014 rejects balanced Coordinator Log prefix corruption', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const stagedOwner = current.owner.toString('utf8')
      .replace(
        '- 2026-01-01 recovery authorized\n',
        '- recovery\n- inserted inside prior event\n- authorized\n',
      );
    const staged = { ...current, owner: Buffer.from(stagedOwner) };
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);

    assert.throws(
      () => applyDefinitionFixture(root, current, staged),
      /staged Coordinator Log must preserve the exact current log prefix/,
    );
    assertRestored(root, before);
  });
});

test('T003 repair probe: Feature 014 rejects one stray managed end with unchanged log', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const staged = {
      ...current,
      owner: Buffer.concat([current.owner, Buffer.from('<!-- dude:managed:end -->\n')]),
    };
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);

    assert.throws(
      () => applyDefinitionFixture(root, current, staged),
      /must contain exactly one balanced active managed region|reversed or stray managed.*end fence/,
    );
    assertRestored(root, before);
  });
});

test('T003 unified Markdown scanner ignores generic comment and inline-code lookalikes', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const opaqueLookalikes = [
      '<!-- opaque generic controls',
      '<!-- dude:managed:start -->',
      '## Coordinator Log',
      '<!-- dude:managed:end -->',
      '-->',
      '',
      '`<!-- dude:managed:start -->` ``## Coordinator Log`` ```<!-- dude:managed:end -->```',
    ].join('\n');
    const ownerText = base.owner.toString('utf8').replace(
      '<!-- dude:managed:start -->',
      `${opaqueLookalikes}\n<!-- dude:managed:start -->`,
    );
    const current = {
      ...base,
      owner: Buffer.from(ownerText),
      spec: Buffer.from(`${base.spec.toString('utf8')}${opaqueLookalikes}\n`),
      plan: Buffer.from(`${base.plan.toString('utf8')}${opaqueLookalikes}\n`),
    };
    const staged = {
      ...current,
      owner: Buffer.from(ownerText.replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- generic scanner lookalikes ignored\n',
      )),
    };
    writeDefinitionFixture(root, current);

    assert.equal(ownerText.match(/^## Coordinator Log$/gm)?.length, 2);
    assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
    assert.deepEqual(
      fs.readFileSync(path.join(root, DEFINITION_IDEA_PATH)),
      staged.owner,
      'only the active Coordinator Log accepts the append',
    );
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}spec.md`)), current.spec);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}plan.md`)), current.plan);
    assertNoAtomicTemps(root);
  });
});

test('T003 paired inline spans keep controls lexically inert', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const fakeRows = (label) => [
      '<!-- dude:board:start -->',
      `<!-- audit log: .dude/ideas/${label}.md#coordinator-log -->`,
      '# Tasks',
      `- [ ] ${DEFINITION_TASK_KEY} [Shared] ${label} duplicate`,
      '    deps: T098@dddddddd',
      '## Discovered During Execution',
      `- [ ] T099@bbbbbbbb [Shared] ${label} discovered`,
      `## Lightweight Execution History ${label} suffix`,
      '<!-- dude:managed:start -->',
      '<!-- dude:managed:end -->',
      '<!-- dude:board:end -->',
    ];
    const opaqueControls = [
      '````md',
      ...fakeRows('four-backtick'),
      '````',
      '',
      '~~~md',
      ...fakeRows('tilde-fence'),
      '~~~',
      '',
      '<!-- multiline task controls',
      ...fakeRows('multiline-comment'),
      '-->',
      '',
      '`<!-- dude:managed:start -->` `<!-- dude:managed:end -->` `<!-- dude:board:start -->`',
      '``<!-- audit log: .dude/ideas/inline.md#coordinator-log -->`` ``# Tasks`` ``## Discovered During Execution`` ``<!-- dude:board:end -->``',
      `\`\`\`- [ ] ${DEFINITION_TASK_KEY} [Shared] inline duplicate\`\`\` \`\`\`    deps: T098@dddddddd\`\`\` \`\`\`## Lightweight Execution History inline suffix\`\`\``,
    ].join('\n');
    const dangerousInlineOpener = '`<!--`';
    const realTaskLine = `- [~] ${DEFINITION_TASK_KEY} [Shared] Real task after paired inline span`;
    const singleTaskSource = base.tasks.toString('utf8').replace(
      '- [ ] T9001@aaaaaaaa [Shared] Preserve discovered work',
      '- No discovered work.',
    );
    let taskText = renderBoard(parseTasks(singleTaskSource));
    taskText = taskText.replace(
      `${BOARD_NOTICE}\n`,
      `${BOARD_NOTICE}\n##\tLightweight\tExecution\tHistory board suffix\n- [ ] T096@ffffffff [Shared] board-contained fake task\n`,
    );
    taskText = taskText
      .replace(
        `- [~] ${DEFINITION_TASK_KEY} [Shared] Original final review`,
        `${opaqueControls}\n${dangerousInlineOpener}\n${realTaskLine}\n-->`,
      )
      .replace(
        '## Lightweight Execution History\n- retained execution event',
        '##\tLightweight\tExecution\tHistory authoritative suffix\n- retained execution event',
      );
    const tasks = Buffer.from(taskText);
    const current = { ...base, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- task scanner lookalikes ignored\n',
      )),
    };
    writeDefinitionFixture(root, current);

    assert.match(taskText, /four-backtick duplicate/);
    assert.match(taskText, /board-contained fake task/);
    assert.match(taskText, /inline duplicate/);
    assert.match(taskText, /deps: T098@dddddddd/);
    assert.match(taskText, /Lightweight\tExecution\tHistory authoritative suffix/);
    assert.ok(
      taskText.indexOf(dangerousInlineOpener) < taskText.indexOf(realTaskLine),
      'the paired inline comment opener precedes the only active canonical task',
    );
    assert.equal(taskText.split('\n').filter((line) => line === realTaskLine).length, 1);
    const result = applyDefinitionFixture(root, current, staged);
    assert.equal(
      result.count,
      4,
      'paired inline duplicate ID and missing dependency remain lexically inert',
    );
    const applied = fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`));
    assert.deepEqual(applied, tasks);
    const appliedText = applied.toString('utf8');
    assert.equal(appliedText.split('\n').filter((line) => line === realTaskLine).length, 1);
    assert.match(appliedText, /^- No discovered work\.$/m);
    assertNoAtomicTemps(root);
  });
});

test('T003 unified Markdown scanner keeps unmatched and mismatched backticks line-local and literal', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const literalBackticks = [
      '` unmatched run',
      '`` mismatched with `',
      '```mismatched``',
      '``mismatched` <!-- closed literal comment -->',
    ].join('\n');
    const tasks = Buffer.from(base.tasks.toString('utf8').replace(
      `- [~] ${DEFINITION_TASK_KEY} [Shared] Original final review`,
      `${literalBackticks}\n- [~] ${DEFINITION_TASK_KEY} [Shared] Real task after literal backticks`,
    ));
    const current = { ...base, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- literal backticks retained\n',
      )),
    };
    writeDefinitionFixture(root, current);

    const result = applyDefinitionFixture(root, current, staged);
    assert.equal(result.count, 4);
    const applied = fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`));
    assert.deepEqual(applied, tasks);
    assert.match(applied.toString('utf8'), /Real task after literal backticks/);
    assert.match(applied.toString('utf8'), /Preserve discovered work/);
    assertNoAtomicTemps(root);
  });

  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const tasks = Buffer.from(base.tasks.toString('utf8').replace(
      `- [~] ${DEFINITION_TASK_KEY} [Shared] Original final review`,
      `\`\` mismatched with \` before active opener <!--\n- [~] ${DEFINITION_TASK_KEY} [Shared] Hidden only by the unclosed comment`,
    ));
    const current = { ...base, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- unmatched opener rejection staged\n',
      )),
    };
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);

    assert.throws(
      () => applyDefinitionFixture(root, current, staged),
      /unclosed HTML comment/,
    );
    assertRestored(root, before);
  });
});

test('T003 unified Markdown scanner preserves LF, CRLF, bare CR, mixed, and task bytes without a terminal newline', async (context) => {
  const lfTasks = definitionFixtureBytes().tasks.toString('utf8');
  const logicalLines = lfTasks.split('\n');
  const mixedSeparators = ['\n', '\r\n', '\r'];
  const mixedTasks = logicalLines.map((line, index) => (
    index === logicalLines.length - 1
      ? line
      : `${line}${mixedSeparators[index % mixedSeparators.length]}`
  )).join('');
  const cases = [
    ['LF', lfTasks],
    ['CRLF', lfTasks.replaceAll('\n', '\r\n')],
    ['bare CR', lfTasks.replaceAll('\n', '\r')],
    ['mixed separators', mixedTasks],
    ['no terminal newline', lfTasks.slice(0, -1)],
  ];

  for (const [name, taskText] of cases) {
    await context.test(name, () => {
      withTemporaryDirectory((root) => {
        const base = definitionFixtureBytes();
        const tasks = Buffer.from(taskText);
        const current = { ...base, tasks };
        const staged = {
          ...current,
          owner: Buffer.from(current.owner.toString('utf8').replace(
            '- 2026-01-01 recovery authorized\n',
            `- 2026-01-01 recovery authorized\n- ${name} task bytes retained\n`,
          )),
        };
        writeDefinitionFixture(root, current);

        const result = applyDefinitionFixture(root, current, staged);
        assert.equal(result.count, 4);
        assert.deepEqual(
          fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)),
          tasks,
          `${name} bytes remain exact`,
        );
        assertNoAtomicTemps(root);
      });
    });
  }
});

test('T003 unified Markdown scanner processes near-limit backtick-heavy lines within two seconds', (context) => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const rowCount = 21_000;
    const backticksPerRow = 12;
    const backtickRow = '`one` ``two`` ```three``` scanner row 0123456789\n';
    const backtickRows = backtickRow.repeat(rowCount);
    const observedBackticks = backtickRows.length - backtickRows.replaceAll('`', '').length;
    const observedRows = backtickRows.length - backtickRows.replaceAll('\n', '').length;
    const spec = Buffer.from(`${base.spec.toString('utf8')}${backtickRows}`);
    assert.equal(observedRows, rowCount, 'every generated scanner row ends in a newline');
    assert.equal(
      observedBackticks,
      rowCount * backticksPerRow,
      'every scanner row retains paired one-, two-, and three-backtick spans',
    );
    assert.ok(spec.byteLength >= 1_000_000 && spec.byteLength < 1_100_000);
    assert.ok(observedBackticks / Buffer.byteLength(backtickRows) > 0.2);
    const current = { ...base, spec };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- near-limit scanner fixture retained\n',
      )),
    };
    writeDefinitionFixture(root, current);

    const startedAt = performance.now();
    const result = applyDefinitionFixture(root, current, staged);
    const elapsedMs = performance.now() - startedAt;
    context.diagnostic(
      `near-limit backtick scanner: ${spec.byteLength} bytes, ${rowCount} rows, ${observedBackticks} backticks in ${elapsedMs.toFixed(2)} ms`,
    );

    assert.equal(result.count, 4);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}spec.md`)), spec);
    assert.ok(elapsedMs < 2_000, `near-limit scanner fixture took ${elapsedMs.toFixed(2)} ms`);
    assertNoAtomicTemps(root);
  });
});

test('T003 repair probe: fenced and commented task lookalikes are inert', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const tasks = Buffer.from([
      `<!-- audit log: ${DEFINITION_IDEA_PATH}#coordinator-log -->`,
      '',
      '# Tasks',
      '',
      `- [~] ${DEFINITION_TASK_KEY} [Shared] Real canonical task`,
      '',
      '````md',
      '<!-- dude:board:start -->',
      '## Lightweight Execution History from a fenced board',
      `- [ ] ${DEFINITION_TASK_KEY} [Shared] Fenced duplicate`,
      '<!-- dude:board:end -->',
      '```',
      '````',
      '',
      '~~~md',
      '<!-- audit log: .dude/ideas/other.md#coordinator-log -->',
      '- [?] T099@bbbbbbbb malformed fenced row',
      '##\tLightweight\tExecution\tHistory fenced suffix',
      '~~~',
      '',
      '<!-- outer board comment',
      '<!-- dude:board:start -->',
      '<!-- outer audit comment',
      '<!-- audit log: .dude/ideas/other.md#coordinator-log -->',
      '<!-- outer task comment',
      `- [ ] ${DEFINITION_TASK_KEY} [Shared] Commented duplicate`,
      '-->',
      '<!-- outer managed comment',
      '<!-- dude:managed:end -->',
      '-->',
      '',
      '## Discovered During Execution',
      '- [ ] T9001@aaaaaaaa [Shared] Preserve discovered work',
      '',
      '## Lightweight Execution History',
      '- retained execution event',
      '',
    ].join('\n'));
    const current = { ...base, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- lexical lookalikes ignored\n',
      )),
    };
    writeDefinitionFixture(root, current);

    assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), tasks);
    assertNoAtomicTemps(root);
  });
});

test('T003 repair probe: active unclosed task fences and comments reject', async (context) => {
  const cases = [
    ['fence', '````md\n- [ ] T099@bbbbbbbb fenced row\n', /unclosed fenced block/i],
    ['comment', '<!-- active comment\n- [ ] T099@bbbbbbbb commented row\n', /unclosed HTML comment/i],
  ];
  for (const [name, opening, expectedError] of cases) {
    await context.test(name, () => {
      withTemporaryDirectory((root) => {
        const base = definitionFixtureBytes();
        const tasks = Buffer.from(base.tasks.toString('utf8').replace(
          '## Discovered During Execution',
          `${opening}## Discovered During Execution`,
        ));
        const current = { ...base, tasks };
        writeDefinitionFixture(root, current);
        const before = snapshotTree(root);

        assert.throws(
          () => applyDefinitionFixture(root, current, current),
          expectedError,
        );
        assertRestored(root, before);
      });
    });
  }
});

test('T003 repair probe: archived malformed Markdown is opaque after suffixed history', async (context) => {
  const archives = [
    [
      'unclosed fence',
      [
        '````md',
        '## Archived H2',
        '<!-- dude:managed:end -->',
      ].join('\n'),
    ],
    [
      'unclosed comment',
      [
        '<!-- archived comment',
        '## Archived H2',
      ].join('\n'),
    ],
  ];
  for (const [name, archive] of archives) {
    await context.test(name, () => {
      withTemporaryDirectory((root) => {
        const base = definitionFixtureBytes();
        const tasks = Buffer.from(base.tasks.toString('utf8')
          .replace(
            '## Lightweight Execution History\n- retained execution event\n',
            `##\tLightweight\tExecution\tHistory archived suffix\n- retained execution event\n${archive}`,
          ));
        const current = { ...base, tasks };
        const staged = {
          ...current,
          owner: Buffer.from(current.owner.toString('utf8').replace(
            '- 2026-01-01 recovery authorized\n',
            '- 2026-01-01 recovery authorized\n- opaque archive retained\n',
          )),
        };
        writeDefinitionFixture(root, current);

        assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
        assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), tasks);
        assertNoAtomicTemps(root);
      });
    });
  }
});

test('T003 repair probe: Discovered must remain adjacent to terminal history', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const discovered = [
      '## Discovered During Execution',
      '- [ ] T9001@aaaaaaaa [Shared] Preserve discovered work',
      '',
    ].join('\n');
    const currentTasks = base.tasks.toString('utf8').replace(
      '# Tasks\n\n',
      '# Tasks\n\n## Implementation\n\n',
    );
    const stagedTasks = currentTasks
      .replace(discovered, '')
      .replace('## Implementation\n\n', `${discovered}## Implementation\n\n`);
    const current = { ...base, tasks: Buffer.from(currentTasks) };
    const staged = { ...current, tasks: Buffer.from(stagedTasks) };
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);

    assert.throws(
      () => applyDefinitionFixture(root, current, staged),
      /Discovered During Execution must be the final active H2/,
    );
    assertRestored(root, before);
  });
});

test('T003 repair probe: terminal Discovered preserves trailing blanks with or without history', async (context) => {
  for (const history of [true, false]) {
    await context.test(history ? 'with history' : 'without history', () => {
      withTemporaryDirectory((root) => {
        const base = definitionFixtureBytes();
        let taskText = base.tasks.toString('utf8').replace(
          '\n\n## Lightweight Execution History',
          '\n\n\n\n## Lightweight Execution History',
        );
        if (!history) {
          taskText = taskText.replace(
            '## Lightweight Execution History\n- retained execution event\n',
            '',
          );
        }
        const tasks = Buffer.from(taskText);
        const current = { ...base, tasks };
        const staged = {
          ...current,
          owner: Buffer.from(current.owner.toString('utf8').replace(
            '- 2026-01-01 recovery authorized\n',
            '- 2026-01-01 recovery authorized\n- terminal discovered retained\n',
          )),
        };
        writeDefinitionFixture(root, current);

        assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
        assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), tasks);
        assertNoAtomicTemps(root);
      });
    });
  }
});

test('T003 repair probe: bound generator callbacks reject before staging', async (context) => {
  for (const name of ['generator', 'async generator']) {
    await context.test(name, () => {
      withTemporaryDirectory((root) => {
        const events = [];
        let bodyCalls = 0;
        const validator = name === 'generator'
          ? function* generatorValidator() {
            bodyCalls += 1;
          }
          : async function* asyncGeneratorValidator() {
            bodyCalls += 1;
          };

        assert.throws(() => applyAtomicFileBatch({
          root,
          changes: [missingChange('target.bin')],
          validators: [validator.bind(null)],
          failureInjector(event) { events.push(event.operation); },
        }), /validators\[0\] must be a synchronous function/);
        assert.deepEqual(events, []);
        assert.equal(bodyCalls, 0);
        assert.deepEqual(snapshotTree(root), []);
      });
    });
  }
});

test('T003 repair probe: bound async callback rejects before staging', () => {
  withTemporaryDirectory((root) => {
    const events = [];
    let bodyCalls = 0;
    async function afterApply() {
      bodyCalls += 1;
    }

    assert.throws(() => applyAtomicFileBatch({
      root,
      changes: [missingChange('target.bin')],
      failureInjector(event) { events.push(event.operation); },
    }, afterApply.bind(null)), /afterApply must be a synchronous function/);
    assert.deepEqual(events, []);
    assert.equal(bodyCalls, 0);
    assert.deepEqual(snapshotTree(root), []);
  });
});

test('T003 repair probe: regular bound sync callback runs once and commits', () => {
  withTemporaryDirectory((root) => {
    let calls = 0;
    function validator(view) {
      calls += 1;
      assert.equal(view.length, 1);
    }

    applyAtomicFileBatch({
      root,
      changes: [missingChange('target.bin', Buffer.from('committed'))],
      validators: [validator.bind(null)],
    });
    assert.equal(calls, 1);
    assert.deepEqual(fs.readFileSync(path.join(root, 'target.bin')), Buffer.from('committed'));
    assertNoAtomicTemps(root);
  });
});

test('T003 repair probe: iterator callback results roll back without iteration', async (context) => {
  const cases = [
    {
      name: 'generator',
      create(calls) {
        return () => (function* generatorResult() { calls.next += 1; })();
      },
    },
    {
      name: 'async generator',
      create(calls) {
        return () => (async function* asyncGeneratorResult() { calls.next += 1; })();
      },
    },
    {
      name: 'array iterator',
      create() {
        return () => [1, 2][Symbol.iterator]();
      },
    },
    {
      name: 'custom iterator',
      create(calls) {
        const prototype = {
          next() {
            calls.next += 1;
            return { done: true };
          },
          [Symbol.iterator]() {
            calls.iterator += 1;
            return this;
          },
        };
        return () => Object.create(prototype);
      },
    },
  ];
  for (const fixture of cases) {
    await context.test(fixture.name, () => {
      withTemporaryDirectory((root) => {
        const prior = Buffer.from('prior');
        fs.writeFileSync(path.join(root, 'target.bin'), prior);
        const before = snapshotTree(root);
        const calls = { next: 0, iterator: 0 };

        assert.throws(() => applyAtomicFileBatch({
          root,
          changes: [{ path: 'target.bin', expected: prior, staged: Buffer.from('staged') }],
        }, fixture.create(calls)), /afterApply must be synchronous/);
        assert.deepEqual(calls, { next: 0, iterator: 0 });
        assertRestored(root, before);
      });
    });
  }
});

test('T003 repair probe: bare CR tasks without terminal newline preserve exact bytes', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const tasks = Buffer.from(base.tasks.toString('utf8').replaceAll('\n', '\r').slice(0, -1));
    const current = { ...base, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- CR tasks retained\n',
      )),
    };
    writeDefinitionFixture(root, current);

    assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), tasks);
    assertNoAtomicTemps(root);
  });
});

test('T003 pre-fix: unexpected post-write thenable throws through rollback', () => {
  withTemporaryDirectory((root) => {
    const prior = Buffer.from('prior');
    fs.writeFileSync(path.join(root, 'existing.bin'), prior);
    const before = snapshotTree(root);
    let thenCalls = 0;

    assert.throws(() => applyAtomicFileBatch({
      root,
      changes: [
        { path: 'existing.bin', expected: prior, staged: Buffer.from('staged') },
        missingChange('created/new.bin'),
      ],
    }, () => ({
      then() {
        thenCalls += 1;
      },
    })), /afterApply must be synchronous/);
    assert.equal(thenCalls, 0, 'thenable is rejected without invoking then');
    assertRestored(root, before);
  });
});

test('T003 managed-region parser rejects malformed active markers and ignores fenced lookalikes', () => {
  const malformed = [
    ['missing start', (text) => text.replace('<!-- dude:managed:start -->\n', '')],
    ['missing end', (text) => text.replace('<!-- dude:managed:end -->\n', '')],
    ['duplicate pair', (text) => `${text}<!-- dude:managed:start -->\nextra\n<!-- dude:managed:end -->\n`],
    ['reversed', (text) => text
      .replace('<!-- dude:managed:start -->', '<!-- dude:managed:temporary -->')
      .replace('<!-- dude:managed:end -->', '<!-- dude:managed:start -->')
      .replace('<!-- dude:managed:temporary -->', '<!-- dude:managed:end -->')],
    ['nested', (text) => text.replace(
      '## Normalized Intent\n',
      '<!-- dude:managed:start -->\n## Normalized Intent\n<!-- dude:managed:end -->\n',
    )],
  ];
  for (const [name, mutate] of malformed) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = { ...current, owner: Buffer.from(mutate(current.owner.toString('utf8'))) };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      const operations = [];
      assert.throws(
        () => applyDefinitionFixture(root, current, staged, {
          failureInjector(event) { operations.push(event.operation); },
        }),
        /managed|Coordinator Log|fence|structure/i,
        name,
      );
      assert.equal(operations.includes('rename'), false, `${name}: no apply rename`);
      assertRestored(root, before);
    });
  }

  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const owner = Buffer.from(current.owner.toString('utf8').replace(
      '- Keep the promised outcome unchanged.',
      [
        '- Keep the promised outcome unchanged.',
        '',
        '```md',
        '<!-- dude:managed:start -->',
        '## Coordinator Log',
        '<!-- dude:managed:end -->',
        '```',
        '',
        '`<!-- dude:managed:end -->`',
        '<!-- lookalike: <!-- dude:managed:end --> -->',
      ].join('\n'),
    ));
    const expected = { ...current, owner };
    const staged = {
      ...expected,
      owner: Buffer.from(owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- fenced lookalikes ignored\n',
      )),
    };
    writeDefinitionFixture(root, expected);
    assert.doesNotThrow(() => applyDefinitionFixture(root, expected, staged));
    assertNoAtomicTemps(root);
  });
});

test('T003 balanced generated board and other managed fences do not become canonical task state', () => {
  withTemporaryDirectory((root) => {
    const base = definitionFixtureBytes();
    const tasks = Buffer.from(renderBoard(parseTasks(base.tasks.toString('utf8'))).replace(
      `${BOARD_NOTICE}\n`,
      `${BOARD_NOTICE}\n##\tLightweight\tExecution\tHistory generated suffix\n- [?] T099@bbbbbbbb malformed generated row\n`,
    ));
    const plan = Buffer.from([
      '# Implementation Plan',
      '',
      '<!-- dude:objective-registry:start -->',
      '{"version":1}',
      '<!-- dude:objective-registry:end -->',
      '',
      '```md',
      '<!-- dude:objective-registry:end -->',
      '```',
      '',
    ].join('\n'));
    const current = { ...base, plan, tasks };
    const staged = {
      ...current,
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- balanced generated regions retained\n',
      )),
    };
    writeDefinitionFixture(root, current);

    assert.doesNotThrow(() => applyDefinitionFixture(root, current, staged));
    const applied = parseTasks(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`), 'utf8'));
    assert.equal(applied.board !== null, true);
    assert.deepEqual(applied.tasks.map((task) => task.id), [DEFINITION_TASK_KEY, 'T9001@aaaaaaaa']);
    assertNoAtomicTemps(root);
  });
});

test('T003 Coordinator Log must remain one terminal append-only complete section', () => {
  const cases = [
    ['missing', (text) => text.replace('## Coordinator Log\n\n- 2026-01-01 recovery authorized\n', '')],
    ['duplicate', (text) => text.replace(
      '<!-- dude:managed:end -->',
      '## Coordinator Log\n\n- duplicate\n<!-- dude:managed:end -->',
    )],
    ['moved', (text) => text
      .replace('## Coordinator Log\n\n- 2026-01-01 recovery authorized\n', '')
      .replace(
        '<!-- dude:managed:start -->\n',
        '<!-- dude:managed:start -->\n## Coordinator Log\n\n- 2026-01-01 recovery authorized\n',
      )],
    ['split', (text) => text.replace(
      '- 2026-01-01 recovery authorized\n<!-- dude:managed:end -->',
      '- 2026-01-01 recovery authorized\n## Split Log\n- continuation\n<!-- dude:managed:end -->',
    )],
    ['truncated', (text) => text.replace('- 2026-01-01 recovery authorized', '- recovery author')],
    ['prefix altered', (text) => text.replace('- 2026-01-01 recovery authorized', '- 2026-01-01 recovery authorized ')],
    ['partial append', (text) => text.replace(
      '<!-- dude:managed:end -->',
      '- incomplete append<!-- dude:managed:end -->',
    )],
  ];
  for (const [name, mutate] of cases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = { ...current, owner: Buffer.from(mutate(current.owner.toString('utf8'))) };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      assert.throws(
        () => applyDefinitionFixture(root, current, staged),
        /Coordinator Log|managed|prefix|complete|terminal/i,
        name,
      );
      assertRestored(root, before);
    });
  }
});

test('T003 owner and protected user bytes reject duplicate identity, EOL drift, and trailing whitespace', () => {
  const cases = [
    ['duplicate owner key', (text) => text.replace(
      `spec_path: ${DEFINITION_SPEC_PATH}\n`,
      `spec_path: ${DEFINITION_SPEC_PATH}\nspec_path: ${DEFINITION_SPEC_PATH}\n`,
    )],
    ['Idea EOL drift', (text) => text.replace(
      'Inspect exact work history before acting.\n\n## Open Questions',
      'Inspect exact work history before acting.\r\n\r\n## Open Questions',
    )],
    ['Open Questions trailing whitespace', (text) => text.replace('- None.\n\n', '- None. \n\n')],
    ['Assumptions terminal whitespace', (text) => text.replace(
      '- Recovery preserves user intent byte-for-byte.\n',
      '- Recovery preserves user intent byte-for-byte.\t\n',
    )],
  ];
  for (const [name, mutate] of cases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = { ...current, owner: Buffer.from(mutate(current.owner.toString('utf8'))) };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      assert.throws(
        () => applyDefinitionFixture(root, current, staged),
        /owner|frontmatter|spec_path|Idea|Open Questions|Assumptions|bytes/i,
        name,
      );
      assertRestored(root, before);
    });
  }
});

test('T003 task parser rejects audit, canonical, dependency, board, discovered, and history corruption', () => {
  const cases = [
    ['wrong audit owner', (text) => text.replace(DEFINITION_IDEA_PATH, '.dude/ideas/other.md')],
    ['malformed glyph', (text) => text.replace(`- [~] ${DEFINITION_TASK_KEY}`, `- [?] ${DEFINITION_TASK_KEY}`)],
    ['duplicate task id', (text) => text.replace(
      '## Discovered During Execution',
      `- [ ] ${DEFINITION_TASK_KEY} [Shared] Duplicate\n\n## Discovered During Execution`,
    )],
    ['missing dependency', (text) => text.replace(
      `- [~] ${DEFINITION_TASK_KEY} [Shared]`,
      `- [~] ${DEFINITION_TASK_KEY} [Shared]`,
    ).replace('\n\n## Discovered', '\n    deps: T099@bbbbbbbb\n\n## Discovered')],
    ['duplicate dependency', (text) => text.replace(
      '\n\n## Discovered',
      `\n    deps: T9001@aaaaaaaa, T9001@aaaaaaaa\n\n## Discovered`,
    )],
    ['unclosed board', (text) => `<!-- dude:board:start -->\n${text}`],
    ['discovered loss', (text) => text.replace(
      '## Discovered During Execution\n- [ ] T9001@aaaaaaaa [Shared] Preserve discovered work\n\n',
      '',
    )],
    ['history loss', (text) => text.replace(
      '## Lightweight Execution History\n- retained execution event\n',
      '',
    )],
  ];
  for (const [name, mutate] of cases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = { ...current, tasks: Buffer.from(mutate(current.tasks.toString('utf8'))) };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      assert.throws(
        () => applyDefinitionFixture(root, current, staged),
        /audit|task|duplicate|depend|board|Discovered|history|preserve|canonical/i,
        name,
      );
      assertRestored(root, before);
    });
  }
});

test('T003 permits only an exact append-only history archive authorized by reconciliation', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const append = Buffer.from('- archived dropped-defective T099@bbbbbbbb -> T100@cccccccc\n');
    const staged = { ...current, tasks: Buffer.concat([current.tasks, append]) };
    writeDefinitionFixture(root, current);
    const calls = {};
    const result = applyDefinitionFixture(root, current, staged, {
      contractOptions: { historyAppend: append, calls },
    });
    assert.equal(result.count, 4);
    assert.deepEqual(fs.readFileSync(path.join(root, `${DEFINITION_ROOT}tasks.md`)), staged.tasks);
    assert.deepEqual(calls, {
      reconciliation: 1,
      proposal: 1,
      review: 1,
      lint: 1,
      verification: 1,
    });
    assertNoAtomicTemps(root);
  });

  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const append = Buffer.from('- unauthorized archive\n');
    const staged = { ...current, tasks: Buffer.concat([current.tasks, append]) };
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);
    assert.throws(
      () => applyDefinitionFixture(root, current, staged),
      /history|archive|reconciliation|authorized/i,
    );
    assertRestored(root, before);
  });
});

test('T003 coordinator gate contract: exact descriptor, proposal, and review drift refuse or roll back all four paths', () => {
  const cases = [
    {
      name: 'prestate descriptor drift',
      arrange(current, staged) {
        const contract = definitionRecoveryContract(current, staged);
        contract.binding.prestateDescriptors[0].sha256 = definitionHash('wrong prestate');
        return contract;
      },
      expected: /prestate|descriptor|expected/i,
    },
    {
      name: 'coordinator-final descriptor drift',
      arrange(current, staged) {
        const contract = definitionRecoveryContract(current, staged);
        contract.binding.coordinatorFinalDescriptors[1].byteLength += 1;
        return contract;
      },
      expected: /coordinator-final|descriptor|staged/i,
    },
    {
      name: 'review descriptor drift',
      arrange(current, staged) {
        const contract = definitionRecoveryContract(current, staged);
        contract.binding.review.coordinatorFinalDescriptors[2].sha256 = definitionHash('wrong review');
        return contract;
      },
      expected: /review|descriptor/i,
    },
    {
      name: 'proposal identity drift',
      arrange(current, staged) {
        const contract = definitionRecoveryContract(current, staged);
        return replaceDefinitionRecoveryCallbacks(contract, {
          postApply: {
            ...contract.postApply,
            recomputeProposalIdentity: () => ({
              proposalIdentity: definitionHash('post-write proposal drift'),
              coordinatorFinalDescriptors: definitionDescriptors(staged),
            }),
          },
        });
      },
      expected: /proposal.*identity/i,
    },
    {
      name: 'review identity drift',
      arrange(current, staged) {
        const contract = definitionRecoveryContract(current, staged);
        return replaceDefinitionRecoveryCallbacks(contract, {
          postApply: {
            ...contract.postApply,
            validateReviewIdentity: () => ({
              proposalIdentity: contract.binding.proposalIdentity,
              reviewIdentity: definitionHash('post-write review drift'),
              coordinatorFinalDescriptors: definitionDescriptors(staged),
            }),
          },
        });
      },
      expected: /review.*identity/i,
    },
  ];
  for (const fixture of cases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = {
        ...current,
        owner: Buffer.from(current.owner.toString('utf8').replace(
          '- 2026-01-01 recovery authorized\n',
          '- 2026-01-01 recovery authorized\n- exact identity staged\n',
        )),
        plan: Buffer.from('# Implementation Plan\n\nRepaired design.\n'),
      };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      const contract = fixture.arrange(current, staged);
      assert.throws(
        () => applyDefinitionFixture(root, current, staged, { contractOverride: contract }),
        fixture.expected,
        fixture.name,
      );
      assertRestored(root, before);
    });
  }
});

test('T003 coordinator gate contract: post-write parse, lint, verification, and unexpected thenable failures roll back exactly', () => {
  const cases = [
    {
      name: 'post-write parse failure',
      contractOptions: {},
      failureInjector(root, event) {
        if (event.operation === 'validate-applied') {
          const ownerPath = path.join(root, DEFINITION_IDEA_PATH);
          fs.writeFileSync(ownerPath, fs.readFileSync(ownerPath, 'utf8').replace(
            '<!-- dude:managed:end -->',
            '',
          ));
        }
      },
      expected: /managed|structure|applied|descriptor|does not match expected bytes/i,
    },
    {
      name: 'lint failure',
      postApply(staged, contract) {
        return {
          ...contract.postApply,
          lint() { throw new Error('fresh lint failed'); },
        };
      },
      expected: /fresh lint failed/,
    },
    {
      name: 'verification failure',
      postApply(staged, contract) {
        return {
          ...contract.postApply,
          verification() { throw new Error('required verification failed'); },
        };
      },
      expected: /required verification failed/,
    },
    {
      name: 'unexpected thenable',
      postApply(staged, contract) {
        return {
          ...contract.postApply,
          lint() { return { then() { assert.fail('then must not execute'); } }; },
        };
      },
      expected: /lint.*synchronous|synchronous.*lint/i,
    },
  ];
  for (const fixture of cases) {
    withTemporaryDirectory((root) => {
      const current = definitionFixtureBytes();
      const staged = {
        ...current,
        owner: Buffer.from(current.owner.toString('utf8').replace(
          '- 2026-01-01 recovery authorized\n',
          '- 2026-01-01 recovery authorized\n- post-apply staged\n',
        )),
        spec: Buffer.from('# Feature Specification\n\nRepaired requirements.\n'),
        plan: Buffer.from('# Implementation Plan\n\nRepaired design.\n'),
        tasks: definitionTasksBytes('Repaired canonical task'),
      };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      let contract = definitionRecoveryContract(current, staged, fixture.contractOptions);
      if (fixture.postApply) {
        contract = replaceDefinitionRecoveryCallbacks(contract, {
          postApply: fixture.postApply(staged, contract),
        });
      }
      assert.throws(() => applyDefinitionFixture(root, current, staged, {
        contractOverride: contract,
        ...(fixture.failureInjector ? {
          failureInjector(event) { fixture.failureInjector(root, event); },
        } : {}),
      }), fixture.expected, fixture.name);
      assertRestored(root, before);
    });
  }
});

test('T004 integration security: unreachable-by-construction post-apply invariants stay wired', () => {
  // `applyDefinitionRecovery` is only reachable through
  // `commitDefinitionRecoveryV1`, whose branded capabilities always report
  // passed gate evidence and the bound identities. These three defences
  // therefore cannot be triggered behaviourally without exporting the sealer,
  // which `callback sealer is unavailable externally` forbids, so they are
  // pinned structurally instead.
  const source = fs.readFileSync(new URL('./atomic-file-batch.mjs', import.meta.url), 'utf8');
  // Once where gate evidence is validated, once again post-apply.
  assert.equal(
    source.split("if (value.status !== 'passed') throw new Error(`${label} must report passed fresh evidence`);").length - 1,
    2,
  );
  assert.match(
    source,
    /if \(result\.proposalIdentity !== binding\.proposalIdentity\) \{[\s\S]*?does not match the exact applied proposal/,
  );
  assert.match(
    source,
    /if \(identityFields\.includes\('reviewIdentity'\)[\s\S]*?result\.reviewIdentity !== binding\.reviewIdentity\) \{[\s\S]*?does not match the independent review/,
  );
});

test('T004 integration security: callback sealer is unavailable externally', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);
    assert.equal(
      Object.hasOwn(atomicRuntime, 'sealDefinitionRecoveryCoordinatorCapabilities'),
      false,
    );
    assert.equal(atomicRuntime.sealDefinitionRecoveryCoordinatorCapabilities, undefined);
    assertRestored(root, before);
  });
});

test('T004 integration security: callback substitution is refused before atomic helper entry', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    writeDefinitionFixture(root, current);
    const before = snapshotTree(root);
    const contract = definitionRecoveryContract(current, current);
    assert.equal(Object.isFrozen(contract.postApply), true);

    for (const [label, overrides] of [
      ['post-apply callback', {
        validateReconciliation: contract.validateReconciliation,
        postApply: Object.freeze({
          ...contract.postApply,
          lint() { throw new Error('substituted lint must not execute'); },
        }),
      }],
      ['reconciliation callback', {
        validateReconciliation() { throw new Error('substituted reconciliation must not execute'); },
        postApply: contract.postApply,
      }],
    ]) {
      let helperEvents = 0;
      assert.throws(() => definitionRecoveryFunction()({
        lane: 'lightweight',
        root,
        specPath: DEFINITION_SPEC_PATH,
        changes: definitionChanges(current, current),
        binding: contract.binding,
        ...overrides,
        failureInjector() { helperEvents += 1; },
      }), /sealed internal coordinator capabilities/, label);
      assert.equal(helperEvents, 0, label);
      assertRestored(root, before);
    }
  });
});

test('T003 rollback failure after an atomic post-apply gate remains AtomicFileBatchRollbackError', () => {
  withTemporaryDirectory((root) => {
    const prior = Buffer.from('prior');
    fs.writeFileSync(path.join(root, 'target.bin'), prior);
    const error = captureError(() => applyAtomicFileBatch({
      root,
      changes: [{ path: 'target.bin', expected: prior, staged: Buffer.from('staged') }],
      failureInjector(event) {
        if (event.operation === 'rollback-rename' && event.index === 0) {
          throw new Error('incomplete definition rollback');
        }
      },
    }, () => { throw new Error('post-apply lint failure'); }));
    assert.equal(error.name, 'AtomicFileBatchRollbackError');
    assert.equal(error.code, 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED');
    assert.equal(error.cause?.message, 'post-apply lint failure');
    assert.ok(error.rollbackErrors.some((entry) => entry.message === 'incomplete definition rollback'));
  });
});

test('T003 valid final proposal applies and each rollback-bound gate executes exactly once', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const staged = {
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- valid final proposal\n',
      )),
      spec: Buffer.from('# Feature Specification\n\nValidated final requirements.\n'),
      plan: Buffer.from('# Implementation Plan\n\nValidated final design.\n'),
      tasks: definitionTasksBytes('Validated final canonical task'),
    };
    writeDefinitionFixture(root, current);
    const calls = {};
    const result = applyDefinitionFixture(root, current, staged, {
      contractOptions: { calls },
    });
    assert.deepEqual(result, { count: 4, paths: definitionScope() });
    assert.deepEqual(calls, {
      reconciliation: 1,
      proposal: 1,
      review: 1,
      lint: 1,
      verification: 1,
    });
    for (const [relativePath, bytes] of definitionBytesByPath(staged)) {
      assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), bytes);
    }
    assertNoAtomicTemps(root);
  });
});

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

test('T004 integration: prepareDefinitionRecoveryV1 refuses tracked before any filesystem helper', () => {
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
  try {
    for (const method of methods) {
      Reflect.set(fs, method, () => {
        accesses.push(method);
        throw new Error(`unexpected filesystem access through ${method}`);
      });
    }
    const error = captureError(() => atomicRuntime.prepareDefinitionRecoveryV1({ lane: 'tracked' }));
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
      assert.throws(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
        root,
        specPath: DEFINITION_SPEC_PATH,
        changes: definitionChanges(current, current),
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
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- 2026-01-01 recovery staged\n',
      )),
    };
    const before = snapshotTree(root);
    const contract = definitionRecoveryContract(current, staged);
    assert.throws(() => applyDefinitionRecovery({
      lane: 'lightweight',
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, staged),
      binding: contract.binding,
      postApply: contract.postApply,
    }), /missing validateReconciliation|sealed internal coordinator capabilities/i);
    assertRestored(root, before);

    const wrongOwner = {
      ...staged,
      owner: definitionOwnerBytes('2026-01-01 recovery staged').map((byte) => byte),
    };
    const wrongOwnerText = Buffer.from(wrongOwner.owner).toString('utf8')
      .replace(`spec_path: ${DEFINITION_SPEC_PATH}`, 'spec_path: .dude/specs/999-other/spec.md');
    const wrongOwnerStaged = { ...staged, owner: Buffer.from(wrongOwnerText) };
    assert.throws(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, wrongOwnerStaged),
    }), /owner|spec_path|specification/i);
    assertRestored(root, before);

    const wrongStatusText = staged.owner.toString('utf8')
      .replace('status: defined', 'status: draft');
    const wrongStatusStaged = { ...staged, owner: Buffer.from(wrongStatusText) };
    assert.throws(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
      root,
      specPath: DEFINITION_SPEC_PATH,
      changes: definitionChanges(current, wrongStatusStaged),
    }), /owner|status|defined/i);
    assertRestored(root, before);
  });
});

test('F: definition recovery requires exactly owner, spec, plan, and tasks before helper entry', async (context) => {
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
        const error = captureError(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
          root,
          specPath: DEFINITION_SPEC_PATH,
          changes: fixture.mutate(definitionChanges(current, current)),
        }));
        assert.match(error.message, /exact|four|owner|spec|plan|tasks|scope|contracts/i);
        assertRestored(root, before);
      });
    });
  }
});

test('F: definition recovery preserves complete user-owned section bytes and boundaries', async (context) => {
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
        const error = captureError(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
          root,
          specPath: DEFINITION_SPEC_PATH,
          changes: definitionChanges(current, staged),
        }));
        assert.match(error.message, /Idea|Open Questions|Assumptions|user-owned|section|intent|bytes/i);
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
          const error = captureError(() => atomicRuntime.validateDefinitionRecoveryArtifactTransitionV1({
            root,
            specPath: DEFINITION_SPEC_PATH,
            changes: definitionChanges(expected, staged),
          }));
          assert.match(
            error.message,
            /Idea|Open Questions|Assumptions|section|heading|boundary|owner|defined|fenced/i,
          );
          assertRestored(root, before);
        });
      });
    }
  }

  for (const fixture of [
    {
      name: 'fenced heading lookalikes',
      options: {
        idea: 'Intent.\n\n```md\n## Open Questions\n## Assumptions\n```',
      },
    },
    {
      name: 'CRLF without terminal newline',
      options: { newline: '\r\n', terminalNewline: false },
    },
  ]) {
    await context.test(`accepts preserved ${fixture.name}`, () => {
      withTemporaryDirectory((root) => {
        const owner = definitionOwnerBytes('2026-01-01 recovery authorized', fixture.options);
        const newline = fixture.options.newline ?? '\n';
        const stagedOwner = Buffer.from(owner.toString('utf8').replace(
          `- 2026-01-01 recovery authorized${newline}`,
          `- 2026-01-01 recovery authorized${newline}- 2026-01-01 recovery staged${newline}`,
        ));
        const current = { ...definitionFixtureBytes(), owner };
        const staged = { ...current, owner: stagedOwner };
        writeDefinitionFixture(root, current);
        const result = applyDefinitionFixture(root, current, staged);
        assert.deepEqual(result.paths, definitionScope());
        assert.deepEqual(fs.readFileSync(path.join(root, DEFINITION_IDEA_PATH)), staged.owner);
        assertNoAtomicTemps(root);
      });
    });
  }
});

test('F: applyDefinitionRecovery delegates one sorted batch and restores on reconciliation or apply failure', () => {
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
          '- 2026-01-01 recovery authorized\n',
          '- 2026-01-01 recovery authorized\n- 2026-01-01 recovery applied\n',
        )),
        spec: Buffer.from('# Feature Specification\n\nRepaired requirements.\n'),
        plan: Buffer.from('# Implementation Plan\n\nRepaired design.\n'),
        tasks: definitionTasksBytes('Repaired final review'),
      };
      writeDefinitionFixture(root, current);
      const before = snapshotTree(root);
      const validateReconciliation = fixture.drift
        ? () => {
          fs.writeFileSync(path.join(root, `${DEFINITION_ROOT}plan.md`), 'foreign drift');
        }
        : fixture.validateReconciliation;
      assert.throws(() => applyDefinitionFixture(root, current, staged, {
        contractOptions: { reconciliation: validateReconciliation },
        ...(fixture.failureInjector ? { failureInjector: fixture.failureInjector } : {}),
      }), fixture.expected, fixture.name);
      assertRestored(root, before);
    });
  }
});

test('F: authorized definition repair applies owner/spec/plan/tasks and completes only after all gates', () => {
  withTemporaryDirectory((root) => {
    const current = definitionFixtureBytes();
    const staged = {
      owner: Buffer.from(current.owner.toString('utf8').replace(
        '- 2026-01-01 recovery authorized\n',
        '- 2026-01-01 recovery authorized\n- 2026-01-01 recovery applied after reconciliation\n',
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
      policy: { overall: 3, recovery: 1, recover: true, untilBlocked: false, mode: 'guarded' },
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
    const applied = applyDefinitionFixture(root, current, staged, {
      contractOptions: { reconciliation(view) {
        reconciliationChecks += 1;
        const tasks = view.find((entry) => entry.path === `${DEFINITION_ROOT}tasks.md`)?.staged.toString('utf8');
        assert.match(tasks || '', new RegExp(`\\[~\\] ${DEFINITION_TASK_KEY.replace('@', '\\@')}`));
        assert.match(tasks || '', /Preserve discovered work/);
        assert.match(tasks || '', /retained execution event/);
      } },
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

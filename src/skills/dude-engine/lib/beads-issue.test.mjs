// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeBeadsIssue } from './beads-issue.mjs';
import { normalizeBeadsIssue as normalizeGeneratedBeadsIssue } from '../../../../.github/skills/dude-engine/lib/beads-issue.mjs';

const NORMALIZERS = [
  ['source', normalizeBeadsIssue],
  ['generated', normalizeGeneratedBeadsIssue],
];

test('normalizeBeadsIssue requires one decoded object and does not decode JSON', () => {
  // Arrange
  const invalid = [undefined, null, true, 1, ' {"status":"open"} ', []];

  // Act
  const attempts = NORMALIZERS.flatMap(([name, normalize]) => invalid.map((value) => ({
    name,
    value,
    run: () => normalize(value),
  })));

  // Assert
  for (const attempt of attempts) {
    assert.throws(
      attempt.run,
      {
        name: 'TypeError',
        message: 'normalizeBeadsIssue requires one decoded issue object',
      },
      `${attempt.name}: ${String(attempt.value)}`,
    );
  }
});

test('normalizeBeadsIssue recognizes either type field as a case-folded epic without precedence', () => {
  // Arrange
  const issues = [
    { type: 'EPIC', issue_type: 'task' },
    { type: 'task', issue_type: 'ePiC' },
    { type: 'task', issue_type: 'custom-work-item' },
    { type: '', issue_type: '' },
    {},
  ];

  // Act
  const results = NORMALIZERS.map(([name, normalize]) => ({
    name,
    normalized: issues.map((issue) => normalize(issue).isEpic),
  }));

  // Assert
  for (const result of results) {
    assert.deepEqual(result.normalized, [true, true, false, false, false], result.name);
  }
});

test('normalizeBeadsIssue rejects every present non-string authority field', () => {
  // Arrange
  const invalidValues = [
    ['undefined', undefined],
    ['null', null],
    ['number', 0],
    ['array', []],
    ['object', {}],
    ['boolean', false],
  ];
  const cases = ['type', 'issue_type', 'status', 'state'].flatMap((field) => (
    invalidValues.map(([kind, value]) => ({
      field,
      kind,
      issue: { [field]: value },
    }))
  ));

  // Act
  const attempts = NORMALIZERS.flatMap(([name, normalize]) => cases.map((scenario) => ({
    name,
    ...scenario,
    run: () => normalize(scenario.issue),
  })));

  // Assert
  for (const attempt of attempts) {
    assert.throws(
      attempt.run,
      {
        name: 'TypeError',
        message: `normalizeBeadsIssue requires '${attempt.field}' to be a string when present`,
      },
      `${attempt.name}: ${attempt.field}=${attempt.kind}`,
    );
  }
});

test('normalizeBeadsIssue rejects a malformed type field even when the other type field is a valid epic', () => {
  // Arrange
  const cases = [
    { issue: { type: 'epic', issue_type: null }, field: 'issue_type' },
    { issue: { type: [], issue_type: 'epic' }, field: 'type' },
  ];

  // Act
  const attempts = NORMALIZERS.flatMap(([name, normalize]) => cases.map((scenario) => ({
    name,
    ...scenario,
    run: () => normalize(scenario.issue),
  })));

  // Assert
  for (const attempt of attempts) {
    assert.throws(
      attempt.run,
      {
        name: 'TypeError',
        message: `normalizeBeadsIssue requires '${attempt.field}' to be a string when present`,
      },
      `${attempt.name}: ${attempt.field}`,
    );
  }
});

test('normalizeBeadsIssue gives nonempty status precedence and falls back to state only for empty or missing status', () => {
  // Arrange
  const issues = [
    { status: 'blocked', state: 'closed' },
    { status: 'future', state: 'closed' },
    { status: '', state: 'DONE' },
    { state: 'open' },
    { status: '', state: '' },
  ];
  const expected = [
    { statusToken: 'blocked', status: 'blocked' },
    { statusToken: 'future', status: null },
    { statusToken: 'done', status: 'closed' },
    { statusToken: 'open', status: 'open' },
    { statusToken: '', status: null },
  ];

  // Act
  const results = NORMALIZERS.map(([name, normalize]) => ({
    name,
    normalized: issues.map((issue) => {
      const result = normalize(issue);
      return { statusToken: result.statusToken, status: result.status };
    }),
  }));

  // Assert
  for (const result of results) {
    assert.deepEqual(result.normalized, expected, result.name);
  }
});

test('normalizeBeadsIssue case-folds and normalizes status whitespace across canonical aliases', () => {
  // Arrange
  const cases = [
    [{ status: 'OPEN' }, 'open', 'open'],
    [{ status: 'IN_PROGRESS' }, 'in_progress', 'in_progress'],
    [{ status: 'in-progress' }, 'in-progress', 'in_progress'],
    [{ status: 'InProgress' }, 'inprogress', 'in_progress'],
    [{ status: 'IN \t  PROGRESS' }, 'in_progress', 'in_progress'],
    [{ status: 'BLOCKED' }, 'blocked', 'blocked'],
    [{ status: 'Closed' }, 'closed', 'closed'],
    [{ status: 'DONE' }, 'done', 'closed'],
    [{ status: 'paused' }, 'paused', null],
    [{ status: '' }, '', null],
    [{}, '', null],
  ];

  // Act
  const results = NORMALIZERS.map(([name, normalize]) => ({
    name,
    normalized: cases.map(([issue]) => normalize(issue)),
  }));

  // Assert
  for (const result of results) {
    assert.deepEqual(
      result.normalized,
      cases.map(([, statusToken, status]) => ({ isEpic: false, statusToken, status })),
      result.name,
    );
  }
});

test('normalizeBeadsIssue does not interpret envelopes, queries, or specification identity', () => {
  // Arrange
  const issue = {
    issues: [{ type: 'epic', status: 'closed' }],
    query: { status: 'blocked' },
    spec: '.dude/specs/001-x/spec.md',
  };

  // Act
  const results = NORMALIZERS.map(([name, normalize]) => [name, normalize(issue)]);

  // Assert
  for (const [name, result] of results) {
    assert.deepEqual(result, { isEpic: false, statusToken: '', status: null }, name);
  }
});

test('generated normalizeBeadsIssue is byte-identical to source', () => {
  // Arrange
  const source = fs.readFileSync(new URL('./beads-issue.mjs', import.meta.url));
  const generated = fs.readFileSync(
    new URL('../../../../.github/skills/dude-engine/lib/beads-issue.mjs', import.meta.url),
  );

  // Act
  const sameBytes = source.equals(generated);

  // Assert
  assert.equal(sameBytes, true);
});

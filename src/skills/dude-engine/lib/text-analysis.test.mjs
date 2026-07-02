// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, overlapScore, rankOverlap } from './text-analysis.mjs';

test('tokenize case-folds, drops short tokens + stopwords, de-dupes', () => {
  const t = tokenize('Use when Building a Hugo hugo SITE for the site');
  assert.ok(t.has('building'));
  assert.ok(t.has('hugo'));
  assert.ok(t.has('site'));
  assert.ok(!t.has('use'), 'stopword dropped');
  assert.ok(!t.has('a'), 'short token dropped');
  // de-duped: hugo appears once
  assert.equal([...t].filter((x) => x === 'hugo').length, 1);
});

test('overlapScore: identical=1, disjoint=0, subset high', () => {
  assert.equal(overlapScore('hugo site builder', 'hugo site builder'), 1);
  assert.equal(overlapScore('hugo templates', 'rust cargo async'), 0);
  // subset: short description contained in a longer one -> 1 (min-size denominator)
  assert.equal(overlapScore('hugo templates', 'author and debug hugo templates render hooks'), 1);
  assert.equal(overlapScore('', 'anything'), 0);
});

test('rankOverlap returns candidates >= threshold, highest first', () => {
  const ranked = rankOverlap('microsoft brand logo typography', [
    { id: 'ms-brand', text: 'microsoft visual brand logo typography colors' },
    { id: 'hugo', text: 'hugo static site generator templates' },
    { id: 'writing', text: 'avoid ai writing tropes prose' },
  ], 0.5);
  assert.equal(ranked[0].id, 'ms-brand');
  assert.ok(ranked[0].score >= 0.5);
  assert.ok(!ranked.some((r) => r.id === 'hugo'));
});

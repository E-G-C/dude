// @ts-check
/**
 * Lightweight text-analysis helpers for the Dude engine: tokenization and a
 * token-overlap score used to flag near-duplicate artifacts (bundle-import
 * duplicate detection, memory-ledger supersede scan). Dependency-free, pure.
 */

/**
 * Common English filler words that carry no discriminating signal for
 * description-similarity. Kept small on purpose.
 * @type {ReadonlySet<string>}
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'use', 'when', 'with', 'this', 'that', 'are', 'you', 'your',
  'from', 'into', 'via', 'per', 'not', 'but', 'its', 'has', 'have', 'will', 'can',
  'a', 'an', 'of', 'to', 'in', 'on', 'is', 'be', 'as', 'by', 'at', 'or', 'it',
]);

/**
 * Case-fold, split on non-alphanumerics, drop short tokens and stopwords, and
 * de-duplicate. Returns a set of significant tokens.
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(tokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t)));
}

/**
 * Overlap coefficient between two texts: |A ∩ B| / min(|A|, |B|). Ranges 0..1.
 * Catches subset duplicates (a short description fully contained in a longer
 * one) better than Jaccard. Empty input on either side scores 0.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function overlapScore(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

/**
 * Rank candidates by overlap against a query text, returning those at or above
 * a threshold, highest first.
 * @param {string} query
 * @param {{ id: string, text: string }[]} candidates
 * @param {number} [threshold]
 * @returns {{ id: string, score: number }[]}
 */
export function rankOverlap(query, candidates, threshold = 0.6) {
  return candidates
    .map((c) => ({ id: c.id, score: Number(overlapScore(query, c.text).toFixed(3)) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

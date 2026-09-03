// @ts-check
/** Shared normalization for one decoded Beads issue. */

const CANONICAL_STATUS = Object.freeze({
  open: 'open',
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  inprogress: 'in_progress',
  blocked: 'blocked',
  closed: 'closed',
  done: 'closed',
});

/**
 * Normalize only the Beads fields shared by current workflow callers.
 * Missing authority fields and empty strings are accepted. An empty `status`
 * falls back to `state`; every present non-string authority field is rejected.
 * @param {unknown} issue
 * @returns {{
 *   isEpic: boolean,
 *   statusToken: string,
 *   status: 'open' | 'in_progress' | 'blocked' | 'closed' | null,
 * }}
 * @throws {TypeError} when the issue or one of its authority fields is malformed
 */
export function normalizeBeadsIssue(issue) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
    throw new TypeError('normalizeBeadsIssue requires one decoded issue object');
  }

  const record = /** @type {Record<string, unknown>} */ (issue);
  for (const field of ['type', 'issue_type', 'status', 'state']) {
    if (Object.hasOwn(record, field) && typeof record[field] !== 'string') {
      throw new TypeError(`normalizeBeadsIssue requires '${field}' to be a string when present`);
    }
  }

  const isEpic = ['type', 'issue_type'].some((field) => (
    Object.hasOwn(record, field)
    && /** @type {string} */ (record[field]).toLowerCase() === 'epic'
  ));
  const statusValue = Object.hasOwn(record, 'status') && record.status
    ? /** @type {string} */ (record.status)
    : Object.hasOwn(record, 'state')
      ? /** @type {string} */ (record.state)
      : '';
  const statusToken = statusValue
    .toLowerCase()
    .replace(/\s+/g, '_');
  const status = Object.hasOwn(CANONICAL_STATUS, statusToken)
    ? /** @type {'open' | 'in_progress' | 'blocked' | 'closed'} */ (CANONICAL_STATUS[statusToken])
    : null;

  return { isEpic, statusToken, status };
}

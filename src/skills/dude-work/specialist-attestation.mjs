// @ts-check

import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import {
  canonicalJson,
  canonicalTarget,
  capturedBytesV1,
  normalizeIndependentReviewEnvelopeV2,
  normalizeVerificationEnvelopeV2,
  validateApproachBasisV1,
  validateFindingBasisV1,
  validateIndependentReviewEnvelopeV2,
  validateTrustedSourceCaptureV2,
  validateVerificationEnvelopeV2,
} from './recovery.mjs';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_SEMANTIC_TEXT_BYTES = 16_384;
const MAX_ROWS = 16;
const MAX_RUNTIME_RESULT_DEPTH = 32;
const MAX_RUNTIME_RESULT_ENTRIES = 4096;

/** @param {string} label @param {string} message @returns {never} */
function invalid(label, message) {
  throw new TypeError(`${label} ${message}`);
}

/** @param {unknown} value @param {readonly string[]} fields @param {string} label */
function exactRecord(value, fields, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(label, 'must be an object');
  }
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(label, 'must be a plain data object');
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const allowed = new Set(fields);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      return invalid(label, `contains unknown field '${String(key)}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      return invalid(`${label}.${key}`, 'must be an enumerable data field');
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) invalid(label, `is missing field '${field}'`);
  }
  return record;
}

/** @param {unknown} value @param {string} field @param {string} label */
function ownDataField(value, field, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(label, 'must be an object');
  }
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(label, 'must be a plain data object');
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
    invalid(`${label}.${field}`, 'must be an enumerable data field');
  }
  return descriptor.value;
}

/** @param {unknown} value @param {string} label @param {() => void} [consumeEntry] */
function dataArray(value, label, consumeEntry) {
  if (!Array.isArray(value)) invalid(label, 'must be an array');
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    invalid(label, 'must use Array.prototype');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || lengthDescriptor.enumerable || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    invalid(label, 'must have an own data length');
  }
  const length = lengthDescriptor.value;
  /** @type {Map<number, unknown>} */
  const indexedValues = new Map();
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)
      || Number(key) >= length) {
      invalid(label, 'must not contain extra fields');
    }
    const index = Number(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalid(label, 'must be a dense data array');
    }
    consumeEntry?.();
    indexedValues.set(index, descriptor.value);
  }
  if (indexedValues.size !== length) invalid(label, 'must be a dense data array');
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    if (!indexedValues.has(index)) invalid(label, 'must be a dense data array');
    rows.push(indexedValues.get(index));
  }
  return rows;
}

/** @param {unknown} value @param {number} min @param {number} max @param {string} label */
function denseArray(value, min, max, label) {
  const rows = dataArray(value, label);
  if (rows.length < min || rows.length > max) {
    invalid(label, `must contain ${min} through ${max} rows`);
  }
  return rows;
}

/** @param {{ entries: number, rootLabel: string }} traversal */
function consumeRuntimeResultEntry(traversal) {
  traversal.entries += 1;
  if (traversal.entries > MAX_RUNTIME_RESULT_ENTRIES) {
    invalid(traversal.rootLabel, `exceeds the maximum entry count of ${MAX_RUNTIME_RESULT_ENTRIES}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} [depth]
 * @param {{ ancestors: Set<object>, entries: number, rootLabel: string }} [traversal]
 */
function inertDataGraph(value, label, depth = 0, traversal = {
  ancestors: new Set(),
  entries: 0,
  rootLabel: label,
}) {
  if (depth > MAX_RUNTIME_RESULT_DEPTH) {
    invalid(traversal.rootLabel, `exceeds the maximum depth of ${MAX_RUNTIME_RESULT_DEPTH}`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number') return;
  if (typeof value !== 'object') invalid(label, 'must contain only inert JSON data');
  if (utilTypes.isProxy(value)) invalid(label, 'must not contain a Proxy');
  if (traversal.ancestors.has(value)) invalid(label, 'must not contain a cycle');
  traversal.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const rows = dataArray(value, label, () => consumeRuntimeResultEntry(traversal));
      for (let index = 0; index < rows.length; index += 1) {
        inertDataGraph(rows[index], `${label}[${index}]`, depth + 1, traversal);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(label, 'must be a plain data object');
    }
    const fields = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') invalid(label, 'must not contain symbol fields');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        invalid(`${label}.${key}`, 'must be an enumerable data field');
      }
      consumeRuntimeResultEntry(traversal);
      fields.push([key, descriptor.value]);
    }
    for (const [key, fieldValue] of fields) {
      inertDataGraph(fieldValue, `${label}.${key}`, depth + 1, traversal);
    }
  } finally {
    traversal.ancestors.delete(value);
  }
}

/** @param {unknown} value @param {string} label @param {number} [maxBytes] */
function semanticText(value, label, maxBytes = MAX_SEMANTIC_TEXT_BYTES) {
  if (typeof value !== 'string' || Buffer.byteLength(value) < 1 || Buffer.byteLength(value) > maxBytes) {
    invalid(label, `must contain 1 through ${maxBytes} UTF-8 bytes`);
  }
  canonicalJson(value);
  return value;
}

/** @param {unknown} value @param {string} label */
function hash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    invalid(label, 'must be a lowercase SHA-256 hash');
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || /** @type {number} */ (value) < 1) {
    invalid(label, 'must be a positive safe integer');
  }
  return /** @type {number} */ (value);
}

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} domain @param {unknown} material */
function semanticIdentity(domain, material) {
  return sha256(canonicalJson({ type: `specialist-attestation:${domain}`, version: 1, material }));
}

/** @param {unknown} value @param {string} label */
function exactCanonicalTarget(value, label) {
  const target = canonicalTarget(value);
  if (canonicalJson(value) !== canonicalJson(target)) invalid(label, 'must use the canonical target shape');
  return /** @type {Record<string, unknown>} */ (target);
}

/** @param {unknown} value @param {'Tester'|'Reviewer'} role @param {string} label */
function dispatchContext(value, role, label) {
  const dispatch = exactRecord(value, ['role', 'occurrence'], label);
  if (dispatch.role !== role) invalid(`${label}.role`, `must be ${role}`);
  return { role, occurrence: positiveInteger(dispatch.occurrence, `${label}.occurrence`) };
}

/** @param {unknown} value @param {string} label */
function attemptContext(value, label) {
  const attempt = exactRecord(
    value,
    ['ordinal', 'authorizationEvidenceHash', 'approachBasis'],
    label,
  );
  const ordinal = positiveInteger(attempt.ordinal, `${label}.ordinal`);
  const authorizationEvidenceHash = hash(
    attempt.authorizationEvidenceHash,
    `${label}.authorizationEvidenceHash`,
  );
  const approachBasis = JSON.parse(canonicalJson(attempt.approachBasis));
  validateApproachBasisV1(approachBasis, `${label}.approachBasis`);
  return { ordinal, authorizationEvidenceHash, approachBasis };
}

/** @param {Record<string, unknown>} context @param {'Tester'|'Reviewer'} role @param {string} label */
function commonContext(context, role, label) {
  const target = exactCanonicalTarget(context.target, `${label}.target`);
  const attempt = attemptContext(context.attempt, `${label}.attempt`);
  if (canonicalJson(attempt.approachBasis.target) !== canonicalJson(target)) {
    invalid(`${label}.attempt.approachBasis.target`, 'must match the attested target');
  }
  const sourceRevision = semanticText(context.sourceRevision, `${label}.sourceRevision`);
  const inspectedEvidenceHash = hash(context.inspectedEvidenceHash, `${label}.inspectedEvidenceHash`);
  const resultMaterial = semanticText(context.resultMaterial, `${label}.resultMaterial`);
  const dispatch = dispatchContext(context.dispatch, role, `${label}.dispatch`);
  const approachBasisIdentity = sha256(canonicalJson(attempt.approachBasis));
  const attemptIdentity = sha256(canonicalJson({
    version: 2,
    target,
    attemptOrdinal: attempt.ordinal,
    authorizationEvidenceHash: attempt.authorizationEvidenceHash,
    approachBasisIdentity,
  }));
  return {
    target,
    attempt,
    attemptIdentity,
    sourceRevision,
    sourceRevisionIdentity: semanticIdentity('source-revision', sourceRevision),
    inspectedEvidenceHash,
    resultMaterial,
    resultIdentity: semanticIdentity('result', resultMaterial),
    dispatch,
  };
}

/** @param {Record<string, unknown>} result @param {ReturnType<typeof commonContext>} context @param {number|null} reviewOrdinal @param {string} label */
function validateResultBinding(result, context, reviewOrdinal, label) {
  const target = exactCanonicalTarget(result.target, `${label}.target`);
  if (canonicalJson(target) !== canonicalJson(context.target)) invalid(`${label}.target`, 'must match context');
  if (positiveInteger(result.attemptOrdinal, `${label}.attemptOrdinal`) !== context.attempt.ordinal) {
    invalid(`${label}.attemptOrdinal`, 'must match context');
  }
  if (semanticText(result.sourceRevision, `${label}.sourceRevision`) !== context.sourceRevision) {
    invalid(`${label}.sourceRevision`, 'must match context');
  }
  if (hash(result.inspectedEvidenceHash, `${label}.inspectedEvidenceHash`) !== context.inspectedEvidenceHash) {
    invalid(`${label}.inspectedEvidenceHash`, 'must match context');
  }
  if (semanticText(result.resultMaterial, `${label}.resultMaterial`) !== context.resultMaterial) {
    invalid(`${label}.resultMaterial`, 'must match context');
  }
  const role = reviewOrdinal === null ? 'Tester' : 'Reviewer';
  const dispatch = dispatchContext(result.dispatch, role, `${label}.dispatch`);
  if (canonicalJson(dispatch) !== canonicalJson(context.dispatch)) invalid(`${label}.dispatch`, 'must match context');
  if (reviewOrdinal !== null
    && positiveInteger(result.reviewOrdinal, `${label}.reviewOrdinal`) !== reviewOrdinal) {
    invalid(`${label}.reviewOrdinal`, 'must match context');
  }
}

/** @param {'verification'|'independent-review'} kind @param {ReturnType<typeof commonContext>} context */
function authorityIdentity(kind, context) {
  return semanticIdentity('dispatch-authority', { kind, role: context.dispatch.role });
}

/** @param {'verification'|'independent-review'} kind @param {ReturnType<typeof commonContext>} context @param {number|null} reviewOrdinal */
function invocationIdentity(kind, context, reviewOrdinal) {
  return semanticIdentity('dispatch-invocation', {
    kind,
    target: context.target,
    attemptIdentity: context.attemptIdentity,
    attemptOrdinal: context.attempt.ordinal,
    sourceRevisionIdentity: context.sourceRevisionIdentity,
    inspectedEvidenceHash: context.inspectedEvidenceHash,
    resultIdentity: context.resultIdentity,
    role: context.dispatch.role,
    dispatchOccurrence: context.dispatch.occurrence,
    ...(reviewOrdinal === null ? {} : { reviewOrdinal }),
  });
}

/** @param {Record<string, unknown>} envelope @param {'verification'|'independent-review'} kind @param {string} authorityIdentityValue @param {string} invocationIdentityValue */
function trustedCapture(envelope, kind, authorityIdentityValue, invocationIdentityValue) {
  const bytes = Buffer.from(canonicalJson(envelope));
  const capture = {
    target: JSON.parse(canonicalJson(envelope.target)),
    state: 'complete',
    outcomeHash: sha256(bytes),
    authority: {
      kind,
      authorityIdentity: authorityIdentityValue,
      invocationIdentity: invocationIdentityValue,
    },
    bytes: capturedBytesV1(bytes),
  };
  validateTrustedSourceCaptureV2(capture);
  return capture;
}

/** @param {unknown} value @param {string} label */
function semanticCheck(value, label) {
  const check = exactRecord(value, ['definition', 'outcome', 'evidence'], label);
  const definition = semanticText(check.definition, `${label}.definition`);
  if (check.outcome !== 'passed' && check.outcome !== 'failed') {
    invalid(`${label}.outcome`, 'must be passed or failed');
  }
  const evidence = semanticText(check.evidence, `${label}.evidence`);
  return { definition, outcome: check.outcome, evidence };
}

/** @param {unknown} value @param {string} label */
function verificationChecks(value, label) {
  const inputRows = denseArray(value, 1, MAX_ROWS, label);
  /** @type {Map<string, ReturnType<typeof semanticCheck>>} */
  const byDefinition = new Map();
  for (let index = 0; index < inputRows.length; index += 1) {
    const row = semanticCheck(inputRows[index], `${label}[${index}]`);
    const previous = byDefinition.get(row.definition);
    if (previous) {
      const duplicate = canonicalJson(previous) === canonicalJson(row)
        ? 'duplicate'
        : 'conflicting duplicate';
      invalid(label, `contains ${duplicate} definition '${row.definition}'`);
    }
    byDefinition.set(row.definition, row);
  }
  return [...byDefinition.values()].map((row) => {
    const body = {
      definitionIdentity: semanticIdentity('check-definition', row.definition),
      outcome: row.outcome,
      evidenceIdentity: semanticIdentity('check-evidence', row.evidence),
    };
    return { checkIdentity: sha256(canonicalJson(body)), ...body };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.checkIdentity), Buffer.from(right.checkIdentity)));
}

/** @param {unknown} contextValue @param {unknown} resultValue */
function buildVerification(contextValue, resultValue) {
  const contextRecord = exactRecord(
    contextValue,
    ['target', 'attempt', 'sourceRevision', 'inspectedEvidenceHash', 'resultMaterial', 'dispatch'],
    'verification.context',
  );
  const result = exactRecord(
    resultValue,
    ['target', 'attemptOrdinal', 'sourceRevision', 'inspectedEvidenceHash', 'resultMaterial', 'dispatch', 'checks'],
    'verification.result',
  );
  const context = commonContext(contextRecord, 'Tester', 'verification.context');
  validateResultBinding(result, context, null, 'verification.result');
  const body = {
    type: 'verification-envelope',
    version: 2,
    target: context.target,
    attemptIdentity: context.attemptIdentity,
    sourceRevisionIdentity: context.sourceRevisionIdentity,
    inspectedEvidenceHash: context.inspectedEvidenceHash,
    resultIdentity: context.resultIdentity,
    checks: verificationChecks(result.checks, 'verification.result.checks'),
  };
  const envelope = { ...body, envelopeIdentity: sha256(canonicalJson(body)) };
  validateVerificationEnvelopeV2(envelope);
  const capture = trustedCapture(
    envelope,
    'verification',
    authorityIdentity('verification', context),
    invocationIdentity('verification', context, null),
  );
  if (canonicalJson(normalizeVerificationEnvelopeV2(capture)) !== canonicalJson(envelope)) {
    invalid('verification capture', 'must decode to the complete built envelope');
  }
  return capture;
}

/** @param {unknown} value @param {string} label */
function findingBasis(value, label) {
  const input = exactRecord(
    value,
    ['expectation', 'subjects', 'failureClass', 'checkDefinition'],
    label,
  );
  const expectationInput = exactRecord(input.expectation, ['kind', 'reference'], `${label}.expectation`);
  if (expectationInput.kind !== 'governing-rule' && expectationInput.kind !== 'expected-condition') {
    invalid(`${label}.expectation.kind`, 'must be governing-rule or expected-condition');
  }
  const expectationReference = semanticText(
    expectationInput.reference,
    `${label}.expectation.reference`,
  );
  const inputSubjects = denseArray(input.subjects, 1, MAX_ROWS, `${label}.subjects`);
  const subjects = [];
  const seenSubjects = new Set();
  for (let index = 0; index < inputSubjects.length; index += 1) {
    const subject = semanticText(inputSubjects[index], `${label}.subjects[${index}]`, 128);
    if (seenSubjects.has(subject)) {
      invalid(`${label}.subjects`, `contains duplicate subject '${subject}'`);
    }
    seenSubjects.add(subject);
    subjects.push(subject);
  }
  subjects.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return {
    expectation: {
      kind: expectationInput.kind,
      identity: semanticIdentity('finding-expectation', {
        kind: expectationInput.kind,
        reference: expectationReference,
      }),
    },
    subjects,
    failureClass: semanticText(input.failureClass, `${label}.failureClass`, 128),
    checkDefinition: semanticText(input.checkDefinition, `${label}.checkDefinition`),
  };
}

/** @param {unknown} value @param {string} label */
function findingObservation(value, label) {
  const kind = ownDataField(value, 'kind', label);
  if (kind === 'check-result') {
    exactRecord(value, ['kind'], label);
    return { kind };
  }
  if (kind === 'observed-evidence') {
    const observation = exactRecord(value, ['kind', 'evidence'], label);
    return {
      kind,
      evidence: semanticText(observation.evidence, `${label}.evidence`),
    };
  }
  return invalid(`${label}.kind`, 'must be observed-evidence or check-result');
}

/** @param {unknown} value @param {Record<string, unknown>} target @param {Record<string, unknown>} verification @param {string} label */
function reviewFindings(value, target, verification, label) {
  const rows = denseArray(value, 0, MAX_ROWS, label);
  const checks = /** @type {Record<string, unknown>[]} */ (verification.checks);
  const findings = [];
  const findingIdentitiesByBasis = new Map();
  const findingIdentities = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const finding = exactRecord(row, ['basis', 'observation'], `${label}[${index}]`);
    const basisInput = findingBasis(finding.basis, `${label}[${index}].basis`);
    const basis = {
      version: 1,
      target,
      expectation: basisInput.expectation,
      subjects: basisInput.subjects,
      failureClass: basisInput.failureClass,
      checkDefinitionIdentity: semanticIdentity('check-definition', basisInput.checkDefinition),
    };
    validateFindingBasisV1(basis, `${label}[${index}].basis`);
    const observationInput = findingObservation(finding.observation, `${label}[${index}].observation`);
    let observation;
    if (observationInput.kind === 'check-result') {
      const check = checks.find((candidate) => (
        candidate.definitionIdentity === basis.checkDefinitionIdentity
      ));
      if (!check) invalid(`${label}[${index}].observation`, 'must identify a bound verification check');
      observation = { kind: 'check-result', identity: check.checkIdentity };
    } else {
      observation = {
        kind: 'observed-evidence',
        identity: semanticIdentity('finding-observation', observationInput.evidence),
      };
    }
    const basisIdentity = sha256(canonicalJson(basis));
    const findingBody = { version: 2, basisIdentity, observation };
    const findingIdentity = sha256(canonicalJson(findingBody));
    const previousFindingIdentity = findingIdentitiesByBasis.get(basisIdentity);
    if (previousFindingIdentity) {
      const duplicate = previousFindingIdentity === findingIdentity
        ? 'duplicate'
        : 'conflicting duplicate';
      invalid(label, `must not contain ${duplicate} findings`);
    }
    if (findingIdentities.has(findingIdentity)) {
      invalid(label, 'must not contain duplicate findings');
    }
    findingIdentitiesByBasis.set(basisIdentity, findingIdentity);
    findingIdentities.add(findingIdentity);
    findings.push({
      version: 2,
      findingIdentity,
      basis,
      basisIdentity,
      observation,
    });
  }
  return findings.sort((left, right) => (
    Buffer.compare(Buffer.from(left.findingIdentity), Buffer.from(right.findingIdentity))
  ));
}

/** @param {unknown} contextValue @param {unknown} resultValue */
function buildIndependentReview(contextValue, resultValue) {
  const contextRecord = exactRecord(
    contextValue,
    [
      'target', 'attempt', 'sourceRevision', 'inspectedEvidenceHash', 'resultMaterial',
      'dispatch', 'reviewOrdinal', 'verification',
    ],
    'independent-review.context',
  );
  const result = exactRecord(
    resultValue,
    [
      'target', 'attemptOrdinal', 'reviewOrdinal', 'sourceRevision', 'inspectedEvidenceHash',
      'resultMaterial', 'dispatch', 'verdict', 'findings',
    ],
    'independent-review.result',
  );
  const context = commonContext(contextRecord, 'Reviewer', 'independent-review.context');
  const reviewOrdinal = positiveInteger(
    contextRecord.reviewOrdinal,
    'independent-review.context.reviewOrdinal',
  );
  validateResultBinding(result, context, reviewOrdinal, 'independent-review.result');
  if (result.verdict !== 'accepted' && result.verdict !== 'rejected') {
    invalid('independent-review.result.verdict', 'must be accepted or rejected');
  }
  const verificationInput = exactRecord(
    contextRecord.verification,
    ['capture', 'dispatch'],
    'independent-review.context.verification',
  );
  const verificationDispatch = dispatchContext(
    verificationInput.dispatch,
    'Tester',
    'independent-review.context.verification.dispatch',
  );
  validateTrustedSourceCaptureV2(
    verificationInput.capture,
    'independent-review.context.verification.capture',
  );
  const verification = /** @type {Record<string, unknown>} */ (
    normalizeVerificationEnvelopeV2(verificationInput.capture)
  );
  for (const [field, expected] of [
    ['target', context.target],
    ['attemptIdentity', context.attemptIdentity],
    ['sourceRevisionIdentity', context.sourceRevisionIdentity],
    ['inspectedEvidenceHash', context.inspectedEvidenceHash],
    ['resultIdentity', context.resultIdentity],
  ]) {
    if (canonicalJson(verification[field]) !== canonicalJson(expected)) {
      invalid(`independent-review.context.verification.${field}`, 'must match review context');
    }
  }
  const verificationContext = { ...context, dispatch: verificationDispatch };
  const verificationCapture = /** @type {Record<string, unknown>} */ (verificationInput.capture);
  const verificationAuthority = /** @type {Record<string, unknown>} */ (verificationCapture.authority);
  if (verificationAuthority.authorityIdentity !== authorityIdentity('verification', verificationContext)
    || verificationAuthority.invocationIdentity !== invocationIdentity('verification', verificationContext, null)) {
    invalid('independent-review.context.verification.capture.authority', 'must be builder-derived');
  }
  const verificationBytes = /** @type {Record<string, unknown>} */ (verificationCapture.bytes);
  if (verificationCapture.outcomeHash !== verificationBytes.sha256) {
    invalid('independent-review.context.verification.capture.outcomeHash', 'must bind exact envelope bytes');
  }
  const findings = reviewFindings(
    result.findings,
    context.target,
    verification,
    'independent-review.result.findings',
  );
  if ((result.verdict === 'accepted' && findings.length !== 0)
    || (result.verdict === 'rejected' && findings.length === 0)) {
    invalid(
      'independent-review.result.findings',
      'must be empty for accepted review and nonempty for rejected review',
    );
  }
  const reviewerAuthorityIdentity = authorityIdentity('independent-review', context);
  const reviewInvocationIdentity = invocationIdentity('independent-review', context, reviewOrdinal);
  const body = {
    type: 'independent-review-envelope',
    version: 2,
    target: context.target,
    attemptIdentity: context.attemptIdentity,
    attemptOrdinal: context.attempt.ordinal,
    reviewOrdinal,
    reviewerAuthorityIdentity,
    reviewInvocationIdentity,
    sourceRevisionIdentity: context.sourceRevisionIdentity,
    inspectedEvidenceHash: context.inspectedEvidenceHash,
    resultIdentity: context.resultIdentity,
    verificationEnvelopeIdentity: verification.envelopeIdentity,
    verdict: result.verdict,
    findings,
  };
  const envelope = { ...body, envelopeIdentity: sha256(canonicalJson(body)) };
  validateIndependentReviewEnvelopeV2(envelope, verification);
  const capture = trustedCapture(
    envelope,
    'independent-review',
    reviewerAuthorityIdentity,
    reviewInvocationIdentity,
  );
  if (canonicalJson(normalizeIndependentReviewEnvelopeV2(capture, verification)) !== canonicalJson(envelope)) {
    invalid('independent-review capture', 'must decode to the complete built envelope');
  }
  return capture;
}

/**
 * Build one cooperative, coordinator-recorded specialist attestation.
 * This validates structure and context consistency, not dispatch provenance or
 * protection against changes made before the sole result reaches this boundary.
 * @param {unknown} value
 */
export function buildSpecialistAttestation(value) {
  inertDataGraph(value, 'SpecialistAttestationInput');
  const input = exactRecord(value, ['kind', 'context', 'result'], 'SpecialistAttestationInput');
  if (input.kind === 'verification') return buildVerification(input.context, input.result);
  if (input.kind === 'independent-review') return buildIndependentReview(input.context, input.result);
  return invalid('SpecialistAttestationInput.kind', 'must be verification or independent-review');
}

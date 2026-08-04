// @ts-check

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canonicalJson,
  normalizeIndependentReviewEnvelopeV2,
  normalizeVerificationEnvelopeV2,
  trustedSourceCaptureIdentityV2,
  validateIndependentReviewEnvelopeV2,
  validateTrustedSourceCaptureV2,
  validateVerificationEnvelopeV2,
} from './recovery.mjs';
import { buildSpecialistAttestation } from './specialist-attestation.mjs';

const TARGET = Object.freeze({
  specPath: '.dude/specs/019-specialist-attestation-producer/spec.md',
  lane: 'lightweight',
  taskKey: 'T001@70726f64',
});

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(canonicalJson(value));
}

/** @param {string} domain @param {unknown} material */
function semanticIdentity(domain, material) {
  return sha256(canonicalJson({ type: `specialist-attestation:${domain}`, version: 1, material }));
}

function approachBasis() {
  return {
    version: 1,
    target: clone(TARGET),
    action: 'implement-task',
    materialInputs: {
      targets: [
        'src/skills/dude-work/specialist-attestation.mjs',
        'src/skills/dude-work/specialist-attestation.test.mjs',
      ],
      operations: ['implement-task'],
      checks: ['verification'],
    },
    mechanismIdentities: [],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  };
}

/** @param {Record<string, unknown>[]} [checks] @param {number} [occurrence] */
function verificationInput(checks = [
  { definition: 'node focused test', outcome: 'passed', evidence: 'node:test exit 0' },
], occurrence = 1) {
  const common = {
    target: clone(TARGET),
    attemptOrdinal: 1,
    sourceRevision: 'git:feature-019-revision-1',
    inspectedEvidenceHash: sha256('inspection:feature-019:1'),
    resultMaterial: canonicalJson({ changed: ['specialist-attestation.mjs'], status: 'recorded' }),
    dispatch: { role: 'Tester', occurrence },
  };
  return {
    kind: 'verification',
    context: {
      target: clone(common.target),
      attempt: {
        ordinal: common.attemptOrdinal,
        authorizationEvidenceHash: sha256('authorization:feature-019:1'),
        approachBasis: approachBasis(),
      },
      sourceRevision: common.sourceRevision,
      inspectedEvidenceHash: common.inspectedEvidenceHash,
      resultMaterial: common.resultMaterial,
      dispatch: clone(common.dispatch),
    },
    result: { ...clone(common), checks: clone(checks) },
  };
}

/** @param {ReturnType<typeof verificationInput>} input */
function buildVerification(input) {
  const capture = /** @type {Record<string, unknown>} */ (buildSpecialistAttestation(input));
  validateTrustedSourceCaptureV2(capture);
  const envelope = /** @type {Record<string, unknown>} */ (normalizeVerificationEnvelopeV2(capture));
  validateVerificationEnvelopeV2(envelope);
  return { capture, envelope };
}

/** @param {Record<string, unknown>} verificationCapture @param {'accepted'|'rejected'} verdict @param {Record<string, unknown>[]} findings @param {number} [occurrence] @param {number} [reviewOrdinal] */
function reviewInput(verificationCapture, verdict, findings, occurrence = 1, reviewOrdinal = 1) {
  const verificationBase = verificationInput();
  const common = {
    target: clone(TARGET),
    attemptOrdinal: 1,
    reviewOrdinal,
    sourceRevision: verificationBase.context.sourceRevision,
    inspectedEvidenceHash: verificationBase.context.inspectedEvidenceHash,
    resultMaterial: verificationBase.context.resultMaterial,
    dispatch: { role: 'Reviewer', occurrence },
  };
  return {
    kind: 'independent-review',
    context: {
      target: clone(common.target),
      attempt: clone(verificationBase.context.attempt),
      sourceRevision: common.sourceRevision,
      inspectedEvidenceHash: common.inspectedEvidenceHash,
      resultMaterial: common.resultMaterial,
      dispatch: clone(common.dispatch),
      reviewOrdinal,
      verification: {
        capture: clone(verificationCapture),
        dispatch: clone(verificationBase.context.dispatch),
      },
    },
    result: { ...clone(common), verdict, findings: clone(findings) },
  };
}

/** @param {ReturnType<typeof reviewInput>} input */
function buildReview(input) {
  const verification = /** @type {Record<string, unknown>} */ (
    normalizeVerificationEnvelopeV2(input.context.verification.capture)
  );
  const capture = /** @type {Record<string, unknown>} */ (buildSpecialistAttestation(input));
  validateTrustedSourceCaptureV2(capture);
  const envelope = /** @type {Record<string, unknown>} */ (
    normalizeIndependentReviewEnvelopeV2(capture, verification)
  );
  validateIndependentReviewEnvelopeV2(envelope, verification);
  return { capture, envelope, verification };
}

const OBSERVED_FINDING = Object.freeze({
  basis: {
    expectation: { kind: 'governing-rule', reference: 'Feature 019 FR-003' },
    subjects: ['T001@70726f64'],
    failureClass: 'semantic-loss',
    checkDefinition: 'node focused test',
  },
  observation: { kind: 'observed-evidence', evidence: 'one finding observed in source' },
});

const CHECK_FINDING = Object.freeze({
  basis: {
    expectation: { kind: 'expected-condition', reference: 'focused test must pass' },
    subjects: ['src/skills/dude-work/specialist-attestation.mjs', 'T001@70726f64'],
    failureClass: 'check-failure',
    checkDefinition: 'node focused test',
  },
  observation: { kind: 'check-result' },
});

/** @param {Record<string, unknown>} envelope @param {Record<string, unknown>[]} checks */
function assertVerificationSemantics(envelope, checks) {
  const builtChecks = /** @type {Record<string, unknown>[]} */ (envelope.checks);
  assert.equal(builtChecks.length, checks.length);
  for (const source of checks) {
    const built = builtChecks.find((check) => (
      check.definitionIdentity === semanticIdentity('check-definition', source.definition)
    ));
    assert.ok(built);
    assert.equal(built.outcome, source.outcome);
    assert.equal(
      built.evidenceIdentity,
      semanticIdentity('check-evidence', source.evidence),
    );
  }
}

/** @param {Record<string, unknown>} source @param {Record<string, unknown>} target @param {Record<string, unknown>} verification */
function expectedReviewFinding(source, target, verification) {
  const sourceBasis = /** @type {Record<string, unknown>} */ (source.basis);
  const sourceExpectation = /** @type {Record<string, unknown>} */ (sourceBasis.expectation);
  const subjects = [.../** @type {string[]} */ (sourceBasis.subjects)]
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const basis = {
    version: 1,
    target,
    expectation: {
      kind: sourceExpectation.kind,
      identity: semanticIdentity('finding-expectation', sourceExpectation),
    },
    subjects,
    failureClass: sourceBasis.failureClass,
    checkDefinitionIdentity: semanticIdentity('check-definition', sourceBasis.checkDefinition),
  };
  const sourceObservation = /** @type {Record<string, unknown>} */ (source.observation);
  let observation;
  if (sourceObservation.kind === 'check-result') {
    const check = /** @type {Record<string, unknown>[]} */ (verification.checks).find((candidate) => (
      candidate.definitionIdentity === basis.checkDefinitionIdentity
    ));
    assert.ok(check);
    observation = { kind: 'check-result', identity: check.checkIdentity };
  } else {
    observation = {
      kind: 'observed-evidence',
      identity: semanticIdentity('finding-observation', sourceObservation.evidence),
    };
  }
  const basisIdentity = sha256(canonicalJson(basis));
  const findingBody = { version: 2, basisIdentity, observation };
  return {
    version: 2,
    findingIdentity: sha256(canonicalJson(findingBody)),
    basis,
    basisIdentity,
    observation,
  };
}

/** @param {ReturnType<typeof buildReview>} built @param {ReturnType<typeof reviewInput>['result']} source */
function assertReviewSemantics(built, source) {
  assert.equal(built.envelope.verdict, source.verdict);
  const expectedFindings = source.findings
    .map((finding) => expectedReviewFinding(finding, built.envelope.target, built.verification))
    .sort((left, right) => Buffer.compare(
      Buffer.from(left.findingIdentity),
      Buffer.from(right.findingIdentity),
    ));
  assert.deepEqual(built.envelope.findings, expectedFindings);
}

test('verification preserves passing, failing, and mixed checks through existing validators', () => {
  const cases = [
    ['passing', [{ definition: 'unit', outcome: 'passed', evidence: 'unit exit 0' }], ['passed']],
    ['failing', [{ definition: 'lint', outcome: 'failed', evidence: 'lint exit 1' }], ['failed']],
    ['mixed', [
      { definition: 'unit', outcome: 'passed', evidence: 'unit exit 0' },
      { definition: 'lint', outcome: 'failed', evidence: 'lint exit 1' },
    ], ['failed', 'passed']],
  ];
  for (const [label, checks, outcomes] of cases) {
    const { capture, envelope } = buildVerification(verificationInput(
      /** @type {Record<string, unknown>[]} */ (checks),
    ));
    assert.deepEqual(
      /** @type {Record<string, unknown>[]} */ (envelope.checks)
        .map((check) => check.outcome).sort(),
      outcomes,
      /** @type {string} */ (label),
    );
    for (const source of /** @type {Record<string, unknown>[]} */ (checks)) {
      const built = /** @type {Record<string, unknown>[]} */ (envelope.checks).find((check) => (
        check.definitionIdentity === semanticIdentity('check-definition', source.definition)
      ));
      assert.ok(built, `${label} preserves check definition`);
      assert.equal(built.outcome, source.outcome, `${label} preserves check outcome`);
      assert.equal(
        built.evidenceIdentity,
        semanticIdentity('check-evidence', source.evidence),
        `${label} preserves check evidence`,
      );
    }
    assert.equal(capture.outcomeHash, /** @type {Record<string, unknown>} */ (capture.bytes).sha256);
  }
});

test('verification canonicalizes check order and refuses every duplicate definition', () => {
  const first = { definition: 'unit', outcome: 'passed', evidence: 'unit exit 0' };
  const second = { definition: 'lint', outcome: 'failed', evidence: 'lint exit 1' };
  const ordered = buildVerification(verificationInput([first, second])).capture;
  const reversed = buildVerification(verificationInput([second, first])).capture;
  assert.deepEqual(reversed, ordered);
  assert.throws(
    () => buildSpecialistAttestation(verificationInput([first, second, clone(first)])),
    { name: 'TypeError', message: /contains duplicate definition 'unit'/ },
  );
  for (const conflict of [
    { ...first, outcome: 'failed' },
    { ...first, evidence: 'different evidence' },
  ]) {
    assert.throws(
      () => buildSpecialistAttestation(verificationInput([first, conflict])),
      { name: 'TypeError', message: /conflicting duplicate definition/ },
    );
  }
});

test('reviews refuse duplicate semantic subjects', () => {
  const verification = buildVerification(verificationInput()).capture;
  const input = reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]);
  input.result.findings[0].basis.subjects = ['T001@70726f64', 'T001@70726f64'];

  assert.throws(
    () => buildSpecialistAttestation(input),
    { name: 'TypeError', message: /contains duplicate subject 'T001@70726f64'/ },
  );
});

test('reviews refuse byte-identical duplicate findings', () => {
  const verification = buildVerification(verificationInput()).capture;
  const finding = clone(OBSERVED_FINDING);

  assert.throws(
    () => buildSpecialistAttestation(reviewInput(
      verification,
      'rejected',
      [finding, clone(finding)],
    )),
    { name: 'TypeError', message: /must not contain duplicate findings/ },
  );
});

test('reviews refuse conflicting duplicate findings with the same normalized basis', () => {
  const verification = buildVerification(verificationInput()).capture;
  const first = clone(OBSERVED_FINDING);
  const second = clone(OBSERVED_FINDING);
  second.observation.evidence = 'different evidence observed for the same basis';

  assert.throws(
    () => buildSpecialistAttestation(reviewInput(
      verification,
      'rejected',
      [first, second],
    )),
    { name: 'TypeError', message: /must not contain conflicting duplicate findings/ },
  );
});

test('inert semantic data refuses depth 33 with a bounded TypeError', () => {
  const input = verificationInput();
  let nested = /** @type {Record<string, unknown>} */ (input);
  for (let depth = 0; depth < 33; depth += 1) {
    nested.unknown = {};
    nested = /** @type {Record<string, unknown>} */ (nested.unknown);
  }

  assert.throws(
    () => buildSpecialistAttestation(input),
    {
      name: 'TypeError',
      message: 'SpecialistAttestationInput exceeds the maximum depth of 32',
    },
  );
});

test('inert semantic data refuses more than 4096 entries with a bounded TypeError', () => {
  const input = verificationInput();
  input.unknown = Object.fromEntries(
    Array.from({ length: 4097 }, (_, index) => [`entry${index}`, null]),
  );

  assert.throws(
    () => buildSpecialistAttestation(input),
    {
      name: 'TypeError',
      message: 'SpecialistAttestationInput exceeds the maximum entry count of 4096',
    },
  );
});

test('cyclic semantic data refuses before semantic construction', () => {
  const input = verificationInput();
  const materialInputs = /** @type {Record<string, unknown>} */ (
    input.context.attempt.approachBasis.materialInputs
  );
  materialInputs.self = materialInputs;

  assert.throws(
    () => buildSpecialistAttestation(input),
    { name: 'TypeError', message: /must not contain a cycle/ },
  );
});

test('array extra own keys refuse without invoking map or iterator behavior', () => {
  const verification = buildVerification(verificationInput()).capture;
  const cases = [
    {
      label: 'checks extra field',
      input: verificationInput(),
      install(input) {
        input.result.checks.extra = true;
      },
    },
    {
      label: 'findings extra field',
      input: reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]),
      install(input) {
        input.result.findings.extra = true;
      },
    },
    {
      label: 'subjects extra field',
      input: reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]),
      install(input) {
        input.result.findings[0].basis.subjects.extra = true;
      },
    },
    {
      label: 'checks own map',
      input: verificationInput(),
      install(input, behavior) {
        input.result.checks.map = () => {
          behavior.calls += 1;
          return [];
        };
      },
    },
    {
      label: 'checks own iterator',
      input: verificationInput(),
      install(input, behavior) {
        Object.defineProperty(input.result.checks, Symbol.iterator, {
          enumerable: true,
          value() {
            behavior.calls += 1;
            return [][Symbol.iterator]();
          },
        });
      },
    },
  ];

  for (const fixture of cases) {
    const behavior = { calls: 0 };
    fixture.install(/** @type {any} */ (fixture.input), behavior);
    assert.throws(
      () => buildSpecialistAttestation(fixture.input),
      { name: 'TypeError', message: /must not contain extra fields/ },
      fixture.label,
    );
    assert.equal(behavior.calls, 0, fixture.label);
  }
});

test('verification derives identities from consistency-checked context', () => {
  const input = verificationInput();

  const { capture, envelope } = buildVerification(input);

  const approachBasisIdentity = sha256(canonicalJson(input.context.attempt.approachBasis));
  assert.deepEqual(envelope.target, input.context.target);
  assert.equal(envelope.attemptIdentity, sha256(canonicalJson({
    version: 2,
    target: input.context.target,
    attemptOrdinal: input.context.attempt.ordinal,
    authorizationEvidenceHash: input.context.attempt.authorizationEvidenceHash,
    approachBasisIdentity,
  })));
  assert.equal(
    envelope.sourceRevisionIdentity,
    semanticIdentity('source-revision', input.context.sourceRevision),
  );
  assert.equal(envelope.inspectedEvidenceHash, input.context.inspectedEvidenceHash);
  assert.equal(envelope.resultIdentity, semanticIdentity('result', input.context.resultMaterial));
  assert.deepEqual(capture.authority, {
    kind: 'verification',
    authorityIdentity: semanticIdentity('dispatch-authority', {
      kind: 'verification',
      role: 'Tester',
    }),
    invocationIdentity: semanticIdentity('dispatch-invocation', {
      kind: 'verification',
      target: input.context.target,
      attemptIdentity: envelope.attemptIdentity,
      attemptOrdinal: input.context.attempt.ordinal,
      sourceRevisionIdentity: envelope.sourceRevisionIdentity,
      inspectedEvidenceHash: input.context.inspectedEvidenceHash,
      resultIdentity: envelope.resultIdentity,
      role: 'Tester',
      dispatchOccurrence: input.context.dispatch.occurrence,
    }),
  });
});

test('reviews preserve accepted verdicts and rejected complete finding observations', () => {
  const verification = buildVerification(verificationInput()).capture;
  const accepted = buildReview(reviewInput(verification, 'accepted', []));
  assert.equal(accepted.envelope.verdict, 'accepted');
  assert.deepEqual(accepted.envelope.findings, []);

  const rejected = buildReview(reviewInput(
    verification,
    'rejected',
    [clone(CHECK_FINDING), clone(OBSERVED_FINDING)],
  ));
  assert.equal(rejected.envelope.verdict, 'rejected');
  assert.equal(/** @type {unknown[]} */ (rejected.envelope.findings).length, 2);
  const findings = /** @type {Record<string, unknown>[]} */ (rejected.envelope.findings);
  const checkFinding = findings.find((finding) => (
    /** @type {Record<string, unknown>} */ (finding.observation).kind === 'check-result'
  ));
  const observedFinding = findings.find((finding) => (
    /** @type {Record<string, unknown>} */ (finding.observation).kind === 'observed-evidence'
  ));
  const check = /** @type {Record<string, unknown>[]} */ (rejected.verification.checks)[0];
  const basis = /** @type {Record<string, unknown>} */ (checkFinding?.basis);
  assert.equal(basis.failureClass, CHECK_FINDING.basis.failureClass);
  assert.deepEqual(basis.subjects, [...CHECK_FINDING.basis.subjects].sort());
  assert.equal(
    basis.checkDefinitionIdentity,
    semanticIdentity('check-definition', CHECK_FINDING.basis.checkDefinition),
  );
  assert.deepEqual(basis.expectation, {
    kind: CHECK_FINDING.basis.expectation.kind,
    identity: semanticIdentity('finding-expectation', CHECK_FINDING.basis.expectation),
  });
  assert.equal(/** @type {Record<string, unknown>} */ (checkFinding?.observation).identity, check.checkIdentity);
  assert.equal(
    /** @type {Record<string, unknown>} */ (observedFinding?.observation).identity,
    semanticIdentity('finding-observation', OBSERVED_FINDING.observation.evidence),
  );
  assert.equal(rejected.envelope.verificationEnvelopeIdentity, rejected.verification.envelopeIdentity);
});

test('reviews canonicalize finding order deterministically', () => {
  const verification = buildVerification(verificationInput()).capture;
  const ordered = buildReview(reviewInput(
    verification,
    'rejected',
    [clone(CHECK_FINDING), clone(OBSERVED_FINDING)],
  ));
  const reversed = buildReview(reviewInput(
    verification,
    'rejected',
    [clone(OBSERVED_FINDING), clone(CHECK_FINDING)],
  ));

  assert.deepEqual(reversed.capture, ordered.capture);
});

test('closed inputs refuse unknown and precomputed identity-bearing fields', () => {
  const verificationCases = [
    (input) => { input.envelopeIdentity = sha256('envelope'); },
    (input) => { input.context.resultIdentity = sha256('result'); },
    (input) => { input.context.attempt.attemptIdentity = sha256('attempt'); },
    (input) => { input.context.dispatch.authorityIdentity = sha256('authority'); },
    (input) => { input.result.resultIdentity = sha256('result'); },
    (input) => { input.result.checks[0].checkIdentity = sha256('check'); },
    (input) => { input.result.checks[0].definitionIdentity = sha256('definition'); },
    (input) => { input.result.dispatch.invocationIdentity = sha256('invocation'); },
    (input) => { input.result.envelopeIdentity = sha256('envelope'); },
    (input) => { input.result.captureIdentity = sha256('capture'); },
  ];
  for (const mutate of verificationCases) {
    const input = verificationInput();
    mutate(/** @type {any} */ (input));
    assert.throws(() => buildSpecialistAttestation(input), /unknown field/);
  }

  const verification = buildVerification(verificationInput()).capture;
  const reviewCases = [
    (input) => { input.context.reviewInvocationIdentity = sha256('invocation'); },
    (input) => { input.context.verificationEnvelopeIdentity = sha256('verification'); },
    (input) => { input.result.verdictIdentity = sha256('verdict'); },
    (input) => { input.result.verificationEnvelopeIdentity = sha256('verification'); },
    (input) => { input.result.findings[0].findingIdentity = sha256('finding'); },
    (input) => { input.result.findings[0].basis.basisIdentity = sha256('basis'); },
    (input) => { input.result.chronologyIdentity = sha256('chronology'); },
    (input) => { input.result.reviewerAuthorityIdentity = sha256('authority'); },
  ];
  for (const mutate of reviewCases) {
    const input = reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]);
    mutate(/** @type {any} */ (input));
    assert.throws(() => buildSpecialistAttestation(input), /unknown field/);
  }
});

test('hostile custom array prototype refuses without invoking its map', () => {
  const input = verificationInput();
  let mapCalls = 0;
  const hostilePrototype = new Proxy(Array.prototype, {
    get(prototype, key, receiver) {
      if (key === 'map') {
        return () => {
          mapCalls += 1;
          return [];
        };
      }
      return Reflect.get(prototype, key, receiver);
    },
  });
  Object.setPrototypeOf(input.result.checks, hostilePrototype);

  assert.throws(() => buildSpecialistAttestation(input), /must use Array\.prototype/);
  assert.equal(mapCalls, 0);
});

test('nested Proxy, accessor, and custom-prototype semantic containers refuse before behavior', () => {
  const verification = buildVerification(verificationInput()).capture;
  const cases = [
    {
      label: 'target Proxy before imported validation',
      input: verificationInput(),
      install(input, behavior) {
        input.context.target = new Proxy(input.context.target, {
          getPrototypeOf() {
            behavior.calls += 1;
            throw new Error('nested Proxy behavior must not execute');
          },
        });
      },
      expected: /must not contain a Proxy/,
    },
    {
      label: 'check Proxy',
      input: verificationInput(),
      install(input, behavior) {
        input.result.checks[0] = new Proxy(input.result.checks[0], {
          get() {
            behavior.calls += 1;
            throw new Error('nested Proxy behavior must not execute');
          },
        });
      },
      expected: /must not contain a Proxy/,
    },
    {
      label: 'finding accessor',
      input: reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]),
      install(input, behavior) {
        Object.defineProperty(input.result.findings[0].observation, 'evidence', {
          enumerable: true,
          get() {
            behavior.calls += 1;
            throw new Error('nested accessor must not execute');
          },
        });
      },
      expected: /must be an enumerable data field/,
    },
    {
      label: 'finding custom prototype',
      input: reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]),
      install(input) {
        Object.setPrototypeOf(input.result.findings[0].basis, { inherited: true });
      },
      expected: /must be a plain data object/,
    },
    {
      label: 'subjects custom array prototype',
      input: reviewInput(verification, 'rejected', [clone(OBSERVED_FINDING)]),
      install(input, behavior) {
        const prototype = Object.create(Array.prototype);
        prototype.map = () => {
          behavior.calls += 1;
          return [];
        };
        Object.setPrototypeOf(input.result.findings[0].basis.subjects, prototype);
      },
      expected: /must use Array\.prototype/,
    },
  ];

  for (const fixture of cases) {
    const behavior = { calls: 0 };
    fixture.install(/** @type {any} */ (fixture.input), behavior);
    assert.throws(
      () => buildSpecialistAttestation(fixture.input),
      fixture.expected,
      fixture.label,
    );
    assert.equal(behavior.calls, 0, fixture.label);
  }
});

test('malformed, incomplete, and contradictory specialist results refuse', () => {
  const malformed = [
    (input) => { delete input.result.checks; },
    (input) => { input.result.checks = []; },
    (input) => { input.result.checks[0].outcome = 'unknown'; },
    (input) => { delete input.result.checks[0].evidence; },
    (input) => { input.result.checks = Array.from({ length: 17 }, (_, index) => ({
      definition: `check-${index}`,
      outcome: 'passed',
      evidence: `evidence-${index}`,
    })); },
  ];
  for (const mutate of malformed) {
    const input = verificationInput();
    mutate(/** @type {any} */ (input));
    assert.throws(() => buildSpecialistAttestation(input), TypeError);
  }

  const verification = buildVerification(verificationInput()).capture;
  assert.throws(
    () => buildSpecialistAttestation(reviewInput(verification, 'accepted', [clone(OBSERVED_FINDING)])),
    /empty for accepted review/,
  );
  assert.throws(
    () => buildSpecialistAttestation(reviewInput(verification, 'rejected', [])),
    /nonempty for rejected review/,
  );
  assert.throws(
    () => buildSpecialistAttestation(reviewInput(verification, 'rejected', [{
      basis: clone(OBSERVED_FINDING.basis),
      observation: { kind: 'check-result' },
    }, {
      basis: clone(OBSERVED_FINDING.basis),
      observation: { kind: 'check-result' },
    }])),
    /duplicate findings/,
  );
  const missingCheck = reviewInput(verification, 'rejected', [clone(CHECK_FINDING)]);
  missingCheck.result.findings[0].basis.checkDefinition = 'check absent from verification';
  assert.throws(() => buildSpecialistAttestation(missingCheck), /bound verification check/);
});

test('API accepts at most sixteen checks and findings', () => {
  const checks = Array.from({ length: 16 }, (_, index) => ({
    definition: `check-${index}`,
    outcome: index % 2 === 0 ? 'passed' : 'failed',
    evidence: `evidence-${index}`,
  }));
  const tooManyChecks = [...checks, {
    definition: 'check-16',
    outcome: 'passed',
    evidence: 'evidence-16',
  }];

  const verification = buildVerification(verificationInput(checks));

  assert.equal(/** @type {unknown[]} */ (verification.envelope.checks).length, 16);
  assert.throws(
    () => buildSpecialistAttestation(verificationInput(tooManyChecks)),
    /must contain 1 through 16 rows/,
  );

  const findings = Array.from({ length: 16 }, (_, index) => ({
    basis: {
      ...clone(OBSERVED_FINDING.basis),
      expectation: {
        ...clone(OBSERVED_FINDING.basis.expectation),
        reference: `Feature 019 finding ${index}`,
      },
    },
    observation: { kind: 'observed-evidence', evidence: `finding-${index}` },
  }));
  const tooManyFindings = [...findings, {
    basis: clone(OBSERVED_FINDING.basis),
    observation: { kind: 'observed-evidence', evidence: 'finding-16' },
  }];

  const review = buildReview(reviewInput(verification.capture, 'rejected', findings));

  assert.equal(/** @type {unknown[]} */ (review.envelope.findings).length, 16);
  assert.throws(
    () => buildSpecialistAttestation(reviewInput(
      verification.capture,
      'rejected',
      tooManyFindings,
    )),
    /must contain 0 through 16 rows/,
  );
});

test('semantic result bindings refuse target, attempt, revision, evidence, result, dispatch, and chronology mismatch', () => {
  const verificationMutations = [
    (input) => { input.context.attempt.approachBasis.target = { ...clone(TARGET), taskKey: 'T002@696e7467' }; },
    (input) => { input.context.dispatch.role = 'Reviewer'; },
    (input) => { input.result.target = { ...clone(TARGET), taskKey: 'T002@696e7467' }; },
    (input) => { input.result.attemptOrdinal = 2; },
    (input) => { input.result.sourceRevision = 'git:other-revision'; },
    (input) => { input.result.inspectedEvidenceHash = sha256('other-inspection'); },
    (input) => { input.result.resultMaterial = 'other result'; },
    (input) => { input.result.dispatch.occurrence = 2; },
    (input) => { input.result.dispatch.role = 'Reviewer'; },
  ];
  for (const mutate of verificationMutations) {
    const input = verificationInput();
    mutate(/** @type {any} */ (input));
    assert.throws(() => buildSpecialistAttestation(input), TypeError);
  }

  const verification = buildVerification(verificationInput()).capture;
  const reviewMutations = [
    (input) => { input.result.reviewOrdinal = 2; },
    (input) => { input.result.dispatch.occurrence = 2; },
    (input) => { input.context.verification.dispatch.occurrence = 2; },
  ];
  for (const mutate of reviewMutations) {
    const input = reviewInput(verification, 'accepted', []);
    mutate(/** @type {any} */ (input));
    assert.throws(() => buildSpecialistAttestation(input), TypeError);
  }

  const replay = reviewInput(verification, 'accepted', []);
  replay.context.sourceRevision = 'git:replayed-for-another-revision';
  replay.result.sourceRevision = replay.context.sourceRevision;
  assert.throws(() => buildSpecialistAttestation(replay), /verification.sourceRevisionIdentity/);

  const anotherResult = reviewInput(verification, 'accepted', []);
  anotherResult.context.resultMaterial = 'replayed for another result';
  anotherResult.result.resultMaterial = anotherResult.context.resultMaterial;
  assert.throws(() => buildSpecialistAttestation(anotherResult), /verification.resultIdentity/);
});

for (const [label, mutate, expected] of [
  ['target', (input) => {
    const target = { ...clone(TARGET), taskKey: 'T002@696e7467' };
    input.context.target = clone(target);
    input.context.attempt.approachBasis.target = clone(target);
    input.result.target = clone(target);
  }, /verification.target/],
  ['attempt', (input) => {
    input.context.attempt.ordinal = 2;
    input.result.attemptOrdinal = 2;
  }, /verification.attemptIdentity/],
  ['authorization evidence', (input) => {
    input.context.attempt.authorizationEvidenceHash = sha256('authorization:feature-019:other');
  }, /verification.attemptIdentity/],
  ['approach basis', (input) => {
    input.context.attempt.approachBasis.action = 'retry-task';
  }, /verification.attemptIdentity/],
  ['inspected evidence', (input) => {
    const inspectedEvidenceHash = sha256('inspection:feature-019:other');
    input.context.inspectedEvidenceHash = inspectedEvidenceHash;
    input.result.inspectedEvidenceHash = inspectedEvidenceHash;
  }, /verification.inspectedEvidenceHash/],
]) {
  test(`review refuses ${label} replay against its verification`, () => {
    const verification = buildVerification(verificationInput()).capture;
    const input = reviewInput(verification, 'accepted', []);

    mutate(/** @type {any} */ (input));

    assert.throws(
      () => buildSpecialistAttestation(input),
      /** @type {RegExp} */ (expected),
    );
  });
}

test('standalone review treats each valid verification input as a different cooperative assertion', () => {
  const original = buildVerification(verificationInput()).capture;
  const alternate = buildVerification(verificationInput([
    { definition: 'replacement check', outcome: 'failed', evidence: 'replacement evidence' },
  ])).capture;
  const originalReview = buildReview(reviewInput(original, 'accepted', []));
  const alternateReview = buildReview(reviewInput(alternate, 'accepted', []));

  assert.equal(
    originalReview.envelope.verificationEnvelopeIdentity,
    originalReview.verification.envelopeIdentity,
  );
  assert.equal(
    alternateReview.envelope.verificationEnvelopeIdentity,
    alternateReview.verification.envelopeIdentity,
  );
  assert.notEqual(
    alternateReview.envelope.verificationEnvelopeIdentity,
    originalReview.envelope.verificationEnvelopeIdentity,
  );
  assert.notDeepEqual(alternateReview.capture, originalReview.capture);
});

test('review refuses forged verification authority and outcome binding', () => {
  const verification = buildVerification(verificationInput()).capture;
  for (const mutate of [
    (capture) => { capture.authority.authorityIdentity = sha256('forged authority'); },
    (capture) => { capture.authority.invocationIdentity = sha256('forged invocation'); },
    (capture) => { capture.outcomeHash = sha256('forged outcome'); },
  ]) {
    const input = reviewInput(verification, 'accepted', []);
    mutate(/** @type {any} */ (input.context.verification.capture));
    assert.throws(() => buildSpecialistAttestation(input), TypeError);
  }
});

test('different valid sole results produce distinct semantic identities', () => {
  const failedInput = verificationInput([
    { definition: 'unit', outcome: 'failed', evidence: 'unit exit 1' },
  ]);
  const failed = buildVerification(failedInput);
  const upgradedInput = clone(failedInput);
  upgradedInput.result.checks[0].outcome = 'passed';
  const upgraded = buildVerification(upgradedInput);
  assert.equal(failed.envelope.checks[0].outcome, 'failed');
  assert.notEqual(failed.envelope.checks[0].checkIdentity, upgraded.envelope.checks[0].checkIdentity);
  assert.notEqual(failed.envelope.envelopeIdentity, upgraded.envelope.envelopeIdentity);
  const mixedInput = verificationInput([
    { definition: 'unit', outcome: 'failed', evidence: 'unit exit 1' },
    { definition: 'lint', outcome: 'passed', evidence: 'lint exit 0' },
  ]);
  const mixed = buildVerification(mixedInput);
  const omittedInput = clone(mixedInput);
  omittedInput.result.checks.shift();
  const omitted = buildVerification(omittedInput);
  assert.notEqual(mixed.envelope.envelopeIdentity, omitted.envelope.envelopeIdentity);

  const verification = buildVerification(verificationInput()).capture;
  const completeInput = reviewInput(
    verification,
    'rejected',
    [clone(OBSERVED_FINDING), clone(CHECK_FINDING)],
  );
  const complete = buildReview(completeInput);
  const droppedInput = clone(completeInput);
  droppedInput.result.findings.pop();
  const dropped = buildReview(droppedInput);
  assert.notEqual(complete.envelope.envelopeIdentity, dropped.envelope.envelopeIdentity);
  const alteredInput = clone(completeInput);
  alteredInput.result.findings[0].observation.evidence = 'altered observation';
  const altered = buildReview(alteredInput);
  assert.notEqual(complete.envelope.envelopeIdentity, altered.envelope.envelopeIdentity);
  const upgradedReview = clone(completeInput);
  upgradedReview.result.verdict = 'accepted';
  assert.throws(() => buildSpecialistAttestation(upgradedReview), /empty for accepted review/);
});

for (const [label, mutate] of [
  ['failed check changed to passed', (input) => { input.result.checks[0].outcome = 'passed'; }],
  ['failed check omitted', (input) => { input.result.checks.shift(); }],
]) {
  test(`verification records ${label} as a different valid sole-result assertion`, () => {
    const originalInput = verificationInput([
      { definition: 'unit', outcome: 'failed', evidence: 'unit exit 1' },
      { definition: 'lint', outcome: 'passed', evidence: 'lint exit 0' },
    ]);
    const alternateInput = clone(originalInput);

    mutate(/** @type {any} */ (alternateInput));

    const original = buildVerification(originalInput);
    const alternate = buildVerification(alternateInput);
    assertVerificationSemantics(original.envelope, originalInput.result.checks);
    assertVerificationSemantics(alternate.envelope, alternateInput.result.checks);
    assert.notEqual(alternate.envelope.envelopeIdentity, original.envelope.envelopeIdentity);
    assert.notDeepEqual(alternate.capture, original.capture);
  });
}

for (const [label, mutate] of [
  ['finding omitted', (input) => { input.result.findings.pop(); }],
  ['finding content changed', (input) => { input.result.findings[0].observation.evidence = 'altered observation'; }],
  ['rejected result changed to accepted', (input) => {
    input.result.verdict = 'accepted';
    input.result.findings = [];
  }],
]) {
  test(`review records ${label} as a different valid sole-result assertion`, () => {
    const verification = buildVerification(verificationInput()).capture;
    const originalInput = reviewInput(
      verification,
      'rejected',
      [clone(OBSERVED_FINDING), clone(CHECK_FINDING)],
    );
    const alternateInput = clone(originalInput);

    mutate(/** @type {any} */ (alternateInput));

    const original = buildReview(originalInput);
    const alternate = buildReview(alternateInput);
    assertReviewSemantics(original, originalInput.result);
    assertReviewSemantics(alternate, alternateInput.result);
    assert.notEqual(alternate.envelope.envelopeIdentity, original.envelope.envelopeIdentity);
    assert.notDeepEqual(alternate.capture, original.capture);
  });
}

test('same input is deterministic while dispatch occurrence changes invocation and capture identity', () => {
  const input = verificationInput();
  const first = buildVerification(input);
  const repeated = buildVerification(clone(input));
  assert.deepEqual(repeated.capture, first.capture);
  assert.equal(
    trustedSourceCaptureIdentityV2(repeated.capture),
    trustedSourceCaptureIdentityV2(first.capture),
  );

  const nextInput = verificationInput(undefined, 2);
  const next = buildVerification(nextInput);
  assert.equal(next.envelope.envelopeIdentity, first.envelope.envelopeIdentity);
  assert.notEqual(
    /** @type {Record<string, unknown>} */ (next.capture.authority).invocationIdentity,
    /** @type {Record<string, unknown>} */ (first.capture.authority).invocationIdentity,
  );
  assert.notEqual(
    trustedSourceCaptureIdentityV2(next.capture),
    trustedSourceCaptureIdentityV2(first.capture),
  );
});

test('review chronology changes invocation and capture identity', () => {
  const verification = buildVerification(verificationInput()).capture;
  const first = buildReview(reviewInput(verification, 'accepted', [], 1, 1));
  const next = buildReview(reviewInput(verification, 'accepted', [], 1, 2));
  const firstAuthority = /** @type {Record<string, unknown>} */ (first.capture.authority);
  const nextAuthority = /** @type {Record<string, unknown>} */ (next.capture.authority);

  assert.equal(nextAuthority.authorityIdentity, firstAuthority.authorityIdentity);
  assert.notEqual(nextAuthority.invocationIdentity, firstAuthority.invocationIdentity);
  assert.notEqual(next.envelope.envelopeIdentity, first.envelope.envelopeIdentity);
  assert.notEqual(
    trustedSourceCaptureIdentityV2(next.capture),
    trustedSourceCaptureIdentityV2(first.capture),
  );
});

test('producer retains existing validators as the final output authority', () => {
  const source = readFileSync(new URL('./specialist-attestation.mjs', import.meta.url), 'utf8');
  const trustedCaptureBuilder = source.slice(
    source.indexOf('function trustedCapture('),
    source.indexOf('function semanticCheck('),
  );
  const verificationBuilder = source.slice(
    source.indexOf('function buildVerification('),
    source.indexOf('function findingBasis('),
  );
  const reviewBuilder = source.slice(
    source.indexOf('function buildIndependentReview('),
    source.indexOf('/**\n * Build one cooperative'),
  );

  assert.match(
    trustedCaptureBuilder,
    /validateTrustedSourceCaptureV2\(capture\);\s+return capture;/,
    'producer must validate each trusted capture before returning it',
  );
  assert.match(
    verificationBuilder,
    /validateVerificationEnvelopeV2\(envelope\);[\s\S]+normalizeVerificationEnvelopeV2\(capture\)/,
    'producer must validate and normalize each verification envelope before returning it',
  );
  assert.match(
    reviewBuilder,
    /validateIndependentReviewEnvelopeV2\(envelope, verification\);[\s\S]+normalizeIndependentReviewEnvelopeV2\(capture, verification\)/,
    'producer must validate and normalize each review envelope before returning it',
  );
});
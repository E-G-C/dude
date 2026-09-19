// @ts-check

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as recoveryRuntime from '../../../src/skills/dude-work/recovery.mjs';
import { buildSpecialistAttestation } from '../../../src/skills/dude-work/specialist-attestation.mjs';

const FIXTURE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REFERENCE_PATH = path.join(FIXTURE_DIRECTORY, 'reference.json');
export const RETENTION_EPISODE_PATH = path.join(FIXTURE_DIRECTORY, 'retention-episode.json');
export const REFERENCE_SHA256 =
  '143a377722cd3f85b70b4f05a8817a2a462744035836c6ccf233fc092a3c99f4';
export const RETENTION_EPISODE_SHA256 =
  'c497f3d425711555e0a65fedc6872a4bc51298094718648da9c84b7c148ce944';
export const HISTORY_INCIDENT_PATH = path.join(
  FIXTURE_DIRECTORY, '../065-work-history-event-compaction/retained-incident.json',
);
export const HISTORY_INCIDENT_SHA256 =
  '1800d8860abf55038087c6d8dc9b1657379c57f8796de6df76686164185ac88b';

/** @param {unknown} value */
export function cloneCanonical(value) {
  return JSON.parse(recoveryRuntime.canonicalJson(value));
}

/** @param {string} file */
function readJsonFixture(file) {
  const bytes = fs.readFileSync(file);
  return {
    bytes,
    descriptor: recoveryRuntime.contentDescriptor(bytes),
    value: JSON.parse(bytes.toString('utf8')),
  };
}

export function readReferenceFixture() {
  const fixture = readJsonFixture(REFERENCE_PATH);
  assert.equal(fixture.descriptor.sha256, REFERENCE_SHA256);
  return fixture;
}

export function readRetentionEpisodeFixture() {
  const fixture = readJsonFixture(RETENTION_EPISODE_PATH);
  assert.equal(fixture.descriptor.sha256, RETENTION_EPISODE_SHA256);
  return fixture;
}

export function readHistoryIncidentFixture() {
  const fixture = readJsonFixture(HISTORY_INCIDENT_PATH);
  assert.equal(fixture.descriptor.sha256, HISTORY_INCIDENT_SHA256);
  return fixture;
}

/**
 * @typedef {(fixture:{
 *   root:string,
 *   reference:Record<string, unknown>,
 *   referenceBytes:Buffer,
 *   input:Record<string, unknown>,
 *   filePreimages:Map<string, Buffer>,
 * })=>unknown} ModelFixtureTest
 */

/** @param {ModelFixtureTest} run @param {{tempBase?:string}} [options] */
export function withReferenceWorkspace(run, options = {}) {
  return withModelFixtureWorkspace(readReferenceFixture(), 'dude-064-reference-', run, options);
}

/** Pure forensic inputs only; never use the retained state to start an adapter.
 * @param {ModelFixtureTest} run @param {{tempBase?:string}} [options] */
export function withHistoryIncidentWorkspace(run, options = {}) {
  return withModelFixtureWorkspace(readHistoryIncidentFixture(), 'dude-065-incident-', run, options);
}

/**
 * Materialize hash-bound source bytes in one owned canonical root.
 * @param {ReturnType<typeof readJsonFixture>} loaded
 * @param {string} prefix
 * @param {ModelFixtureTest} run
 * @param {{tempBase?:string}} [options]
 */
function withModelFixtureWorkspace(loaded, prefix, run, options = {}) {
  const tempBase = fs.realpathSync(path.resolve(options.tempBase ?? os.tmpdir()));
  const root = fs.realpathSync(fs.mkdtempSync(path.join(tempBase, prefix)));
  const reference = /** @type {Record<string, unknown>} */ (loaded.value);
  const files = /** @type {Record<string, unknown>[]} */ (reference.files);
  /** @type {Map<string, Buffer>} */
  const filePreimages = new Map();
  try {
    for (const file of files) {
      assert.equal(typeof file.path, 'string');
      assert.ok(file.path.startsWith('.dude/'));
      assert.equal(path.posix.normalize(file.path), file.path);
      const absolute = path.resolve(root, file.path);
      assert.ok(absolute.startsWith(`${root}${path.sep}`));
      const capture = /** @type {Record<string, unknown>} */ (file.bytes);
      const bytes = Buffer.from(/** @type {string} */ (capture.base64), 'base64');
      assert.deepEqual(recoveryRuntime.capturedBytesV1(bytes), capture);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, bytes, { flag: 'wx' });
      filePreimages.set(/** @type {string} */ (file.path), Buffer.from(bytes));
    }
    const input = {
      ...cloneCanonical(reference.input),
      root,
    };
    const result = run({
      root,
      reference,
      referenceBytes: loaded.bytes,
      input,
      filePreimages,
    });
    if (result instanceof Promise) {
      return result.finally(() => fs.rmSync(root, { recursive: true, force: true }));
    }
    fs.rmSync(root, { recursive: true, force: true });
    return result;
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/** Test-only inverse of the closed compact model view. @param {Record<string, unknown>} packet */
export function expandModelPacket(packet) {
  const exactKeys = (value, fields) => {
    assert.deepEqual(Object.keys(value).sort(), [...fields].sort());
  };
  exactKeys(packet, ['format', 'target', 'items']);
  assert.equal(packet.format, 'dude-work-model-view-v1');
  const rows = [];
  const verifications = new Map();
  const reviews = [];
  const historyLiterals = new Map();
  let previousItem = -1;
  for (const item of /** @type {Record<string, unknown>[]} */ (packet.items)) {
    assert.ok(['literal', 'current-run', 'verification', 'review'].includes(/** @type {string} */ (item.tag)));
    const trusted = item.tag === 'verification' || item.tag === 'review';
    exactKeys(
      item,
      item.tag === 'literal' ? ['tag', 'text', 'frames']
        : item.tag === 'current-run' ? ['tag', 'body', 'frames'] : ['tag', 'payload', 'frames'],
    );
    const frames = /** @type {Record<string, unknown>[]} */ (item.frames);
    assert.ok(frames.length > 0);
    if (!trusted) assert.equal(frames.length, 1);
    else {
      exactKeys(
        item.payload,
        item.tag === 'verification'
          ? ['type', 'version', 'target', 'checks']
          : ['type', 'version', 'target', 'verdict', 'findings'],
      );
    }
    const firstOccurrences = /** @type {Record<string, unknown>[]} */ (frames[0].occurrences);
    assert.ok(/** @type {number} */ (firstOccurrences[0].position) > previousItem);
    previousItem = /** @type {number} */ (firstOccurrences[0].position);
    let previousFrame = -1;
    for (const frame of frames) {
      exactKeys(
        frame,
        !trusted
          ? ['descriptor', 'occurrences']
          : ['descriptor', 'occurrences', 'outer', 'capture', 'binding'],
      );
      exactKeys(frame.descriptor, ['required', 'status', 'sha256', 'byteLength']);
      const occurrences = /** @type {Record<string, unknown>[]} */ (frame.occurrences);
      assert.ok(occurrences.length === 1 || occurrences.length === 2);
      if (item.tag === 'current-run') {
        assert.equal(occurrences.length, 1);
        assert.equal(occurrences[0].source, 'current-run');
      }
      assert.ok(/** @type {number} */ (occurrences[0].position) > previousFrame);
      previousFrame = /** @type {number} */ (occurrences[0].position);
      if (occurrences.length === 2) {
        assert.deepEqual(occurrences.map(({ source }) => source), ['verification', 'lint']);
        assert.ok(
          /** @type {number} */ (occurrences[0].position)
            < /** @type {number} */ (occurrences[1].position),
        );
        assert.equal(/** @type {Record<string, unknown>} */ (frame.descriptor).status, 'present');
        assert.notEqual(item.text, '[]');
      }
      let text = item.text;
      if (item.tag === 'current-run') {
        const body = /** @type {Record<string, unknown>} */ (item.body);
        exactKeys(body, ['target', 'state', 'records']);
        assert.deepEqual(body.target, packet.target);
        let references = 0;
        const records = /** @type {unknown[]} */ (body.records).map(record => {
          if (!Array.isArray(record)) {
            exactKeys(record, ['event']);
            return cloneCanonical(record);
          }
          assert.equal(record.length, 2);
          assert.ok(record.every(coordinate => Number.isSafeInteger(coordinate) && coordinate >= 0));
          const [historyPosition, lineIndex] = record;
          assert.ok(historyPosition < occurrences[0].position);
          assert.ok(historyLiterals.has(historyPosition), 'reference must resolve to an earlier emitted literal occurrence');
          const history = JSON.parse(historyLiterals.get(historyPosition));
          exactKeys(history, ['path', 'canonicalTasks', 'dependencies', 'discovered', 'history']);
          assert.equal(history.path, /** @type {Record<string, string>} */ (packet.target).specPath.replace(/spec\.md$/, 'tasks.md'));
          // Independent framing: split retains each terminator, including CRLF
          // and CR, so line coordinates include all headings and blank lines.
          const lines = history.history.split(/(\r\n|\r|\n)/);
          const line = lines[lineIndex * 2];
          assert.equal(lines[lineIndex * 2 + 1], '\n');
          assert.ok(line.startsWith('- dude-run-event: '));
          const suffix = line.slice('- dude-run-event: '.length);
          const event = JSON.parse(suffix);
          assert.equal(recoveryRuntime.canonicalJson(event), suffix);
          assert.deepEqual(event.target, packet.target);
          references += 1;
          return { event };
        });
        assert.ok(references > 0);
        text = recoveryRuntime.canonicalJson({ ...body, records });
      } else if (trusted) {
        exactKeys(frame.outer, ['target', 'state']);
        exactKeys(/** @type {Record<string, unknown>} */ (frame.capture).bytes, [
          'sha256',
          'byteLength',
        ]);
        exactKeys(
          frame.binding,
          item.tag === 'verification'
            ? [
              'envelopeIdentity',
              'attemptIdentity',
              'sourceRevisionIdentity',
              'inspectedEvidenceHash',
              'resultIdentity',
            ]
            : [
              'envelopeIdentity',
              'attemptIdentity',
              'attemptOrdinal',
              'reviewOrdinal',
              'reviewerAuthorityIdentity',
              'reviewInvocationIdentity',
              'sourceRevisionIdentity',
              'inspectedEvidenceHash',
              'resultIdentity',
              'verificationEnvelopeIdentity',
            ],
        );
        assert.ok(
          Object.keys(/** @type {Record<string, unknown>} */ (frame.binding))
            .every(field => !Object.hasOwn(/** @type {object} */ (item.payload), field)),
        );
        const envelope = {
          ...cloneCanonical(item.payload),
          ...cloneCanonical(frame.binding),
        };
        const bytes = recoveryRuntime.capturedBytesV1(recoveryRuntime.canonicalJson(envelope));
        assert.deepEqual(
          { sha256: bytes.sha256, byteLength: bytes.byteLength },
          /** @type {Record<string, unknown>} */ (frame.capture).bytes,
        );
        const capture = {
          ...cloneCanonical(frame.capture),
          bytes,
        };
        recoveryRuntime.validateTrustedSourceCaptureV2(capture);
        if (item.tag === 'verification') {
          assert.deepEqual(recoveryRuntime.normalizeVerificationEnvelopeV2(capture), envelope);
          verifications.set(envelope.envelopeIdentity, envelope);
        } else {
          reviews.push({ capture, envelope });
        }
        text = recoveryRuntime.canonicalJson({
          ...cloneCanonical(frame.outer),
          records: [capture],
        });
      }
      assert.deepEqual(recoveryRuntime.contentDescriptor(text), {
        sha256: /** @type {Record<string, unknown>} */ (frame.descriptor).sha256,
        byteLength: /** @type {Record<string, unknown>} */ (frame.descriptor).byteLength,
      });
      for (const occurrence of occurrences) {
        exactKeys(occurrence, ['source', 'position']);
        assert.ok(Number.isSafeInteger(occurrence.position));
        if (item.tag === 'literal' && occurrence.source === 'task-history') {
          historyLiterals.set(occurrence.position, text);
        }
        rows.push({
          ...occurrence,
          descriptor: cloneCanonical(frame.descriptor),
          text,
        });
      }
    }
  }
  rows.sort((left, right) => left.position - right.position);
  assert.deepEqual(rows.map(({ position }) => position), rows.map((_, index) => index));
  const unresolved = new Set(
    reviews.map(({ envelope }) => envelope.verificationEnvelopeIdentity)
      .filter(identity => !verifications.has(identity)),
  );
  for (const row of rows) {
    if (unresolved.size === 0 || row.source !== 'verification') continue;
    let body;
    try {
      body = JSON.parse(row.text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      continue;
    }
    if (!Array.isArray(body?.records)) continue;
    for (const capture of body.records) {
      if (
        capture?.authority?.kind !== 'verification'
        || typeof capture.bytes?.base64 !== 'string'
      ) continue;
      const envelope = JSON.parse(
        Buffer.from(capture.bytes.base64, 'base64').toString('utf8'),
      );
      if (
        envelope.type === 'verification-envelope'
        && envelope.version === 2
        && unresolved.has(envelope.envelopeIdentity)
      ) {
        assert.deepEqual(recoveryRuntime.normalizeVerificationEnvelopeV2(capture), envelope);
        verifications.set(envelope.envelopeIdentity, envelope);
        unresolved.delete(envelope.envelopeIdentity);
      }
    }
  }
  for (const { capture, envelope } of reviews) {
    const verification = verifications.get(envelope.verificationEnvelopeIdentity);
    assert.ok(verification, 'a review must resolve within the complete packet');
    assert.deepEqual(
      recoveryRuntime.normalizeIndependentReviewEnvelopeV2(capture, verification),
      envelope,
    );
  }
  return {
    target: cloneCanonical(packet.target),
    items: rows.map(({ position, ...row }) => row),
  };
}

/** @param {Record<string, unknown>} inspection */
export function originalAvailableProjection(inspection) {
  return {
    target: recoveryRuntime.canonicalTarget(inspection.target),
    items: /** @type {Record<string, unknown>[]} */ (inspection.items)
      .filter(item => (
        !['missing', 'nontext', 'overflow'].includes(/** @type {string} */ (item.status))
        && Object.hasOwn(item, 'text')
      ))
      .map(item => ({
        source: item.source,
        descriptor: recoveryRuntime.descriptor(item),
        text: item.text,
      })),
  };
}

/**
 * @param {{
 *   target:Record<string, unknown>,
 *   episode:Record<string, unknown>,
 *   ordinal:number,
 *   authorizationEvidenceHash:string,
 * }} input
 */
export function buildRetentionPair(input) {
  const target = recoveryRuntime.canonicalTarget(input.target);
  const payload = /** @type {Record<string, unknown>} */ (input.episode.payload);
  const specialist = /** @type {Record<string, unknown>} */ (payload.specialistResult);
  const basis = {
    ...cloneCanonical(payload.approachBasis),
    target: cloneCanonical(target),
  };
  const resultMaterial = recoveryRuntime.canonicalJson({
    version: 1,
    target,
    attemptOrdinal: input.ordinal,
    authorizationEvidenceHash: input.authorizationEvidenceHash,
    outcome: specialist.outcome,
    operations: cloneCanonical(specialist.operations),
    changedTargets: cloneCanonical(specialist.changedTargets),
  });
  const common = {
    target,
    attempt: {
      ordinal: input.ordinal,
      authorizationEvidenceHash: input.authorizationEvidenceHash,
      approachBasis: basis,
    },
    sourceRevision: input.authorizationEvidenceHash,
    inspectedEvidenceHash: input.authorizationEvidenceHash,
    resultMaterial,
  };
  const binding = {
    target,
    attemptOrdinal: input.ordinal,
    sourceRevision: common.sourceRevision,
    inspectedEvidenceHash: common.inspectedEvidenceHash,
    resultMaterial,
  };
  const tester = { role: 'Tester', occurrence: 1 };
  const reviewer = { role: 'Reviewer', occurrence: 1 };
  const verificationResult = /** @type {Record<string, unknown>} */ (specialist.verification);
  const reviewResult = /** @type {Record<string, unknown>} */ (specialist.review);
  const verificationCapture = buildSpecialistAttestation({
    kind: 'verification',
    context: { ...cloneCanonical(common), dispatch: tester },
    result: {
      ...cloneCanonical(binding),
      dispatch: tester,
      checks: cloneCanonical(verificationResult.checks),
    },
  });
  const verification = recoveryRuntime.normalizeVerificationEnvelopeV2(verificationCapture);
  const reviewCapture = buildSpecialistAttestation({
    kind: 'independent-review',
    context: {
      ...cloneCanonical(common),
      dispatch: reviewer,
      reviewOrdinal: 1,
      verification: { capture: cloneCanonical(verificationCapture), dispatch: tester },
    },
    result: {
      ...cloneCanonical(binding),
      reviewOrdinal: 1,
      dispatch: reviewer,
      verdict: reviewResult.verdict,
      findings: cloneCanonical(reviewResult.findings),
    },
  });
  const review = recoveryRuntime.normalizeIndependentReviewEnvelopeV2(
    reviewCapture,
    verification,
  );
  const verificationState = verification.checks.some(check => check.outcome === 'failed')
    ? 'failed' : 'passed';
  const stream = (state, capture) => {
    const normalized = recoveryRuntime.canonicalJson({
      target,
      state,
      records: [capture],
    });
    const body = recoveryRuntime.canonicalJson({
      target,
      state,
      records: [{ substantive: cloneCanonical(capture) }],
    });
    return {
      target: cloneCanonical(target),
      state,
      outcomeHash: recoveryRuntime.sha256(normalized),
      bytes: { base64: Buffer.from(body).toString('base64') },
    };
  };
  return {
    basis,
    semanticResult: cloneCanonical(specialist),
    verificationCapture,
    verification,
    reviewCapture,
    review,
    streams: {
      verification: stream(verificationState, verificationCapture),
      review: stream(review.verdict, reviewCapture),
      lint: stream(verificationState, verificationCapture),
    },
    completion: {
      version: 2,
      target,
      attemptIdentity: verification.attemptIdentity,
      route: payload.route,
      outcome: specialist.outcome,
      operations: cloneCanonical(specialist.operations),
      changedTargets: cloneCanonical(specialist.changedTargets),
      resultIdentity: verification.resultIdentity,
      verificationEnvelopeIdentity: verification.envelopeIdentity,
      reviewEnvelopeIdentity: review.envelopeIdentity,
      findingIdentities: /** @type {Record<string, unknown>[]} */ (review.findings)
        .map(finding => finding.findingIdentity),
    },
  };
}

/** @param {Record<string, unknown>} input @param {ReturnType<typeof buildRetentionPair>} pair */
export function appendRetentionPair(input, pair) {
  const output = cloneCanonical(input);
  output.verification.push(pair.streams.verification);
  output.review.push(pair.streams.review);
  output.lint.push(pair.streams.lint);
  return output;
}

/** @param {Record<string, unknown>} input */
export function currentRunRecords(input) {
  const captures = /** @type {Record<string, unknown>[]} */ (input.currentRun);
  assert.equal(captures.length, 1);
  const capture = /** @type {Record<string, unknown>} */ (captures[0]);
  const bytes = /** @type {Record<string, unknown>} */ (capture.bytes);
  const body = JSON.parse(
    Buffer.from(/** @type {string} */ (bytes.base64), 'base64').toString('utf8'),
  );
  assert.ok(Array.isArray(body.records));
  return cloneCanonical(body.records);
}

/** @param {Record<string, unknown>} input @param {Record<string, unknown>} currentRunRecord */
export function publishCurrentRun(input, currentRunRecord) {
  const output = cloneCanonical(input);
  const capture = recoveryRuntime.currentRunCapture(
    /** @type {Record<string, unknown>} */ (output.target),
    [...currentRunRecords(output), cloneCanonical(currentRunRecord)],
  );
  output.currentRun = [{
    ...capture,
    bytes: { base64: capture.bytes.toString('base64') },
  }];
  return output;
}

/** @param {Record<string, unknown>} input */
export function rawSourceCount(input) {
  const streams = ['currentRun', 'review', 'verification', 'lint']
    .reduce((total, field) => (
      total + /** @type {Record<string, unknown>[]} */ (input[field] ?? []).length
    ), 0);
  return 4 + streams + (Object.hasOwn(input, 'session') ? 1 : 0);
}

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>} input */
export function mandatoryCompletionHeadroom(inspection, input) {
  const items = /** @type {Record<string, unknown>[]} */ (inspection.items);
  const classes = ['verification', 'review', 'lint'];
  if (/** @type {Record<string, unknown>[]} */ (input.currentRun).length === 0) {
    classes.push('current-run');
  }
  const available = source => items.filter(item => (
    item.source === source
      && !['missing', 'nontext', 'overflow'].includes(/** @type {string} */ (item.status))
  ));
  const descriptorDelta = classes.reduce((total, source) => {
    if (source === 'current-run') return total + (available(source).length === 0 ? 1 : 0);
    const rows = available(source);
    return total + (rows.length === 1 && rows[0].text === '[]' ? 0 : 1);
  }, 0);
  return {
    classes,
    sourceDelta: classes.length,
    descriptorDelta,
    requiredSources: rawSourceCount(input) + classes.length,
    requiredDescriptors: items.length + descriptorDelta,
  };
}

/** @param {string} root @param {Record<string, unknown>} reference @param {Record<string, unknown>} input */
export function acquisitionMetrics(root, reference, input) {
  const bodies = /** @type {Record<string, unknown>[]} */ (reference.files)
    .map(file => fs.readFileSync(path.join(root, /** @type {string} */ (file.path))));
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    for (const entry of /** @type {Record<string, unknown>[]} */ (input[field] ?? [])) {
      const bytes = /** @type {Record<string, unknown>} */ (entry.bytes);
      bodies.push(Buffer.from(/** @type {string} */ (bytes.base64), 'base64'));
    }
  }
  if (Object.hasOwn(input, 'session')) {
    const session = /** @type {Record<string, unknown>} */ (input.session);
    if (
      session.availability === 'available'
      && Object.hasOwn(session, 'bytes')
      && typeof /** @type {Record<string, unknown>} */ (session.bytes).base64 === 'string'
    ) {
      bodies.push(Buffer.from(
        /** @type {string} */ (/** @type {Record<string, unknown>} */ (session.bytes).base64),
        'base64',
      ));
    }
  }
  return {
    aggregateDecodedBytes: bodies.reduce((total, body) => total + body.byteLength, 0),
    maximumSourceBodyBytes: Math.max(...bodies.map(body => body.byteLength)),
    requestBytes: Buffer.byteLength(recoveryRuntime.canonicalJson({
      trigger: 'explicit-inspection',
      input,
    })),
  };
}

const measuredRuntimePromises = new Map();

/** @param {boolean} literalHistory @param {'tie'|'larger'} [historyCost] */
async function measuredRuntime(literalHistory = false, historyCost) {
  const key = `${literalHistory}:${historyCost ?? 'actual'}`;
  if (measuredRuntimePromises.has(key)) return measuredRuntimePromises.get(key);
  const promise = (async () => {
    const runtimeUrl = new URL('../../../src/skills/dude-work/recovery.mjs', import.meta.url);
    const runtimePath = fileURLToPath(runtimeUrl);
    let source = fs.readFileSync(runtimePath, 'utf8');
    if (literalHistory || historyCost) {
      const selection = 'currentRun && canonicalBytes(currentRun) < canonicalBytes(unit.literal)';
      assert.equal(source.split(selection).length, 2);
      // Suppress only selection; acquisition, other sharing, prefixes, suffix
      // maximization, and all capacity/authority guards remain production code.
      // Synthetic cost controls separately exercise the defensive strict-less
      // guard, without inventing small unsupported events or changing a limit.
      source = source.replace(selection, literalHistory ? 'false' : selection.replace(
        'canonicalBytes(currentRun)', `canonicalBytes(unit.literal)${historyCost === 'larger' ? ' + 1' : ''}`,
      ));
    }
    const returnNeedle = [
      '  return {',
      '    inspection,',
      '    modelBytes: Buffer.byteLength(canonicalJson(packetProjection(inspectionTarget, selectedItems, context))),',
      '  };',
      '}',
    ].join('\n');
    assert.equal(source.split(returnNeedle).length, 2);
    source = source.replace(returnNeedle, [
      '  const testModelPacket = packetProjection(inspectionTarget, selectedItems, context);',
      '  const testMeasurement = {',
      '    inspection,',
      '    modelBytes: Buffer.byteLength(canonicalJson(testModelPacket)),',
      '    testModelPacket,',
      '    testSelectedItems: selectedItems,',
      '    testRawItems: values,',
      '  };',
      '  testMeasurements.push(testMeasurement);',
      '  return testMeasurement;',
      '}',
    ].join('\n'));
    const acquisitionNeedle = 'inspection: buildInspection(target, collectEvidenceInternal';
    assert.equal(source.split(acquisitionNeedle).length, 2);
    source = source.replace(
      acquisitionNeedle,
      'inspection: testMeasuredInspectionCapture(target, collectEvidenceInternal',
    );
    source = source.replace(
      /from '(\.[^']+)'/g,
      (_match, relative) => `from '${new URL(relative, runtimeUrl).href}'`,
    );
    source = source.replace('fileURLToPath(import.meta.url)', JSON.stringify(runtimePath));
    source += [
      '',
      'let testLastMeasurement = null;',
      'let testMeasurements = [];',
      'function testMeasuredInspectionCapture(target, values) {',
      '  testLastMeasurement = measuredInspection(target, values);',
      '  return testLastMeasurement.inspection;',
      '}',
      'export function testAcquireMeasured(input) {',
      '  testLastMeasurement = null;',
      '  testMeasurements = [];',
      "  acquireInspection(input, undefined, true, 'autonomous');",
      '  return testLastMeasurement;',
      '}',
      'export { packetProjection as testPacketProjection };',
      'export function testPrepareMeasured(state, input, batch, laneBinding) {',
      '  testMeasurements = [];',
      '  let result = null;',
      '  let capacity = null;',
      '  try { result = prepareProjectionV2(state, input, batch, undefined, true, laneBinding); }',
      '  catch (error) {',
      '    capacity = capacityDiagnostic(error);',
      '    if (capacity === null) throw error;',
      '  }',
      '  return { result, capacity, measurements: testMeasurements };',
      '}',
      '',
    ].join('\n');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  })();
  measuredRuntimePromises.set(key, promise);
  return promise;
}

/** @param {Record<string, unknown>} measured */
function modelMeasurement(measured) {
  return {
    inspection: measured.inspection,
    modelBytes: measured.modelBytes,
    packet: measured.testModelPacket,
    items: measured.testSelectedItems,
    rawItems: measured.testRawItems,
  };
}

/**
 * Observe the private complete packet used by the unchanged production renderer.
 * The public overflow Inspection remains descriptor-only.
 * @param {Record<string, unknown>} input
 * @param {{literalHistory?:boolean}} [options]
 */
export async function measurePrivateModelView(input, options = {}) {
  const runtime = await measuredRuntime(options.literalHistory);
  const measured = runtime.testAcquireMeasured(input);
  return modelMeasurement(measured);
}

/** Render exactly these available positions, without a hidden full-packet anchor.
 * @param {unknown} target @param {unknown[]} items
 * @param {{literalHistory?:boolean,historyCost?:'tie'|'larger'}} [options] */
export async function renderPrivateModelProjection(target, items, options = {}) {
  const runtime = await measuredRuntime(options.literalHistory, options.historyCost);
  return runtime.testPacketProjection(target, items);
}

/** Observe pure production preflight; this does not apply a permit or start a host.
 * @param {{state:unknown,input:unknown,batch:unknown,laneBinding:unknown}} input
 * @param {{literalHistory?:boolean}} [options] */
export async function measurePrivatePreflight(input, options = {}) {
  const runtime = await measuredRuntime(options.literalHistory);
  const measured = runtime.testPrepareMeasured(input.state, input.input, input.batch, input.laneBinding);
  return {
    result: measured.result,
    capacity: measured.capacity,
    measurements: measured.measurements.map(modelMeasurement),
  };
}

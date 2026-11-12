<!-- audit log: .dude/ideas/095-trusted-agent-pairing.md#coordinator-log -->

# Tasks: Trusted agent pairing

Spec: `.dude/specs/095-trusted-agent-pairing/spec.md`
Plan: `.dude/specs/095-trusted-agent-pairing/plan.md`

Five new canonical units for Lightweight execution. No prior task, completion,
archive, or execution history is carried forward. The coordinator owns later
state changes. All commands below are planned verification, not executed results.

Run commands from the repository root unless a disposable build-copy root is
explicitly named. On Windows, run each test file in a separate Node process;
do not combine them into one all-files invocation. Required pairing cases must
run without interactive input, a native account/model, or skipped substitutes.
Existing regression skips must be reported separately, never counted as passes.

Write only each unit's named paths. Test/build-created disposable files stay in
test-owned temporary roots and are not repository deliverables. Preserve other
uncommitted work, especially 089's reviewed operator-guide changes. Do not edit
068/089 packages, T008, qualifier implementation/tests, local profiles, SDK
bundles/legal files, Canvas assets, or workflow state. Do not run native
qualification. Only T005 projects the named generated runtime files.

## Phase 1: Foundational binding and storage

- [x] T001@k8m2q7v4 [Shared] Add exact-scope standing-record storage in `src/extensions/dude/lib/a2a-pairing.mjs` and stable binding in `src/extensions/dude/lib/a2a.mjs`.

    Trace: plan "Exact binding and lifetime" and "Local record and revocation"; FR-005, FR-006, FR-011, FR-026; SC-002.
    May write: `src/extensions/dude/lib/a2a-pairing.mjs` (new), `src/extensions/dude/lib/a2a.mjs`, `src/extensions/dude/a2a-pairing.test.mjs` (new), `src/extensions/dude/a2a.test.mjs`.
    Implement only the helper used by this provider: config-adjacent nonrepository path, hashed exact profile ID, closed bounded two-field record, safe read, and replacement preserving the old record on caught failure. Add the separate stable digest without changing the existing session-bound digest checks. Keep default construction effect-free and exclude pairing files through the existing owner-file evidence boundary.
    Verify stable identity across new provider/session IDs; invalidation for each bound identity/scope/material group; missing versus malformed/unreadable/unsafe files; Git directory and worktree-file ancestors even outside the selected workspace; distinct profile IDs; no plaintext secrets; and caught write-failure preservation. Use the real helper and binding, not a duplicated test implementation.
    Verification commands, separately:
    `node --test src/extensions/dude/a2a-pairing.test.mjs`
    `node --test src/extensions/dude/a2a.test.mjs`

## Phase 2: Pair once through local approval

- [x] T002@r5c9n3h6 [US1] Enroll opted-in profiles through the complete native proposal and existing typed approval in `src/extensions/dude/lib/a2a.mjs`.
    deps: T001@k8m2q7v4

    Trace: plan "Profile and enrollment contract"; US1/US2; FR-001-007, FR-010, FR-012-014, FR-018, FR-022-024; SC-002, SC-005.
    May write: `src/extensions/dude/lib/a2a.mjs`, `src/extensions/dude/lib/a2a-pairing.mjs`, `src/extensions/dude/a2a.test.mjs`, `src/extensions/dude/a2a-pairing.test.mjs`, `src/extensions/dude/a2a-collaboration.test.mjs`.
    Add the optional profile `pairing` boolean with ordinary behavior when absent/false. Keep the proposal tool's two arguments and existing exact approval command. Fully disclose standing lifetime, per-activation counters, local storage/revocation, host/file trust limits, and separate SHARING/COMMANDS/WORKER scopes. Only eligible local approval saves a record; save failure activates nothing. Report saved-but-inactive honestly if subsequent transport startup fails. Reject pairing combined with worker qualification.
    Verify no persistence/activation before approval; current ready code consumed once; wrong/old/unready code, attributed input, autopilot, model/tool/peer text, queued input, cancellation, replacement, expiry, and drift create no grant. Preserve normal completion-abort eligibility and ordinary one-use results. Exercise practical pairing profiles and exact 4,490/4,491 UTF-8 byte boundaries without omitting any scope or command.
    Verification commands, separately:
    `node --test src/extensions/dude/a2a.test.mjs`
    `node --test src/extensions/dude/a2a-pairing.test.mjs`
    `node --test src/extensions/dude/a2a-collaboration.test.mjs`

## Phase 3: Reuse and revoke current authority

- [x] T003@s4w8d2p7 [US1] Activate exact paired profiles automatically and enforce revocation through the shared provider checks in `src/extensions/dude/lib/a2a.mjs`.
    deps: T002@r5c9n3h6

    Trace: plan "Automatic activation and notices" and "Local record and revocation"; US1/US2/US3; FR-008-021, FR-026; SC-001-005.
    May write: `src/extensions/dude/lib/a2a.mjs`, `src/extensions/dude/lib/a2a-pairing.mjs`, `src/extensions/dude/a2a.test.mjs`, `src/extensions/dude/a2a-pairing.test.mjs`, `src/extensions/dude/a2a-collaboration.test.mjs`, `src/extensions/dude/a2a-verify.test.mjs`.
    Reuse the current `propose`/`activate` path with fresh session identity and an internal standing-approval source, never a fabricated root approval. Await startup and return its actual outcome. Require the automatic notice before live communication; preserve all queue, size, cancellation, binding, and cleanup checks. Re-read the same grant at `admissible` boundaries, ending authority on deletion, corruption, mismatch, or unsafe location. Stop keeps the record but starts no replacement.
    Verify fresh sessions reuse a match without prompts; a nonmatch returns enrollment rather than activation; malformed records refuse; restoring original configuration is not revocation; explicit deletion is. Cover deletion during held startup/send/reply/worker evidence, notice failure, expiry, per-activation limits, and no old exchange/permit reuse. Positive worker/command cases must have separately approved scope; share-only and changed-scope negatives must run no such effects. Preserve all recording and account checks through the existing collaboration callbacks.
    Verification commands, separately:
    `node --test src/extensions/dude/a2a.test.mjs`
    `node --test src/extensions/dude/a2a-pairing.test.mjs`
    `node --test src/extensions/dude/a2a-verify.test.mjs`
    `node --test src/extensions/dude/a2a-collaboration.test.mjs`

## Phase 4: Prove repeated conversations and control

- [x] T004@t6j3b9f5 [Shared] Prove two independently paired Dudes can reactivate and converse without more approval in `src/extensions/dude/a2a-collaboration-tls.test.mjs`.
    deps: T003@s4w8d2p7

    Trace: plan "Automated acceptance and regression coverage"; US1/US2/US3; FR-003-005, FR-008-026; SC-001-006.
    May write: `src/extensions/dude/a2a-collaboration-tls.test.mjs`, `src/extensions/dude/a2a-collaboration.test.mjs`, `src/extensions/dude/a2a.test.mjs`, `src/extensions/dude/lib/a2a.mjs`, `src/extensions/dude/lib/a2a-pairing.mjs`. Source fixes are limited to pairing defects these checks expose under the accepted contract; add no native harness or replacement permission policy.
    Extend the existing independent-process `runPeer` fixtures and real mutual-TLS path. Use disposable owner/config/grant folders and the existing labeled fake worker SDK. Enroll both sides once with synthetic root inputs, then complete two later automatic activations/conversations, including after both providers/sessions are recreated. Count zero later approval prompts/inputs. Inspect exact messages, new permits/operation IDs, required notices, and retained transcripts. Verify one-sided enrollment/unavailability, record deletion, no late replay, and real wrong-peer refusal without letting a local configuration mismatch mask the TLS check.
    Run the existing controlled qualifier regressions unchanged to establish that 089's fresh-approval/native-consent route still exists. Do not invoke either helper in native mode or claim real host/model/account proof. A failed automated requirement is a failure, not a deferred native check.
    Verification commands, separately:
    `node --test src/extensions/dude/a2a-pairing.test.mjs`
    `node --test src/extensions/dude/a2a.test.mjs`
    `node --test src/extensions/dude/a2a-collaboration.test.mjs`
    `node --test src/extensions/dude/a2a-collaboration-tls.test.mjs`
    `node --test src/extensions/dude/a2a-transport.test.mjs`
    `node --test src/extensions/dude/a2a-peer-worker.test.mjs`
    `node --test src/extensions/dude/a2a-transcript.test.mjs`
    `node --test scripts/dude-a2a/qualify-collaboration.test.mjs`
    `node --test scripts/dude-a2a/native-collaboration.test.mjs`

## Phase 5: Operator guidance and generated delivery

- [x] T005@v7g2x4m8 [Shared] Document pairing and project its runtime through the existing build in `docs/agent-to-agent-communication.md` and the build tests.
    deps: T004@t6j3b9f5

    Trace: plan "Operator guide and build projection"; FR-002, FR-006, FR-019, FR-022-025; SC-004-006.
    May write: `docs/agent-to-agent-communication.md`, `scripts/build-dev.test.mjs`, `scripts/build-release.test.mjs`, `.github/extensions/dude/lib/a2a.mjs`, `.github/extensions/dude/lib/a2a-pairing.mjs` (new generated output).
    Update only the feature's affected guide passages and exact affected assertions. Preserve 089's reviewed edits, native-run instructions, consent wording, observations, and deferred status. Explain first typed enrollment, zero-prompt matching reuse, exact identity/scope drift, stop versus deletion, external storage, per-activation usage, and ordinary local trust. No usable approval code or sensitive configuration belongs in documentation.
    Extend runtime/test-only build inventories and disposable generated-runtime behavior checks. Generate with `node scripts/build-dev.mjs` from a disposable copy containing the current source; copy back only the two named runtime files. Do not hand-edit them or run the broad builder directly over this dirty checkout. Keep all other generated, metadata, runtime/legal, Canvas, and pack bytes unchanged.
    Verification commands, separately:
    `node --test scripts/build-dev.test.mjs`
    `node --test scripts/build-release.test.mjs`
    `node --test src/extensions/dude/a2a-pairing.test.mjs`
    `node --test src/extensions/dude/a2a.test.mjs`
    Coordinator validation after projection: `node .github/skills/dude-lint/lint.mjs .`

## Execution notes

No task is marked `[P]`: provider and fixture writes overlap along this
dependency chain. Native qualification is deferred exactly as the spec states,
not a hidden task or acceptance blocker. Test results, independent review,
task glyphs, execution logs, and closure are owned by the normal execution
workflow; this definition records none of them.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["src/extensions/dude/a2a-pairing.test.mjs","src/extensions/dude/a2a.test.mjs","src/extensions/dude/lib/a2a-pairing.mjs","src/extensions/dude/lib/a2a.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"validationPlanIdentities":[],"version":1},"eventHash":"33900f739305a432688e8b98994ba12b7146a8f7f48cce5546d197da3843aa4d","occurrence":{"attemptIdentity":"11fe4177ef184e22d5a0e3e57e4cce10545387c1b1eacedc6b51b3077b4b9e25","authorizationEvidenceHash":"698fbdc53714918854461e86af648afdad075f47a74250663853025fc96ac745","basisIdentity":"fbad0f983db61ba6d67e94b333a0eb365415cf4ca1f695a371b9526b1f4d6b17","chronology":{"attemptOrdinal":1},"disposition":"review-rejected","resultIdentity":"02a5bf3771c20beb5caeaa4dcb81b64a699ea67d9f824295037d6de1a8f80c2b","version":1},"occurrenceIdentity":"d942fbda0ea19bca2ed70f7f1bdccfeca0b3b3792691802b38a31d4a611a24b8","reviewEnvelopeIdentity":"b0d4f22cee8c53626a8e8c705ad44e99f375ed21c073771b4848bcfdd5bf6841","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"type":"approach-occurrence","verificationEnvelopeIdentity":"42340c86ea8aea8f9926e3c0b15df3ef550ebe052c901e970e7cc04a69e2cfaa","version":1}
- dude-run-event: {"basis":{"checkDefinitionIdentity":"ba49e8e482e344995504880da0f1b1e835d04cb0a51f96b5035c0ae1feaa14ef","expectation":{"identity":"c3dc561171e4a04a3fa0f5711ede2a550a97e893cc8ee411837130d80b92c590","kind":"governing-rule"},"failureClass":"test-only-provider-capability","subjects":["src/extensions/dude/a2a.test.mjs:2908-2945","src/extensions/dude/lib/a2a.mjs:3407-3416"],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"version":1},"eventHash":"1418d5309d5bb5788cc54301adf7f0284cdbe5891fedd4e8ebc62008637cee96","occurrence":{"attemptApproachBasisIdentity":"fbad0f983db61ba6d67e94b333a0eb365415cf4ca1f695a371b9526b1f4d6b17","attemptIdentity":"11fe4177ef184e22d5a0e3e57e4cce10545387c1b1eacedc6b51b3077b4b9e25","basisIdentity":"d0e69ef357481da6f49ac99b94b6587fe9528758dcf750266aadca7dbf8a7b95","chronology":{"attemptOrdinal":1,"reviewOrdinal":1},"findingIdentity":"c63932a05f7eb6918574cd10ceb45551eb6ec01c59addb53e28c25cd06bc0c84","observation":{"identity":"d7a6e45031380bc1ed807d5eb9c18d91fb2a31a9e1d8df9405ce2d7169514ac6","kind":"observed-evidence"},"reviewEnvelopeIdentity":"b0d4f22cee8c53626a8e8c705ad44e99f375ed21c073771b4848bcfdd5bf6841","version":1},"occurrenceIdentity":"9f48bb965ebc1e33cb9cb40d55dbef1a678fc99a8b6c837cf0ef9e40b5aba5fd","sourceCaptureIdentity":"a3fa37e7c1da028fde1eb483d3c58ce127c788349d7f626aee466af6fc1e4587","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"type":"finding-occurrence","version":1}
- dude-run-event: {"basis":{"action":"address-review","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["review","verification"],"operations":["address-review"],"targets":["src/extensions/dude/a2a-pairing.test.mjs","src/extensions/dude/a2a.test.mjs","src/extensions/dude/lib/a2a-pairing.mjs","src/extensions/dude/lib/a2a.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"validationPlanIdentities":[],"version":1},"eventHash":"3cfd349b1d2b4ca99ff45d04781b84ea012cd27670660132c9fe2a910c79d059","occurrence":{"attemptIdentity":"a5343ea5beae402f4b1b676cca7212404e50290a15abba13d073b0bea8dc2b9d","authorizationEvidenceHash":"522e8d64dd02ab245a8b28a3874ef3585712a9a6042dd94469fd15c0bda0717a","basisIdentity":"3d6a77ef236a33173565acb5eadfd515f010962d8ef3d26d52ffc7ee03b5de2f","chronology":{"attemptOrdinal":2},"disposition":"accepted","resultIdentity":"da593eba42067e4da847c20239f8395d744b0e33aae714e657b7c91a3e0c1ca6","version":1},"occurrenceIdentity":"0e3b1bbba031cc79317f757f4629ffd00feed615701d4edacc71a834ef168959","reviewEnvelopeIdentity":"eead460651826e306bf5e98a960ace969ba45a7d594ef3226ccc0390ccc57673","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T001@k8m2q7v4"},"type":"approach-occurrence","verificationEnvelopeIdentity":"1bdba6dea876ebe8cdf9ab37f63beb50ab99ead6901a1ed9f7030b81ed929814","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["src/extensions/dude/a2a-collaboration.test.mjs","src/extensions/dude/a2a-pairing.test.mjs","src/extensions/dude/a2a.test.mjs","src/extensions/dude/lib/a2a-pairing.mjs","src/extensions/dude/lib/a2a.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T002@r5c9n3h6"},"validationPlanIdentities":[],"version":1},"eventHash":"ea3c9e500d295be625b062c40041262f8132081be3922a4b7e4c10ade3380c6f","occurrence":{"attemptIdentity":"aa8904a4a65d94d4daa2b2262e4831afb03e2b374f605e51d92312f4a587e1c7","authorizationEvidenceHash":"f2c3c8cb0643615c7a1b571ac489dde4c2722b54e22b1135400738c2fdd3e9ae","basisIdentity":"c37c85978df843c5c0a9534ba8d0f6f3a3ac65fe5b8e0e577fa762e7837f4fcf","chronology":{"attemptOrdinal":3},"disposition":"accepted","resultIdentity":"7ea9ff1a2d4e1d063370ddc39ac216c659e3e195e9402e2a0b33582be88b5ce8","version":1},"occurrenceIdentity":"648c71f4120d030cea549aa4ac66ed2867c4995a680ce9e0c9d274d64f5884b7","reviewEnvelopeIdentity":"c1764dca85658aa8d842b35599509d944f44f6d28b7c038e529c832730ff883b","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T002@r5c9n3h6"},"type":"approach-occurrence","verificationEnvelopeIdentity":"70428b02ec896c5b19ce3bdd38844341da66b060b666c742e08fba9a27bec0ae","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["src/extensions/dude/a2a-collaboration.test.mjs","src/extensions/dude/a2a-pairing.test.mjs","src/extensions/dude/a2a-verify.test.mjs","src/extensions/dude/a2a.test.mjs","src/extensions/dude/lib/a2a-pairing.mjs","src/extensions/dude/lib/a2a.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T003@s4w8d2p7"},"validationPlanIdentities":[],"version":1},"eventHash":"7548eb817c6e83149bb9ab54b54959c90d82dbdf005a0b8d501385104d30252b","occurrence":{"attemptIdentity":"26c27705f29fe67ccaaee9e0b777b8628cfd01612b585bf651a0499ec4a87caa","authorizationEvidenceHash":"ac95707214218cb07c1bf2702e44406fe421be57c6f68e2bd35e18de1e416769","basisIdentity":"50025566e5a90579521ee2c5a4c735a70caf4d419d23a023df5b54312183a53b","chronology":{"attemptOrdinal":4},"disposition":"accepted","resultIdentity":"5433e7025da3cbdf41c8d155ea35e90089617b0b1570a9960fdcbb748d68a8ae","version":1},"occurrenceIdentity":"477a71009724c40314757e37389e2a855a172b5dc58a92026ea1574b92426c15","reviewEnvelopeIdentity":"32aa6bb4f60a1ff7930d9611093d56d4555409e2b7c84bc4b21d2edc50f84b02","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T003@s4w8d2p7"},"type":"approach-occurrence","verificationEnvelopeIdentity":"4400947be6d33dee5f7c95e25965526a613126e62cf3d0147f269ce317fb1382","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["src/extensions/dude/a2a-collaboration-tls.test.mjs","src/extensions/dude/a2a-collaboration.test.mjs","src/extensions/dude/a2a.test.mjs","src/extensions/dude/lib/a2a-pairing.mjs","src/extensions/dude/lib/a2a.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T004@t6j3b9f5"},"validationPlanIdentities":[],"version":1},"eventHash":"c51ca53723981ba20f2e6fb09b5790e2f6022bdf9c6d071ff62e8533041de7af","occurrence":{"attemptIdentity":"e90c3d2170e224a916349f50ddf170eb48888431798fba0f75988fa7baf53d8e","authorizationEvidenceHash":"b26330f41124153eacd9355b8a7b00519ac5ee45e2655686719d675bbb0d3313","basisIdentity":"b7725c42405165cdb9e5e72b159a1694c59803c06c5085d1d1c1635f1168b28a","chronology":{"attemptOrdinal":5},"disposition":"accepted","resultIdentity":"3b274c3d48b74cb04b00509ee061887f9f026703005f6102a367fda30fad3e9b","version":1},"occurrenceIdentity":"127c9abc960c608674b652a79a8c872d10644eb9d43661ae402f01ee69adf8b9","reviewEnvelopeIdentity":"093d4ce918406d60b8385dfe358cbbe17decd8d14049108c346a158953d8fba1","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T004@t6j3b9f5"},"type":"approach-occurrence","verificationEnvelopeIdentity":"37990da39b600c96ae35d55e7d271fb0ae36e817323a3d52da2124fc5edff5cb","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/extensions/dude/lib/a2a-pairing.mjs",".github/extensions/dude/lib/a2a.mjs","docs/agent-to-agent-communication.md","scripts/build-dev.test.mjs","scripts/build-release.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T005@v7g2x4m8"},"validationPlanIdentities":[],"version":1},"eventHash":"f487f35aaad54572c984dc6bf593626c8f59a9e76bdd25487c864abf262b907d","occurrence":{"attemptIdentity":"cae0ed6d33496ea20bcf2095ecf3c3c1838c2e505c273c1c1cdf23387ac1cafe","authorizationEvidenceHash":"c16fc33c06bc8c281dae490cad42b4aca6a343dce1903292b15d6673773e0022","basisIdentity":"4a4acfff5fb412004d133e081f234fa2fcbd889dea7c4af54cb3c6f6b164c51e","chronology":{"attemptOrdinal":6},"disposition":"accepted","resultIdentity":"dc2b1f98e68fbe8cc5af66d152e5c0835d6a7f17d54531e9edbfeb32f3ca9f4b","version":1},"occurrenceIdentity":"966183338709dc11839046b44ac0ad412b1b27d747cdcc7bd86ad5e53fe5b553","reviewEnvelopeIdentity":"4310b6aac1d1dfb8cb707d2807a6fb102835864b285fb253df128b5b4c2d86aa","target":{"lane":"lightweight","specPath":".dude/specs/095-trusted-agent-pairing/spec.md","taskKey":"T005@v7g2x4m8"},"type":"approach-occurrence","verificationEnvelopeIdentity":"a69f4c3270da7461cf3abf20ab3a8322ee591fb20b7b0e69cd2c716bde5d889e","version":1}

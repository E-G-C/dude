<!-- audit log: .dude/ideas/pack-visual-neutrality.md#coordinator-log -->

# Tasks: Pack Visual Neutrality

Two all-open sequential canonical units implement
`.dude/specs/042-pack-visual-neutrality/spec.md`, prospectively and exactly
owned by `.dude/ideas/pack-visual-neutrality.md`.

The correction is content-only: authoritative pack source stays under
`library/packs/`, authoritative core stays under `src/`, generated core is
updated only through build-dev, and the installed profile is not hand-edited.
The four inert arbitrary-name contexts named in `plan.md` remain byte-identical.
No task may add a visual-provider route, registry, adapter, activation state,
capability negotiation, pack-to-pack protocol, supporting artifact, generated
board, or ObjectiveRegistry region.

## Phase 1: Correct Live Pack References

**Goal**: Remove the fixed-provider route and every live claim that the absent
pack exists while preserving Docsy technology routing and generic fixture
coverage.

- [x] T001@70757267 [Shared] Implement `plan.md` Chosen Design sections 1 and 2 in exactly `library/packs/hugo/instructions/dude-pack-hugo-hugo-dude-routing.instructions.md`, `library/packs/hugo/pack.md`, `library/packs/docsy/pack.md`, `library/packs/README.md`, `docs/commands.md`, and `src/skills/dude-compose/SKILL.md`: delete the Hugo brand-check step and renumber synthesis from 4 to 3 without a replacement visual step; remove the catalog row and the two related-pack bullets; drop only `ms-brand` from warning examples while retaining Hugo-to-Docsy and Fluent-UI-to-web; preserve every `@dude-pack-docsy-expert` route. Verify no `ms-brand` match remains in `library/packs/`, `docs/commands.md`, or the Compose skill source, the routing actions are exactly 1-3, and the four inert source contexts identified in the plan have no diff. Do not edit `.github/`, `.dude/metadata/profile.md`, or any fixture. (US1, US2, US3 -> FR-001 through FR-007, FR-009 through FR-011; SC-001 through SC-003, SC-006)

## Phase 2: Project And Verify

**Goal**: Project the one core guidance edit through its owner, prove pack-source
behavior and profile consequences, and obtain fresh independent acceptance.

- [x] T002@76657266 [Shared] After T001@70757267, have the coordinator implement `plan.md` Chosen Design section 3 and the complete Test Strategy. Recheck `.dude/metadata/profile.md`; on the defined current profile, run no pack refresh because neither Hugo nor Docsy is installed and require the profile bytes to remain unchanged. Run `node scripts/build-dev.mjs` twice and require an idempotent second run plus exact parity at `.github/skills/dude-compose/SKILL.md`; run `node --test scripts/build-dev.test.mjs`. For Compose verification, record that the coordinator-verified pre-purge aggregate warning totals are `docsy`=1, `strata`=1, `hugo`=3, and `fluent-ui`=3, and that the command reports aggregate per-pack totals rather than sibling-only counts. Require post-purge `hugo`=2 total warnings (one baseline plus one Docsy orphan), `fluent-ui`=3 total warnings unchanged by this feature (one baseline plus web backend and web frontend orphans), and every pack=0 failures/0 leftovers. Use the focused source audit, not those aggregate totals, to prove Hugo's sibling subset is exactly Docsy with no `ms-brand` and Fluent UI's sibling subset remains both web handles. Run the recursive suite, workspace lint with zero failures, pristine release build and release lint against only the documented baseline, intended `.github/` diff inspection, and `git diff --check`. Route the unchanged revision and evidence to independent review without mutating definition or task state. (US1, US2, US3 -> FR-001 through FR-011; SC-001 through SC-006)
    deps: T001@70757267

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-004 / SC-001 | Hugo route correction and Docsy preservation | T001@70757267, T002@76657266 |
| FR-005, FR-006 / SC-002, SC-004 | Live-reference purge, truthful warning guidance, and Compose verification | T001@70757267, T002@76657266 |
| FR-007, FR-011 / SC-003 | Inert-context byte preservation and bounded changed-path audit | T001@70757267, T002@76657266 |
| FR-008 / SC-005 | Profile consequence and build-dev source/generated parity | T002@76657266 |
| FR-009, FR-010 / SC-006 | No restoration or new visual-system machinery | T001@70757267, T002@76657266 |

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["docs/commands.md","library/packs/README.md","library/packs/docsy/pack.md","library/packs/hugo/instructions/dude-pack-hugo-hugo-dude-routing.instructions.md","library/packs/hugo/pack.md","src/skills/dude-compose/SKILL.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/042-pack-visual-neutrality/spec.md","taskKey":"T001@70757267"},"validationPlanIdentities":[],"version":1},"eventHash":"da088ccf62e7d93a6ae0351cbfc35183ae47bc02c458ee7231ee332b8dbaa2ed","occurrence":{"attemptIdentity":"63aeed214248cd3c1171b00a0a1b5586ca824b9a63091f3587e1868417258366","authorizationEvidenceHash":"c0d79c7704bcf20fbee2aa40f626e2ca133c95de1dc14c663dbd0a9543db4119","basisIdentity":"8b9e0dc99d759ee23ff50c4e848a9d766e6bd66f485cc82c1db727e9da989697","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"bf556c56ec524c8560428d801c580525bef7fef420d322838f70303f76fbd172","version":1},"occurrenceIdentity":"68ee3cc6760dcfb5fe08a6554887cca93945fc8b67c3c87a4846a995817e089d","reviewEnvelopeIdentity":"b132e5713ea03702f0c81f3695637baf7a0c9b44bbc0bad3ab0f99ad7a951e12","target":{"lane":"lightweight","specPath":".dude/specs/042-pack-visual-neutrality/spec.md","taskKey":"T001@70757267"},"type":"approach-occurrence","verificationEnvelopeIdentity":"edb3fcbb4dc5c07288f4c0f1645c7df8747d59bfbe226b218857ac58325f996b","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/skills/dude-compose/SKILL.md","repository integrated acceptance"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/042-pack-visual-neutrality/spec.md","taskKey":"T002@76657266"},"validationPlanIdentities":[],"version":1},"eventHash":"3119ef553702ca86595d47bddd7830fc1fc2f7ccb4902d5cf9de7d044fa610c4","occurrence":{"attemptIdentity":"454b26ee50170f471e14fa3432512d6285bfc31741553b8b24bef9d1ca5bf241","authorizationEvidenceHash":"97e3635a3d176243989cbd18c44a3bf98d17b8b6ae399f4feb35a4c0e6862c86","basisIdentity":"620b0c79d36da4512a2f2d798111c0d4a78edb529191a0d666f85474383b7138","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"8405f2bc2ad4656ed70d05e3087fbc367320ab21d98ab734d884db4b44a2a733","version":1},"occurrenceIdentity":"df9d0d69028136364cbf29c8a192d630f6333e49762690b1b6987fb6c31a330c","reviewEnvelopeIdentity":"731adbc97957f3ba3169b5e317f6aee3612b5ed0c207fcdcfda5dbb0096de503","target":{"lane":"lightweight","specPath":".dude/specs/042-pack-visual-neutrality/spec.md","taskKey":"T002@76657266"},"type":"approach-occurrence","verificationEnvelopeIdentity":"e8866078c4f43549c571904ff653c703a985d8facbf8e7b47d79a36e69a3359d","version":1}

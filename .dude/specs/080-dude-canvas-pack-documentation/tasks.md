<!-- audit log: .dude/ideas/080-dude-canvas-pack-documentation.md#coordinator-log -->
# Tasks: Dude Canvas Pack Documentation

Apply the approved round-2 design with the user's Details rename, approved by direct chat at 2026-10-11T22:12:34Z and bound in the `spec.md` Revision Log to `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html`. Both units are new, serial, open proposals with no inherited completion evidence; their state and closure stay with the coordinator. Each executed unit gets one Tester and one independent Reviewer through ordinary Work.

## Phase 1: Foundational - Document reads

- [x] T001@6b3e91d4 [Shared] Add document text to the existing catalog, installed-pack, and project reads in `catalog-reader.mjs`, `packs.mjs`, and `project-artifacts.mjs`, with server tests and their scoped projection.

    Traces US1/US2/US3; FR-003, FR-004, FR-007, FR-008, FR-009, FR-010, FR-012, FR-013, FR-014, FR-015, FR-016; SC-003, SC-004, SC-006. Implements the plan's Chosen Structure data path and its scoped projection of the three `lib` outputs.

    Exact writer paths:
    - `src/extensions/dude/lib/catalog-reader.mjs`
    - `src/extensions/dude/lib/packs.mjs`
    - `src/extensions/dude/lib/project-artifacts.mjs`
    - `src/extensions/dude/canvas-server.test.mjs`
    - `.github/extensions/dude/lib/catalog-reader.mjs` (scoped projection)
    - `.github/extensions/dude/lib/packs.mjs` (scoped projection)
    - `.github/extensions/dude/lib/project-artifacts.mjs` (scoped projection)

    Acceptance commands: `node --test src/extensions/dude/canvas-server.test.mjs src/extensions/dude/needs-you.test.mjs`, then `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs`. `needs-you.test.mjs` calls `readPacks` and `readProjectArtifacts` and must stay green unchanged.

    Scope: run acceptance in an owned copy where the user's private uncommitted files keep their HEAD bytes, and confirm separately that those workspace files are unchanged. Never run `node scripts/build-dev.mjs` in the worktree; project only the three `lib` outputs with `listCoreOutputs` and `writeCoreOutput`, refusing a missing or duplicate match. Check each file's size before reading, never read past 64 KiB, and follow no file-system link. Add no route, transport, cache, or store. Browser cases, with the prefix `080 Documentation:`, belong to T002.

## Phase 2: User Stories 1-3 - Details section, reader, and acceptance

- [x] T002@f20a7c58 [Shared] Add the pinned `marked` dependency, `markdown.jsx`, and the Details section and reader in `settings.jsx`; rebuild the UI, update every pin, and run the build, browser, and installed-host acceptance.
    deps: T001@6b3e91d4

    Traces US1/US2/US3; FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-010, FR-011, FR-012, FR-013, FR-015, FR-017, FR-018; VSC-001 through VSC-005; SC-001 through SC-007. Implements the plan's Chosen Structure UI, Generated Outputs And Pins, and Verification.

    Exact writer paths:
    - `scripts/dude-canvas-ui/package.json`
    - `scripts/dude-canvas-ui/package-lock.json`
    - `src/extensions/dude/frontend/markdown.jsx` (new)
    - `src/extensions/dude/frontend/settings.jsx`
    - `src/extensions/dude/frontend/use-canvas-data.js`
    - `src/extensions/dude/frontend/styles.js`
    - `src/extensions/dude/ui/assets/app.js` (rebuilt)
    - `src/extensions/dude/ui/assets/app.js.LEGAL.txt` (rebuilt)
    - `docs/commands.md`
    - `scripts/dude-canvas-ui/build.test.mjs`
    - `scripts/dude-canvas-ui/browser.test.mjs`
    - `scripts/dude-canvas-ui/t011-browser.test.mjs`
    - `scripts/dude-canvas-ui/t012-installed-host.mjs`
    - `scripts/build-dev.test.mjs` (its `app.js` pin only)
    - `.github/extensions/dude/ui/assets/app.js` (scoped projection)
    - `.github/extensions/dude/ui/assets/app.js.LEGAL.txt` (scoped projection)

    Acceptance commands, from the plan's Verification: `node --test src/extensions/dude/canvas-server.test.mjs` and `node scripts/dude-canvas-ui/build.mjs`. Then run serially, with Node 22+, `DUDE_CANVAS_BROWSER` set to an installed browser, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and a short owned `DUDE_CANVAS_ARTIFACTS_DIR`: `node --test scripts/dude-canvas-ui/build.test.mjs`; `node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs`; `node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs`; `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs`; `node scripts/dude-canvas-ui/t012-installed-host.mjs`.

    Scope: install `marked` once at one exact version; that is the only registry contact, and the tests stay offline. Run acceptance in an owned copy where the user's private uncommitted files keep their HEAD bytes, and confirm separately that those workspace files are unchanged. Never run `node scripts/build-dev.mjs` in the worktree; project only `app.js` and `app.js.LEGAL.txt` with `listCoreOutputs` and `writeCoreOutput`. `markdown.jsx` is source only: `.github/extensions/dude` projects no `frontend` folder, and no test inventories frontend files. Name new browser cases with the prefix `080 Documentation:`. Use the approved visible strings: the heading "Details", "No details found.", the eyebrow `<item> details`, and "details" in the source explanation. Keep approved design and reference pins, and historical `.dude` evidence, unchanged.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/extensions/dude/lib/catalog-reader.mjs",".github/extensions/dude/lib/packs.mjs",".github/extensions/dude/lib/project-artifacts.mjs","src/extensions/dude/canvas-server.test.mjs","src/extensions/dude/lib/catalog-reader.mjs","src/extensions/dude/lib/packs.mjs","src/extensions/dude/lib/project-artifacts.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T001@6b3e91d4"},"validationPlanIdentities":[],"version":1},"eventHash":"58b7c25006c10033e09d13e928f950a3c798e18b6d2e51a3b3867c7e20b8d014","occurrence":{"attemptIdentity":"20947fa135130c30e5f9ccd2d70df280865155071bb4be0da2ea856b4d7f1bbb","authorizationEvidenceHash":"ce9f60c525327a63d879fba99c253fdb087e73c4302baa5fbdb9c2c4f653ba9c","basisIdentity":"2684a7e0de2dbe72ee8df3d2c613108e243243a8b8daa9fa21e09bf9f820a7b9","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"fb72ee5ce39b6d2129d8b69c05e0a95391e527b20231c8e39cbf948ab18b74d6","version":1},"occurrenceIdentity":"8f4bb31f7b7734bad5d062aa104f57cd84a950732a5cb31082ee34b2740268f1","reviewEnvelopeIdentity":"de4a50ad8040648bdc52584665809a20e777250816fb5dd28e24de5c9f8cbb0e","target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T001@6b3e91d4"},"type":"approach-occurrence","verificationEnvelopeIdentity":"32ec6c963943759533e844d6fbbc2a614885e68a39b599fcaa4fd023907dde4d","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/extensions/dude/ui/assets/app.js",".github/extensions/dude/ui/assets/app.js.LEGAL.txt","docs/commands.md","scripts/build-dev.test.mjs","scripts/dude-canvas-ui/browser.test.mjs","scripts/dude-canvas-ui/build.test.mjs","scripts/dude-canvas-ui/package-lock.json","scripts/dude-canvas-ui/package.json","scripts/dude-canvas-ui/t011-browser.test.mjs","scripts/dude-canvas-ui/t012-installed-host.mjs","src/extensions/dude/frontend/markdown.jsx","src/extensions/dude/frontend/settings.jsx","src/extensions/dude/frontend/styles.js","src/extensions/dude/frontend/use-canvas-data.js","src/extensions/dude/ui/assets/app.js","src/extensions/dude/ui/assets/app.js.LEGAL.txt"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T002@f20a7c58"},"validationPlanIdentities":[],"version":1},"eventHash":"d39cb50a0313752e23ee2dea69cf9ed1a225d159abb02e62a42fb0d6fa1a65cf","occurrence":{"attemptIdentity":"f50090dafe45e6d5ed7545146cbea71eaed80e31f8df726bb43f3ee0b37367f6","authorizationEvidenceHash":"4fd395b1e853a818d8851c3d2db60aa7656827b5cb3fcd7fdaa95f99a4977d5b","basisIdentity":"b1e831db129e610f666edb731f2f4bea1177a8124a70454797f6962f34b42bed","chronology":{"attemptOrdinal":2},"disposition":"verification-failed","resultIdentity":"48cd66d05f54687bbcaff5c83cf2c19831b9f93a67182e26fbc853877536c485","version":1},"occurrenceIdentity":"2a998710b42e2a303dc424b6fb1b691e48347d9445a4f9ba45ee640887bb30f5","reviewEnvelopeIdentity":"d6bfb9cdc1d506f42cd07fc08ee771beafef30aa187f28a3caf84acda0b9e0b5","target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T002@f20a7c58"},"type":"approach-occurrence","verificationEnvelopeIdentity":"fedffc081f49d787e2c9a347bb62ce411973fc8818d1443546ed8ca14d035fc3","version":1}
- dude-run-event: {"basis":{"action":"retry-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["retry-task"],"targets":[".github/extensions/dude/ui/assets/app.js",".github/extensions/dude/ui/assets/app.js.LEGAL.txt","scripts/build-dev.test.mjs","scripts/dude-canvas-ui/browser.test.mjs","scripts/dude-canvas-ui/build.test.mjs","scripts/dude-canvas-ui/t011-browser.test.mjs","scripts/dude-canvas-ui/t012-installed-host.mjs","src/extensions/dude/frontend/settings.jsx","src/extensions/dude/frontend/styles.js","src/extensions/dude/ui/assets/app.js","src/extensions/dude/ui/assets/app.js.LEGAL.txt"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T002@f20a7c58"},"validationPlanIdentities":[],"version":1},"eventHash":"08d66b7fb6eda93ce4ae9b45581d70f6a0afd6922b55ff94c4772d137f0b8498","occurrence":{"attemptIdentity":"5f0bb26eda0dda24e9c0c00d54c7c5f71a88b7aed70e8d9b9e85e2f610afea88","authorizationEvidenceHash":"d123facf3d792bbaa34651f1572b9aee1029445aa84ad22f7fbe65fafc49699f","basisIdentity":"b2863ce6c4ab77a75b13ad37b34fb4fd6685a753ce534e2f0977f1e718f66447","chronology":{"attemptOrdinal":3},"disposition":"accepted","resultIdentity":"148932aee9d182f0c7e51ebbba44962dca9a18a66307279d6a13405c1e3cf216","version":1},"occurrenceIdentity":"046af75e03649a53260e8bdb63c2f75524bd0b6b320b57418a1bd81aa2d4ecd1","reviewEnvelopeIdentity":"cf12384c98949c6d4b05a1bbb6b5f91517c984419d5b9efa5510393c0c18a5a9","target":{"lane":"lightweight","specPath":".dude/specs/080-dude-canvas-pack-documentation/spec.md","taskKey":"T002@f20a7c58"},"type":"approach-occurrence","verificationEnvelopeIdentity":"249a12eca9917851eab3ba135af8131887eab468560ef60039773ae50b651548","version":1}

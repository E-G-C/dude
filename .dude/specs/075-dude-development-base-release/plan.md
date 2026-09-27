# Plan: Dude Development Base Release

Spec: `.dude/specs/075-dude-development-base-release/spec.md`
Owner: `.dude/ideas/075-dude-development-base-release.md`

Record development provenance in one optional metadata file, then add its validated release value to the existing About row. Keep the bundle manifest unchanged. The user approved Development Base Release About by direct chat; the spec Revision Log binds that approval to the viewed mock and reviewed specification. Implement the existing design without changing its artifact or captures.

## Technical Context

- **Language/Version**: JavaScript ES modules on Node >=20; React 19.2.8 JSX. Browser acceptance uses Node 22+ with global WebSocket.
- **Primary Dependencies**: Existing Node built-ins, Git at maintenance time, Fluent UI 9.74.7, and esbuild 0.28.2. No new dependency or dependency installation.
- **Storage**: One optional `.dude/metadata/development-base-release.md` record. Preserve the existing manifest, profile, and append-only upgrade-log formats.
- **Testing**: Node's test runner, existing build/upgrade/server fixtures, Edge/CDP browser suites, and the existing installed-host acceptance driver.
- **Target Platform**: Source development and consumer bundles on the existing Node/Git platforms; Windows Canvas/Edge and Linux CI.
- **Project Type**: Core-bundle maintenance tooling and an existing Canvas web UI.
- **Performance Goals**: Source build uses local release evidence only. Upgrade consumes its already-fetched tree without another network acquisition. About makes at most two small, fixed local file reads per entry, with no polling. Retain the existing compressed UI size budget.
- **Constraints**: No consumer-project tag lookup, manifest schema expansion, automatic second upgrade, new command, new About action, or change to 074's artifacts or approval.

## Chosen Structure

The closed manifest is a live compatibility boundary. `upgrade.mjs` validates upstream metadata before replacing the installed engine, so emitting a new manifest key would make an older engine reject the very update that teaches it that key. The release parser, lint, and About also reject unknown keys. A separate optional record avoids that bootstrap failure without weakening any manifest validator (FR-012; SC-005).

| Surface | Change | Spec trace |
| --- | --- | --- |
| `src/skills/dude-engine/lib/workspace-paths.mjs` | Add the one fixed metadata path. | FR-001, FR-002, FR-010 |
| `src/skills/dude-engine/lib/development-base-release.mjs` | Small pure record parser/renderer shared by the two writers and About. Reuse the existing single-fenced-JSON parser, not the install-profile schema. | FR-003, FR-005, FR-009, FR-014 |
| `scripts/build-dev.mjs` | Produce the source repository's record from its own reachable stable release tags. Keep all existing project data unchanged; only this new generated record is an added metadata write boundary. | FR-001, FR-003, FR-004 |
| `src/skills/dude-bundle-upgrade/upgrade.mjs` | Carry the optional record through the existing reviewed plan, apply, no-op, committed-boundary, and rollback behavior. | FR-002, FR-004, FR-011, FR-012 |
| `src/extensions/dude/lib/about.mjs`, `src/extensions/dude/frontend/about.jsx` | Read the fixed optional record, add one private response value, and extend only the development version text. | FR-005–010, FR-013–015 |
| Existing build, upgrade, server, browser, and installed-host tests; `src/skills/dude-bundle-upgrade/SKILL.md`; `docs/commands.md` | Verify the changed boundaries and document recording, fallback, and normal bootstrap behavior. | SC-001–006 |

Project generated core into `.github/` with `node scripts/build-dev.mjs`; never hand-edit the projection. Rebuild Canvas JSX first with `node scripts/dude-canvas-ui/build.mjs`. Keep source/generated runtime and legal-notice bytes identical. No Settings, navigation, theme, style, Compose, release-channel resolution, or manifest-parser refactor is planned.

## Optional Record

The new file contains exactly one fenced JSON object with two fields:

```json
{
  "source_repo": "https://github.com/E-G-C/dude",
  "base_release": "v1.3.0"
}
```

`source_repo` is the exact installation-source string used to associate the record, not a link to expose in About. `base_release` must match the existing stable-tag convention `^v\d+\.\d+\.\d+$`. Require a nonblank string source and a valid release string, with no coercion, unknown fields, or extra JSON payload. Accept valid UTF-8 only. Missing or unusable data means no usable base. Unknown provenance is represented by an absent file, not a second status document or history entry.

`dude-bundle-upgrade` owns this installation record in consumer workspaces. The source development builder is its explicit producer in this repository. Neither the user nor About hand-edits it. Preserve the manifest's existing allowed fields and optional `installed_ref`, its `main` development refs, the Compose profile, and earlier upgrade-log entries.

This record needs no timestamp, source revision, file hashes, registry, or schema-version field: About consumes only the source association and recorded release. It is provenance, not an integrity check. The existing upgrade plan still pins the actual reviewed source and bytes.

### Source Development Build

For FR-001, FR-003, and FR-004:

1. Read the canonical manifest through `readCanonicalManifest` and preflight the new fixed destination through `resolveMutationPath` before core cleanup. Reject linked or non-file destinations through the existing path boundary.
2. For a manifest with `installed_ref: main`, use only the source checkout at the exact build root. Confirm Git's top-level root is that root, resolve its current commit, and enumerate stable tags merged into that commit. Reuse `pickLatestReleaseTag` for numeric version ordering; do not substitute the nearest `git describe` tag or the newest remote release.
3. Missing Git, no matching root, shallow/incomplete history, no reachable stable tag, or an unsuccessful evidence read yields no base. Do not fetch, deepen history, inspect a parent or consumer repository, or fail an otherwise valid build solely because the optional release evidence is absent.
4. After core projection, reconcile the generated record with the computed result: write a known base using the manifest's source, or remove the old record when unknown or not development. Report success only after that reconciliation. Avoid rewriting identical record bytes, and include an actual write/removal in the existing build result.

Keep current build failures visible; this feature does not make the existing core projection crash-atomic or add recovery machinery. Re-running the normal development build repairs an interrupted projection. All other `.dude/` data remains protected. The new generated record belongs with normal development output; rerun the build after the source's available release tags change. This plan grants no automatic commit, merge, or push authority.

`build-release.mjs` continues to seed only the existing manifest and profile. It neither copies the development record into release output nor changes `source_ref: latest` / `installed_ref: <tag>`. Retain its closed parser and add regression coverage for a source tree that contains the new record.

### Confirmed Main Refresh

For FR-002–004, FR-011, and FR-012, consume the optional record from the exact upstream tree already selected by the existing planner. Do not derive Dude's base from the consumer project's Git history, call the release-list endpoint, or add another fetch. A shallow upstream cache is sufficient because it carries build-time provenance; absent provenance stays unknown.

Use the upstream record only for a target `main` install, with `installed_ref: main` in the cached manifest and an exact match between the record and cached manifest's `source_repo`. Render the local record with the outgoing manifest's exact selected `source_repo` and that validated release. This permits the existing local-source override without copying a source association that would not match the resulting local manifest. Non-development targets, missing records, and unusable payloads produce an absent local record rather than retaining a previous base.

Extend the existing private plan envelope to freeze the upstream record's expected file-or-missing state, the local preimage, and the desired record or absence. Include them in its digest and normal evidence validation. Advance the closed plan schema from 1 to 2 and require old plans to be recreated, using the existing current-only plan rule; add no migration or parallel plan format.

The existing preview must show a base-provenance change even when core file buckets and refs are unchanged. Include that difference in `metadataTransitionNeeded`; a matching base and otherwise matching installation remain a true no-op. Preflight both fixed paths, preserve file-type/source-drift refusals, and bind apply to the reviewed values without a new lookup or reclassification. Malformed regular-file payloads are unknown provenance; unsafe filesystem types retain the normal refusal before writes.

Include the local record in the existing planned write paths, commit, and committed-core boundary validation. A completed upgrade's existing safety-tag rollback must restore the old record or its absence. Clearing obsolete provenance is a metadata transition, not a core Remove bucket that `--skip-removals` can retain. Preserve confirmation, TTL, branch/tag, failure reporting, pack-refresh, and rollback policy; add no separate log, automatic Git action, or automatic repair pass.

An older engine will not copy the new metadata file during its first update. Its upstream manifest remains valid, and the new About falls back honestly. The existing documented second explicit `@dude upgrade` through the updated engine can then preview and record the metadata-only change with fresh confirmation. Do not hide or auto-run that second upgrade.

## About Read And Display

For FR-005–010 and FR-013–015, retain 074's manifest parser and independent ref validation. Read the optional fixed file only for a usable installed `main` ref, through the same repository-contained, no-symbolic-link, regular-file boundary. Use its base only when its source exactly matches the manifest source. Keep the source string private.

Extend the private About result to exactly `{ installedRef, sourceRef, baseRelease }`, where `baseRelease` is a valid stable release or `null`. An unreadable or unprovenanced manifest returns three nulls; individually unusable refs keep 074's independent null handling. A bad optional record returns a null base without discarding usable refs. Update the frontend's closed response validator with the backend, without adding an alternate endpoint or changing the route's method, body, Host/Origin, workspace-lifetime, or no-store rules.

`versionText` uses the supplement only for `installedRef === 'main'`; `channelText` remains unchanged. The approved known-base text is `Development (main), based on v1.3.0`; a null base retains `Development (main)`. Preserve current note selection: a valid response, including null refs, uses the ordinary recorded-metadata note; transport or response-shape failure uses the existing unavailable note. A missing base alone changes neither note. Render the release as inert text, never as a link.

Preserve entry-time loading, cancellation and late-result handling, Packs state, work selection and drafts, author credit, the literal repository anchor, and `About · Read only`. No new spinner, warning, action, reload mechanism, or metadata scan is needed. Deliver the changed backend and rebuilt frontend together, and restart the existing host before installed-runtime acceptance.

## Approved Design And Rendered Coverage

The canonical mock is `.dude/specs/075-dude-development-base-release/design/about.html`, SHA256 `61a1f0dcf31195ef3094cb3c08181125a8c1466cb6efb91370bc402fdcda284d` under the repository's `approvedDesignSha256` CRLF-normalization convention. The spec Revision Log binds the direct-chat approval and reviewed spec revision. Keep the self-contained primary, its 23 captures, and all 074 artifacts unchanged. Neither the old mock evidence nor the approval is production acceptance.

Apply these states in the existing presentation:

| State | Version and channel behavior |
| --- | --- |
| Development, known base | `Development (main), based on v1.3.0`; channel stays `Development (main)`. |
| Development, no usable base | Exact existing `Development (main)` in both rows; ordinary provenance note, no warning. Missing, malformed, and wrong-source optional data share this presentation. |
| Release | `v1.3.0`; channel `Stable releases (latest)`; no base suffix. |
| Loading installation | Existing Reading indicators, with author and repository still visible. |
| Missing installation record | Existing Unavailable values with the ordinary recorded-metadata note from a valid null-ref response; author and repository still visible. |
| Read/response failure | Existing Unavailable values and unavailable note; author and repository still visible. |

Retain other recorded refs and independent channel classifications from 074. The mock's preview strip and state selectors are not product affordances. Do not add rows, badges, icons, tooltips, warnings, update controls, or another Canvas redesign.

Verify the rendered product in light and dark at 180x450, 360x900, 768x900, and 1440x900. Include 200% reflow from the latter three sizes down to effective 180x450, not a further reduction of the minimum case. Name the actual method; the proposal used a halved viewport at 2x device scale, not native browser zoom. Include the narrow default-scrollbar case, where its gutter changes wrapping. A channel row below the fold must remain reachable by keyboard scrolling.

Use the existing browser suites for fresh captures, geometry/overflow, accessibility tree, contrast, focus, scrolling, note selection, and loading/error transitions. Preserve the working Packs, work-selection, unsent-input, and Review round trips. Keep production evidence in harness-owned temporary directories, not the approved mock directory.

## Delivery Sequence

The approved definition derives two sequential units:

1. `T001@d8c3a59e`: record development base provenance in source builds and confirmed core upgrades. This is the foundational US2 slice: the pure record boundary, both producers, frozen plan/apply behavior, regression fixtures, procedure text, and generated core. It is independently verifiable without changing About or running browser/host acceptance. Trace: FR-001–004, FR-011–012; SC-002, SC-003, and SC-005's packaging/upgrade boundary.
2. `T002@72f6b104`, after T001: apply the approved About base-release display and verify the installed read path. Change the adapter and frontend together, extend the existing browser and installed-host fixtures, update usage text, and rebuild the runtime. Trace: US1 and US3; FR-005–010, FR-013–016; SC-001, SC-004–006; VSC-001–004.

No separate installed-host task is needed: the existing T012 driver already visits About, and extending that read/display acceptance belongs to the second slice. `tasks.md` supplies each unit's exact source, test, documentation, generated, and metadata writer paths. Rebuilds grant no permission for additional changed paths. Preserve unrelated work and return any needed scope expansion to the existing owner before writing.

Each executed unit follows ordinary testing and independent review. No task inherits approval or mock-inspection results as completion evidence. There are no existing canonical units, archives, discovered-work sections, or execution-history mappings. No measurable runtime optimization objective applies, so no ObjectiveRegistry region is emitted.

## Verification Commands

These are planned commands for authorized implementation, not execution evidence. Run from the repository root; each task's Check specifies its own applicable subset.

For T001, project the changed core, then run the existing build and upgrade suites:

```text
node scripts/build-dev.mjs
node --test --test-concurrency=1 scripts/build-dev.test.mjs scripts/build-release.test.mjs src/skills/dude-bundle-upgrade/upgrade.test.mjs
node .github/skills/dude-lint/lint.mjs .
```

Cover valid/invalid record parsing, highest reachable stable tags, excluded unmerged/prerelease tags, absent/shallow history, replacement/removal, unchanged existing metadata, frozen source/local evidence, metadata-only apply, true no-op, rollback, and the older-install bootstrap path. Keep manifest rejection tests and release seeding intact. Exercise upgrade mutations only in disposable fixtures, not through a live upgrade of this repository.

For T002, use the installed build dependencies and Node 22+ with global WebSocket. Configure `DUDE_CANVAS_BROWSER` to a verified Edge executable, and `DUDE_COPILOT_SDK`, `DUDE_COPILOT_CLI`, and `DUDE_COPILOT_RUNTIME` to the existing verified installed artifacts. On Windows the CLI must be the real `copilot.exe`, not a shell shim. Missing prerequisites remain evidence gaps; do not install or substitute dependencies or hosts silently.

```text
node scripts/dude-canvas-ui/build.mjs
node scripts/build-dev.mjs
node --test --test-concurrency=1 src/extensions/dude/canvas-server.test.mjs scripts/build-dev.test.mjs
```

Run the existing build and both browser suites explicitly and serially in required-browser mode:

```powershell
$env:DUDE_CANVAS_BROWSER_REQUIRED = '1'; node --test --test-concurrency=1 scripts/dude-canvas-ui/build.test.mjs scripts/dude-canvas-ui/browser.test.mjs scripts/dude-canvas-ui/t011-browser.test.mjs
```

T012 creates its host temp root beneath `DUDE_CANVAS_ARTIFACTS_DIR`. Give it this short parent for every invocation, rather than the long Work evidence directory; the driver allocates a fresh `installed-host-*` child itself:

```powershell
$env:DUDE_CANVAS_ARTIFACTS_DIR = Join-Path $env:TEMP 't075-2'; node scripts/dude-canvas-ui/t012-installed-host.mjs
```

Then run `node .github/skills/dude-lint/lint.mjs .`. Keep reports and fresh evidence paths from the actual driver run. Retain all failure results and report executed, failed, and skipped counts; skips, zero selected tests, or a wrapper pass are not coverage. Do not lengthen timeouts to mask a path-length failure.

Preserve runtime, source/generated, static Review, and legal-notice assertions. Update only rebuilt runtime pins and add the 075 approved-mock pin using its normalization convention; never refresh a design pin to bless changed mock bytes. The T012 fixture must retain the release case and include a known-development record through the installed receiver, using pre-seeded owned fixture data rather than post-seed model writes.

Automation must cover the changed interaction before any human-only host observation is requested. The unchanged repository link does not require a repeat of 074's manual approval; that old observation also cannot prove the new version value.

## Guardrail Checks And Complexity

Existing project and bundle guardrails cover this feature; there are no new candidates and no guardrail-memory write. Explicit approval of the exact mock is now recorded in the staged definition. Source/generated ownership, Canvas continuity, no dead affordances, privacy, and minimal current-caller scope are retained.

One optional record is justified by the closed-manifest bootstrap failure. One pure codec has three current callers and prevents divergent record rules. Extending the existing upgrade envelope is necessary because the new metadata write must be previewed and bound to its preimage. Do not introduce a general metadata registry, cache, alternate manifest, background updater, or new workflow.

Retain the existing mock and its captures. Keep the data contract and checks in this plan; no new research, schema, quickstart, or checklist artifact is needed.

## Remaining Risks And Handoff

Source tags may be absent or stale; only locally evidenced provenance can be recorded, and the supported fallback must remain honest. Older engines need a later explicit upgrade to populate the new file. The upgrade envelope and About response are closed shapes, so their producer, validator, and consumer changes must stay coordinated. Narrow wrapping and actual installed-host behavior still need fresh production evidence, including the short T012 path.

The coordinator rechecks the exact defined owner, supplied preimages, and staged reconciliation before applying the existing re-definition transaction. There are zero kept, changed, or dropped units and two new units, with no inherited state. The coordinator owns execution-state application and any derived board. Fresh lint must report zero failures before a definition-readiness claim; this stage claims no publication, execution, or completion.

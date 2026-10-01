# Plan: Dude Canvas Artifact Import

Spec: `.dude/specs/073-dude-canvas-artifact-import/spec.md`
Owner: `.dude/ideas/073-dude-canvas-artifact-import.md`

Implement one Packs design in two useful phases. Phase A places the previously defined import contract in Add/import, lists project agents and skills read-only in Installed, and adds Show in Installed, 25-row paging, and retained refresh context. Phase B adds source configuration, multi-source discovery, the Source column/filter, and source-bound pack requests. The user explicitly approved the viewed **Classic Settings Packs Hub with project rows** mock by chat ("I approve the mockup") at 2026-10-01T10:05:42Z, bound to `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html` at SHA256 `58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9`; the coordinator's fresh hash matches the reviewed artifact. The spec Revision Log records that direct chat approval, not a Canvas response or acknowledgment. Canonical implementation tasks are derived from the approved design and this plan. Independent mock verification remains mock evidence; production implementation and acceptance remain unverified. Documentation display belongs to 080 per the user's Q6 answer.

## Technical Context

| Field | Evidence and constraint |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >=20; React/React DOM 19.2.8 JSX. The direct-CDP browser runners require Node 22+ with global WebSocket. |
| Primary Dependencies | Existing Fluent UI 9.74.7, locked Fluent icons, and esbuild 0.28.2 in `scripts/dude-canvas-ui/package.json` and the current build boundary. No new dependency, framework, or consumer install step. |
| Phase A Read Surface | New `src/extensions/dude/lib/project-artifacts.mjs` exports `readProjectArtifacts(root, signal)`. Local asynchronous filesystem inspection joins the existing coalesced `/api/packs` response; no network, process, watcher, provenance store, or change to `packs.mjs` in Phase A. FR-084-088. |
| Storage | Imports reuse the joined provider's bounded transient registry and the import workflow's existing reviewed plans/transaction material. Phase B adds only project-owned `.dude/metadata/pack-sources.md` for added sources. No request store, source history, persisted catalog cache, persisted artifact inventory, profile field, or provenance database. FR-008-010, FR-042-049, FR-050, FR-070, FR-084-085. |
| Testing | Node's test runner, the existing browser/provider suites, and the explicitly invoked installed Copilot host driver. Use local fixtures and controlled acquisition only; no test contacts a network source. Keep the focused/directory import suites unchanged. |
| Target Platform | Current Copilot Canvas and its loopback server, Windows Edge/CDP, and the actual installed `copilot.exe` receiver. Preserve portable behavior and disclose platform-qualified coverage. |
| Project Type | Bundled core extension with authored frontend, committed UI assets, generated dogfood core, and test-free release projection. |
| Performance Goals | Imports retain the 5,000 ms operation/preparation bound and 64-record/2 MiB registry budgets. Catalog readers retain the 5,000 ms acquisition deadline and bounded process-tree cleanup; Phase B reads at most four sources concurrently, with at most eight added sources. The project scan is bounded to 256 artifacts, 8 KiB per entrypoint, and 128 files/depth 12 per artifact; measure read/render cost with its roughly 5 MB upper-range payload. Measure both UI builds against the 358,400-byte compressed ceiling. FR-010, FR-041, FR-044, FR-050-052, FR-085. |
| Constraints | Explicit approval of one mock covering both phases before product implementation; core independent of optional packs; unchanged import engine and six human-request classes. Default-catalog pack request bodies, handoff, and acknowledgment stay byte-identical when added-source binding is absent. The only new direct configuration write is the sources file. Project rows grant no pack authority or operations. FR-018-020, FR-043, FR-067-070, FR-084-088. |

## Chosen Structure

### Phase A - Add/import and project rows under Packs

Keep `SECTIONS` in `settings.jsx` as Packs | About. Extend the Packs sub-tabs to Installed | Available | Add/import. Implement the existing import definition below, changing placement, explanatory copy, and the return label/destination to Back to Add/import. Generalize the current pack-only Needs you return value just enough to carry the request and its Settings destination. Ship no Sources tab, source store, or source-picker placeholder in this phase. FR-001-031, FR-067-070.

Add `project-artifacts.mjs` to read the current project agents and skills into a separate projection, not into the profile or pack reader. Installed uses Name, Type, and Use cases, with project rows following packs; Applied offers the local Show in Installed jump. Change both lists to 25-row pages and retain filters/page/selection across a refreshed snapshot while the selected opaque key survives. Keep Phase A's existing default-catalog read behavior, including its latency; the project scan itself starts no process or network request. FR-084-090.

### Phase B - Sources and source-bound discovery

Append Sources to that strip. Add the small shared sources module, its one project configuration file and lint check, the fixed source-write route, multi-source catalog projection, Source column/filter, and the explicit-source Compose fix. Sources uses the pack table/details pattern and a top-triggered Add dialog. Extend Phase A's working lists/read projection and reuse its return path for pack permissions; do not make importing or project inspection depend on sources. Phase B keeps automatic installed/project reads separate from explicit catalog discovery. FR-003, FR-029, FR-032-070, FR-075-076, FR-079-090.

Use the toolbar conventions of Visual Studio NuGet Package Sources ("+"), JetBrains Manage Plugin Repositories (+/-), and Windows Settings Add buttons above lists. The 063/073 Installed/Available master-detail pattern supplies the table and shared pane/overlay; Fluent Dialog conventions supply the bounded Add form. Homebrew tap/untap explains discovery configuration without installation. Use source-bound selection like cargo `registry =`, uv per-package indexes, and winget `--source`. Do not copy pip/choco priority ordering. The typed import field follows GitHub Desktop's Clone a repository/VS Code Git: Clone pattern instead of promising an OS picker.

Use a 25-row default like paged data tables in GitHub issue and PR lists. Retain the approved pager rather than replace it with unpaged scrolling without virtualization. A height-fitted page changes under resize/zoom; 50 rows gives no benefit for the stated need. For mock-only placement review, use Figma Dev Mode annotations and Storybook's Outline toggle as the conventions: visible by default, explicitly removable from product captures.

| Authoritative surface | Bounded change and spec trace |
| --- | --- |
| `src/extensions/dude/lib/project-artifacts.mjs` (new, Phase A) | `readProjectArtifacts(root, signal)` reads all present local agent entrypoints and skill directories, with bounded descriptions/files, separate coverage, and no provenance claim. FR-084-088. |
| `src/skills/dude-engine/lib/pack-sources.mjs` (new) | Closed document parsing/serialization, source validation and normalization, identity/matching, revisions, and the one-file atomic writer. Used by Canvas and lint; no generic settings framework. FR-032-049, FR-055-065, FR-070. |
| `src/skills/dude-compose/compose.mjs` | Make explicit `--source` exclusive in `resolvePackDir` and `resolveCatalogDir`; no-override calls retain current behavior. FR-033, FR-055, FR-067. |
| `src/skills/dude-compose/SKILL.md` | Extend Canvas Pack Requests And Results for optional source binding, exact source/ref use, trust disclosure, refresh source changes, and result echo. Retain default-only examples/contracts. FR-055-061, FR-066-067. |
| `src/extensions/dude/lib/catalog-reader.mjs` | One fixed per-source catalog read, selected internally from a validated sources document; resolve the source once and enumerate that directory before exit. Retain the one-operation helper boundary. FR-044, FR-050-056. |
| `src/extensions/dude/lib/packs.mjs` (Phase B only) | Built-ins, validated added sources, bounded reader pool, per-source coverage, source-aware rows and metadata, opaque pack/source row keys, chosen-source freshness. Project each installed row's matched source key server-side for installed-from-source counts and removal reasons. Retain installed-only reads for removal/result checks; project artifacts never enter this authority. FR-032-034, FR-044, FR-046, FR-049-065, FR-076, FR-080, FR-082, FR-084. |
| `src/extensions/dude/lib/needs-you.mjs` | Closed import parser/record/request/result and local-path check; shared send exclusion; publish the import result's mutation-dependent refresh hint; optional `catalogSource` in pack binding and acknowledgment; source-removal blockers from live pack requests. FR-005-025, FR-043-048, FR-055-061, FR-067, FR-087. |
| `src/extensions/dude/lib/canvas-server.mjs` | Exact import request and source-write routes with existing pack-route guards and explicit error mapping. Attach `project: {coverage, items}` inside the coalesced `GET /api/packs` read under its signal. No Compose mutation or import execution in HTTP. FR-006-010, FR-020-024, FR-043-049, FR-059, FR-070, FR-084-087. |
| `src/extensions/dude/frontend/settings.jsx` | Keep section tabs unchanged; extend Packs sub-tabs, opaque row identity, filters and detail headings; add project rows/details, combined counts, Show in Installed selection, 25-row paging, retained context, and visible focus return. Preserve the fixed details order and bounded panel lifetimes. Show packs changes Available locally. FR-001-004, FR-026-031, FR-053-065, FR-071, FR-074-077, FR-079-090. |
| `src/extensions/dude/frontend/artifact-import.jsx` (new import panel) | Source field, validation, one request, inline phase/result, complete inert paths, and Applied-only Show in Installed with explicit disabled reasons. Replaces the prior plan's unimplemented `local-artifacts.jsx` name; no Local artifacts section or inventory under Add/import. FR-004-005, FR-007, FR-019-025, FR-028, FR-030-031, FR-087. |
| `src/extensions/dude/frontend/pack-sources.jsx` (new) | Built-in/added-source table, shared 320 px details pane or modal overlay below 1100 px, top Add source trigger and native modal Location/Ref form with limit/trust/save notes. Source facts, local Show packs action, advisory Remove reasons and authoritative in-confirmation refusal; no filters or pager. FR-032-049, FR-052, FR-070, FR-075-076, FR-079-083. |
| `src/extensions/dude/frontend/use-canvas-data.js` | Import prepare/submit and exact reconciliation; invalidate project coverage with pack coverage; retain existing workspace-hint reads; source-write/revision handling and returned key/count; explicit Phase B discovery reads; source-bound pack selectors and attempts. Return the post-add snapshot before reselecting its new source row; no read for Show packs or Show in Installed. FR-006-010, FR-020-029, FR-043-065, FR-067, FR-081-083, FR-085, FR-087, FR-090. |
| `src/extensions/dude/frontend/needs-you.jsx` | Import permission recognition and response choices, generalized response/result wording, retained New idea draft under import exclusion, return label. FR-006, FR-013-015, FR-019-020, FR-028-031, FR-058, FR-072-073. |
| `src/extensions/dude/frontend/app.jsx`, `styles.js` | Tagged permission return, Packs-active control/footer rules, responsive navigation and active-scroller resets, labeled stacked rows, sticky-header scroll margin, pinned pack/project/source details header/footer around one scrolling body, preserved Needs you reflow fixes. Leave the Packs/About section chooser at 074. FR-001-003, FR-026-031, FR-069, FR-071, FR-074-075, FR-079, FR-083-090; VSC-001-008. |
| `src/skills/dude-lint/lint.mjs` | One optional sources-document check beside the existing profile check; missing means no added sources, malformed/unsafe file fails, and lint never contacts sources. FR-042, FR-048-049. |
| `src/skills/dude-bundle-import/SKILL.md`, `docs/commands.md` | Add the import owner procedure/trigger and document the two-phase Settings behavior, read-only project inspection, direct configuration-write exception, accepted sources, and source-bound pack flow. No importer change. FR-004-025, FR-032-067, FR-070, FR-084-090. |
| Existing test/build files in Acceptance Coverage | Extend current fixtures/runners, build the UI then dogfood core, and update only affected production-byte pins. No new harness or dependency. FR-029, FR-031, FR-048, FR-067-069, FR-075-077, FR-079-090. |

### Verified Source Boundaries

These are current implementation facts, not capabilities already shipped by this feature:

- `resolvePackDir` first checks the named pack in the local library; `resolveCatalogDir` first checks the local library directory. Both do this before explicit `source`. `resolveSourceTree` uses a local source root in place or performs Git clone, with a fallback `git checkout --quiet <ref>`. This is the concrete reason for the precedence fix and ref validation.
- `SourceIdentity` is `{type: 'local', location}` or `{type: 'remote', repository, requested_ref, resolved_commit}`. A built-in local install records the real `library/packs` directory; an explicit local source records the source root containing `library/packs`. Match those two meanings deliberately rather than stripping arbitrary path suffixes.
- `prepareRefresh` passes its arguments to `stagePackFromSource` and writes the returned `sourceIdentity` to the next profile; it does not infer the original source from the installed entry. Canvas must choose and bind it.
- `cmdList` returns `name`, `installed`, `description`, and `use_cases`, validating each present pack's metadata. `packs.mjs` currently joins by name; `PackBinding` has no source selection. Both need the Phase B extensions.
- `validateCanonicalProfile` accepts only the root `installed` field. The manifest and its writer own `source_repo`/`source_ref`; the current manifest is `https://github.com/E-G-C/dude` at `main`. Neither existing metadata contract is a source-list store.
- `writeProfileDocumentAt` supplies the temporary-file/rename/restore pattern to follow. `lint.mjs` Check 2a reads and parses the current profile, which is the pattern for the new optional sources-document check.
- `buildRelease` emits the bundle manifest and an empty profile, not arbitrary project metadata. `classifyPath` leaves the new sources file project-owned. Keep those release/upgrade boundaries; no new release stub or upgrade writer is needed.
- All nine entries in the current `.dude/metadata/profile.md` record `/Users/eg/work/dude/library/packs`. On this Windows checkout that is Unlisted, not Local library, until an actual refresh changes recorded provenance.
- `settings.jsx` uses pack names in `getRowId`, selection, `rowFor`, and row/detail test hooks. Replace those UI identities together under FR-076, without changing installed membership or pack-operation names. Its details already use `packDetailHeader`, `packDetailBody`, and `packDetailFooter`; `styles.js` gives only the body vertical overflow and keeps header/footer from shrinking.
- `catalog-reader.mjs` calls `resolveCatalogDir` once, validates the resolved directory, then calls `cmdList` with that directory and `fetch: false`. `packs.mjs` removes the read's temporary acquisition root after confirmed completion/stop, retaining it if process-tree cleanup is unconfirmed. Preserve this lifetime boundary.
- `settings.jsx` declares `PAGE_SIZE = 5`; its snapshot replacement near line 95 resets the view before details commit, and its focus return near line 165 uses `focus({ preventScroll: true })`. `styles.js` has a sticky `packTableHeader`, a `packScroll` scroller, and a non-shrinking `packPager`. These are the concrete paging/continuity changes in item t, not a new list framework.
- `canvas-server.mjs` coalesces `/api/packs` through `instance.packRead`, with one controller and cancellation when the last reader disconnects. `use-canvas-data.js` listens for `workspace` and re-reads packs while Settings wants them; `needs-you` hints omit that read. `invalidatePacks` near line 185 currently invalidates only installed/catalog coverage.
- `parseFrontmatterScalars` in `src/skills/dude-engine/lib/feature-identity.mjs` requires exact frontmatter delimiters and rejects duplicate keys, but its optionless mode ignores non-scalar lines. The project reader must detect unsupported block/multiline values and decode strictly rather than treat that permissiveness as successful description parsing. `resolveMutationPath` in `workspace-paths.mjs` rejects linked components; `PACK_NAME_RE` in `profile.mjs` rejects `:`.
- The direct agent and skill inventories in this checkout contain no `dude-local-*` entries. The frozen mock therefore retains nine packs and no observed project rows; imported sample rows must be explicitly labeled.

### Intent Traceability

The refreshed 073 ledger is the only intent source. Prior artifacts supply still-applicable contracts, not new user intent.

| Refreshed 073 basis | Spec obligations | Plan realization |
| --- | --- | --- |
| Round-1 rejection and annotated sub-tabs; managed Phase A/B and verified round-2 adaptations | FR-001-004, FR-026-031, FR-068-069, FR-071-074 | Packs/About unchanged, phased Packs views, narrow View Dropdown and scrolling, visible send exclusion, one mock, focus/continuity rules. |
| Original GitHub/local agent and skill request; existing-workflow limits | FR-005-018 | Closed import request, source-shape bounds, focused/directory owner procedures, unchanged importer. |
| Phase A success and Definition Limits: literal permission and verified local results | FR-019-025, FR-087 | Two import responses, independently bound result, full path verification, honest terminal/host caveats, workspace hint and local Show in Installed. |
| Merged source-manager intent and managed built-ins/added-source direction | FR-032-049 | One shared source module/file, derived built-ins, validated direct add/remove, stale refusal and atomic save. |
| Several-source Available, explicit selected source, existing installed authority | FR-050-061, FR-067 | Bounded per-source reader, Compose exclusivity, optional pack binding, source-aware result verification, unchanged removal/default contracts. |
| User's local/source column or filter and Q2 disposition | FR-062-065, FR-076, FR-088 | Source-matched pack metadata, explicit source/type labels, row-backed non-source options including This project, AND filtering before paging, partial coverage. |
| Definition Limits: source content is data; separate 072/080 and deferred versions | FR-066, FR-070, FR-084-086 | Inert metadata and paths, install-time trust, no author/origin inference, no deferred product controls or engines. |
| Round-2 placement review and round-4 request to make documentation findable; Q3 disposition and answered Q6 delegating display to 080 | FR-075-078 | Fixed details order/single scroller, 080-only reserved Documentation position, visible default-Shown annotations and accessible mock-strip link to full planned frames. |
| Round-3 review in the owner's 2026-09-30T20:00:38Z log and its two annotated references asks for Add on top and a source table with details | FR-036, FR-052, FR-075-076, FR-079-083 | Retain round-4 top Add source dialog, source rows/details with server-projected installed matches, local Show packs, advisory Remove reasons with server refusal. |
| User's 2026-10-01 replies, answered Q5, and adopted Architect direction; 079 superseded | FR-084-090; US9; SC-015-017 | Phase A bounded project read and read-only rows, Applied-only Show in Installed, Name/Type/counts, 25-row paging, retained context by opaque key, and explicit departure approval. |

Q5 and Q6 are answered. Q3's placement disposition and Q4's public-GitHub-only decision are covered by the approved mock, not separate direct user answers. 079 is resolved and superseded; 080 retains documentation content/display beyond the reserved placement. Superseded 078 is not a second owner or dependency. Lifecycle numbers are capture chronology only.

## Request And Delivery Contract

FR-005-010, FR-020-021, FR-024. This import contract is carried forward unchanged.

Only these bodies are admitted by `POST /api/imports/request`:

```json
{"op":"prepare","importSource":"<literal source>"}
{"op":"submit","importSource":"<same literal source>","importReceipt":"<provider UUID>"}
```

Reject unknown fields, extra operations, root/destination overrides, commands, prompts, flags, tokens, and adaptation selections. Use existing `inputBytes`, closed `object` guards, and JSON-schema conventions. Introduce `requestImport` beside `requestPack`; do not reuse pack `operation` or `name`.

Prepare validates source shape, the joined workspace/session, current idle event, empty queue, no waiter, and no unreconciled capture/pack/import. Share the in-flight preparation exclusion too, including a racing capture queue read. Retain existing root-identity metadata checks; read no source, profile, catalog, or workspace document and start no fetch/process. Allocate only after the asynchronous queue check and synchronous boundary recheck.

The record has `kind: import`, a provider-generated handle, the exact binding below, monotonic `preparedAt`, idle event/lifecycle revision, send-started flag, prompt digest, send/observed message IDs, permission handle, and acknowledgment state. Use the same record/byte budgets; never evict unresolved receipts. A preparation expires lazily at `NEEDS_YOU_LIMITS.operationMs` (currently 5,000 ms), with `stale` and an import-specific expiry reason. Expiry proves no send only for that exact still-prepared receipt.

Submit matches the complete source/receipt binding and marks the receipt used before any asynchronous step. Recheck root/session, idle event, lifecycle, queue, waiters, and shared exclusion; then make one immediate foreground send. A pre-send refusal burns the submitted receipt but records known-unsent status. Never return it to prepared.

The fixed handoff begins exactly:

```text
Dude Canvas explicit artifact import request in this joined workspace/session.
```

Its fixed instructions direct Dude to `dude-bundle-import`, identify the request as not consent, require the permission and result procedures below, and label the final JSON as literal data, never routing or tool instructions. That final line has exactly:

```json
{"receiptId":"<provider UUID>","owner":"dude","importSource":"<literal source>","workspaceId":"<workspace hash>","sessionId":"<joined session ID>","providerGeneration":"<provider UUID>"}
```

Bind delivery to both the returned message ID and the matching observed `user.message` with `delivery: idle`, as `reconcileSend` already does. Admission alone remains delivery-unconfirmed. Timeout, missing/mismatched IDs, non-idle delivery, abort, or possible-delivery failure becomes explicit import uncertainty; never enqueue or replay. A lost prepare response is known-unsent; a new user request may obtain a new receipt after the old preparation expires. A lost submit response stays uncertain unless the exact provider record proves that preparation was never consumed.

Only kind-agnostic mechanics take `pack|import`: `idleAction`, `packIdleBoundary`, `reconcileSend`, prepared expiry, and `onEvent`. Preserve capture's separate through-waiter behavior. Keep request bodies, source/pack validation, handoff prompts, result parsers, and acknowledgment procedures separate; do not introduce a general command router or shared mutation framework.

## HTTP And Source Bounds

FR-005-009, FR-017-018, FR-022-023; SC-003, SC-008.

Mirror the pack route's guards: exact raw URL with no query/suffix/normalization aliases, POST only, trusted loopback Host/fetch metadata, an explicit same Origin, JSON content type, strict UTF-8 decoding, and the streamed 128 KiB body cap. Bind to `instance.readInput.root`, the joined provider, and the Canvas lifetime. Wrong method/nonexact route is unallowlisted; foreign origin, media type, oversized body, invalid shape, and identity mismatch use existing explicit HTTP refusals. Do not extend the opaque Review-origin exception.

Validate `importSource` in the provider, with equivalent frontend feedback: primitive string, nonblank, already trimmed, valid UTF-8, at most 2,048 bytes, and no line breaks or control characters. The UI may trim surrounding whitespace before prepare, but the exact resulting value must match at submit and acknowledgment. Do not truncate or reinterpret it.

For URL-shaped input, require `https:` and exactly `github.com` or `raw.githubusercontent.com`; reject credentials, explicit ports (including `:443`), queries, fragments, backslashes, and encoded slash/backslash separators. Inspect the original authority as well as parsed URL fields, because URL parsing can hide an explicit default port. Keep Windows drive/UNC and other local paths opaque; a drive colon must not turn a local path into a URL. Reject a forbidden URL as a URL, not as a local-path fallback.

Helper text can name GitHub `blob/<ref>/<file>`, `tree/<ref>/<subtree>`, and raw GitHub file URLs, plus local file or directory paths. The import request provider does no existence, type, content, Git, or network lookup. `import.mjs` remains the real validator of file/tree shape, refs, redirects, acquisition budgets, naming, licensing, collisions, links, source identity, and destination freshness. It already refuses unsupported remote forms and slash-bearing refs. Canvas adds neither authentication/private-repository support nor a local path picker. Pack-source refs have their own bounded rule below; do not widen import refs to match it.

## Dude's Import And Permission Procedure

FR-011-019, FR-024-025.

Add **Canvas Import Requests And Results** to the authoritative import `SKILL.md` and the description trigger `a Dude Canvas explicit artifact import request`. Document the exact binding and procedure below; do not change `import.mjs` or its directory modules.

Chat has no separate plan display: the literal produced by `renderDirectoryPlanConfirmation` authorizes the complete reviewed plan, including every `replace_paths` entry. In `directory-import.mjs`, `plan_sha256` binds every output's `destination_state`, and apply preflight refuses drift. Canvas must show, without truncation, everything consequential that the chat literal authorizes.

1. Analyze the literal source through existing focused `analyze` or guarded `analyze-directory`/`plan-directory` in the joined destination workspace. Pass the source as one literal argument, never a command fragment. The directory can contain several artifact groups; users do not choose the workflow with a toggle.
2. Build targets/disclosures using the mapping below. Preserve source attribution without equating repository owner and artifact author. If a required license/adaptation decision is not covered by the default focused flow, do not invent one or add Canvas choices; explain that the user must decline and continue in chat.
3. Run the permission fit check before publication or apply. On failure, publish no permission, change nothing, and acknowledge terminal `unavailable/none` with chat guidance. Keep Blocked directories, unsupported sources, and unsafe destinations refused before any change. Do not split an import, omit details, import dependencies, or widen engine limits to make it fit.
4. Publish the bound permission only after those checks pass. Recognize consent or decline through ordinary `canvas_response` acknowledgment. On consent, require the complete echoed targets/revisions to match: every directory revision equals `sha256:<plan_sha256>` for the current reviewed plan; focused revisions use the string encoding below while the importer retains its full-state checks. Recheck source, destination, and plan freshness through the unchanged importer. Use `apply-directory --plan ... --confirm confirm-import` for Clean or `--confirm confirm-warned-import:<plan_sha256>` for Warned, supplying the same literal source. For focused import, use existing `apply --plan` with the exact reviewed `destinationDecision` and any required structured `license_disposition`. Changed impact requires a fresh request, preview, and literal confirmation, never a forced overwrite.

Run ordinary lint/verification after apply, then acknowledge the separate import result. Refusals before permission also need that terminal acknowledgment.

| Permission field | Directory import | Focused import |
| --- | --- | --- |
| Targets | Exactly one target for each entry of `plan.groups`, in plan order. Confirmation count equals the artifact-group count. | One target for each written path: main file plus the reviewed `LICENSE` or `NOTICE` sibling when selected. Include it in permission and in the result from `applyPlan`'s `writtenSiblings`. |
| Target text | Kind; final `dude-local-*` name; destination (agent file and `.support/` folder when used, or skill folder); `N files: C new, R replaced`; every replaced path relative to its displayed destination. Counts include companions/shared notices, derived from `destination_state` and `replace_paths`. | Exact destination file, its analyzed missing/existing-file state, and reviewed create/replace decision. |
| Target `revision` | `sha256:<plan_sha256>` on every target. | `missing` or `sha256:<64 lowercase hex>` from the analyzed regular-file digest; never the state object. |
| Consequences | Clean/Warned; every Warned flagged path and category, distinguishing static/advisory findings; count of distinct unreviewed/unbatched files; fixed lines below. | Default adaptations, license preservation, unresolved sibling/dependency references, replacement consequences, and existing focused failure limits; no transactional rollback promise. |
| Eligibility | Literal `source.input`, plus `resolved_commit` for GitHub sources. | Literal source and the focused report's existing eligibility. |

Directory consequences end exactly with:

```text
Nothing is executed.
Apply is all-or-nothing with rollback.
Replaced files are overwritten.
```

These lines describe the existing directory transaction, not crash-proof recovery; retain explicit uncertainty when recovery fails.

The published `permission` uses `owner: dude`, `scope: {kind: session}`, `requestRef: import:<receiptId>`, `source: {kind: session, revision: <providerGeneration>}`, a fresh request revision, and `fields.operation: import:file` or `import:directory`. Bind it to the live import receipt as `pack:` is bound today: matching Dude owner, session scope, generation, unreconciled sent receipt, and a closed operation. The import must not block its own permission publication, response, or ordinary acknowledgment. It cannot bind to a capture, pack, another generation, or arbitrary permission.

Use the existing typed confirmation and consent checkbox:

| Reviewed case | Canvas confirmation | Existing owner application |
| --- | --- | --- |
| Focused agent or skill, default adaptations | `IMPORT AGENT <dude-local-name>` or `IMPORT SKILL <dude-local-name>` | Reviewed `destinationDecision` and required structured `license_disposition`; `apply --plan`. |
| Clean directory | `IMPORT DIRECTORY <n> ARTIFACTS` | `apply-directory --plan ... --confirm confirm-import`. |
| Warned directory | `IMPORT WITH WARNINGS <n> ARTIFACTS` | After consent for the displayed plan hash, pass the engine's `confirm-warned-import:<plan_sha256>`. |
| Blocked directory | No apply confirmation | Existing diagnostic and terminal no-change result. |

Warned wording, default-only adaptation, and the possible new-session caveat remain approval-visible. The checkbox does not accept unseen categories, resolve license ambiguity, or authorize transitive imports.

### Permission Fit

`parseRequest` in `needs-you.mjs` permits 1-12 targets, target text of at most 2,048 UTF-8 bytes, and consequences, eligibility, and confirmation of at most 4,096 bytes each. Keep its other identifier/request/body bounds unchanged. Directory targets count groups, not output files; focused targets count written paths. If any field does not fit, or there are more than 12 groups/focused targets, publish no permission, change nothing, and close with `unavailable/none` and chat guidance. Never truncate, omit, or split. FR-013-017.

## Import Result Acknowledgment

FR-020-025, FR-087; SC-003-005, SC-016.

Add one closed `recognizes: import_result` branch to the existing `dude_needs_you` acknowledgment schema/dispatcher. Its exact six-field request binding is followed by these result fields; no pack name, operation, profile/source reread, generic human scope, or engine envelope field:

```json
{
  "op": "acknowledge",
  "acknowledgment": {
    "recognizes": "import_result",
    "receiptId": "<provider UUID>",
    "owner": "dude",
    "importSource": "<exact submitted source>",
    "workspaceId": "<workspace hash>",
    "sessionId": "<joined session ID>",
    "providerGeneration": "<provider UUID>",
    "outcome": "applied",
    "mutation": "applied",
    "written": ["<verified canonical local file path>"],
    "uncertain": [],
    "note": "<observed import and verification result>"
  }
}
```

Placeholders describe the contract, not an observed import. Require all fields and reject extras. Reuse pack outcome/mutation vocabulary and applicable `parsePackAcknowledgment` invariants without changing pack behavior:

| Outcome | Mutation and path invariants |
| --- | --- |
| `applied` | `applied`; nonempty complete `written`; empty `uncertain`; successful owner verification and provider path checks. |
| `declined` | `none`; both arrays empty; actual user decline, never an owner refusal relabeled as a user choice. |
| `failed` | `none`, `restored`, or `applied`; empty `uncertain`. No-change/restored results have empty `written`; known partial/completed writes use `mutation: applied` and their reported paths, never an Applied outcome. |
| `unavailable` or `stale` | `none`; both arrays empty. Only when no mutation occurred; changed/unavailable basis after possible writes is uncertainty. |
| `uncertain` | `uncertain`; arrays name only known writes and uncertain paths. Both can be empty for uncertain delivery with no known affected file. |

`mutation: uncertain` requires `outcome: uncertain` in both directions. `restored` requires an actual failure and verified restoration, not an unchanged-looking file or error string. Paths are unique canonical workspace-relative strings bounded by existing body/retention limits, not the permission target count. Reject contradictory or duplicate classifications; never truncate. An uncertain recovery-directory path is reported data, not an imported artifact or actionable link.

Validate the exact live owner/session/generation/receipt/source and unique tool-call identity before consuming acknowledgment. Applied requires reconciled delivery, not admission or send uncertainty. Mirror `checkPackPermission`: reject Applied while linked permission is waiting or its response declined/deferred. This retains the cooperative-owner model; the owner procedure still requires literal consent before writing.

Add this provider-local predicate in `needs-you.mjs`:

```js
function isLocalImportPath(p) {
  return classifyPath(p) === TIER.LOCAL
    || /^\.github\/agents\/dude-local-[^/]+\.support\/.+$/.test(p);
}
```

For Applied, require that predicate, then use `resolveMutationPath` against the bound root and a regular non-link file check, retaining the existing single-link convention. Require canonical relative spelling before classification/resolution. Do not require a sibling agent file; it adds no namespace protection. Leave `classifyPath` and `src/skills/dude-engine/lib/ownership.mjs` unchanged because they also serve lint and upgrade. Reject missing files, directories, linked ancestors/targets, non-local paths, escapes, root drift, and stale binding. Validate the full set before recording success; refusal must not consume another receipt. The owner can report an evidence-backed non-success result for the same request.

The check proves location/existence at acknowledgment, not authorship, content safety, command execution from a receipt, or immediate host discovery. Freeze the result in this provider generation; do not reread imported paths on `read()`/`refresh()`, add watchers, or infer success from later membership/content. Provider/root replacement ends authority.

After recording an import acknowledgment, publish `workspace` when `mutation !== 'none'`, otherwise `needs-you`. The existing listener re-reads `/api/packs`, including the separate project scan. This scan inspects current workspace facts; it does not revalidate or manufacture the import outcome. Never construct rows from `written` or `uncertain`; `written` supplies only the Applied result's local navigation target.

### Map Existing Engine Results Without Changing Them

Dude, not the request route, interprets command output and performs normal verification:

| Existing evidence | Import acknowledgment |
| --- | --- |
| Successful focused `apply`, `[OK] wrote <path>`, and verification | `applied/applied`, including the primary path and every `writtenSiblings` path from `applyPlan`. |
| Focused `PartialApplyError`, or apply success followed by failed verification | `failed/applied` for established writes; `uncertain/uncertain` if full resulting state is unestablished. Completed writes are already reported by the CLI before the failure diagnostic. |
| Validated directory `status: installed` | Map `written_paths` to `written`; Applied only after owner verification. |
| Validated directory `status: rolled-back` | `failed/restored`, empty path arrays; note actual restored/unchanged paths and failure. |
| Validated directory `status: recovery-failed` | `uncertain/uncertain`; preserve `uncertain_paths`, including retained recovery material; never call it restored. |

Use `validateDirectoryImportResult` from `src/skills/dude-bundle-import/lib/directory-import.mjs` and match its `plan_sha256` to the reviewed plan. Do not treat a nonzero focused exit without an `[OK] wrote` line as proof of no mutation: a write can fail before it is reported. Compare reviewed targets or report uncertainty.

Before apply, use `failed/none` for a rejected source or Blocked directory, `unavailable/none` for unavailable capability/unrepresentable preview, and `stale/none` for changed reviewed impact. A user decline is `declined/none`. Every admitted request needs a terminal result to release its exclusion without replay.

### Provider Lifecycle Integration

Audit the discriminated record union, schema, dispatcher, errors, export, and existing loops. FR-006-010, FR-020-025, FR-087.

| Surface | Import handling |
| --- | --- |
| `idleAction`, `packIdleBoundary`, capture admission | Capture/pack/import exclusion in both directions, including preparations and asynchronous queue races; bound import permission remains usable. |
| Prepared expiry, `reconcileSend`, `onEvent` | Expire only unsubmitted preparations; observe exact delivery; retire stale preparations and retain possible-send uncertainty on abort/error. |
| `read` | Separate `importRequests` collection with `importReceipt`, `importSource`, phase/reason, permission request, bound receipt/acknowledgment, and verified-result flag. Failed import scopes are session scope, never capture receipts. |
| `refresh` | Retain root checks and preparation expiry, then skip acknowledged imports before pack rereads/generic snapshots. No post-result import path reads. |
| `dispose` and generic `acknowledge` | End import authority explicitly; never restore it from files. Generic human/capture acknowledgment rejects import records, as it rejects packs. |

Phase A leaves `readPacks`, pack `rereadPack`, `packReadRevision`, `checkPackResult`, profile refresh, and permission/result distinction unchanged. The import branch uses the existing public hint semantics; Phase B extends only selected-source handling below. Project rows never enter pack authority or freshness.

## Project Agents And Skills In Installed

FR-004, FR-075-078, FR-084-090; US9; SC-015-017.

### Local Read And Coverage

Create `src/extensions/dude/lib/project-artifacts.mjs` with `readProjectArtifacts(root, signal)`. It lists every `.github/agents/dude-local-*.agent.md` entry and `.github/skills/dude-local-*/` directory present, imported through Canvas or not. Read the skill entrypoint `SKILL.md`; include an agent's matching `.support/` companions in its files. Never inspect pack-owned/core entries, walk outside these folders, fetch source content, or launch a process.

Scan asynchronously, respecting the supplied signal throughout traversal and reads. Call `resolveMutationPath` once per artifact root, not for every descendant. Use `lstat` and follow no links. Refuse unsafe collection paths; a linked artifact root is still listed by its directory-entry identity as "Linked; not read", without opening it. Descendant links are not traversed or read, and their reason remains visible instead of claiming complete readable files. Do not modify the shared path resolver or importer.

| Bound | Read behavior |
| --- | --- |
| 256 artifacts | Detect a 257th before returning a complete list. Return project coverage `unavailable` with a limit reason and no partial `items`. Missing artifact folders or no matching entries are a known empty read, not a failure. |
| First 8 KiB per entrypoint | Read only this prefix, not the whole file followed by slicing. A closing frontmatter delimiter beyond the prefix is unavailable metadata, not permission to read further or silently truncate a description. |
| 128 files and depth 12 per artifact | Count the entrypoint and companions within the artifact's bound. Exceeding the file count or depth withholds only that row's files and reports why; other rows remain. Do not show a partial count as a complete file count. |

In `canvas-server.mjs`, attach `project: {coverage, items}` to the existing `/api/packs` response inside its coalesced read, using the same combined instance/controller signal. Coalesce the full pack-plus-project operation, not a separate scan per HTTP subscriber. Preserve last-reader cancellation, root/lifetime checks, and rejection of abandoned results. A project-read failure becomes its own coverage reason and does not discard readable installed packs. Leave `packs.mjs`, `readPacks`, `rereadPack`, `packReadRevision`, and `checkPackResult` unchanged in Phase A.

Extend `invalidatePacks` in `use-canvas-data.js` near line 185 to invalidate `project.coverage` as well as installed/catalog coverage, retaining previous rows only as last-read inspection, never as current authority. A pending or failed read must not leave project totals or Show in Installed actionable as if current. In Phase A the combined response still waits for the default-catalog read: up to 5,000 ms acquisition plus 2,000 ms cleanup confirmation. This is eventual appearance without Reload, not an instantaneous guarantee. Phase B's installed/project refresh must not turn into an automatic multi-source discovery read.

### Row Identity, Metadata, And Details

Use keys `project:agent:<name>` and `project:skill:<name>`, where Name is the path identity such as `dude-local-x`, not declared frontmatter `name`. The colon fails the existing `PACK_NAME_RE`; these are UI identities, and the server never resolves a submitted key into a path. Preserve pack order, then sort project rows by name and type. Pack membership and all operation eligibility still come only from the profile and live pack requests; project keys never enter Available exclusion, namespace checks, request binding/freshness, or source-removal blockers.

Installed's first column is Name, then Type (Pack | Agent | Skill), then Use cases, with Source added in Phase B. Available's first column is also Name, but it does not gain a Type filter or project rows. For a project row, Use cases is "Not applicable": it matches no selected use case and never contributes to incomplete tag coverage. Treat it separately from a pack's missing `use_cases`, not as unavailable tags.

Installed is named "Installed", not "Installed packs". Its tab/View count includes packs plus project rows only when installed and project coverage are both current/known-empty; otherwise show "?". After project-read failure, the count/range text says "known" and shows the reason while installed packs remain inspectable. Phase B's Source filter adds "This project" only when a project row exists, with no invented catalog/source entry and no Type filter.

Use `parseFrontmatterScalars` from `feature-identity.mjs` on the 8 KiB prefix for description and declared name. Decode UTF-8 strictly and preserve detection of a BOM. Its optionless parser is not a full YAML validator: detect block or multiline values rather than accepting `|`/`>` as descriptions or ignoring continuation lines. A BOM, missing or late closing delimiter, block/multiline value, duplicate key, bad UTF-8, missing usable description, or read error produces "Description unavailable" with a specific reason, never "No description". Do not add a YAML dependency or change the shared parser. A failed declared-name read is unavailable, not a copy of the path identity.

Reuse the current detail pane/overlay and FR-075 order: heading with "This project" scope; any coverage notice; description; a read-only note instead of actions; facts Type, Location, declared name, file count; Files including agent companions; possible-new-session caveat. Use plain text children for all values and paths. No Remove, Open file, links, HTML, documentation content, or executable content. Reserve the Documentation position directly after facts without rendering product markup there.

### Applied Result Navigation

Only Applied renders Show in Installed. Its target is the first artifact named in the ordered `written` array: an agent entrypoint maps to that agent, a path below `.github/agents/dude-local-<name>.support/` maps to its agent, and a path below `.github/skills/dude-local-<name>/` maps to its skill. This lookup selects only an existing row in the current project projection; it creates no row and grants no authority.

Use the current result binding and current project coverage to derive these disabled reasons, in order: "Reading Installed..." while the read is pending; "Project agents and skills could not be read" when project coverage is unavailable; "Not in Installed now" when the target is absent. All non-Applied outcomes offer nothing, even if matching rows exist.

On activation, switch locally to Installed, reset Use case and any Source filter, compute the target's page at 25 rows, select its opaque key, and focus details Close. Scroll the selected row into view under item t so focus return will also reveal it. Do not request a read or operation from this control. The mutation-dependent hint in Import Result Acknowledgment supplies the refresh; later idle and window-focus reads must preserve the selection under FR-090 rather than undo this navigation.

## Sources Model And Persistence

FR-032-042, FR-048-049, FR-062-063, FR-070, FR-076, FR-079-080.

Derive built-ins on every pack/source read; never write them:

| Built-in | Derivation and use |
| --- | --- |
| Local library | Current workspace `library/packs` when it exists; real library path identifies it. Default discovery uses this catalog when present. |
| Bundle upstream | Manifest `source_repo` @ `source_ref`; read-only, "Managed by bundle upgrade". In this dev bundle show `https://github.com/E-G-C/dude` @ `main` and "Not read while library/packs exists". A released install with no library uses its recorded upstream/ref, including the existing `latest` channel behavior. |

Save only added sources in `.dude/metadata/pack-sources.md`, with exactly one fenced JSON block:

```json
{"sources":[{"type":"remote","repository":"https://github.com/acme/dude-packs","ref":"main"},{"type":"local","location":"../team-packs"}]}
```

The example is illustrative configuration, not a source to add during definition or tests. The closed root has only `sources`. Remote entries have only `type`, `repository`, and `ref`; local entries only `type` and `location`. The request's omitted remote ref becomes `main` before serialization. Add no aliases, priorities, enable flags, cached counts, commits, IDs, timestamps, or version field.

Use Compose's `type`/`repository`/`location` vocabulary. Configured `ref` is the tracked ref; it maps to Compose's source/ref arguments, not a new profile field. Compose records `requested_ref` and `resolved_commit` for the actual operation. The source file retains its tracked ref when the permission procedure pins an application to a resolved commit.

Identity is the normalized GitHub repository URL, independent of ref, or the local source root's real path. Derive a bounded opaque provider `key` for every source, including the built-ins; use it for source rows and added-source requests, never a display name. The built-in local key uses the real library path; an added local key uses its real source root. Pack rows retain separate opaque keys. Persist no identity map. Normalize GitHub owner/repository casing for identity and derive the human name from owner/repository. Resolve relative local locations against the workspace root, canonicalize at add, and derive the label from the folder name. Keep source identity distinct from catalog contents/availability; losing access must not silently drop a saved entry. Do not rewrite old profile sources to make them match. Ref changes are configuration changes, not a second source or a priority.

Accept only a source root containing `library/packs/<name>/pack.md`, the layout Compose reads. A local folder must exist and contain `library/packs/`; a bare catalog folder gets "Choose the folder that contains library/packs." Reject the workspace's own library through normalized/real identity, and refuse duplicate configured or built-in identities. A valid empty catalog reports zero packs; a missing catalog and invalid metadata are refusals, not zero.

Missing file means `{sources:[]}` with revision `absent`. An existing file's `sourcesRevision` is `sha256:<raw file bytes>`, including its surrounding Markdown. Wrong type, unsafe path, multiple JSON blocks, unknown fields, invalid entries, or too many entries is unavailable, never an empty default. Share the strict parser with lint. Lint validates document syntax/shape and safe file access only; it must not require a machine-specific folder or network source to be reachable.

The file is committed project configuration, comparable to cargo's `.cargo/config.toml` registries and uv's `[[tool.uv.index]]`. Releases ship no file; upgrades leave it alone. Do not put it in the upgrade-owned bundle manifest or the profile, whose validator accepts only `installed`. Add one optional parse check to `src/skills/dude-lint/lint.mjs` and fixtures in its existing `lint.test.mjs`. No source availability cache or new upgrade/release subsystem is needed.

## Sources Route And Validation

FR-035-049, FR-059, FR-066, FR-070, FR-082-083.

Add exact `POST /api/packs/sources`, using the pack route's Host/fetch metadata, exact raw path, explicit same-Origin, POST/JSON, strict UTF-8, streamed 128 KiB body, joined-root, and lifetime guards. Keep errors within the existing explicit status/code conventions. Its only bodies are:

```json
{"op":"add","location":"<GitHub repository URL or local source root>","ref":"<optional remote ref>","sourcesRevision":"<current revision or absent>"}
{"op":"remove","key":"<current added-source key>","sourcesRevision":"<current revision>"}
```

`ref` is optional only in the add body. Reject every extra field, including caller root/output paths, source identities, commands, flags, or credentials. Remove accepts neither location nor ref; its key must resolve to one current added entry, never a built-in. These are direct configuration actions, not prepare/submit receipts or a new Needs you permission class. Do not add session-idle consent gates to ordinary source setup; source-list drift instead invalidates affected pack requests through freshness checks.

For add:

1. Parse the current document and check the submitted revision, limit, and normalized duplicate identity before acquisition. Validate a trimmed single-line Location; recognize Windows drive/UNC paths as local.
2. A remote must be exactly a public `https://github.com/<owner>/<repo>` form. Reject credentials, all explicit ports including `:443`, query/fragment, backslashes, encoded slash/backslash, extra file/tree path components, unsupported hosts/transports, and URL-shaped input masquerading as a path. Inspect the raw authority before URL normalization. This excludes `ext::`, `file:`, SSH, and Git option/transport injection through Location.
3. Require ref `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$` and no `..`. Reject leading `-`; Compose's clone fallback runs `git checkout` with this argument. Ref belongs only to remote entries; reject a supplied nonempty local ref rather than silently ignore it.
4. Validate a local root/layout and real identity. Then run one candidate catalog read, with the existing 5,000 ms deadline and whole-child-tree termination/cleanup. Git must never prompt or obtain private-source access via an interactive/ambient credential fallback; use reader-local noninteractive settings, including `GIT_TERMINAL_PROMPT=0`, without changing user Git configuration. Private/unreachable sources fail visibly.
5. Require all candidate pack metadata to parse and retain the count. Recheck root/lifetime, candidate identity, and the full sources preimage after the asynchronous read and immediately before commit. Failure writes no project configuration.
6. Serialize and write only `.dude/metadata/pack-sources.md`. Return the saved source's opaque `key`, validated pack count, and new sources revision. Close Add and announce Added/count in the outside live status, then perform one post-mutation catalog read. After that snapshot commits, select the returned source key and focus details Close only if Sources is still active and the row exists. Below 1100 px, open the details overlay only then, never over the Add dialog or before the post-add read. Validation installs/runs no pack and grants no later installation permission.

For remove, freshly compare the source against `installed.<name>.source` and live provider requests before writing. Include an in-progress preparation, an unsubmitted current receipt, and every sent request still requiring reconciliation. Name the blocking packs/operations. Recheck at the write boundary so a racing pack preparation cannot lose its source; use the existing provider's preparation state, not a new persisted lock. If installed authority or the binding cannot be established, refuse rather than infer that the source is unused. Successful removal deletes only the entry and triggers one read, like `brew untap`; it does not uninstall.

The details' disabled Remove reason combines the server-projected installed matches, key-bound pack requests, and this tab's current attempt. It is advisory: another tab's mid-prepare request is not visible in that projection. Do not add a state feed to make the reason authoritative. Keep the server's final check above; a refusal names every blocker inside the confirmation dialog and updates the visible reason rather than placing it behind the details overlay. Catalog status alone never blocks Remove: it remains usable before Reload and for an unavailable source when the normal ownership/use checks permit it.

Use a narrowly scoped atomic writer in the shared module: validate the contained destination with `resolveMutationPath`, compare raw preimage/revision, write a sibling temporary, and rename using `writeProfileDocumentAt`'s backup/restore pattern. Serialize in-process writes through this one owner and recheck the preimage immediately before replacement. On caught failure, restore/retain the old bytes and report failure; do not promise crash-proof recovery or immunity to a hostile concurrent filesystem writer. Missing-file creation is expected-missing; stale writes are refused, never merged or retried automatically. A lost HTTP response requires a fresh read, not blind replay.

This is the first Canvas configuration write outside Dude. It authorizes this one file only: no write to manifest, profile, packs, imported artifacts, user answers, tasks, or another setting. A refusal may use the existing owned temporary acquisition root, but changes no project configuration. No broad file-write or command endpoint is introduced.

## Multi-Source Catalog And Compose Fix

FR-033, FR-044, FR-050-055, FR-062, FR-065, FR-067, FR-076, FR-079-082, FR-084-088.

Keep `GET /api/packs` as the read projection, including Phase A's separate `project: {coverage, items}`. Phase B adds built-ins, added entries and `sourcesRevision`, opaque source keys, per-source status/count, current installed authority, and source-qualified catalog rows. Have `packs.mjs` project each installed pack row's matched source key server-side using the Source-column matcher: Local library requires its recorded path to equal the real `library/packs`; an added local folder matches its real root; GitHub matches the normalized repository, ignoring ref. Group those matches for Installed from this source, and retain Unlisted/Unknown separately. Never infer a match from pack name or let the browser implement another matcher. Unreadable authority is not zero installed. Project rows remain outside this matching and source-removal authority. Do not add a browser-supplied repository/ref override or a generic reader command.

`catalog-reader.mjs` gains one fixed source-key mode. Configured source details come from the shared parser's validated sources document, never directly from an HTTP body. For an add probe before persistence, use a validated prospective sources document inside that reader's already-owned OS temporary root; the server chooses its fixed filename and key. The same parser/read mode evaluates it without touching the real sources file. This is temporary validation input, not another persistent draft or live authority.

Reuse `packs.mjs`'s existing helper launch, isolated temporary roots, IPC result, 5,000 ms `READ_DEADLINE_MS`, and `stopTree` process cleanup. The current `STOP_CONFIRM_MS` is 2,000 ms: deadline initiates termination, and cleanup confirmation can take that additional bounded interval. Keep the root if termination is unconfirmed and report the existing cleanup failure; never delete beneath a live Git child or call parent exit sufficient proof. Set noninteractive Git behavior for every source read. Each per-source helper resolves the source once and passes only the already-resolved directory to `cmdList` as `{ root, library: catalogDir, fetch: false }`, never `source` or `ref`, so the explicit-source change cannot trigger a second clone.

Read the default catalog plus each added source once per explicit discovery request, with a pool of at most four active readers total. The built-in upstream is display-only when the local library is the default; it is not an extra remote read. Preserve per-source failures, counts, and metadata rather than failing the whole list. Give every row one opaque key: Available derives it from source plus pack name; Installed derives it from the recorded pack. Use that key for row identity, selection, paging, focus return, and test hooks, never the pack name alone. Update the name-based row lookups and identity handoffs in `settings.jsx:115,134-135,180-185,191,258-270,302` and `use-canvas-data.js:65,477-484`, plus the server join in `packs.mjs:359-367`, to use the opaque key throughout their callers. Keep it distinct from source keys and pack-operation names; derive it without another persistent identity map. Never merge duplicate available names or let React/detail selection collapse them. Installed-name exclusion still applies across all available rows.

Descriptions/use cases for installed packs use the source matching recorded identity. If that source is known but its metadata is unavailable, keep those values unavailable. Only unmatched recorded sources use today's by-name default-catalog lookup. Project descriptions instead come from the local read above, with Use cases "Not applicable". Do not equate metadata provenance with installed-byte verification or add an author field.

In Phase B, default and added catalog discovery runs only on Reload and once after successful add/remove. Opening Settings or a sub-tab, changing a filter/page, Show packs, Show in Installed, ordinary event refresh, visibility/focus changes, or a permission reply must not fetch catalogs. Before the first Reload, Available shows "?" and Sources rows come from configuration with Status "Not read" and no counts; Show packs is disabled, Add/Remove retain their normal validation/use guards, and Installed still lists the profile plus readable project rows. Offer Reload without treating unread coverage as empty. This deliberately replaces 063's automatic default-catalog read, which Phase A retains. Keep only the existing tab-local snapshot for browsing, never a persisted cache. Operation-specific fresh reads remain part of explicit install/refresh admission and owner verification, not automatic synchronization.

Keep installed-only reconciliation separate: use `readPacks(..., {catalog:false})` at result/removal boundaries, project its agreeing membership to the UI, and re-filter already read catalog rows after installation. Do not refetch every source merely to remove installed names from Available. Unknown/unreadable installed authority cannot establish Available membership. Automatic `/api/packs` workspace-hint reads in Phase B combine installed-state and local project inspection while preserving already read catalog rows; the project scan never broadens the explicit-discovery trigger.

In Compose, change only explicit-source resolution:

- When `source` is supplied, `resolvePackDir` and `resolveCatalogDir` resolve only that source root/ref. Skip local-library precedence and never fall back to the manifest or another catalog, including on missing pack/catalog or fetch failure.
- Calls without `--source` keep today's behavior, including local catalog precedence, existing manifest/ref fallback, and `--no-fetch`. Do not reinterpret `--library`, change pack formats, or make ordinary CLI calls enumerate the new source file.
- An explicit local source stays local and uses the one supported root layout. An explicit remote obeys existing acquisition semantics; no-fetch never authorizes a remote fetch or fallback.

Update Compose's documentation of `--source`. The existing test named `remote source selection preserves local authority, explicit inputs, manifest fallback, and no-fetch` explicitly expects an unusable explicit source to lose to the local pack for add/refresh; replace only that now-superseded expectation. Keep its no-override coverage and add/list/refresh tests proving explicit selection wins and never falls back.

## Source Binding In Pack Requests

FR-046, FR-054-061, FR-066-067.

Extend `PackBinding` with optional `catalogSource`, omitted entirely for the default catalog. Keep the existing 063 request bodies, exact handoff text/final JSON, and `pack_result` acknowledgment byte-identical on that default path; do not emit `null` or an empty extra field. Imports retain their separate contract.

Install accepts an optional `source` key in both prepare and submit; when present, it must identify an entry in the freshly validated sources file, and submit must match the prepared choice. It accepts no repository/path/ref override. Refresh accepts no browser source choice: the provider selects the added source matching the installed record, else default. Remove rejects a source and needs only recorded installed authority.

The added-source install bodies are exactly:

```json
{"op":"prepare","operation":"install","name":"<exact pack name>","source":"<configured source key>"}
{"op":"submit","operation":"install","name":"<exact pack name>","source":"<same source key>","packReceipt":"<provider UUID>"}
```

For an added-source binding, use one closed, provider-produced value:

```json
{"catalogSource":{"key":"<derived source key>","sourcesRevision":"<raw sources revision>","source":{"type":"remote","repository":"<configured normalized URL>","ref":"<configured tracked ref>"}}}
```

The alternative `source` value is exactly `{type:"local",location:"<validated source root>"}`. This is transient binding data, not another store or a browser-authorized override. Freeze it in the receipt and compare the complete value on submit, permission association, result echo, and frontend reconciliation. The provider's internal basis covers the sources-file revision and chosen catalog inputs even when the public binding is omitted for default use.

Refresh matches by normalized repository URL or real local root, not by `requested_ref`: the existing confirmed remote apply can record a pinned commit there, while the configured file retains the branch/ref to track on the next refresh. Default-local matching uses the library path; explicit added-local matching uses its containing root, as Compose records them. No by-name heuristic supplies source identity.

Extend source-aware `packReadRevision`, catalog input checks, `packBasis`, prepare/submit, and their synchronous post-queue rechecks. Revalidate the sources file, selected entry, local catalog metadata/root, installed profile, and workspace identity. The owner retains actual remote commit/target freshness at preview and apply. An unavailable selected source is a refusal; default selection for an unmatched installed source is explicit policy, not a failure fallback.

For added sources only, the fixed pack handoff retains its current prefix and includes `catalogSource` in the final literal-data binding. Tell Dude to use exactly the bound `--source` and `--ref` selection, with no alternate source, `--library`, `--force`, or fallback. Keep the existing operation/`--envelope` invocation. For remote application, the existing permission procedure pins `--ref` to the reviewed `resolved_commit`; the configured ref, reviewed commit, and actual applied identity remain visible and bound rather than silently following a moving branch.

Update **Canvas Pack Requests And Results** in Compose `SKILL.md`:

1. Resolve the bound source and preview the existing install or refresh impact. The first permission target names source, source type, configured ref where relevant, resolved commit, and "Third-party source" for added sources outside the built-in identity. For local folders, state that a remote commit is not applicable; do not invent one.
2. For refresh, compare recorded and selected identity and print `Source changes: A -> B` whenever they differ, including an Unlisted local path changing to Local library. Preserve complete file change sets, overwrite warnings, required-tool refusals, and literal confirmation.
3. Check sources-file and chosen-source freshness again before apply, alongside the current profile/targets. Keep exact preview/commit pinning and no-force, caught-failure restoration, and no-crash-guarantee rules.
4. Echo the exact `catalogSource` in `pack_result` only when it was bound. Keep the actual unchanged Compose envelope, current profile revision/source, and all existing outcome/mutation checks.

Extend `parsePackAcknowledgment`, its schema, binding comparisons, `rereadPack`, and `checkPackResult` for this optional field. Applied must show agreeing files and a profile source from the bound selection: normalized repository and reviewed resolved commit for remote, real source root for added local. A matching pack name or merely echoed key is insufficient. The owner still verifies complete actual impact; the cooperative acknowledgment is not an execution attestation.

Keep today's pack permission response choices, including Defer and Save as idea; Save as idea remains a post-click refusal while that pack request is unreconciled. Import permissions hide those two choices and offer only Send permission and Decline. Removal stays source-free and exact-file bounded. If source configuration is unreadable, added-source selection and source-changing freshness cannot be established; show Unknown/unavailable and refuse those requests, while profile-authorized removal remains usable.

## Source Column And Filter

FR-052-054, FR-062-065, FR-076, FR-080-082, FR-084, FR-088-090; VSC-008.

In Phase B, add a Source column to Installed and Available. Derive pack labels from the same source matcher used by request binding; project rows use their separate local projection:

| Label | Match |
| --- | --- |
| `Local library - Local folder` | Real built-in library path. |
| `Bundle upstream - GitHub E-G-C/dude` | Repository equals manifest repository; substitute its actual name. |
| `owner/repo - GitHub` | Configured added GitHub source. |
| `folder - Local folder` | Configured added local source root. |
| `Unlisted - Local folder` or `Unlisted - GitHub` | Readable recorded identity matches no current entry; use a truthful written-out type for any other recorded remote. |
| `Unknown` | Recorded source or the sources document is unreadable. |
| `This project` | A present project agent or skill, never a pack-source match or origin claim. |

Available uses the row's catalog origin. Installed packs use recorded provenance, not where a same-name catalog entry was found. Reuse the server-projected pack source key described in Multi-Source Catalog And Compose Fix for labels, Installed from this source, and advisory Remove reasons; project rows affect none of those counts or blockers. Show `rust - acme/dude-packs` as a clearly illustrative same-name detail example, matching the mock's rust pair; real headings use actual row data. All nine frozen installed entries remain Unlisted in the checkout example, so both built-ins show 0 installed with "9 installed packs record an unlisted source". Derive real counts and this note from current recorded membership, never hardcode nine or create an Unlisted source row.

Source options include built-ins/added sources. Add Unlisted, Unknown, This project, or another non-source group only when a row in the active list carries it; do not preseed empty groups. Failed sources remain selectable with `(unavailable)`; their view explains "not a confirmed empty list". Use the existing "known" count wording for partial source or use-case coverage and for failed project coverage. Project Use cases "Not applicable" matches no use-case filter and is not incomplete tag coverage. A failure must not turn a global count into a confirmed zero or hide successful sources.

Keep exact Use case matching, 25-row paging (FR-089), detail pane/overlay behavior, and filter-before-page semantics. Source AND Use case operate across the full active context; Clear resets both to All and page 1. Filter/page changes close details only when selection is excluded; use the opaque row key for selection, paging, and focus return in both lists. A snapshot refresh preserves filters/page/selection while the selected row survives (FR-090), replacing the old reload reset; context switches and ordinary main-rail departure retain their specified resets. Reset the active scroller on page/filter changes. No pack search, author filter, Type filter, priority, or source-fallback ordering.

Show packs in Available changes this local view only: close source details, set Available's Source to the selected opaque source key, reset Use case to All and page to 1, and focus the Available tab. At Packs widths <=300 px, focus the visible View Dropdown instead of a hidden tab. Do not call a reader or request endpoint. Enable it only when that source is Read and has at least one pack outside installed-name membership. Otherwise show the applicable reason: not read, development upstream not read by design, unavailable, no packs, or all its packs already installed.

## Settings, Focus, And Continuity

FR-001-007, FR-019-031, FR-036, FR-050, FR-063-065, FR-069, FR-071-077, FR-079-090; VSC-001-008.

Keep `SECTIONS`, `settingsSections`, and `sectionTab` at 074's Packs/About baseline, including its two-column narrow section treatment. Put Installed/Available/Add/import, then Sources in Phase B, in the Packs sub-tab strip. The former Local artifacts section and footer are removed from the proposal; no live product section exists to migrate.

Mount the import panel through local sub-tab/section changes, as Packs/About currently retain local state. Keep existing pack panels mounted and close their inactive native dialogs through their current lifecycle so they cannot cover or focus Add/import, Sources, or About. Apply the same active-panel rule to project details and Sources details, Add, and Remove confirmation. Import text and status remain distinct from list view state.

Replace `settings.jsx`'s unconditional snapshot reset near line 95 with retention by opaque selected key: if that row still exists in the refreshed list, update the snapshot reference and keep filters, page, and selection. Resolve selection against the refreshed list, not just its visible page; if the row moves to another page, follow it. Pending invalidation wrappers must not erase context while the same row remains in retained data. Without a selection, reset filters and page as in 063; when the selected row no longer exists, use the existing reset. These are the settled mock behaviors within FR-090, not additional scope. Keep root replacement and ordinary navigation resets unchanged. This deliberate departure from 063 prevents import acknowledgment, idle, and window-focus refreshes from undoing Show in Installed.

Change `PAGE_SIZE` from 5 to 25 for Installed and Available. Preserve pack order and append name/type-sorted project rows before filtering and paging by opaque key. The pager stays pinned below results; where FR-071 or FR-074 scrolls the whole panel, the pager follows the rows. At a Packs column <=300 px, FR-071 applies at every height, not only below 560 px. After returning focus to a row near `settings.jsx` line 165, call `scrollIntoView({block:'nearest'})`; add `scroll-margin-top` for the sticky table header in `styles.js`. Show in Installed also scrolls its selected row into view while focus goes to details Close. If focus return needs a surviving row now off-page, reveal its page before focusing and scrolling it. Page and filter changes reset whichever element is scrolling: rows in the ordinary layout, the whole panel where FR-071 or FR-074 applies. Sources remains unpaged.

Keep pack, project, and source details in FR-075 order: heading and scope, a coverage notice when present, description, actions and their reason or a read-only note, then facts. Pack details continue with recorded installed source or the projected-files note, then recorded files when present; project details continue with Files and the new-session caveat; Sources ends at facts. `packDetailBody` is the sole vertical scroller; `packDetailHeader` and `packDetailFooter` keep the heading, close control, and Back to results pinned. Render nothing at the Documentation position directly after facts. Preserve that order and scrolling in the wide pane and narrow overlay; no nested vertical scroller or documentation-height cap is needed.

In `pack-sources.jsx`, reuse the pack table and details structure: built-ins first, then added sources, at most 10 rows, no filters or pager. Columns are Source with written-out type, Location and ref, Status, and Scope (Built in / This project); the count line is text, not paging. Use each provider source key in row selection, details, focus return, and test hooks. The details use the same 320 px pane from 1100 px viewport width and native modal overlay below it. After description and actions, show Status, Packs found with its uninstalled count, Installed from this source, and Saved in. The development upstream's description explains its intentional non-read instead of showing a coverage notice. Built-ins show a read-only note and no Remove; added sources use the advisory reason and confirmation refusal defined above. No per-source re-read, edit, rename, enable, reorder, copy, commits, timestamps, or external repository link.

Put the primary Add source button in the toolbar slot above the table and move the existing Location/Ref form and notes into a Fluent-styled native modal using the pack-request dialog geometry. Open on Location; cancellation returns focus to the trigger. Keep Reading and every refusal in the dialog with input retained. Block Cancel, Close, Esc, and backdrop dismissal for the whole candidate read, including its 5,000 ms deadline and up to 2,000 ms cleanup confirmation. Keep the applicable Reload packs and Read again actions inside changed-since-read and lost-response refusals; they read current state rather than blindly replay a write. On success, close Add, restore focus to its trigger, and announce Added/count through the outside live status. Use the returned source key only after the post-add snapshot commits; then select its row and focus details Close only if Sources is still active and the row exists. Below 1100 px this is when the details overlay opens, not while Add is open or before the read completes. If Sources is inactive, do not open or focus a hidden overlay. Item r below owns the drag-to-backdrop dismissal constraint.

The Documentation reservation adds no details tabs, empty heading, documentation fields, renderer, dependency, or product documentation style. Project row kinds, Type, Name, counts, and inspection are current Phase A behavior under FR-084-088, not future extension scaffolding. No fifth Packs sub-tab or new Needs you return target is added.

`artifact-import.jsx` contains one labeled single-line Source, accepted-form helper, Request import, validation/reasons, and inline phase/result. Applied adds Show in Installed under the local navigation contract above. Use React text children for source/path data, not HTML or links. No Browse, mode/category/license controls, inventory under Add/import, README, retry/undo, percentage, history, or credentials.

Reuse Packs' `PHASES`/`MUTATIONS` distinctions in one Fluent `MessageBar`, with an indeterminate `Spinner` in flight, never a percentage. At product widths <=300 px, place the status icon above the title. Reuse About's scrolling panel, 76ch measure, and ruled label/value details. Adapt sentences to import verification at acknowledgment; imports have no pack `reading_result` catalog phase. Include complete written/uncertain paths, Dude's note, mutation wording, and the possible-new-session caveat. Waiting for Installed affects only the Show action, not the acknowledged Applied outcome.

Extend the hook's synchronous locks and epochs to import. Bind attempt/status/permission selectors to receipt plus workspace/session/generation and root lifetime, never source-string similarity. Update `packActionReason`, capture admission, and New idea copy for import exclusion while retaining browsing/drafts. Queued input remains a provider admission check after the click, reported as "not sent"; do not infer a queue-based disabled reason from frontend state.

Generalize `isPackPermission` to recognize the closed Dude-owned session pack/import cases. `responsePhase` displays Permission acknowledged, not Applied, for either, with text directing users to the corresponding result. In `RequestForm`, hide Defer/Save as idea only for bound import permissions; retain Send permission and Decline/reason. A permission reply must not trigger catalog acquisition merely because the hook currently special-cases only `pack:`.

Replace `packReturn` with the smallest tagged value carrying the exact request key, Settings section/sub-tab, and surviving focus target. Preserve Settings while following Open Needs you. Back to Add/import restores that panel and focuses the matching import status; pack return still reaches its exact pack request. After responding, focus a visible response status. Never focus an inactive dialog.

Ordinary main-rail departure clears typed import Source, retains request status, and resets entry to Packs > Installed, All filters, page 1, no selected row. The permission round trip is the explicit exception that retains its local destination and text. Clearing input does not rewrite the submitted Source in a retained result. Root replacement keeps the existing full reset. Preserve work selection, finder/task inspection, answer/idea drafts, and Review under their existing lifetimes.

Hide filters, paging, and Reload on Add/import; hide pack-only controls on About as today. Sources has top Add source, details actions, and the existing header Reload, without filters, pack paging, or invented sync controls. Use honest per-surface footer text instead of installed/catalog coverage on the import panel. A failed direct save retains input and its reason inside the active dialog; success/failure announcements are visible and accessible.

At a Packs container width <=300 px, replace the `packTabs`/`packTab` strip with a labeled Fluent Dropdown "View" driving the same sub-tab state. Use "Installed N" only when both installed/project coverages are current, otherwise "Installed ?". Use two columns at 301-479 px and one row from 480 px, preserving reading and keyboard order. At <=479 px, stacked Installed rows label Type and Use cases in Phase A and add Source in Phase B; Available labels Use cases and, in Phase B, Source. The old one-tab-per-row rule is a mock comparison only, not a product option. Do not add icons just to remove them at narrow widths. Leave Settings section styles unchanged. Apply FR-071's one-column scroll at <=300 px at every height and FR-074's short-height whole-panel scrolling at 301-479 px; full source/result/permission text wraps. A single-line Source may scroll inside its own input, never force page overflow.

The Coder declared the round-2 capability envelope, the round-4 Sources delta, and the round-5 envelope before FluentUI authored each proposal, including the bounded direct source-write behavior and server-projected installed matches. The coordinator-observed verification and revisions are bound in the spec. Those declarations and static demonstrations do not prove source management or the round-5 project/list changes already ship. The current Architect decision supplies this definition's project-read and navigation design; the round-5 mock is designed and independently verified, with explicit chat approval bound to the exact revision above. Preserve earlier variants and evidence.

## Placement Contract For 080 (recorded, not built)

FR-077-078. This contract reserves documentation placement only; it authorizes no documentation product code, data fields, or acceptance work in 073. Keep the FR-075/086 details order and place one Documentation section directly after facts, before pack provenance/projected-files note or project Files, without moving existing sections or controls. 079 is superseded; project listing and non-documentation inspection are current 073 scope.

Documentation uses one h3 "Documentation" section of initially collapsed, inert-content disclosures, following the existing Recorded files pattern. For 080, show the pack body first, then one disclosure per member README in the pack's declared order, such as "Skill dude-pack-clearline-visual - README". Put a project artifact's own documents in the same section. Demote embedded headings to h4-h6. A project artifact has a read-only note instead of actions and no invented import provenance; its facts precede Documentation and Files.

Placement works with plain text or sanitized Markdown. 073 adds neither renderer nor style. Plain text can reuse `prose` in `styles.js`. Use the measured width and reading-length findings in the 080 risk below; widening the 320 px pane remains an approval-visible departure. Text wraps, documents have no height cap, and the details body remains the only vertical scroller. Rendered code and tables may scroll horizontally only inside their own focusable, labeled box under the WCAG 1.4.10 exception. At <=300 px, disclosures are not indented; expanding one keeps focus in place. Content stays inert and remote images are not loaded. Q3's alternative is a documentation view opened from this same position, not a second implementation path built now.

080 should return bounded documentation from the same per-source catalog read, before its acquisition root is removed. Read installed member READMEs and local-source documents locally. Propose 64 KiB per document; an over-limit document shows "too long to show here" with its path, never truncated content. Keep the existing confirmed-stop cleanup exception and leave no normal read root behind. Add no cache, change to `cmdList`, or new Needs you return target. Pack documentation found by name in the default catalog must disclose that source separately from an Unlisted installed record; it does not verify installed bytes.

The round-5 mock exposes this position through item s's default-Shown annotations and full documentation frames. The frozen checkout remains nine packs and no project rows. Clearly labeled sample rows arrive through Applied then Show in Installed in both phases; P3's listing and P4's ordinary facts/files are now product states. Documentation in P1, P2, and P4 remains planned, with no product placeholders.

## Design-Verified Implementation Items

Items a-p combine the coordinator-observed round-2 findings with still-applicable round-1 constraints; item m now includes Phase A's project-row departures. They do not approve the design or verify the eventual Fluent implementation. The user's explicit approval of the exact revision is recorded above; product changes still require Work authorization. Item q is preserved round-3/4 mock history, not a current restriction deferring project rows to 079. Item r records the accepted round-4 A1 defect as a product constraint. Items s-u are designed and independently verified in the round-5 mock. These status labels record mock evidence only, not product implementation, acceptance, or additional scope. Capture mode: default GPU, classic 15 px scrollbars, reduced motion, and placement Hidden for product shots and identity checks; annotations were inspected with Shown.

| Item | Implementation constraint | Spec trace |
| --- | --- | --- |
| a. Focused revisions | `operationTarget()` in `needs-you.mjs` passes revisions through `identifier()`: <=160 UTF-8 bytes matching `^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$`. Use `missing` or `sha256:<64 lowercase hex>`, never `snapshotDestination`'s object from `import.mjs`; retain full state for importer freshness. | FR-014, FR-016 |
| b. Import-only responses | `needs-you.jsx` `RequestForm` hides Defer and Save as idea only for bound Dude-owned `import:` permissions. Keep existing pack responses unchanged. | FR-019, FR-029, FR-067 |
| c. Packs view navigation | In `settings.jsx`/`styles.js`, use one row from a 480 px Packs container and two columns at 301-479 px. At <=300 px, a labeled Fluent Dropdown "View" drives the same sub-tab state with values "Installed N" or "Installed ?" under separate installed/project coverage, "Available N" or "Available ?", "Add/import", and "Sources" (Phase B only). Use 4 px trigger inline padding; values wrap and are never truncated. Verify the real Fluent Dropdown at 180 CSS px and 200% zoom, including two-digit counts. Do not change `settingsSections`/`sectionTab` or 074's Packs/About chooser. | FR-001-003, FR-031, FR-069, FR-071, FR-085, FR-088; VSC-001-004, VSC-008 |
| d. Route errors | Extend `canvas-server.mjs` `startInstance` NeedsYouError, syntax-error, and provider-error mappings for `/api/imports/request`. Preserve send-uncertainty status/codes instead of turning possible delivery into generic 400/Unavailable. Apply the same explicit mapping discipline to `/api/packs/sources`, without import-send semantics. | FR-009, FR-021, FR-024, FR-045, FR-048 |
| e. Scope wrapping | Add `overflowWrap: 'anywhere'` to `styles.js` `scope`. | FR-013-014, FR-058; VSC-002-003 |
| f. Needs you padding | Needs-you-only panel style in `app.jsx`/`styles.js`: at `@container (max-width: 300px)`, use `paddingInline: tokens.spacingHorizontalS`; do not change shared `detail` padding. | FR-014, FR-029; VSC-002-003 |
| g. Needs you buttons | At the same container width, scope button `paddingInline: tokens.spacingHorizontalS`, `maxWidth: '100%'`, and `overflowWrap: 'anywhere'` to Needs you. | FR-031; VSC-002-003, VSC-005 |
| h. Consent checkbox | Style the permission `Checkbox` root in `needs-you.jsx` with `maxWidth: '100%'`, its label with `minWidth: 0` and `overflowWrap: 'anywhere'`. | FR-015, FR-031; VSC-002-003 |
| i. Panel overflow evidence | Extend `audit()` in `scripts/dude-canvas-ui/t011-browser.test.mjs` beyond page/body geometry: visible `#dude-panel-needs` has `scrollWidth === clientWidth` at 180x450 and 360x900 at 200% (effective 180x450), both themes, import and existing pack permissions. Include the longer source-qualified pack permission. | FR-013-014, FR-031, FR-058; VSC-002-003 |
| j. Source target revisions | Put a local-folder source's folder path in the first permission target's text. Its `revision` is `sha256:<64 hex>` of the chosen pack's source files, never the path. GitHub sources use `commit:<40 hex>`. Both must satisfy the existing identifier rule `^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$` and <=160 UTF-8 bytes. | FR-058-059; VSC-003 |
| k. New idea mutual exclusion | In `needs-you.jsx` NewIdea, an unreconciled import leaves the draft editable but disables Submit/Save with "An artifact import is in progress or needs owner reconciliation. Your idea draft stays here." Tie that visible reason to both disabled controls with `aria-describedby`. A prepared or sent unreconciled capture disables Request import and pack sends with "An idea capture needs owner reconciliation before an import can be requested." An unsent typed draft never blocks. | FR-006-007, FR-031, FR-072-073; VSC-004, VSC-006 |
| l. Whole-panel Packs scrolling | At Packs container <=300 px, FR-071 scrolls the whole panel at every height in both phases. At 301-479 px, FR-074 scrolls the whole panel below 560 px viewport height; from 560 px up, rows alone scroll. The round-2 mock gives the panel 248 px at 384x450, up from a 74 px list. Reset the active scroller on page and filter changes; in either whole-panel mode the pager follows the rows. Verify row and control reachability in the real panel rather than copying the mock's scenario drawer. | FR-071, FR-074, FR-089; VSC-002-004 |
| m. Stacked pack, project, and source rows | At Packs container <=479 px, Phase A Installed labels the stacked Type and Use cases values; Phase B adds Source. Available labels Use cases and adds Source in Phase B. This replaces 074's unlabeled Phase A rows and is approved. Sources hides its table header and stacks each row as name/type, location/ref, Status, and Scope, with all values wrapped; View applies at <=300 px. | FR-063, FR-069, FR-071, FR-079, FR-084, FR-088; VSC-002, VSC-008 |
| n. Warned permission capacity | The round-2 Warned sample includes all eight engine risk categories within the 4,096-byte consequences field. Keep the complete Permission Fit check for every real import; sample fit never permits omitted categories, truncated paths, splitting, or wider field bounds. | FR-013-017; VSC-006 |
| o. Forced-colors residual | Under forced colors, the mock's native select truncates long Dropdown values at 180 px (most of the 37 values), matching 074's native-select behavior. Keep this residual visible and verify real Fluent Dropdown wrapping under forced colors; the mock's final check is not product verification. | FR-031, FR-069, FR-071; VSC-002-003, VSC-008 |
| p. Narrow filter Dropdowns | At Packs container <=300 px, retain the four disclosed differences from 074: text inset 12->4 px, right text padding 34->26 px, chevron inset 10->4 px, and long values wrapping instead of truncating. Apply to the Use case and Source Dropdowns; keep Clear on its own row below the filters. Phase A's filter row otherwise follows 074. | FR-064, FR-069; VSC-002-003, VSC-008 |
| q. Planned placement frames (mock complete, verified) | FluentUI built P1-P4 at 1440x900 and 180x450 in both themes; the independent re-check passed after Coder's revisions. The drawer-only group "Planned placement (079/080): not in 073" exposes the frames, with `?planned=` values `p1a`, `p1b`, `p2`, `p2-mid`, `p2-end`, `p3a`, `p3b`, `p4`, and `p4-end`. Each "Planned (079/080)" banner is outside an `inert` stage with no controls, IDs, or focus stops. P1b and P2 freeze `library/packs/rust/pack.md` and `.github/skills/dude-pack-clearline-visual/README.md`, respectively, as wrapped plain text, including the README's code-block/table source. P2 retains the exact Unlisted disclosure and narrow long-scroll evidence; P3/P4 show clearly labeled sample rows/details. Formatting is illustrative and rendering belongs to 080. Only mock controls outside the stage switch or leave frames; choosing a product scenario exits the frame first. Breakpoint changes no longer open a hidden details modal, and the skip link is hidden during frames. At round-3 settle, all round-2 product states remained pixel- and DOM-identical; round 4 changes only Sources and leaves these frames unchanged. The final independent round-3 re-check passed product-state identity (568 comparisons), inert frames (36/36), and planned PNG evidence (39/39 byte-identical in default mode). These frames and fixes add no product scope or working 079/080 behavior; the spec records the accepted P3a framing advisory. | FR-075-078 |
| r. Add source backdrop dismissal (A1) | Backdrop dismissal of Add requires a full press and release on the backdrop, never a press that began inside the dialog (including a text-selection drag), and is blocked while Reading or confirming cleanup. Keep typed Location/Ref on every refusal. Do not copy the mock's click-only dismissal that loses input; verify the pointer sequence as well as Cancel, Close, Esc, focus return, and the in-dialog recovery actions. | FR-031, FR-045, FR-083; VSC-004, VSC-006 |
| s. Visible documentation annotations (mock designed and verified) | The preview strip offers "Planned placement: Shown \| Hidden", default Shown; `?placement=off` hides it. Shown draws a dashed, non-interactive `role="note"` outline directly after facts in every pack and project details pane/overlay: "Planned (080): Documentation appears here. Not in 073." "Open frames P1, P2, P4" is in the strip, outside the product. Full frames remain inert documentation-placement evidence; P3 listing and P4 non-documentation details are product states. Product captures and identity checks used placement Hidden in the capture mode above. No corresponding product control or placeholder. | FR-077-078 |
| t. Page size, visible focus, and retained context (mock designed and verified) | Apply the approved change to `PAGE_SIZE` in `settings.jsx` from 5 to 25. After focus return near line 165, call `scrollIntoView({block:'nearest'})`; also reveal Show in Installed's selected row and use `scroll-margin-top` for the sticky header in `styles.js`. Reset the active scroller on page/filter changes. Replace snapshot-reset logic near line 95 with key-based retention of filters/page/selection while the selected row survives, otherwise the existing reset. Without a selection, refresh resets filters/page; if the selected row moves to another page, follow it. These departures from 063 are approved; the mock result does not verify product code. | FR-076, FR-089-090; SC-017 |
| u. Read-only project rows and Applied navigation (mock designed and verified) | Apply the approved design by adding the bounded `readProjectArtifacts(root, signal)` and coalesced `/api/packs` attachment above; invalidate project coverage with pack coverage. Import acknowledgment publishes `workspace` for mutation other than `none`, otherwise `needs-you`. Only Applied offers Show in Installed, with its three reasons and first-written-artifact mapping, filters reset, target page/key selected, details Close focused, and no new request. Keep `packs.mjs` and pack authority unchanged in Phase A; never infer success or construct rows from result paths. Reader/provider implementation remains planned; the mock verifies the proposed presentation and navigation only. | FR-084-088, FR-090; SC-015-016 |

### Round-5 Mock Evidence

FluentUI authored the canonical mock within the Coder's declared round-5 envelope. The final `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html` is 457,106 B at SHA256 `58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9`. The coordinator-observed independent Tester passed all nine checks against round 4, SHA256 `1feedf06710014fa92d4ce7e65d8fb3b56046757d2116160dbeeec057fcd838d`:

| Mock check | Reported evidence |
| --- | --- |
| Integrity | Passed for the final revision above. |
| Unchanged surfaces | 992 comparisons against round 4, with only the expected differences. |
| Project rows | 173 assertions. |
| Show in Installed | 410 assertions. |
| Paging | 87 assertions. |
| Annotations | 64/64 views; outline contrast 6.19:1 light and 6.48:1 dark, text 10.0:1. |
| Responsive and accessibility | 714 cells; text contrast >=4.72:1. |
| Header | Passed with the three accepted advisories below. |
| PNG evidence | 256 of 363 mapped PNGs match live renders. |

There are 725 top-level PNGs after 492 new captures and the move of 221 superseded round-4 PNGs to `design/screenshots/round-4-superseded/`. New captures use the default-GPU, classic-scrollbar, reduced-motion mode above, with placement Hidden for product shots. The PNG result is the reported matched subset, not a claim that every retained capture matches the current revision. Sample rows, counts, and results remain illustrative.

The coordinator accepted these round-5 advisories; they are mock/header limitations, not new product exceptions:

| Advisory | Accepted limitation |
| --- | --- |
| A1 | On the Applied-import sample path, rows carry the Sample pill but not the dashed mock note described by the header. |
| A2 | Measurement counts in the header's "ONE CLAUSE" paragraph differ slightly from the verifier's. |
| A3 | The header says only strip controls are under 24 px, but About's inherited repository link is 19 px tall. |

The coordinator also accepted the spec-required FR-004 clause "appear in Installed" in the Add/import explanation. The accepted FR-089 observation is that, at a Packs column <=300 px, the pager follows the rows at every height because FR-071's one-column scroll applies; FR-074 supplies the other whole-panel-scroll case. These observations and checks establish mock evidence only, not product scope, implementation, acceptance, or visual approval.

## Delivery Sequence

These are delivery phases, not canonical task units. FR-068 governs all product work.

1. Use the user's explicit chat approval "I approve the mockup" at 2026-10-01T10:05:42Z of the settled round-5 **Classic Settings Packs Hub with project rows** at `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html`, bound to SHA256 `58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9`; the coordinator's fresh hash matches the reviewed artifact. This approval covers this exact revision, both phases, project rows and Show in Installed, 25-row pages and retained context, Type and labeled stacked rows in Phase A, "Installed" naming, default-on mock annotations, and all other approval-visible decisions and departures from 063/074. The nine independent mock checks and capture mode are recorded above; samples remain illustrative, and prior-round bytes, captures, and review evidence stay preserved. Documentation approval covers position only; display remains in 080 per the user's Q6 answer. Carry round-4 A1 as item r's product constraint and retain the three accepted round-5 advisories. Canonical tasks are derived from this approved design and the plan. This is direct chat approval, not a Canvas response or acknowledgment; the earlier Canvas waiter timed out without a receipt.
2. Deliver Phase A's provider/HTTP/import-skill contract and Add/import panel together with the separate project reader, read-only Installed rows/details, mutation hints, Show in Installed, 25-row paging, retained context, fixed details order, opaque row keys, and generalized return path. Verify local file/directory permission/result/listing round trips and unchanged pack authority. Do not add Phase B placeholders or change `packs.mjs` or default pack contracts in Phase A.
3. Deliver Phase B's shared source file/parser/writer and lint check, reader/Compose fix, source-bound requests/results, Sources table/details/Add dialog, and source column/filter with row-backed non-source options including This project. Prove an added local source can be discovered, reached through Show packs, and installed through the existing permission path. Retain Phase A's import/listing behavior without automatic multi-source discovery.
4. For each delivered phase, build UI then build-dev, check exact generated/parity/legal bytes, update production app hash pins, and measure compressed size. Run focused checks while editing, then the affected combined acceptance set.
5. Extend the installed-host driver for local file/directory import followed by Show in Installed, and an added local-folder pack source. Check its page-dependent selection against 25-row paging. Preserve its existing capture, pack, About, and Review journeys. Independent verification/review and coordinator-owned task state/closure follow the active execution lane.

Continuity references remain `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`, `.dude/specs/063-dude-canvas-settings/design/pack-management.html`, and `.dude/specs/074-dude-canvas-about/design/about.html`, with the working 057/062 capabilities retained. Do not alter their historical approval pins. Product source is authored in `src/`, not copied from a mock.

## Acceptance Coverage

| Coverage | Required cases and evidence |
| --- | --- |
| US1-US2; FR-004-005, FR-008, FR-011-018; SC-001-003, SC-008 | Local/public focused agent/skill and directory forms; Clean/Warned/Blocked; default adaptation/license decisions; unresolved siblings/dependencies; collision/replacement/drift. Main file plus reviewed LICENSE/NOTICE yields two focused targets and complete `writtenSiblings`. Use controlled acquisition for public forms. |
| Complete permission; FR-013-017 | A 20-file skill is one target. Twelve groups fit if all fields fit; thirteen publish no permission and close `unavailable/none`, zero writes, chat guidance. Test plan order, every replacement, counts, plan revision, static/advisory flagged paths/categories, unreviewed/unbatched counts, 2,048/2,049-byte targets and 4,096/4,097-byte other fields, including multibyte text. No truncation/splitting. |
| Import admission/lifecycle; FR-006-010, FR-020, FR-024; SC-005 | Closed bodies, source bytes at 2,048/2,049, whitespace/control/multiline/URL refusals, explicit `:443`, Windows paths, queue/waiter races, preparations and all capture/pack/import exclusions both ways, pre-send versus possible-send failure, exact message correlation, expiry, no replay. |
| Import result; FR-020-025, FR-087; SC-003-004, SC-016 | Wrong owner/reference/generation/operation, generic acknowledgment rejection, pending/declined/deferred permission, all outcome/mutation combinations, duplicate tool-call/receipt, pre-permission terminal unlock, partial/restored/recovery-failed mapping, full paths, unsafe/missing/non-file/link/root cases, no provider post-result path reread. Agent companions and shared notice pass; `dude-pack-x.support` and `dude-localx.support` fail; a valid companion does not require a sibling agent file. In `needs-you.test.mjs`, assert `workspace` publication exactly when import mutation is not `none`, otherwise `needs-you`; the hint never changes result evidence. |
| Project read and pack separation; US9; FR-084-086, FR-088; SC-015-016 | In `src/extensions/dude/canvas-server.test.mjs`, exercise the real coalesced `/api/packs` projection with focused, directory including `.support/`, hand-made, missing-folder/empty, linked-root/descendant, unreadable, 256/257-artifact, 128/129-file, and depth-12/13 fixtures. Check once-per-root containment validation, cancellation/root replacement, 8 KiB prefix reads, strict UTF-8/BOM/closing-delimiter/block/multiline/duplicate-key reasons, exact row order/keys/files, and row-only versus whole-list withholding. Project failure leaves packs; no scan network/process and no key-to-path endpoint. In `needs-you.test.mjs`, prove project rows cannot affect pack membership, requests/freshness/results, namespaces, or source-removal blockers. |
| HTTP and write boundary; FR-006-009, FR-037-049, FR-070 | Exact method/URL/Origin/Host/fetch/JSON/body cap/root/lifetime guards for both routes. Import route performs no acquisition, process, import, or write. Sources route writes only its file after validation; closed-body rejection, stale revision at entry/after acquisition/precommit, safe atomic failure behavior, and refusal preserve every unrelated project byte. |
| Source document and add/remove; US6; FR-032-049, FR-080, FR-082-083; SC-009-010, SC-014 | Missing/valid/malformed/multiple-block/unsafe document; schema-only lint offline; built-ins never saved; dev/release built-in states; valid GitHub/local count and returned opaque key/new revision; all listed add refusals; normalized duplicates/different ref; eight/ninth source; bare folder/own-library refusal. A lost Add response after a successful save stays unconfirmed until read again, without claiming unchanged configuration or replaying the write. Verify installed-source projection for real built-in library versus added root, normalized GitHub with ref ignored, Unlisted/Unknown, and no name-based matches. Installed packs and preparing/prepared/sent requests block removal with names; another tab's mid-prepare race is caught by the server even without a UI reason. Unused remove changes one entry; cancellation/timeout kills reader children before cleanup. |
| Multi-source discovery; US7; FR-050-054, FR-062-065, FR-081, FR-088-089; SC-011-012, SC-017 | Before Phase B's first Reload, Available "?", configuration source rows "Not read" without counts, Show packs disabled, Add/Remove subject only to normal guards, and Installed from the profile plus the local project read. Default/added catalogs read only on Reload and once after add/remove: one read per source, maximum four active, 5,000 ms acquisition deadline plus bounded cleanup; one failing source leaves others visible with known counts. No catalog read on Settings entry/navigation/focus/event/filter/Show packs/Show in Installed; local installed/project refresh still occurs. No persisted cache. Use at least 26 rows per list context for AND filtering beyond page 1 and Clear, same-name rows/details, exclusion after install, and truthful source labels including This project only when present. |
| Compose/source-bound requests; US7-US8; FR-055-061, FR-067; SC-013 | Explicit source beats local library for add/list/refresh, no manifest fallback on failure/missing pack, no-source calls unchanged, offline `file://` Git remote exercises the clone branch. Update the test pinning old explicit-source precedence. Prepare/submit/result/permission bind exact configured source and sources revision; stale/removed/replaced selection refused; refresh chooses matching source or explicitly discloses change; missing/wrong `catalogSource` echo or recorded source cannot be Applied. |
| UI/continuity; US5-US9; FR-001-004, FR-007, FR-019-031, FR-036, FR-045-049, FR-063-069, FR-071-074, FR-079-090; SC-006-007, SC-016-017 | Both phases, View Dropdown at <=300 px Packs width, two columns at 301-479 px, one row from 480 px, short-height whole-panel scrolling, labeled stacked Installed Type/Use cases in Phase A plus Source in Phase B, and stacked Sources rows with hidden headers at <=479 px. Every import phase/result/reason, two import responses versus unchanged pack choices, post-click queued refusal, return/status focus, local retention versus rail clearing, hidden dialogs, editable New idea draft and mutual send exclusion with exact reasons/description association, top Add source dialog and source details actions, accurate labels/partial coverage, no deferred affordances, work/Review retention. |
| Applied to Installed; US9; FR-084-088, FR-090; SC-015-016 | In `browser.test.mjs` and `t011-browser.test.mjs`, drive Applied -> automatic refresh -> Show in Installed at all four sizes in both themes/phases, with first-written artifact selection and `.support/` mapping, filters reset, target page/key selected, and details Close focused. Assert all three disabled reasons, non-Applied absence even when a row exists, no row from result paths, inert content/paths, complete facts/files/caveat, no Remove/Open file/Type filter, and separate project coverage/counts. Retained selection survives subsequent acknowledgment/idle/focus refreshes; removal of the selected row triggers the existing reset. Without a selection, refresh resets filters and page; if the selected row moves to another page, the page follows it. |
| Paging and visible focus; FR-076, FR-089-090; SC-017 | Raise paging fixtures in both browser suites to at least 26 rows per Installed/Available context, including multi-source Phase B Available; keep a separate exact-25 single-page case. Replace five-row and `1-5` range expectations with 25-row and `1-25` expectations for a full page. Traverse each row exactly once with no page above 25; verify filters before paging, opaque-key identity, pinned pager and following behavior under both FR-071 and FR-074 whole-panel scroll rules, active-scroller resets, and no empty results area above the pager at 1440x900. Include Packs widths <=300 px at every height, not only short viewports. Return focus to rows below the first screenful and after Show in Installed; assert visibility below the sticky header, not only `activeElement`. Check page-dependent selection in `t012-installed-host.mjs`, including `driveInstalledPackRoundTrip` and About continuity, against the new page size and opaque keys rather than assuming a prior row position. |
| Sources table/dialog/actions; US6-US7; FR-036, FR-052, FR-075-076, FR-079-083; SC-009-010, SC-012 | Built-in/added table order and Scope, at most 10 rows, no filters/pager; exact details fact order, honest counts and the frozen 0-installed/nine-Unlisted note, no repository link or extra source actions. Show packs enables only for Read with an uninstalled pack, sets Source/All use cases/page 1 locally, and focuses Available or View at <=300 px. Add opens on Location; dismissal returns focus to its trigger. While Reading through deadline/cleanup, Cancel/Close/Esc/backdrop do nothing; a press starting inside and ending on the backdrop never dismisses or loses typed input (A1), while a full backdrop press/release can dismiss when idle. Refusals and Reload packs/Read again remain inside with input. Success closes Add and announces outside; after the post-add snapshot, select the returned key and focus details Close, opening the overlay below 1100 px only then and only while Sources is active. Remove reasons name known blockers; late server refusals remain inside confirmation with all blockers named. |
| 073 details and identity; FR-075-077, FR-079-080, FR-084-086, FR-088 | In both themes at wide and narrow widths, assert the fixed section order and coverage notice before description when present; the development upstream explains its intentional non-read in the description instead. Sources ends at facts; packs and project details render nothing at the reserved Documentation position. Keep one vertically scrolling details body and pinned heading/close/Back to results, including long file content. All lists use opaque keys for selection/focus/test hooks, and Installed/Available page by those keys. Same-name Available rows, same-name agent/skill rows, and same-named local sources cannot steal selection or focus. Source keys include built-ins and ignore ref. Update row/detail hooks in both browser suites and `t012-installed-host.mjs`; no product documentation fields, placeholder, or control ships. |
| Build/installed receiver; FR-018, FR-022, FR-025, FR-029, FR-042-043, FR-055-061, FR-067-069, FR-084-090 | Source/generated/UI/legal parity, including `lib/project-artifacts.mjs` in `t012-installed-host.mjs`'s explicit `installedParity` runtime list; release absence and upgrade preservation of project config, measured compressed size, actual installed owner permission/apply/result for local imports followed by Show in Installed and a pack from an added local-folder source, observed written bytes and inspected rows/files, no immediate-host-loading claim, comparison with the user-approved round-5 mock. |

FR-078's annotations and documentation frames are placement-review evidence only, outside product acceptance. Inspect them separately during Delivery step 1 with Shown; run product captures and identity checks with Hidden. P3's list and P4's non-documentation details now belong to the product cases above, not that exception.

Extend `src/skills/dude-compose/compose.test.mjs`, `src/skills/dude-lint/lint.test.mjs`, `src/extensions/dude/needs-you.test.mjs`, `canvas-server.test.mjs`, `scripts/dude-canvas-ui/browser.test.mjs`, `t011-browser.test.mjs`, and `t012-installed-host.mjs`. Use their real provider/HTTP/filesystem fixtures. Test the shared sources parser/writer and project reader through those current callers rather than add another harness. Compose's existing `createRemoteCatalog` uses a disposable `file://` Git repository; that test-only source does not become an allowed Canvas input. Test Canvas GitHub behavior with controlled offline acquisition, never private credentials or real network access.

Capture both themes at 180x450, 360x900, 768x900, and 1440x900; exercise 200% reflow from the latter three down to effective 180x450, not half the already-minimum viewport. Record actual pointer/keyboard steps, screenshots, geometry, accessibility tree, contrast, and error transitions. Distinguish effective viewport/page-scale evidence from native zoom and standalone Edge from embedded-host rendering.

### Exact Verification Commands

These are planned implementation checks, not results from definition. Run from the repository root in PowerShell with existing dependencies. Inspect committed/published parity before regeneration so a build cannot conceal pre-existing drift.

Focused source/configuration/provider checks:

```powershell
node --test --test-concurrency=1 src\skills\dude-compose\compose.test.mjs src\skills\dude-lint\lint.test.mjs src\extensions\dude\needs-you.test.mjs src\extensions\dude\canvas-server.test.mjs
```

Unchanged importer regression files, run together without changing them to accommodate Canvas:

```powershell
node --test src\skills\dude-bundle-import\import.test.mjs src\skills\dude-bundle-import\lib\import-frontmatter.test.mjs src\skills\dude-bundle-import\lib\directory-source.test.mjs src\skills\dude-bundle-import\lib\directory-risk.test.mjs src\skills\dude-bundle-import\lib\directory-import.test.mjs
```

After approved UI source changes, rebuild in this order:

```powershell
node scripts\dude-canvas-ui\build.mjs
node scripts\build-dev.mjs
```

The first writes `src/extensions/dude/ui/assets/app.js` and its legal companion; the second projects the already-built runtime under `.github/extensions/dude/` and changed core skills under `.github/skills/`. Preserve legal/static Review bytes and existing dependency versions. Update `PUBLISHED_APP_SHA256` in `t011-browser.test.mjs` and `SOURCE_APP_SHA256` in `t012-installed-host.mjs` to the rebuilt app, not to unbuilt source. Keep unrelated legal/design/reference pins unchanged.

Measure clean-build and deployed compressed sizes against `APP_GZIP_BUDGET_BYTES = 358_400` in `build.test.mjs` and the documented ceiling in `docs/commands.md`. Do not weaken the assertion or silently raise the budget; return measured overage for an explicit scope/budget decision if necessary. No new dependency or legal-notice change is planned.

Set `DUDE_CANVAS_BROWSER` to a verified installed Windows executable before the following, and require actual browser execution with Node 22+:

```powershell
$env:DUDE_CANVAS_BROWSER_REQUIRED = '1'
node --test --test-concurrency=1 scripts\dude-canvas-ui\build.test.mjs scripts\dude-canvas-ui\browser.test.mjs scripts\dude-canvas-ui\t011-browser.test.mjs
node --test --test-concurrency=1 scripts\build-dev.test.mjs scripts\current-format-contract.test.mjs
```

Final combined Canvas regression after shared lifecycle/navigation changes uses the documented named nine-file set, serialized rather than recursively rediscovered:

```powershell
node --test --test-concurrency=1 --test-reporter=tap scripts\dude-canvas-ui\build.test.mjs scripts\dude-canvas-ui\browser.test.mjs scripts\dude-canvas-ui\t011-browser.test.mjs src\extensions\dude\projection.test.mjs src\extensions\dude\work-index.test.mjs src\extensions\dude\needs-you.test.mjs src\extensions\dude\review.test.mjs src\extensions\dude\browser-process.test.mjs src\extensions\dude\canvas-server.test.mjs
```

That final command subsumes earlier browser/provider runs on the same bytes; do not rerun the full set for every small edit. Preserve the documented Windows-only skip for the POSIX failing-browser case and obtain Linux coverage by the existing procedure in `docs/commands.md`. Wrapper passes, zero executed cases, and missing required browser/SDK coverage do not establish acceptance.

Use verified installed paths for `DUDE_COPILOT_SDK` (directory containing `index.js`), `DUDE_COPILOT_CLI` (actual `copilot.exe`, not a shell shim), `DUDE_COPILOT_RUNTIME` (runtime `index.js`), and `DUDE_CANVAS_BROWSER`, then run explicitly:

```powershell
node scripts\dude-canvas-ui\t012-installed-host.mjs
```

The deterministic installed owner must exercise the shipped import skill/route, publish literal permission, run the unchanged importer, and acknowledge one local file and one local skill directory with a companion, including an agent `.support/` case in the directory coverage. Without Reload, wait for the project read, use Show in Installed, and inspect the selected row, details Close focus, facts/files, and caveat. Check page-dependent selection in the existing pack journey against the new 25-row size. Add one local-folder source through Settings, discover/select its pack, and let the installed Dude owner preview, obtain permission, run Compose with that source, and acknowledge its source-bound result. Test code must not perform post-seed import/pack application instead of Dude. No network. Preserve existing journeys and disclose that this proves installed owner-tool execution, not unscripted reasoning or desktop embedding.

Keep uniquely owned fixture roots short and outside evidence folders, without an unrelated tracked database in their ancestors. Use existing TEMP/TMP/artifact-directory options as needed; never put machine paths in product files. Confirm owned process-tree shutdown before exact fixture cleanup. Report executed/failed/skipped counts and evidence paths. Ask for human observations only after the full automated journey passes and only for remaining embedded-host behavior.

The coordinator alone runs definition/publication lint after exact-owner and staged-byte re-verification inside the rollback boundary:

```powershell
node .github\skills\dude-lint\lint.mjs .
```

No lint, publication, or implementation result is claimed here. Approval is the direct chat decision recorded above; production acceptance remains unverified. Zero failures remain the coordinator's definition handoff gate.

## Guardrails And Remaining Risks

| Binding rule from `.dude/memory/guardrails.md` | Check against this plan |
| --- | --- |
| WHAT/WHY separate from HOW | Spec contains user outcomes/limits; routes, schemas, modules, build/runtime details, and commands live here. |
| UI mock approval before UI source; preserve variants | The user approved the exact round-5 revision by chat at 2026-10-01T10:05:42Z, covering both phases, Type/stacked-row/paging/refresh departures, "Installed" naming, and documentation placement/annotations. Canonical implementation tasks are derived; retain prior-round evidence and disclosed advisories. FR-068-069, FR-078-090. |
| Smallest proven design; deterministic helpers | Existing importer/Compose/provider/readers, one local project-reader module with a current `/api/packs` caller, and one Phase B source module/configuration file. Project rows have no operations or persisted provenance; the documentation reservation adds no unused renderer, tabs, or state. No general writer, engine, registry, indexer, durable request state, cache, or speculative supporting package. FR-008-018, FR-042-051, FR-070, FR-075-090. |
| Core runtime independent of optional packs | Use core Node modules and committed UI assets; never load an installed design/coding/visual pack at runtime. FR-029, FR-068-070. |
| No dead affordances; established conventions | Every product control maps to a bounded request, validated source write, local filter/navigation, or existing permission response. Planned documentation annotations/frames are labeled, non-interactive placement evidence controlled only outside the product. Follow the named toolbar, master-detail, Fluent Dialog, source-manager, Installed, 25-row paging, Figma annotation, and Storybook Outline conventions; omit deferred product controls and repository links. FR-004, FR-031-049, FR-064, FR-070, FR-077-090. |
| Installed-map authority and exact safe removal | Source selection changes discovery/acquisition only; membership and recorded files still govern pack removal. Source removal never uninstalls and is blocked when used. Project rows never enter pack authority, Available membership, namespace checks, or source-removal blockers. FR-046-047, FR-054, FR-061, FR-084. |
| Canvas continuity; harness-first UI evidence | Preserve 052/063/074 and working later capabilities outside explicitly approved departures. Verify full rendered steps/focus/geometry/contrast/errors before any host-only request, including visible row focus and refresh retention. FR-026-031, FR-068-069, FR-087-090; VSC-001-008. |
| Optional disciplines and coordinator-owned state | No required TDD/worktree/Beads stage. Canonical tasks are derived from the approved design; execution glyphs, dependency application, boards, mirrors, execution history, and close events remain coordinator-owned. FR-068. |

No new project-wide guardrail candidate is needed or persisted. Feature-specific source/input/read limits are scoped requirements, not newly ratified project rules.

Remaining risks:

- Third-party packs can claim a familiar name and its `dude-pack-<name>-*` routing namespace. The source, resolved commit, and third-party permission label make this visible; user consent is the only trust control. Do not imply signatures, reputation, or isolation. FR-054-060, FR-066.
- Refresh can select a different source for an unmatched old record. Binding and the explicit `Source changes` line counter silent switching; never infer a match from pack name. FR-057-060.
- Explicit-source precedence is a deliberate Compose change, including an existing contrary test. Keep no-override callers unchanged and prove no fallback offline. FR-055, FR-067.
- Several slow sources extend total Reload time beyond one reader's deadline. Show Reading, then per-source results and known coverage when the read returns; no per-source progress control is proposed. Cap concurrency and verify child-tree cleanup. FR-044, FR-050-052.
- Git option/transport injection and private credential prompts are reachable through source input. Closed GitHub/ref validation and noninteractive acquisition must precede any process; tests must fail for the intended guard, not an unrelated failure. FR-037-045.
- Concurrent edits to a committed file need raw-preimage stale refusal and atomic replacement. These detect observed drift, not hostile-filesystem races or crash-proof recovery. Machine-specific local paths remain a portability risk; nine current installed records already demonstrate it. FR-040-049, FR-063.
- The Remove reason cannot see another tab's mid-prepare request; only the server's final check prevents that removal race. Keep refusals inside confirmation. The accepted A1 mock defect must not carry into the product: a text-selection drag ending on the backdrop must retain the Add dialog and input, and the post-add narrow details overlay must wait for the new snapshot. FR-046, FR-082-083.
- Shared capture/pack/import exclusion, navigation retention, and source-aware freshness touch several lifecycle branches. Preserve exact default contracts, result/permission distinction, and retained work; source addition itself grants no execution authority. FR-006-010, FR-020-031, FR-043, FR-059-067.
- Focused import is not transactional; directory recovery can fail. Keep point-in-time path checks, honest partial/restored/uncertain outcomes, and the existing Windows inherited-ACL caveat. Imported host availability may require a new session. FR-017-025.
- Extension version skew can leave an old backend serving a rebuilt frontend. Use the existing documented extension reload/restart procedure during verification; retained receipts do not survive provider replacement. FR-009, FR-025, FR-029, FR-067.
- Merged scope is larger than the rejected mock. Two independently useful phases contain it; versions, upstream editing, documentation display, project-artifact operations, and author/marketplace features remain excluded. Q5 and Q6 are answered; the approved mock covers Q3's placement, Q4's public-only disposition, Phase B explicit-Reload discovery, narrow View navigation, and every disclosed 063/074 departure. Documentation presentation details remain with 080. FR-002-003, FR-050, FR-068-071, FR-077-090.
- FluentUI and the independent Tester measured a 280 px text column (about 45 characters per line) in the 320 px pane and a 123 px column (about 20 characters per line) in the 180 px overlay. The clearline README is 3,421 B: 130 wrapped lines, about 4 screens of the 659 px docked body; at 180x450, 239 lines, about 15 screens of the 320 px overlay body. A 76ch measure would be about 574 px, a departure from the 320 px pane. These 080 long-text findings favor considering Q3's alternative, a documentation view opened from the same position; a wider pane or that view remains approval-visible. FR-077.
- There is no project-artifact provenance record. Present rows as current workspace facts, never as proof that Canvas imported them; Applied remains the separately verified result. Listed does not mean loaded by the host, so retain the new-session caveat. FR-025, FR-084-087.
- Phase A's combined read waits for the existing default catalog, up to 5 seconds plus 2 seconds of cleanup. Show in Installed must expose its waiting reason rather than manufacture a row from result paths. Phase B must keep local project refresh separate from explicit multi-source discovery. FR-050, FR-085, FR-087.
- The existing snapshot reset would undo Show in Installed after acknowledgment, idle, or window-focus refresh. Key-based retention is an approved material departure from 063 that still requires browser coverage; preserve the reset when the selected row disappears and on root replacement. FR-090.
- Name/Type/count changes and labeled stacked rows now depart from 074 in Phase A as well as Phase B. A 25-row page also makes formerly offscreen focus return reachable; verify scrolling below the sticky header and both active scrollers, not only focus assignment. FR-069, FR-074, FR-088-089.
- At the stated bounds, a project read can return roughly 5 MB of descriptions and file paths. Measure read/payload/render cost with full-bound fixtures; do not widen the bounds, silently truncate, persist a cache, or add virtualization as an unapproved workaround. FR-085.
- Frontmatter edge cases are common in third-party and hand-made artifacts. The shared scalar parser does not itself reject every block/multiline shape, and a late closing delimiter cannot be read past the 8 KiB limit. Use explicit unavailable reasons for BOM, malformed/unsupported values, duplicate keys, bad UTF-8, and read errors; never turn failed parsing into "No description" or a declared name. FR-085-086.
- Project rows add separate Installed coverage now, not in a future 079. A failed scan must not hide readable packs or turn partial totals into confirmed zeros, and project keys must never become pack-operation targets or source-removal blockers. FR-084-088.
- Documentation enlarges Reload payloads and is untrusted. In 080, bound each document, keep content inert, and count any renderer against the existing 358,400-byte compressed bundle budget; 073 adds none. FR-077.
- All nine current installed records are Unlisted. In 080, pack documentation found by name in the local catalog may not match installed bytes; disclose that distinction and read installed member READMEs locally. FR-062, FR-077.
- Visible annotations could be mistaken for product placeholders or approval of documentation behavior. FR-078 keeps them non-interactive, labeled Planned (080), and outside product captures/acceptance. Retain the old P3a framing advisory as historical evidence, but do not carry its partly hidden sample rows into round-5 product inspection. Documentation in P1/P2/P4 remains planned.

Future execution dispatches must enumerate intended source, test, docs, and generated writers. `build-dev` also owns the existing development-base-release record; unexpected changes there or elsewhere require the existing scope owner, not opportunistic edits. Preserve unrelated dirty work and local model/pack overrides.

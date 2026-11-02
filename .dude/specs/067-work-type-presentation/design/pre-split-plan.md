# Plan: Work Type Presentation

Spec: `.dude/specs/067-work-type-presentation/spec.md`
Owner: `.dude/ideas/067-work-type-presentation.md`

Admit two optional internal scalars in the existing idea ledger frontmatter, let the existing brainstorm writer record them when the work is clear, and show them through the existing Canvas projection as plain words or not at all. Derive stage with one shared rule for the work list and details, read design status from specification bytes that details already read, and assemble the read-only progress report with one pure function where the Canvas server already returns the selected projection, so Canvas and any later reader receive the same report. Capture keeps today's request shape and gains only plainer copy. Add no route, capture field, store, state file, classifier, checkpoint writer, poller, or dependency.

The revised spec passed the definition gate before this plan was revised: its sections are complete, every requirement is testable, its criteria are measurable, and it has no unresolved clarification. Design is `proposed`. The round 3 canonical mock at the spec's `preview_path` renders the text-first revision and awaits the user's explicit approval. This plan describes the intended implementation behind the revised capability envelope and authorizes no UI source change. Implementation units are derived only after the user explicitly approves that exact mock. This plan has no ObjectiveRegistry region.

## Technical Context

| Field | Choice |
| --- | --- |
| Language and runtime | Existing JavaScript ES modules on the current Node 20 or later baseline, with CI on Node 20 and 22; existing React and Fluent UI v9 Canvas bundle. |
| Dependencies | None new. |
| Storage | Two optional scalars in the existing idea ledger frontmatter. No other store. |
| Platform | Current Canvas extension and loopback server on Windows, macOS, and Linux. |
| Testing | Existing `node --test` suites, browser runners under their existing Node 22+ harness requirement, build and projection checks, and installed-host acceptance. |
| Performance | No new file reads for the list: ledger bytes are already read per context. Details parse specification bytes already read for the Revision Log. The report reads no files; it combines the cached projection with the provider's in-memory feed. |
| Constraints | No new HTTP route or capture field, no classifier or classification state, and no persisted report, polling, tracked-phase backfill, or reads of unselected packages beyond today's work index. |

## Chosen Structure

### 1. Internal keys and admission

In `src\skills\dude-engine\lib\feature.mjs`, export:

- `IDEA_CLASSIFICATION_KEYS = ['work_intent', 'work_domain']`
- `WORK_INTENTS = ['create', 'fix', 'maintain', 'explore']`
- `WORK_DOMAINS = ['code', 'design', 'writing', 'video']`
- `readWorkClassification(scalars)`, returning `{ workIntent, workDomain }`, each an allowed token or `null`. An absent, empty, or unrecognized value is `null`.

`CANONICAL_IDEA_KEYS` gains the two keys after `depends-on`. The inventory adds no diagnostic for classification values, so identity parsing, ownership resolution, and every existing diagnostic stay unchanged. The keys deliberately avoid the existing `intent`, `type`, `kind`, and `work_type` names; specifications keep `work_type: design` as the design-workflow marker.

Every strict parser of idea frontmatter must accept the keys:

- `src\skills\dude-lightweight-execution\backlog.mjs`: replace its identical local `IDEA_KEYS` with `CANONICAL_IDEA_KEYS`, so `@dude status` and the backlog-backed work index keep reading classified ledgers.
- `src\skills\dude-feature-definition\publish-first-definition.mjs`: set `OWNER_KEYS` to `CANONICAL_IDEA_KEYS`, and extend the byte-preservation loop from `title`, `slug`, and `depends-on` to both classification keys, with the existing both-absent allowance applied to every optional key.
- `src\skills\dude-feature-definition\atomic-file-batch.mjs`: let `assertDefinitionOwner` admit the two keys, and refuse a staged owner whose classification lines differ from the current owner's. Leave its `depends-on` handling unchanged.
- `publish-first-capture.mjs`, `src\skills\dude-work\recovery.mjs`, and the projection already parse with `CANONICAL_IDEA_KEYS`; they need no code change.

Ordering is a hard constraint. Until these admissions and their generated projections land, a ledger carrying either key makes the whole inventory fail with `FEATURE_FRONTMATTER_MALFORMED`, which would block lint, capture, definition, Canvas, and Work. No ledger, including this one, carries the keys during definition.

### 2. Maintainer check

`src\skills\dude-lint\lint.mjs` parses each ledger's frontmatter in its existing ledger-structure pass and warns once per empty or unrecognized classification value, naming the path, key, and allowed tokens. It skips ledgers the inventory already reports as malformed. A warning keeps one bad scalar visible without failing the lint that both publishers run inside their rollback boundaries. No publisher adds a refusal of its own.

### 3. Who records the values

No code records a classification. The Spec Lead's existing brainstorm staging, which serves chat brainstorm, Canvas capture, and Save as work item alike, writes the keys under the guidance in section 7, and the existing publishers apply them. Canvas sends no classification, and nothing in the browser, the Canvas server, or the provider infers one. There is no confidence value, provenance record, suggestion state, or approval queue. Definition, re-definition, Work, and Ship preserve the keys byte for byte through the admissions in section 1.

### 4. Shared projection

In `src\extensions\dude\lib\projection.mjs`:

- `discoveryProjection` reads classification with `readWorkClassification` from the ledger frontmatter it already parses and adds `classificationWords` to every context: the plain words for each recorded value, intent first, or an empty list when neither is recorded or the record cannot be read. One pure `classificationWords({ workIntent, workDomain })` with one word table keyed by the engine tokens produces the list, so the words change in one place. Each context also keeps the normalized `workIntent` and `workDomain` tokens that `readWorkClassification` already returns, adding no stored state, inference, route, or control, so a later reader such as 087 reads stable identifiers instead of parsing on-screen words, which serve only presentation. Both `/api/projection` and `/api/work-index` carry these contexts, so list and details share one source.
- Add one pure `workStage(facts)` with the table under Contracts. `readWorkIndex` adds `stage` to every item, `null` unless its availability is current. `readNowProjectionWithOperation` uses the same function in every branch and drops `Idea`, `Verified`, and `Completed without a package`. On tracked boards, a ready or open issue alone yields Defined.
- Keep the work-index `group` unchanged. The UI uses it only for notes: `next`, `prioritized-later`, and a `blocked` group whose `stage` is not Blocked (an unmet declared dependency).
- Details parse `work_type` and `design_status` from the selected specification bytes with the default frontmatter mode, since specifications carry other keys. Expose `design: null` unless `work_type` is `design`; otherwise `{ status }`, where status is `exploring`, `proposed`, `approved`, or `unrecognized`.
- Replace idea and feature wording in orientation strings, such as "This feature is still an idea.", "This idea has no task definitions.", and "Select a feature", with neutral wording from the approved mock.
- Tracked task details keep `phase: null`. Nothing reads Markdown phases while tracked work is authoritative.
- Add one pure `progressReport(projection, feed)` that assembles the read-only report for the selected item from the projection's existing facts and an optional provider feed read. Each recorded part carries its coverage and its source, an entry from the projection's existing `sources`. `design` repeats `projection.design` with the specification as its source, so details show the recorded status, including `exploring`, before any checkpoint exists. Design approval is the only gate, present while `design` exists with a status other than `approved`. Checkpoints are only a recorded `proposed` or `approved` status. Requests use the existing Respond-entry rule, `pending` records whose scope exactly names the item, and appear only under `requests` as supporting detail, whatever their presentation-only `blocking` flag says. Their provenance is the Needs you feed itself, never a ledger, specification, or a request's bound file. Task counts never become a checkpoint, gate, or request.
- `progressReport` sees request evidence only when its caller passes a feed. With `feed` null, `requests` repeats the projection's `coverage.live` with a null `source`, and it stays `unavailable` because disk cannot prove that no request is current. The projection pipeline never passes a feed.

In `src\extensions\dude\lib\canvas-server.mjs`, the response boundary that already holds both the cached selected projection and the joined provider:

- The existing GET `/api/projection` and POST `/api/refresh` responses add `progress`, built from the projection in that same response and the provider's current `read()`, or from `null` on a read-only Canvas without a provider. Nothing caches or persists `progress` or adds it to the frozen projection, so projection identity and freshness keep their meaning.

### 5. Capture

The capture contract does not change. `POST /api/needs-you/capture` keeps `{ captureReceipt, intent, continuation }`, where `intent` is the user's literal text. The fixed-purpose capture prompt, the `captures[]` view, the `capture_intent` tool result, and the acknowledgment reread stay as they are, so `src\extensions\dude\lib\needs-you.mjs` needs no change. The earlier plan's `workIntent` and `workDomain` inputs, client draft choices, reread classification, mismatch notices, and their planned tests are withdrawn; none was implemented.

Only copy changes, in `src\extensions\dude\frontend\needs-you.jsx` and `use-canvas-data.js`:

- The New work item form keeps one text field and Submit, Save, and Cancel, with today's meanings, enablement, locking, retry, and no-replay rules. Its header prose becomes the approved short description of Submit and Save, and the unfiled-draft line is removed.
- While Submit and Save are disabled, one notice names the first condition that applies, in this order: no connection, an unfinished import, a pending request, an earlier capture not yet confirmed, then a busy session. Each notice states the reason and the next step, and both disabled buttons keep naming it with `aria-describedby`. The conditions come from the same feed fields as today.
- `ResponseStatus`, when it renders a capture, and the capture-specific messages (`idle_required`, `capture_unreconciled`, `capture_send_uncertain`, and `IMPORT_IN_PROGRESS`) use the approved plain copy. Request-response copy outside capture stays unchanged.
- Save as work item keeps its behavior. Its notice says that it saves the text for later and neither answers the question nor gives permission.

### 6. Canvas presentation

In `src\extensions\dude\frontend\app.jsx`, `needs-you.jsx`, and `styles.js` only as needed:

- Apply the approved neutral labels to the rail entry, the Overview action, the blank-workspace prompt, the list summary, the details eyebrow, Save as work item with its form's field and button, and the details section that shows the captured text. Destinations and their order stay the same.
- List rows show `classificationWords` joined by " · " as secondary text in the Name cell, and nothing when the list is empty. Status shows `item.stage` plus any group note. Each row's accessible label includes the number, the title, the words joined by commas when there are any, the stage, and progress. Add no column, filter, or sort.
- The details header shows the neutral eyebrow, the title, the stage, and the classification words when there are any. It has no Intent, Domain, or Stage field list, no placeholder for an unrecorded value, no correction instruction, and no edit control.
- The existing Lifecycle and progress section becomes the progress report. It formats the adopted `progress` as received and derives no phase, checkpoint, gate, or waiting state from counts or other fields:
  - The stage, the current phases or phase not exposed, the recorded design status with any checkpoint reached, and the required gates, each with its source.
  - Waiting for you, with the request kind and owner, for each request item, and the request status with its reason and source whenever it is `partial` or `unavailable`.
  - One summary sentence for the parts in `progress.unknown`.
  - The existing counts, progress bar, and recorded-state disclaimers, still shown only as counts.
- In `use-canvas-data.js`, adopt `progress` with its projection from POST `/api/refresh`. A cycle that rereads only the request feed also reads GET `/api/projection`, which reads no files, and adopts its `progress` only when that projection has the shown projection's `readAt` and selected identity. The existing Respond and Review entries keep their rules.
- `ReviewEntry` shows its reason text only when `orientation.design` exists or a preview request exists. With partial request coverage, that reason says Canvas cannot confirm whether a preview request is waiting, never that none is.
- Search, Show, Working on and Clear, the rail, the compact list, the task dock, and the appearance modes stay unchanged.

### 7. Guidance and documentation

- `src\skills\dude-feature-definition\SKILL.md`, Brainstorm: when the Spec Lead stages a first capture or an explicit brainstorm refresh, it may write `work_intent` and `work_domain` from the user's unchanged description and the actual project context when a value is clear, and it omits a key otherwise. It never asks a question only to fill them, writes an empty or unrecognized value, changes the user's text to fit them, or backfills records in bulk. It may add a missing value, but it replaces a recorded one only when the user says it is wrong. Neither change touches `status:` or `spec_path:`, and definition preserves the keys.
- `src\skills\dude-work-intake\SKILL.md`, Explicit Capture And Deferral: state that a capture carries only the literal text and continuation, and that brainstorm may record classification under the definition skill's rule. Rename the capture labels to New work item and Save as work item.
- `docs\reference.md`, Definition Rules: list the optional internal keys and their tokens.
- `docs\commands.md`: in `@dude brainstorm`, describe the internal keys and how to change them by telling Dude in chat; in Canvas, describe the wording, classification words, stage meanings, progress report, and capture messages; in Canvas maintainer acceptance, add the new checks.

## Contracts

Ledger frontmatter, both keys optional, internal, and unquoted when written:

```yaml
work_intent: fix    # create | fix | maintain | explore
work_domain: code   # code | design | writing | video
```

Projection additions:

```text
context.workIntent: create|fix|maintain|explore|null    normalized token; null when unrecorded, unrecognized, or the record is unreadable
context.workDomain: code|design|writing|video|null    the same rule
context.classificationWords: string[]    [] when nothing is recorded or the record is unreadable
workIndex.items[].stage: Captured|Defined|In progress|Blocked|Completed|Closed|null
projection.stage: the same values, null when unavailable
projection.design: null | { status: exploring|proposed|approved|unrecognized }
```

Classification words, provisional until the revised mock is approved:

| Token | Words |
| --- | --- |
| `fix` | Fix |
| `create` | New |
| `maintain` | Maintenance |
| `explore` | Exploration |
| `code`, `design`, `writing`, `video` | Code, Design, Writing, Video |

Progress report, joined at existing responses:

```text
progressReport(projection, feed | null) -> progress    pure; feed is the provider's read()
GET /api/projection, POST /api/refresh                + progress, built from the projection in the same response
progress.subject       { ideaPath, specPath | null }
progress.stage         { value: projection.stage, source }
progress.phases        { state: current|none|not-exposed|unavailable, source | null, items: [{ name, source }] }
progress.design        null | { status: exploring|proposed|approved|unrecognized, source }    recorded status
progress.checkpoints   [{ kind: design-proposed|design-approved, source }]
progress.gates         [{ kind: design-approval, source }]    required gates only
progress.requests      { state: current|partial|unavailable, reason | null, source: { kind: needs-you, providerGeneration } | null,
                         items: [{ requestHandle, owner, class }] }    supporting detail only
progress.unknown       [phases|design|gates]                  parts with nothing recorded
```

Outside `requests`, every `source` is an entry from that projection's existing `sources`, and `phases.source` is set only when phases are not exposed, naming the tracked board. Request evidence is live, so `requests.source` names the Needs you provider by the `providerGeneration` of the same `read()`, or is `null` when no provider is joined; request items keep the `requestHandle` and `owner` that feed reports. `projection.coverage.live` is unchanged.

Capture, unchanged:

```text
POST /api/needs-you/capture  { captureReceipt, intent, continuation }    intent is the user's literal text
captures[], capture reread                                              unchanged
```

Shared stage rule, evaluated in order:

| Evidence | Stage |
| --- | --- |
| Status is `resolved` | Closed |
| Status is `draft` | Captured |
| Task counts unavailable | `null` (shown as unavailable) |
| Any unfinished task is blocked or carries a blocker reason | Blocked |
| At least one task, and all are done | Completed |
| Any task is in progress or done | In progress |
| Otherwise, including zero tasks | Defined |

## Error And Authority Behavior

| Case | Behavior |
| --- | --- |
| Capture cannot be sent now | One plain notice names the first applicable condition and the next step; the draft stays; nothing is sent later without the user's action. |
| Uncertain capture delivery | Existing rule: no replay; the draft stays. |
| Acknowledgment reread fails | Not Saved, as today. |
| Unclear classification | Nothing is recorded or shown, and no question is asked only to classify. |
| Empty or unrecognized stored value | Read as unrecorded on that record; one lint warning; nothing else is blocked. |
| Structured or duplicate key | Existing inventory error, unchanged. |
| Request feed unavailable or partial, or no provider joined | `progress.requests.state` is `unavailable` or `partial` with its reason, never an empty current list. |
| Current request, blocking or advisory | Listed only under `progress.requests`; never a gate or blocker, and the stage is unchanged. |
| Authority | No routing, Work, recovery, Ship, or definition gate reads classification values, `classificationWords`, or `progress`. Those paths only admit and preserve the keys. `progress` holds no classification and grants nothing; requests are answered only through the existing Respond path. |

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| UI mockup approval is mandatory | Design is `proposed`: the round 3 mock renders the revision, and nothing is approved. Derive no units and change no UI source before explicit approval of that exact mock. |
| Keep it simple | Two optional internal scalars, one reader, one word table, one pure stage rule, one pure report assembler, and copy changes. No capture field, classifier, confidence or provenance record, approval queue, editor route, registry, gate engine, polling, persisted report, or 087 infrastructure. |
| Canvas continuity and no dead affordances | Extend 052, 062, 057, and 085 without redesigning navigation. Capture keeps Submit, Save, and Cancel and gains no control, and classification has no control at all. |
| Deterministic scripts | Admission, preservation, word formatting, stage, and the lint warning are code. Model judgment is limited to the existing brainstorm writer deciding whether a value is clear. |
| Lifecycle numbers mean chronology | Numbers and capture order stay; classification adds no ordering. |
| Beads authority | Tracked phase stays not exposed in the projection and the report, with no Markdown backfill. |
| Draw on established knowledge | GitHub Issues for type versus status, Gmail's automatic inbox categories for a classification people never have to pick, and GitHub check runs for the report split. |
| UI verification handoff | The automated interaction script runs before any host-only observation, including the model-behavior observations under Verification. |

Existing project and bundle guardrails cover this feature. No guardrail candidate arose, so nothing is adopted, narrowed, rejected, or skipped.

## Change Surface

Paths are planned implementation surfaces, not changes made during definition.

| Surface | Change |
| --- | --- |
| `src\skills\dude-engine\lib\feature.mjs` | Keys, vocabularies, and `readWorkClassification`. |
| `src\skills\dude-lightweight-execution\backlog.mjs` | Reuse `CANONICAL_IDEA_KEYS`. |
| `src\skills\dude-feature-definition\publish-first-definition.mjs`, `atomic-file-batch.mjs` | Admission and preservation. |
| `src\skills\dude-lint\lint.mjs` | Empty or unrecognized value warning. |
| `src\extensions\dude\lib\projection.mjs` | `classificationWords`, `workStage`, `design`, `progressReport`, and neutral strings. |
| `src\extensions\dude\lib\canvas-server.mjs` | `progress` on the existing GET `/api/projection` and POST `/api/refresh` responses. |
| `src\extensions\dude\frontend\app.jsx`, `needs-you.jsx`, `use-canvas-data.js`, `styles.js` | Presentation, report adoption and formatting, capture copy, and labels. |
| `src\extensions\dude\ui\assets\app.js` and `app.js.LEGAL.txt` | Rebuilt bundle. |
| `src\skills\dude-feature-definition\SKILL.md`, `src\skills\dude-work-intake\SKILL.md`, `docs\reference.md`, `docs\commands.md` | Guidance and documentation. |
| Tests | `src\skills\dude-engine\lib\feature.test.mjs`, `chronological-identity.test.mjs`, `publish-first-definition.test.mjs`, `atomic-file-batch.test.mjs`, `backlog.test.mjs`, `lint.test.mjs`, `recovery.test.mjs` (classified owner), `projection.test.mjs`, `work-index.test.mjs`, `canvas-server.test.mjs`, and the five pinning scripts below. `needs-you.test.mjs` keeps its existing capture-contract cases and gains no classification case. |
| Generated `.github` mirrors | The projected counterpart of every changed runtime, engine, and skill file. |

`publish-first-capture.mjs`, `recovery.mjs`, and `needs-you.mjs` need no change.

### Build, generated mirror, and private local bytes

`node scripts\dude-canvas-ui\build.mjs` rebuilds the committed UI assets. `node scripts\build-dev.mjs` projects all of core and does not rebundle. Update the `app.js` hash and size pins in `scripts\build-dev.test.mjs`, `scripts\dude-canvas-ui\build.test.mjs`, `browser.test.mjs`, `t011-browser.test.mjs`, and `t012-installed-host.mjs`, and preserve historical design hashes.

When this plan was first written on 2026-10-20, this working tree held private local bytes that no 067 change touches: the modified `.dude\metadata\profile.md`; four `.github` agent model overrides; local edits to `dude.instructions.md` and `agent-models.json` in both `src` and `.github`; `scripts\current-format-contract.test.mjs`; the refreshed installed writing skill; and the untracked technical-docs and Copilot SDK projections, animation pack, and 075 `working.json`. Running `build-dev` here would regenerate core from privately modified sources. Instead:

1. Re-inventory the private paths and record the SHA-256 of each before the first implementation write.
2. Build and run full acceptance in a clean export containing HEAD plus only the 067 source changes, with every private path at its HEAD bytes.
3. Integrate into this working tree only the 067 source files, the rebuilt UI assets, and the exact generated outputs selected through `listCoreOutputs` and `writeCoreOutput` from `scripts\build-release.mjs`. Refuse missing or duplicate matches.
4. Re-hash the private paths and stop on any difference.

No Git action is part of this plan.

## Verification

These are planned checks for implementation and testing owners. No terminal command, build, test, or lint ran during this definition. Name new cases `067 Work type:`. On Windows, run one `node --test` process per file, at most six in parallel and `canvas-server.test.mjs` alone. Compare against a per-file baseline scheduled the same way before implementation. Run both browser suites explicitly and serially with `DUDE_CANVAS_BROWSER_REQUIRED=1`. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage.

| Trace | Required evidence | Runner |
| --- | --- | --- |
| FR-004 to FR-011; SC-004, SC-007 | Classified ledgers pass inventory, first capture, first definition, re-definition, backlog, and the Work owner check; preservation refusals; empty and unrecognized values read as unrecorded and give one lint warning with no failure; unclassified fixtures stay byte-identical. | `feature.test.mjs`, `chronological-identity.test.mjs`, `publish-first-definition.test.mjs`, `atomic-file-batch.test.mjs`, `backlog.test.mjs`, `lint.test.mjs`, `recovery.test.mjs` |
| FR-035 to FR-037; SC-009 | `classificationWords`, `workIntent`, and `workDomain` for every token, each value alone, neither, unrecognized, and unreadable; list rows, compact rows, details headers, and accessible labels show the words or nothing, with no placeholder or warning. | `projection.test.mjs`, `work-index.test.mjs`, `browser.test.mjs` |
| FR-019 to FR-024; SC-001, SC-002 | Every stage-rule row for Lightweight, tracked (open-only, ready, in progress, partly closed, all closed), draft, and resolved; equal stage in work-index items and details; dependency note leaves the stage unchanged. | `projection.test.mjs`, `work-index.test.mjs` |
| FR-025 to FR-031; SC-006 | `progressReport` fixtures: `design` from specification bytes at every recorded status, including exploring and unrecognized; current phases, including two at once; tracked phase not exposed, citing the tracked board, with no Markdown backfill; design approval as the only gate; blocking and advisory requests only under `requests`; unavailable, partial, and provider-less request coverage, with `requests.source` naming the provider read or null without a provider. Both responses carry `progress` built from their own projection, the report's request rule matches the Respond entry's for one feed, and details render exactly the adopted report's parts. | `projection.test.mjs`, `canvas-server.test.mjs`, `browser.test.mjs` |
| FR-012 to FR-016; SC-003; VSC-005 | The capture body stays exactly `{ captureReceipt, intent, continuation }` under the existing contract cases; the form has one text field and no classification control; each disabling condition and each status shows its plain copy with the draft kept; no replay after uncertainty; Saved only after the reread. | `needs-you.test.mjs` (existing cases), `canvas-server.test.mjs`, `browser.test.mjs` |
| FR-008, FR-009, FR-015, FR-017, FR-018; SC-005, SC-010 | After the harness passes, an installed-host session captures one clearly described defect with Submit and one vague description with Save, then changes one recorded value by telling Dude in chat. Record what was observed: the keys each ledger holds, any question Dude asked, and the bytes the change touched. These observe model behavior; they are not deterministic tests. | Installed-host acceptance with read-only ledger inspection |
| FR-001 to FR-003, FR-032, FR-033; VSC-001 to VSC-004 | Neutral labels; no idea or feature kind; mock guidance only when applicable; no classification control anywhere; list, compact list, dock, and themes; keyboard, accessible names, contrast, geometry, and screenshots. | `browser.test.mjs`, `t011-browser.test.mjs`, `t012-installed-host.mjs` |
| FR-034; SC-008; delivery parity | Approval precedes units and UI source; source, generated, and asset bytes, the legal inventory, and five pins agree; private-path hashes are unchanged. | Design owner; `build.test.mjs`; `build-dev.test.mjs` projection check |

Complete the automated interaction script before requesting human host observation, and limit that observation to embedded-host behavior and model behavior the harness cannot establish.

## Intended Slices And Handoff

1. Design loop: the visual specialist revised the primary mock at `preview_path` as round 3 within the revised capability envelope, using the spec's Mock Scenario Matrix and the coordinator's handoff for this revision, and kept the round 2 files as a variant for comparison. The spec records it as `proposed` with its Proposed Direction and Revision Log. Implementation waits for the user's explicit approval of that exact revision.
2. After approval, the definition owner derives new open units in this serial order:
   1. Classification foundation: sections 1 to 3, the section 7 Brainstorm and capture guidance, `docs\reference.md`, their tests, and their generated mirrors. No UI change. The admissions land with or before the guidance that lets the writer record the keys.
   2. Shared projection and report: section 4, including the `canvas-server.mjs` join, its tests, and its mirror.
   3. Capture copy and Canvas presentation: sections 5 and 6, `docs\commands.md`, the UI rebuild, pins, browser and installed-host acceptance, and the Design Close Protocol.
3. Each unit gets one Tester and one independent Reviewer through ordinary Work. Task state, claims, and closure stay with the coordinator. Execution defaults to Lightweight.

## Risks And Reversibility

- Admission order: writing the keys before every strict parser accepts them breaks the whole inventory. The serial slices and the no-keys-during-definition rule prevent this.
- Mixed runtimes: an older installed core or another branch without admission rejects classified ledgers. Do not classify real ledgers until the admitting core is what Canvas and Work run.
- Wrong inference: a recorded value can be wrong. It changes only quiet words, nothing routes or gates on it, and the user changes it by telling Dude in chat.
- Sparse classification: many items, including every existing one, will show no classification words. That is intended; rows still lead with the title, stage, and progress.
- Vocabulary drift: the mock review may change words or tokens before implementation at little cost. Afterward, adding a token is backward compatible; removing or renaming one requires explicit edits to the affected records, never bulk inference.
- Changed stage words: Verified and Completed without a package disappear in favor of Completed and Closed. The documentation explains the change.
- Two reads per cycle: the report and the existing Respond entry read the same provider separately. A provider change publishes an event, and the next cycle rereads both; a test holds both to one rule for the same feed.
- Reverting the feature requires removing any written classification lines first, because older strict parsers reject them. No other migration exists.

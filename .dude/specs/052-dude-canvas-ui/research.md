# Research: Dude Canvas UI

## Ground-Truth Summary

The current repository has 54 direct numbered idea ledgers, 47 defined packages
with `tasks.md`, three core agents, 21 core skills, and 18 catalog packs. The
dogfood profile installs nine packs: authoring, clearline, coding, design,
fluent-ui, release, rubber-duck, strata, and writing. The installed projection
has two documented `fluent-ui` -> `web` orphan-reference warnings and zero
failures. Clearline and Strata remain installed by user choice; neither is the
selected system for this feature.

The current task state is 13 total: T001, T005, T006, and T007 are done; T002
is blocked; eight tasks remain open. A current-session extension reload proved
provider registration through the current canvas catalog. The host has not yet
shown the iframe rendering, its viewport log, behavior when reopened, or
cleanup after close. The temporary three-file projection is evidence only;
T009 remains open.

Dude's user lifecycle is `brainstorm -> define -> work`, with `ship` advancing
missing stages. Definition Only uses the exact idea or exactly owned package.
Lightweight Execution uses canonical task units. Tracked Execution uses Beads
after import, including when no issue represents the selected feature.
`task-state.json` is only a drift snapshot.

Core source is under `src/`; development and release builds project accepted
paths into `.github/`. Current ownership, cleanup, release, and upgrade
inventories do not yet carry `.github/extensions/dude/**`. Extending that exact
path and carrying committed frontend output fits the existing projection.

The Copilot SDK discovers `.github/extensions/<name>/extension.mjs`, supplies
the SDK import, and attaches `joinSession()` to the active session. `open()`
returns a loopback iframe URL. The session provides send, wait, events, abort,
and logging. Sharpie proves the loopback/static/SSE/session architecture and
also preserves later Review findings; none of its deferred product behavior is
part of I1.

## Framework Research Decision

Microsoft Fluent 2 is selected. The user's requirement to use Microsoft's
Fluent components selects `@fluentui/react-components` (Fluent UI React v9),
which selects React. The reason is consistency and maintainability.

Verified comparative facts:

- A minimal React baseline measured about 193.0 kB raw / 60.2 kB gzip.
- The Fluent umbrella proxy measured about 1,259.9 kB raw / 318.8 kB gzip.
  Fluent declares `sideEffects: false`, so production tree shaking applies.
  These are proxy measurements, not the final app bundle; the exact I1 bundle
  remains unmeasured.
- Fluent UI React 9.74.7 supports React 17, 18, and 19.
- Fluent v9 uses Griffel at runtime to resolve and insert atomic styles.
- Fluent React has no supported first-party no-build browser path.
  A maintainer build followed by committed static assets is viable and keeps
  consumers install-free.
- Svelte's compiler and accessibility diagnostics were attractive, but Svelte
  cannot host Microsoft's selected Fluent React components.
- Fluent Web Components 3.1.3 is framework-agnostic but lacks Card and a
  general-purpose List. It was not selected.
- The supplied BCMS comparison is secondary listicle evidence only. Its
  SSR/SEO/CMS weighting is irrelevant to this canvas, and its scores are not
  reproducible, so it has no decision authority.

Use esbuild for the maintainer frontend build. It directly supports JSX,
tree shaking, minification, deterministic named static output, and committed
assets with less configuration than Vite or a hand-assembled Rollup pipeline.
Consumers still unpack static assets and perform no npm install, network fetch,
or runtime build.

## Chosen Build And Projection Topology

Authored product source separates runtime Node files, build-only React source,
and committed browser output:

```text
src/extensions/dude/
  extension.mjs
  lib/**                         # runtime Node files
  frontend/{app.jsx,theme.js,styles.js}
  ui/index.html
  ui/assets/app.js
  ui/assets/app.js.LEGAL.txt      # only when notices are required
  *.test.mjs
```

Only `extension.mjs`, runtime `lib/**` files, `ui/index.html`, and generated
`ui/assets/**` map into `.github/extensions/dude/`; frontend source and all tests
do not. Scoped maintainer tooling lives separately at
`scripts/dude-canvas-ui/{package.json,package-lock.json,build.mjs}`. Its lockfile
pins React, ReactDOM, Fluent, Griffel transitives, and esbuild; the package is
private, Node `>=20`, and remains in the already release-excluded `scripts/`
tree.

This topology avoids a root package manifest or workspace because no other
current repository caller needs a JavaScript dependency graph. It also keeps
npm/esbuild and authored JSX out of development, release, upgrade, and consumer
runtime projection. Release and upgrade copy only committed runtime bytes.

Fluent theming uses `FluentProvider`. Host canvas variables may seed light and
dark themes while Fluent component anatomy remains intact. Stock
`colorNeutralStroke1` fails the required 3:1 non-text contrast in measured light
and dark pairings. Interactive boundaries use
`colorNeutralStrokeAccessible` or an independently verified equivalent theme
override; Stroke1 remains acceptable for decorative rules.

## D1 - Current Functionality To User Jobs

The inventory remains broader than lifecycle 052. Only rows marked I1 may enter
this feature's product acceptance.

| ID | Capability | Current command/file/source | User goal | Prerequisites | Failures | Job story | User job vs infrastructure | One-decision decomposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N01 | Current stage | `@dude status`; idea `status:`; exact package owner; active authority | Know where one feature is | Safe inventory and settled selection | Ambiguous owner, malformed state, unavailable tracker | When I return to a feature, I want its current stage so I can regain context. | User job; I1 | Select feature, then read stage; no other choice. |
| N02 | Next step | `@dude status`; `parseTasks` readiness; tracked ready/in-progress state | Know what to do next | N01 plus valid current authority | No ready work, unresolved dependency, unavailable authority | When I know the stage, I want one next step so I can resume. | User job; I1 | Present the current default; disclose alternatives separately. |
| N03 | Blockers and unanswered-question count | `blocked-by:`, dependencies, Beads, `## Open Questions` | See what needs attention | Selected exact idea/package | Malformed questions, missing reason, authority conflict | When progress cannot continue, I want the cause and pending-question count so I know what needs attention. | User job; I1 | Show blockers and count separately. |
| N04 | Freshness and source detail | Read-only status, source paths, mirror status, Coordinator Log | Know whether the view can be trusted | Complete current-authority read | External edit, partial read, stale mirror, failure | When state can change elsewhere, I want read time and authority source so I can judge whether to refresh. | User job; I1 | Refresh is one decision; source detail is one disclosure. |
| N05 | Feature selection | Exact slug/path selection and status ambiguity rules | Choose the feature I mean | Clean direct inventory | Zero/several candidates, invalid target | When several features exist, I want an honest chooser so the UI never guesses. | User job; I1 conditional | Exact target, one auto-selection, or one chooser decision. |
| C01 | Ship one lifecycle target | `@dude ship [<target>]` | Advance one accepted outcome through missing stages | Valid target; roster | Resolved target, ambiguity, ownership diagnostic, Work stop | When an outcome is settled, I want one verb to advance it until a real stop. | User job; future action | Choose target only. |
| C02 | Read status | `@dude status` | Orient without changing anything | Readable current state | Ownership ambiguity or unavailable authority | When I need orientation, I want a read-only snapshot so I can decide safely. | Current baseline and I1 source | Choose feature only when ambiguous. |
| C03 | Capture or refresh an idea | `@dude brainstorm <idea>` | Preserve rough intent | One bounded outcome | Split ambiguity, invalid inventory, terminal resolved state | When I have rough intent, I want it captured in my words. | User job; future | Decide one outcome, then review. |
| C04 | Define a feature | `@dude define <selector>` | Produce spec, plan, and tasks | Draft ledger | Collision, clarification, checkpoint, lint failure | When intent is settled, I want an inspectable package so implementation does not guess. | User job; future | Define, then answer only the current gate. |
| C05 | Run ready work with a budget | `@dude work [feature] --max <N|unlimited>` | Execute bounded ready work | Defined work and specialists | No lane, no ready work, stop, invalid budget | When work is ready, I want a bounded run so I control how far it proceeds. | User job; future | Default run; change maximum only when needed. |
| C06 | Work until blocked | `--until blocked` | Continue to a natural stop | C05; no recovery option | Invalid combination, ordinary stops | When I can supervise a longer run, I want work to continue until a real boundary. | Advanced future job | Toggle one choice. |
| C07 | Permit recovery | `--recover-on-block` | Allow an inspected retry | C05 and post-block inspection | Hard stop, no progress, evidence or authority failure | When a recoverable attempt fails, I want a bounded inspected retry. | Advanced future job | Off by default; one opt-in. |
| C08 | Set recovery cycles | `--recovery-cycles` | Bound retries per target | C07 | Invalid without recovery, budget exhausted | When I allow recovery, I want a cap. | Advanced future job | Expose only with recovery. |
| C09 | Choose policy | `--policy guarded|autonomous` | Choose who authorizes eligible attempts | C05; explicit choice | Hard stops still apply | When I trust the plan, I want autonomous continuation without weaker gates. | Deliberate future job | Guarded default; one explicit choice. |
| C10 | Route a blocker | `@dude flag [type:] <details>` | Send a gap to its owner | Concrete mismatch | No related task, wrong class, define still required | When work exposes a gap, I want it routed correctly. | User job; future | Describe one blocker. |
| C11 | See recent writes | `@dude diff` | Understand recent Dude changes | Matching logs/events | Ambiguous owner, no event | When Dude changes artifacts, I want a compact audit. | User job; future detail | Optional feature filter. |
| C12 | Check workflow hygiene | `@dude self-check` | Detect workflow drift | Current workspace | Drift is reported, not repaired | When I suspect drift, I want a read-only check. | Advanced future job | Run, then choose one correction. |
| C13 | Discover packs | `@dude list packs`; Compose catalog | Find optional capability by need | Local/fetchable catalog | Unavailable or malformed catalog | When core lacks a specialty, I want options by use case. | Future Team & Packs | Choose use case, then pack. |
| C14 | Add a pack | `@dude add pack <name>` | Install optional capability | Explicit intent and preview | Collision, unsafe path, lint failure | When I need capability, I want to add it after seeing changes. | Deliberate future job | Choose, preview, confirm. |
| C15 | Remove a pack | `@dude remove pack <name>` | Remove recorded files safely | Installed profile | Bad profile or unsafe path | When a pack is no longer useful, I want exact removal. | Destructive future job | Choose, preview deletion, confirm. |
| C16 | Refresh a pack | `compose refresh <name>` | Reproject pack source | Installed pack | Missing source, drift, transaction failure | When pack source changes, I want its projection refreshed. | Maintainer future job | Preview, confirm. |
| C17 | Start/resume tracked work | `@dude track` | Use issue tracking | Beads and exact owner | Unavailable Beads, mapping ambiguity | When markdown tasks need issue state, I want one live board. | Future Work | Adopt tracking deliberately. |
| C18 | Sync Beads to markdown | `@dude sync Beads to tasks.md` | Refresh portable mirror | Tracked authority and key mapping | Unsupported status or ambiguous owner | When Beads changed, I want the mirror refreshed. | Maintenance future job | Invoke; report unmapped rows. |
| C19 | Manual task import | explicit Beads import | Opt into tracked work manually | Beads, owner, valid tasks | Identity, grammar, state, dependency failure | When I want explicit import, I want open tasks mapped safely. | Advanced future job | Select package, preview, confirm. |
| C20 | Remember knowledge | `@dude remember: <fact>` | Persist durable project knowledge | Correct ledger and duplicate check | Duplicate, contradiction, warning | When knowledge should survive, I want it stored correctly. | Future Memory | State one fact. |
| C21 | Hire or create skill | `@dude hire`; skill authoring | Add missing expertise | Clear non-overlapping scope | Duplicate or ambiguous role | When expertise is missing, I want a focused specialist or skill. | Advanced future Team | Choose agent versus skill. |
| C22 | List team | roster discovery | Know available specialists | Valid agent roster | Malformed/ambiguous record | When I need routing context, I want current scopes. | Future Team | Read-only. |
| C23 | Modify/remove role | coordinator roster actions | Correct the roster | Exact role and ownership | Ambiguity or lost coverage | When a role no longer fits, I want safe change. | Deliberate future Team | Select, preview, confirm. |
| C24 | Upgrade core | `@dude upgrade` | Refresh upstream core | Manifest/profile, Git, clean tree | Stale plan, divergence, lint failure | When a release is available, I want a reviewed safe upgrade. | Maintainer future job | Review plan, confirm. |
| C25 | Upgrade core and packs | `@dude upgrade --all` | Refresh opted-in components | Successful core upgrade | Pack refusal or partial result | When I want a full refresh, I want safe separate phases. | Maintainer future job | Confirm core, then packs. |
| C26 | Preview/pin upgrade | `--dry-run`, `--ref`, `--source` | Control exact upgrade | Upgrade inputs | Invalid source/ref, expired plan | When I need control, I want preview or pinning. | Advanced future job | One source choice, one removal choice. |
| C27 | Roll back upgrade | `@dude upgrade --rollback` | Restore safety point | Clean tree and safety tag | Missing tag or lint failure | When an upgrade is bad, I want bounded rollback. | Destructive future job | Select safety tag, run. |
| C28 | Use one GitHub issue | issue intake | Route issue content | Retrievable single issue | Fetch failure, multiple refs, ambiguity | When work starts in an issue, I want the existing route used. | Future intake | One issue and at most one class choice. |
| C29 | Import external artifacts | `dude-bundle-import` | Reuse reviewed artifacts | Supported source and confirmation | Risk, license, destination conflict | When useful artifacts exist elsewhere, I want safe import. | Maintainer future job | Choose scope, review exact plan. |
| C30 | Save/deploy bundle | `dude-portability` | Move bundle/project state | Explicit roots and overwrite decisions | Collision or metadata mismatch | When changing roots, I want owned state to travel. | Maintainer future job | Choose scope, resolve collisions. |
| C31 | Debug failure | systematic-debugging skill | Find root cause | Reproducible evidence | Non-reproduction or repeated hypotheses | When behavior fails, I want evidence-led diagnosis. | Routed future job | Reproduce, test one hypothesis. |
| C32 | Verify/review/close | verification and Reviewer protocols | Trust completion | Fresh evidence and independent review | Failed check, rejection, ambiguity | When work claims completion, I want current evidence first. | Outcome with infrastructure gates | Reviewer decides; coordinator closes. |
| C33 | Use worktree | worktree skill | Isolate risky work | Explicit request or concrete benefit | Shared writes or merge overhead | When risky work needs isolation, I want another checkout. | Optional future job | Choose isolation or sequential fallback. |
| C34 | Use tests first | TDD skill | Apply red/green/refactor | Explicit opt-in | No failing test or ambient activation | When regression risk matters, I want tests-first practice. | Optional future job | Opt in. |
| C35 | Read closeout | `Completion Closeout:` | Know what closed | Successful close | Unsupported claim | When work closes, I want evidence-based handoff. | Future status/history | Read-only. |
| C36 | Receive retrospective | rubber-duck pack | Learn after completion | Eligible approved close | Advisor unavailable; nonblocking | When a feature completes, I want advisory hindsight. | Optional future job | Install opts in. |
| C37 | Open backlog report | backlog artifacts and renderer | See portfolio state | Fresh derived report | Stale report or malformed inventory | When I need portfolio orientation, I want an openable report. | Future Backlog | Choose report view. |
| C38 | Explore/approve design | design workflow and preview | Approve a rendered direction | Defined package and envelope | Missing preview, dead affordance, no approval | When direction is open, I want a real mock before implementation. | Active 052 gate | Correct freely, then approve once. |
| I01 | Inventory/ownership engine | engine identity/path modules | Consistent identity behavior | Safe filesystem | Diagnostics or unsafe paths | When state is read, I want consistent identity rules. | Infrastructure | No navigation decision. |
| I02 | Task parser/drift snapshot | task engine | Correct readiness and drift | Valid tasks | Malformed row/dependency/snapshot | When tasks are shown, I want one grammar. | Infrastructure | No navigation decision. |
| I03 | Workspace lint | `dude-lint` | Catch structural drift | Node 20+ | Findings or unreadable paths | When artifacts change, I want failures found. | Infrastructure | One read-only invocation. |
| I04 | Routing/parallel proof | routing skills | Correct safe specialist routing | Discoverable roster | No match, tie, overlapping writes | When work starts, I want the right owner. | Infrastructure | Coordinator chooses or asks on tie. |
| I05 | Review revision | review skills | Correct valid findings | Concrete finding | Repeated finding or weak evidence | When review rejects, I want verified revision. | Infrastructure | One finding at a time. |
| I06 | Learning promotion | memory/skill authoring | Retain reusable lessons | Solved recurring pattern | One-off or duplicate | When a problem will recur, I want proper retention. | Infrastructure | Choose retention level. |
| P01 | Authoring pack | bundle-authoring specialists | Author Dude artifacts | Installed | Wrong owner/namespace | When maintaining Dude, I want artifact specialists. | Optional Tier 3 | Choose artifact type. |
| P02 | Beads pack | work-tracking skills | Use tracked execution | `bd` available | Import/owner/status conflict | When issue tracking is needed, I want one board. | Optional Tier 3 | Adopt tracking. |
| P03 | Clearline pack | Clearline visual system | Apply Clearline when selected | Installed and selected | Token/contrast failure | When Clearline is chosen elsewhere, I want consistent use. | Optional Tier 3; not selected for 052 | Select explicitly. |
| P04 | Coding pack | coding specialists | Define/execute software | Installed | Missing owner/verification | When work is software, I want coding expertise. | Execution infrastructure | Install once. |
| P05 | Copilot SDK pack | SDK specialist | Own SDK integration | Installed | Specialist absent | When building on SDK, I want focused expertise. | Optional Tier 3 | Install or hire. |
| P06 | Design pack | design workflow skills | Explore and approve direction | Installed; defined package | Missing envelope/approval | When UI direction is open, I want durable approval. | Active 052 gate | Iterate, then approve. |
| P07 | Docsy pack | Docsy specialists | Maintain Docsy sites | Hugo and pack | Tool/theme mismatch | When using Docsy, I want theme help. | Optional Tier 3 | Choose Docsy job. |
| P08 | Fluent UI pack | Fluent UI React v9 specialist | Build with Fluent v9 | React and pack installed | Wrong framework/theme boundary | When using Fluent v9, I want component expertise. | Selected execution capability for 052 | Use explicitly. |
| P09 | Hugo pack | Hugo specialists | Build Hugo sites | Hugo Extended | Toolchain mismatch | When using Hugo, I want architecture help. | Optional Tier 3 | Choose Hugo work. |
| P10 | Newsroom pack | newsroom pipeline | Publish source material | Hugo/conventions | Missing source/schema | When content needs publishing, I want valid output. | Optional Tier 3 | Choose article/event. |
| P11 | Practices pack | TDD skill | Opt into tests first | Explicit choice | Ambient activation | When I want TDD, I want a repeatable loop. | Optional Tier 3 | Toggle. |
| P12 | Release pack | release manager/skills | Manage releases | Installed | Pipeline mismatch | When publishing, I want release expertise. | Optional Tier 3 | Choose release goal. |
| P13 | Rubber Duck pack | completion retrospective | Get final hindsight | Eligible close | Unavailable; nonblocking | When complete, I want a retrospective. | Optional Tier 3 | Installed membership opts in. |
| P14 | Rust pack | Rust/Tauri skills | Build Rust software | Cargo | Toolchain mismatch | When work is Rust-heavy, I want expertise. | Optional Tier 3 | Choose Rust/Tauri. |
| P15 | Strata pack | Strata visual system | Apply Strata when selected | Installed and selected | Token/contrast failure | When Strata is chosen elsewhere, I want consistent use. | Optional Tier 3; not selected for 052 | Select explicitly. |
| P16 | Technical Docs pack | traceable docs pipeline | Build large technical docs | Installed and registered sources | Budget/traceability failure | When material is large, I want a traceable pipeline. | Optional Tier 3 | Scope, approve budget, run. |
| P17 | Web pack | web specialists | Implement web concerns | Installed | Owner overlap | When work is web-based, I want concern routing. | Optional Tier 3 | Choose concern. |
| P18 | Writing pack | style/repetition skills | Produce clear prose | Installed | Repetition/style findings | When text is user-facing, I want clean prose. | Quality infrastructure | Apply while drafting. |
| S01 | Load source/artboard | Sharpie source loading | Open exact visual surface | Future Review | Unsafe file/PDF unavailable | When a visual is wrong, I want to point precisely. | Future Review | Choose source. |
| S02 | Annotate semantically | Sharpie tools/capture | Send addressable feedback | Loaded target | Invalid marker or draft | When I see a defect, I want to mark the element. | Future Review | Choose tool and marker. |
| S03 | Check device widths | Sharpie device presets | Reproduce responsive defects | Loaded target | Marker shift | When layout fails, I want that width. | Future Review | Choose preset. |
| S04 | Send review brief | Sharpie report/session send | Ask agent to fix marked problems | Valid feedback/session | Invalid payload, uncertain send | When markup is ready, I want one safe send. | Future Review | Send once; never auto-retry uncertainty. |
| S05 | Read latest submission | Sharpie latest action | Recover review evidence | Existing submission | Missing/malformed report | When returning, I want latest review. | Future Review | Read-only. |
| S06 | Export review | Sharpie exports | Share evidence externally | Capture/destination | Write or browser failure | When evidence must travel, I want non-overwriting export. | Future Review | Choose destination/name/formats. |

## D2 - Disclosure Assignment

Tiering describes the long-term canvas. I1 is read-only Now.

| Group | Assignment and current treatment |
| --- | --- |
| N01-N04 | Tier 1 in I1; freshness summary is visible and exact source detail discloses. |
| N05 | Tier 1 only until selection resolves; chooser replaces the cockpit. |
| C01-C05 | Future Tier 1 context-sensitive actions; none executes in I1. |
| C06-C07, C10-C11, C17, C20, C22, C28, C31-C32, C35-C38 | Future Tier 2 or contextual surfaces; C38 supplied the completed 052 design gate. |
| C08-C09, C12-C16, C18-C19, C21, C23-C27, C29-C30, C33-C34 | Deliberate Tier 3 maintenance or advanced controls. |
| I01-I06 | Infrastructure; never primary navigation. |
| P01-P18 | Tier 3 capability discovery. P06 supplied the completed design workflow; P08 supplies selected Fluent expertise. P03 and P15 remain installed but inactive for 052. |
| S01-S06 | Deferred full-panel Review, with source/annotation/send primary and device/history/export secondary. |

The I1 landing content is target identity, stage, next step and reason, blockers,
unanswered-question count, freshness, and refresh. Authoritative current-task,
progress, latest-event, copyable-command, and source details may appear only
when they remain read-only, coherent, and covered by the same evidence.

The tier model is responsive rather than narrow-first. At narrow widths, Tier 1
uses one column. Wider widths may place stage/next beside attention/freshness or
use master-detail composition. Progressive disclosure controls information
priority, not a permanent 380px shell.

## D3 - Long-Term Information Architecture

The long-term product is a task-specific interaction layer over the active
session. The current approved authority is the Fluent 2 desktop application
shell at
`.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`. It draws
on desktop lifecycle tools. A top command bar, 48px left activity rail, feature
breadcrumb and identity, and bottom status bar provide persistent orientation.
Next is the focal region; lifecycle and progress lead into source-backed Phases
and Activity in the centre, while properties and evidence dock on the right. It
uses all available canvas width, docks regions when room permits, and collapses
coherently when narrow; 360px is compatibility only.

| Surface | Purpose | Responsive treatment | Primary action | Cycle status |
| --- | --- | --- | --- | --- |
| Now | Reorient to one selected feature | Single column when narrow; useful stage/next plus attention/source composition when wider; bounded prose | I1 Refresh only | I1 |
| Needs You | Collect pending decisions from authoritative providers | Single list when narrow; queue plus selected decision at wider widths | Answer through active session | Deferred |
| Work | Show active-authority tasks and evidence | List to master-detail as space permits | Run/resume next | Deferred |
| Artifacts | Read authoritative definition artifacts | Index to readable detail pane with bounded measure | Open source | Deferred |
| Review | Full-panel copied Sharpie workflow | Uses the available panel as a dedicated workspace | Send reviewed feedback | Deferred |
| Backlog | Cross-feature planning from existing derivation | Responsive table/list and detail | Select feature | Deferred; 025 stays live |
| Memory | Read durable memory ledgers | List and bounded reading pane | Open ledger | Deferred |
| Team & Packs | Discover roster and packs by use case | Cards/list to detail, without crowding Now | Inspect capability | Deferred |
| Advanced | Keep deliberate maintenance reachable | Searchable commands and exact previews | Review one action | Deferred |

Now remains home because other jobs start with feature context. Wider composition
must never imply that deferred Needs You, Review, command, or mutation behavior
ships in 052.

## Exact I1 Now Contract

### Selection and ownership

- Exact input selects by current exact slug/path semantics.
- Without input, select only one unambiguous active candidate; otherwise show a
  chooser with no default.
- A package is owned only by one defined direct idea with exact `spec_path`.
- Never fall back from title, number, slug, stem, directory, or filename.

### Authority and projection

1. A populated Beads board is globally authoritative. Bind selected-feature
   execution facts only by exact `spec:` identity.
2. If the selected feature has no matching issue, retain safe local identity,
   title, package, question, source, and lifecycle/definition-event facts; mark
   execution unavailable and show typed authority attention.
3. Otherwise, without tracked import, current status evidence may select
   Lightweight authority from canonical tasks.
4. Otherwise use Definition Only authority.
5. The drift snapshot never supplies live facts.

The stage is Idea, Defined, In progress, Blocked, Verified, Completed without a
package, or Unavailable only when current authority supports it. Next work
follows current status readiness and dependencies. Blockers retain source and
classification. Questions count only safely identifiable unanswered entries.

### Freshness and state behavior

Every complete projection records `readAt` and source content identities. A
focus check reports change without replacing content. Refresh swaps one complete
successor. Errors retain the prior complete view with a stale label. No watcher,
modification-time selection, persistent cache, or mixed-read projection exists.

### Approved desktop-shell contract

- The canvas fills available host width.
- Match the approved preview's persistent chrome: top command bar, 48px
  activity rail, feature breadcrumb and identity, and bottom status bar.
- Keep Next focal, place lifecycle and progress before the central Phases and
  Activity content, and dock properties and evidence at the right.
- Genuinely narrow width uses one coherent collapsed composition.
- Medium and wide widths dock useful regions rather than stretching cards or
  prose.
- Text measures stay bounded inside fluid regions.
- 360px is a minimum compatibility/accessibility case.
- Representative narrow, medium, and wide widths are recorded from actual host
  behavior during I0 and dogfood. They are evidence values, not permanent
  380/480 product breakpoints.
- The approved canonical preview and final dogfood demonstrate all three
  compositions.

## Five Product Flows

These preserve product direction; later actions are not 052 work.

1. **Cold start**: I1 explains that no feature exists. Later Brainstorm and
   decision controls send work through the active session.
2. **Resume**: Select exact or one unambiguous feature, read Now, inspect source
   detail, and later run the context-sensitive action.
3. **Blocked**: Read blocker source/reason separately from question count; later
   open Needs You or Flag and reconcile after the session result.
4. **Visual review**: Later enter full-panel Review, annotate, validate every
   attachment, send once, route by the future return-path decision, and restore
   prior context.
5. **Level up**: Later use discoverable Advanced and Team & Packs surfaces to
   inspect policy, add a pack, or hire a specialist.

At wider widths, Needs You uses queue-plus-decision and Work may use
master-detail. This architectural compatibility adds no deferred control to I1.

## I1 Dogfood Flow

1. Build committed frontend assets and the development projection.
2. Open canvas `dude` in the real host.
3. Exercise exact and chooser selection.
4. Verify stage, next, blockers, questions, freshness, and source detail against
   current authority, including selected-B/tracked-only-A.
5. Edit an authoritative source externally, detect change, and refresh one
   complete projection.
6. Record actual host narrow, medium, and wide widths and inspect responsive
   composition at each; also test 360px minimum, 200% zoom, keyboard, and
   light/dark.
7. Measure exact built JavaScript/CSS raw and gzip sizes and report against the
   documented budget.
8. Inspect the standard release for committed assets and confirm consumers need
   no install, network, or runtime build.

## I0 SDK Proof Contract

Design approval is complete. A current-session extension reload proved provider
registration through the current canvas catalog. Open, reopen, and close one
Dude canvas and record whether its iframe renders, what viewport it logs, how
focus and reload behave, and whether close cleanup runs. Then read one exact
projection, send one internal request with one identity, surface the completed
result, prove replay/refresh sends once, abort a second proof request, and
re-read authority. Product route and bundle inspection must prove that no
message, command, mutation, retry, answer, approval, or abort capability remains
in I1.

## Superseded-Clause Table

| Historical clause | Current authority | 052 treatment |
| --- | --- | --- |
| Broad six-surface app and I1-I5 | 052 ships I1; I0 is internal | Exclude later workflows. |
| Dashboard/status-lens ceiling | Product is a task-specific active-session layer | Keep compatibility while shipping read-only I1. |
| Most-recently-edited selection | Exact, one unambiguous, or chooser | Never use recency. |
| `task-state.json` authority | Tracked, canonical Lightweight, or Definition Only authority | Snapshot explains drift only. |
| Clearline mandated or Clearline/Strata bakeoff active | Fluent 2 is selected | Preserve old variants as evidence; no active comparison. |
| Framework-free product UI | React and Fluent UI React v9 are selected | Node/HTTP skeleton may remain framework-free; product UI does not. |
| No maintainer build | esbuild compiles committed static assets | Consumer contract remains install-free. |
| 360-480px narrow-first, 380px target, 480px check | Fluid full-width responsive composition | 360px is minimum only; host evidence supplies representative widths. |
| Narrow mobile layouts as the main ADO/GitHub/Jira reference | Wider composition may use established master-detail patterns | Borrow interaction grammar and responsive composition, not fixed clones. |
| Clearline/Strata or responsive-panel primary preview | Approved Fluent 2 desktop application shell is primary at `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` | Responsive and visual-system variants remain evidence only. |
| Sharpie separate or copied in first cycle | One Dude canvas; Review is deferred full-panel work | No Sharpie/Review implementation in 052. |
| `.copilot/annotations/` | Future Review uses feature-local `reviews/` | No review storage task now. |
| Direct answer writes | Future answer controls use active agent session | I1 shows count only. |
| PDF/attachment corrections are current | They are later Review constraints | No I1 task. |
| Backlog/package 025 replaced now | Backlog deferred; 025 remains until verified replacement | Do not modify 025. |
| Idea 053 supplies critique | Use on-demand general-purpose Rubber Duck | No dependency on 053. |
| New installer/distribution subsystem | Extend exact existing core projection | No consumer install or runtime build. |
| D1-D3 inventory expands 052 | Only coherent read-only Now facts enter I1 | Preserve broad research, bounded implementation. |

## Research Risks

- Exact tree-shaken React/Fluent size remains unknown until the production app
  bundle is measured; proxy sizes cannot become a completion claim.
- Griffel has runtime work. Avoid speculative extraction or framework layers.
- Host widths must be observed before representative cases are fixed.
- Status semantics span prose and parsers; extract only shared behavior required
  by current callers.
- Tracker failure must stay explicit and never fall through to markdown.
- The SDK canvas API is experimental, so keep its boundary narrow.
- Interactive Fluent borders need explicit contrast verification; a visual-system
  default does not waive WCAG 2.2 AA.

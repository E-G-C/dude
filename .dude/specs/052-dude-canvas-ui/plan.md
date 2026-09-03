# Implementation Plan: Dude Canvas UI

## Summary

Build one project-scope Copilot canvas extension from authoritative source under
`src/extensions/dude/`. The shipped I1 product is a read-only Now cockpit built
with React and Fluent UI React v9, bundled by esbuild into committed static
browser assets. Authored browser source remains build-only; the existing
development, release, and upgrade paths carry only the explicit runtime
allowlist to `.github/extensions/dude/`. Scoped maintainer tooling owns the
locked build. Consumers receive committed runtime bytes, install no
dependencies, and perform no build.

D1-D3 review and design approval are complete. The implementation authority is
the approved Fluent 2 desktop application shell at
`.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`. T002 and
T003 are complete. The blocked defective T004 unit is replaced by
T014@052host4, which preserves every I0 completion, replay, abort,
authoritative-reread, no-write, cleanup, and I1-unreachability obligation.

Before Work begins, prepare a fresh full Copilot app process with
`DUDE_CANVAS_I0_PROOF=1`, open a fresh canvas, record its exact loopback URL,
pass the proof preflight, and unset the launchctl variable while that app
continues running. Active T014 Work then performs the real proof, removes all
proof source, routes, bounded state, and positive fixtures, closes the proof
canvas/server, and verifies cleaned current source through automated tests and
an isolated production process without restarting the app. T014 settles on
that evidence. After Work ends, a full app quit and relaunch with the variable
unset verifies a fresh default read-only canvas and 404 proof routes; that
external checkpoint blocks T008, not T014.

## Technical Context

**Language/Version**: JavaScript ES modules and JSX; Node.js supplied to the
extension; modern browser output for the host iframe.

**Primary Dependencies**: Matching React 19 and ReactDOM 19 versions;
`@fluentui/react-components` 9.74.7 and its Griffel runtime; esbuild for
maintainer bundling; the host-resolved `@github/copilot-sdk/extension`; existing
Dude engine parsers; read-only `bd` JSON only when tracked authority exists.

**Storage**: Existing `.dude/` artifacts and Beads remain authoritative. Only
bounded extension-process state supports complete projection swaps and I0
request deduplication. No canvas database, cache file, watcher, or second task
store.

**Testing**: `node:test` for projection, authority, paths, HTTP, I0 session
behavior, scoped frontend build reproducibility and drift, release contents,
and upgrade ownership; real-host browser checks for responsive composition,
keyboard use, accessibility, light/dark appearance, and dogfood.

**Target Platform**: Project-scope GitHub Copilot canvas on macOS, Windows, and
Linux; responsive host iframe from the 360px minimum through available wide
canvas layouts.

**Project Type**: React browser UI embedded in a Copilot canvas extension, with
Node extension wiring and committed static output.

**Performance Goals**: Prompt chooser or primary orientation with 40-plus
packages; bounded inventory and DOM work; non-blocking refresh; one initial
frontend entry with no I1-only lazy-loading machinery. Measure exact production
`app.js` raw and gzip size and report any linked legal-notice bytes separately.
Use 350 kB gzip for the runtime JavaScript as the initial acceptance ceiling,
justified as a conservative cap above the measured Fluent umbrella proxy while
tree shaking should produce a smaller real app; a breach requires a measured
explanation and re-definition rather than hiding it.

**Constraints**: One `dude` canvas; loopback-only HTTP; `stdout` reserved for
JSON-RPC; real Fluent v9 components and anatomy; interactive boundaries at 3:1
non-text contrast; no consumer npm install, network fetch, or runtime build; no
I1 messaging, mutation, commands, Needs You, Sharpie, or stop control; no root
package manifest or workspace.

## Specification Quality Validation

The specification has four independently testable stories, complete scenarios,
edge cases, numbered requirements, entities, measurable success and visual
criteria, assumptions, an exact I1 boundary, and zero clarification markers.
Technology choices remain in this implementation plan except for the accepted
visual/component identity required by the design contract.

## Grounded Decisions

### React and Fluent UI v9

The user's selected chain is Fluent 2, Microsoft's Fluent components,
`@fluentui/react-components`, and React. Use `FluentProvider` at the application
root. Build light and dark Fluent themes from the host canvas CSS variables
where the host supplies stable semantic values; retain Fluent component anatomy,
spacing, states, and focus treatment.

Use genuine v9 components for buttons, badges, message bars, cards, links,
fields, and other matching controls. Do not recreate them with styled generic
elements. Griffel remains a runtime dependency because Fluent v9 inserts atomic
styles at render; do not add an unsupported extraction pipeline for I1.

Override the interactive neutral stroke role at the provider theme boundary
with `colorNeutralStrokeAccessible` or an independently verified equivalent.
The stock `colorNeutralStroke1` pairings are reserved for decorative separators
because their measured light and dark contrast misses 3:1.

### esbuild maintainer build

Use esbuild for the frontend production build. It is the smallest conventional
choice that directly supports JSX, browser ESM, minification, tree shaking of
Fluent's `sideEffects: false` packages, and deterministic named static output
without a dev-server framework or plugin ecosystem.

Keep all maintainer dependency metadata and the single build entry under
`scripts/dude-canvas-ui/`. Its private `package.json` has exactly one `build`
script, an engine constraint of Node `>=20`, runtime bundle inputs `react`,
`react-dom`, and `@fluentui/react-components`, and `esbuild` as a
`devDependency`. `scripts/dude-canvas-ui/package-lock.json` pins every exact
resolved version. React and ReactDOM use the same 19.x version and Fluent uses
9.74.7 unless implementation-time registry evidence requires a compatible
patch update; such an update visibly changes lock bytes and generated output.
Do not add a root package manifest or workspace.

The maintainer sequence is:

```text
npm ci --prefix scripts/dude-canvas-ui
npm run --prefix scripts/dude-canvas-ui build
```

`build.mjs` invokes esbuild with
`src/extensions/dude/frontend/app.jsx` as its sole entry, bundles
React/ReactDOM/Fluent/Griffel for browser ESM in production mode, targets the
fixed `es2022` browser baseline, minifies, and uses fixed output names. It emits
linked legal comments so dependency notices, when required, live in
`app.js.LEGAL.txt`; it has no runtime CDN or external dependency. Source maps
are omitted unless a demonstrated debugging need later justifies them.

Before each build, the script safely empties and recreates only
`src/extensions/dude/ui/assets/`, then verifies that output is exactly `app.js`
plus `app.js.LEGAL.txt` when notices are required. This removes stale generated
files without a persistent registry. Generated bytes are committed. Two clean
builds after locked `npm ci` must byte-match each other and the committed output;
CI and build tests fail on drift. Consumers and release builds never invoke npm
or esbuild.

Do not use Vite: its development server and application scaffolding do not solve
a current extension need. Do not use Rollup directly: configuring JSX,
replacement, CSS, and minification would add more moving parts than esbuild.
Svelte cannot host Microsoft's selected React components, and Fluent Web
Components lacks the selected component coverage.

### Extension and canvas boundary

Use one canvas declaration with `id: "dude"`, `displayName: "Dude"`, an optional
exact target input, and no agent-callable I1 product action. `open()` is
idempotent by `instanceId`; `onClose()` closes event clients and the loopback
server.

The internal I0 proof is available only when the full Copilot app process was
launched with exact `DUDE_CANVAS_I0_PROOF=1` and the extension injects the
complete proof capability. Host preparation occurs before Work: set the
launchctl variable, fully quit and relaunch the app, open a fresh Dude canvas,
record its exact loopback URL, and pass the non-mutating proof preflight. Then
unset the launchctl variable while the prepared app remains running. If launch
or preflight fails, fully quit the app, unset the variable, and do not begin
Work.

During T014@052host4, use that prepared process for the real completion,
replay, abort, post-abort reread, and no-write proof. Then remove every proof
source path, route, bounded request-state path, and positive fixture; retain
negative coverage for the default read-only route set; and close the proof
canvas and server. Verify cleaned current source with automated tests and an
isolated production server/process. Do not restart the full app during active
T014 Work.

After T014 settles and Work ends, fully quit and relaunch the app with the
launchctl variable still unset. Open a fresh canvas URL and verify both proof
routes return 404 while the default canvas remains read-only. T008@052proj8
remains externally blocked until that post-Work host checkpoint passes.

Extension wiring and the temporary I0 proof may remain framework-free because
they are Node/HTTP infrastructure, not product UI. The browser product root is
React. No proof message, response, deduplication, abort, mutation, command,
retry, answer, approval, or stop capability may remain reachable in I1.

### One projection boundary

```text
canonical files / read-only Beads query
  -> inventory and exact ownership
  -> active authority provider
  -> immutable NowProjection
  -> loopback JSON
  -> React + Fluent rendering
```

Reuse current inventory, owner, task, readiness, and drift parsers. Extract a
shared status derivation only when the current status caller and canvas would
otherwise duplicate an observable rule. Add no canvas-specific state machine.

Provider precedence remains:

1. A populated tracked board is globally authoritative. Bind facts to the
   selected feature only by exact `spec:` identity. With no match, retain safe
   selected-feature lifecycle facts and return typed authority attention with
   execution unavailable.
2. Without tracked import, canonical task units provide Lightweight authority
   only when current status semantics find execution evidence.
3. Otherwise an exact draft or exactly owned all-open package is Definition
   Only.
4. `task-state.json` may explain drift but supplies no live fact.

### Selection and bounded inventory

An exact unnumbered slug or exact numbered idea path follows current selector
semantics. Without input, auto-select only one unambiguous active candidate;
otherwise show a chooser. Selection never uses chronology, modification time,
log recency, lifecycle number, or file order.

Initial inventory reads only the summaries needed for selection. Read selected
sections after selection and window chooser rows so 40-plus packages do not
create an oversized DOM.

### Freshness and loopback safety

Every projection carries its read time and content identities. A focus check
compares identities but does not replace content. Refresh constructs one
complete successor and swaps it atomically. A failure retains the prior
projection with an explicit state.

Bind an operating-system-assigned port to `127.0.0.1`; serve only closed routes
and known built assets; reject non-loopback Host and cross-site requests; use
existing no-symlink containment helpers; log through `session.log`.

## Source Structure

```text
src/extensions/dude/
  extension.mjs                 # runtime extension wiring
  lib/
    **                          # runtime Node projection/server code
  frontend/                     # authored React source; never projected
    app.jsx
    theme.js
    styles.js
  ui/                           # shipped runtime browser tree
    index.html
    assets/
      app.js                    # generated committed esbuild output
      app.js.LEGAL.txt          # generated only when notices are required
  *.test.mjs                    # never projected

scripts/dude-canvas-ui/         # scoped repository-maintainer tooling
  package.json
  package-lock.json
  build.mjs
```

Names may consolidate later only while these authored-source, generated-runtime,
and maintainer-tooling boundaries stay explicit. Keep exactly one frontend entry
and one build script.

The runtime projection allowlist is only:

```text
src/extensions/dude/extension.mjs
src/extensions/dude/lib/**                  # runtime files only
src/extensions/dude/ui/index.html
src/extensions/dude/ui/assets/**            # generated assets and notices
```

These files map by relative path into `.github/extensions/dude/`.
`src/extensions/dude/frontend/**`, top-level and nested `*.test.mjs`, and
`scripts/dude-canvas-ui/**` never map into development or release output.
Package manifests, the lockfile, and the build script are maintainer inputs, not
consumer content. Frontend modules participate only as esbuild inputs compiled
into `app.js`; their source files are never copied. Package and build metadata
controls the build but is neither bundled as runtime data nor projected.

Source-output planning owns those source exclusions. Shared deployed-file
ownership and upgrade classification own only `.github/extensions/dude/**`;
they do not classify the build-only source tree. Build-dev stale cleanup may
replace only the projected `.github/extensions/dude/` destination and must
preserve every unrelated extension directory. Release copies the committed
runtime allowlist and never invokes npm or esbuild. Upgrade consumes release
runtime bytes only, so consumer repositories receive no frontend source,
package metadata, lockfile, or build tooling.

## I0 Architecture-Risk Proof

I0 remains current because `design_status: approved`. T002 and T003 already
established host canvas lifecycle and authoritative reading. T014@052host4 is
the fresh successor for the remaining real-host proof and complete proof-seam
removal.

### Pre-Work host preparation

1. With no Work runner active, set launchctl
   `DUDE_CANVAS_I0_PROOF=1`.
2. Fully quit and relaunch the Copilot app so the fresh process inherits that
   exact value.
3. Open a fresh `dude` canvas, record its exact loopback URL, and pass the
   non-mutating proof preflight.
4. Unset `DUDE_CANVAS_I0_PROOF` in launchctl while the prepared app remains
   running.
5. Begin Work only after the variable is unset. If any preparation step fails,
   fully quit the app, unset the variable, and stop before Work.

### T014 execution and settlement

1. Complete one canvas-originated request through `session.sendAndWait` and
   surface the bounded completed result.
2. Replay the same request identity and prove no duplicate turn or
   authoritative reread occurs.
3. Start a second request, abort it, observe acknowledgement and terminal
   aborted state, and prove the later send settlement cannot overwrite it.
4. Re-read authoritative state after completion and abort and prove the whole
   flow writes no project state.
5. Remove all I0 proof source, routes, bounded request state, and positive
   fixtures from current source and generated projection while retaining
   negative default-route coverage.
6. Close the proof canvas and loopback server and verify cleanup.
7. Verify cleaned current source through focused and recursive automated tests
   plus an isolated production server/process in which proof routes return 404
   and the default canvas remains read-only.
8. Do not restart the full Copilot app during active Work. Settle
   T014@052host4 from the real-host proof and cleaned-source/isolated-process
   evidence.

I0 creates no product action, durable request ledger, retry queue, generic
session framework, or product/UI scope.

### Post-Work host checkpoint

After T014 settles and Work ends, fully quit and relaunch the Copilot app with
`DUDE_CANVAS_I0_PROOF` unset. Open a fresh canvas URL and verify
`/__dude_i0/proof` and `/__dude_i0/proof/abort` return 404 while the default
canvas remains read-only. This external checkpoint blocks T008@052proj8 and is
not part of T014 settlement.

## Approved Design Authority

The selected implementation authority is
`.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`. It is the
approved Fluent 2 desktop application shell. Persistent chrome places a command
bar above the workspace, a 48px activity rail at the side, breadcrumbs and
feature identity near the top, and a status bar along the bottom. The main area
gives Next visual priority, follows it with lifecycle and progress, uses the
centre for source-backed Phases and Activity, and docks properties and evidence
on the right. The shell fills available width, docks regions when room permits,
collapses coherently when narrow, and treats 360px as compatibility only.

Earlier responsive-panel and visual-system variants remain preserved evidence.
They are not implementation authority and require no further proposal or
approval stage.

## Test Strategy

### Projection and authority

- Exact target, one candidate, zero/several candidates, and invalid selection.
- Definition Only, Lightweight, Tracked, unavailable tracker, malformed owner,
  dependency errors, divergent snapshot, and complete work.
- Selected feature B with tracked issues only for A, proving no cross-feature or
  markdown execution leakage.
- Safe unanswered-question count and `unknown` on malformed structure.
- Complete refresh swaps, failed refresh retention, and external-change
  detection.

### Frontend and responsive behavior

- React renders only the projection contract; the UI derives no workflow state.
- `FluentProvider` and mapped light/dark themes preserve Fluent anatomy.
- Interactive strokes meet 3:1 with the accessible role/override; decorative
  Stroke1 use is separately classified.
- Host-derived narrow, medium, and wide compositions plus 360px minimum and 200%
  text zoom; no permanent 380/480 shell.
- Keyboard-only chooser, disclosure, and refresh; accessible names, heading
  order, status announcements, visible focus, reduced motion, and no trap.
- Exact production `app.js` raw/gzip report, linked-notice report, 350 kB runtime
  JavaScript gzip ceiling, dependency/license inventory, and tree-shaking
  inspection.

### Build, release, and upgrade

- Scoped `npm ci` honors `scripts/dude-canvas-ui/package-lock.json`; two clean
  esbuild runs produce byte-identical `app.js` and required legal notices that
  match committed output.
- Development projection contains exactly the runtime allowlist and excludes
  authored frontend source, all tests, and scoped package/build metadata.
- Release copies committed runtime files without invoking npm/esbuild and
  excludes frontend source, tests, package/lock files, and build tooling.
- Consumers can unpack and run without npm, network, or runtime compilation.
- Upgrade consumes release runtime bytes, owns only
  `.github/extensions/dude/**`, and preserves unrelated extensions.

## Phases

1. Preserve completed D1-D3 review and approved desktop-shell evidence.
2. Before Work, prepare the full Copilot app with exact proof opt-in, open and
   preflight a fresh canvas URL, then unset the launchctl variable while the app
   remains running.
3. Execute and settle T014@052host4 through real completion, replay, abort,
   reread, no-write, proof removal, cleanup, automated verification, and an
   isolated production process without a full app restart.
4. After Work, relaunch the full app with the variable unset and hold
   T008@052proj8 blocked until fresh proof-route 404 and default read-only host
   evidence passes.
5. Implement the projection and exact core path.
6. Build the React/Fluent read-only Now cockpit through esbuild.
7. Verify accessibility, responsive host behavior, bundle size, dogfood, build
   reproducibility, release parity, and consumer install-free operation.

## Requirements Traceability

| Coverage | Plan ownership | Tasks |
| --- | --- | --- |
| D1-D3 and design approval | Approved Design Authority | T001, T005, T006, T007 |
| I0 host lifecycle, authority, completion, replay, abort, reread, no-write proof, and cleanup | I0 Architecture-Risk Proof | T002, T003, T014 |
| Post-Work proof absence before product projection | Extension and canvas boundary; I0 post-Work checkpoint | T008 |
| Selection, authority, projection, freshness | Projection boundary and Test Strategy | T003, T008, T010, T011 |
| Approved Fluent desktop shell and accessibility | React and Fluent, Approved Design Authority | T005, T006, T007, T010, T011, T012 |
| Build, release, upgrade, consumer contract | esbuild build and exact projection | T009, T010, T011, T013 |
| Later-work compatibility without deferred scope | Extension boundary and I0 | T014, T008, T013 |

## Objective Registry

None. No current production caller requires objective-evaluation machinery.

## Supporting Artifact

`research.md` remains the one supporting definition artifact. No data model,
API contract, schema, quickstart, or separate checklist is needed; the existing
projection contract, phased tasks, and direct verification cover I1.

## Risks

- Fluent's exact tree-shaken application size is unknown until the real bundle
  is measured. Treat proxy sizes as planning evidence only.
- Griffel has runtime cost. Do not add unsupported extraction work without a
  measured I1 problem.
- Host width behavior must be observed before representative test widths are
  fixed; 360px remains the minimum, not the layout target.
- The temporary three-file runtime projection proves provider registration
  only. T009 remains open because authoritative development/release projection,
  cleanup, upgrade ownership, and focused coverage are not yet implemented.
- Global tracked precedence can leave a selected feature without execution
  facts. Keep target and authority separate.
- A launchctl proof value can affect newly launched app processes. Unset it
  immediately after the fresh-canvas preflight and before Work; preparation
  failure requires a full quit and unset before stopping.
- After T014 removes proof source and closes its server, the still-running host
  process may retain its already-loaded proof-capable module until it exits.
  T014 therefore relies on cleaned-source tests and an isolated production
  process, while T008 remains blocked until the post-Work full app relaunch
  proves host-level absence.
- Restarting the full app during active T014 would destroy the live session and
  settlement evidence. No active-Work restart is permitted.
- Proof routes can leak into product output. Inspect cleaned current source,
  generated projection, isolated production behavior, and the post-Work fresh
  host rather than relying only on source intent.
- Exact-path build and upgrade changes must preserve unrelated extensions.
- Registry-compatible dependency patch evidence can change the scoped lockfile,
  legal notice, and generated bytes; review all three visibly rather than
  treating them as incidental churn.

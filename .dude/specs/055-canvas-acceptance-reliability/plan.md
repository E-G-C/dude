# Implementation Plan: Canvas Acceptance Reliability

**Specification**: `.dude/specs/055-canvas-acceptance-reliability/spec.md`
**Owner idea**: `.dude/ideas/055-canvas-acceptance-reliability.md`

## Technical Context

**Language/Version**: JavaScript ESM; existing Node 20/22 repository checks;
Node 22 for required browser acceptance and its built-in WebSocket client.
**Primary Dependencies**: Existing scoped React, Fluent UI, and esbuild lockfile;
Chromium-family executable supplied by the maintainer or CI runner. No new
package, browser framework, or root manifest.
**Storage**: Disposable canonical repository, browser profile, and run-isolated
evidence files only. No persistent product state.
**Testing**: Node's built-in test runner, existing direct Chrome DevTools
Protocol (CDP) helpers, production canvas/projection tests, and scoped build tests.
**Target Platform**: Ubuntu CI with Google Chrome; existing local macOS Edge
default remains usable. This does not add a cross-platform browser installer.
**Project Type**: Maintainer acceptance infrastructure for the committed Now
cockpit, not a runtime feature.
**Performance Goals**: Bounded waits on observed DOM/process/network conditions;
release delayed reads before the existing five-second production deadline.
Retain current test deadlines unless measured execution justifies a focused
adjustment; no arbitrary sleep-based acceptance or automatic retries.
**Constraints**: No private runtime contract changes, speculative UI fixes,
profile rebuild, new host surface, or generic reliability machinery.

## Source Findings

- `scripts/dude-canvas-ui/browser.test.mjs` already drives the committed
  `src/extensions/dude/ui/` assets over CDP. It hardcodes Edge and an old personal
  evidence path, skips missing prerequisites, uses `createFixtureServer`, and
  tests selected-open behavior at 760/light.
- `scripts/dude-canvas-ui/build.test.mjs` already builds a disposable copy twice,
  compares both `app.js` and `app.js.LEGAL.txt` with committed source assets, and
  compares source/deployed assets. Reuse these checks rather than rebuilding the
  workspace before a browser run.
- `openInstance(id, log, null, { root, target })` calls `readNowProjection`
  internally. Production serves `/api/projection`, `/api/refresh`, and
  `/api/freshness`; refresh preserves the prior projection unless replaced.
- `canvas-server.test.mjs` supplies a real executable `bd` fixture and a
  child-process release barrier. `projection.test.mjs` already covers empty
  stdout, exit 1, and the exact first nonblank stderr line
  `Error: no beads database found`, including hints and line-ending variants.
  These are acceptance additions, not a new fallback fix.
- The renderer checks freshness on focus/visibility and changes committed facts
  only after explicit successful refresh. That existing caller belongs in the
  real-provider browser flow.

## Chosen Structure

### 1. Required entry, committed-artifact parity, and portable evidence

Keep `browser.test.mjs` as the entry point. Add three scoped environment inputs:

- `DUDE_CANVAS_BROWSER_REQUIRED=1`: prerequisite failures are assertions/errors,
  never skips. Ordinary mode retains the existing missing-browser/dependency
  skips. Missing CDP/WebSocket support gets an actionable Node-version diagnostic.
- `DUDE_CANVAS_BROWSER`: exact caller executable, preferred over the existing
  macOS Edge default. An invalid supplied executable is not silently replaced.
  Browser startup errors fail and clean up the launched process/profile.
- `DUDE_CANVAS_ARTIFACTS_DIR`: optional output parent. Use `mkdtemp` for a unique
  child under it or `os.tmpdir()`; never write evidence straight into the parent.
  Report the child path with the existing test diagnostics. Retain screenshots
  and `index.json` as evidence; remove temporary profiles/repositories in cleanup.
  Keep partial evidence after a failing assertion and avoid cleanup errors
  hiding the original failure.

Put run isolation in this first task because the personal path otherwise blocks
portable required CI. This absorbs the small P2 output gap into the P1 entry
work; it is not a separate setup stage ahead of the real-provider P1.

Add one `canvas-browser` job to `.github/workflows/ci.yml`, on `ubuntu-24.04`
with Node 22 using the existing checkout/setup-node actions. Use that hosted
runner's installed Google Chrome, resolve it with `command -v google-chrome`,
verify it is executable, and report `--version`. Missing Chrome fails the job;
do not introduce another browser download tool or a fallback installation chain.
Run `npm ci --prefix scripts/dude-canvas-ui`, then the existing scoped build
tests and the required browser suite, with explicit file arguments and TAP
output. Do not use `continue-on-error`, install a root workspace, or set required
mode globally on the Node 20/22 dependency-free jobs.

Retain the existing Node 20/22 validation matrix. Prune `node_modules` and `dist`
from its recursive discovery, so scoped local installs cannot contribute
third-party tests. The new browser job uses explicit test paths, not recursive
discovery after installation.

Required mode must fail the build-parity prerequisite when scoped dependencies
are absent; the existing two-build test must not silently skip in this mode.
Reuse its byte comparison and the existing source/deployed equality assertions,
adding shell equality if needed. Browser tests serve the checked-in source
assets, not newly generated workspace assets. The real provider imports source
runtime modules; the normal CI dev-bundle drift check establishes generated
runtime parity separately. Neither browser acceptance nor scoped build testing
runs `build-dev`, release builds, or profile generation in the working tree.
Release/install-free consumers keep the current runtime allowlist and bytes.

Use named TAP subtests plus a concise execution diagnostic identifying browser
version, tested asset hashes, and evidence directory as the positive execution
witness. All required browser groups must execute, with no prerequisite skip
branch reachable in required mode; process exit and assertions remain the gate.
No new report schema or persistent execution registry is needed.

Extend `build.test.mjs` with focused child-process checks for required versus
optional missing prerequisites and run-directory isolation. Use disposable
copies to model absent scoped dependencies; do not rename real `node_modules`.
For the negative acceptance witness, temporarily change the existing selected
row visibility assertion from expected `true` to `false` in a disposable checkout
copy. Run the same required browser command, require nonzero exit and that
assertion's failure message, then discard the copy. Do not commit the broken
assertion, add a mutation framework, or mistake an unrelated startup failure for
proof. Run the unmodified command successfully as the companion witness.

### 2. One browser flow through the production provider

Add a named real-provider subtest to `browser.test.mjs`, reusing CDP launch,
navigation, pointer, keyboard, and observation helpers. Import production
`openInstance`/`closeInstance` from `src/extensions/dude/lib/canvas-server.mjs`
and open with a null projection plus disposable `{ root, target }`. This reaches
real `readNowProjection`; do not inject `runBd`, replace a projection, intercept
API responses, or route this flow through `createFixtureServer`.

Build at least 50 canonical ledgers with unique three-digit identities, exact
owner paths, small specifications, and valid local task files. Include
`052-dude-canvas-ui` with representative phases, activity, and a long Next source
description. Generate synthetic realistic facts; do not consume or mutate the
workspace's current task history. Keep another feature such as `017-feature-17`
available for replacement.

Reuse the existing executable-fixture technique from `canvas-server.test.mjs`:
prepend a disposable `bd` to PATH, record actual arguments/PIDs, support stderr,
and hold/release a selected child at an observed barrier. Projection still
spawns the real process boundary. Account for source revalidation reads by
returning consistent results throughout each acquisition; make only the small
test-local extension needed, not a shared scenario engine.

The flow must:

1. Open a complete feature, browse the full inventory, and find 052 by canonical
   number/name. Use one physical click to open the chooser and one to activate
   its option; inspect CDP requests to prove the semantic slug is submitted.
2. Hold the `bd` read for that selection. Assert the old heading/facts remain,
   query text alone did not commit, and the pending announcement names 052.
   Release with empty stdout, exit 1, and exact no-database stderr. Observe a
   complete local-task projection, successful 052 commit, and identity focus.
3. From committed 052, request 017 and return a generic nonzero failure, such as
   exit 1 with `Error: fixture read failed`. Assert stale/refusal feedback,
   unchanged committed heading/facts/display, and no false opened announcement.
   A succeeding retry with valid empty tracked authority must replace the view.
4. Change that selected feature's task source in the disposable repository.
   Exercise the renderer's existing focus/visibility listener, observe the real
   freshness request and changed indication without replacing the old facts,
   then click Refresh and assert the changed facts and current freshness.

Observe the production routes, read-only loopback network boundary, and spawned
`bd list --all --limit 0 --json` calls. No-database fallback must not probe
`bd ready`. Close the page/event stream, production instance, browser, and
fixture children, restore PATH, and remove disposable input data even on failure.
Keep waits bounded to the existing production deadline.

Retain the fixture-backed UI matrix for its many independent states. Remove its
impossible two-digit canonical paths, notably `55-malformed-choice`, and the
corresponding `build.test.mjs` canonical-choice fixtures/assertions. Do not expand
production input handling to support them. Keep reachable punctuation queries,
full-list ordering, and count assertions against valid canonical inventory.
Retain lower-level projection/server regressions, including the exact
no-database test; change them only if a focused fixture adjustment is needed.

### 3. Selected-open responsive and accessibility matrix

Parameterize the existing selected-open interaction case over
`[360, 760, 1440]` and `['light', 'dark']`, using the matching Fluent theme tokens.
Preserve its selection/query/refusal/replacement checks and existing Tab cases;
do not replace the broader UI matrix with only this flow.

Measure the entire committed option against listbox bounds and viewport bounds
after scroll settles. Assert no unintended page, chooser, or required-content
clipping/overflow; existing deliberate long-label truncation is allowed only
with its complete accessible identity and existing disclosure preserved.
Use `elementFromPoint` at actual CDP click coordinates to prove the option,
chooser, and relevant controls are not covered by another element.

Check interactive target rectangles against WCAG 2.2 AA criterion 2.5.8:
24 by 24 CSS pixels, or a demonstrated applicable exception. For spacing,
verify the prescribed 24-pixel-diameter circle separation from other targets or
other undersized-target circles. Record the relevant geometry and exception
rationale in existing observations. Do not impose 44-pixel AAA targets or
redesign a compliant spaced control. Retain existing computed contrast
thresholds, keyboard/focus, accessibility-tree, full-list, canonical-number,
query/Tab, and long Next exact-source disclosure assertions.

Capture a selected-open screenshot for each combination in the run child.
Screenshots support diagnosis; geometry, interaction, and accessibility
assertions decide pass/fail.

## Guardrail Check And Scope Limits

The spec was checked for WHAT/WHY separation, independent prioritized scenarios,
testable numbered requirements, measurable criteria, edge cases, and applicable
entities before this plan. No clarification marker remains.

Existing project guardrails suffice. No guardrail disposition or new user answer
is needed. No UI source change or mockup stage is planned: the approved 052
design remains the baseline. If execution reproduces a rendered defect, Tester
reports the exact failing case for bounded Coder diagnosis and focused correction
under that design. Any new behavior or design choice needs its existing owner
gate; it is not authorized by a static finding. Generated runtime changes, if
actually needed, must follow their existing source/parity authority without
folding in the unrelated model-map edit or rebuilding profiles.

Keep Feature 052 closed, preserve all deferred surfaces, and leave captured 056
and the model map alone. This package adds no daemon, framework, API/schema,
objective registry, screenshot-comparison platform, or extra definition artifact.

## Verification And Documentation

Update `docs/commands.md` in its repository-development and CI guidance as each
slice lands. Document Node 22 browser use, executable selection, optional versus
required behavior, artifact location/retention, and the production-provider
versus fixture/host evidence boundary. Commands run from the repository root:

```bash
# Ordinary dependency-free recursive discovery; intentional optional skips remain.
find . -type d \( -name node_modules -o -path ./dist \) -prune -o -type f -name '*.test.mjs' -print0 | xargs -0 node --test

# Maintainer/CI path: caller sets DUDE_CANVAS_BROWSER to an executable.
npm ci --prefix scripts/dude-canvas-ui
DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-reporter=tap scripts/dude-canvas-ui/build.test.mjs
DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-reporter=tap scripts/dude-canvas-ui/browser.test.mjs
node --test src/extensions/dude/canvas-server.test.mjs src/extensions/dude/projection.test.mjs
```

CI sets `DUDE_CANVAS_BROWSER` from its checked `command -v google-chrome` result
and an output parent under `RUNNER_TEMP`. Locally the existing Edge default may
be used. Show the supplied-browser command without machine-specific paths.
Validate the commands with positive execution and targeted negative witnesses,
including absent browser/dependencies, changed artifact bytes, and the
deliberately broken existing visibility assertion.

Before asking for human smoke, execute the full automatable script with
realistic data and the six selected-open cases. Human smoke covers only actual
host provider discovery, iframe sizing/theme/focus, and reload lifecycle. Label
it separately; a standalone browser, fixture provider, or copied host boundary
does not prove actual host integration.

## Phases And Traceability

Use three implementation tasks, each with focused tests and documentation.
T001 and T002 are the two P1 slices; T001 also fixes the output path that blocks
portable execution. T003 adds the P2 selected-open matrix. T002 and T003 reuse
T001's harness configuration; they are not parallel candidates because they
edit the same browser test and docs. Prefer T002 before T003 without inventing
a dependency solely for priority.

| Requirements | Plan slice | Proposed task | Acceptance |
| --- | --- | --- | --- |
| FR-001, FR-002, FR-003, FR-008 | Required entry, parity, isolated output | T001@055ci001 | US1, US4; SC-001, SC-004, SC-005 |
| FR-004, FR-005, FR-006, FR-007 | Real production-provider flow | T002@055real2 | US2; SC-002 |
| FR-010 canonical fixtures | Reachable inventory cleanup | T002@055real2 | US2/US3; SC-002, SC-003 |
| FR-009, FR-010 retained UI checks | Selected-open matrix | T003@055grid3 | US3; SC-003 |
| FR-011 | Maintainer instructions and host boundary | All three tasks | SC-006 |
| FR-012 | Unchanged product/design boundary | All three tasks | SC-005, SC-006 |

## Risks

- Hosted Chrome versions change with the runner image. Report the observed
  version; missing or broken launch fails visibly rather than skipping.
- The added matrix increases runtime. Diagnose measured timeouts, do not hide
  failures with retries or bypass the production acquisition deadline.
- Production revalidation performs more than one external command per read;
  fixtures must hold a stable answer for the full acquisition.
- Static review cannot establish rendered correctness or actual host behavior.
  Execution and the narrow human smoke remain evidence obligations.

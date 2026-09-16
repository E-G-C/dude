# Native Review verification of canonical 062

Date: 2026-09-15

## Boundary exercised

The session probe copied the exact current canonical preview bytes from:

`.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html`

SHA-256:

`ca164ca808c61bef78304212217234b25147b8fddef3a387f268102dbe304180`

The copy was placed under a temporary exact-owner feature and opened through the
published Canvas application, `ReviewWorkspace`, `mountReview`, the real Needs
You provider, and `createReview`. It was not loaded as a static-page simulator.
The request, owner acknowledgment, and workspace were controlled fixtures, not
a live joined-user response or approval.

## Final serial command

The missing locked scoped prerequisites were restored first:

```sh
npm ci --prefix scripts/dude-canvas-ui --no-audit --no-fund
```

Observed: exit 0, 96 packages added. npm warned that the locked
`esbuild@0.28.2` postinstall was not allowlisted. `package.json` and
`package-lock.json` remained byte-identical at SHA-256
`1e85808b3985f2b98ac2e6ed1ff28c5357b64d1a5735d468d406957953b30816`
and `39e6907641679eed6a8e79a6de6d8aba0fc4881615e77cb6bf72e94bcc90c8f5`.

```sh
DUDE_CANVAS_BROWSER_REQUIRED=1 DUDE_CANVAS_ARTIFACTS_DIR=/tmp/real-review-062-20260915T164843Z node --test --test-concurrency=1 --test-name-pattern='^(T011 browser: mounted Review seals a real PNG once, acknowledges, preserves history, and requires fresh approval|T012 review regression: short-panel floating tools stay inside their palette and remain reachable after workspace navigation|T012 review regression: double-click opens an annotation comment while drawing, dragging, and empty space stay unchanged|T010 mounts the vanilla engine under current Fluent tokens and seals real source-aligned evidence|real-review-062 probe: canonical 062 through ReviewWorkspace native gestures, seal, and receipt)$' /tmp/real-review-062-20260915T164843Z/probe/scripts/dude-canvas-ui/real-review-062-native.test.mjs scripts/dude-canvas-ui/browser.test.mjs
```

Observed: exit 1; 5 tests, 4 passed, 1 failed, 0 cancelled, 0 skipped,
0 todo; Edge `133.0.3065.69`.

The four retained-path tests passed real pointer drawing, hit testing,
move/resize, comment/caret, Undo/Redo, palette placement/orientation, keyboard
navigation, working-file save, cancellation/refusal, fresh PNG seal, report
validation, one provider response, fixture acknowledgment, history, and
fresh-approval isolation.

## Concrete failure

The exact canonical preview never became editable. The parent Review workspace
reported:

`This view contains content that a fresh capture cannot verify.`

The frame was `990 x 723`, the overlay had no adopted `viewBox`, no annotation
could be admitted, and therefore no `working.json` change, seal, report, PNG,
response, or acknowledgment was produced for canonical 062.

The first deterministic source incompatibility is closed native Review SVG
inspection. `src/extensions/dude/ui/review/inspector.mjs` includes every SVG
descendant in its signature walk but permits only its `SVG_TAGS` set; that set
does not include `symbol` or `use`. The canonical preview contains reusable
`<symbol>` definitions and many `<use href="#...">` instances, beginning around
lines 3931 and 4181. The bridge returns `review_transient_unsupported`.
Later blockers, if any, remain untested because this guard dominates admission.

## Evidence

- Screenshot: `real-review-062-canonical-admission-failure.png`
- Full diagnostic:
  `/tmp/real-review-062-20260915T164843Z/dude-canvas-real-review-062-canonical-native-workspace-FwNYoV/canonical-admission-failure.json`
- Passing retained-path sealed fixture:
  `/tmp/real-review-062-20260915T164843Z/dude-canvas-t011-review-FkUfdB/`
- Passing all-tool trusted-gesture fixture (not canonical 062):
  `/tmp/real-review-062-20260915T164843Z/dude-canvas-real-review-062-native-workspace-bGEAZ1/results.json`

The all-tool probe's strong falsifier required each Box, Circle, Arrow, Line,
and Highlight tool to ignore one trusted zero-distance click and then add
exactly one differently-sized annotation from a trusted six-move drag.

## Remaining known behavior

The deferred 059 recognizer defect was not repaired: dragging a selected shape
away and exactly back can still prime/open Comments on a following click within
500 ms. No native-host/full-062 integration, current 062 response, user
approval, task transition, or closure is established by this verification.

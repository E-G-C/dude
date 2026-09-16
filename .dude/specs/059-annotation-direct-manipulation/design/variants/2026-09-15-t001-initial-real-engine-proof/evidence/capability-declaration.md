# 059 capability declaration and honest limits

Recorded for task `T001@59a10f01`, before the first render and kept current with what the
proof then actually executed.

## What runs

- **Real component**: `ReviewWorkspace` from `src/extensions/dude/frontend/review.jsx`, copied to
  `design/prototype/frontend/review.jsx` with one guidance-sentence difference. Its dependencies
  (`needs-you.jsx`, `styles.js`, `theme.js`, `use-canvas-data.js`) are byte-identical copies.
- **Real state and history owner**: one `mountReview` instance from the source-derived
  `design/prototype/review/engine.mjs`, mounted by that component through its ordinary
  `entry.module.mountReview` interface. There is no second controller and no simulated engine.
- **Real supporting modules**: `geometry.mjs` and `styles.css` carry the exploratory difference;
  `shapes.mjs`, `inspector.mjs`, `panel.mjs`, `capture.mjs`, `bridge.mjs` and `NOTICE.txt` are
  byte-identical copies. `evidence/source-provenance.json` records every revision and diff size.
- **Real services**: the unchanged `createNeedsYou` provider and `createReview` adapter from
  `src/extensions/dude/lib/`, over a disposable fixture workspace in the OS temp directory.
  Open, save, seal, history and respond are those services' own answers.
- **Design-only code**: `prototype/host.jsx` (the outer host bootstrap), `prototype/fixture-driver.mjs`
  (transport), `prototype/build-design-assets.mjs` (scoped esbuild wrapper), `prototype/serve-preview.mjs`,
  and the three `prototype/proof-*.mjs` harness files. None of them contain annotation logic.

## Fixed route mapping and the opaque child boundary

The driver serves one loopback origin and maps only these routes to design-local bytes:

| Request | Served from |
| --- | --- |
| `/` | `design/review-direct-manipulation.html` (the canonical entrypoint, byte for byte) |
| `/design/host.js`, `/design/host.js.LEGAL.txt` | `design/prototype/assets/` |
| `/review/{engine,geometry,shapes,inspector,panel,capture,bridge}.mjs`, `/review/styles.css`, `/review/NOTICE.txt` | `design/prototype/review/` |

Everything else is the real provider: `/review-source/<submission>/…` through
`provider.readReviewResource`, and `/api/needs-you`, `/api/needs-you/review/{open,save,seal}`,
`/api/needs-you/review/history`, `/api/needs-you/respond` through the provider's own methods.

The guards are the production ones, not re-invented: the driver imports and calls
`isTrustedRequest` from `src/extensions/dude/lib/canvas-server.mjs`, keeps the same-origin POST
rule, the opaque-sandbox GET exception, `Content-Security-Policy: frame-src <origin>/review-source/`,
`X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *` on `/review/`, and `no-store`.
The reviewed content stays in the engine's own `sandbox="allow-scripts"` iframe with the adapter's
own CSP; `allow-same-origin` was not added, no CSP was widened, and no source-admission or
revision check was relaxed. The controller lives entirely in the outer host document.

## Fixture transport

The reviewed content is `design/fixtures/reviewed-content/{mock.html,mock.css,logo.svg}`, copied
into a fresh temp workspace as feature `701-direct-manipulation-fixture`. The driver publishes one
real `preview` request through the provider tool and awaits it; the review is opened, saved and
sealed by the real adapter against that fixture. Every request handle, submission, working file and
receipt in the proof belongs to that disposable workspace.

## What this proof cannot establish

1. **It is fixture-only.** Nothing here is the user's live review, waiting request, or session. No
   annotation, save, or receipt it produces has any owner authority.
2. **It is not approval.** The demonstrated revision is a proposal for the 059 design gate.
3. **It is not a live-UI change.** `src/`, `.github/`, the built Canvas assets and the repository
   tests are untouched; the exploratory behaviour exists only in these design copies.
4. **The reviewed child loads `bridge.mjs` and `inspector.mjs` through the adapter's own absolute
   URLs**, which the driver serves from the design copies of those two files. Both are byte-identical
   to current source, so the reviewed side runs unchanged code.
5. **Browser automation is not desktop-host proof.** The run is headless Edge 133 driven over CDP at
   `--force-device-scale-factor=1`. Device scale matters: at the machine's native scale of 2 the
   opaque child reported `deviceScale: 2` while the forced parent reported 1, and the engine's
   existing settle check correctly refused the first annotation. That is existing product behaviour
   under mixed scale, observed here, not a change.
6. **Screenshots show state, not behaviour.** Cursor values in the evidence are computed styles read
   from the live overlay; a PNG cannot render a cursor.
7. **Send and seal were not exercised.** The Send control performs the real seal and a real
   `respond` against the fixture provider; the proof exercised real working saves instead, and no
   delivery, acknowledgment, or approval is claimed.
8. **The canonical HTML needs its driver.** Opened from disk it can only explain how to start the
   driver: it is a real outer host document that depends on the same-origin `/review/` modules and
   the provider routes, not a static picture of the interface.

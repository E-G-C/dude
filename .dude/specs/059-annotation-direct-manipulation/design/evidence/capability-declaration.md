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
  the four `prototype/proof-*.mjs` harness files, and `prototype/verify-t001-adversarial.mjs`.
  None of them contain annotation logic.

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
   `--force-device-scale-factor=1`. The mismatch that follows belongs to the harness, not to the
   product: the forced parent reported scale 1 while the opaque child kept the machine's native
   `deviceScale: 2`, and the engine's existing settle check refused the first annotation. Driving
   the parent at scale 2 as well, the independent run drew, resized, and kept the pinned frame at
   DPR 2. Nothing here says the interaction is limited at high device scale.
6. **Screenshots show state, not behaviour.** Cursor values in the evidence are computed styles read
   from the live overlay; a PNG cannot render a cursor.
7. **Send and seal were exercised by the independent verification, not by this proof.** The proof
   runs stop at real working saves. The independent T001 run recorded in
   `evidence/independent-t001-2026-09-15T21-55-42-017Z.json` clicked the real Save and Send
   controls: the real adapter sealed a 4,208-byte report, a 73,598-byte annotated PNG and a
   2,703-byte provenance file, and the fixture provider recorded the response as
   `awaiting_acknowledgment` with `acknowledgment: null`. That is a fixture provider answering a
   fixture submission. Nothing reached a live owner, nothing was acknowledged, and sending feedback
   is not approval. That run also exercised the engine revision this set superseded
   (`sha256:539f607f28598095144aac5f3f1dd4da0401ed9e01e8ef01993f80c1aa4b919c`), preserved under
   `design/variants/2026-09-15-t001-initial-real-engine-proof/`. Two later re-runs of the same
   verification script reproduced the sealed set and the same awaiting-acknowledgment answer, each
   against the revision that was current when it ran: `independent-t001-2026-09-15T22-19-04-134Z.json`
   for `sha256:0bf45e4803f8c77c139ed1d6a54634fa39bf7a3f213cb57bbe28f341e9c5a31a`, now preserved
   under `design/variants/2026-09-15-t001-r1-update-path-fix/`, and
   `independent-t001-2026-09-15T22-35-58-565Z.json` for the current
   `sha256:ea85f7f964e3b7817e1547faca9e8611d1f63dff03f108bb4048d18227b9256d`. Those re-runs are the
   design author's, so they carry no independent attribution, and no earlier report is evidence for
   a later revision.
8. **The canonical HTML needs its driver.** Opened from disk it can only explain how to start the
   driver: it is a real outer host document that depends on the same-origin `/review/` modules and
   the provider routes, not a static picture of the interface.
9. **The availability-loss cursor regression is narrow and fixture-only.** `prototype/proof-unavailable-cursor.mjs`
   covers exactly one thing: a pointer left resting on a selected handle or border while the mount
   stops being editable. Its three cases use the two existing entry points that drop editing in
   place — the host's `update({ unavailable: true })` boundary, and the real provider's own refusal
   arriving at `reportError`, delivered by ending the fixture session out of band so the engine's
   existing debounced save is answered `provider_unavailable`. It observes the overlay's own action
   attribute and computed cursor. It is not a live provider outage, not desktop-host proof, and it
   makes no claim about error codes, tools, or gestures outside those cases.

# Superseded: R1 fix at the update path only (2026-09-15)

Byte-exact copy of the 059 design artifact set as it stood after code review
finding R1 was corrected at `update({ unavailable: true })` and the full proof,
independent verification and focused cursor regression had all passed against
it. It is kept for comparison only. `design/review-direct-manipulation.html`
outside this directory remains the one current primary artifact and the only
live authority; nothing here is served, built, or re-run.

## Why it was superseded

R1's correction was applied at the first named branch only. `reportError` is the
other existing entry point that drops editing in place — it sets
`editable = false; status = 'unavailable'` for `already_consumed`,
`provider_unavailable`, `unknown_request` and `review_historical`, then calls
`clearTimeout(saveTimer)` and `cancelDrag()`. `cancelDrag()` returns before
`render()` when no drag is in flight, and `message()` only emits, so a pointer
resting on a selected handle or border kept its resize or move cursor after the
provider had already refused. The current set carries the same one-line
`refreshAction()` correction on that branch; this copy carries the reviewed
behaviour, so its own regression run is the reproduction.

## Contents

| Copy | Revision it preserves |
| --- | --- |
| `review-direct-manipulation.html` | `sha256:82fe71ee9ef4887c18a74289bca648af236b058ee4d23f81f7b2441a2ae96a66` |
| `prototype/review/engine.mjs` | `sha256:0bf45e4803f8c77c139ed1d6a54634fa39bf7a3f213cb57bbe28f341e9c5a31a` |
| `prototype/review/geometry.mjs` | `sha256:235d2c05039581c40429f41cdf9a0c8e2a63e946fc3da37b8c273691dbf943a9` |
| `prototype/review/styles.css` | `sha256:1e73e9a1e4558601cc5f164e9f3acf5412938ba130048b2d5b064bb8e9ab668f` |
| `prototype/proof-unavailable-cursor.mjs` | `sha256:83ccc2a38f48711673381b255ed96621ae62eeb853cab1685cb1d62fd1157546` |
| `evidence/capability-declaration.md` | `sha256:337ddd01f112a9b43d4db88d9d6a6e33923cdbae6ae43d78e3e2d01b42df91c0` |
| `evidence/source-provenance.json` | `sha256:79612ce1b571933278bfc876380cf16a12fd60495d2bcad258f52ff31afde794` |

The preserved `proof-unavailable-cursor.mjs` is the two-case form, covering the
`update` entry point only. The rest of `prototype/` (host, driver, harness,
proof and verification scripts, frontend copies, bundled assets) and `fixtures/`
are copied unchanged; the copied `evidence/source-provenance.json` lists every
revision in the set.

## Evidence that belongs to this set

Retained in place under `design/evidence/` and `design/screenshots/`; those files
are immutable and are not duplicated here.

- `evidence/regression-unavailable-cursor-2026-09-15T22-16-26-750Z.json` — `sha256:4c1afc272617994ff207089a692b59f0820c043aef99fe2ed7f372dfc3d1a9a3`
- `evidence/regression-unavailable-cursor-2026-09-15T22-17-10-045Z.json` — `sha256:905f573e7809197def1534e61f6b8fe3b4d5f93a0280a0f20d4425bb9f58895d`
- `evidence/proof-2026-09-15T22-18-24-191Z.json` — `sha256:200d42c1543e69f80d0b50d0861940ea8c0def545e9c22aa7be1b1747b83fafa`
- `evidence/independent-t001-2026-09-15T22-19-04-134Z.json` — `sha256:f70ed3fbc29391bcb775096ebb41070c9828c7a54cce580390f5f41551af6598`
- `screenshots/proof-2026-09-15T22-18-24-191Z-*.png` and `screenshots/independent-2026-09-15T22-19-04-134Z-*.png`

Those reports describe this engine revision and record it as the loaded one.
They are not current proof of the revised engine; the current set carries its own
fresh evidence, including the reproduction that this revision fails.

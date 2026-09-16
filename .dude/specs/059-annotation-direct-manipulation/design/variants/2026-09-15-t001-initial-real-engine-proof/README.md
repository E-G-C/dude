# Superseded: first T001 real-engine proof set (2026-09-15)

Byte-exact copy of the 059 design artifact set as it stood when the initial T001
proof and the independent T001 verification ran. It is kept for comparison only.
`design/review-direct-manipulation.html` outside this directory remains the one
current primary artifact and the only live authority; nothing here is served,
built, or re-run.

## Why it was superseded

Code review found that `update({ unavailable: true })` blocked editing but left
the transient action cursor painted under a stationary pointer, because
`cancelDrag()` returns before `render()` when no drag is in flight. The current
set carries the fix; this copy carries the reviewed behaviour.

## Contents

| Copy | Revision it preserves |
| --- | --- |
| `review-direct-manipulation.html` | `sha256:82fe71ee9ef4887c18a74289bca648af236b058ee4d23f81f7b2441a2ae96a66` |
| `prototype/review/engine.mjs` | `sha256:539f607f28598095144aac5f3f1dd4da0401ed9e01e8ef01993f80c1aa4b919c` |
| `prototype/review/geometry.mjs` | `sha256:235d2c05039581c40429f41cdf9a0c8e2a63e946fc3da37b8c273691dbf943a9` |
| `prototype/review/styles.css` | `sha256:1e73e9a1e4558601cc5f164e9f3acf5412938ba130048b2d5b064bb8e9ab668f` |
| `evidence/capability-declaration.md` | `sha256:757c9a2d65fec3f68e0f28100f6056eb6ce3e5d2ba07ff06ddc2dc2dc44a1080` |
| `evidence/source-provenance.json` | `sha256:4eff5704a8fd0348cac7106004462df58fc1dd6ddc3df90ea18f02992e9e40a1` |

The rest of `prototype/` (host, driver, harness, proof and verification scripts,
frontend copies, bundled assets) and `fixtures/` are copied unchanged; the copied
`evidence/source-provenance.json` lists every revision in the set.

## Evidence that belongs to this set

Retained in place under `design/evidence/` and `design/screenshots/`; those files
are immutable and are not duplicated here.

- `evidence/proof-2026-09-15T21-46-04-284Z.json` — `sha256:0b65dba4012d77a8431b1632bbb00a98a3a781dba6d9d89042862477ea5e7472`
- `evidence/proof-2026-09-15T21-50-56-162Z.json` — `sha256:f583d373d8594acc1897bb41b860b2ea3c359b1ca11ba9bdb779e4497c52cfc1`
- `evidence/independent-t001-2026-09-15T21-55-42-017Z.json` — `sha256:003d2250b64671d167802a4f7759e3729ed1b0b9de7147c76bc2b260f3963819`
- `screenshots/proof-2026-09-15T21-50-56-162Z-*.png` and `screenshots/independent-2026-09-15T21-55-42-017Z-*.png`

Those reports describe this engine revision. They are not current proof of the
revised engine; the current set carries its own fresh evidence.

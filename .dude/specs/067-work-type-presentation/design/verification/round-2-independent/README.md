# 067 round 2: independent final verification (2026-10-20)

The Tester ran the full focused mock runner, including `appearance`, against the
round 2 mock. This is not UI approval, not implementation verification, and not
release approval. Earlier evidence is unchanged: `../report.json`,
`../round-2-reviser-focused/`, and every earlier screenshot folder.

## Result

PASS: 80 checks, 76 passed, 0 failed, 4 observations, 4,768 assertions, 156
frames, 66 screenshots. Exit 0 in 364 seconds.

- Round 1 selection (70 checks): 67 passed, 0 failed, 3 observations.
  `N.M11b` and `N.X-none` now pass, and so do the four round 1 observations that
  round 2 targeted (`K.working-on-browsing`, `K.requests-row-source`,
  `K.copy-plural`, `K.capture-announcements`).
- Added checks (10, in `runner/checks-r2.mjs`): 9 passed, 1 observation
  (`A.announce-channels`).
- Remaining observations: `K.contract-notes`, `K.finder-popup-covers-form`, and
  `K.designer-log-binding` (unchanged from round 1), plus `A.announce-channels`.

```text
node "C:\Users\EG\AppData\Local\Temp\dude-067-verify-r2-20261020-012115-907fb1\run.mjs"
  --repo <repo>
  --out <repo>\.dude\specs\067-work-type-presentation\design\verification\round-2-independent
  --shots <repo>\.dude\specs\067-work-type-presentation\design\screenshots\verification-round-2-independent
```

Edge 156.0.4314.15, headless, over CDP, `file://` only. `report.json` binds the
subject: HTML `6eaf6bc8…c4cdc5` (19,070 bytes), runtime `27646058…c2e3` (870,043
bytes), legal file `20c1596d…2758` (unchanged). The browser's network response
body for the runtime hashed to the runtime hash.

## Test-only runner update

The round 1 runner (digest `ff2969b0f0f721d52e3384fccf146feabe07daec4ba0effe60d2b850c501ee60`)
was copied, not edited. The copy in `runner/` has digest
`51b9c77a95bbc93d7c3ca969ed89005647bab197d160b38127a363891c2134c7`.
No round 1 assertion was removed, weakened, skipped, or re-thresholded.

| File | SHA-256 | Change |
| --- | --- | --- |
| `run.mjs` | `1829cdef…476e` | Bound to the supplied hashes and the real runtime length (round 1 compared 868,935 literally). Strict network-body hash. New output defaults and an overwrite guard. Preservation now covers earlier reports and screenshots, plus a whole-repository manifest. |
| `checks-now.mjs` | `dda406f1…5114` | The `N.M11b` cause note is attached only when the absence claim is observed. |
| `checks-obs.mjs` | `6ab5a59a…3184` | The `K.capture-announcements` note was stale (it said no live region existed); it is now computed from the files. |
| `checks-r2.mjs` | `dc2b4621…7205` | New: variant and evidence preservation, M11b negative in both coverage cases with controls, Requests-row source, Browsing and Working on, singular grammar, status regions, announcer channels. |

Three pilot runs (two of the new checks, one of the full selection) wrote only
to temporary folders outside the repository. This folder holds the final run.

## Announcer channels

`report.json` field `announcer` holds every event. Edge 156 provides
`document.ariaNotify`, so Fluent's `AriaLiveAnnouncer` (react-aria 9.17.14)
speaks MessageBars through it, not through a DOM region. `MessageBar`
(react-message-bar 9.7.6) announces from an effect that depends on the body
ref, actions ref, announcer, and politeness, so it runs on mount and when
politeness changes, not on an in-place text edit.

| Mock | Status texts (5 outcomes) | Through ariaNotify only | Through both channels | Through neither |
| --- | --- | --- | --- | --- |
| Round 1 variant | 17 | 12 | 0 | 5 (`Awaiting capture delivery`) |
| Round 2 | 17 | 0 | 12 (identical text, within 2 ms) | 0 (`Awaiting capture delivery` is DOM only) |

In round 2, `Responding` arrives as an `ariaNotify` call (normal priority) and a
region insert. The main result (`Work item saved`, `Delivery uncertain`, `Not
sent`) arrives as a polite region update and a high-priority `ariaNotify`. The
secondary notices (`Existing intent kept`, `Domain not recorded`) arrive as a
region insert and an `ariaNotify`. `artifact-import.jsx` line 167 and
`pack-sources.jsx` line 303 already wrap a MessageBar the same way. The Needs you
`Notice` (`needs-you.jsx` line 10) does not.

No screen reader or other assistive technology was run, so whether any of them
speaks a result twice is not tested. The events show duplicate delivery, not
duplicate speech.

## Limits

One engine (headless Edge on Windows), mock data, and no real provider. The 200%
check is emulated (720x450 at device scale 2). Contrast covers rendered text
over sampled pixels, not icons, hover, or forced colors. Keyboard coverage is
the first stops of three views plus Enter on every fixture row.

# 067 round 2: reviser's focused regression (2026-10-20)

This folder holds the reviser's checks of the round 2 mock. It is not the
Tester's independent final run, and it is not approval. Round 1 evidence stays
unchanged in `../report.json` and `../../screenshots/verification-preapproval/`.

## Subject

| File | SHA-256 | Bytes |
| --- | --- | --- |
| `design/work-type-presentation.html` | `6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5` | 19070 |
| `design/work-type-presentation.js` | `27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3` | 870043 |
| `design/work-type-presentation.js.LEGAL.txt` | `20c1596d99736bf8f9c18e6e056c97495c9362c406a9984c889361706f002758` | 65638 |

The runtime came from `build-mock.mjs` in this folder. The same script rebuilds
`design/variants/round-1-initial/source/` into round 1's runtime
(`f3cd9c04…`, 868935 bytes) and legal file byte for byte.

## Focused runner result

The Tester's ten runner files were copied byte for byte into the reviser's own
temporary directory (runner digest
`ff2969b0f0f721d52e3384fccf146feabe07daec4ba0effe60d2b850c501ee60`, the same as
`../report.json`) and run from there, so the Tester's directory was not used:

```text
node <copy>\run.mjs --repo <repo> --only bind,list,now,capture,obs
  --out .dude\specs\067-work-type-presentation\design\verification\round-2-reviser-focused
  --shots .dude\specs\067-work-type-presentation\design\screenshots\verification-round-2-reviser-focused
```

Exit 1 after 79 seconds: 59 checks, 55 passed, 1 failed, 3 observations,
2486 assertions. The `appearance` group (contrast, clipping, focus, option
lists, and accessibility names across four appearances and six sizes) was not
run.

- `N.M11b` and `N.X-none`, which failed on round 1, pass.
- `K.working-on-browsing`, `K.requests-row-source`, `K.copy-plural`, and
  `K.capture-announcements` now pass.
- The one failure is `B.binding`'s literal at `run.mjs` line 66, which
  expects round 1's 868935 bytes. The HTML states 870043 bytes and the
  matching SHA-256; the other ten binding assertions pass.
- Remaining observations: `K.contract-notes` (the plan's progress contract;
  definition owner), `K.finder-popup-covers-form` (today's 062 rule at
  `src/extensions/dude/frontend/app.jsx` line 707, unchanged here), and
  `K.designer-log-binding` (the round 1 log, kept as history).
- Product UI and ledger manifest digests were identical before and after the
  run, and equal to `../report.json`.

Three report fields do not reflect this run's options: `command` omits
`--only`, `--out`, and `--shots`; `scope` and `counts.detail` are fixed text in
`run.mjs`; and `N.M11b` prints its "cause" note whether or not it fails.

## Capture announcements

`x-announce-probe.mjs` repeats the Tester's five real Submit outcomes in the same
headless Edge 156 and records both `document.ariaNotify` calls and DOM live
region text. Results are in `announce-probe-round1.json` and
`announce-probe-round2.json`.

- Edge 156 supports `document.ariaNotify`, so Fluent's `AriaLiveAnnouncer`
  speaks each MessageBar through it, and a DOM observer sees nothing. In round
  1 it announced Responding, each result, Existing intent kept, and Domain not
  recorded. It never announced Awaiting capture delivery, because that notice
  updates in place.
- Round 2 wraps each capture status in a polite, atomic status region, as
  today's import status does. The DOM regions now carry every phase. The
  `ariaNotify` calls are unchanged, so screen readers may hear a result twice,
  the same trade-off as the import status.

## Preservation

`package-manifest-before-revision.json` lists the SHA-256 of all 136 package
files taken before any round 2 write. Afterward, 133 were byte-identical,
including `spec.md`, `plan.md`, `tasks.md`, `../report.json`, and every round 1
screenshot. The three changed files are the HTML, the runtime, and
`source/work-type-presentation.jsx`; the legal file rebuilt byte-identical.
New files are only in `design/variants/round-1-initial/`, this folder, and
`design/screenshots/verification-round-2-reviser-focused/`.

## Screenshot comparison

`x-shot-diff.mjs` compared each screenshot here with its round 1 counterpart,
below the mock strip (`screenshot-diff-round1-vs-round2.txt`). Differences are
limited to the intended changes: the Overview closed-count line (M1, M2, S3,
and the finder popup), the M11a and M11b report and header, and the Browsing
view. M12 capture states are pixel-identical. M14a differs by 112 pixels in the
rail's moving selection indicator, captured mid-animation.

Both probe scripts run only from a copy of the Tester's runner directory,
because they import its `cdp.mjs`, `harness.mjs`, and `probes.mjs`. Every
browser used a unique temporary profile; cleanup touched only owned processes
and removed each profile.

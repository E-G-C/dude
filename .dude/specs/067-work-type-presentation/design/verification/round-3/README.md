# 067 round 3: focused independent verification (2026-10-23)

Verdict: FAIL. 28 of 29 checks pass; `L6` fails on one small, reproducible honesty gap. Test-only evidence for the
revised mock. It is not UI approval, not implementation verification, and not release approval.

Subject (bound by hash in `report.json`): `design/work-type-presentation.html` raw
`abad36e29cdc30453d020a484f1a671cdec1d7d87fee9316815e56917c77a11b` (885,073 bytes), runtime
`66084dc6887b9aa2c7d1942ef8e0af7cbe54cfa64c7af6b53b8ab2c2b20c6bba` (869,085 bytes). The script the browser executed
inline hashed to that runtime. Preserved round 2 HTML `c5c35834...0529` is untouched under `variants/round-2-embedded/`.

## Result

29 checks, 28 passed, 1 failed, 1,502 assertions, 17 fresh PNGs, 148 seconds, headless Edge 156.0.4314.15.

```text
node ".dude\specs\067-work-type-presentation\design\verification\round-3\runner\run.mjs" --repo <repo> --handoff <mock-handoff.json>
```

(The shell piped the output, so the process exit code was not captured. The runner returns 1 when any check fails.)

| Area | Checks | Result |
| --- | --- | --- |
| Binding, detector controls, cleanup, nothing left the page | B1, X x2, Z1, Z2 | pass |
| Self-contained preview (`package-inline.mjs --check` exit 0, file URL and app-origin replica, round 2 control) | S1 to S3 | pass |
| Text-only capture, copy, Submit and Save, Cancel, validation, uncertainty, retry, reasons, Save as work item | C1 to C9 | pass |
| List, details, search, repository not backfilled, every record, unreadable record | L1 to L5 | pass |
| | **L6** | **fail** |
| Progress regression (M4 to M11, M14) and copy sweep | G1, N1 | pass |
| Frames, keyboard focus, selected states, four appearances | A1 to A4 | pass |

## Finding (L6, not self-fixed)

Repro: open the HTML with `?scenario=M1`, open row 912 (Title unavailable). The Next step notice says "Task progress
and detail are withheld", and the progress report says the stage is unavailable. Tasks then says "No tasks are
recorded for this work item." and Activity says "No dated activity is recorded for this work item." Those are absence
claims about a record that could not be read. Today's Canvas says "Task detail unavailable until the selected sources
agree." for the same state. The round 2 mock carried the same two strings, so round 3 did not introduce them, but
they contradict the unavailable-stays-honest requirement under review. Screenshot:
`../../screenshots/round-3-independent/09-details-912-unreadable-600-dark.png`.

## Evidence and limits

- `report.json`: every check with assertion counts, failures, notes, frame measurements, screenshot hashes, preservation
  digests, cleanup. `handoff-input.json` is a byte copy of the coordinator handoff used as the copy and state oracle.
- `../../screenshots/round-3-independent/capture-log.json` binds each PNG to its URL query, viewport, appearance, and raw sha256.
- `runner/` holds the new runner. It imports the round 2 `cdp`, `harness`, `probes`, and `oracle` modules unchanged and
  does not run the round 2 check modules, which pin the removed controls.
- Owner outcomes (clear classified, vague unclassified, matched existing 901 or row 914) are mock fixtures, not a classifier test.
  The mock reuses number 914 for every new capture in one tab.
- Reason order beyond two observable pairs is evidenced by the executed runtime text. Headless Edge only; no screen
  reader, no other engine, and no actual Copilot app host. The replica is a loopback server that mimics the preview hostname.
- Not a WCAG conformance claim. Contrast, overflow, names, and focus were measured from rendered pixels and the Chromium
  accessibility tree. Announcements were observed as `document.ariaNotify` calls and live-region changes.
- The designer's `screenshots/round-3/` report and frames were inputs, not evidence.
- Every pre-existing file in the repository, including older variants, reports, screenshots, spec, plan, tasks, idea, and
  product source, was byte-identical before and after (`Z1`). The Edge process tree, its profile, the temporary folder,
  and the replica server were cleaned up (`Z2`).

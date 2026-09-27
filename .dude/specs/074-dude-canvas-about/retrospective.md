# Retrospective: Dude Canvas About

## 2026-09-26T15:58:19Z — Feature completion

Target: `.dude/specs/074-dude-canvas-about/spec.md`

Owner: `.dude/ideas/074-dude-canvas-about.md`

Dispatch outcome: `completed` (`dude-pack-rubber-duck-retrospective`, one advisory dispatch).

No major issues found.

One minor issue: T003's passing installed-host run depended on a shortened
artifacts root. T012 keeps its host temp root under the evidence directory, so a
slightly longer directory crosses the Windows 260-character path limit and the
real-host catalog probe times out before the About assertions run. The
short-root pass does not establish long-path support. The advisor suggests
keeping T012's run-owned host, profile, and temp roots short and separate from
retained evidence, with a headroom check, while keeping the existing assertions
and deadlines.

The advisor also noted what worked: a narrow About that shows only truthful
recorded refs; verification of real continuity (drafts, Review markup, pack
permission and results) through the real `copilot.exe` plus the user's post-link
check; controlled path-length comparisons that isolated the timeout; and
hash-checked reuse of unchanged evidence instead of repeated full-suite runs.
These observations are advisory; they add no approval, task, revision, or
learning-retention decision.

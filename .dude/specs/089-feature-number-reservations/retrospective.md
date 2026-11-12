# Retrospective: Feature number reservations

## 2026-11-12T18:53:57Z — Feature completion

- Target: Feature 089, `feature-number-reservations`, `.dude/specs/089-feature-number-reservations/`
- Dispatch outcome: completed
- Worked well: the passing native run showed peer-informed capture (local 100, peer 101, chosen 102), progress on both mains, prompt cancellation, and matching retained transcripts, while strict isolation stayed explicitly unqualified. Evidence: `docs/agent-to-agent-communication.md`, "First passing normal-route run".
- Worked well: an independent rejection with a different reviser fixed the account-count wording, and a Linux container covered the Windows-skipped chronology suite without claiming Linux qualification. Evidence: the 2026-11-12T18:36:43Z review entry in the owner log.
- Minor: the original Work capture handoff was gone by close time, so later passing tests could not establish the old run's provenance, and the close relied on a disclosed user concession. Recommended: keep original handoff bytes and hashes outside replaceable session storage, check they still exist before a session ends, and keep later product acceptance separate from the failed, unsettled run. Evidence: the same review entry and the T008 MANUAL entry.
- Suggestion: full native attempts found runtime-contract differences one at a time (CRLF previews, shell trailers, then cancellation error bodies), and each one cost another full qualification loop. Recommended: take small, explicitly authorized native samples early and fold their real event and output shapes into the fixtures before full qualification. Evidence: the review entries at 2026-11-10T23:47:42Z, 2026-11-11T00:37:53Z, and 2026-11-11T03:02:00Z.
- Suggestion: consent and activation windows expired repeatedly, alongside plan and certificate renewals. Recommended: arrange an attended window, confirm the operator can see and answer the active terminal, and preflight the remaining plan and TLS lifetime before launch, keeping owner approvals intact. Evidence: the execution entries from 2026-11-11T00:02:40Z through 2026-11-12T16:12:54Z.

No major issues found.

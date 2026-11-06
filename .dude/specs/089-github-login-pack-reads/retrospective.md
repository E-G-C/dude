# Retrospective: GitHub Login For Pack Reads

## 2026-11-06T17:49:35Z — Ship completion

Target: `.dude/specs/089-github-login-pack-reads/spec.md`

Dispatch outcome: completed.

- Verification exercised the actual goal: 20 Reloads plus three installs in 82.1 seconds without a rate-limit refusal, 34 of 34 live checks, 16 of 16 final Tester checks, and independent reviewer acceptance, including API-only authentication, anonymous raw downloads, and the private-repository refusal.
- The registration guidance said not to opt into expiring tokens but did not name the OAuth App's Optional features setting that turns token expiration off; live run 1 exposed the mismatch. Naming that setting in the registration steps would avoid the repeat.
- A coordinator diagnostic printed an environment value once (the user reported it was a defunct sandbox key). Diagnostics should report variable names, presence, and counts only, never values.
- Completed background-agent results went uncollected for about eight hours, and earlier Canvas requests timed out. Collect results at each wait and resume handoff, and fall back to one precise chat request when a Canvas request times out.
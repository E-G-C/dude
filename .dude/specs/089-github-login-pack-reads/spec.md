---
title: GitHub Login For Pack Reads
slug: github-login-pack-reads
work_type: design
design_status: approved
approved_direction: "Round 4: GitHub sign-in in Settings > Accounts with OAuth App wording; github-login.html; SHA-256 f6bc3d24a14d9415950c0938bd1f05bc2d6db894bdc1ada82b2d8b660e7aa9d6"
preview_path: .dude/specs/089-github-login-pack-reads/design/github-login.html
---

# Design Proposal: GitHub Login For Pack Reads

Let a user sign in to GitHub from Settings > Accounts in Dude Canvas so public-source pack reads use that user's allowance instead of the anonymous allowance of 60 API requests per hour per network address. Sign-in is optional, read-only, and limited to the current Dude session. Without it, pack reads keep working as they do today.

The user's literal answer `2` at 2026-10-30T21:02:15Z selects Dude's own Canvas sign-in and public repositories only, as recorded in `.dude/ideas/089-github-login-pack-reads.md`. The user's literal chat reply `approved` at 2026-11-05T12:47:19Z approves Option B, the exact round-4 mock bound in the Revision Log. It retains the approved round-3 Accounts structure and changes only three registration-type product strings to OAuth App wording. Round 1 was approved and later reopened after implementation review; round 2 was superseded without approval after the user's preference to decouple sign-in from Sources; round 3 is preserved for comparison. This re-definition keeps T001@9e4b7c26, T005@0675cd73, and T006@1b61929e closed and unchanged, derives new open T007@251708dd with no inherited state or completion evidence, and updates T004@f17a4d83 to depend on T007. Approval does not cover a successor mock revision.

## User Scenarios

### US1 - Choose sign-in after understanding it (P1)

The user wants fewer rate-limit interruptions without giving Dude broad account access.

Independent test: open a new Dude session, signed out, and visit Settings > Accounts, both directly and through the pointer in Sources.

1. Canvas opens normally, without a startup sign-in prompt.
2. Before Sign in starts anything, Accounts explains the shared anonymous limit, the benefit of the user's allowance, public read-only access, and signing in again next session.
3. One Sign in action shows a short code and the GitHub verification address. The user enters the code and approves on github.com; Dude never asks for a password.
4. On success, Accounts shows the actual GitHub login and Sign out. The user does not restart Dude or Canvas.
5. The Sources pointer opens Settings > Accounts and focuses the Accounts tab without starting sign-in or a pack read. Returning to Packs preserves selections, filters, and unsent input.

### US2 - Use the same access for every Canvas pack read (P1)

The user wants their allowance to apply throughout pack discovery and installation.

Independent test: start signed in with sufficient allowance, a public GitHub source, and a disposable project.

1. Reload, Add source's catalog check, and install/refresh previews and applies use the signed-in user's allowance for GitHub API reads.
2. Public repositories owned by someone else work too. A private repository remains unreachable.
3. Raw file downloads remain anonymous, and local-folder sources behave as before.
4. Signing out restores anonymous reads without changing source selection, saved sources, installed packs, or existing preview/apply safeguards.

### US3 - Decline or abandon sign-in without losing Canvas (P1)

The user wants to continue without signing in.

Independent test: start a fresh sign-in separately for denial, cancellation, expiry, and a network failure.

1. Each outcome is explained in Canvas, leaves the user signed out, and leaves pack reads anonymous.
2. Canvas remains usable; a new attempt requires another explicit Sign in action.
3. Switching away from Accounts and back, reloading Canvas, or opening a second panel in the same Dude session shows the same pending code and outcome, without starting another attempt.
4. An approval arriving after cancellation or expiry does not sign the session in.
5. An outcome arriving while Accounts is hidden is announced without moving focus from the user's current work.

### US4 - Know which account is used and stop using it (P1)

The user wants control over session access, independently of the app's own login.

Independent test: begin signed in, with two Canvas panels in one session; test sign-out, a new session, and GitHub rejection separately.

1. Accounts in both panels identifies the same signed-in GitHub login.
2. Sign out immediately prevents further use of that access and removes the account from the signed-in display. Accounts explains that this does not revoke the authorization on GitHub.
3. GitHub's Applications settings and its Authorized OAuth Apps list are named as the place to revoke access.
4. A new Dude session starts signed out. If GitHub rejects the credential during the current session, Dude forgets it, displays signed out, and later reads are anonymous.

### US5 - Understand a rate-limit refusal and use a local source (P2)

The user wants an actionable refusal when either allowance is exhausted.

Independent test: cause a rate-limit refusal for each affected pack-read action, once signed out and once signed in.

1. Canvas identifies the refusal as a GitHub rate limit rather than an empty catalog or a missing pack.
2. Signed-out guidance names Settings > Accounts for sign-in. Signed-in guidance explains that the allowance is shared with the account's other GitHub tools; it does not promise unlimited reads or demand another sign-in. Guidance is text-only and continues to describe the allowance used by the failed read.
3. Both states name Settings > Packs > Sources > Add source and a folder whose root contains `library/packs`.
4. Existing local sources remain usable. Dude neither clones automatically nor repeats the failed action automatically.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| The short code expires, normally after about 15 minutes | Stop the attempt at GitHub's stated expiry, explain that the code expired, and remain signed out. A fresh code requires Sign in again. |
| The user denies on GitHub or cancels in Canvas | Stop waiting, discard the attempt, and continue anonymously. Ignore a late success for that attempt. |
| There is no network during sign-in | Show that sign-in could not finish; remain signed out and keep Canvas working. Do not retry sign-in without an explicit action. |
| Sign-in is unavailable from GitHub | Explain that sign-in is unavailable without blocking anonymous or local reads. |
| Canvas reloads or another panel opens while waiting | Show the same pending attempt, code, and eventual outcome. Only one attempt runs for the session. |
| The user leaves Accounts or clicks outside its sign-in controls while waiting | Keep the same attempt. Announce its outcome without pulling focus back; returning to Packs retains selections, filters, unsent input, and refusal results. Navigation alone starts no sign-in or pack read. |
| GitHub rejects access after it was revoked | Clear the session's access and signed-in account. Report the failed read honestly; later explicit reads are anonymous. |
| The signed-in user's allowance is exhausted | Keep the valid sign-in, explain the shared allowance, and offer the local-folder path. Do not silently switch to anonymous requests to repeat the operation. |
| A local folder or GitHub Enterprise upstream is involved | Preserve its existing handling. This sign-in neither supplies credentials to it nor changes its availability. |
| Sign out happens during a pack operation | Prevent new authenticated reads. Preserve the existing operation's honest outcome and any write already authorized; sign-out is not an undo or a request to repeat the operation. |
| A private or missing GitHub repository is requested | Keep it unreachable. Do not broaden access, clone it, or describe it as an empty catalog. |

## Functional Requirements

### Consent and scope

- FR-001: Settings > Accounts explains why GitHub sign-in helps before the user starts it, including optional use, public read-only access, the shared allowance, and the session-only lifetime.
- FR-002: Dude starts sign-in only after the user selects Sign in in Canvas, never at startup or through an extension restart.
- FR-003: Canvas presents a short code and GitHub verification address for the user to approve on github.com.
- FR-004: Dude never asks for or handles the user's GitHub password.
- FR-005: While signed in, Canvas uses the user's allowance for public GitHub pack Reloads, Add source reads, and install/refresh previews and applies.
- FR-006: The access obtained by Dude permits only reading public information; private repositories remain unreachable.
- FR-007: While signed out, pack reads send no credential and make the same source requests as today's anonymous path.

### Session control

- FR-008: Dude retains sign-in information only for the current running Dude session and writes none of it to disk.
- FR-009: Canvas reloads and additional panels in that session share one sign-in state and, while waiting, one pending attempt.
- FR-010: Declining, cancelling, or expiring an attempt leaves reads anonymous and Canvas usable, with no later activation of that attempt.
- FR-011: A sign-in failure leaves Canvas signed out with a clear reason and an explicit way to try again.
- FR-012: Sign out immediately discards usable local access and prevents further authenticated requests with it.
- FR-013: Canvas tells the user that local sign-out does not revoke GitHub's authorization and names GitHub's Applications settings and its Authorized OAuth Apps list for revocation.
- FR-014: When GitHub rejects the credential, Dude forgets it and updates every open panel in that session to signed out before another read can use it.
- FR-015: After successful sign-in, Canvas identifies the actual GitHub login being used; after access is forgotten, it no longer displays that login as signed in.

### Credential handling and refusals

- FR-016: The access credential never appears in Canvas or its page data, logs, errors, evidence, or disk writes; its only network destination is GitHub's public API.
- FR-017: Raw file downloads send no access credential, including while signed in.
- FR-018: A rate-limit refusal is explicitly identified wherever an affected pack read fails.
- FR-019: Rate-limit guidance names Settings > Accounts for sign-in when the failed read used the anonymous allowance and explains the shared account allowance when it used signed-in access. Guidance stays text-only and describes the allowance used by the failed read.
- FR-020: Every rate-limit refusal names Settings > Packs > Sources > Add source and a local folder whose root contains `library/packs`.
- FR-021: A rate-limit refusal keeps valid sign-in access and does not automatically retry the operation with either allowance.

### Continuity and design

- FR-022: Switching Settings sections or changing sign-in state alone performs no pack Reload, source save, install, refresh, or removal, replays no failed read, clears no refusal, and preserves Packs view state, selections, filters, and unsent work.
- FR-023: Sign-in leaves local-folder reads, non-GitHub upstream handling, pack write authority, and source trust warnings unchanged.
- FR-024: The sign-in controls and Sources pointer are keyboard-operable and expose their names and states. Waiting, success, and failure are announced accessibly, including while Accounts is hidden, without taking focus from elsewhere.
- FR-025: Documentation and in-product text replace blanket claims that Canvas never asks for or sends credentials with the optional sign-in behavior, its limits, and anonymous/local-folder guidance. Source-address checks retain the narrower guarantee that Dude never sends a user name or password taken from a source address.
- FR-026: UI source changes and task derivation wait for the user's explicit approval of the exact canonical mock.

## Key Entities

- Session access: the current session's GitHub credential and public account login. It is not a pack-source setting or an installed-pack record.
- Pending sign-in: one short-lived approval attempt shared by the session's Canvas panels. The user-facing short code is intentionally visible; it is not the access credential.
- GitHub authorization: permission maintained by GitHub that may remain after Dude forgets session access. The user revokes it on GitHub.
- Pack source: the existing GitHub repository or local-folder source. Signing in adds no new source type.

## Visual Intent

Follow the familiar device-code interaction used by `gh auth login` and VS Code's GitHub sign-in: explain first, show a code, and let GitHub handle approval. Accounts follows VS Code's Accounts menu and GitHub Desktop's Accounts settings, separating session-wide sign-in from pack sources. Showing the account helps the user distinguish Dude's allowance from the main app's login.

### Should Feel

- Like a small optional account capability in Settings > Accounts, separate from the Sources view.
- Clear about which account is used, what access permits, and how to stop.

### Should Never Feel

- Like a prerequisite for opening Canvas, installing from a local folder, or declining permission.
- Like a password form, credential manager, or promise of unlimited GitHub use.

## Scope And Surfaces

Put the GitHub sign-in explanation, every state and outcome, and all sign-in actions in Settings > Accounts, with Settings sections ordered `Packs | Accounts | Appearance | About`. It applies to all public GitHub pack reads in the session, not only the selected source. Sources keeps one line: "GitHub sign-in is managed in Settings > Accounts." The "Settings > Accounts" pointer opens Accounts and focuses its tab without starting sign-in or a pack read.

Keep the vertical-left navigation, existing pack workflows, and the working capture, response, and Review surfaces. The round-3 approval accepts adding Accounts to the approved 085 Settings structure. Accounts shows "Accounts · This session" in the footer and no pack Reload toolbar; its text depends only on the sign-in session. Refusal marks and manual Reload instructions stay on the pack surfaces.

Show signed out, requesting, waiting with the code, verification address, and expiry time of day, signed in with the account and Sign out, and cancelled, declined, expired, couldn't reach GitHub, Sign-in unavailable, Sign-in didn't finish, Signed out with the revocation link, and Signed out: GitHub rejected the access. The verification address and short code must remain selectable. Do not add a credential-entry form, account picker, avatar download, quota dashboard, remembered-login switch, or automatic browser launch.

Out of scope: private repositories; credential storage across sessions; the app-login route; GitHub Enterprise sign-in; automatic cloning; multi-select installation; the unreproduced post-install list reset; and the separate catalog call-count fix. Chat-invoked compose commands remain anonymous because this access lives in the Canvas session. Sharing access with chat is a possible follow-up, not a requirement or task in this package. Bundle updates and artifact imports do not acquire this access.

Continuity references: `.dude/ideas/052-dude-canvas-ui.md`, `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`, `.dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html`, and `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`. Extend those approved surfaces and current functionality; do not restart the workspace design. Lifecycle numbers record capture chronology only.

## Brand Fit

- Preserve the established Fluent Canvas controls, spacing, typography, focus treatment, and ordinary/app-following appearances.
- Keep permission, waiting, and rate-limit wording factual. A successful account display is enough; no promotional banner is needed.
- Meet WCAG 2.2 AA, including text contrast, essential control boundaries, focus, and reflow.

## Direction Options

### Option A - Sign in alongside pack sources

The earlier direction placed the explanation and Sign in in Sources, replacing that area with the pending code or signed-in account while retaining the source list and its existing actions. It used the existing external-link treatment and selectable code text, without an unverified clipboard capability.

Round 1 was approved, then reopened after implementation review; it is preserved at [github-login-round-1-superseded.html](design/github-login-round-1-superseded.html). Round 2 was presented at 2026-11-03T15:18:08Z, never approved, and is now preserved at [github-login-round-2-superseded.html](design/github-login-round-2-superseded.html). Both are comparison variants, not the approved direction.

### Option B - Sign in under Settings > Accounts

The approved direction moves the explanation and every sign-in state and outcome to Accounts, separate from Sources. Settings sections become `Packs | Accounts | Appearance | About`; Sources keeps a one-line pointer to Accounts. Round 4 retains this round-3 structure and round 2's accessible links.

Primary mock: [github-login.html](design/github-login.html). The user's literal chat reply `approved` at 2026-11-05T12:47:19Z approves only the exact round-4 revision recorded in the Revision Log. Round 3 is preserved at [github-login-round-3-superseded.html](design/github-login-round-3-superseded.html), with its screenshots in `design/screenshots/round-3-superseded/`.

## Proposed Direction

Option B, round 4, is the approved direction from the user's literal chat reply `approved` at 2026-11-05T12:47:19Z. It retains the round-3 structure approved at 2026-11-03T23:26:16Z, following the user's 2026-11-03T19:21:43Z preference to decouple GitHub sign-in from Sources. Their private-repository example describes a possible later feature; 089 stays public-only.

Round 4 changes only three registration-type product strings after the user's "Dude is not a github app" at 2026-11-05T01:38:37Z, plus mock-only labels and notes. The registration returns to an OAuth App owned by E-G-C, as option 2 first described. Every other approved product string, style, behavior, route, and structural choice stands.

Accounts follows the account-area convention in VS Code and GitHub Desktop. It presents the same session-wide sign-in used by every Canvas panel and public GitHub pack-read action, independently of pack-source state.

Changes from round 2:

1. Accounts holds the explanation and every sign-in state and outcome, retaining round 2's accessible links. Its text depends only on the sign-in session, not source rows or pack refusals: the rejected-access outcome and signed-in text omit round 2's Reload sentences. The footer reads "Accounts · This session". No pack Reload toolbar appears there.
2. Sources keeps "GitHub sign-in is managed in Settings > Accounts." The "Settings > Accounts" pointer opens Accounts and focuses its tab without starting sign-in or Reload. While source rows show rejected access, Sources shows "GitHub rejected the sign-in" with "GitHub rejected the sign-in Dude was using, so Dude signed out. Choose Reload packs to read these sources anonymously."
3. Rate-limit guidance is text-only and the same on every refusal surface. Signed out: "To continue, sign in under Settings > Accounts, or try again later." Signed-in guidance retains the shared-allowance explanation. Both states separately name "Settings > Packs > Sources > Add source" and a local folder whose root contains `library/packs`. Each refusal continues to describe the allowance used by that failed read.
4. In approved round 4, revocation text in the Signed out bar and signed-in text reads: "GitHub keeps the authorization until you revoke it in GitHub's Applications settings at https://github.com/settings/applications, under Authorized OAuth Apps." Verification of the URL's signed-in landing and reachable tab belongs to T004's live session; the text does not promise a direct tab landing. "Sign-in unavailable" says "Dude's OAuth App registration isn't set up for device sign-in, so sign-in can't start. Dude's maintainers need to set it up. Pack reads stay anonymous, and local folders work as before."

The approved round-3 placement, retained in round 4, replaces round-1 choice 1, the section above the Sources table. Choices 2 through 6 still hold:

2. After a failure, the user selects Sign in again to retry; there is no separate retry action.
3. The selectable code shows its expiry time, with no countdown and no Copy button.
4. After Sign out, the outcome includes a link to GitHub's page for revoking Dude's access.
5. Rate-limit messages use the same signed-in or signed-out guidance across the affected surfaces.
6. Reword the in-product "Canvas never sends credentials" claim while preserving its true source-address meaning under FR-025.

The public-only boundary is unchanged. Registration details and live prerequisites belong in `plan.md`.

Accepted trade-offs:

- The fourth tab makes the Settings header taller in narrow panels: 73px instead of 37px at 360px wide, and 165px instead of 133px at 180px wide. Nothing is clipped in the approved mock.
- After sign-in following an anonymous rate-limit refusal, the Sources message still describes that refused anonymous read and says to sign in. The Reload packs button is the cue to retry.

Preserve explored variants, keep mock-only fixtures out of product chrome, and require explicit approval for any successor design revision.

## Visual Success Criteria

- VSC-001: At 180x450, 360x900, 768x900, and 1440x900, and at 200% zoom, the explanation, code, account, and actions remain readable and reachable without page-wide horizontal scrolling, clipped labels, or shrinking text/targets. Essential targets are at least 24px.
- VSC-002: Text meets 4.5:1 contrast, or 3:1 for large text; essential control boundaries and focus indicators meet 3:1 against adjacent surfaces in both appearances and exposed interaction states.
- VSC-003: Keyboard and screen-reader checks cover the Accounts tab, the Sources pointer and return navigation, starting, cancelling, waiting, expiry, denial, success, sign-out, and rate-limit guidance. Outcomes arriving while Accounts is hidden or focus is elsewhere do not steal focus or lose existing work.
- VSC-004: Rendered implementation matches the user-approved canonical mock and retained 052/084/085 structure with the approved Accounts section added to Settings. Mock-only fixture controls never enter product chrome.

## Success Criteria

- SC-001: With a fresh standard user allowance, no competing quota use, and a functioning public source, 20 Reloads of the 20-pack E-G-C/dude catalog plus three installs complete within one hour without a rate-limit refusal. With the separately fixed six-request Reload, those Reloads alone exceed the anonymous allowance at 120 requests.
- SC-002: A planted sentinel credential appears zero times in Canvas responses/page data, logs, errors, evidence, and disk writes across successful sign-in, failures, pack reads, and sign-out.
- SC-003: Signed-out comparisons produce the same source requests as the current anonymous path, with zero credentials sent. Opening Canvas or Settings starts zero sign-in requests. Opening Accounts or using the Sources pointer starts no sign-in or pack Reload; sign-in state changes trigger zero pack reads.
- SC-004: Every denial, cancellation, expiry, and offline sign-in case leaves Canvas usable and later reads anonymous. Switching away from Accounts and back, reloading Canvas, and opening a second panel cause zero duplicate sign-in attempts.
- SC-005: Sign-out, a new session, and a credential rejection each prevent later credential use and remove the signed-in account display. Sign-out starts no GitHub revocation request.
- SC-006: Each affected read path in FR-005 uses the authenticated allowance when signed in; private repositories stay unreachable, raw downloads remain anonymous, and local/non-GitHub paths retain their existing behavior.
- SC-007: Every tested rate-limit refusal identifies the limit, gives the correct signed-in/out advice, and includes the exact local-folder route. It causes zero automatic retries or source/pack changes.
- SC-008: Explicit mock approval precedes UI source changes and task derivation; all visual criteria pass against that approved revision.

## Assumptions

- "Session" means the current running Dude session, not each Canvas page load. Sharing one pending attempt across its panels avoids duplicate approvals; it creates no cross-session sign-in.
- Show the public GitHub login, without an avatar or profile view. The extra account lookup is justified by knowing whose allowance is being used, especially when it differs from the app's account.
- GitHub remains the authority for access and allowance. Signing in increases the available allowance but cannot guarantee availability when other tools exhaust it.
- The coordinator reports the separate 26-to-6 Reload fix implemented, independently tested, reviewed, and still uncommitted. It is the current acceptance baseline, not work owned by 089.
- Existing project and bundle guardrails cover this feature. No new durable rule is proposed.

## Revision Log

- 2026-10-30T21:09:15Z - define: Prepared the first exploring proposal from the user's option-2 answer and selected the canonical preview path. Mock creation and explicit user visual approval remain pending; no product implementation or task derivation.
- 2026-10-30 - define: Presented round 1 at `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `62b9f9289fdcde59f0484ca3dbfe6f7bdc6c0675b3298ee4ea2317321710ac98`. The settled proposal places GitHub sign-in above the Sources table and shows the consent, waiting, account, failure, and rate-limit states. This date-only entry backfills the proposed direction; no exact presentation time is known. Explicit user approval remained pending.
- 2026-10-31 18:01 UTC - define: Approved Option A, "Round 1: GitHub sign-in above the Sources table", through the user's literal chat reply "approved" at 2026-10-31T18:01:40Z, with no other text. The earlier Canvas request `089-design-approval-round-1` timed out at the host after 1,800 seconds and now shows `cancelled` with no receipt; approval comes from the later chat reply, not a Canvas receipt. Before that reply, Dude listed the six accepted choices: the sign-in section above the Sources table; Sign in again after a failure; the code's expiry time with no countdown or Copy button; the GitHub revocation link after Sign out; consistent rate-limit wording everywhere; and rewording "Canvas never sends credentials". Approved artifact: `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `62b9f9289fdcde59f0484ca3dbfe6f7bdc6c0675b3298ee4ea2317321710ac98`. The coordinator re-hashed it after the reply and found it unchanged. FR-025 now covers the in-product wording as well as documentation, retaining the guarantee that Dude never sends a user name or password taken from a source address. Approval is limited to this exact round-1 revision. No execution or task completion is claimed.
- 2026-11-03T12:08:30Z - reopened after implementation: The T003@6d92e0ab design close was classified as "Design refinement needed": the verification and revocation links measure 4.36:1 when pressed in the ordinary dark appearance, below VSC-002's 4.5:1; the approved mock's own link has the same 4.36:1 contrast. The links are 19px high, below VSC-001's 24px minimum. `design_status` is `proposed` again; `approved_direction` stays as round-1 history and is not withdrawn. Round 2 will add accessible links and document the four reviewed wording adaptations and the GitHub link wrap at a 300px container or narrower. Round 1 will be preserved for comparison as `design/github-login-round-1-superseded.html`, with its screenshots under `design/screenshots/round-1-superseded/`. The user's literal reply "approve round 2" at 2026-11-03T12:04:26Z starts round 2 but does not approve it. Explicit user approval of the exact round-2 mock is required before task derivation or UI source changes.
- 2026-11-03T15:18:08Z - presented round 2: Settled `.dude/specs/089-github-login-pack-reads/design/github-login.html` at the unchanged `preview_path`, SHA-256 `045b477714a331e6e25f42cdb1c5f49ff8c0ffb5c1d956503526d23faba02731`, 768,436 bytes. FluentUI drew this narrow successor to round 1 and refined it once before presentation. Changes: higher-contrast, taller clickable GitHub address lines with narrow-width wrapping and the round-1 focus-ring size; the product's exact wording and outcomes, with a mock-only "Round 2 changes" note; and round-1 comparison assets preserved alongside 22 round-2 screenshots. Two independent Tester runs in Microsoft Edge reported minimum link text contrast of 5.83:1 and focus-ring contrast of 4.56:1 across ordinary and app-following light and dark looks at rest, hover, pressed, and focus; minimum clickable line height of 27px across Segoe UI, Segoe UI Variable, Arial, Times New Roman, and system-ui; and no page-wide horizontal scroll at 180x450, 360x900, 768x900, 1440x900, or 200% zoom. Both reported changes limited to the documented regions and all six approved round-1 choices retained. The overlap and narrow-width wrapping notes in Proposed Direction remain visible for the user's decision. Explicit user approval of these exact bytes is pending before task derivation or UI source changes. The user's "approve round 2" at 2026-11-03T12:04:26Z started this round; it did not approve it.
- 2026-11-03T21:47:23Z - presented round 3: Settled Option B at the unchanged `preview_path`, `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `edd1d1c718bfe2447f009be81042b990100a4176e51de26abdfb8d085c9cf1a3`, 789,289 bytes, with 25 round-3 screenshots at the top level of `design/screenshots/`. This follows the user's 2026-11-03T19:21:43Z preference to decouple GitHub sign-in from Sources; private-repository access was an example of later use, and answer "2" keeps 089 public-only. The Architect, as planning authority, set the envelope from GitHub documentation verified by a research check: `Packs | Accounts | Appearance | About`, following VS Code's Accounts and GitHub Desktop's Accounts settings, with frontend-only changes reusing the existing session routes and events. Accounts holds the explanation and every round-2 sign-in state and outcome with its accessible links; its text depends only on the session, omits the rejected-access and signed-in Reload sentences, shows "Accounts · This session" in the footer, and has no pack Reload toolbar. Sources keeps the one-line Accounts pointer, which opens and focuses the Accounts tab without starting sign-in or Reload, and shows "GitHub rejected the sign-in" with the existing Reload instruction while source rows show that rejection. Every refusal surface points signed-out users to Settings > Accounts or trying again later, and both sign-in states name Settings > Packs > Sources > Add source with a local folder whose root contains `library/packs`. Revocation names Authorized GitHub Apps at `https://github.com/settings/applications`; the landing tab is left for verification in T004's live session. "Sign-in unavailable" says "GitHub App registration". The planned registration is a GitHub App with no repository permissions, Device Flow on, webhook inactive, and token expiry turned off; the user registers it for T004 after approval and re-definition. This keeps read-only access to user-chosen repositories possible later without the OAuth App's write-capable `repo` scope, but adds no private-repository access to 089. Approved round-1 choices 2 through 6 remain; the user's preference replaces choice 1. Independent Tester results on these final bytes in Edge 157: lowest link and control text contrast 5.18:1 and lowest focus-ring contrast 4.57:1 across ordinary and app-following light and dark at rest, hover, pressed, and focus; clickable line height at least 27px for the GitHub links and Sources pointer across Segoe UI, Segoe UI Variable, Arial, Times New Roman, and system-ui; no page-wide horizontal scroll or clipped label in 1,240 loads at 180x450, 360x900, 768x900, 1440x900, and 200% zoom; correct keyboard order and arrow keys with the new tab; the pointer opens Accounts with focus on its tab and starts no sign-in or Reload; a pending code survives switching sections; outcomes arriving while focus is in Packs are announced without moving focus; changes limited to the envelope; and all 25 screenshots match fresh renders exactly. Trade-offs: the fourth tab makes the Settings header 73px instead of 37px at 360px wide and 165px instead of 133px at 180px wide, with nothing clipped; after sign-in following an anonymous rate-limit refusal, Sources still describes that refused anonymous read and says to sign in, with Reload packs as the cue to retry. Round 2, presented at 2026-11-03T15:18:08Z, was superseded without approval and is preserved at `design/github-login-round-2-superseded.html`, SHA-256 `045b477714a331e6e25f42cdb1c5f49ff8c0ffb5c1d956503526d23faba02731`, with its 22 screenshots in `design/screenshots/round-2-superseded/`. Round 1 remains at `design/github-login-round-1-superseded.html` with its 9 screenshots in `design/screenshots/round-1-superseded/`, as preserved for round 2. `design_status` stays `proposed`, and `approved_direction` stays as round-1 history. Explicit approval of these exact round-3 bytes is pending before task derivation or UI source changes; FR-001, US1, FR-013, the plan, and the tasks change at re-definition after approval.
- 2026-11-03T23:26:16Z - approved round 3: The user's literal chat reply `approved`, with no other text, approves Option B at `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `edd1d1c718bfe2447f009be81042b990100a4176e51de26abdfb8d085c9cf1a3`, 789,289 bytes, with the 25 round-3 screenshots at the top level of `design/screenshots/`. The Canvas request `089-design-approval-round-3` timed out after 1,800 seconds with no receipt; approval comes from the chat reply, not Canvas. At 2026-11-03T23:28:50Z the coordinator re-hashed the mock and all 25 screenshots after the reply and found them unchanged. The request explicitly included, and the reply accepts, public-only scope for 089 with private-repository access only a possible later feature, a GitHub App registration instead of an OAuth App, and the new Accounts section changing 085's Settings structure to `Packs | Accounts | Appearance | About`. Round-1 choice 1 is replaced; choices 2 through 6 remain. This re-definition derives open T006@1b61929e to replace archived T003@6d92e0ab, following this approval and the user's "approve round 2" confirmation at 2026-11-03T12:04:26Z, and changes T004@f17a4d83 to depend on T006 with the GitHub App registration, compatibility checks, Accounts documentation, and live revocation-navigation check. T006 inherits no state or completion evidence. Approval is limited to this exact round-3 revision. No execution or task completion is claimed.
- 2026-11-05T01:50:38Z - reopened for registration wording: The user's chat reply "Dude is not a github app" at 2026-11-05T01:38:37Z rejects the GitHub App registration that approved round 3 named. The registration returns to an OAuth App owned by E-G-C, as option 2 first described. Round 3's three registration-type strings change to OAuth App wording: "Authorized GitHub Apps" in the signed-in text and the Signed out bar, and "Dude's GitHub App registration" in Sign-in unavailable. The Settings > Accounts layout and every other approved string stay as approved. `approved_direction` keeps round 3 as history. Explicit approval of the exact round-4 mock is required before task derivation or UI source changes.
- 2026-11-05T03:16:12Z - presented round 4: Settled Option B at the unchanged `preview_path`, `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `f6bc3d24a14d9415950c0938bd1f05bc2d6db894bdc1ada82b2d8b660e7aa9d6`, 793,842 bytes, with 25 round-4 screenshots at the top level of `design/screenshots/`. Following the user's "Dude is not a github app" at 2026-11-05T01:38:37Z, registration returns to an OAuth App owned by E-G-C, as option 2 first described; 089 stays public-only. Only three product strings change: "Dude's GitHub App registration" becomes "Dude's OAuth App registration" in Sign-in unavailable, and "under Authorized GitHub Apps." becomes "under Authorized OAuth Apps." in the Signed out bar and signed-in text. Mock-only changes are the round label (title, strip summary, and `PREVIEW_SUMMARY`), a "Round 4 changes" strip note, designer notes, and code comments. No style, token, component, link target, `data-*` hook, or behavior changes; 085's "Follow GitHub app theme" still refers to the host app. Round 3 is preserved byte-identical at `design/github-login-round-3-superseded.html`, SHA-256 `edd1d1c718bfe2447f009be81042b990100a4176e51de26abdfb8d085c9cf1a3`, with its 25 screenshots in `design/screenshots/round-3-superseded/`; rounds 1 and 2 remain preserved as before. Independent Tester results on these exact bytes in Edge 158.0.4370.1: verified hashes for round 4, preserved round 3 and its 25 screenshots, and rounds 1-2; all 16 diff hunks confined to the three strings, round label, or designer notes; all three sentences render exactly in every applicable state, with no rendered product text or accessible name containing "GitHub App" or calling Dude a GitHub app; all 25 fresh screenshots are byte-identical to the stored ones, and differences from round 3 fall only on the round-label line and, in the five affected screenshots, the changed sentence's line; lowest text contrast 5.83:1 and lowest focus-ring contrast 4.56:1 for the affected states across ordinary and app-following light and dark at rest, hover, pressed, and focus, unchanged from round 3; revocation-link clickable height at least 27.5px across five fonts, with 485 real clicks and no failure, and focus-ring geometry and keyboard order unchanged from round 3; no page-wide horizontal scroll or clipping in 1,270 loads at 180x450, 360x900, 768x900, 1440x900, and 200% zoom. The only layout change is that the Signed out bar is one line shorter at 180x450, making that section 20px shorter. The Tester made no repository write. `design_status` stays `proposed`, and `approved_direction` stays as round-3 history. Explicit approval of these exact round-4 bytes is pending before task derivation or UI source changes; FR-013, US4's acceptance item 3, the plan, and the tasks change at re-definition after approval.
- 2026-11-05T12:47:19Z - approved round 4: The user's literal chat reply `approved`, with no other text, approves Option B at `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `f6bc3d24a14d9415950c0938bd1f05bc2d6db894bdc1ada82b2d8b660e7aa9d6`, 793,842 bytes, with the 25 round-4 screenshots at the top level of `design/screenshots/`. No Canvas request was used; the approval is the chat reply. At 2026-11-05T12:48:10Z the coordinator re-hashed the mock and all 25 screenshots and found them unchanged. Only the three registration-type product strings change from approved round 3 to OAuth App wording; mock-only labels and notes also change. The round-3 UI choices and Settings > Accounts structure stand, including public-only scope and round-1 choices 2 through 6. Round 3 remains preserved at `design/github-login-round-3-superseded.html` with its screenshots in `design/screenshots/round-3-superseded/`. This re-definition keeps T001@9e4b7c26, T005@0675cd73, and T006@1b61929e closed and unchanged, derives new open T007@251708dd (deps: T006@1b61929e) for the three-string update and its build/browser/design acceptance, and changes T004@f17a4d83 one-to-one (deps: T007@251708dd) for OAuth App registration, compatibility checks, documentation, and live acceptance. T007 inherits no state or completion evidence. Approval is limited to this exact round-4 revision. No execution or task completion is claimed.

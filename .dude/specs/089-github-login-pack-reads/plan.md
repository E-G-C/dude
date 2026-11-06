# Plan: GitHub Login For Pack Reads

Spec: `.dude/specs/089-github-login-pack-reads/spec.md`
Owner: `.dude/ideas/089-github-login-pack-reads.md`

Keep the existing in-memory GitHub session controller, credential-aware pack readers, and accepted Accounts UI. Register an OAuth App under E-G-C for the same device flow, apply the three approved registration-wording changes, and leave all callers without explicit Canvas access anonymous.

The user's literal chat reply `approved` at 2026-11-05T12:47:19Z approves Option B, round 4, at `.dude/specs/089-github-login-pack-reads/design/github-login.html`, SHA-256 `f6bc3d24a14d9415950c0938bd1f05bc2d6db894bdc1ada82b2d8b660e7aa9d6`. At 2026-11-05T12:48:10Z the coordinator re-hashed the mock and its 25 top-level round-4 screenshots and found them unchanged. No Canvas request was used. Round 4 changes only three registration-type product strings plus mock-only labels and notes; the round-3 UI choices, public-only scope, and Accounts addition to 085's Settings structure stand. T001, T005, and T006 remain closed and unchanged. New open T007 applies the wording correction without inherited state or completion evidence; T004 stays blocked and now depends on T007 for OAuth App registration, compatibility, documentation, and live checks. This plan records the approved design and planning decisions, not completed or verified successor behavior.

## Technical Context

| Field | Choice |
| --- | --- |
| Language/Version | Existing JavaScript ES modules and JSX. Production remains Node >=20; browser acceptance uses Node 22+. The transport declares Node >=20 at `src/skills/dude-engine/lib/github-content.mjs:13`; browser requirements are documented at `docs/commands.md:2388-2392`. |
| Primary Dependencies | Existing React 19.2.8 and Fluent UI 9.74.7, pinned in `scripts/dude-canvas-ui/package.json:10-15`. No new package, `gh` dependency, OAuth framework, or credential-store dependency. Use native fetch and the existing IPC channel. |
| Storage | No authentication storage. Keep the token, public login, and pending device-flow state in the extension session's memory only. Existing pack/source files retain their current purpose. Leaving OAuth App expiring tokens off does not extend local retention beyond the session. |
| Testing | Existing `node:test` suites, fetch stand-ins, child-process integration tests, and Windows Edge browser suites; one live session after the OAuth App's public Client ID exists. T007 needs wording, build/pin parity, serial browser, and focused rendered-design checks; T004 retains configured/unconfigured session and server coverage before live acceptance. |
| Target Platform | The current Copilot Canvas extension on its existing platforms, with Windows Edge as the required local browser acceptance target. No GitHub Enterprise authentication. |
| Project Type | Existing extension, loopback HTTP server, React frontend, and short-lived Node pack readers. |
| Performance Goals | Preserve signed-out request counts and existing acquisition bounds. Add one account lookup per successful sign-in, no per-read account/quota probe, and no catalog caching. Meet SC-001's 20 Reloads plus three installs within one hour under its stated conditions. |
| Constraints | Public read-only access, no scopes requested or repository installation, no disk persistence, no client secret, API-only credential transmission, anonymous raw downloads, explicit consent, and exact mock approval before UI source or task derivation. No expiring-token opt-in, `offline_access` request, or refresh handling. |

## Chosen Structure

### 1. One session controller and a safe Canvas projection

Keep `src/extensions/dude/lib/github-session.mjs` as the owner of the current session's optional public GitHub access. `src/extensions/dude/extension.mjs:45` already creates one controller before joining the session and shares it with every Canvas instance. Accounts is the frontend presentation owner; moving the controls does not create another controller or change its lifecycle.

Keep only one pending attempt or one signed-in access record. A repeated Start while an attempt is pending returns that attempt's public state. Cancelling or expiring it aborts its request/timer and prevents a late result from activating access. Closing one panel removes its subscription, not another panel's session access. A new extension session creates a new, signed-out controller. Controller construction starts no network request.

Keep the exact local routes and their contracts unchanged:

- `GET /api/github-session`: safe status only.
- `POST /api/github-session`: exactly one of `{"op":"start"}`, `{"op":"cancel"}`, or `{"op":"sign-out"}`.

The existing handler at `src/extensions/dude/lib/canvas-server.mjs:960-998` retains the Host/Origin checks, bounded JSON reading, no-store responses, and explicit same-origin Origin for POST. Accept no caller-supplied token, scope, Client ID, host, or endpoint.

Public responses contain only the state, public login when signed in, short user code and expiry while pending, fixed verification URL, and closed error code. Neither `access_token` nor `device_code` reaches the page. A short user code is intentionally visible; it is not the bearer credential.

Keep the payload-free `github-session` invalidation at `src/extensions/dude/lib/canvas-server.mjs:1616` and the existing session hook/projection at `src/extensions/dude/frontend/use-canvas-data.js:400-449`. The hook rereads safe status independently of pack Reload and exposes the same closed actions to Accounts. Add no persisted browser store, new route, transport, or session event shape.

This covers FR-002, FR-008 through FR-014, and FR-022.

### 2. OAuth App device flow

Register one OAuth App owned by E-G-C, named Dude, with Device Flow enabled. Request no scopes, generate no client secret, and opt into no expiring tokens. Its public Client ID uses the existing `GITHUB_CLIENT_ID` source constant in `github-session.mjs`. Nothing is installed on an account or repository; Dude adds no callback listener.

The OAuth App and public Client ID do not exist yet. Keep the ID unset until supplied. With no ID configured, an explicit Start returns the mock's "Sign-in unavailable" state without a GitHub request; anonymous and local reads remain usable. Implementation and fake-GitHub tests must work in that state. Add no configuration surface or ambient-token fallback.

Follow the device-code pattern familiar from `gh auth login` and VS Code's GitHub sign-in, without depending on either product's credential store. The existing controller already uses the OAuth App device-flow endpoints and response shape.

1. After an explicit Start, send `POST https://github.com/login/device/code` with form fields `client_id` and explicit `scope: ''` (`scope=` on the wire). Use `Accept: application/json`. Request no `offline_access`.
2. Read the returned `device_code`, `user_code`, `expires_in`, and `interval`. Keep `device_code` server-side. Show the user code and the fixed verification page `https://github.com/login/device`.
3. Poll `POST https://github.com/login/oauth/access_token` with `client_id`, `device_code`, and `grant_type=urn:ietf:params:oauth:grant-type:device_code`. Use form encoding and `Accept: application/json`; wait at least the returned interval between polls.
4. On `authorization_pending`, continue at that interval. On `slow_down`, add five seconds to the interval for subsequent polls. On `expired_token` or the returned expiry deadline, end the attempt. On `access_denied`, end it as declined. On `device_flow_disabled`, show that sign-in is unavailable and identify the registration prerequisite without disabling Canvas.
5. Accept only a usable bearer token with returned `scope === ''`. For an OAuth token, empty returned scope means no scopes were granted: access is read-only public information. A nonempty scope remains a sign-in failure. Retain no refresh token and use no response extras to extend access.
6. Make one authenticated `GET https://api.github.com/user`, retain only its public `login`, and then announce signed in. If account confirmation fails, discard the token and report the failure; do not invent an account or add an unknown-account mode.

Verify Device Flow and the absence of an expiring-token opt-in during T004. Confirm the empty returned scope and a safe scope header such as an empty `X-OAuth-Scopes`, and retain private-repository refusal checks. Public reads include another owner's public repository without any repository installation or owner grant.

OAuth App tokens normally receive 5,000 requests per hour per user, shared with the user's other GitHub tools. The coordinator's earlier 15,000 observation for the app's separate token is not the allowance promised by 089.

OAuth Apps can optionally issue expiring tokens; requesting `offline_access` opts a sign-in into them. Dude leaves that option off and requests no scopes, so its tokens do not expire on a timer and it keeps no refresh token. Local retention remains session-only. A discarded token can remain valid at GitHub until revoked; do not describe local sign-out as revocation.

Use bounded fetches with omitted browser credentials and refused redirects. For the two small device-flow responses, keep the 15-second request timeout and 64 KiB response bound. The polling lifetime ends at GitHub's returned expiry, normally about 15 minutes. A network failure ends the attempt with a safe message; retry requires selecting Sign in again, not an automatic replacement flow. Cancel also works while the initial device-code request is pending.

Show the account login. One extra request is worthwhile because this authorization can belong to a different account from the main app's login. VS Code's Accounts menu and `gh auth status` follow the same convention. Do not fetch an avatar, profile, account list, or quota display.

T005 needs no protocol or state-machine change. The controller already requests `scope=` explicitly and requires a bearer `token_type` and returned `scope === ''`; its tests already use `access_token`, `token_type: 'bearer'`, and `scope: ''`, and its comments already name the OAuth App. T004 configures the public ID and updates the existing null-ID expectation while retaining configured/unconfigured coverage. Add no fixture or comment-correction work unless a real compatibility gap is found.

Research basis supplied by the coordinator, including docs.github.com findings fetched 2026-11-05; no live service check is claimed here:

- [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app): organization ownership, application name, Homepage URL, Authorization callback URL, and Device Flow registration.
- [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps): device-flow endpoints, response fields, and optional expiring tokens; "The client_secret is not needed for the device flow."
- [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps): no scope grants read-only access to public information; `repo` also grants write access.
- [Repository contents](https://docs.github.com/en/rest/repos/contents), [commits](https://docs.github.com/en/rest/commits/commits), and [trees](https://docs.github.com/en/rest/git/trees): public-resource access without repository permissions.
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): user allowances.

This covers FR-001 through FR-004, FR-006, FR-010, FR-011, and FR-015.

### 3. Carry access through both pack-reader paths

The current call chain determines the required changes:

| Boundary | Verified current behavior and planned extension |
| --- | --- |
| Canvas callers | `src/extensions/dude/lib/canvas-server.mjs:612` calls `readPacks`; lines 664-665 and 702-714 run pack previews/applies; line 1020 calls `addPackSource`. Supply the current session access through all of these paths, not only Reload. |
| Pack orchestration | `src/extensions/dude/lib/packs.mjs:1264-1348` discovers the default, upstream, and saved catalogs. `:1517-1565` validates and reads an added source before saving it. `:1737-1776` selects and runs preview/apply sources. Thread an internal access option through these reachable readers without changing source identity or write authority. |
| Catalog child | `src/extensions/dude/lib/packs.mjs:640-677` launches `catalog-reader.mjs` with `process.execPath`, inherited environment, a JSON request in `CATALOG_REQUEST_ENV`, and IPC. `src/extensions/dude/lib/catalog-reader.mjs:229-245` and `:338-356` call Compose's catalog resolver. |
| Action child | `src/extensions/dude/lib/packs.mjs:1826-1839` separately launches `pack-action.mjs` with an environment-carried request and IPC. `src/extensions/dude/lib/pack-action.mjs:95-113` builds the Compose arguments for install/refresh preview and apply. |
| Compose | `src/skills/dude-compose/compose.mjs:417-465` and `:483-514` resolve pack/catalog sources. `:608-632`, `:736-798`, `:844-867`, `:958-989`, and `:1189-1259` carry selected-pack preparation through preview/apply. Add an explicit internal access option through that chain; do not add a CLI flag or ambient credential lookup. |
| Acquisition | `src/skills/dude-compose/lib/pack-acquisition.mjs:541-585` reads the catalog, and `:635-663` reads a selected pack. Carry optional access into the metadata requests at `:373-440`, leaving acquisition budgets, integrity checks, and ref rechecks intact. |
| HTTP boundary | `src/skills/dude-engine/lib/github-content.mjs:3-13` promises anonymous requests and no ambient token lookup; `:194-261` implements the bounded GET, omitted credentials, and refused redirects. Update the contract to allow explicitly supplied Canvas access only for `https://api.github.com/` requests. |

Use IPC for the credential, not an environment variable or an environment-carried request field. Both launch sites already have a private IPC channel. Git inherits its reader's environment: `src/skills/dude-compose/lib/pack-acquisition.mjs:739-746` spawns it without an environment override, and `src/extensions/dude/lib/packs.mjs:314-337` explains that inheritance. Putting the token in either existing JSON request would expose it to those descendants.

Keep the existing nonsecret request in its current carrier. Add one parent-to-child start message containing optional GitHub access; the child waits for it before acquisition. Missing or disconnected delivery fails within the existing process deadline. Send access only to a reader classified for GitHub acquisition; local, validation-only, removal, and non-GitHub readers receive none. Keep existing result and write-gate messages distinct from this start message.

Inside a reader, carry access as an operation-local memory reference through the explicit Compose/acquisition options. Never include it in returned objects, source identities, preview bindings, manifests, the prospective sources document, command arguments, or process environment. The helper adds the session credential as a bearer authorization header only for the exact `https://api.github.com` origin. Do not accept an arbitrary Authorization header from Canvas. Keep `redirect: 'error'` and `credentials: 'omit'`.

`fetchVerifiedBlob` at `src/skills/dude-compose/lib/pack-acquisition.mjs:515-528` reads `raw.githubusercontent.com` without headers. Leave that path anonymous even when metadata reads are authenticated.

Callers without the explicit option remain anonymous. This includes chat-invoked Compose and the directory importer, which currently calls the shared helper without authentication at `src/skills/dude-bundle-import/lib/directory-source.mjs:757-760`, `:779`, and `:867`. Bundle updates acquire no session token either.

This covers FR-005 through FR-008, FR-016, FR-017, and FR-023.

### 4. Forget access and preserve honest failures

Sign out first clears the controller's credential and account, then cancels authenticated acquisitions that are still reading. No new reader may obtain the old access. A request already transmitted to GitHub cannot be recalled.

Use the existing cancellation/process ownership rather than adding a second cleanup system. Catalog cancellation stops and confirms the owned process tree at `src/extensions/dude/lib/packs.mjs:704-764`. Pack actions have a different boundary: once permitted to write, they finish rather than being killed, as documented and implemented at `:1724-1728` and `:1855-1883`.

When a GitHub reader's access ends while it is still reading, send the token-free `{ type: 'release' }` message over its existing private IPC channel before the existing stop. The child releases its copy so no request it starts afterwards carries that access; release before `{ type: 'start', token }` reads nothing, never anonymously, and reports `credential_rejected`. Treat a verified clean exit (`finishedClean()`) as a confirmed stop, preserving slot and temporary-root accounting.

Release the action child's access reference when source acquisition finishes, before asking its write gate. Compose stages remote content before the gate at `src/skills/dude-compose/compose.mjs:858-867`; the remote acquired copy is already released by `:619-632`. Therefore a permitted disk transaction can finish without retaining or using GitHub access. Do not turn sign-out into rollback, removal, or replay.

Preserve two safe failure distinctions across acquisition, Compose, child IPC, and Canvas:

- Credential rejected: an authenticated API request receives an authentication rejection, such as HTTP 401. Forget the matching current access, invalidate the signed-in projection, and let later explicit reads run anonymously.
- Rate limited: retain valid access and show the applicable guidance. Do not switch allowances or replay the operation.

Associate rejection with the access used by that child so an old result cannot clear a later sign-in. Use the existing in-memory operation ownership; add no durable identifier or reconciliation record.

The transport already recognizes HTTP 429 and rate-limit HTTP 403 responses at `src/skills/dude-engine/lib/github-content.mjs:232-246`. Generic HTTP 403 or 404 does not by itself prove a revoked credential. Preserve public-only refusal wording for private/missing repositories.

`anonymousHint` at `src/skills/dude-compose/lib/pack-acquisition.mjs:812-820` currently adds the anonymous/public-only note for non-rate-limit 401/403/404 failures; it is not itself the rate-limit detector. Make that wording accurate for both modes. Keep closed failure information through callers that currently flatten errors to strings, including `src/skills/dude-compose/compose.mjs:464-465` and `:511-512`. Add source also maps a failed read to a generic refusal at `src/extensions/dude/lib/packs.mjs:1567-1572`; preserve the rate-limit distinction there.

Use fixed safe messages for authenticated transport and device-flow failures. Never serialize raw responses, request options, headers, token-bearing error causes, or provider error descriptions into Canvas or logs.

Use the approved round-3 rate-limit sentence sets, unchanged in round 4, as text only, on Sources, Installed/Available coverage, Add source, and install/refresh preview/apply failures:

- Signed out: "GitHub's anonymous limit for your network address, 60 requests an hour, is used up, so it refused these reads. Nothing was retried. To continue, sign in under Settings > Accounts, or try again later. To read packs without GitHub's limit, add a local folder whose root contains library/packs under Settings > Packs > Sources > Add source."
- Signed in: "The GitHub allowance for @<login> is used up, so GitHub refused these reads. Your other GitHub tools share this allowance. Nothing was retried. To continue, try again later. To read packs without GitHub's limit, add a local folder whose root contains library/packs under Settings > Packs > Sources > Add source."

Use the actual login recorded for the failed read, not the mock's sample account or a later session state. The object varies with the action: "these reads", "the read", or "this preview's read"; Add source ends with "Nothing was saved." The sign-in destination and local-folder route are separate, fully named destinations; never shorten the latter to "Add source there". A sign-in change leaves the refused allowance, marks, and wording in place until the next explicit read.

Sign out forgets this session's access; it does not revoke GitHub authorization. To revoke Dude, open [GitHub's Applications settings](https://github.com/settings/applications) and select Authorized OAuth Apps. The signed-in body and Signed out outcome use the round-4 mock's wording: "GitHub keeps the authorization until you revoke it in GitHub's Applications settings at https://github.com/settings/applications, under Authorized OAuth Apps." Do not claim that URL lands directly on the tab. T004 verifies the signed-in landing and reachable tab and reports a mismatch rather than guessing another URL. Local sign-out sends no revocation request; Dude uses no client secret to manage the authorization.

This covers FR-010 through FR-014 and FR-016 through FR-023.

### 5. Canvas presentation and the design gate

Keep all sign-in presentation in `src/extensions/dude/frontend/accounts.jsx`, reached from `Packs | Accounts | Appearance | About` in `settings.jsx`. Use the existing Fluent TabList behavior and `bundleIcon(Person20Filled, Person20Regular)` for Accounts. This is the explicitly approved change to 085's Settings structure, following VS Code's Accounts and GitHub Desktop's Accounts settings.

Accounts consumes only the existing safe session state and Start/Cancel/Sign out actions. Keep the explanation and every sign-in state/outcome in Accounts, without `refusedBefore`/`marked` coupling. Accounts text must not inspect source rows, rate-limit marks, or pack refusals. Reuse About's scroll area/padding and the mock's sign-in measure. While Accounts is active, hide the pack Reload toolbar and show footer "Accounts · This session".

Sources keeps "GitHub sign-in is managed in Settings > Accounts." Render "Settings > Accounts" as a link-styled span with button semantics, a tab stop, and Enter/Space activation. It switches sections and focuses the Accounts tab, starting no sign-in or Reload. While source rows show credential rejection, show the Sources warning "GitHub rejected the sign-in" with "GitHub rejected the sign-in Dude was using, so Dude signed out. Choose Reload packs to read these sources anonymously." Keep refusal marks and manual Reload instructions on pack surfaces, not Accounts.

Keep session announcements at the shell level in `app.jsx`, so outcomes remain audible while Accounts is hidden. Preserve the existing hook, projection, routes, and event contract from section 1. Keep Packs mounted, including source/work selections, filters, full-list discovery, and unsent input. Navigation and sign-in changes reload no packs, replay no failures, clear no refusals, save no sources, and change no pack write authority.

Preserve T006's accepted fix for the archived T003 review finding `focus-steal-on-null-related-target`: clear the inside flag on deliberate outside blur even when `relatedTarget === null`; keep the fallback only for a focused node actually removed during rendering. Retain coverage for both cases and completion while Accounts is hidden. Announcements never authorize moving focus from elsewhere.

External links already use Fluent `Link` with `target="_blank"`, `rel="noopener noreferrer"`, and an accessible new-tab label:

- `src/extensions/dude/frontend/about.jsx:73-79`
- `src/extensions/dude/frontend/markdown.jsx:72-80`

For the GitHub verification/revocation links and Sources pointer, retain `position: relative` on the outer link, pad an inner unpositioned span above and below with `tokens.spacingVerticalSNudge`, and use `colorBrandForegroundLinkHover` while pressed. Keep the focus ring on the text geometry; the inner span must not create another paint layer. Let addresses wrap at a container width of 300px or narrower. Measure the clickable hit area or inner span, not the anchor's bounding box. This applies the approved fixes for `vsc-002.pressed-link-contrast` and `vsc-001.undersized-github-link-targets` without shrinking the targets or enlarging the text's focus ring.

A search of `src/extensions/dude/frontend/` found no clipboard implementation, `navigator.clipboard`, `writeText`, `execCommand`, `window.open`, or host external-opening bridge. Reuse an ordinary external link and show the verification URL and short code as selectable text. Show the expiry as a time of day, not a countdown. Do not draw a Copy button, automatic browser launch, or a claim that the host opens the system browser. The URL remains usable manually if the embedded host restricts navigation.

Add source's address check originally said "Remove the user name or password from the URL. Canvas never sends credentials." in `src/extensions/dude/frontend/pack-sources.jsx:147`; the server validator repeated it at `src/skills/dude-engine/lib/pack-sources.mjs:141`. Retain T006's accepted correction: "Remove the user name or password from the URL. Dude never sends a user name or password taken from a source address." Keep the existing rejection and validation behavior. FR-025 covers this in-product correction.

Retain the narrowed blanket claims in `src/extensions/dude/frontend/pack-sources.jsx` and the duplicate address message/hint in `src/extensions/dude/frontend/artifact-import.jsx`. They describe the actual public-only/password boundary; artifact imports remain anonymous and receive no session access. This changes wording, not importer behavior.

Apply the exact approved round-4 canonical mock:

`.dude/specs/089-github-login-pack-reads/design/github-login.html`

SHA-256: `f6bc3d24a14d9415950c0938bd1f05bc2d6db894bdc1ada82b2d8b660e7aa9d6`.

T007 starts from the accepted T006 implementation and changes only the three registration-type strings in Accounts. No other product text, style, behavior, route, or structure changes. Keep the approved Accounts adaptation of 085, 084's Sources treatment, and the 052 workspace baseline. Preserve the canonical mock and its 25 top-level round-4 screenshots, round 3 at `design/github-login-round-3-superseded.html` with `design/screenshots/round-3-superseded/`, and the earlier explored variants and screenshots.

The owner's 2026-10-30T21:31:41Z route records the original Architect capability envelope: explicit Start/Cancel/Sign out; safe session-state reads; fixed external links; selectable text; existing pack/source actions. The round-3 envelope moved their presentation into Accounts without changing the backend contracts; round 4 leaves that envelope unchanged.

Keep the mock's exact wording for signed out, requesting, waiting with code/link/expiry, signed in with the real account and Sign out, cancelled, declined, expired, couldn't reach GitHub, Sign-in unavailable, Sign-in didn't finish, Signed out with the revocation link, and Signed out: GitHub rejected the access. "Sign-in unavailable" says "Dude's OAuth App registration isn't set up for device sign-in, so sign-in can't start. Dude's maintainers need to set it up. Pack reads stay anonymous, and local folders work as before." The other two changed strings are the revocation sentence in the signed-in text and Signed out bar, as quoted in section 4. Sign in remains the one start action after a failure. Real data supplies login, code, expiry, and source outcomes; fixture controls and sample values never enter product chrome.

Round 4 retains the round-3 UI choices: round-1 choice 1 is replaced and choices 2 through 6 stand. Preserve the approved mock bytes, including historical exploring labels; do not edit the artifact to record approval. Any successor design revision needs explicit re-approval. Apply the design close protocol with fresh product evidence and exactly one of its four classifications; the mock's measurements and T006's completion do not complete T007.

This covers FR-001, FR-003, FR-013, FR-015, FR-018 through FR-026, and VSC-001 through VSC-004. T007 specifically traces to US4 acceptance item 3, FR-013, Proposed Direction's Sign-in unavailable wording, VSC-001 through VSC-004, and SC-008.

## Alternatives Considered

- App `GH_TOKEN` through `joinSession({ requestedEnvironmentVariables: ['GH_TOKEN'] })`: considered and declined by the user's option-2 answer. The coordinator observed scopes `gist, project, read:org, repo, user, workflow, write:plugin_gateway_connections` and a 15,000 core limit on 2026-10-29 through a free `rate_limit` call. The reported host prompt cannot carry Dude's explanation, and declining rejects the join. These are coordinator-supplied host observations, not probes performed for this definition. The current join at `src/extensions/dude/extension.mjs:74-104` requests no sensitive environment variables; retain that behavior.
- GitHub App: considered and selected for round 3, then declined by the user's "Dude is not a github app" at 2026-11-05T01:38:37Z. Return to the OAuth App described in the accepted option 2. An OAuth App is sufficient for 089's public read-only access without scopes. Private-repository access would require the write-capable `repo` scope; that trade-off belongs to a possible later feature, not a reason to add another registration model or private access now.
- Credential persistence, a generic authentication provider, a quota dashboard, or automatic cloning: no current requirement. Do not add them.

## External Prerequisite

T004 uses these registration and handoff steps through the coordinator:

1. Open E-G-C > Settings > Developer settings > OAuth Apps > New OAuth App ("Register a new application" if none exists).
2. Set Application name to "Dude" and both Homepage URL and Authorization callback URL to `https://github.com/E-G-C/dude`. Device flow ignores the callback; Dude adds no callback listener.
3. Check Enable Device Flow, then Register application.
4. Generate no client secret and opt into no expiring tokens.
5. Supply only the public Client ID, never a client secret or an access token.
6. Set `GITHUB_CLIENT_ID` in `src/extensions/dude/lib/github-session.mjs` and regenerate only `.github/extensions/dude/lib/github-session.mjs`. Update the test in `src/extensions/dude/lib/github-session.test.mjs` that asserts the constant is `null`, beneath "The OAuth App is not registered yet; setting its public Client ID changes this case.", to the configured case while retaining explicit null/empty-ID coverage. Update the existing `copiedExtensionHarness` lifecycle fixture and assertions in `src/extensions/dude/canvas-server.test.mjs` for the configured default ID: record startup requests separately from the explicit Sign in, prove opening/reopening Canvas and reading session status make zero outbound requests, and check the configured Start against the harness's recorded/refused device-code request rather than the old no-ID expectation. Retain an explicit test-only null/empty-ID case that returns "Sign-in unavailable" (`outcome: 'unavailable'`) with zero outbound requests. Keep the harness offline, preserve unrelated lifecycle/logging assertions, and change no production protocol. Run the configured/unconfigured checks, the session and server suites (server suite alone, one process per file), and generated parity before the live check.

Registration and the Client ID are prerequisites for live authorization/verification, not unresolved product-intent questions or prerequisites for the unavailable state and fake-GitHub coverage. Missing registration leaves anonymous and local operation usable.

## Documentation And Build

Update the anonymous-only claims from "Canvas never asks for credentials." through "the local library is unaffected." in `docs/commands.md:1568-1578`. Document the optional explained device-code flow in Settings > Accounts, the Sources pointer, public-only access, current-session lifetime, account display, sign-out versus revocation through GitHub's Applications settings > Authorized OAuth Apps, shared limits, and the unchanged local-folder route, "A folder on this computer whose root contains `library/packs`", at `docs/commands.md:1542-1544`. State that chat Compose stays anonymous. Explain the missing-Client-ID fallback and OAuth App registration with Device Flow on, no scopes requested, no client secret, no expiring tokens, and no `offline_access`. Distinguish session-only local retention from a discarded token's possible continued validity at GitHub.

Edit authoritative source, not installed projections. `scripts/build-dev.mjs:3-15` records that ownership. Rebuild the UI using `scripts/dude-canvas-ui/build.mjs`; its input and generated JS/legal output paths are defined at lines 9-14. Project affected runtime files through the existing build functions, `scripts/build-release.mjs:373-414`, and update affected parity/pin expectations from actual rebuilt bytes. Do not overwrite or absorb the separate uncommitted call-count fix.

T007's writer paths are:

- `src/extensions/dude/frontend/accounts.jsx` for the three product strings, and `scripts/dude-canvas-ui/browser.test.mjs` for `T089_REVOKE`, the `unavailable` expectation, the approved-mock binding/check messages, and the shipped-bundle exclusion list.
- The app.js pin consumers `scripts/build-dev.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, `scripts/dude-canvas-ui/t011-browser.test.mjs`, and `scripts/dude-canvas-ui/t012-installed-host.mjs`.
- `src/extensions/dude/ui/assets/app.js` and `src/extensions/dude/ui/assets/app.js.LEGAL.txt`, rebuilt via `scripts/dude-canvas-ui/build.mjs`.
- Generated `.github/extensions/dude/ui/assets/app.js` and `.github/extensions/dude/ui/assets/app.js.LEGAL.txt`.

In `scripts/dude-canvas-ui/browser.test.mjs`, advance `T089_APPROVED_SHA256` to the exact approved round-4 value bound in Chosen Structure 5. Update that binding's three `approvedLfDesignSha256(...)` assertion messages to round 4, including the shared 085 header comparison. In the shipped-bundle exclusion list, replace the now-required "Authorized OAuth Apps" with the superseded "Authorized GitHub Apps" and "Dude's GitHub App registration"; keep "octocat", "WDJB-MJHT", "are samples. Nothing is read", and "Round 3 changes", and add "Round 4 changes". Update the exclusion assertion message to describe mock-only samples/notes and superseded round-3 wording. Preserve all unrelated assertions, the canonical mock, and every screenshot.

Update affected hashes, sizes, and legal inventory from the rebuilt outputs wherever those consumers check them. There is no frontend source mirror. No documentation, session protocol, or other UI change belongs to T007.

T004 owns `docs/commands.md`, `GITHUB_CLIENT_ID` in `src/extensions/dude/lib/github-session.mjs`, the configured-ID expectation and retained unconfigured checks in `src/extensions/dude/lib/github-session.test.mjs`, the existing `copiedExtensionHarness` lifecycle fixture and assertions in `src/extensions/dude/canvas-server.test.mjs`, and the generated `.github/extensions/dude/lib/github-session.mjs` counterpart. The server lifecycle check must separate zero-request startup from configured Start and retain an explicit null/empty-ID unavailable case with zero outbound requests, as specified in External Prerequisite step 6. The controller's OAuth App comments and success-response fixtures already fit; no production protocol change, comment correction, or new response fixture is needed.

Keep the closed T001/T005/T006 implementation and tests intact except for T007's specified strings, expectations, and build pins and T004's ID/configuration and server lifecycle fixture/assertion changes. Preserve the installed-host inventory entry for `lib/github-session.mjs` and the exact session-path allowed set in `scripts/current-format-contract.test.mjs`, including every GitHub-issue reject assertion and that file's other uncommitted edits. No authentication data-model file, registry, separate contract package, or additional definition checklist is needed.

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| Keep it simple | One OAuth App, one public ID, one existing in-memory session controller, existing IPC, and no persistence, new dependency, cache, provider framework, quota service, or refresh feature. No expiring-token opt-in or scopes; local retention stays session-only, and the remote-validity trade-off is explicit. |
| UI mockup approval | The exact round-4 mock is approved by the user's chat reply. This stage derives T007 after that approval and leaves closed T006 unchanged; successor revisions need explicit re-approval. |
| Canvas continuity | Extend 052 and approved 084/085 Settings surfaces with the explicitly approved Accounts section while retaining current discovery, capture, response, and Review behavior. |
| Draw on established knowledge | Follow GitHub device-code sign-in, VS Code's Accounts, and GitHub Desktop's Accounts settings; deliberately omit clipboard and automatic-opening affordances not established here. Keep the accepted session-only retention without adding refresh handling. |
| Intent versus implementation | The spec states outcomes and constraints; registration, protocol, token transport, routes, and source changes live in this plan. |
| Harness-first verification | Complete realistic browser interactions and leak checks before requesting any remaining host-only observation. |

No new guardrail candidate requires a checkpoint.

## Verification

Use fake device-flow and API responses through `globalThis.fetch`, following `src/skills/dude-engine/lib/github-content.test.mjs:65-77` and `src/skills/dude-compose/lib/pack-acquisition.test.mjs:330-337`. Existing child/browser stand-ins also replace fetch at `src/extensions/dude/canvas-server.test.mjs:6249-6270` and `scripts/dude-canvas-ui/browser.test.mjs:507-526`. Keep those test-only stand-ins for the two fixed device endpoints and `/user`; do not add production endpoint overrides.

T001/T005/T006's accepted coverage remains the baseline, not a new task. T007's change is limited to three strings: run generated parity and pin checks, both browser suites serially, and the focused rendered/design checks below. T004 runs configured/unconfigured session checks, the session suite, the server suite alone, and generated parity before the live workload.

| Trace | Required checks |
| --- | --- |
| US1, US3; FR-001 through FR-004, FR-006, FR-009 through FR-011; SC-003, SC-004 | Empty requested/returned scopes and bearer type; no secret or `offline_access`; pending and slow-down timing; expiry from returned duration; denial; disabled device flow; no Client ID with "Sign-in unavailable" and zero sign-in requests; offline start/poll/account lookup; cancellation and late completion; no startup request; one attempt across section changes, reload, and two panels. T004 retains the existing OAuth App response shape and configured/unconfigured checks; no new fixture is required without a real gap. |
| US2; FR-005 through FR-007, FR-017, FR-023; SC-001, SC-006 | Test Reload, Add source, install preview, install apply, refresh preview, and refresh apply through real child paths. Credential only on API requests; raw and signed-out requests remain anonymous. Private repository refusal, local folders, and an Enterprise upstream retain their boundaries. Preserve the six-request Reload baseline. Live checks include another owner's public repository. |
| US4; FR-008, FR-012 through FR-016; SC-002, SC-005 | One account lookup per successful sign-in, public login only, new-session signed out, sign-out during an API read and after the write gate, rejection clearing current access, no late reactivation, and no revocation request. Verify the Applications settings link's signed-in landing and reachable Authorized OAuth Apps tab during T004. |
| US5; FR-018 through FR-021; SC-007 | Rate-limit 403/429 across every read path, exact text-only anonymous/authenticated guidance based on the failed read's recorded allowance, Settings > Accounts for sign-in, the separate complete local-folder route, and no automatic retry or fallback to another allowance. Ordinary 403/404 must not be mislabeled as revocation. |
| FR-022, FR-024; all visual criteria | Settings order `Packs, Accounts, Appearance, About`, tab/arrow-key behavior, Sources pointer via click/Enter/Space and return navigation, session-only Accounts content, footer and toolbar, shared pending attempt, and completion while Accounts is hidden. Preserve mounted Packs state, source/work selections, filters, and unsent input. Cover deliberate outside blur with null `relatedTarget` and focused-node removal separately. Check all consent/error states, keyboard/focus, shell announcements, full-list discovery, screenshots, geometry, accessibility tree, contrast, specified widths, 200% zoom, and ordinary/app-following appearances. Measure link/pointer hit areas or inner spans, not anchor bounding boxes. |
| FR-025, FR-026; SC-008 | Updated documentation and in-product wording; matching client/server address refusals that still reject source-address credentials; recorded exact mock approval before task derivation/UI source; implementation comparison against that approved round-4 revision and retained screenshots. |
| T007; US4 acceptance item 3, FR-013, Proposed Direction's Sign-in unavailable wording; VSC-001 through VSC-004; SC-008 | The three changed sentences render exactly as the round-4 mock; no rendered product text or accessible name says "GitHub App". Compare Sign-in unavailable and signed in at 1440x900 light, plus the Signed out bar at 1440x900 light, 1440x900 dark, and 180x450 light, against the five affected round-4 screenshots. Preserve T006's other text, style, behavior, routes, structure, and accessibility; use the design close protocol with exactly one classification. |

Generate a sentinel credential in test memory. Check zero occurrences in Canvas JSON/HTML/SSE, browser state, logs, errors, evidence, process arguments/environments, and all owned project/user/temp disk writes. Inspect transient writes before cleanup as well as final files. Check both reader launches and Git descendants. Assertions and evidence report destinations, booleans, and counts, never the credential or raw request/response dumps.

The planted `GH_TOKEN` case at `src/extensions/dude/canvas-server.test.mjs:11238-11296` covers the bundle-update child and its closed environment, not the catalog/action reader launches. Keep that test intact and retain dedicated tests for this feature. Confirm ambient `GH_TOKEN` is never adopted as API access; do not mistake the existing test for coverage of the new token path.

Retain focused controller tests in `src/extensions/dude/lib/github-session.test.mjs` and the transport, acquisition, Compose, server, and browser suites. Keep unaffected importer behavior covered because the shared HTTP helper changed. Preserve T006's Settings regressions and 089 cases, including zero startup or sign-in-triggered pack reads and no pack Reload or sign-in from Accounts navigation.

Required browser acceptance uses the existing Windows Edge executable via `DUDE_CANVAS_BROWSER`, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and Node 22+. Follow `docs/commands.md:2378-2478`, including Git for Windows first on PATH and disclosed platform-specific coverage limits. Run both browser suites explicitly and serially. Apply the memory lesson of one test process per file on Windows, with `canvas-server.test.mjs` alone, and compare with a pre-change baseline scheduled the same way. Report executed, failed, and skipped counts.

Check 180x450, 360x900, 768x900, 1440x900, and 200% zoom in ordinary and app-following light/dark appearances, including rest, hover, pressed, and focus states. Use Segoe UI, Segoe UI Variable, Arial, Times New Roman, and system-ui for the link/pointer target check. The round-4 mock's reported minima, 5.83:1 text, 4.56:1 focus ring, and 27.5px revocation-link clickable height, are comparison evidence; fresh product checks must establish VSC-001/VSC-002 and a match to the approved technique.

Record the known Windows differential for `scripts/dude-canvas-ui/build.test.mjs` test 32, "browser launch failures retain isolated evidence...": launching a POSIX browser script fails with ENOENT on both the pre-change and changed bytes. Preserve the test and report the matched differential; do not turn it into a pass or weaken its checks.

For T007, compare the affected product views with `design/screenshots/accounts-unavailable-1440x900-light.png`, `accounts-signed-in-1440x900-light.png`, `accounts-after-sign-out-1440x900-light.png`, `accounts-after-sign-out-1440x900-dark.png`, and `accounts-after-sign-out-180x450-light.png`. Follow the design close protocol: rebuild/render, capture or inspect relevant sizes, establish keyboard/focus and rendered WCAG AA contrast, trace displayed values to real data and actions to working capabilities, and compare against the exact approved mock. Return exactly one classification: "Matches approved spec", "Implementation mismatch", "Design refinement needed", or "New scope / new idea". Only the coordinator may close, reopen, block, or route after independent verification and review; missing or failed evidence does not complete T007.

Relevant future commands include:

```text
node --test src/extensions/dude/lib/github-session.test.mjs
node --test src/skills/dude-engine/lib/github-content.test.mjs
node --test src/skills/dude-compose/lib/pack-acquisition.test.mjs
node --test src/skills/dude-compose/compose.test.mjs
node --test src/extensions/dude/canvas-server.test.mjs
node --test src/skills/dude-bundle-import/lib/directory-source.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs
node --test scripts/dude-canvas-ui/build.test.mjs
node --test scripts/build-dev.test.mjs
node --test scripts/current-format-contract.test.mjs
```

After the OAuth App's public Client ID exists and automated journeys pass, perform one live session in an owned disposable workspace using the actual running extension. Restart the extension after changed runtime code is installed; an already-running instance can serve old code. The user completes authorization on GitHub. Verify Device Flow is on and expiring tokens are not enabled, the real account, empty returned scope (for an OAuth token, no scopes granted), confirmation through a safe header such as an empty `X-OAuth-Scopes`, and effective allowance from safe response headers. Exercise public sources including another owner's public repository, Add source, and install/refresh previews and applies; retain private-repository refusal checks. Under SC-001's fresh-allowance/no-competing-use conditions, complete 20 Reloads of the 20-pack E-G-C/dude catalog plus three installs within one hour without a rate-limit refusal, retaining the six-request Reload baseline.

Verify sign-out, later anonymous reads, unchanged local sources, no revocation request, the actual embedded-host verification link, and the signed-in landing of `https://github.com/settings/applications` with Authorized OAuth Apps reachable from it. Do not claim a direct tab landing; report a navigation mismatch rather than guessing another mapping. Limit human observation to behavior the completed browser harness cannot establish. Retain only sanitized results, never a token, raw provider dump, or credential-bearing evidence. A live external service refusal is evidence to report, not a reason to bypass a limit or repeat until green.

## Phases And Handoff

The coordinator composes both halves of this re-definition and obtains independent review before applying the staged bytes through the existing workflow, preserving the exact owner and history and retaining rollback-bound lint. No definition-readiness claim precedes the coordinator's zero-failure result.

| Task | Plan sections | Independently verifiable outcome |
| --- | --- | --- |
| T001@9e4b7c26 | Chosen Structure 3 and the reader/transport parts of 4; Documentation And Build; Verification | Explicit credential-aware GitHub API reads through both reader IPC paths, unchanged anonymous callers, and leak/refusal tests. |
| T005@0675cd73 | Chosen Structure 1, 2, the Canvas callers in 3, and the session parts of 4; External Prerequisite; Documentation And Build (including the current-format contract allowance); Verification | One session controller, closed Canvas routes, reader integration, cancellation/rejection handling, fake-GitHub tests including no Client ID, and the current-format contract's exact session-path allowance. The closed task stays unchanged; T004 configures the OAuth App ID and checks compatibility. |
| T006@1b61929e | Chosen Structure 5, client use of 1, and the guidance in 4; Documentation And Build; Verification | Accepted round-3 Accounts UI and Sources pointer/warning, all three T003 review findings fixed, preserved session and Packs continuity, in-product wording, rebuilt outputs/pins, and browser/design acceptance. The closed unit remains the unchanged record of round-3 work. |
| T007@251708dd | Chosen Structure 4's revocation wording and 5's round-4 design; Documentation And Build; Verification | Only the three approved OAuth App registration strings applied, affected browser expectations and build pins updated, rebuilt outputs in parity, and fresh browser/rendered design acceptance with exactly one close classification. |
| T004@f17a4d83 | Chosen Structure 2 compatibility; External Prerequisite; Documentation And Build; Verification's live session | Accounts/OAuth App documentation, registration and public Client ID, configured/unconfigured compatibility coverage, and the real account/allowance journey with empty-scope, private-refusal, other-owner public-read, and revocation-navigation checks. |

The dependency chain is T001 -> T005 -> T006 -> T007 -> T004. T001, T005, and T006 remain closed. T007 starts open and can be verified with fake GitHub responses before the public Client ID exists. T004 remains blocked pending the coordinator's blocker reconciliation and the OAuth App's public Client ID. Finish automated browser journeys before the live/host-only check, then use the normal execution lane's independent verification and review.

Earlier reconciliation records are retained below as history:

The pre-approval task file had no canonical units, archives, discovered work, or execution history. Proposed reconciliation by durable key is kept 0, changed 0, dropped 0, new 4. All four units are open with no inherited state or completion evidence; the coordinator owns application and execution reconciliation.

This re-definition's proposed reconciliation is kept 2 (T001@9e4b7c26 `[x]`, T004@f17a4d83 `[ ]`), changed 1 (T003@6d92e0ab dependency only, `[ ]` preserved), dropped 1 (T002@c3a86f51 `[~]`, to be archived by the coordinator after the user's "replace T002" at 2026-11-03T01:18:16Z), and new 1 (T005@0675cd73 open `[ ]`, with no inherited state or completion evidence).

For this round-3 re-definition, proposed reconciliation is kept 2 (T001@9e4b7c26 `[x]`, T005@0675cd73 `[x]`), changed 1 (T004@f17a4d83 one-to-one, `[ ]` preserved: dependency now T006, GitHub App registration and compatibility additions, and Accounts documentation), dropped 1 (T003@6d92e0ab `[!]` with `design-gap`, archived by the coordinator after the user's "approve round 2" at 2026-11-03T12:04:26Z and exact round-3 `approved` at 2026-11-03T23:26:16Z), and new 1 (T006@1b61929e open `[ ]`, with no inherited state or completion evidence). Preserve earlier archives and all Work history; the Spec Lead stages the mapping, not archive or execution-state changes.

For this round-4 re-definition, proposed reconciliation is kept 3 (T001@9e4b7c26, T005@0675cd73, and T006@1b61929e `[x]`, entire units unchanged), changed 1 (T004@f17a4d83 one-to-one, `[!]` and its current `blocked-by:` line preserved for coordinator replacement; dependency now T007, OAuth App registration, compatibility, documentation, and live checks), dropped 0, and new 1 (T007@251708dd open `[ ]`, deps T006@1b61929e, no inherited state or completion evidence). No archive is added. Preserve all prior archives and Work history; the Spec Lead stages the mapping, not execution-state changes.

## Risks And Reversibility

- The OAuth App and public Client ID do not yet exist in this package. The live check awaits them; implementation must retain the sign-in-unavailable fallback without them. No live authorization or rate-limit result is claimed.
- With no expiring-token opt-in, local sign-out and process exit discard Dude's access but leave GitHub's authorization, and potentially the discarded token's validity, in place. The user revokes Dude under Authorized OAuth Apps. This package adds no persistence or refresh handling.
- Empty returned scope for an OAuth token means no scopes were granted and access is public read-only. Retain the safe scope-header confirmation and private-repository refusal checks rather than relying on wording alone. Any future private-access proposal would need a separate decision about the write-capable `repo` scope.
- Existing native links establish a frontend affordance, not proof of embedded-host external navigation or the Applications settings landing tab. Selectable URL/code text remains available; verify the host and revocation-navigation behavior in the live check and report mismatches.
- T006 remains the accepted round-3 implementation and closed record. T007 inherits none of its completion evidence and changes only three strings; the round-4 mock's measurements do not replace fresh product evidence.
- The Accounts tab makes the Settings header taller at narrow widths. Preserve the accepted navigation/layout regressions and keep Packs mounted; the shorter round-4 Signed out text at 180x450 still needs comparison with its approved screenshot.
- Authentication changes a shared transport contract. Explicit opt-in and unchanged anonymous/importer tests must prevent ambient or cross-caller credential use.
- The separate call-count fix is uncommitted. Preserve its bytes and report its evidence separately from 089.
- GitHub can exhaust or otherwise restrict the user's shared allowance. Sign-in is not an availability guarantee. A retained anonymous-refusal message still describes that read after sign-in until the user explicitly retries.
- The known Windows `build.test.mjs` test 32 failure needs the accepted pre-change differential, not a hidden skip or a claim of a clean suite.

Ending the session restores anonymous behavior. Reverting the feature needs no credential-file migration or cleanup, because no authentication data is persisted.

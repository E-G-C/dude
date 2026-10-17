---
title: Dude Canvas Bundle Upgrade
slug: dude-canvas-bundle-upgrade
status: draft
spec_path:
---

# Idea: Dude Canvas Bundle Upgrade

## Idea

> The user should be able to trigger a Dude harness update/upgrade. This functionality is missing.

The user confirmed capturing the Canvas/Settings upgrade surface as a separate idea for later definition.

### Update Notice And Simple Update (2026-10-15)

> propose the corresponding ui settings based on your UI design knowledge of the , Dude might check for updates when a session starts, notify the user (probably under Dude needs you) and a simple upgrade process as deterministic as possible. if we need to change some of the core Dude upgrade commands that's fine. We aim for simple, not too many-hoops process

The user sent this at 2026-10-15T09:51:46Z as an explicit brainstorm request for Dude Canvas Bundle Upgrade. Dude corrected only clear spelling slips, a doubled space, and a space after a parenthesis, and kept the incomplete phrase "knowledge of the ," as written. The user asked Dude for the proposal, which is recorded under Dude's Analysis.

## Open Questions

For later definition; no answer is needed to capture this intention. Each question names Dude's recommendation first; the reasons are under Dude's Analysis.

1. After Dude updates itself, should the same dialog offer to refresh installed packs as an optional second step with its own preview, or should pack refresh stay only in Settings > Packs? Dude recommends the optional second step, because an accurate pack preview needs the updated engine, which is why `@dude upgrade --all` exists today.
   Answer:
2. Where should the update's changes land? Dude recommends leaving them uncommitted on the current branch for the user to review and commit, as pack installs do. The alternatives are one automatic commit on the current branch, or today's separate `chore/dude-upgrade-*` branch with a commit and a manual merge.
   Answer:
3. Should Settings > About include a switch that turns off the session-start check? Dude recommends no switch for now: the check writes nothing and stays silent offline, pinning a release already stops the notice, and the Canvas has no stored preferences today.
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

One bounded outcome: Dude tells the user when a newer release exists, and the user updates Dude from one Canvas dialog while code does the work.

- When a Copilot session starts, the Dude extension checks the recorded upgrade channel for a newer stable release. The check reads release tags only, writes nothing, and stays silent if the source cannot be reached.
- If a newer release exists, Needs you shows a non-blocking notice. It comes from code rather than from an agent request: nothing waits on it, and it never blocks requests.
- Review update opens one dialog. Code builds the preview, the user confirms with one Update click, and code applies the update. No agent turn or typed confirmation phrase is involved.
- Settings > About shows the installed version, the update channel, the latest check result, Check for updates, and Update.
- The user allowed changes to the core upgrade commands where they make this simpler. Chat `@dude upgrade` keeps working on the same engine.

Success test: in a project on v1.9.0 after v1.10.0 is published, start a session, see the notice in Needs you, open Review update, read the preview, click Update once, and see the files updated with a prompt to start a new session. In the new session, About shows v1.10.0 and Up to date.

Out of scope:

- Installing without the user's click, and pushing or merging.
- Notices for pinned installs and for development installs that track a branch.
- Changing the update channel from the Canvas.
- Changing what the release bundle contains.

This refresh replaces the 2026-09-21 wording that ruled out an automatic update service, because the user now wants an automatic check. Installing still requires the user's click. `.dude/ideas/074-dude-canvas-about.md` kept update checks out of About and pointed here; this idea now adds them to About.

This is still a capture. It creates no definition package, tasks, or mock, and it runs no upgrade.

## Dude's Analysis

The user asked Dude to propose the settings and the flow. This section is Dude's recommendation, based on the measurements under Current Context And Investigation and on how familiar products handle updates. It is not a user answer or an accepted requirement.

### Today's flow

1. Nothing tells the user an update exists. Global `@dude status` deliberately does not check, so the user must know to run `@dude upgrade`.
2. The agent runs `status` and `plan`, reads the plan file, and writes its own summary, so the wording changes from run to run.
3. The user types the literal phrase `confirm upgrade`. A plain "yes" does not count.
4. Apply refuses a dirty working tree, so the user commits or stashes first.
5. Apply tags HEAD, switches to a new `chore/dude-upgrade-<ref>` branch, and commits there; the user reviews and merges that branch by hand. In Copilot app worktree sessions, which already give each session its own branch, this adds a second branch.
6. Installed packs need `--all` and a second typed phrase, `confirm packs`.
7. Rollback runs `git reset --hard` to the safety tag, which also drops anything committed after it on the checked-out branch.

An update is the same kind of local file work as a pack install, which Compose finishes in about 130 ms (083). It should take one click, as 083 proposes for packs.

### Proposed notice

Familiar products keep "an update is available" separate from "something needs you now". VS Code adds a badge to the Manage gear, GitHub Desktop shows a banner with a link, and the GitHub CLI prints one line: "A new release of gh is available". None of them block work. Dude can follow that model in the place the user suggested:

- At session start, the extension compares the newest stable release tag on the recorded source with the installed version, using one `git ls-remote --tags` and writing no files. Releases arrive about daily (four in five days), so the notice will appear often and must stay quiet.
- If a newer release exists, the top of Needs you shows an informational notice, "Dude v1.10.0 is available. You have v1.9.0.", with What's new (the GitHub release page), Review update, and Later.
- The notice is styled differently from request cards and is not counted as a request. Later hides it until the next session. Skipping a version would need stored state, so it is left out; revisit it if the notice becomes noise.
- Offline, unreachable, pinned, and development installs show no notice, and About explains why.

### Proposed settings

Firefox, Chrome, Obsidian, and GitHub Desktop put update controls next to the version, so Settings > About is the natural home and the Canvas needs no new navigation.

| Row | Content |
| --- | --- |
| Dude version | The installed version, such as `v1.9.0` (existing row). |
| Update channel | Latest release, Pinned to v1.9.0, or Development (main), read from the recorded `source_ref`. This rewords the existing "Recorded channel/ref" row. |
| Updates | One status line: Checking, Up to date, v1.10.0 is available with What's new, Couldn't check with Try again, or why checks do not apply. Update to v1.10.0 is the primary button when an update exists, next to Check for updates. The last check time appears underneath. |

Dude proposes no on/off switch (question 3). Pinning a release already stops the notice, the check writes nothing, and a switch stored in the browser would not survive, because the Canvas server listens on a new port each time it opens.

### Proposed update dialog

The dialog reuses 083's in-place pattern, so installing a pack, refreshing one, and updating Dude feel the same.

1. Review update, from the notice or About, opens the dialog at once. A short-lived child process runs the engine's preview with progress and Cancel. No agent is involved.
2. The dialog shows the installed and new versions with What's new, and how many Dude files are updated, added, or removed, with paths behind Show files and no hashes. It warns about Dude files with local edits that the update will replace, says where the changes will land (question 2), shows the pack step if there is one (question 1), and notes that the new agents and Canvas load in a new session.
3. The only buttons are Update and Cancel. The click is the consent: the server binds it to the exact previewed plan, and the engine already rechecks every expected file before writing.
4. Progress shows Downloading, Applying, and Checking. The result names the new version and says to start a new session, or gives a plain error that says whether anything changed.

Chat `@dude upgrade` keeps its typed phrase, because in chat the phrase is what shows the user confirmed rather than the model. In the Canvas, the click comes straight from the user.

### Proposed engine changes

1. Check: add a tags-only read that writes nothing. Today's `status` also downloads the upstream manifest and leaves that download folder behind after every successful run.
2. Preview: fetch only what the upgrade compares. Each release already ships a core-only `dude-bundle-<tag>.zip` (1.4 MiB and 100 files for v1.9.0), while `plan` clones the whole repository (480.5 MiB, 27 seconds cold). A sparse checkout of the core paths is the alternative. Either way, keep at most the current release in the cache and use the operating system's temporary folder.
3. Apply: write in place on the current branch as one all-or-restored file batch, as Compose and first-definition publishing already do, with lint inside the rollback boundary. Require only that the files it touches are unchanged since the preview, instead of a clean working tree. Drop the safety tag and the branch switch. Committing follows question 2.
4. Rollback: without a tag, undo is ordinary Git: discard the update's files before committing, or revert the commit. Delete `upgrade.mjs rollback` if no caller remains.
5. Packs: follow question 1.

### Risks to resolve in definition

- The update replaces `.github/extensions/dude/**`, which is the code running the Canvas. The current session keeps its old Canvas server, UI, and agents until a new session starts, so the engine must run in a child process and the dialog must say to start a new session. Windows replacement of the running extension's files is unverified.
- Apply fails today on any lint failure in the workspace, so an unrelated edit in progress could block or undo an update. Decide whether only new failures count.
- An agent may be editing at the same time. Per-file expected-content checks protect Dude's files, and the update touches nothing else.
- Downloads need a deadline, progress, and Cancel; 082 bounds a GitHub pack fetch at 120 seconds.
- Canvas-started Git for packs runs with an empty Git home so no saved `.netrc` logins are used (082). Private or enterprise upgrade sources may need credentials.
- Development installs never get a notice, because `status` compares the branch by name. `plan` also reuses its cached clone of a branch without fetching, so a development preview can show an old snapshot of `main`. Release channels are unaffected because tags do not move.
- This repository is the upstream on `main`, so the notice never appears here. Acceptance needs a consumer fixture with `source_ref: latest` and an older installed tag.

## Current Context And Investigation

Coordinator-verified facts from 2026-10-15, not user answers:

1. Releases: v1.6.0 (2026-10-10), v1.7.0 (2026-10-12), v1.8.0 (2026-10-13), and v1.9.0 (2026-10-14) are published. Each has a GitHub release page with generated notes. The v1.9.0 asset `dude-bundle-v1.9.0.zip` is 1,478,230 bytes and holds 100 core files: 64 under `.github/skills`, 30 under `.github/extensions`, 3 agents, 2 under `.dude/metadata`, and 1 instruction file.
2. `upgrade.mjs status` took 0.6 seconds on this repository's `main` channel. It resolves the newest stable tag for a `latest` channel and compares refs by name, so a pinned tag or a branch always reports `up_to_date`. A successful run leaves its `manifest-*` download folder behind.
3. The engine's cache root is `TMPDIR` or `/tmp`. Windows normally leaves `TMPDIR` unset, so the cache lands in `C:\tmp\dude-upgrade-cache`; this investigation's `status` run created `C:\tmp` at the drive root, and Dude then deleted it.
4. A cold `upgrade.mjs plan` took 27.0 seconds and cached a 480.5 MiB, 3,726-file depth-1 clone of the whole repository; a warm rerun took 1.6 seconds. Clones are cached per source and ref and never removed, so each release adds one. The longest tracked path is 165 characters and `core.longpaths` is unset, so on Windows a clone under a cache prefix longer than about 94 characters fails; one probe with a 133-character prefix failed after 243 seconds. The default and `os.tmpdir()` prefixes (48 and 72 characters) fit.
5. `apply` requires a clean working tree, creates a `dude-pre-upgrade-<timestamp>` tag, switches to `chore/dude-upgrade-<ref>`, writes, runs lint, and commits. `rollback` runs `git reset --hard` to the tag. Neither pushes or merges.
6. Canvas: Settings has two sections, Packs and About. About reads only the recorded manifest and base-release record, contacts no remote, and writes nothing. Needs you lists requests that an agent publishes through `dude_needs_you` and then waits on; no tab shows a count badge. The Canvas server listens on an operating-system-assigned loopback port each time it opens. The Dude extension runs as its own process that joins the session when it loads (`src/extensions/dude/extension.mjs`), so a check there needs no agent turn.

## Related References

- Broader Canvas intent: `.dude/ideas/052-dude-canvas-ui.md`.
- Shared Settings surface: `.dude/ideas/063-dude-canvas-settings.md`.
- About section, which left update checks to this idea: `.dude/ideas/074-dude-canvas-about.md`.
- Needs you requests and their waiting model: `.dude/ideas/057-dude-canvas-needs-you.md`.
- One-step dialog pattern for pack actions: `.dude/ideas/083-one-step-pack-actions.md`.
- Fetch bounds and Git credential isolation: `.dude/ideas/082-targeted-pack-acquisition.md`.
- Development base release record: `.dude/ideas/075-dude-development-base-release.md`.

These references establish product continuity, not execution dependencies or order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-21T23:27:09Z - brainstorm: Staged the user-confirmed Canvas harness/bundle upgrade intention as a separate draft for coordinator first-capture publication and later definition. Preserved the existing preview, freshness, and explicit confirmation boundary; no upgrade was performed and no package, tasks, or mock were authored.
- 2026-10-15T10:10:18Z - brainstorm: Refreshed the draft with the user's 2026-10-15 request for a session-start update check, a Needs you notice, Settings > About controls, and a simple deterministic update that may change the core upgrade commands. Recorded Dude's requested proposal, coordinator-verified measurements, and three open questions for later definition, and replaced the earlier scope wording that ruled out an automatic update service. Status stays draft with no package, tasks, or mock, and no upgrade ran.

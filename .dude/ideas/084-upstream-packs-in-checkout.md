---
title: Upstream Packs In A Checkout
slug: upstream-packs-in-checkout
status: defined
spec_path: .dude/specs/084-upstream-packs-in-checkout/spec.md
---

# Idea: Upstream Packs In A Checkout

## Idea

> under settings / packs/ sources why the remote source isn't read when the local library exists? If a user like myself has a checkout but the upstream has been updated with a new pack I can't install it

The user sent this message at 2026-10-13T18:12:39Z; Dude corrected only the extra spaces after "packs/". After Dude's chat answer, the user replied at 2026-10-13T18:18:08Z with "capture it as brainstorm". Dude's Analysis records the investigation behind that answer.

## Open Questions

For later definition; no answer is needed to capture this intention.

1. In a checkout, should Canvas read Bundle upstream only when the user asks (a "Show packs in Available" action on its row, as added sources have), or on every Reload packs alongside the local library?
   Answer: In chat at 2026-10-13T18:51:27Z, the user accepted Dude's suggestion to read Bundle upstream on every Reload packs, never on open, and added a requirement: Canvas must show users that they need to choose Reload packs to see upstream packs. Literal reply:

   > This sounds good but we need a way to indicate tis functionality  so the user realizes they needs to reload to actually see the remotes:
   >
   > > Read the upstream when you choose Reload packs, the same as added sources, and never on open. When you're offline, the upstream row says Unavailable and the local catalog still works.

2. When a pack exists in both the local library and the upstream, which copy should Available show and install by default?
   Answer: In a later chat reply, the user agreed with Dude's suggestion for this question: Available keeps the local copy as the default, hides upstream copies of local packs, and adds only upstream packs that the local library lacks. Literal reply:

   > agree on this one:
   >
   > > Show the local packs in Available as today, plus any upstream pack the local library doesn't have. Hide upstream copies of packs you also have locally, because the local copy is the default and the one you edit. That fixes the new-pack case without any new data.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

One bounded outcome: in a development checkout, Canvas Settings > Packs can show and install a pack that exists only in the bundle upstream, without pulling the checkout or using chat. The user's answers to questions 1 and 2 set the behavior:

- Reload packs also reads Bundle upstream, never on open.
- Available adds only upstream packs that the local library lacks. Upstream copies of packs that also exist locally stay hidden, and the local copy remains the default.
- Before the upstream has been read, Canvas tells the user that upstream packs appear after Reload packs.
- When offline, the upstream row reads Unavailable, and the local catalog still works.

Success test, with `library/packs` present and a pack that exists only upstream:

- Before a Reload, Canvas shows that upstream packs appear after Reload packs.
- After a Reload, the pack appears in Available from Bundle upstream and installs through 083's one-step dialog.
- A pack that exists in both places shows only its local copy.

Out of scope:

- Listing both copies of a same-name pack.
- Detecting newer copies or adding pack versions. No version field exists; versions would be a separate idea if wanted.
- Marking a local pack whose upstream copy differs, a possible later option.
- A forced upstream install or refresh for a pack that also exists in the local library (the user agreed at 2026-10-13T18:56:41Z).
- Released installs, which already read the upstream.
- Editing the upgrade channel, which bundle upgrade owns (see 072).
- Compose's chat default, since chat already has `--source`.
- Private repositories or credentials.

This capture creates no package, tasks, or mock and authorizes no pack operation.

## Definition Package

Definition package: `.dude/specs/084-upstream-packs-in-checkout/spec.md`, with a lean `plan.md` and a `tasks.md` of two derived units. Design is `approved`: the user approved the round-1 canonical mock at `.dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html` by explicit chat reply at 2026-10-14T01:35:11Z, and the spec's Revision Log binds that approval to the mock's exact bytes. Product implementation runs from the two sequential units, T001@d92bcd4b and then T002@4290a774.

The package follows the user's answers to questions 1 and 2, the agreed exclusion of a forced upstream fetch, and the Architect's recommendation of 2026-10-13, which also declares the mock's capability envelope. For a checkout, it replaces 073's rule that Bundle upstream is not read while the local library exists (FR-033) and adds one exception to 073's same-name rows (FR-053). 073's package is unchanged.

During the user's explicit `ship upstream-packs-in-checkout`, the Spec Lead applied four Ship-authorized definition-owner dispositions. They are not user answers, and the user's approval of the round-1 mock confirmed all four, including the accepted GitHub rate limit.

- Unreadable local library (FR-008): when a Reload cannot read the local library, Available hides no Bundle upstream pack, and Install still takes the local copy first, with the dialog naming it. Basis: the answer to question 2 hides only upstream copies of packs the local library has, which an unread library cannot establish. This needs no new state or wording, and both copies are never listed because the local rows are absent.
- Commit in the preview (FR-021): an Install or Refresh preview that read Bundle upstream in a checkout shows the full commit under Source, and release dialogs stay as 083 left them. Basis: the Architect's recommended option. 083 already applies a repository source at the previewed commit and shows the commit of a repository source it warns about, and released installs are out of scope.
- GitHub's hourly limit (FR-018, Assumptions): every Reload reads Bundle upstream, with no cache or throttle, so frequent Reloads can leave it `Unavailable` until GitHub's hourly allowance for anonymous reads resets, and the docs say so. Basis: the answer to question 1 chose a read on every Reload and accepted `Unavailable` with a working local catalog. A release Reload already reads the upstream this way, and the keep-it-simple guardrail rejects added state without a proven need.
- Truthful dialog source (FR-025 through FR-027): when Install or Refresh uses no source the project added, the dialog names the source its preview read, Bundle upstream or Local library, and derives `Source changes` from it. Basis: 083's FR-006 requires a Refresh preview to show the source it will use. This feature makes upstream installs routine, and after a pull the default refresh reads the local copy, the outcome that the local-wins answer and the agreed exclusion of a forced refresh imply.

## Dude's Analysis

The findings and proposals below are Dude's, restated in neutral voice from its chat answer to the user's question. They are not user answers or accepted requirements. The user asked only for capture; this section keeps the investigation behind Dude's answer as context for definition.

### Why the upstream is not read

The behavior is by design, from 073. When `library/packs` exists, Canvas treats the workspace as a development checkout:

- The local library becomes the only default catalog.
- Bundle upstream (`https://github.com/E-G-C/dude` at `main`, from `.dude/metadata/bundle-manifest.md`) is listed, but its status reads "Not read while library/packs exists".

The rule is FR-033 in `.dude/specs/073-dude-canvas-artifact-import/spec.md`, and `docs/commands.md` describes it under "Settings: pack sources" (about lines 1452-1459). It follows the Compose catalog fetch policy in `.dude/memory/decisions.md` (about line 47): releases do not ship `library/`, so the upstream is a fallback when no local `library/` exists.

### The gap

The user cannot turn the upstream on either. Add source refuses `https://github.com/E-G-C/dude` as already configured. `validateNewSource` in `src/skills/dude-engine/lib/pack-sources.mjs` (about lines 597-599) checks `[...builtins, ...saved.sources]` for the same key, so the built-in Bundle upstream row counts even though nothing reads it in a checkout. As a result, Canvas has no path to a pack that exists only upstream.

### Workarounds today

1. Pull `main` into the checkout, then choose Reload packs.
2. Ask Dude in chat to install the pack from the upstream. Compose takes `--source https://github.com/E-G-C/dude --ref main` for that one install; `src/skills/dude-compose/SKILL.md` says an explicit `--source` is exclusive.

### Proposals

Dude's first smallest-fix proposal was to give the Bundle upstream row, in a checkout, the same "Show packs in Available" action that added sources have. Upstream-only packs would then install through 083's dialog, which already pins a GitHub install to the previewed commit. Item 5 under Current Context And Investigation describes how that action works today.

Other candidates Dude listed:

- Read the upstream on every Reload, alongside the local library. In answer to question 1, the user chose this read, which never runs on open.
- Let Add source accept the upstream repository when the built-in is not read.

For a pack in both places, the user chose Dude's local-wins rule in answer to question 2.

### Showing that a Reload is needed

Canvas reads no catalog when Settings opens (`docs/commands.md`, about line 1150). Until the first Reload, Available shows its empty state, "Catalog not read yet" with a Reload packs button (`src/extensions/dude/frontend/settings.jsx`, about lines 1169-1172), which does not mention the upstream. In a checkout, Reload today reads only the local library, so afterward only Sources, or Available filtered to Bundle upstream, says that the upstream was not read.

Proposal: while the upstream is unread in a checkout, Available shows a one-line note, such as "Packs that are only in Bundle upstream appear after you choose Reload packs." Sources' upstream row would then use the ordinary `Not read` state, and the reason beside its disabled "Show packs in Available" action would be the existing "Not read yet - choose Reload packs." (`showPacksState` in `src/extensions/dude/frontend/pack-sources.jsx`). The wording and placement are for the mock to settle.

### Versions and same-name packs

From Dude's chat answer of 2026-10-13:

- No `pack.md` in `library/packs` declares a version; all 20 were checked. The manifest parser in `src/skills/dude-engine/lib/pack-manifest.mjs` reads no version field.
- An install record in `.dude/metadata/profile.md` keeps the pack's files and source, plus the commit for a GitHub install.
- Compose's GitHub reader uses Git trees (`readTree` in `src/skills/dude-compose/lib/pack-acquisition.mjs`), which carry a content hash for each pack folder. Dude could therefore tell whether two copies are identical, but not which one is newer. In a checkout, a difference is often the user's own unpushed edit.
- Listing both copies would show every uninstalled pack twice in a checkout, because 073's FR-053 keeps same-name packs from different sources as separate rows.
- Pack versions would need a bump on every pack edit, and a missed bump hides an update. In return, Installed could show "update available" for every install. Dude suggested a separate idea if versions are wanted.

### Forced upstream fetch

The user raised the case of wanting to refresh a corrupted local pack. Dude advised against a forced upstream install or refresh for a pack that also exists in the local library:

- A broken installed copy (the pack's files under `.github`) is already repaired by Refresh from the local library.
- A broken local library copy is Git-tracked source in a checkout, so `git restore library/packs/<name>` or a pull fixes it. A forced upstream install would fix only the installed copy, and the next Refresh would install from the broken library copy again. Refresh matches the recorded source only among saved sources (`runPackAction` in `src/extensions/dude/lib/packs.mjs`, about lines 1667-1700, calls `chooseSource` with the refresh selection) and otherwise uses the default catalog, which in a checkout is the local library.
- For a one-off, chat already installs from the upstream with Compose `--source` (Workarounds today, item 2).
- The user's keep-it-simple guardrail (`.dude/memory/guardrails.md`, line 15) points the same way.

## Current Context And Investigation

Verified facts, not user answers:

1. `projectSources` in `src/extensions/dude/lib/packs.mjs` (about lines 1118-1160) builds the two built-in rows, Local library and Bundle upstream, ahead of the saved sources. When Bundle upstream is not the default catalog, its row says `Not read while library/packs exists.`
2. `src/extensions/dude/lib/catalog-reader.mjs` line 15 describes the default read as "the local library, else the upstream".
3. `resolveCatalogDir` in `src/skills/dude-compose/compose.mjs` (about line 483) uses the local library when it is present, and an explicit `--source` replaces it.
4. `validateNewSource` in `src/skills/dude-engine/lib/pack-sources.mjs` holds the duplicate check, and `addPackSource` in `packs.mjs` (about line 1447) calls it for GitHub locations. The check refuses with "This source is already configured." When the repeated source is a built-in, the Add source dialog shows its own text instead, titled "Already listed": "This is the Bundle upstream, a built-in source that bundle upgrade manages. Built-in sources are not added twice." (`refusalOf` in `src/extensions/dude/frontend/pack-sources.jsx`).
5. Source details show "Show packs in Available" on every row, built-in rows included. In a checkout, the Bundle upstream row shows it disabled with the reason "Not read while library/packs exists." The action only changes the view: it reads no catalog and is enabled only for a source that was read and still has a pack that is not installed (`docs/commands.md`, about line 1565, and `SourceBody` in `pack-sources.jsx`).
6. For question 2, 073's FR-053 keeps same-name packs from different sources as separate Available rows. Without `--source`, Compose `add` (`resolvePackDir` in `compose.mjs`, about line 417) uses the local library's copy of a pack when there is one; otherwise it fetches that pack from the manifest's upstream.
7. This repository is itself such a checkout. In this workspace, Sources lists Local library as the default and Bundle upstream as not read.

## Related References

- `.dude/ideas/073-dude-canvas-artifact-import.md`: the Sources view and its FR-033 and FR-053 rules.
- `.dude/ideas/078-dude-canvas-pack-sources.md`: resolved as superseded by 073. Its original text noted that the current dev bundle has only the local library as a source.
- `.dude/ideas/082-targeted-pack-acquisition.md`: the GitHub fetch bounds.
- `.dude/ideas/083-one-step-pack-actions.md`: the one-step dialog and its install at the previewed commit for a repository source.
- `.dude/ideas/072-dude-canvas-bundle-upgrade.md`: the Canvas surface for bundle upgrade, which owns the upgrade channel.

These references establish continuity, not execution order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-13T18:30:20Z - brainstorm: Captured the user's request to let Canvas read the bundle upstream in a development checkout, so a pack that exists only upstream can be installed, with Dude's investigation recorded; capture only, with no definition, mock, or implementation.
- 2026-10-13T19:05:28Z - brainstorm: Recorded the user's answers to questions 1 and 2 and the user's agreement to leave a forced upstream fetch out of scope, and reflected them in Intent And Scope: in a checkout, Reload packs also reads Bundle upstream, never on open, Canvas shows that upstream packs appear only after a Reload, and Available adds only upstream packs the local library lacks; still draft, with no definition.
- 2026-10-13T20:08:59Z - define: Staged first definition at .dude/specs/084-upstream-packs-in-checkout/spec.md with spec, plan, and header-only tasks; design is exploring, canonical mock creation and explicit user visual approval remain pending. No product implementation or task-state change.
- 2026-10-13T20:09:26Z - route: Assigned the canonical mock at .dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html to FluentUI, starting from 083's approved pack-actions.html and staying inside the Architect's declared capability envelope; design remains exploring and needs the user's explicit approval before implementation.
- 2026-10-13T22:07:40Z - define: Settled the round-1 upstream packs design to proposed at .dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html; the artifact hash and proposal evidence are bound in the spec Revision Log. The user's explicit visual approval remains pending. No product implementation, plan or task changes, or task derivation.
- 2026-10-14T01:54:13Z - define: Staged approval of the round-1 upstream packs design from the user's explicit chat reply "approved" at 2026-10-14T01:35:11Z, bound to .dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html at SHA256 `3ff5bf87f8b719c42d7e696fc10941504ce20a23f182b953dee5fdd51eda395b`, which the coordinator re-hashed after the reply and found unchanged. The approval confirms the four Ship dispositions: an unreadable Local library hides nothing, the commit shows only in Bundle upstream previews, the dialog names the source its preview read, and GitHub's anonymous rate limit is accepted. Derived two new sequential implementation units, T001@d92bcd4b and T002@4290a774 (deps: T001@d92bcd4b), with no inherited completion evidence. No execution or task completion is claimed.
- 2026-10-14T01:54:13Z - execution-reconciliation: Applied the checked approval stage and two new serial open task units, T001@d92bcd4b and T002@4290a774 (deps: T001@d92bcd4b), with no inherited state; kept 0, changed 0, dropped 0, new 2. Preserved user sections and append-only history, retained the approved mock bytes at SHA256 3ff5bf87f8b719c42d7e696fc10941504ce20a23f182b953dee5fdd51eda395b, and observed zero lint failures inside the rollback boundary. Definition is ready for the existing Ship execution path; no implementation has started.
- 2026-10-14T01:54:54Z - work: Claimed T001@d92bcd4b for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-14T03:51:05Z - work: Claimed T002@4290a774 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-14T07:45:42Z - work: Closed Upstream Packs In A Checkout: both live canonical tasks (T001@d92bcd4b, T002@4290a774) are done through autonomous Work in the Ship invocation, each on its first attempt with independent Tester and Reviewer acceptance (design close: matches approved spec). The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.

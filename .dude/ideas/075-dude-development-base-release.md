---
title: Dude Development Base Release
slug: dude-development-base-release
status: draft
spec_path:
---

# Idea: Dude Development Base Release

## Idea

> The Dude version shown as `Development (main)` doesn't say anything like `v1.1.2`. Will this apply to users' installed versions, or is it because this is the development branch?
>
> It should probably say the latest official version that Dude refreshed from, or something like that, wouldn't you agree? Fold it into a new idea describing the problem and pointing out that Dude already stores metadata under the `.dude/metadata` directory.

## Open Questions

1. Should base-release recording cover `main` refreshes through `@dude upgrade`, this source repository's own development build, or both?
   Answer:
2. When the base release cannot be determined, such as when no release tag is reachable, should About keep `Development (main)` alone or also say that the base release is unknown?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Scope And Proposals

Settings > About (feature 074, not yet closed) shows the recorded installed ref. In this source repository and installs tracking `main`, both "Dude version" and "Recorded channel/ref" read `Development (main)`. Without a release number, users cannot tell which official release their development install includes.

Release installs already record a version number. In `scripts/build-release.mjs`, `seedManifest` sets `source_ref: latest` and stamps `installed_ref` with the release tag; `.github/workflows/release.yml` supplies `--tag "$GITHUB_REF_NAME"`. `@dude upgrade` writes the resolved target ref, which for `source_ref: latest` is the newest stable `vX.Y.Z` tag. The published v1.3.0 zip records `installed_ref: v1.3.0` and `source_ref: latest` (verified 2026-09-26). Feature 074's About reader displays `Dude version: v1.3.0` and `Recorded channel/ref: Stable releases (latest)` for it. v1.3.0 predates About; users see the section from the first release that includes feature 074.

This repository's manifest records `source_repo: https://github.com/E-G-C/dude`, `source_ref: main`, and `installed_ref: main`. A `main` refresh records `main`, without the release its content includes. The repository is four commits after v1.3.0 (`git describe --tags`: `v1.3.0-4-gf22d980`), so "based on v1.3.0" is meaningful here.

Dude already stores metadata under `.dude/metadata/`:

- `bundle-manifest.md` is the install record owned by `dude-bundle-upgrade`. It must not be hand-edited.
- `profile.md` is the pack install profile owned by `dude-compose`, recording each installed pack's files and source.
- `upgrade-log.md` is the append-only upgrade history owned by `dude-bundle-upgrade`. Its entry shape already records `from: <sha>`, `to: <sha>`, and `ref:` per upgrade; this repository has no upgrade entries yet.

Proposed direction, not a decision: record the newest official release included in the development install as installation metadata under `.dude/metadata/` when Dude refreshes it and when this source repository builds its own development bundle. Following the usual About convention of identifying the installed build, About could show `Development (main), based on v1.3.0`. This remains recorded provenance, never verification of installed files. The proposed fallback without that record is to keep showing `Development (main)`.

Exclude network or git lookups at About display time. A GitHub release lookup reports what is available rather than what is installed; feature 074 requires About reads to make no external contact and run no command. Local git history answers this question only in the Dude source repository; in a user's project, it describes that project's own commits and tags. Also out of scope: update checks or upgrade UI (idea 072), changes to release installs that already record the tag, and edits to feature 074's approved package before this idea is defined.

The manifest shape is closed today. The upgrade engine's manifest validator, `scripts/build-release.mjs`'s `parseManifestDocument`, and `src/extensions/dude/lib/about.mjs` reject unknown manifest keys; About turns an unexpected key into "Unavailable". Adding a manifest field therefore requires changing the writers and every reader together, while keeping existing installs working. A development ref may have no reachable release tag, leaving its base release unknown.

## Related References

Continuity references, not dependencies or priority:

- `.dude/ideas/074-dude-canvas-about.md`
- `.dude/ideas/072-dude-canvas-bundle-upgrade.md`
- `.dude/metadata/bundle-manifest.md`
- `.dude/metadata/upgrade-log.md`
- `.dude/metadata/profile.md`
- `scripts/build-release.mjs`
- `.github/skills/dude-bundle-upgrade/upgrade.mjs`
- `src/extensions/dude/lib/about.mjs`
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-26T13:37:19Z - brainstorm: Staged the development base-release idea for first-capture publication; recording and display remain proposals, and the scope and fallback questions are non-blocking for capture. No package, tasks, implementation, or feature 074 changes.

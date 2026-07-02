# Bundle Manifest

This file pins the upstream Dude bundle version associated with the current install. `@dude upgrade` reads it to know which upstream source the upgrade should target and which release version the local bundle is currently on.

```json
{
  "source_repo": "https://github.com/E-G-C/dude",
  "source_ref": "main",
  "installed_ref": "main"
}
```

## Notes

- The manifest is **metadata only**: it carries the upstream source pin and the installed version, and nothing else. There is no `files` array and no per-file hashes.
- `installed_ref` is the release version this bundle was last installed from (e.g. `v1.2.0`), or a branch name for a branch-tracking install. It is auto-maintained by `@dude upgrade` (rewritten after a successful apply) and is optional — a fresh or un-versioned install may leave it empty. `@dude status` compares it against the newest release tag resolved from the source (`git ls-remote --tags`), so it never has to be hand-bumped.
- `source_ref` selects the upgrade channel. The sentinel `latest` (seeded into released bundles by `build-release`) tracks the newest **stable** `vX.Y.Z` release tag: `@dude upgrade` resolves it to the highest release tag on each run and records that release's tag in `installed_ref`, so upgrading always moves between published releases (pre-release tags like `v1.0.0-rc1` are ignored). A concrete `vX.Y.Z` pins to one release; a branch name such as `main` — used by this source repo, which is itself upstream — tracks that branch by name.
- Base ownership is derived from the **namespace convention** by the engine:

  ```text
  .github/agents/dude.agent.md
  .github/agents/dude-<slug>.agent.md          (slug NOT starting with 'local-' or 'pack-')
  .github/skills/dude-<slug>/**                (slug NOT starting with 'local-' or 'pack-')
  .github/instructions/dude.instructions.md
  ```

- The reserved `dude-pack-<pack>-<slug>` namespace is an installed **pack** (from `library/packs/`, managed by `dude-compose`). It is its own ownership tier: project-owned in practice and **preserved** by `@dude upgrade` — core refreshes never overwrite or delete installed packs.
- The reserved `dude-local-<slug>` namespace is project-owned and is never touched by upgrade.
- The `project` skill is project-owned and not part of the upgrade payload.
- Anything outside both the base and `dude-local-` namespaces is project-owned and never overwritten by `@dude upgrade`. Lint will warn about unreserved agents and skills so they can be renamed before colliding with a future upstream.
- **Base files are upstream-owned.** Editing any file under the base namespace directly is unsupported — those changes will be silently overwritten on the next `@dude upgrade`. To customize a base agent or skill, copy it under the reserved `dude-local-<slug>` namespace and edit there. See `dude-portability` and `docs/upgrading.md`.
- The namespace convention is the sole source of truth for base ownership; the engine enumerates the live tree on each run.
- This manifest is intentionally seeded. Legacy or empty manifests are unsupported.
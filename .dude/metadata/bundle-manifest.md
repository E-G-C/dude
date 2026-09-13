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

- This is a **metadata-only** manifest containing the upstream source pin and
  installed version. It has no `files` array or per-file hashes.
- `installed_ref` is the release version this bundle was last installed from
  (for example, `v1.2.0`), or a branch name for a branch-tracking install. It is
  auto-maintained by `@dude upgrade` and may be empty on a fresh or unversioned
  install.
- `source_ref` selects the upgrade channel. Released bundles use `latest`, which
  resolves to the newest stable `vX.Y.Z` tag and ignores prereleases. A concrete
  tag pins one release; `main` keeps this upstream source repository on its
  branch-tracking development channel.
- The upgrade workflow's internal `upgrade.mjs status` phase compares refs for
  orientation only and may return `up_to_date` despite missing or different
  core content. That result does not establish byte completeness. The phase is
  separate from global `@dude status`, which reports workflow lane orientation
  and does not check upgrades. The authoritative `plan` phase, run as
  `upgrade.mjs plan`, compares the full core inventory and bytes. Equal refs can
  still yield Add, Replace, or Remove operations that require review and
  `confirm upgrade`. A true no-op requires matching manifest metadata and no
  file operations.
- The engine derives core ownership from the live trees. The exact categories
  are canonical default agents at `.github/agents/dude.agent.md` and
  `.github/agents/dude-<slug>.agent.md` (excluding `dude-local-*` and
  `dude-pack-*`), canonical core Dude skill directories at
  `.github/skills/dude-<slug>/**` (excluding `dude-local-*`, `dude-pack-*`, and
  `.github/skills/project/**`), `.github/instructions/dude.instructions.md`,
  and the deployed runtime tree `.github/extensions/dude/**`.
- `.github/extensions/dude/**` is the only upstream/core-owned extension tree.
  Core upgrade may add, replace, or remove its files. Siblings and near matches,
  including `.github/extensions/dude-preview/**`,
  `.github/extensions/dude-local/**`, and every other named extension tree, are
  project-owned and preserved. `src/extensions/dude/**` belongs to the source
  repository's project tier rather than deployed core.
- Installed `dude-pack-*` agents, skills, instructions, and prompts are
  pack-owned and preserved by the core phase. Agent and skill names under
  `dude-local-*`, unreserved custom agents and skills, and the `project` skill
  are project-owned.
- Local changes to a core-owned path are unsupported; upgrade can overwrite or
  remove them. Copy only default agent or skill customizations into their
  `dude-local-<slug>` agent or skill paths. That convention does not provide a
  supported extension-runtime copy or override.
- These notes document the boundary; they are not a file registry. The
  ownership engine enumerates the live trees on each run.
- This manifest is intentionally seeded. Legacy or empty manifests are unsupported.

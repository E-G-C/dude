# Bundle Manifest

This file pins the upstream Dude bundle version associated with the current install. `@dude upgrade` reads it to know which upstream source the upgrade should target and which installed commit the local bundle is currently at.

```json
{
  "source_repo": "https://github.com/E-G-C/dude",
  "source_ref": "main",
  "installed_sha": "55f6fd6b87750bd16d866e68163849d6846d47f1",
  "installed_at": "2026-05-26T15:02:11Z"
}
```

## Notes

- The manifest is **metadata only**: it carries the upstream source pin and the installed commit, and nothing else. There is no `files` array and no per-file hashes.
- Base ownership is derived from the **namespace convention** by the engine:

  ```text
  .github/agents/dude.agent.md
  .github/agents/dude-<slug>.agent.md          (slug NOT starting with 'local-')
  .github/skills/dude-<slug>/**                (slug NOT starting with 'local-')
  .github/instructions/dude.instructions.md
  ```

- The reserved `dude-local-<slug>` namespace is project-owned and is never touched by upgrade.
- The `project` skill is project-owned and not part of the upgrade payload.
- Anything outside both the base and `dude-local-` namespaces is project-owned and never overwritten by `@dude upgrade`. Lint will warn about unreserved agents and skills so they can be renamed before colliding with a future upstream.
- **Base files are upstream-owned.** Editing any file under the base namespace directly is unsupported — those changes will be silently overwritten on the next `@dude upgrade`. To customize a base agent or skill, copy it under the reserved `dude-local-<slug>` namespace and edit there. See `dude-portability` and `docs/upgrading.md`.
- The namespace convention is the sole source of truth for base ownership; the engine enumerates the live tree on each run.
- This manifest is intentionally seeded. Legacy or empty manifests are unsupported.
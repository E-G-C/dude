# Install Profile

This file records which optional **packs** from `library/packs/` are installed
into this bundle's `.github/`. It is maintained by `dude-compose`
(`@dude add pack <name>` / `@dude remove pack <name>`). Do not hand-edit the
`installed` map — it is the removal manifest.

```json
{
  "enabled_packs": [],
  "installed": {}
}
```

## Notes

- `enabled_packs` — names of installed packs (sorted).
- `installed.<name>.files` — the exact top-level destination paths written for
  that pack; `remove` deletes precisely these.
- Installed pack artifacts use the `dude-pack-<name>-*` namespace, which
  `@dude upgrade` preserves across core refreshes.
- This lean-core repo ships pack-free: `enabled_packs` is empty by default.

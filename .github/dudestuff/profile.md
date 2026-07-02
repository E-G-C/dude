# Install Profile

This file records which optional **packs** from `library/packs/` are installed
into this bundle's `.github/`. It is maintained by `dude-compose`
(`@dude add pack <name>` / `@dude remove pack <name>`). Do not hand-edit the
`installed` map — it is the removal manifest.

```json
{
  "enabled_packs": [
    "authoring",
    "coding"
  ],
  "installed": {
    "authoring": {
      "files": [
        ".github/agents/dude-pack-authoring-agent-smith.agent.md",
        ".github/agents/dude-pack-authoring-instruction-smith.agent.md",
        ".github/agents/dude-pack-authoring-pack-smith.agent.md",
        ".github/agents/dude-pack-authoring-prompt-smith.agent.md",
        ".github/agents/dude-pack-authoring-skill-smith.agent.md",
        ".github/skills/dude-pack-authoring-instruction-conventions",
        ".github/skills/dude-pack-authoring-pack-conventions",
        ".github/skills/dude-pack-authoring-prompt-conventions"
      ],
      "installed_at": "2026-07-02T02:40:31.370Z"
    },
    "coding": {
      "files": [
        ".github/agents/dude-pack-coding-architect.agent.md",
        ".github/agents/dude-pack-coding-coder.agent.md",
        ".github/agents/dude-pack-coding-reviewer.agent.md",
        ".github/agents/dude-pack-coding-tester.agent.md",
        ".github/skills/dude-pack-coding-spec-artifacts"
      ],
      "installed_at": "2026-07-02T16:18:48.507Z"
    }
  }
}
```

## Notes

- `enabled_packs` — names of installed packs (sorted).
- `installed.<name>.files` — the exact top-level destination paths written for
  that pack; `remove` deletes precisely these.
- Installed pack artifacts use the `dude-pack-<name>-*` namespace, which
  `@dude upgrade` preserves across core refreshes.

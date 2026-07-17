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
        ".github/skills/dude-pack-authoring-prompt-audit",
        ".github/skills/dude-pack-authoring-prompt-conventions"
      ],
      "installed_at": "2026-07-17T02:22:14.865Z",
      "inventory": {
        "version": 1,
        "pack": "authoring",
        "source": {
          "type": "source",
          "location": "https://github.com/E-G-C/dude",
          "ref": "main"
        },
        "manifest_sha256": "39c4e00cc501fcd2a15c565891382bd1343697dd6b0a0b2078e1b7ee70e129bc",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-authoring-agent-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-agent-smith.agent.md",
            "source_sha256": "9ddea4ac61946f677626818eb962f5fd8ee5bce5c699cb4f07649adce5e88eb4",
            "installed_sha256": "9ddea4ac61946f677626818eb962f5fd8ee5bce5c699cb4f07649adce5e88eb4"
          },
          {
            "path": ".github/agents/dude-pack-authoring-instruction-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-instruction-smith.agent.md",
            "source_sha256": "e7098b4d01d51c95858b0229148f17a65039932c2a989d13838dd9ceca97881e",
            "installed_sha256": "e7098b4d01d51c95858b0229148f17a65039932c2a989d13838dd9ceca97881e"
          },
          {
            "path": ".github/agents/dude-pack-authoring-pack-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-pack-smith.agent.md",
            "source_sha256": "cd73d3a903ea9688155446feaf88b3328af062198e25c43fc595b19e7222b6e9",
            "installed_sha256": "cd73d3a903ea9688155446feaf88b3328af062198e25c43fc595b19e7222b6e9"
          },
          {
            "path": ".github/agents/dude-pack-authoring-prompt-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-prompt-smith.agent.md",
            "source_sha256": "59c29b5bfa58016739448e2a372fbd24e63b21fbb62fc0b3195343c15e21b54a",
            "installed_sha256": "59c29b5bfa58016739448e2a372fbd24e63b21fbb62fc0b3195343c15e21b54a"
          },
          {
            "path": ".github/agents/dude-pack-authoring-skill-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-skill-smith.agent.md",
            "source_sha256": "b9b688961d686cf72dc4d8e372e785ec4262132787d1cc6829a518b201accd8c",
            "installed_sha256": "b9b688961d686cf72dc4d8e372e785ec4262132787d1cc6829a518b201accd8c"
          },
          {
            "path": ".github/skills/dude-pack-authoring-instruction-conventions",
            "kind": "skills",
            "source": "skills/dude-pack-authoring-instruction-conventions",
            "source_sha256": "d615d704c71f6afe4eee0720bfb5c0ca1f4200cc5399a479d1793ce896189a72",
            "installed_sha256": "d615d704c71f6afe4eee0720bfb5c0ca1f4200cc5399a479d1793ce896189a72"
          },
          {
            "path": ".github/skills/dude-pack-authoring-pack-conventions",
            "kind": "skills",
            "source": "skills/dude-pack-authoring-pack-conventions",
            "source_sha256": "7cfe594780ba84e307ce85d47453d6a521bdcc90dfdee3f49745c059acf5984f",
            "installed_sha256": "7cfe594780ba84e307ce85d47453d6a521bdcc90dfdee3f49745c059acf5984f"
          },
          {
            "path": ".github/skills/dude-pack-authoring-prompt-audit",
            "kind": "skills",
            "source": "skills/dude-pack-authoring-prompt-audit",
            "source_sha256": "129dfbde62cd9f44ccb09097a80e1575dea94953e58616fcfab52ed19081d9c4",
            "installed_sha256": "129dfbde62cd9f44ccb09097a80e1575dea94953e58616fcfab52ed19081d9c4"
          },
          {
            "path": ".github/skills/dude-pack-authoring-prompt-conventions",
            "kind": "skills",
            "source": "skills/dude-pack-authoring-prompt-conventions",
            "source_sha256": "79ff7fce82edabee90df9b0d9cd56a7da4ee9a12f3633388b5b8bc720584e816",
            "installed_sha256": "79ff7fce82edabee90df9b0d9cd56a7da4ee9a12f3633388b5b8bc720584e816"
          }
        ],
        "digest": "cd91003b39ed2d5962afb7aa61a00a68434174b9bea3a1eeb20e771f64a399f4"
      }
    },
    "coding": {
      "files": [
        ".github/agents/dude-pack-coding-architect.agent.md",
        ".github/agents/dude-pack-coding-coder.agent.md",
        ".github/agents/dude-pack-coding-reviewer.agent.md",
        ".github/agents/dude-pack-coding-tester.agent.md",
        ".github/skills/dude-pack-coding-spec-artifacts"
      ],
      "installed_at": "2026-07-10T04:38:32.873Z",
      "inventory": {
        "version": 1,
        "pack": "coding",
        "source": {
          "type": "source",
          "location": "https://github.com/E-G-C/dude",
          "ref": "main"
        },
        "manifest_sha256": "b189e86cb0c9d537c6da28b38fae9c2db95a6af0ad932b501ae4f5007ee64247",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-coding-architect.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-architect.agent.md",
            "source_sha256": "0b643bdf44d33890dc370e3aef9c06e9cfba08640e464d93245f3c46bc06fe3a",
            "installed_sha256": "0b643bdf44d33890dc370e3aef9c06e9cfba08640e464d93245f3c46bc06fe3a"
          },
          {
            "path": ".github/agents/dude-pack-coding-coder.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-coder.agent.md",
            "source_sha256": "c9ea505bb615c5bccced146703f2fab4aa38516db349f19b906575e9204bac99",
            "installed_sha256": "c9ea505bb615c5bccced146703f2fab4aa38516db349f19b906575e9204bac99"
          },
          {
            "path": ".github/agents/dude-pack-coding-reviewer.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-reviewer.agent.md",
            "source_sha256": "b491d3a848b9c6566d62681ba6bb65721c5a5e39a7c6c1c549f40d1ae45662bf",
            "installed_sha256": "b491d3a848b9c6566d62681ba6bb65721c5a5e39a7c6c1c549f40d1ae45662bf"
          },
          {
            "path": ".github/agents/dude-pack-coding-tester.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-tester.agent.md",
            "source_sha256": "6c1675216620da6fab874aba5d8e90ecaed874c95453660219ac7cb01bcfead9",
            "installed_sha256": "6c1675216620da6fab874aba5d8e90ecaed874c95453660219ac7cb01bcfead9"
          },
          {
            "path": ".github/skills/dude-pack-coding-spec-artifacts",
            "kind": "skills",
            "source": "skills/dude-pack-coding-spec-artifacts",
            "source_sha256": "c295e92781817c92cf17b63e158f6f2031d1010480a54f5fdfcfb80066fb75b5",
            "installed_sha256": "c295e92781817c92cf17b63e158f6f2031d1010480a54f5fdfcfb80066fb75b5"
          }
        ],
        "digest": "380f344df3a675fe322a005235cb66410ea89a58f6adef17d9be83a984704d1e"
      }
    }
  }
}
```

## Notes

- `enabled_packs` — names of installed packs (sorted).
- `installed.<name>.files` — the exact top-level destination paths written for
  that pack; `remove` deletes precisely these.
- `installed.<name>.inventory` — the versioned source identity, manifest hash,
  and per-artifact source/install hashes used to validate removal without a
  local catalog. Ambiguous legacy entries fail closed.
- Installed pack artifacts use the `dude-pack-<name>-*` namespace, which
  `@dude upgrade` preserves across core refreshes.

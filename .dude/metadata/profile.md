# Install Profile

This file records which optional **packs** from `library/packs/` are installed
into this bundle's `.github/`. It is maintained by `dude-compose`
(`@dude add pack <name>` / `@dude remove pack <name>`). Do not hand-edit the
`installed` map — it is the removal manifest.

```json
{
  "enabled_packs": [
    "authoring",
    "coding",
    "design",
    "release",
    "strata",
    "writing"
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
      "installed_at": "2026-07-22T17:51:55.183Z",
      "inventory": {
        "version": 1,
        "pack": "authoring",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/AI/dude/library/packs",
          "ref": ""
        },
        "manifest_sha256": "e5147220696d37022e4308ffb7b0b8bc3c14a23e37166f1c51cac23b000faea0",
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
            "path": ".github/skills/dude-pack-authoring-prompt-conventions",
            "kind": "skills",
            "source": "skills/dude-pack-authoring-prompt-conventions",
            "source_sha256": "79ff7fce82edabee90df9b0d9cd56a7da4ee9a12f3633388b5b8bc720584e816",
            "installed_sha256": "79ff7fce82edabee90df9b0d9cd56a7da4ee9a12f3633388b5b8bc720584e816"
          }
        ],
        "digest": "15e9b9bdff78f8d7b36a5429e8ed3af378943c840651c4e1c323bf4c91745990"
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
      "installed_at": "2026-08-07T00:16:34.862Z",
      "inventory": {
        "version": 1,
        "pack": "coding",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "b189e86cb0c9d537c6da28b38fae9c2db95a6af0ad932b501ae4f5007ee64247",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-coding-architect.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-architect.agent.md",
            "source_sha256": "3da2479a152b89d9c76ce5cc5f65961be65405015a45f9833be04d4c39de9171",
            "installed_sha256": "3da2479a152b89d9c76ce5cc5f65961be65405015a45f9833be04d4c39de9171"
          },
          {
            "path": ".github/agents/dude-pack-coding-coder.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-coder.agent.md",
            "source_sha256": "58fe8d3e501088cd4f9b2f01ba558f90a68f36b3faf1c27e77732b555f0fbafc",
            "installed_sha256": "58fe8d3e501088cd4f9b2f01ba558f90a68f36b3faf1c27e77732b555f0fbafc"
          },
          {
            "path": ".github/agents/dude-pack-coding-reviewer.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-reviewer.agent.md",
            "source_sha256": "e62a452dbe538e16d70be43e85e7910007c15f0e04368286a43691e14a16c820",
            "installed_sha256": "e62a452dbe538e16d70be43e85e7910007c15f0e04368286a43691e14a16c820"
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
        "digest": "c9a4ba8a7985b5dc6debec60a013277c25b3b95c2aaec6a4b70568a4b46f785e"
      }
    },
    "design": {
      "files": [
        ".github/skills/dude-pack-design-workflow"
      ],
      "installed_at": "2026-08-07T11:53:08.315Z",
      "inventory": {
        "version": 1,
        "pack": "design",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "2163bb44a22a8dcb0c6aa9360be9c954ed5c098e168c401302517e0e44545ac1",
        "artifacts": [
          {
            "path": ".github/skills/dude-pack-design-workflow",
            "kind": "skills",
            "source": "skills/dude-pack-design-workflow",
            "source_sha256": "0c6760ad02dbb5f587c1a58d775d2324cc45a17548c2ffcb68b82022f4ec9781",
            "installed_sha256": "0c6760ad02dbb5f587c1a58d775d2324cc45a17548c2ffcb68b82022f4ec9781"
          }
        ],
        "digest": "4c93766a9af7ce46546832777bbbbdcef15d336157b4fc8d2babb6caf2684722"
      }
    },
    "release": {
      "files": [
        ".github/agents/dude-pack-release-manager.agent.md",
        ".github/skills/dude-pack-release-pipeline-parity",
        ".github/skills/dude-pack-release-tag-driven-versioning",
        ".github/skills/dude-pack-release-writeback-via-pr"
      ],
      "installed_at": "2026-08-06T01:33:55.905Z",
      "inventory": {
        "version": 1,
        "pack": "release",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/AI/dude/library/packs",
          "ref": ""
        },
        "manifest_sha256": "c0e8d176fa57743b32e0ef094e2354eab83cab8e75e313480077e8656dfbc465",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-release-manager.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-release-manager.agent.md",
            "source_sha256": "10d50fdbfa2816a36308a767583cff3696eeceac3bc0d726932203018b141099",
            "installed_sha256": "10d50fdbfa2816a36308a767583cff3696eeceac3bc0d726932203018b141099"
          },
          {
            "path": ".github/skills/dude-pack-release-pipeline-parity",
            "kind": "skills",
            "source": "skills/dude-pack-release-pipeline-parity",
            "source_sha256": "53d1d9d01c7094471f310ffaa6cdefa418185f11d7718ba66d368108b5b8f334",
            "installed_sha256": "53d1d9d01c7094471f310ffaa6cdefa418185f11d7718ba66d368108b5b8f334"
          },
          {
            "path": ".github/skills/dude-pack-release-tag-driven-versioning",
            "kind": "skills",
            "source": "skills/dude-pack-release-tag-driven-versioning",
            "source_sha256": "1b0c6c85efe8cf175fbcdf333d5147851386bce930be164256612537d424c6cf",
            "installed_sha256": "1b0c6c85efe8cf175fbcdf333d5147851386bce930be164256612537d424c6cf"
          },
          {
            "path": ".github/skills/dude-pack-release-writeback-via-pr",
            "kind": "skills",
            "source": "skills/dude-pack-release-writeback-via-pr",
            "source_sha256": "83063673153b78d98cce6b137f6bf12140616baf7aa0b9f44d9b10796f89e028",
            "installed_sha256": "83063673153b78d98cce6b137f6bf12140616baf7aa0b9f44d9b10796f89e028"
          }
        ],
        "digest": "63d3028f7069d7ee214ec03557f97bc4f4634509d53f9fffff8832a154938c5a"
      }
    },
    "strata": {
      "files": [
        ".github/agents/dude-pack-strata-stylist.agent.md",
        ".github/instructions/dude-pack-strata-visual-system.instructions.md",
        ".github/prompts/dude-pack-strata-apply-visual-system.prompt.md",
        ".github/skills/dude-pack-strata-visual"
      ],
      "installed_at": "2026-08-07T19:12:22.284Z",
      "inventory": {
        "version": 1,
        "pack": "strata",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "dd12136218d4203160480e056f207ab28dfaff6b0f8cb6642ec06633d06ff150",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-strata-stylist.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-strata-stylist.agent.md",
            "source_sha256": "d1c90a6aa830445437d985d0656b11f927c7fd609cd7270a86bf01c89953d02a",
            "installed_sha256": "d1c90a6aa830445437d985d0656b11f927c7fd609cd7270a86bf01c89953d02a"
          },
          {
            "path": ".github/instructions/dude-pack-strata-visual-system.instructions.md",
            "kind": "instructions",
            "source": "instructions/dude-pack-strata-visual-system.instructions.md",
            "source_sha256": "3fc8e9a31aae4ced9b903c0502d59b2810c2a43849dab780094af6afa888fa1d",
            "installed_sha256": "3fc8e9a31aae4ced9b903c0502d59b2810c2a43849dab780094af6afa888fa1d"
          },
          {
            "path": ".github/prompts/dude-pack-strata-apply-visual-system.prompt.md",
            "kind": "prompts",
            "source": "prompts/dude-pack-strata-apply-visual-system.prompt.md",
            "source_sha256": "919187eef87a88462a475a37f7d71f16d02ad716e2a161a0d4b09306568601e8",
            "installed_sha256": "919187eef87a88462a475a37f7d71f16d02ad716e2a161a0d4b09306568601e8"
          },
          {
            "path": ".github/skills/dude-pack-strata-visual",
            "kind": "skills",
            "source": "skills/dude-pack-strata-visual",
            "source_sha256": "16c8d4c3b4bbc6192221254f1cd8112d2325ccc001a0f9d6eac4681792ef66b9",
            "installed_sha256": "16c8d4c3b4bbc6192221254f1cd8112d2325ccc001a0f9d6eac4681792ef66b9"
          }
        ],
        "digest": "9d7fdd2d33cbe74972f5883dd9b3eedc0a75d6bebbea5e2fd1ef845b8b70e178"
      }
    },
    "writing": {
      "files": [
        ".github/skills/dude-pack-writing-avoid-ai-tropes",
        ".github/skills/dude-pack-writing-style"
      ],
      "installed_at": "2026-08-04T21:42:19.350Z",
      "inventory": {
        "version": 1,
        "pack": "writing",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/AI/dude/library/packs",
          "ref": ""
        },
        "manifest_sha256": "c6be00adc14e56c0d4c9baf8a0b665ee3dbc15e3182a44553e0f118a78eff4a2",
        "artifacts": [
          {
            "path": ".github/skills/dude-pack-writing-avoid-ai-tropes",
            "kind": "skills",
            "source": "skills/dude-pack-writing-avoid-ai-tropes",
            "source_sha256": "be7d89d84dcf1d9bc693b07b2dc7a6f3998372862f723ba7ec18d30ee479ef27",
            "installed_sha256": "be7d89d84dcf1d9bc693b07b2dc7a6f3998372862f723ba7ec18d30ee479ef27"
          },
          {
            "path": ".github/skills/dude-pack-writing-style",
            "kind": "skills",
            "source": "skills/dude-pack-writing-style",
            "source_sha256": "f5a7b532c6c3474db2f145d29df209d382be78cd50926de32b445cb7a9171b42",
            "installed_sha256": "f5a7b532c6c3474db2f145d29df209d382be78cd50926de32b445cb7a9171b42"
          }
        ],
        "digest": "f8d1d1bb27155cb70d87473226afa991053ed19b9ea14e9d8d05c6850f520e7f"
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

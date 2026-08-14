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
      "installed_at": "2026-08-10T20:13:38.584Z",
      "inventory": {
        "version": 1,
        "pack": "authoring",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "e5147220696d37022e4308ffb7b0b8bc3c14a23e37166f1c51cac23b000faea0",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-authoring-agent-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-agent-smith.agent.md",
            "source_sha256": "13352d2377084f6696de412ebb48543a795d17bc606611bb9f5b77703b1e30b1",
            "installed_sha256": "51391def8194887a5561792b3d4168b45a686ee17d6716894e4c2415f2228c00"
          },
          {
            "path": ".github/agents/dude-pack-authoring-instruction-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-instruction-smith.agent.md",
            "source_sha256": "6553d84b36d46035c540caa4eabee217d3945d0dcd4e4df57a6a3a4904101496",
            "installed_sha256": "57d61943a7f648f4d4f877d65b24bca5529d78654fa0d183a5ad4886c0c66fc8"
          },
          {
            "path": ".github/agents/dude-pack-authoring-pack-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-pack-smith.agent.md",
            "source_sha256": "94f4fe8107ca46401fc8afdbbd2d0fa6c657fe26316370323ef9f9ddcddae93e",
            "installed_sha256": "1dcf07afac51c2309761c7c087918b00955e6d2c50666ffc026170d0ac6c63fe"
          },
          {
            "path": ".github/agents/dude-pack-authoring-prompt-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-prompt-smith.agent.md",
            "source_sha256": "d5e2acb6e7ceeacfe084fdab48b2effab73e691e44f43dd0b6e787b549075d34",
            "installed_sha256": "3f1a58cbf7fcb5a0d187f514acb8eb2e48228c18fa872a9608821d8e366c99ed"
          },
          {
            "path": ".github/agents/dude-pack-authoring-skill-smith.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-authoring-skill-smith.agent.md",
            "source_sha256": "70cd445332cecb52e482a3b6c1b0d54fe9e47172f675fa22a8a83d470a0be19a",
            "installed_sha256": "ee4f597a0180405197238b1d5f9162acb77e875bb7010031b6a9629fdf4a1955"
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
        "digest": "7974cff7031692c8214f92af9efa276c092a507f637588b3f6e2c4dbf082740a"
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
      "installed_at": "2026-08-11T18:28:37.076Z",
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
            "source_sha256": "d0eb4334f3f87f757b6caeec513807b074134948f9e2f7ecd4154259b5988fb9",
            "installed_sha256": "a5ccd043bd3738a79dc8286b5050955693fff000796ab9bf254e19b44adb7b4c"
          },
          {
            "path": ".github/agents/dude-pack-coding-coder.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-coder.agent.md",
            "source_sha256": "9d3ca54769b2c5ce174d70ebf1e58c02434a6a4cace1033671bce783276dee55",
            "installed_sha256": "f230af454a4e2f9beb7e119d46449a28e0868f4b47154048b2d71021425e3a2b"
          },
          {
            "path": ".github/agents/dude-pack-coding-reviewer.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-reviewer.agent.md",
            "source_sha256": "fb30fe21b17c6d71fd417706988d4eebc355ff391ec457b6a0d615c039f68a63",
            "installed_sha256": "fa82c9779de7740dc450d91f08e3be26d0336f61d5d2ea4bd42b12456b764dc0"
          },
          {
            "path": ".github/agents/dude-pack-coding-tester.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-coding-tester.agent.md",
            "source_sha256": "208c083ecb7ff5cc20a6cd5dcc312eb5c1d27e6cc905e8e6fb92a880ca1cd534",
            "installed_sha256": "b8c8db76bfa5bb8aa1b00bfcf622c1ec05a4b6cba40e25c970dd7d03f69658b0"
          },
          {
            "path": ".github/skills/dude-pack-coding-spec-artifacts",
            "kind": "skills",
            "source": "skills/dude-pack-coding-spec-artifacts",
            "source_sha256": "c295e92781817c92cf17b63e158f6f2031d1010480a54f5fdfcfb80066fb75b5",
            "installed_sha256": "c295e92781817c92cf17b63e158f6f2031d1010480a54f5fdfcfb80066fb75b5"
          }
        ],
        "digest": "9255dfc4000ba14caf4a6e3cd0d3fa8d52dbf4eda69e9e763085ec1463bcf5e3"
      }
    },
    "design": {
      "files": [
        ".github/skills/dude-pack-design-workflow"
      ],
      "installed_at": "2026-08-14T02:12:03.624Z",
      "inventory": {
        "version": 1,
        "pack": "design",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "d467c55830226f02dd35ad0bb9b35e3b8e9fcebc5ee17c294a6af32f421b46d1",
        "artifacts": [
          {
            "path": ".github/skills/dude-pack-design-workflow",
            "kind": "skills",
            "source": "skills/dude-pack-design-workflow",
            "source_sha256": "3689ed45018b0c186fdf9f5fb50d664bdd2839221e7e363acd47adcf214f8103",
            "installed_sha256": "3689ed45018b0c186fdf9f5fb50d664bdd2839221e7e363acd47adcf214f8103"
          }
        ],
        "digest": "d7bf95e7a9f28a9599fddf5b838e44bca1be36a87250a72aaa486a440a7d9fd4"
      }
    },
    "release": {
      "files": [
        ".github/agents/dude-pack-release-manager.agent.md",
        ".github/skills/dude-pack-release-pipeline-parity",
        ".github/skills/dude-pack-release-tag-driven-versioning",
        ".github/skills/dude-pack-release-writeback-via-pr"
      ],
      "installed_at": "2026-08-10T20:13:38.755Z",
      "inventory": {
        "version": 1,
        "pack": "release",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "c0e8d176fa57743b32e0ef094e2354eab83cab8e75e313480077e8656dfbc465",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-release-manager.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-release-manager.agent.md",
            "source_sha256": "26e666b323c72dcfe751f36c5f1c8fb2c4677b66c45444f1cd8aaaf32ed944f9",
            "installed_sha256": "cec879ab214db2e021797136b12c1d573a2b86973eabee5c0d5f1abb6140e14a"
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
        "digest": "b35f1c8511d596249d7854458eac0da011c39a10385a7e817b83ed0edf46275a"
      }
    },
    "strata": {
      "files": [
        ".github/agents/dude-pack-strata-stylist.agent.md",
        ".github/prompts/dude-pack-strata-apply-visual-system.prompt.md",
        ".github/skills/dude-pack-strata-visual"
      ],
      "installed_at": "2026-08-14T02:12:03.700Z",
      "inventory": {
        "version": 1,
        "pack": "strata",
        "source": {
          "type": "library",
          "location": "/Users/eg/work/copilot-worktrees/dude/e-g-c-issue-3-add-a-topology-first-reset-when-review-r-891391/library/packs",
          "ref": ""
        },
        "manifest_sha256": "892085c187769671eb6fc53678938abba657fa83ce0d8f130fcd315f3c3b6924",
        "artifacts": [
          {
            "path": ".github/agents/dude-pack-strata-stylist.agent.md",
            "kind": "agents",
            "source": "agents/dude-pack-strata-stylist.agent.md",
            "source_sha256": "bf0459a30faaa204119a3e6bbcb42754b5f3cad29c17726295e358be8e8c85a7",
            "installed_sha256": "74d8dff722143009893556396a91ef42ae19d8981c3914a4d356bed709f833c3"
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
            "source_sha256": "a691ccb12e9206c56ba92d935aeb1d985c3cffdb042eb9df4d6b91c4eef19c71",
            "installed_sha256": "a691ccb12e9206c56ba92d935aeb1d985c3cffdb042eb9df4d6b91c4eef19c71"
          }
        ],
        "digest": "8c1879133927338f3014d08ee1ee12e65422bfab202dce1f2bcd758ad335c2cd"
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

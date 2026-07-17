---
name: authoring
description: "Bundle-authoring specialists — expert smiths for creating agents, skills, instructions, prompts, and packs. Dev tooling for building and maintaining Dude bundles."
provides:
  agents: [dude-pack-authoring-agent-smith, dude-pack-authoring-instruction-smith, dude-pack-authoring-pack-smith, dude-pack-authoring-prompt-smith, dude-pack-authoring-skill-smith]
  skills: [dude-pack-authoring-instruction-conventions, dude-pack-authoring-pack-conventions, dude-pack-authoring-prompt-audit, dude-pack-authoring-prompt-conventions]
requires:
  tools: []
hooks: []
---

# Authoring Pack

Specialist smiths for authoring Dude bundle artifacts. This is the pack a
maintainer installs to build and maintain a Dude bundle itself — the generic
core stays lean, while the authoring expertise lives here as an installable
capability.

## Provides

Five focused smiths, each an expert in one artifact type:

- `dude-pack-authoring-agent-smith` — `.agent.md` files (persona, frontmatter,
  tool scoping, coordinator-only boundary block).
- `dude-pack-authoring-skill-smith` — `SKILL.md` files (frontmatter, trigger
  descriptions, procedure structure).
- `dude-pack-authoring-instruction-smith` — `.instructions.md` files (applyTo
  globs, scoped rules).
- `dude-pack-authoring-prompt-smith` — `.prompt.md` files (reusable task prompts).
- `dude-pack-authoring-pack-smith` — packs (`pack.md` manifest, provides/
  requires/hooks, namespacing, compose/release mechanics).
- `dude-pack-authoring-prompt-audit` — deterministic, read-only static source
  footprint audits, optional SHA-pinned tokenizer result data, and strict
  complete-envelope comparisons. Its test suite stays outside the installable
  skill directory.

Backed by convention skills for the artifact types that have no core equivalent:
instruction, prompt, and pack authoring. The agent and skill smiths lean on the
core `dude-team-expansion` and `dude-skill-authoring` skills and their
scaffolders.

## When installed

The coordinator can route artifact-authoring work to the matching smith. The
smiths are dev tooling: they help build bundles, and are not needed by an
end-user consuming a bundle to do project work.

## Install / remove

```bash
@dude add pack authoring
@dude remove pack authoring
```

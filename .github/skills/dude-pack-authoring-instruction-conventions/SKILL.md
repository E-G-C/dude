---
name: dude-pack-authoring-instruction-conventions
description: "Use when authoring a .instructions.md file: choosing applyTo globs, scoping rules to matching files, and avoiding over-broad matches."
argument-hint: "the file globs and rules the instructions should cover"
---

# Instruction Conventions

## Purpose

How to author a `.instructions.md` file: pick the narrowest `applyTo` glob that matches the files the rules should govern, and write rules that are specific and testable.

## Procedure

1. Decide the file scope and express it as an `applyTo` glob (for example `**/*.ts` or `src/**`). Prefer narrow globs; split unrelated rules into separate instruction files.
2. Write the frontmatter: `applyTo` plus a short `description` of what the rules cover.
3. Write the rules as concise, imperative bullets scoped to those files; do not duplicate global conventions that live elsewhere.
4. Verify the glob matches the intended files and nothing broader, then run dude-lint on the bundle.

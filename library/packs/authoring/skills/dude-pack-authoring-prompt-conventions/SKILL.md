---
name: dude-pack-authoring-prompt-conventions
description: "Use when authoring a .prompt.md file: structuring a reusable task prompt with inputs, steps, and expected output."
argument-hint: "the task the prompt should perform"
---

# Prompt Conventions

## Purpose

How to author a `.prompt.md` file: a reusable, parameterized task prompt with a clear objective, defined inputs, and an expected output.

## Procedure

1. For a pack artifact, name the file `dude-pack-<pack>-<slug>.prompt.md`; loose prompt names are project-owned and compose refuses to install or remove them. Project-local prompts use `dude-local-<slug>.prompt.md`. Then state the objective in one line and list the inputs the prompt needs (parameters, files, or a selection).
2. Write the ordered steps the assistant should follow, plus any constraints or non-goals.
3. Define the expected output — what a good result looks like.
4. Keep it reusable: avoid hard-coding one-off, project-specific values, then dry-run the prompt to confirm it behaves.

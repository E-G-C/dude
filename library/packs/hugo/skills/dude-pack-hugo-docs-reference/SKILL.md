---
name: dude-pack-hugo-docs-reference
description: "Portable Hugo reference map and gotchas. Use when answering Hugo questions, verifying commands, checking current template rules, resolving content/config/module behavior, or citing bundled references."
argument-hint: "Hugo topic, command, symptom, or docs question"
---
# Hugo Docs Reference

Use this skill whenever a Hugo answer should be grounded in the portable bundled references instead of memory.

## Procedure

1. Classify the request: command, configuration, content, template, render hook, asset, module, multilingual, deployment, troubleshooting, function, or method.
2. Load the matching topic guidance from the authority map in [authority-map.md](./references/authority-map.md).
3. Check the known gotchas in [gotchas.md](./references/gotchas.md).
4. For specific topics, open the focused reference:
   - Embedded shortcodes (`youtube`, `figure`, `ref`, `details`, `qr`, ...): [embedded-shortcodes.md](./references/embedded-shortcodes.md).
   - Markdown features (syntax highlighting, math, diagrams, TOC, summaries, related content, emoji): [content-features.md](./references/content-features.md).
   - Install, quick start, production build, and hosting: [install-and-host.md](./references/install-and-host.md).
   - Template functions and object methods: use the `dude-pack-hugo-functions-and-methods` skill.
   - Asset processing / Hugo Pipes: use the `dude-pack-hugo-asset-pipeline` skill.
5. Answer with the current bundled behavior guidance and a practical next step.
6. If the bundled references do not cover the answer and additional research or
   diagnostics resolve it, return a knowledge cache candidate for Dude with the
   learning, suggested reference/memory home, source/evidence, confidence, and
   version caveat.
7. For changes in a Hugo site, verify with the narrowest relevant Hugo command.

## Answering Rules

- Prefer bundled references over generic web memory.
- Mention version-sensitive behavior when relevant, especially Hugo v0.146+ template layout changes.
- Use diagnostic commands rather than broad speculation.
- Keep examples minimal and Hugo-native.
- Do not silently leave newly researched Hugo behavior in the chat transcript;
   surface it as a cache candidate so Dude can update the local references when
   it is durable.

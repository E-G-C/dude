---
description: "Answer a Hugo question grounded in the bundled references, citing the references consulted and noting version-sensitive or security-relevant caveats."
name: "Answer Hugo Question"
argument-hint: "A Hugo question about commands, config, content, templates, modules, or deployment"
agent: "Hugo Docs Researcher"
---
Answer this Hugo question:

`$ARGUMENTS`

Ground the answer in the bundled Hugo reference files rather than memory, especially for version-sensitive behavior such as the v0.146+ template system. Then:

1. Classify the question (command, configuration, content, template, render hook, asset, module, multilingual, deployment, function, or method).
2. Read the narrowest relevant bundled reference and prefer current guidance over historical phrasing.
3. Give a direct, practical answer with a minimal Hugo-native example when helpful.
4. List the bundled reference files consulted.
5. Note any version, security, or host-specific caveats.

If a Hugo command would verify the answer, name it.

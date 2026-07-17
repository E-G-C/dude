---
description: "Diagnose and fix Hugo build, server, routing, content, template, asset, module, multilingual, or deployment problems from an error or symptom."
name: "Debug Hugo Site"
argument-hint: "Error output, command run, missing URL, or symptom"
agent: "Hugo Troubleshooter"
---
Diagnose this Hugo problem:

`$ARGUMENTS`

Work from evidence. Collect or inspect the exact command, Hugo version, config, content/front matter, layout files, resources, modules, and generated output only as needed. Use targeted diagnostics such as:

- `hugo list drafts`, `hugo list future`, `hugo list expired`, `hugo list published`
- `hugo build --logLevel debug`
- `hugo build --printPathWarnings`
- `hugo build --printI18nWarnings`
- `hugo build --templateMetrics --templateMetricsHints`
- `hugo config` and `hugo config mounts`
- `hugo mod graph`

Find the root cause, apply the smallest safe fix when possible, verify it, and summarize the cause and prevention.

---
name: hugo-troubleshooting
description: "Diagnose Hugo errors and site issues. Use for build failures, server problems, 404s, missing content, stale public output, template errors, shortcode/render-hook issues, resources, modules, multilingual, or deployment mismatches."
argument-hint: "Error output, command, missing URL, or symptom"
---
# Hugo Troubleshooting

Use this skill to diagnose Hugo symptoms from evidence and apply the smallest safe fix.

## Procedure

1. Record the symptom, command, Hugo version, error output, and whether the issue occurs in `hugo server`, `hugo build`, or deployed output.
2. Classify the symptom using [diagnostic-matrix.md](./references/diagnostic-matrix.md).
3. Inspect the nearest relevant files instead of broad-scanning the whole project.
4. Run only targeted, non-destructive diagnostics.
5. Fix the root cause and verify with the narrowest command that proves it.
6. Explain the cause, the change, and how to prevent recurrence.

## Useful Diagnostics

- `hugo version` or `hugo env`
- `hugo build --logLevel debug`
- `hugo build --printPathWarnings`
- `hugo build --printI18nWarnings`
- `hugo build --templateMetrics --templateMetricsHints`
- `hugo list drafts`
- `hugo list future`
- `hugo list expired`
- `hugo list published`
- `hugo config`
- `hugo config mounts`
- `hugo mod graph`
- `hugo server --poll 700ms`

## Safety Rules

- Do not delete `public` or caches without explaining why.
- Do not edit `_vendor`; override in the project.
- Do not enable unsafe Markdown or inline shortcodes unless the user understands the trust boundary.

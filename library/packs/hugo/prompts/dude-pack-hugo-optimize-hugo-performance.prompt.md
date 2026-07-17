---
description: "Diagnose and improve Hugo build performance using template metrics, caching, partialCached, resource pipeline reuse, and environment-level fixes."
name: "Optimize Hugo Performance"
argument-hint: "Slow command, build time, template metrics output, or large-site symptom"
agent: "Hugo Troubleshooter"
---
Improve build performance for this Hugo site:

`$ARGUMENTS`

Use the bundled troubleshooting and template authoring references. Work from measurements, not guesses:

1. Measure with `hugo build --templateMetrics --templateMetricsHints` and read the cumulative duration and cache-potential columns.
2. Target the templates with the highest cumulative time and the highest cache potential first.
3. Apply `partialCached` with complete variant keys where output is stable per key, and cache stable Hugo Pipes chains.
4. Reduce repeated work: hoist invariant computations out of `range`, avoid loading large data into `site.Data` when page/global/remote resources suffice, and reuse processed resources.
5. Consider environment fixes such as adding the Hugo executable to virus-scanner exclusions.
6. Re-measure to confirm the improvement and report before/after numbers.

Do not sacrifice correctness for speed; verify the site still builds and renders as expected.

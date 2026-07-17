---
name: dude-pack-authoring-prompt-audit
description: "Use when measuring or comparing a deterministic bundle-controlled static prompt/context source footprint proxy."
argument-hint: "a frozen profile manifest and optional SHA-pinned tokenizer result data"
---

# Prompt Audit

## Purpose

Measure and compare an ordered set of bundle-controlled source files without
writing snapshots or claiming to observe host/runtime context.

## Procedure

1. Define ordered release/source profiles, activation assumptions, a separate
	dogfood-guidance inventory, and parity roots in a versioned JSON manifest.
2. Run `prompt-audit.mjs audit --profiles <manifest> --json`. Treat any missing,
	unsafe, unreadable, changing, or parity-failing input as a hard failure. Run
	the audit with the selected lexical anchor itself (the workspace root/base or
	platform first path component) trusted; static symlink descendants below it
	are rejected before canonicalization. Run in a locally controlled workspace
	and resolved source tree without hostile
	concurrent mutation; the dependency-free checks detect observed root,
	ancestor, directory, and file drift but do not promise race-free reads.
3. To include proxy token counts, supply both `--tokenizer-results <results.json>`
	and `--tokenizer-results-sha256 <lowercase-sha256>`. The file is data only and
	must exactly cover every distinct audited path with matching content hashes,
	a single tokenizer name/version/encoding identity, and safe integer counts.
	The audit never imports, evaluates, or spawns tokenizer code.
4. The caller writes the complete success envelope to the one durable checkpoint
	path it owns, such as `docs/context-footprint-snapshots/baseline.json`. Keep
	one terminal LF and record the complete file SHA-256. The audit itself remains
	stdout-only and never writes a snapshot, cache, or state ledger.
5. Run `prompt-audit.mjs compare --baseline <audit.json> --current
	<audit.json> --json`. Comparison rejects profile definition, membership,
	order, manifest-hash, prerequisite, exact-schema, arithmetic, unchanged-count,
	and tokenizer-identity drift. Inputs must be complete successful audit
	envelopes, not bare reports or failure payloads.
6. Report Unicode code points and UTF-8 bytes as a deterministic static source
	footprint proxy. When no tokenizer result file is supplied, report tokenizer
	status as unavailable and keep every token field `null`.

## Claim Boundary

The result does not identify actual host prompt membership, active runtime
context, or runtime token use. Those claims require a host trace or equivalent
capture. Externally produced token counts remain static-source proxy data. The
tool does not perform semantic duplicate detection and does not claim safety
against hostile transient hierarchy replacement.

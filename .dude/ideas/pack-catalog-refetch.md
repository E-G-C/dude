---
title: Pack Catalog Re-fetch
slug: pack-catalog-refetch
status: defined
spec_path: .dude/specs/035-pack-catalog-refetch/spec.md
---

# Idea: Pack Catalog Re-fetch

## Idea

A published pack fix should actually reach a consumer's next update. Today it
may not, because a fetched catalog can be reused for as long as its cache
directory remains. I just want to "go to GitHub, grab the latest pack, and bring
it down." This is a publisher-to-consumer correctness defect through GitHub,
not a request for a new distribution system.

## Open Questions

### Q1: May pack fetching rely on an upstream policy that published tags never move, or must every non-SHA ref be treated as mutable?

**Your answer:** Every remote ref other than a SHA is mutable, including tags.

### Q2: For a ref that can move, should every invocation re-fetch, update the existing clone, or use a short freshness window?

**Your answer:** Every remote catalog-consuming operation must obtain current
upstream bytes on every invocation. Use no TTL, freshness database, registry, or
persistent cache metadata.

### Q3: Should `add` and `refresh` show the resolved concrete commit so “which revision did I just install?” is answerable without new persistent state?

**Your answer:** No. Do not add revision display or persistent pack identity;
`simplify-pack-updates` owns identity.

### Q4: If a required re-fetch fails or the consumer is offline, should the command use cached bytes with a clear warning or refuse?

**Your answer:** Refuse clearly and never report success from potentially stale
cached bytes.

## Established Evidence

- `resolveSourceTree` shallow-clones remote source into
  `os.tmpdir()/dude-compose-cache`, keyed by `source|resolvedRef`, and reuses the
  clone whenever its `.git` directory exists. The threaded refresh option is
  never enabled by current callers.
- Cache reuse therefore lasts as long as that directory remains. The code has
  no expiry, and OS cleanup of a temp directory is not guaranteed.
- A branch ref can move while retaining the same cache key, so `add` or
  `refresh` can re-project stale bytes and report success.
- `latest` is resolved to the highest stable release tag before keying the
  cache; a newly named release tag gets a new key. A SHA identifies immutable
  Git object content, but a tag is a mutable ref. Reusing a concrete-tag cache
  is safe only under an upstream policy that published tags never move.
- `resolvePackDir` gives the target pack's local
  `library/packs/<name>/pack.md` precedence and ignores source/ref flags when it
  exists. If that target pack is absent locally, remote resolution participates
  even when other packs or the rest of `library/` are present.
- For a missing local target with fetching enabled, explicit `--source` and
  `--ref` values participate. With no explicit source, the manifest supplies
  the repository and, unless `--ref` was given, its ref. `compose list`
  separately keeps whole-local-catalog precedence whenever `library/packs/`
  exists.
- This source/dogfood repository's six installed packs all have local target
  directories, so its `source_ref: main` manifest does not expose those local
  refreshes to this cache defect. The exposed path is a remote consumer whose
  target pack is absent locally.

## Assumptions

- Brainstorm intake only; no definition package, no implementation.
- Local target-pack and local-catalog precedence remain unchanged.
- No TTL, freshness database, registry, config file, or persistent cache
  metadata is needed.
- Git remains required for remote sources, as today.
- This is the freshness half of the split from `simplify-pack-updates`, which
  owns persistent pack identity and bookkeeping simplification. Neither reopens
  Feature 031.

<!-- dude:managed:start -->
## Normalized Intent

- Make a published pack correction reachable on a consumer's next update
  instead of silently re-projecting bytes from an earlier remote checkout.
- Treat every remote ref other than a SHA as mutable, including a concrete tag,
  while requiring every remote catalog-consuming `list`, `add`, or `refresh`
  invocation to obtain current upstream bytes even when a full SHA was requested.
- Preserve whole-local-catalog precedence for `list` and local target-pack
  precedence for `add` and `refresh`. A missing local target may still use the
  remote catalog when other local packs or other `library/` content exists.
- For remote resolution, preserve explicit `--source` and `--ref` authority.
  With no explicit source, use the manifest repository and, unless `--ref` is
  explicit, its ref. With an explicit source and no explicit ref, preserve the
  existing `main` default. Continue to honor local-only `--no-fetch` behavior.
- Preserve pack opt-in, namespace, ownership, and release-channel selection
  behavior; freshness changes only how the selected remote catalog is obtained.
- Re-resolve moving release selectors such as `latest` on every remote
  invocation, and do not assume a concrete published tag is immutable.
- If current upstream bytes cannot be obtained, including while offline,
  clearly refuse instead of reporting stale or empty success from an earlier
  checkout.
- Add neither revision display nor persistent pack identity. Keep freshness
  separate from the identity and bookkeeping simplification owned by
  `simplify-pack-updates`, and do not reopen Feature 031.

## Constraints

- Add no TTL, freshness database, registry, persistent cache metadata, cache
  format, config surface, daemon, scheduler, workflow lane, or distribution
  infrastructure.
- Do not change local target-pack or local-catalog precedence.
- Do not exempt any remote ref, including a full SHA, from per-invocation
  fetching. A full SHA remains an immutable content selector, not permission to
  reuse an earlier checkout.
- Do not add revision display or persistent pack identity; that scope belongs to
  `simplify-pack-updates`.
- Do not report remote success when current upstream bytes were not obtained.
- Do not weaken pack opt-in, namespace, ownership, or release-channel behavior.
- Preserve Feature 031's installed-side authority, source staging, destination
  diff, profile update, and all-or-restored refresh transaction.

## Definition Checklist

- [x] Every remote invocation fetches again, including an exact full SHA, while
  every non-SHA ref, including a concrete tag, is treated as mutable
- [x] Remote `list`, `add`, and `refresh` freshness is independently testable
- [x] Local precedence, explicit source/ref authority, manifest fallback, and
  local-only behavior are preserved
- [x] Moving release selectors and remote failures are covered
- [x] Feature 031 transaction boundaries and `simplify-pack-updates` identity
  scope remain unchanged
- [x] The technology-agnostic specification has no unresolved clarification
- [x] The implementation plan and four canonical tasks cover the smallest
  current source and test surfaces while preserving execution state

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
- 2026-08-14 UTC - brainstorm rerun incorporated accepted freshness answers
- 2026-08-14 UTC - first definition -> .dude/specs/035-pack-catalog-refetch/spec.md
- 2026-08-14 UTC - definition reconciled -> .dude/specs/035-pack-catalog-refetch/spec.md
- 2026-08-14 UTC - definition reconciled -> .dude/specs/035-pack-catalog-refetch/spec.md
- 2026-08-14 UTC - T001@66726573 claimed for implementation
- 2026-08-14 UTC - T001@66726573 closed after targeted verification
- 2026-08-14 UTC - T002@72656772 claimed for regression coverage
- 2026-08-14 UTC - T002@72656772 closed after targeted verification
- 2026-08-14 UTC - T003@67617465 claimed for integrated validation
- 2026-08-14 UTC - T003@67617465 closed after full bundle gates
- 2026-08-14 UTC - T004@72657677 claimed for independent review
- 2026-08-14 UTC - T002@72656772 reopened after review found two uncovered precedence cases
- 2026-08-14 UTC - T003@67617465 reset pending refreshed evidence
- 2026-08-14 UTC - T004@72657677 reset pending refreshed approval
- 2026-08-14 UTC - T002@72656772 reclosed after focused precedence verification
- 2026-08-14 UTC - T003@67617465 reclaimed for refreshed integrated validation
- 2026-08-14 UTC - T003@67617465 reclosed after refreshed full bundle gates
- 2026-08-14 UTC - T004@72657677 reclaimed for independent re-review
- 2026-08-14 UTC - T004@72657677 closed after independent review approved the final diff
- 2026-08-14 UTC - feature closed after all canonical tasks, full bundle gates, and independent approval completed
<!-- dude:managed:end -->

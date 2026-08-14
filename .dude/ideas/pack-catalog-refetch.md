---
title: Pack Catalog Re-fetch
slug: pack-catalog-refetch
status: draft
spec_path:
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

**Your answer:** _Pending._

### Q2: For a ref that can move, should every invocation re-fetch, update the existing clone, or use a short freshness window?

**Your answer:** _Pending._

### Q3: Should `add` and `refresh` show the resolved concrete commit so “which revision did I just install?” is answerable without new persistent state?

**Your answer:** _Pending._

### Q4: If a required re-fetch fails or the consumer is offline, should the command use cached bytes with a clear warning or refuse?

**Your answer:** _Pending._

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
- No new registry, config file, or persistent freshness state is needed.
- Git remains required for remote sources, as today.
- This is the freshness half of the split from `simplify-pack-updates`, which
  owns bookkeeping simplification. Neither reopens Feature 031.

<!-- dude:managed:start -->
## Normalized Intent

- Make a published pack correction reachable on a consumer's next update
  instead of silently re-projecting stale cached bytes for a moving ref.
- Apply the smallest freshness correction to refs that can move, without
  assuming temp-cache cleanup or treating tags as immutable Git objects.
- Preserve local target-pack precedence. For remote resolution, retain explicit
  flags with the manifest pin as fallback authority.
- Decide whether published-tag policy permits tag-cache reuse, how remote cache
  refresh works, what offline failure does, and whether commands show the
  resolved commit without adding state.
- Keep freshness separate from the bookkeeping simplification owned by
  `simplify-pack-updates`, and do not reopen Feature 031.

## Constraints

- Add no registry, cache format, config surface, daemon, scheduler, or workflow
  lane.
- Do not change local target-pack or local-catalog precedence.
- Do not describe a concrete tag as immutable without a non-moving published-tag
  policy.
- Do not weaken pack namespace, ownership, or opt-in semantics.
- Keep this as brainstorm-only scope; create no definition package and perform
  no implementation.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Cache lifetime, ref mutability, and source-resolution precedence are
  stated accurately
- [x] The exposed remote-consumer path is distinguished from local dogfood
- [x] Boundaries against new state or distribution machinery are explicit
- [x] Relationship to `simplify-pack-updates` and Feature 031 is explicit
- [ ] Resolve tag policy, re-fetch strategy, offline behavior, and revision
  output before definition

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
<!-- dude:managed:end -->

# Dude Context

Durable domain knowledge, project facts, and important background context.

## Entries

- This repository's primary deliverable is the Dude bundle itself. `src/` holds the product core source and is the edit surface; `.github/` is the built, committed dev bundle (dogfood) — run `node scripts/build-dev.mjs` after editing `src/` to rebuild it, and do not hand-edit `.github/` core files. `library/packs/` is the pack catalog and `scripts/` holds build tooling.
- Release bundles are produced by `scripts/build-release.mjs` into `dist/` and ship the core tier only: they exclude `library/` (packs) and all `*.test.mjs`, and emit a generic `project` skill stub plus a seeded `bundle-manifest.md` (slim schema `source_repo`/`source_ref`/`installed_ref`; releases seed `source_ref: latest` + `installed_ref: <tag>`). Only `bundle-manifest.md` and `profile.md` ship under `.github/dudestuff/`; dev memory (decisions/context/lessons) is not shipped.
- Empty or missing `brief/` and `specs/` directories are valid; feature directories are created when definition work starts.
- Beads commands should use `--json` whenever output will be parsed or used for coordination.

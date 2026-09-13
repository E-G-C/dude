---
title: Backlog Canvas
slug: backlog-canvas
status: resolved
spec_path:
---

# Idea: Backlog Canvas

## Idea

I also want a Copilot app canvas extension carrying the same information, sitting alongside the generated markdown and the offline HTML report. The official guide is at https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions.

For now, the same information. The canvas starts by showing what the report already shows rather than growing content of its own.

This was split out of the `backlog-report` idea, which carries the `focus` to `backlog` rename, the generated markdown file, and the offline HTML report. The canvas is a third surface over that feature's bucket derivation and HTML renderer, so `backlog-report` has to ship first.

That dependency is deliberately not in this ledger's frontmatter. The shipped first-definition publisher validates only the four owner keys `title`, `slug`, `status`, and `spec_path`, and rejects anything else, so a draft carrying `depends-on:` cannot be first-defined. `depends-on: backlog-report` is added to this ledger's frontmatter after it is first defined.

### Superseded

This idea is resolved as superseded by `052-dude-canvas-ui`. Its backlog-canvas
intent is absorbed there, and its still-load-bearing verified findings were
carried across before this ledger was resolved.

### Coordinator findings on the canvas extension

The SDK contract was read directly and the repository was probed with a real build and lint run, so the following is verified rather than assumed. Nothing from the probe is committed.

What a canvas extension actually is:

- The Copilot SDK is installed locally, and its canvas contract was read from `canvas.d.ts`. A canvas extension is an ordinary Copilot CLI extension: one `extension.mjs` ES module calling `joinSession({ canvases: [createCanvas({ id, displayName, description, open, actions, onClose })] })`. The entry file must be named exactly `extension.mjs`, TypeScript is not supported, and the SDK import resolves automatically, so no `package.json` is added.
- The canvas `open()` returns a loopback URL that the host renders in an iframe. There is no privileged bridge, so the extension serves its own HTML from a `127.0.0.1` server on an OS-assigned port. The official guide lists "agentic kanban boards" as an example use case, which is this feature.
- Once the HTML report exists, the canvas is close to free architecturally: the iframe can serve the very same generated HTML. One bucket derivation feeds one HTML renderer, which feeds three surfaces: the markdown file, the standalone offline HTML file, and the canvas panel. The canvas becomes wiring rather than a fourth rendering path.
- Scope for the extension is project scope, `.github/extensions/<name>/extension.mjs`, committed with the bundle, because it should ship to everyone who installs the bundle. The alternatives are user scope and session scope, both local, and neither travels with the bundle.

Repository integration, probed by creating a throwaway extension directory and running the real pipeline:

- `.github/extensions/` survives `node scripts/build-dev.mjs`. The dev build manages only `.github/agents`, `.github/skills`, and `.github/instructions`, so it neither generates nor deletes an extensions directory.
- `node .github/skills/dude-lint/lint.mjs .` reported zero warnings and zero failures with the extension directory present.
- The release build does not ship it. `node scripts/build-release.mjs` staged only `agents`, `instructions`, and `skills` under `.github/`, so a canvas extension committed at `.github/extensions/` would work when dogfooding this repository but would never reach a user who installs the bundle from a release. Shipping the canvas therefore requires extending the release packaging, which is a deliberate change to release scope rather than an incidental one.
- The probe directory was removed after the check; nothing was left behind.

Constraints to carry into definition:

- `stdout` is reserved for JSON-RPC in an extension process, so `console.log` corrupts the protocol. User-visible messaging goes through `session.log`.
- The embedded HTTP server must bind to loopback only, because the host embeds only loopback URLs.
- `open()` must be idempotent. The same instance may be opened again after a provider reconnect or an extensions reload, so durable state is keyed by a stable domain identity rather than by the transient panel instance identifier. Here the natural durable identity is the repository itself and its `.dude/` state, so the canvas holds no state of its own and simply re-derives.
- Canvas types are marked experimental in the SDK and may change in future releases.
- The current working session lacks the extension management and canvas RPC tools. The extension can be authored here, but it cannot be scaffolded or driven through the validation checklist in this session; that validation happens after an app reload.

## Open Questions

1. Does the canvas extension ship inside `backlog-report`, or as a follow-up? It depends on the HTML renderer existing first, so it cannot be built before that part lands.
   Answer: This is the follow-up feature; `backlog-report` ships first because the canvas reuses its HTML renderer.
2. Is release packaging extended to include `.github/extensions/` so the canvas reaches users who install a release, and does that packaging change belong to this feature or to a separate release-scope change?
   Answer: Extend release packaging to include `.github/extensions/`, kept as its own small change because it alters release scope.
3. Does the canvas serve the identical generated HTML, or a variant tuned for a narrow side panel?
   Answer: Serve the same generated HTML; add panel-tuned styling only if the narrow side panel actually renders poorly.
4. What is the canvas named, and what is its `canvasId`?
   Answer: Extension `dude-backlog`, canvas id `backlog`.
5. Does the canvas expose any agent-invocable actions, such as refresh, or is it purely a read-only view for now?
   Answer: Read-only for now, plus a single `refresh` action.
6. How does the canvas stay current while it is open, given that the underlying repository state changes as work proceeds?
   Answer: Re-derive on open and on `refresh`; no file watching or live push until it is actually missed.
7. The existing constraint is that no server or daemon is involved anywhere, and the canvas needs a loopback HTTP server to serve its iframe. Does the no-server constraint cover only generating and opening the two files, or does it also rule out the canvas's loopback server?
   Answer: Scope the constraint rather than deleting it: generating and opening the two files involves no server at all, while the canvas panel runs a loopback server only for as long as the panel is open, owned by the extension process the app already manages.

## Assumptions

These are the coordinator's working assumptions, not user decisions. Correct any that are wrong.

- Assumption: the canvas is a third surface over the same bucket derivation, not a new data source. It shows what the report shows and reads nothing the report does not already read.
- Assumption: the canvas holds no durable state of its own and re-derives from the repository, so closing the panel or reloading extensions loses nothing.
- Assumption: the canvas stays read-only, consistent with the read-only guarantee already on the status surface. The `refresh` action re-derives and writes nothing.
- Assumption: because the SDK marks canvas types experimental, some churn against future SDK releases is expected and is an accepted cost rather than a surprise.

<!-- dude:managed:start -->
## Normalized Intent

- Add a Copilot app canvas extension as a third surface carrying the same information as the `backlog-report` markdown file and offline HTML report, following the official canvas extensions guide.
- Ship after `backlog-report`. The canvas reuses that feature's bucket derivation and HTML renderer, so it cannot be built before that lands.
- Keep the dependency out of frontmatter until first definition. The publisher validates only `title`, `slug`, `status`, and `spec_path`, so `depends-on: backlog-report` is added to this ledger's frontmatter only after it is first defined.
- Feed the canvas from the existing single bucket derivation and single HTML renderer, so the canvas is wiring over that pipeline rather than a fourth rendering path.
- Serve the identical generated HTML, and add panel-tuned styling only if the narrow side panel actually renders poorly.
- Author the extension at project scope, `.github/extensions/dude-backlog/extension.mjs`, committed with the bundle so it reaches everyone who installs it rather than living on one machine.
- Name the extension `dude-backlog` and the canvas `backlog`.
- Serve the canvas from a loopback HTTP server whose URL the host renders in an iframe, with the canvas holding no state of its own and re-deriving from the repository and its `.dude/` state on every open.
- Expose one agent-invocable `refresh` action alongside the read-only view, and stay current by re-deriving on open and on `refresh` rather than by watching files or pushing live updates.
- Extend release packaging to cover `.github/extensions/` as its own small change, because the release build stages only `agents`, `instructions`, and `skills` today, so the canvas would not reach a user installing a release.
- Scope the no-server rule rather than dropping it: generating and opening the two files involves no server, while the canvas runs a loopback server only while the panel is open, inside the extension process the app already manages.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Do not start this feature before `backlog-report` ships its HTML renderer.
- Do not add `depends-on:` to this ledger's frontmatter before first definition. The publisher rejects any key outside `title`, `slug`, `status`, and `spec_path`, so a draft carrying it cannot be first-defined.
- Bind the canvas HTTP server to loopback only. The host embeds only loopback URLs.
- Run the loopback server only while the panel is open, inside the extension process the app already manages. Add no daemon and no background service.
- Never write to `stdout` from the extension process. `stdout` carries JSON-RPC, and `console.log` corrupts the protocol; use `session.log` for user-visible messaging.
- Name the extension entry file exactly `extension.mjs` and keep it JavaScript. TypeScript is not supported, and the SDK import resolves without a `package.json`.
- Keep `open()` idempotent, and key any durable state to the repository rather than to the transient panel instance identifier, since a provider reconnect or an extensions reload can reopen the same instance.
- Add no second rendering path. The canvas serves the report's generated HTML.
- Do not treat the canvas as a second data source or as a place to grow content beyond what the report already carries.
- Do not claim the canvas ships to bundle users until release packaging covers `.github/extensions/`. That is a deliberate change to release scope, not an incidental one.
- Do not claim the canvas has been validated in this session. The extension management and canvas RPC tools are unavailable here, so the validation checklist runs after an app reload.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Dependency on `backlog-report`, and when `depends-on:` may enter frontmatter, is recorded
- [x] Shipping order relative to `backlog-report` is decided
- [x] Identical HTML versus a panel-tuned variant is decided
- [x] Extension name and `canvasId` are selected
- [x] Canvas actions are decided
- [x] How the canvas stays current while open is decided
- [x] Release packaging scope for `.github/extensions/`, and where that change belongs, is decided
- [x] Reach of the no-server constraint over the canvas loopback server is decided
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-07 UTC - brainstorm captured (split from backlog-report)
- 2026-08-31 UTC - brainstorm resolved this package-less ledger as superseded by `.dude/ideas/052-dude-canvas-ui.md` after its intent and still-load-bearing verified findings were carried there
<!-- dude:managed:end -->

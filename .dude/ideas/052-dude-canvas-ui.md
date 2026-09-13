---
title: Dude Canvas UI
slug: dude-canvas-ui
status: defined
spec_path: .dude/specs/052-dude-canvas-ui/spec.md
---

# Idea: Dude Canvas UI

## Idea

### Authoritative CURRENT feature boundary — 052 ships I1

This accepted boundary supersedes the broad original scope only as the
completion boundary for lifecycle 052. It does not delete the original brief or
later user intent. The full brief and capability inventory below remain
preserved as long-term product direction and source material for the Dude
canvas. Capabilities deferred here are not 052 acceptance criteria and must not
become tasks required to close 052.

> 052 is complete when a user can open the Dude canvas, select a feature, and see its authoritative stage, next step, blockers, unanswered-question count, and freshness without running a command or reading raw files.

#### Included in 052

- **I0 — internal plumbing only.** I0 is technical spike and plumbing work
  inside 052. It may produce internal technical tasks needed to deliver I1, but
  it is not a release, product increment, or separately accepted user outcome.
- **I1 — the shipped outcome.** 052 ships the read-only **Now cockpit** for one
  selected feature. It shows authoritative stage, next step, blockers,
  unanswered-question count, and honest freshness without requiring a command
  or raw-file reading. It performs no Dude workflow action.
- **Required repository states.** Empty, partial, conflicting, and
  large-repository states are acceptance cases for the cockpit.
- **Visual-system decision.** The Clearline-versus-Strata comparison uses
  mockups of the accepted Now-cockpit surface and remains part of 052.
- **Standard release.** The Dude canvas must be included in the standard Dude
  release bundle before 052 closes.
- **Real dogfooding.** The Now cockpit must be dogfooded against this repository
  before 052 closes.

#### Deferred from 052

- **I2:** the Needs-you queue.
- **I3:** answering questions in the UI.
- **I4:** running Dude commands from the UI.
- **I5:** copied Sharpie visual review and its round trip.
- **Other later surfaces:** artifact editing, backlog UI, and Team and Packs UI.

I2 through I5 each becomes a later feature-level cycle only after the preceding
feature has been dogfooded. The other deferred surfaces likewise become later
feature-level cycles informed by real dogfooding rather than tasks required to
close 052. Do not pre-create those later ledgers now. Earlier statements that
place these capabilities inside "this feature" remain preserved as broader
Dude-canvas product direction, but are superseded as statements of 052
completion scope. Any retained open question about a deferred capability is
roadmap source material and does not expand this boundary.

#### D1–D3 under the current boundary

D1, D2, and D3 still gate all UI code for 052. The implementation decisions and
acceptance criteria derived from them must, however, be bounded to the accepted
Now-cockpit outcome above. Their full capability inventory, disclosure model,
and broader information architecture remain useful roadmap and reference
material for later feature cycles; they do not make the deferred surfaces
required for 052 completion.

#### Independent-review disposition

- **Accepted and resolved:** The independent review's scope-boundary red flag
  in blocking finding 1 is resolved by narrowing 052 to I1, with I0 retained
  only as internal technical work.
- **Overall rejection not resolved:** This decision does not resolve the
  review's overall rejection. The other findings remain with their existing
  dispositions.

### Accepted product direction — a task-specific graphical layer over the active agent session

> "By the way, another clarifying element. I'm looking to replace the most of the iteration with the agent’s chat itself . So the Canvas UI should send the message to the agent and receive back the answer and the response. And then we're gonna display back to the user in the most user-friendly way. So I would like to step away from the chat interface as much as I can and instead create a layer of abstraction on the UI for the user using the most approapiated visial components/elements."

> "It was never meant to be just a dashboard."

#### Framing correction

- This is a correction to the coordinator's characterization, not new product
  intent. The canvas was always intended as the primary task-specific interaction
  layer over the active agent session.
- The read-only Now cockpit is only the deliberately bounded **first feature
  cycle** used to establish projection, navigation, visual language, packaging,
  and dogfooding. It is not a characterization of the product or its ceiling.
- The user's original mission and later interaction-layer clarification remain
  the controlling product direction: the first cycle is read-only, while the
  product vision has always been interactive.

#### Central product direction

- The Dude canvas is the primary task-specific graphical interaction layer over
  the **same active Copilot agent session**, intended to replace most routine
  chat interaction.
- UI controls send the appropriate prompt, message, or command into the agent
  session. The canvas receives the agent result and represents it with the
  component best suited to the job rather than dumping raw chat prose.
- Open questions become question cards and answer controls; approvals become
  explicit choices with impact; blockers become reason cards; progress becomes
  an activity stepper; diffs become change summaries; review findings become
  actionable issue rows; and commands become labelled actions with exact
  command equivalents.
- The aim is to step away from the chat interface as much as practical, not to
  reproduce a chat box inside the canvas.
- Chat remains a necessary high-ceiling fallback for novel, ambiguous,
  unsupported, diagnostic, or expert interactions that do not yet have a
  purpose-built component. The UI must never trap the user or hide the exact
  command or message sent.

#### Verified technical basis

- A canvas extension joins the **same active Copilot session** through
  `joinSession(...)`; it does not create a parallel agent or second workflow
  system.
- The returned session exposes `session.send`, `session.sendAndWait`,
  `session.abort`, `session.on`, `session.log`, and RPC access.
- The copied Sharpie code already proves iframe-to-agent submission: its iframe
  POSTs to a loopback endpoint, `extension.mjs` stores the report, then line 343
  calls
  `await session.send({ prompt: buildPromptMarkdown(stored), attachments })`.
- `session.send(...)` is appropriate for asynchronous submission when no
  immediate return payload is needed. `sendAndWait(...)` is available when the
  UI needs the completed agent response before rendering the next component
  state.
- The installed SDK runtime at `index.js:8915-8929` verifies that the joined
  session exposes `session.abort()` to abort the current agent turn. Stop/cancel
  is therefore technically supported rather than an unknown capability.
- The iframe has no privileged bridge. User actions POST to the extension's
  loopback HTTP endpoint. The extension can stream status and state to the
  iframe through Server-Sent Events at `/events`, which the canvas authoring
  contract recommends as simpler than websockets.
- The round trip is therefore technically supported, not speculative:
  **UI → loopback HTTP → extension → active agent session → agent
  response/events → extension → SSE/HTTP → UI**.

#### State and authority contract

- The agent response is **not** a second source of truth, and the canvas must
  not infer durable workflow state solely from free-form response text.
- Read-only projection may read authoritative project sources directly.
- Workflow mutations go through the agent/coordinator session so existing
  ownership, safety, definition, execution, review, and close rules remain
  intact. The canvas does not bypass those authorities by editing protected
  fields itself.
- After an agent turn completes, the canvas re-reads authoritative sources and
  renders the confirmed result. There is no optimistic completion, task state,
  approval, or close state.
- The response may supply user-facing narrative, explanations, or errors, but
  durable state comes from the relevant authoritative files or tracked system.
- Every agent-backed UI action makes its exact command or message discoverable
  and copyable, preserving the brief's “UI teaches the CLI” rule.

#### Settled answer-writing direction

- The user's clarification chooses agent-mediated interaction over direct
  ledger mutation for routine UI iteration.
- Question-answer controls send the answer to the active agent session as an
  explicit brainstorm/answer operation. The agent applies it under the existing
  explicit brainstorm authority, refreshes dependent assumptions and logging as
  appropriate, and the UI reloads the ledger after completion.
- The iframe does **not** write `Answer:` directly. Although answer content is
  user-owned, direct writes would bypass the desired agent interaction layer and
  would not refresh dependent artifacts or lifecycle history.
- This settles the former deferred answer-writing question as a future
  constraint. It is no longer an unresolved question.

#### Control-plane acceptance concerns for later action-bearing increments

These are future acceptance concerns for action-bearing increments, not a new
architecture:

- Prevent duplicate sends across reload, reconnect, and retry; one user
  activation maps to one agent turn.
- Distinguish queued, agent-working, agent-blocked, completed, failed, and
  disconnected states with text, icon, and shape, not colour alone.
- Preserve the action and user input locally while a send is in flight so
  reconnect does not silently lose it.
- Reconcile from disk after completion and expose conflicts rather than
  overwriting external edits.
- Use the SDK's verified `session.abort()` support for stop/cancel. A later
  interactive feature still must validate the user experience and authoritative
  state reconciliation after abort, but it does not need to invent cancellation
  infrastructure.
- Never parse arbitrary assistant prose as a hidden state protocol. D1–D3 and
  specification should identify which interactions can be derived from files,
  which use returned narrative, and whether any future structured response
  contract is actually needed.

#### Boundary impact — 052

- This does NOT reopen 052's accepted I1 boundary. I1 remains the read-only
  Now cockpit.
- The product direction governs the architecture and later action-bearing
  feature cycles (Needs You, answer, commands, Review).
- I0 inside 052 should include the smallest technical proof needed to avoid
  painting the extension into a corner: prove one canvas-originated message can
  reach the active session and one completed response can be surfaced back to a
  test UI endpoint/component without duplicating a turn on refresh. This proof
  is internal technical work, not a user-visible I1 capability or independent
  release.
- Do not add command execution or mutation to I1 acceptance criteria.
- The detailed interaction and output mapping belongs in D1–D3 and later
  feature definition, not in new questions added by this refresh.

#### Current-requirement reconciliation

- Older prose recommending direct `Answer:`-slot edits is preserved as design
  history but superseded by the settled agent-mediated answer-writing direction
  above.
- Older wording that conditionally recommended reducing the product to a status
  lens and command launcher, or contrasted the Now cycle with a dashboard, is
  preserved design history rather than accepted product framing. The user's
  original mission was always an interactive task-specific layer. The verified
  same-session round trip and `session.abort()` remove the speculative send,
  receive, and cancellation-infrastructure concerns; duplicate-send resistance,
  abort experience, and post-abort state reconciliation remain later acceptance
  concerns.
- The read-only Now cockpit remains the 052 completion boundary, while the
  accepted long-term product direction is a purpose-built graphical interaction
  layer over the active agent session.

### Accepted intent — Sharpie is copied into this feature

> "sharpie code will be repurposed here but not modified in it's repo, Sharpie would"

> "i mean copied and made part of the UI"

> "sharpie is my own code"

> "except the depencies obviosuly"

> "you bring in Sharpie's code and forget about it. Yuo can modified the copied code as needed."

> "Now the constraint yet referring only related to the PDF, can the PDFs be installed on demand or reimplemented in a more user friendly way? What the challenge?"

- **Settled decision:** Copy Sharpie's working source code into this feature so
  it becomes part of the Dude canvas UI. The user wrote and owns the Sharpie
  code; this is reuse of their own code, not third-party adoption. The copied
  code is adopted outright, owned here, and freely modifiable as needed. Leave
  Sharpie's own repository untouched and establish no ongoing relationship with
  it: do not sync, rebase, track upstream, port Dude changes back, or try to keep
  the copies aligned. Whether Sharpie continues as a standalone product is
  irrelevant to this feature and explicitly out of scope. Third-party
  dependencies remain separate.
- **Supersession notice:** The original brief below is preserved verbatim as
  historical user prose. This accepted decision overrides its earlier framing
  wherever Sharpie is treated as a separate component or separately installed
  extension:
    - §2.7, "Decide how Sharpie ships," is answered. Sharpie is not a Dude pack,
    not a core dependency, and not standalone-and-detected; its code is copied
    into this feature. The related split question is also answered: Sharpie
    distribution is not a separate feature, and the harness extension lives in
    this repository.
    - The §2 preamble and §2.1 framing that Sharpie separately "owns the
    interaction layer" is superseded. The copied source becomes in-house source
    inside this feature rather than a separate product being integrated.
    - §2.2's "two-canvas handoff contract" is substantially changed. Separate
    canvases may still be registered, but there is no cross-extension
    coordination between independently installed extensions and no separately
    installed Sharpie that can clobber or orphan the harness panel.
    - §9's "Degrade gracefully without Sharpie" requirement is moot. The copied
    annotation capability is always present, eliminating the Sharpie-absent,
    detection, degraded, empty, and unavailable states.
    - §9's instruction to propose an action on Sharpie rather than copy its
    behavior is superseded. Copying is now the chosen strategy. The previously
    recorded annotation-location change is an ordinary in-house change with no
    upstream proposal or coordination with the Sharpie repository.
    - §11's prohibition on rebuilding annotation, markup, screenshot, device
    preview, or visual-diff capability survives in spirit: copy the working
    implementation; do not rewrite it from scratch.
- The following parts of the brief survive unchanged:
    - §2.5 is stronger, not weaker. Because the same code is copied, Sharpie's
    single-letter tool keys, `Esc` to select, `\` panel toggle, `Ctrl+Enter` to
    send, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, tool persistence, and
    never-overwrite-existing-files behavior come across intact by construction.
    - §2.3's return path—where a submission lands in Dude—remains an open design
    decision.
    - §2.6's blank artboard as a brainstorm and definition design input still
    applies.
    - Selector-anchored semantic output is preserved because the capture code
    comes across as-is.
- **Adoption context:** The copy is roughly 4,300 lines written by the same
  author. It becomes ordinary in-house source for this feature and may change
  without regard to the source repository. There is no divergence concern
  because keeping the copies in step is not a goal. This gives the feature full
  control of annotation output location, removes cross-extension lifecycle
  coordination and separate-extension detection or degradation logic, and
  keeps both surfaces in one ordinary project-scoped Dude canvas extension.

### Brief: design and build the Dude canvas UI

#### 0. Mission

You are building the first graphical interface for **Dude**, a spec-driven
development harness for GitHub Copilot (repo: `E-G-C/dude`). Today Dude is
driven entirely by typed commands (`@dude ship`, `@dude work`, `@dude flag`, …)
and its entire state lives as Markdown in `.dude/`. That is powerful and
completely opaque to anyone who has not read `docs/commands.md`.

Your job: ship a **Copilot canvas extension** (side panel in the Copilot app)
that makes the harness obvious on first contact and never puts a ceiling on an
expert.

The single sentence you are optimizing for:

> **A user who has never read the docs can go from a rough idea to a shipped
> feature without being told a command — and a user who has read all the docs
> never feels the UI is in their way.**

**Sharpie** — an existing canvas extension for visual review — is becoming part
of this harness and will own UI interactions within it. You are not designing in
a vacuum; you are designing the surface Sharpie plugs into. Read §2 before you
form any opinion about the architecture.

**Do not start coding.** Work the deliverables in order. Each gates the next.
Stop and show me D1–D3 before writing a line of UI code.

---

#### 1. Ground truth — read before you design

Do not invent the domain model. Read the real thing first:

- `README.md` and `docs/` — especially `docs/commands.md` (full command
  reference), `docs/workflow.md`, `docs/walkthrough.md`, `docs/reference.md`
- `src/agents/*.agent.md` — `dude`, `dude-spec-lead`, `dude-reviewer`
- `src/skills/` — all 21 skills; note which are user-facing vs internal
- `library/packs/` — the 18 optional packs and their `pack.md` frontmatter
  (`use-cases`, `provides`)
- A live project's state: `.dude/ideas/*.md`,
  `.dude/specs/<feature>/{spec,plan,tasks,research}.md`,
  `.dude/memory/{guardrails,context,lessons,decisions}.md`,
  `.dude/state/task-state.json`, `.dude/backlog.md`
- `E-G-C/sharpie` → `.github/extensions/sharpie/` — **read all of it**:
  `README.md`, `extension.mjs`, `lib/` (`submission`, `store`, `paths`,
  `screenshot`, `export`, `preview`) and `ui/js/`. Sharpie is becoming part of
  the harness and owns the interaction layer you are designing around. See §2.
- The `create-canvas` skill — the authoring contract for canvases, actions,
  inputs, and lifecycle. Follow it; do not improvise the extension wiring.

Produce a short written summary of what you learned. If your summary contradicts
the docs, you read too fast.

---

#### 2. Sharpie is the interaction layer — design around it, do not rebuild it

**Sharpie** (`E-G-C/sharpie`, `.github/extensions/sharpie/`) is already a working
Copilot canvas extension, and it is becoming **part of this harness**. Treat it
as the component that owns visual review and structured feedback inside the Dude
UI — not as a pattern you borrow from.

What it already does:

- Loads an HTML page, image, PDF page, or a **blank artboard** from the project;
  with no input it lists every annotatable file, grouped by type.
- Eleven keyboard-driven markup tools (select, browse, pin, box, oval, arrow,
  line, pen, text, highlight, measure, redact); tools stay active for repeat use.
- Device presets re-render the page at phone / tablet / laptop / desktop widths.
- **Every marker captures the CSS selector beneath it, that element's text, and
  its computed styles.** The agent receives `h1.title needs color: blue`, not
  pixel coordinates. This is the crucial property: Sharpie's output is semantic,
  addressable feedback that an agent can act on directly.
- On send it writes a JSON report and a PNG under `.copilot/annotations/` and
  delivers a numbered brief with both attached. In-progress markup persists under
  `.copilot/annotations/drafts/`.
- Exports PNG, a linked HTML review page, and PDF — plus per-marker cropped exports.
- Already exposes canvas actions: `list_sources`, `load_page`, `set_page`,
  `set_device`, `get_latest_submission`.

**Resolve each of the following explicitly. These are design decisions, not
implementation details.**

1. **Never rebuild annotation, screenshotting, markup, device preview, or visual
   diffing.** Any Dude flow that means *"look at this and tell me what's wrong"*
   hands off to Sharpie.
2. **Specify the two-canvas handoff contract.** The Dude UI and Sharpie are
   separate canvases. Define who opens whom, how `instanceId`s are managed so a
   review never clobbers the harness panel, whether they sit side by side or
   swap, and how the user returns with their place and scroll position intact.
3. **Specify the return path.** A Sharpie submission is structured feedback —
   where does it land in Dude? The strongest candidate is `@dude flag`: a Sharpie
   brief is already a well-formed mismatch that Dude can route to the right owner.
   Also weigh attaching a submission as **task evidence** (Dude requires fresh
   evidence before marking a task done) and feeding it into spec or plan revision.
   Pick one primary path, justify it, and make the round trip visible in the UI.
4. **Reconcile the artifact boundary.** Sharpie writes to `.copilot/annotations/`;
   Dude's source of truth is `.dude/`. Decide whether annotations are referenced
   from `.dude/` artifacts or stay separate — and ensure nothing load-bearing
   lives only in a git-ignored drafts folder.
5. **Inherit Sharpie's interaction grammar.** It already sets conventions:
   single-letter tool keys, `Esc` returns to select, `\` toggles the review panel,
   `Ctrl+Enter` sends, `Ctrl+Z` / `Ctrl+Shift+Z` undo, drafts survive a reload,
   existing files are never overwritten. The harness UI must feel like the same
   product. Do not invent a competing shortcut scheme or a second visual
   language. Where the two conflict, the harness bends.
6. **The blank artboard is a design input, not only a review tool.** Sketching a
   UI mock during `brainstorm` or `define` — and carrying that sketch into the
   spec — is a legitimate flow. Account for it when you storyboard.
7. **Decide how Sharpie ships.** It is a separate repo today, and Dude
   distributes optional capability through packs (`design`, `clearline`, `web`, …).
   Should Sharpie become a Dude pack, a core dependency, or stay standalone and be
   detected when present? Recommend one with reasons, and make the harness UI
   degrade gracefully — never broken, just reduced — when Sharpie is absent.

---

#### 3. Non-negotiable product principle

**Low floor, high ceiling, wide walls.**

- **Low floor** — the first screen requires zero prior knowledge. One obvious
  next action, always.
- **High ceiling** — nothing the CLI can do is unreachable from the UI. Hiding
  is allowed; *removing* is not.
- **Wide walls** — multiple valid paths (idea-first, spec-first, issue-first,
  resume-in-progress) are all first-class.

Corollaries you must honour:

1. **Progressive disclosure, never amputation.** Advanced controls start
   collapsed, not absent. Every collapsed thing has a visible, labelled affordance.
2. **The UI teaches the CLI.** Every action surfaces the exact command it runs
   (e.g. a subtle `@dude work --max 3 --policy guarded` next to the button, or a
   "copy command" affordance). Users must be able to graduate from clicking to
   typing. This is the mechanism that keeps the floor low without capping the ceiling.
3. **Files stay authoritative.** `.dude/` Markdown is the source of truth. The UI
   is a lens and a launcher, never a second database. It must tolerate the user
   editing files by hand, in another editor, mid-session, and reconcile without
   data loss.
4. **No dead ends.** Every empty state, error, and blocked state names a cause
   and offers a next action.

---

#### 4. Deliverable D1 — functionality inventory → user jobs

Build a table. Do not skip rows because they seem internal.

| Dude capability | Underlying command / file | The user's actual goal, in their words | Prerequisites | Failure modes |
| --- | --- | --- | --- | --- |

Cover at minimum: `ship`, `brainstorm`, `define`, `work` (and every flag:
`--max`, `--until blocked`, `--recover-on-block`, `--recovery-cycles`,
`--policy guarded|autonomous`), `status`, `flag`, `diff`, `self-check`,
`list/add/remove pack`, `track`, `sync Beads to tasks.md`, `remember`, `hire`,
`list the team`, `remove/modify <role>`, `upgrade` (`--all`, `--dry-run`,
`--rollback`, `--ref`), GitHub issue intake, and manual Beads import.

Also inventory **Sharpie** as first-class harness functionality, not as a
plugin: load a source, annotate, device preview, send a brief, read the latest
submission, export. Give each the same job-story treatment — a user does not
want "to annotate", they want *the agent to fix the thing they are pointing at*.

Then rewrite each capability as a **job story**: *When \<situation\>, I want to
<motivation>, so I can <outcome>.\* If a capability cannot be expressed as a
job story, it is infrastructure — mark it as such and keep it out of the primary
navigation.

**Now decompose.** Any job story that takes more than one decision from the user
must be broken into steps that each have exactly one decision, a clear default,
and a visible way back. `@dude work` with six flags is not one control — it is a
simple default plus five things almost nobody should touch on day one.

---

#### 5. Deliverable D2 — the three-tier disclosure model

Assign **every** row from D1 to a tier, and justify each placement.

- **Tier 1 — Always visible.** The 20% used 80% of the time. Should fit the
  panel without scrolling. Probably: what's happening now, what's next, one
  primary action, blockers.
- **Tier 2 — One interaction away.** Expandable sections, detail panes, an
  overflow menu. Discoverable by curiosity, not by documentation.
- **Tier 3 — Deliberate.** An "Advanced" surface, a command palette, raw file
  access, destructive or irreversible operations. Reachable in seconds by
  someone who knows what they want; invisible to someone who doesn't.

Rules for the tiering:

- Escalation must be **reversible and non-modal** — expanding Tier 2 never
  destroys Tier 1 context.
- Include a **command palette** (`⌘K`) that searches *all three tiers*. This is
  the escape hatch that lets you keep Tier 1 ruthlessly small without trapping
  anyone.
- The panel is **narrow**. Design for ~360–480px first; treat wider as a bonus.
  If Tier 1 doesn't fit at 360px, your Tier 1 is too big.

---

#### 6. Deliverable D3 — information architecture and flows

Propose the IA and defend it. Expect roughly these surfaces, but argue if the
research says otherwise:

- **Now** — the live feature, current stage (idea → spec → plan → tasks → work →
  verified), the next step, and blockers. This is the landing surface.
- **Work** — task list from `tasks.md` / `task-state.json`, with per-task state,
  evidence, and the ability to run the next N.
- **Artifacts** — idea, spec, plan, tasks, research; readable *and* editable,
  with the diff of what Dude wrote since your last message (`@dude diff`).
- **Review** — what changed since your last message, and the entry point into
  **Sharpie** for anything visual. Past submissions are visible here and traceable
  to the task or flag they produced.
- **Memory** — guardrails, context, decisions, lessons.
- **Team & Packs** — roster and the 18 optional packs, framed by *use case*, not
  by pack name.

For each surface, specify: purpose, Tier 1 content, empty state, loading state,
error state, and the single primary action.

Then storyboard these **five flows** end to end, screen by screen, including
what the user sees while the agent is thinking:

1. **Cold start** — empty repo, no `.dude/`, user has a vague idea.
2. **Resume** — returning after two days to a half-finished feature.
3. **Blocked** — `work` stops on a missing decision; user must unblock.
4. **Visual review** — the agent has produced a UI change. The user opens it in
   **Sharpie**, marks up what is wrong, sends, and the semantic feedback lands
   back in Dude as a flag or as task evidence. Storyboard the whole round trip,
   including how the review canvas opens, what happens to the harness panel while
   it is open, and how the user gets back without losing context.
5. **Level up** — a day-30 user turns on autonomous policy, adds a pack, hires a
   specialist. Show how they *discovered* these existed.

Flow 5 is the acceptance test for the whole design. If the only way a user finds
those features is because someone told them, the design has failed.

---

#### 7. UI principles to enforce (audit yourself against this list)

**Feedback and state**

- The harness is asynchronous and slow. Never show a spinner with no narrative —
  show which stage is running, what it is doing, and what it just finished.
- Distinguish *agent-blocked* (needs you) from *agent-working* (needs patience)
  at a glance, with something stronger than colour alone.
- Optimistic UI is forbidden where the filesystem is authoritative. Show real
  state, and show staleness honestly.

**Clarity**

- Plain language. Never surface internal vocabulary (glyph hashes, lane, pack
  slug) in Tier 1 without a human-readable gloss.
- One primary action per surface. Everything else is secondary or tertiary
  weight.
- Show progress against the lifecycle, not just against a task count — users
  need to know *where they are in the process*.

**Safety and reversibility**

- Destructive and irreversible actions (`remove pack`, `upgrade`, `--rollback`,
  autonomous policy) require deliberate confirmation that states the blast
  radius in concrete terms. Never a bare "Are you sure?".
- Prefer undo over confirm wherever the harness allows it.
- Autonomous modes must show a live, interruptible activity view with a
  reachable stop.

**Accessibility — treat as acceptance criteria, not polish**

- Full keyboard operability, visible focus, logical tab order, no keyboard traps.
- WCAG 2.2 AA contrast minimum, including in dark mode.
- Correct semantics and ARIA; live regions for async agent progress so screen
  reader users are not stranded during long runs.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Never encode meaning in colour alone — pair with icon, text, or shape.

**Performance**

- Panel interactive fast; virtualize long lists (this repo already has 40+ spec
  packages).
- Never block the UI on a long agent run.

---

#### 8. Visual system and branding

Do **not** invent a look.

- Adopt **Clearline**, the project's own visual system, from
  `library/packs/clearline/skills/dude-pack-clearline-visual/`. Consume the real
  tokens — `tokens/clearline-tokens.json`, `clearline.css`, `clearline.scss`, or
  `tailwind.preset.cjs`. Read `reference/colors.md` and
  `reference/layout-and-iconography.md`, and run `scripts/validate.mjs` /
  `style-check.sh` against your output.
- Constraints that come with it: calm neutrals, four restrained accents,
  Inter, an 8-point grid with 4-point half steps, bounded measures, a shared left
  edge, and no logo unless the project supplies a mark.
- **Zero hard-coded colours, spacing, radii, or type sizes.** Every value
  resolves to a token. If a token is missing, propose an addition to Clearline —
  do not inline a one-off.
- Light and dark are both first-class; Clearline ships `-dark` variants — use them.
- Sit naturally inside the Copilot app: respect host theme and density, and do
  not fight the surrounding chrome.
- *(If you would rather enforce `strata` or `fluent-ui` instead of `clearline`,
  say so with reasons before building — but pick exactly one and enforce it
  totally.)*

---

#### 9. Technical constraints

- Copilot **canvas extension**, authored per the `create-canvas` skill.
  `canvasId` is the canvas type; `instanceId` is your panel handle. Declare
  actions with real input schemas.
- Mirror the structure of `E-G-C/sharpie`'s extension: `extension.mjs`,
  `ui/` (html/css/js), `lib/` for logic. Keep logic out of the view layer so it
  is testable.
- **Two-canvas coordination is a first-class concern, not glue.** Sharpie is a
  separate canvas with its own `instanceId`. Own the lifecycle deliberately:
  opening a review must never orphan, duplicate, or clobber the harness panel,
  and repeated reviews must reuse handles predictably. Consume Sharpie's existing
  actions (`list_sources`, `load_page`, `set_page`, `set_device`,
  `get_latest_submission`) rather than reaching into its internals; if you need
  something it does not expose, propose an action on Sharpie instead of forking
  its behaviour.
- **Degrade gracefully without Sharpie.** If it is not installed, the harness UI
  stays fully usable and says plainly what is unavailable and how to add it.
  Never a broken control, never a silent no-op.
- Read and write `.dude/` through a small, well-tested path/store layer. Never
  scatter file paths through the UI.
- Handle a repo with **no** `.dude/` directory, a **partial** one, and a
  **large** one (40+ spec packages) — all three are real.
- The user may edit files externally at any time. Detect and reconcile; never
  clobber.
- Do not add a heavyweight framework without justifying it against what the
  existing extension already does.

---

#### 10. Build order and definition of done

Ship in thin vertical slices, each independently usable:

1. **Read-only "Now"** — stage, next step, blockers. Proves the file-reading
   layer and the visual system.
2. **Artifacts + diff** — read, edit, review what changed.
3. **Actions** — ship / work / flag, with command transparency.
4. **Sharpie round trip** — open a changed surface in Sharpie, mark it up, land
   the feedback in Dude. Proves the two-canvas contract and the return path.
5. **Tier 2** — task detail, evidence, memory.
6. **Tier 3** — command palette, packs, team, upgrade, advanced policy.

A slice is done only when **all** hold:

- It works against a real `.dude/` directory, not a fixture.
- Empty, loading, error, and blocked states all exist and all offer a next action.
- Fully keyboard operable; AA contrast in light and dark.
- Zero hard-coded design values; Clearline validation passes.
- Every action shows its command equivalent.
- Anything visual routes through Sharpie rather than reimplementing it, and the
  slice still works with Sharpie absent.
- You have walked the five flows from §6 yourself and can describe what a
  first-time user sees at each step.

---

#### 11. Explicitly forbidden

- Hiding a capability with no path to reach it.
- A settings page as a dumping ground for everything you couldn't place.
- Modal dialogs for anything that isn't destructive.
- Jargon in Tier 1.
- Spinners with no narrative during long agent runs.
- Colour as the sole carrier of meaning.
- A second source of truth alongside `.dude/`.
- Rebuilding annotation, markup, screenshot, device preview, or visual-diff
  capability that Sharpie already provides.
- A keyboard-shortcut scheme or visual language that contradicts Sharpie's.
- Reducing visual feedback to pixel coordinates or free text when Sharpie already
  produces selector-anchored, semantic feedback.
- Designing from the command list outward. Design from the **user's goal**
  inward, then map commands to it.

---

#### 12. When you are unsure

Ask **one** focused question with concrete options, and state your recommendation
and why. Do not batch questions, and do not silently guess on anything that
changes the information architecture.

Begin with §1, then present D1, D2, and D3 for review before building.

### Accepted intent added during refresh

> "feature 048 will be absorbed by this new work, we can close it or modify it to fit in here"

> "sharpie is here /Users/eg/work/copilot-worktrees/sharpie/e-g-c-effective-winner or under my repo https://github.com/E-G-C/sharpie"

- The decision to absorb `.dude/ideas/048-backlog-canvas.md` is settled. The
  backlog canvas surface is part of the Dude canvas UI rather than a separate
  extension.
- Whether idea 048 should be closed as resolved and superseded or edited to fold
  into idea 052 remains unsettled.
- **Settled decision:** The backlog canvas is one surface of the Dude canvas UI.
  Close `048-backlog-canvas` as resolved and superseded by
  `052-dude-canvas-ui`; its intent and still-load-bearing findings are absorbed
  here rather than implemented as a separate canvas extension.
- The close-versus-fold choice is settled: close idea 048 as resolved and
  superseded after carrying its findings here. Still open: whether the
  `backlog-report` prerequisite binds the Dude canvas UI at all now that
  backlog is one surface among several, and if it does, whether it binds only
  that surface.

> "the backlog report will be absorbed by this new feature as well, we can leave it there for now and retire it once the UI realted functionality replaces it."

> "we are going to compare the mockup with the between the two visal systems. for that we will use mockups to compare , if that implies installing Clearline visual system we can do as well"

- **Settled decision:** `025-backlog-report` (`status: defined`,
  `spec_path: .dude/specs/025-backlog-report/spec.md`) is also absorbed by this
  feature, but its retirement is deferred. Take no action on 025 now: it stays
  exactly as it is and keeps running until the UI-related functionality in this
  feature actually replaces it. This differs from 048, which was closed
  immediately because it was still a draft with no package; 025 has a real spec
  package and shipped intent, so it is retired only when superseded in fact.
- **Settled decision:** Choose between Clearline and Strata by building the same
  comparison surface in both visual systems and comparing the mockups, not by
  argument. The user explicitly authorizes installing the Clearline visual
  system pack so both systems are available for that comparison. The winning
  system is selected at the design approval gate.

> "Anotherr thing, previosuly you mentioned anotatios live under `.copilot/annotations/` however I think that they should live under the spec directory (besides the user can export or save outside the project)"

- **Settled decision:** Sharpie's durable annotation output for a Dude-owned
  feature lives under that feature's Dude spec directory, not under
  `.copilot/annotations/`. This is the user's direct answer to §2 decision 4,
  "Reconcile the artifact boundary": `.dude/` is the single home for
  load-bearing review artifacts, consistent with the brief's source-of-truth
  rule and prohibition on a second source of truth.
- The parenthetical is a supporting argument: exporting or saving outside the
  project is a separate, already-supported concern, so the in-project durable
  location does not also need to serve as the export destination.

### Accepted intent — start the bakeoff with Now and learn from established systems

> "We can start with now and change as needed."

- **Settled decision:** Start the visual-system comparison with the **Now**
  landing surface. The recommended narrow width stands unless the user says
  otherwise: design at about 360–480px, use 380px as the working target, and
  check the result at 480px. "Change as needed" means the bakeoff surface is not
  frozen; it may be adjusted if the comparison shows that another surface or
  width would produce a more useful decision.

> "I would like to also add take inspiration from existing Software development.Management system maybe? Think about ADO for Microsoft, for GitHub or Jira. So think on the functionality that kind of sounds alike and the UI those systems employ to make easy and discoverable."

- **Settled decision:** Draw on Azure DevOps, GitHub Issues/Projects, and Jira
  both for functional analogues to Dude's concepts and for the UI patterns those
  systems use to make work management discoverable. The reason is that these
  systems have already solved discoverability for this exact domain.

#### Coordinator contribution — established-system design input (not user prose)

##### Concept mapping

| Dude concept | Azure DevOps analogue | GitHub analogue | Jira analogue |
| --- | --- | --- | --- |
| Idea ledger (`.dude/ideas/<NNN>-<slug>.md`) | Epic or Feature in New state | Discussion or draft Issue | Epic, or an Idea in Jira Product Discovery |
| `spec.md` | Feature description with acceptance criteria | Issue body | Story description plus acceptance criteria |
| `plan.md` | No clean analogue | No clean analogue | No clean analogue |
| Canonical task units in `tasks.md` | Tasks under a User Story | Tasklists and sub-issues | Sub-tasks |
| Task glyphs `[ ]`, `[~]`, `[!]`, `[x]` | Work item State: New / Active / Blocked / Closed | Projects status field: Todo / In progress / Blocked / Done | Status: To Do / In Progress / Blocked / Done |
| `@dude flag` | Blocked state plus a blocking-reason field or a linked impediment | A `blocked` label plus a comment | The literal Flag action marks an issue as impeded and includes a reason |
| `.dude/backlog.md` | Backlog view | Backlog view | Backlog view |
| `## Coordinator Log` | Work item History | Issue timeline | Activity log |
| `@dude diff` | History filtered to recent change | Timeline filtered to recent change | Activity log filtered to recent change |
| Memory and guardrails | Team wiki and Definition of Done | Repository docs and `CONTRIBUTING` | Confluence |
| Packs | Extensions | Marketplace apps and Actions | Atlassian Marketplace apps |
| Team roster and `hire` | Team members and capacity | Assignees | People |
| Execution lanes (Lightweight versus Tracked) | Process templates: Basic versus Agile/Scrum/CMMI | No clean analogue | Team-managed versus company-managed projects |
| Fresh verification evidence before close | Definition of Done gates, linked pull requests, and required checks | Definition of Done gates, linked pull requests, and required checks | Definition of Done gates, linked pull requests, and required checks |

`plan.md` is where Dude is genuinely different; borrowed patterns from these
systems will not help there. The task-glyph mapping is the single most important
mapping because Dude's four glyph states already have a universally understood
presentation. Jira's Flag action is the closest direct precedent for
`@dude flag` and even shares the name. The process-template and project-mode
precedents also show that offering a simple mode and a full mode is not a
failure.

##### UI patterns worth borrowing

| Pattern | What it solves for this design |
| --- | --- |
| Status chip carrying icon plus text plus colour, never colour alone | All three use this pattern; it directly satisfies the brief's accessibility rule. |
| Legal-transitions-only controls | Jira shows only transitions valid from the current status. This maps to Dude's glyph transitions and prevents illegal state changes by construction rather than by validation error. |
| Breadcrumb hierarchy such as Epic > Story > Sub-task | Maps to idea > spec > task and shows where the user is in the lifecycle rather than only a task count. |
| Work item detail pane with a state-and-key-fields header, body, then activity trail | Provides the established shape for the content in `tasks.md` and the coordinator log. |
| Append-only activity timeline as a first-class tab | Directly presents what the coordinator log already is. |
| Blocked as a first-class state with a required reason, not a free-floating label | Matches `flag` classification: `spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, or `external-dependency`. |
| Command palette | GitHub is the strongest model, while Jira uses `.` for quick actions. This reinforces the brief's `⌘K` requirement as established practice rather than novelty. |
| Keyboard shortcut help overlay on `?` | GitHub and Jira both use it; it is a proven mechanism for the brief's "the UI teaches the CLI" corollary. |
| Inline quick-add rows in backlogs | Keeps the floor low for creating work. |
| Empty states with one primary call to action | GitHub does this particularly well, and the brief requires it. |
| Saved and field-driven views | GitHub Projects provides a relevant model for backlog filtering. |
| Linked artifacts on a work item, such as pull request, build, and commit | Maps to Dude's evidence requirement and the completion closeout's delivery links. |

##### Caveats

- All three references are wide, multi-pane web applications, while this panel
  is 360–480px. Borrow their concepts, vocabulary, and interaction grammar; do
  **not** borrow their layouts. Their mobile clients are the better layout
  reference for a single narrow column.
- Borrowing their vocabulary is an asset, not a violation of the brief's
  no-jargon rule. "Blocked", "In progress", "Done", "Backlog", and "Activity"
  are much more widely understood than Dude's internal vocabulary of lanes,
  glyphs, and pack slugs. Familiar words are one of the strongest mechanisms
  available for the brief's low-floor requirement, provided the underlying Dude
  terms remain reachable for users who graduate to the CLI.

### Accepted intent — answering open questions is a first-class UI job

> "Also I was thinking in the UI, for example, after every storming sessions the UI should also make easier to answer the questions for example."

- **Settled decision:** After a brainstorm session, the UI should make it easy
  to answer the open questions that session produced. Answering open questions
  is a first-class UI job, not an afterthought.

#### Coordinator contribution — pending-decision design input (not user prose)

##### Evidence from this ledger

- Before this refresh, this brainstorm had accumulated open questions across
  roughly nine exchanges, and six remained unanswered. Each of those six had a
  fully formed `Answer:` slot that was still empty.
- Today, answering any of them requires typing prose into a chat session and
  having an agent write it back into the file. No surface presents the
  outstanding decisions as a set or tells the user how many are waiting.
- A user returning to this feature in two days cannot see at a glance that six
  decisions are blocking progress. This ledger is therefore direct evidence
  that answering pending questions must be an explicit UI job.

##### Existing structure and broader pending-decision state

- The file format already supplies the renderable structure: every entry in
  `## Open Questions` is a numbered question, an optional `Recommendation:`
  sentence, and an `Answer:` slot. The UI can display that existing Markdown
  structure without introducing another data model. `.dude/` remains
  authoritative, and hand-editing the ledger in another editor keeps working.
- Unanswered open questions are one instance of the broader state that the
  harness is waiting on the user. Other existing instances are:
    - the guardrail checkpoint offering `accept`, `edit`, `reject`, or `skip` and
    stating "This is a normal checkpoint, not an error.";
    - the design approval gate where `design_status` moves from `proposed` to
    `approved`;
    - review rejection findings awaiting disposition;
    - tasks blocked through `flag`, classified as `spec-gap`, `plan-gap`,
    `contract-mismatch`, `test-failure`, or `external-dependency`; and
    - the single disambiguation question that brainstorm, define, or Ship may ask
    before mutating anything.

##### Proposed direction, not a settled decision

- **Design input:** Consider one **Needs you** queue on the **Now** landing
  surface that collects every pending decision regardless of which stage
  produced it.
- This makes agent-blocked versus agent-working a structural distinction rather
  than a cosmetic use of colour. It also matches the brief's requirement to
  break work taking more than one decision into steps with exactly one decision,
  a clear default, and a visible way back.
- A pending decision with nowhere to answer it is the purest form of the dead
  end the brief forbids. Most questions in this ledger already include a
  recommendation, so accepting the recommendation can be the one-interaction
  default while free text preserves the high ceiling.

##### Prior art

- Pull request review threads are the closest interaction match: a question, a
  proposed resolution, a reply, and an explicit resolve action.
- Jira blocks a transition until required fields are supplied, applying the
  same idea at a gate.
- GitHub's "review requested" inbox demonstrates how to aggregate everything
  waiting on one person into one list.

##### Definition-write authority

- Dude delegates definition writes to the Spec Lead during explicit
  `brainstorm` and `define`; a UI that wrote definition artifacts directly
  would bypass that delegation.
- Open-question answers are the existing exception: the user controls
  `## Idea`, answers in `## Open Questions`, and `## Assumptions`. A UI
  affordance that lets the user fill their own `Answer:` slots stays inside
  existing user authority and requires no new definition-write path.

##### Current-authority supersession

- The direct-edit option above is preserved as historical design input, not as
  the selected interaction. The current accepted direction sends an explicit
  brainstorm/answer operation to the active agent session, lets the delegated
  definition path apply the answer and dependent refresh, and then reloads the
  authoritative ledger.

### Accepted intent — adversarial critique during design exploration

> "I would like you to also involve the rubber duck agent during the design phase so you can take feedback from it, incorporate it, and make it better. So, usually, rubber duck waits until the feature is complete, but I would like some critics on the UI because I would like quick improvements. Is that even possible?"

- **Settled decision:** Yes. For this feature, adversarial UI critique happens
  during the design phase, not only after completion. The goal is fast
  iteration: run critique on each mock iteration while `design_status:
  exploring`, incorporate the feedback that holds up, and only then move the
  design to `proposed` and ask the user to approve it.

#### Coordinator finding — the correct Rubber Duck mechanism

- The installed `dude-pack-rubber-duck-retrospective` agent cannot be used
  during design. Its agent file declares `user-invocable: false`, and both its
  agent contract and `library/packs/rubber-duck/pack.md` bind it to exactly one
  dispatch as the final agent before the coordinator closes an eligible
  successful feature or Ship completion. It does not run for ordinary closes
  or in-progress work. A mid-design dispatch would break that contract.
- A separate, general-purpose `rubber-duck` advisor is available to the
  coordinator on demand and has no lifecycle position. It gives high-signal
  feedback on plans and designs while explicitly ignoring style and trivia.
  This is the correct instrument for design-phase critique, and the
  coordinator has already used it once on this ledger.
- The existing design workflow endorses this insertion point:
  `dude-pack-design-workflow` says, "Fail fast on the page, not after
  approval. A great-looking mock with an affordance that can't exist forces
  the whole loop again." Critique therefore belongs in `design_status:
  exploring`, before transition to `proposed`.

#### Design-phase critique findings — 2026-09-01 UTC

**Advisory and non-binding.** The first advisor's overall verdict was to
**REJECT this as a single formal-definition unit**: the idea is valuable, but
its boundary is too large and its foundational contracts are unproven.

##### Blocking-class findings

1. **This is an entire application program disguised as one feature.** It
   combines every Dude capability, six surfaces, five end-to-end flows,
   filesystem synchronization, agent execution, a visual-system bakeoff,
   backlog replacement, and Sharpie adoption. The likely outcome is extensive
   design work with no usable release.
    - **Recommendation:** Take slice 1 only, but make it an actionable **Now
     cockpit**, not a dashboard: one selected feature; stage, next step,
     blockers, and unanswered-question count; honest freshness with manual
     refresh; and exactly one context-sensitive primary action with its command
     visible. Exclude artifact editing, backlog, annotation, packs, team, PDF,
     and a generic action palette. Capture slices 2–6 as separate follow-on
     definitions.
    - The brief's requirement that every slice exercise all five flows is
     incompatible with independent slices because several flows require later
     capabilities.
2. **"Now" has no deterministic source-of-truth model.** Nothing defines how
   the UI identifies the current feature, stage, next action, and blockers
   across 40-plus packages. A polished panel that confidently shows wrong state
   is worse than no UI and violates "files stay authoritative."
    - **Recommendation:** Define a pure projection contract before any UI work:
     explicit feature selection through canvas input or a chooser, never
     inference from modification time; per-field authority and precedence;
     deterministic lifecycle and state-transition rules; defined behavior for
     malformed, partial, conflicting, and externally modified files; and
     corpus tests against the real packages in this repository.
3. **The UI-to-agent control plane is assumed rather than proven, and this is
   the most dangerous gap.** The mission depends on clicks replacing typed
   commands, but the canvas iframe has no privileged host bridge. A click must
   travel through loopback HTTP into the extension and then into the current
   Copilot session while supporting progress, reconnect, failure, and
   interruption. None of that is specified.
    - **Recommendation:** Run a minimal technical spike before mockups or
     Sharpie adoption that proves all five of these: the extension ships in the
     real release artifact; a click invokes one command in the correct session;
     progress reaches the panel without becoming another durable state store;
     reload and reconnect do not duplicate execution; and a running action can
     actually be stopped. If reliable progress and interruption cannot be
     delivered, reduce the product to a status lens and command launcher rather
     than promising an autonomous activity console.
    - **Current-authority clarification:** The dashboard comparison and
      status-lens-and-command-launcher wording were conditional risk-containment
      advice, not the accepted product framing or long-term ceiling. The product
      vision was always interactive. Same-session send, completed-response
      return, and the SDK's `session.abort()` capability are now verified.
      Duplicate-send resistance remains an acceptance concern; a later
      interactive feature must validate the abort experience and post-abort
      authoritative-state reconciliation, but needs no new cancellation
      infrastructure.
4. **A 360–480px side panel suits a cockpit, not a full work-management UI.**
   Azure DevOps, GitHub, and Jira are wide applications; using their mobile
   clients as the layout reference is inadequate because a mobile app owns the
   viewport while a side panel competes with chat and code. Artifact editing,
   diffs, activity history, task detail, and visual review would become
   nested-navigation exercises.
    - **Recommendation:** Limit the panel to status, pending decisions,
     lightweight detail, and launching deeper work; open source files in the
     editor. If no wider or pop-out surface exists, drop full artifact editing
     from the UI goal. Validate task-completion prototypes at 360px, not static
     mockups.
5. **Copying Sharpie before the foundation works is the wrong sequencing.**
   Importing roughly 4,300 lines plus PDF handling, storage behavior, keyboard
   grammar, and a second canvas before the first read-only projection works
   massively enlarges the failure surface. Registering two canvas declarations
   proves registration, not opening, returning, context preservation, or
   absence of duplicate execution.
    - **Recommendation:** Leave Sharpie untouched until its own slice. First
     prove release packaging and a minimal harness canvas, prove two trivial
     canvases round-trip reliably, define the annotation adapter and its
     input/output contract, and record the exact Sharpie source commit. "Copy
     wholesale eventually" does not require "copy first."

##### Non-blocking findings

6. **External-edit reconciliation is a principle without an algorithm.**
   Writing an `Answer:` slot directly while another editor or agent may touch
   the same file risks lost updates.
    - **Recommendation:** Keep the first increment read-only. Before any write,
     require content-hash compare-and-swap, minimal anchored patches, atomic
     replacement, preserved user drafts, and an explicit conflict UI. Re-read
     on focus and after every agent run; never treat an in-memory index as
     authoritative.
7. **The unified "Needs you" queue assumes disparate states share a stable
   schema.** Open questions are parseable, but guardrail checkpoints, review
   findings, design approvals, flags, and live disambiguation prompts have not
   been shown to have durable identities or common resolution semantics.
   Persisting a normalized queue would create the prohibited second source of
   truth.
    - **Recommendation:** Use derived, recomputed provider-style items with a
     source path, stable source identity, content version, and explicit
     resolution mechanism. Start with open questions only. Never let a raw
     direct answer imply that dependent assumptions and the coordinator log
     were also refreshed.
8. **Spec-local annotation storage fails for pre-spec and
   ambiguous-ownership flows.** The blank artboard is supported during
   brainstorm, before a package exists, yet durable output currently requires
   a spec package. Repository-wide or cross-feature review may have no single
   owner.
    - **Recommendation:** Require an owning feature for durable submission and
     use a lifecycle-neutral path such as
     `.dude/specs/<feature>/reviews/<submission-id>/` rather than
     `design/annotations/`. Keep pre-definition work session-scoped and
     explicitly promote it during definition, or make durable submission
     unavailable until a package exists. This adds a third option to the
     annotation-subpath question.
9. **Active requirements contradict superseded ones.** Formal definition must
   resolve these conflicts rather than leaving implementers to interpret
   history: Clearline is mandated while the bakeoff winner remains open;
   Sharpie is always copied and present while inherited requirements still
   demand Sharpie-absent degradation; the feature includes Sharpie while the
   recommended first increment defers it; `025-backlog-report` does not gate
   this feature while the backlog surface expects to reuse its renderer, so it
   likely gates that later slice only. The state-authority conflict previously
   attributed to `task-state.json` was false and is resolved below.
    - **Recommendation:** The specification should contain one authoritative
     decision table and omit superseded constraints from acceptance criteria.
10. **Raw vendored pdf.js files would become a manually maintained
    dependency.** Manual security refreshes are predictable future neglect.
    - **Recommendation:** Keep `pdfjs-dist` pinned in the lockfile and copy only
      the two browser assets into the distributable extension during the
      release build. Consumers still receive offline, install-free PDF support
      while dependency alerts, provenance, and upgrades remain manageable. If
      raw vendoring still wins, record the version, hashes, attribution, and an
      automated vulnerability check. This adds another option to the PDF open
      question.

#### Accepted correction — execution authority and Now projection

- Tracked Execution: Beads is authoritative after tracked import; `tasks.md` is
  only a one-way non-authoritative mirror.
- Lightweight Execution: canonical task units and live glyph state in
  `tasks.md` are authoritative.
- Definition Only: the exact idea or exactly owned spec package is live
  according to the existing status resolution rules.
- `.dude/state/task-state.json` is NOT authoritative. It is the coordinator's
  last-written snapshot used to detect unsupported/manual completion drift.
- The Now canvas must follow the same deterministic authority and lane
  precedence as `@dude status`; it must not invent a competing precedence or
  present the JSON snapshot as live state.
- Tier 1 presents human-readable state and never exposes glyph hashes.

#### Accepted disposition of the independent review's state-authority finding

- **Accepted and resolved:** The false state-authority statement.
- **Still unresolved:** The broader Now-projection contract; this correction
  does not decide target selection, stage derivation, next-action derivation,
  blockers, or freshness.

#### Critique-confirming repository facts (coordinator-verified)

- `scripts/build-release.mjs` documents that it ships "core-tier files only
  (the `dude` / `dude-<slug>` agents, `dude-<slug>` skill directories, and
  `dude.instructions.md`)". The release build scripts contain no handling of
  `.github/extensions/`, and the current core-upgrade inventory likewise omits
  `.github/extensions/dude/**`. A current release or core upgrade therefore
  would not include the Dude canvas extension. The observed omission is
  correct; its product and architecture implications are corrected below.

#### Coordinator finding — project-scope dogfooding and release completion

- The release omission does **not** block dogfooding in this repository. Canvas
  extensions load at project scope from
  `.github/extensions/<name>/extension.mjs`, committed in the repository. The
  copied annotation extension already runs this way inside its own repository,
  so this is direct working evidence rather than an assumption.
- The user can therefore dogfood this feature in this repository from the first
  increment before it enters a release bundle.
- Release-bundle inclusion is ordinary completion work for the first increment
  selected for general release: extend the existing core projection and exact
  core-upgrade inventory for `.github/extensions/dude/**`. It is not a separate
  product increment or distribution capability.
- This repository is an unusually useful dogfooding corpus: its 53 idea ledgers
  and 47 task files are already the large-package case the design must handle.

#### Cross-reference — durable design-stage critique

- The durable design-stage critique capability has been split into its own idea
  at the exact path `.dude/ideas/053-design-stage-critique.md`, with slug
  `design-stage-critique`. Meanwhile, this feature's design phase will continue
  using the general-purpose on-demand `rubber-duck` advisor, exactly as it
  already did to produce the critique findings recorded above.
- Idea 052 does **not** depend on idea 053. They are separate bounded outcomes
  with separate success tests; 052 is simply the motivating case that surfaced
  the gap.

### Accepted intent — an ordinary canvas extension in short, actionable dogfood increments

> "This is just a GitHub Canvas extension."

- **Settled distribution framing:** This is an ordinary GitHub Copilot canvas
  extension: `extension.mjs` plus static and runtime assets under the exact
  `.github/extensions/dude/` directory. It is not a separate application,
  service, daemon, package manager, installer, deployment platform, or
  separately shippable feature. It needs no user-facing installation flow and
  no runtime compilation step.
- **Initial installation is unchanged:** a user downloads the Dude release
  bundle and unpacks it at the repository root. The bundle simply includes
  `.github/extensions/dude/` alongside its existing `.github/agents/`,
  `.github/skills/`, and `.github/instructions/` content.
- The existing release assembler happens to source core from `src/` and project
  it to `.github/`. Implementation must include the extension in that same
  projection and let the existing core-upgrade inventory recognize the exact
  `.github/extensions/dude/**` path. This is ordinary bundle bookkeeping, not a
  new install, build, distribution, or deployment capability.
- Only `.github/extensions/dude/**` is Dude core. Unrelated project-owned
  `.github/extensions/**` paths remain outside core and must remain untouched
  by `@dude upgrade`.
- If pdf.js browser assets are bundled, they are ordinary files inside
  `.github/extensions/dude/`. Consumers do not run npm, download dependencies,
  build the extension, or compile it at runtime.

#### Accepted disposition of the independent review's distribution finding

- **Partially accepted:** the observed repository fact is correct. The current
  release-build and core-upgrade inventories omit `.github/extensions/`.
- **Rejected implication:** the omission does not require a new installer,
  build system, distribution subsystem, platform, or separately shippable
  capability. It requires only extending the existing copy/projection and its
  exact Dude-core path inventory.
- This disposition corrects the prior advisory critique; it introduces no new
  architecture.

> "What's the name of the canvas for the UI? Question number two. what's the bandifa for ship increment? I would like to do quick cycles so every time we deliver functionality I can dog footing. tell me what you think. How can we be actionable on those? Question, did I get it right?"

- **Settled decision:** Build in short delivery cycles where every shipped
  increment provides real functionality the user can immediately dogfood in
  this repository. Cadence and actionability are explicit product requirements
  for this feature, not incidental process preferences.

#### Coordinator input — canvas naming

- The copied annotation canvas declares `id: "sharpie"` with
  `displayName: "Sharpie"`. Its precedent is a short product name rather than a
  functional description, and that precedent is worth following.
- `canvasId` identifies the canvas type and must be distinct per canvas.
  `instanceId` is a separate per-panel handle. If one extension registers both
  the harness and annotation canvases, it needs two distinct canvas ids.
- **Recommendation:** Use `id: "dude"` and `displayName: "Dude"` for the
  harness canvas. This matches the product name, the `@dude` command prefix,
  and the coordinator agent name, so a first-time user opening "Dude" needs no
  translation. Keep `id: "sharpie"` for the copied annotation canvas: it is an
  established, distinctive name for a genuinely separate surface, and renaming
  it adds no benefit.
- A competing option is a descriptive id such as `dude-harness` or
  `dude-board`. Those names read as internal vocabulary, which conflicts with
  the brief's low-floor and no-jargon rules.

#### Coordinator input — actionable increment ladder

**Governing actionability rule:**

> Every increment must replace one thing the user does manually today. If an increment does not remove a manual behaviour, it is not an increment.

**Technical spike, not a product increment:**

- **I0 — Plumbing spike, deliberately throwaway.** Prove that a canvas opens in
  this repository and can read `.dude/`. It replaces nothing and therefore is
  not an increment; it exists only to retire risk. This is also the natural
  place to prove the control-plane questions raised by the critique.
- **Current I0 proof requirement:** In addition to open/read plumbing, prove one
  canvas-originated message reaches the active agent session and one completed
  response is surfaced to a test UI endpoint or component without duplicating a
  turn on refresh. This remains internal technical work, not a user-visible I1
  capability or independent release.

**Product increments:**

- **I1 — "Where am I?"** A read-only Now cockpit for one selected feature:
  stage, next step, blockers, and the count of unanswered questions, with honest
  freshness and a manual refresh. No actions. **Replaces:** running
  `@dude status` and reading raw Markdown to re-orient.
- **I2 — "What is waiting on me?"** A read-only Needs-you queue derived only
  from unanswered open questions in the selected idea, each with a
  copy-the-command affordance. **Replaces:** scrolling a long ledger to find
  empty `Answer:` slots. The need is real: before this refresh added the canvas
  naming question, the current session had accumulated eight unanswered
  questions with no surface that listed them.
- **I3 — "Answer it here."** The first write path: fill `Answer:` slots using
  content-hash compare-and-swap, atomic replacement, and an explicit conflict
  UI. **Replaces:** typing answers as chat prose and waiting for an agent to
  write them back.
- **I4 — "Do the thing."** The primary context-sensitive action with its exact
  command shown next to it. **Replaces:** remembering and typing the command.
- **I5 — "Show me what is wrong."** The copied annotation round trip and its
  return path. **Replaces:** describing a visual problem in words.
- The product increment ladder ends at I5. I1 through I5 are dogfoodable in
  this repository as they land. That makes the short cycles the user asked for
  achievable.
- Release-bundle inclusion is a definition-of-done condition, not an increment.
  The first product increment selected for general release is done only when
  the existing bundle projection includes `.github/extensions/dude/` and the
  existing core-upgrade inventory recognizes exactly
  `.github/extensions/dude/**`. Earlier project-scope dogfooding does not wait
  for that release condition.
- This ladder starts with the deliberately read-only Now cockpit while
  preserving the always-interactive product vision, and defers the annotation
  copy until its own slice.
- It deliberately reorders the brief's original six-slice build order by moving
  artifact editing later and pending decisions earlier. The decision queue is
  the higher-frequency need and the cheaper build.

### Coordinator-verified repository context (not user prose)

- **Authorship and licence fact:** Sharpie's MIT `LICENSE` states Copyright (c)
  2026 Enrique Gonzalez. Sharpie is the user's own code, so copying it into this
  project is not an external licensing question and carries no meaningful
  external obligation for that code. Third-party dependency licences are
  separate.
- **Copy size:** The copy is roughly 4,300 lines of ES modules:
  `extension.mjs` (703); `lib/` including submission (290), paths (247), export
  (246), screenshot (176), store (150), and preview (104); and `ui/js/`
  including app (1508), shapes (218), geometry (208), capture (186), and panel
  (137), plus `ui/index.html` and `ui/styles.css`. This is a factual scale
  observation; the project's author also wrote this code.
- **Multiple canvases are supported by one extension:** Sharpie calls
  `joinSession({ canvases: [ createCanvas({ id: "sharpie", displayName,
  description, inputSchema, actions }) ] })`. Because `canvases` is an array,
  one Dude `extension.mjs` can register both the harness canvas and the copied
  annotation canvas as separate surfaces without installing two extensions.
- **Copyable annotation input contract:** Sharpie's canvas `inputSchema`
  provides project-relative `path` for HTML, image, or PDF input; numeric `page`
  for PDFs; boolean `blank` for a blank UI-mock artboard; and
  `additionalProperties: false`.
- This repository does not currently contain `.github/extensions/`; no canvas
  extension is shipped today.
- Sharpie is verified at the local branch worktree
  `/Users/eg/work/copilot-worktrees/sharpie/e-g-c-effective-winner` for
  `E-G-C/sharpie`, at HEAD `e8fb984` (`rename, and skill added`), and remotely at
  <https://github.com/E-G-C/sharpie>. The brief's §2 claims are consistent with
  that repository. Sharpie remains a separate repository and its code has not
  yet been copied into `E-G-C/dude`.
- Sharpie's actual extension root is `.github/extensions/sharpie/`. It contains
  `extension.mjs` (703 lines), `package.json`, `package-lock.json`, `README.md`,
  and `.gitignore`; `lib/submission.mjs` (290), `preview.mjs` (104),
  `paths.mjs` (247), `store.mjs` (150), `export.mjs` (246), and
  `screenshot.mjs` (176); and `ui/index.html`, `ui/styles.css`, plus
  `ui/js/app.mjs` (1508), `capture.mjs` (186), `geometry.mjs` (208),
  `shapes.mjs` (218), `inspector.mjs` (111), and `panel.mjs` (137). It is
  roughly 4,300 lines of framework-free ES modules.
- Sharpie's canvas imports `CanvasError`, `createCanvas`, and `joinSession` from
  `@github/copilot-sdk/extension`. Its canvas ID is exactly `sharpie`, distinct
  from the Dude harness canvas ID, and this is the `canvasId` the harness must
  open. It declares exactly five actions: `list_sources`, `load_page`,
  `set_page`, `set_device`, and `get_latest_submission`.
- Verified Sharpie open inputs are `{ "path": "designs/home.png" }`,
  `{ "path": "designs/spec.pdf", "page": 3 }`, `{ "path": "index.html" }`,
  `{ "blank": true }`, or no input, which lists all annotatable files grouped by
  type. Its device presets are `fit`, `desktop` (1440×900), `laptop`
  (1280×800), `tablet` (834×1112), `mobile-l` (430×932), `mobile` (390×844),
  and `mobile-s` (360×740).
- Sharpie's eleven canvas tools use the verified bindings Select `V`, Pin `N`,
  Box `R`, Oval `O`, Arrow `A`, Line `L`, Pen `P`, Text `T`, Mark/highlight
  `G`, Size/measure `M`, and Hide/redact `K`; Browse navigation uses `H` or held
  Space. `Ctrl+Z` and `Ctrl+Shift+Z` undo and redo, `Delete` removes the
  selection, `Esc` returns to Select, `\` toggles the review panel, and
  `Ctrl+Enter` sends. The harness must inherit rather than compete with these
  conventions.
- Each Sharpie marker outputs the CSS selector, the element's text and computed
  styles, and an optional comment; comments are not required. Send writes a JSON
  report and PNG under `.copilot/annotations/` and delivers a numbered brief
  with both attached. Per-page drafts persist under the git-ignored
  `.copilot/annotations/drafts/`.
- Sharpie's only declared dependency is `pdfjs-dist ^6.2.108`, resolved at
  version `6.2.108` and licensed `Apache-2.0`. This is genuinely third-party, so
  its licence, attribution, upgrades, and security-patch cadence apply.
  Sharpie's package description says the Copilot SDK is resolved by the CLI and
  must not be listed in `package.json`.
- **Correction:** The previous refresh overstated the PDF distribution
  constraint. Native platform binaries are entirely avoidable and already
  optional. In the extension's `package-lock.json`, `pdfjs-dist` is the only
  non-optional package. All twelve `@napi-rs/canvas*` entries have
  `optional: true` and each platform binary is pinned by its `os` field to
  `darwin`, `linux`, `win32`, or `android`.
- A real install probe,
  `npm install pdfjs-dist@6.2.108 --omit=optional`, installed exactly one package
  and zero native binaries. The platform-binary distribution concern therefore
  disappears with one install flag.
- Sharpie never uses the optional native canvas. `lib/preview.mjs`
  `renderPdfPreview()` emits a browser-iframe page that imports pdf.js from
  `/vendor/pdfjs/pdf.min.mjs`, sets
  `pdfjs.GlobalWorkerOptions.workerSrc` to
  `/vendor/pdfjs/pdf.worker.min.mjs`, and renders into a DOM `<canvas>`.
  `@napi-rs/canvas` is pdf.js's optional Node-side rendering path; Sharpie's
  browser rendering never takes it.
- The PDF runtime surface is only two files. `lib/paths.mjs:22` sets
  `PDFJS_DIR` to `<EXTENSION_DIR>/node_modules/pdfjs-dist/build`;
  `hasPdfSupport()` at `lib/paths.mjs:25` is exactly an existence check for
  `pdf.min.mjs`; `resolveVendorAsset()` at `lib/paths.mjs:205` serves from that
  directory; and `extension.mjs:408` routes `GET /vendor/pdfjs/*` to it. Only
  `pdf.min.mjs` and `pdf.worker.min.mjs` are served.
- At version `6.2.108`, `pdf.min.mjs` is 454,669 bytes (about 444 KB) and
  `pdf.worker.min.mjs` is 1,262,398 bytes (about 1.2 MB), roughly 1.7 MB
  together.
- `.dude/ideas/048-backlog-canvas.md` is an existing draft for a Copilot backlog
  canvas. It records verified SDK findings: an `extension.mjs` ES module,
  `joinSession({ canvases: [createCanvas(...)] })`, the exact JavaScript filename
  with no TypeScript, a loopback URL rendered in an iframe, and project scope at
  `.github/extensions/<name>/extension.mjs`. It also makes `backlog-report` a
  prerequisite. Its surface is now accepted into this idea; the disposition of
  ledger 048 and the continuing scope of that prerequisite remain unresolved.
- `library/packs/` contains 18 packs, including both `clearline` and `strata`.
  The roster includes a `dude-pack-strata-stylist` agent. Ideas
  `.dude/ideas/042-pack-visual-neutrality.md` and
  `.dude/ideas/049-visual-systems-pack.md` establish the current convention that
  each visual system is an independently installable pack. The brief mandates
  Clearline while permitting Strata or Fluent UI as alternatives, so the one
  visual system to enforce remains an explicit choice.
- The current roster includes `dude`, `dude-spec-lead`, `dude-reviewer`, and pack
  agents for authoring, coding, release management, Rubber Duck retrospectives,
  and Strata styling.
- The Sharpie repository is itself a Dude-bundle consumer with `.dude/`,
  `.github/agents/`, and `.github/skills/`. Its roster includes
  `dude-pack-copilot-sdk-specialist`, which `E-G-C/dude` does not currently
  carry. This is relevant expertise for the feature, but no hiring decision has
  been made.
- Strata is already installed in this repository as skill
  `.github/skills/dude-pack-strata-visual/` and agent
  `dude-pack-strata-stylist.agent.md`.
- Clearline is not installed. It exists only in the source catalogue at
  `library/packs/clearline/`; its `pack.md` declares
  `use-cases: [ui, visual-design]` and provides agent
  `dude-pack-clearline-stylist`, skill `dude-pack-clearline-visual`, and prompt
  `dude-pack-clearline-apply-visual-system.prompt.md`. The coordinator is
  installing it through `dude-compose` so both systems are available for the
  comparison. Installation is reversible through `remove pack`.
- Resolved idea `049-visual-systems-pack` and idea
  `042-pack-visual-neutrality` establish that visual systems are independently
  installable packs. Temporarily installing both for this bakeoff is the
  intended use of that convention, not a violation of it.
- **Sequencing constraint:** Defined idea `044-persistent-design-mockups` and
  the installed `dude-pack-design-workflow` skill require the durable primary
  mock to live under `.dude/specs/<feature>/design/`, identified by an exact
  `preview_path:` in `spec.md`, with `design_status:` moving from `exploring`
  to `proposed` to `approved`. Mockups must not live in a temporary directory
  or session-only location. This feature has no package yet, so there is
  currently no canonical location for the comparison mockups. Explicit
  `define` must run before the mockup bakeoff.
- This sequencing is not circular. The design workflow permits the idea to be
  `status: defined` while the proposal remains `design_status: exploring`, so
  the visual-system choice can be consciously deferred to the design approval
  gate rather than answered before definition.

#### Sharpie annotation-storage findings (coordinator-verified)

- The storage change is small and well contained. Sharpie funnels every
  annotation path through one constant in `lib/store.mjs:8`:
  `export const ANNOTATIONS_DIR = resolve(PROJECT_ROOT, ".copilot", "annotations");`.
  All annotation persistence goes through that store: `readDraft`,
  `writeDraft`, `writeReport`, `latestSubmission`, `targetKey`,
  `targetKeyPath`, `availableStem`, `writeExportTo`, `readExportPrefs`, and
  `writeExportPrefs`.
- `extension.mjs` never constructs an annotation path itself; it calls the
  store. The write location is therefore one genuine seam rather than a
  scattered concern.
- A separate reference exists at `lib/paths.mjs:85-87`: export preset
  `id: "annotations"`, labelled `Project .copilot/annotations/exports`, with
  path `<PROJECT_ROOT>/.copilot/annotations/exports`. That preset concerns
  exports and is distinct from report and draft storage.
- `lib/paths.mjs:102` `resolveExportDirectory(input)` already accepts absolute,
  `~`-prefixed, and project-relative paths, while `exportPresets(target)`
  already offers Desktop, Downloads, and Documents. The user's point that an
  export can be saved outside the project is already true in shipped Sharpie;
  no new capability is needed for that half.
- This requires a contained in-house change to the copied implementation, not
  an external proposal or coordination with another author. The likely bounded
  shape is for a caller to supply an output location or owning-feature context
  when opening or loading, and for the store to honor it.
- The existing standalone Sharpie repository can retain
  `.copilot/annotations/` for its current behavior while the copied Dude
  implementation uses the owning spec-package location. The copied
  implementation has no synchronization or port-back relationship with that
  repository, whose future as a standalone product is out of scope here.
- Durable reports stored under `.dude/specs/<feature>/` become committed,
  load-bearing review artifacts and satisfy §2 decision 4. In-progress drafts
  are a distinct concern and can reasonably remain ephemeral and git-ignored.
- This strengthens the §2 decision 3 return path: a submission inside the
  owning feature package is directly citable as task evidence or as the body
  of a flag, without a cross-boundary reference.
- **Accepted-intent correction to the findings above:** The prior
  external-upstream framing was wrong. The user authored Sharpie, and the copied
  implementation is controlled here, so its output location can change
  in-house. Annotation capability has no separate-extension absent or fallback
  case within this feature; optional PDF support is the distinct dependency
  question.

#### Findings inherited from idea 048 (coordinator-verified)

- The official Copilot canvas-extension guide is
  <https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions>.
  The verified extension contract is an `extension.mjs` ES module calling
  `joinSession({ canvases: [createCanvas({ id, displayName, description, open, actions, onClose })] })`.
  The entry filename must be exactly `extension.mjs`; TypeScript is not
  supported.
- A canvas `open()` returns a loopback URL rendered by the host in an iframe.
  There is no privileged bridge. The extension therefore serves its HTML from a
  `127.0.0.1` server on an operating-system-assigned port and binds only to
  loopback.
- Project scope is `.github/extensions/<name>/extension.mjs`, committed with
  the bundle. User scope and session scope were rejected because both are local
  and do not travel with the bundle.
- Idea 048's statement that no `package.json` is needed is refined by the
  already-recorded Sharpie evidence: Sharpie does ship a `package.json`, but
  solely for the genuine third-party dependency `pdfjs-dist`; the Copilot SDK
  is resolved by the CLI and must never be listed in that manifest.
- The backlog surface must reuse the report pipeline rather than become another
  data source or rendering implementation: one bucket derivation and one report
  generation path feed the Markdown report, the standalone offline HTML, and
  the canvas panel, with the panel serving the same generated HTML. In the
  broader harness UI this makes the backlog surface wiring over the existing
  renderer, not a fourth rendering path.
- `backlog-report` was explicitly required to ship first because it owns that
  bucket derivation and HTML renderer. Whether that completed prerequisite now
  gates the whole Dude canvas UI or only its backlog surface remains open.
  Idea 048 deliberately did not put `depends-on:` in draft frontmatter because
  the first-definition publisher validates only `title`, `slug`, `status`, and
  `spec_path` and rejects any additional key.
- The repository probe recorded by idea 048 found that `.github/extensions/`
  survives the dev build, but the release build stages only `agents`,
  `instructions`, and `skills`. Including the Dude canvas for bundle users
  therefore requires the existing core projection and core-upgrade inventory to
  recognize exact `.github/extensions/dude/**`; this is ordinary bundle
  bookkeeping rather than a separate distribution capability.
- `stdout` is reserved for extension JSON-RPC, so extension diagnostics use
  `session.log` rather than `console.log`. `open()` must be idempotent across
  reconnects and extension reloads. The backlog surface keeps no durable state
  of its own, re-derives from authoritative repository state, and adds no file
  watcher, live-push service, daemon, or second store until one is proven
  necessary. Canvas SDK types remain experimental.

### Accepted intent — a current, richer-than-status Now projection

#### Settled feature selection

- **Settled rule:** Use an exact feature target when one is supplied. Otherwise,
  auto-select only when there is exactly one unambiguous active feature.
  Otherwise, show a chooser. Never infer the target from the most recently
  edited feature.
- This settles and supersedes only the target-selection portion of the earlier
  unresolved Now-projection finding. It does not settle the remaining
  derivation details.

#### Status-compatible, not status-identical

- `@dude status` supplies the semantic correctness baseline: exact ownership,
  lane and live-authority precedence, next-step rules, and blockers.
- The Now canvas is a richer visual projection over those same authoritative
  sources. It is status-compatible, not status-identical. It must not merely
  execute `@dude status` and render its output as a string, and it must not
  invent a competing state model.
- `@dude status` is therefore not the UI's functionality ceiling. The canvas
  may add visual hierarchy, context, explanations, navigation, and
  progressively disclosed detail that is awkward in terminal prose.

#### I1 boundary reconciliation — floors, not allowlists

- The deliverable lists, the original brief's "cover at minimum" language, and
  the fields named in the accepted 052 completion boundary are mandatory
  floors, not exhaustive allowlists. I1 remains the read-only Now cockpit for
  one selected feature; this clarification does not reopen the all-in-one
  canvas scope.
- Additional I1 functionality is allowed only when **all** of these are true:
    - It directly improves the accepted outcome: helping the user understand
      where the selected feature is, what comes next, or what needs attention.
    - It remains read-only with respect to Dude and project state.
    - It derives from existing authoritative files or state and creates no
      second source of truth.
    - It introduces no independent workflow or separate completion outcome.
    - The same I1 acceptance evidence can verify it.
    - It does not materially delay the first dogfood cycle.
- When additional functionality passes that test and is timely, low-hanging,
  useful, and coherent with the current increment, include it. Do not
  arbitrarily omit value merely because the original brief did not enumerate
  it.
- This is a coherence test, not a minimum-only restriction. Running commands,
  editing answers or artifacts, annotation, packs or team management, and
  backlog management remain later feature-level cycles because they introduce
  writes or separate workflows, not because they were absent from a minimum
  list.

#### Candidate richer-than-status Now content for D1–D3

The following are candidates for inventory, mockup, and design evaluation. They
are not all mandatory I1 acceptance criteria:

- A lifecycle stepper showing the selected feature's position from idea through
  verified.
- Plain-language state with icon and text, with internal lane and glyph
  terminology hidden from Tier 1.
- A "Why this is next" explanation alongside the next step.
- The exact command equivalent with a copy affordance, without executing it.
- Lightweight task-progress counts only when Lightweight Execution is genuinely
  active; never show task counts merely because all-open tasks exist.
- A current-task summary when execution is active.
- Blocker classification, source, and reason in plain language.
- The already accepted unanswered-current-question count, without turning I1
  into the later Needs-you queue.
- The latest relevant Coordinator Log or lifecycle event as "What just changed,"
  without claiming the full semantics of `@dude diff`.
- Collapsed source and authority details naming the exact idea, spec, tasks, or
  Beads source for expert trust.
- Honest freshness ("read at…"), manual refresh, and explicit stale or conflict
  diagnostics.
- Empty, partial, malformed, ownership-ambiguous, and externally changed states,
  each with one next action.

#### D1 currency rule

- At D1, inventory current functionality from the repository and docs,
  including current commands, agents, skills, packs, file formats, state
  authorities, and canvas capabilities. The original brief's minimum list is
  mandatory but not exhaustive.
- Evaluate functionality added since the brief and map it by user job rather
  than ignoring it.
- For 052, only capabilities that pass the I1 inclusion test enter I1
  acceptance. Other newly discovered capabilities remain product-roadmap input
  for later feature-level cycles.

#### Remaining Now-projection definition

- Target selection is settled by the user through the rule above.
- State-authority precedence was already corrected and remains settled.
- Stage derivation, next-step derivation, blocker derivation, and freshness and
  error semantics remain for D1–D3 and specification. This refresh intentionally
  invents no detailed rules beyond the accepted principles.

### Accepted refresh dispositions — one Dude canvas and deferred Review work

> "harness name yes dude is fine"

> "Storage path, follow design pack pattern, Or suggest one that makes sense, but definitely not what Sharpie used to have as now evreything lives under .dude"

> "Make Sharpie part of the single UI Canvas so it's merged. If you think otherwise let me know."

> "Yes, retiring backlog after replacement."

> "pdf.js maintenance approach , please advise with minum friction in mind"

#### Current authority for lifecycle 052

- The authoritative completion boundary remains the read-only Now cockpit in I1,
  with I0 permitted only as internal plumbing. Review, review submission routing,
  PDF maintenance, and writing answers from the UI remain deferred future work
  and are not questions, acceptance criteria, or tasks for defining 052.
- The later answer-writing capability remains outside 052, but its interaction
  path is now settled: the UI sends an explicit brainstorm/answer operation to
  the active agent session and reloads authoritative state after completion.
- There is exactly one canvas: `id: "dude"` and `displayName: "Dude"`.
  `canvasId` identifies that single canvas type; an `instanceId` may identify its
  open panel, but there is no second `sharpie` canvas id and no two-instance
  handoff.
- The historical raw brief is preserved verbatim earlier in this ledger as user
  prose and product direction. Where it conflicts with this current authority,
  it is not an active requirement:
    - every old two-canvas or separately registered Sharpie clause is superseded
     by the single Dude canvas and its internal Review mode;
    - every Sharpie-absent, detection, fallback, or degraded-mode clause is
     superseded because the copied code is internal to the Dude canvas;
    - every in-project `.copilot/annotations/` storage clause is superseded by
     the `.dude/specs/<feature>/reviews/<submission-id>/` constraint below; and
    - every generic Clearline-only clause is superseded by the accepted
     Clearline-versus-Strata mockup comparison. The winner remains a current
     question until the post-definition design approval gate.

#### Deferred future-feature decisions and questions

Everything in this subsection is preserved roadmap input for later feature-level
cycles. It does not expand or block the read-only 052 boundary.

##### Settled future constraint — Review is a merged full-panel workspace

- The copied Sharpie code becomes an internal **Review** workspace or mode inside
  the one Dude canvas. It is not exposed as a second canvas.
- Review takes over the full panel and is lazy-loaded when entered. Annotation
  controls are not squeezed alongside the Now cockpit.
- Preserve Sharpie's interaction grammar inside Review: its single-letter tool
  keys, `Esc` behavior, `\` panel toggle, `Ctrl+Enter`, undo and redo, persistent
  tool selection, and never-overwrite-existing-files behavior. Review shortcuts
  are active only while Review is active and must not intercept input in text or
  editable controls, so they cannot interfere with Now or typing.
- Returning from Review restores the prior Dude view, selected feature, and
  scroll position.
- The earlier recommendation to register a separate copied Sharpie canvas is
  superseded. A dedicated, lazy-loaded full-panel mode preserves the full-surface
  review model and isolates its keyboard grammar without a second canvas or
  handoff.

##### Settled future constraint — durable Review submission storage

- Use `.dude/specs/<feature>/reviews/<submission-id>/`. Each submission
  directory groups its durable report JSON, annotated image, and required
  metadata and assets.
- This follows the design pack's feature-package pattern while keeping
  `reviews/` a sibling of `design/`, not a child of it. Review may happen during
  design, implementation, verification, or later inspection, so
  `design/annotations/` would incorrectly imply a design-only lifecycle.
- Every load-bearing in-project review artifact stays under `.dude/`; the copied
  implementation no longer uses `.copilot/annotations/`.
- External export is separate and may target a user-selected path outside the
  project.
- A durable submission requires one owning defined feature. Pre-definition blank
  artboard work remains a session draft and must be explicitly promoted after
  definition before it becomes load-bearing. Do not create another persistent
  pre-spec directory.

##### Non-negotiable future acceptance constraint — valid Review attachment payloads

**Confirmed adoption defect**

- Coordinator verification of Sharpie source at
  `/Users/eg/work/copilot-worktrees/sharpie/e-g-c-effective-winner/.github/extensions/sharpie/extension.mjs:341-343`
  found that both attachments are constructed without `displayName`:

  ```js
  const attachments = [{ type: "file", path: reportPath }];
  if (screenshotPath) attachments.push({ type: "file", path: screenshotPath });
  await session.send({ prompt: buildPromptMarkdown(stored), attachments });
  ```

  The omission therefore affects both the JSON report and PNG screenshot, not
  only an occasional image path.
- The installed SDK's public high-level `MessageOptions` declaration at
  `/Applications/GitHub Copilot.app/Contents/Resources/copilot-sdk/types.d.ts:2632-2639`
  makes `displayName?: string` optional for file and directory attachments, and
  its `session.d.ts:131-134` example also omits the field.
- The generated low-level RPC contract at `generated/rpc.d.ts:11556-11568`
  instead requires `PushAttachmentFile.displayName: string` and likewise
  requires a display name for directory attachments.
- Runtime implementation at `index.js:7872-7883` passes
  `options.attachments` directly into the `session.send` RPC request without
  adding a display name or falling back to a basename.
- This verifies a contract mismatch and an invalid outgoing attachment payload:
  Sharpie follows the permissive public type and example, while the underlying
  RPC requires the omitted field. The root-cause hypothesis is strongly
  supported: the public SDK typing and documentation incorrectly permit
  omission, and Sharpie relies on that high-level contract.
- The user's observed consequence, session corruption, was not reproduced in
  this investigation. It remains reported behavior, not an independently
  verified fact. The confirmed defect is the invalid, mismatched attachment
  payload.

**Required correction and regression coverage for the later Review feature**

- Every attachment sent by the copied code must explicitly provide a non-empty
  `displayName`, even if a later SDK version adds its own fallback. Prefer
  meaningful, sanitized, length-bounded names such as
  `Sharpie review report — <source>` and `Annotated capture — <source>`;
  basename fallback is acceptable only when semantic context is unavailable.
- Validate the full outgoing attachment array before calling `session.send` or
  `sendAndWait`. If any required field is absent, reject locally with a
  user-visible error.
- Add a focused regression test that captures the exact outbound
  `session.send` payload for report-only and report-plus-screenshot submissions
  and asserts a non-empty `displayName` on every attachment.
- Modify the freely owned copied implementation during adoption; do not modify
  the Sharpie repository.
- Never retry an uncertain send automatically. If the extension cannot know
  whether the invalid submission reached the agent, surface the failure and let
  the user decide so a retry cannot silently duplicate the agent turn.
- This requirement belongs to the later copied Review functionality. It adds no
  mutation, messaging, acceptance criterion, or task to I1's read-only Now
  cockpit.

##### Settled future constraint — backlog retirement

- Idea/package 025 remains untouched and operational until the corresponding UI
  functionality has actually replaced it.
- Retire 025 only after that replacement is delivered and verified, not when it
  is merely planned or mocked. This records the user's confirmation of the
  already accepted intent and makes no change to 025.

##### Unresolved future question — Review submission return path

Where should a copied-Review submission land in Dude as its primary return path:
a `flag`, task evidence, or spec/plan revision input?

Recommendation: use `flag` as the primary path because the semantic brief is
already a well-formed mismatch, while allowing task-evidence attachment as a
secondary path when the review directly verifies active work.

Status: unresolved for the future Review feature.

##### Settled future constraint — pdf.js runtime assets and maintenance

> "Yes."

- Commit only the two browser runtime assets, `pdf.min.mjs` and
  `pdf.worker.min.mjs`, inside the Dude extension source/runtime tree.
- The standard Dude release bundle copies those committed assets with the rest
  of `.github/extensions/dude/`.
- Consumers and release builds perform no npm install, network fetch, or runtime
  compilation.
- Record the exact pdf.js version, the SHA-256 hash of each file, and the
  Apache-2.0 notice alongside the vendored assets.
- Provide exactly one maintainer-only refresh script. It obtains the chosen
  `pdfjs-dist` version with optional dependencies omitted, replaces exactly
  those two files, updates and verifies the recorded version and hashes, and
  leaves release output deterministic and offline.
- The refresh script is maintenance tooling only. It is neither consumer
  installation nor a release-time dependency step.

This accepted minimum-friction approach preserves the prior recommendation's
goal of install-free, offline PDF support while keeping occasional maintenance
reproducible. Consumer-side npm installation, on-demand dependency download,
runtime compilation, and reimplementing PDF rendering remain rejected. This
decision supersedes the earlier preference for release-time copying from a
pinned source dependency. It is a settled constraint for the later Review
feature cycle and does not enter I1 implementation scope.

##### Settled future constraint — agent-mediated answer writing

- Question-answer controls send the user's answer to the same active agent
  session as an explicit brainstorm/answer operation.
- The agent applies the answer under existing explicit brainstorm authority,
  refreshes dependent assumptions and logging as appropriate, and the UI
  re-reads the ledger after completion.
- The iframe does not write `Answer:` directly. The earlier direct-edit
  recommendation is superseded because it bypasses the desired agent
  interaction layer and does not refresh dependent artifacts or lifecycle
  history.
- The exact command or message sent remains discoverable and copyable.
- This is a settled constraint for the later answer-bearing feature cycle, not
  an unresolved future question and not an I1 capability.

#### Reconciliation disposition

This refresh addresses the review concern that deferred and superseded clauses
were still presented as active requirements. It records no independent
re-review, does not resolve the review's overall verdict, and claims no approval.

### Settled accepted intent — Microsoft Fluent 2 with Fluent UI React

> "Fluent 2 looks good and I'm going with it."

> "I do bleive an ui framework will bring advatajes such as concistence and maintainbility so yes UI frameworks is an option make a decision with bases on our needs, I'm open ot react, vue, Svelte… do a research on UI framworks , but when using FLuentUI, componnets from Microsoft"

#### Answered current question

Which visual system wins the Clearline-versus-Strata mockup comparison at
the design approval gate? The chosen method is to build the same surface in
both systems and compare the results. Whichever system loses should be
considered for removal so exactly one is enforced totally, as the brief
requires.

Answer: "Fluent 2 looks good and I'm going with it." The user approved the
rebuilt Fluent variant.

#### Current visual-system and framework authority

- Microsoft Fluent 2 is the chosen visual system. The Clearline-versus-Strata
  bakeoff is concluded; neither won, and neither is adopted for this feature.
  The original brief's mandate to adopt Clearline is superseded.
- Clearline and Strata remain installed in the repository deliberately. The
  user's explicit instruction was to "leave the packages clearline and
  fluent-ui as part of the repo." Retained package installation is therefore
  intentional and is not evidence that a visual system was adopted.
- A UI framework is adopted for consistency and maintainability, the benefits
  identified by the user. This supersedes the previously recorded
  framework-free decision.
- The selection chain is explicit and controlling: **Fluent 2 chosen →
  Microsoft Fluent components → Fluent UI React v9
  (`@fluentui/react-components`) → React**. Fluent UI React v9 is React-only,
  and the user's standing instruction requires Microsoft's components when
  Fluent UI is used.

#### Research findings — snapshot 1 September 2026

- `@fluentui/react-components` 9.74.7 is the current stable release. It is
  React-only and documents full support for React 17, 18, and 19, with React 19
  support available from 9.72.2.
- A minimal React runtime measured about 193.0 kB raw / 60.2 kB gzip. The Fluent
  umbrella entry measured about 1,259.9 kB raw / 318.8 kB gzip, but declares
  `"sideEffects": false`, so a real production build tree-shakes well below the
  umbrella measurement. The exact combined size for this application's
  component set was not measured and must not be asserted.
- Griffel, Fluent's CSS-in-JS engine, is not zero-runtime. It resolves and
  inserts atomic CSS at first render. Fluent packages ship processed styles,
  and optional build-time transforms can precompute more.
- `@fluentui/web-components` 3.1.3 is framework-agnostic, but v3 is a
  ground-up rewrite that removed Card and has no general read-only List; its
  Listbox has different semantics. Those are precisely the chooser-list and
  status-card shapes this panel needs. It also requires locally committed
  polyfills with modern Chrome/Edge floors. It was therefore not selected.
- Fluent React has no supported first-party no-build browser distribution. The
  maintainer-builds-and-commits model remains mandatory and is confirmed viable
  for React and Fluent.
- Fluent's published accessibility foundation is framed as WCAG 2.1 AA, while
  this feature's acceptance bar is WCAG 2.2 AA. Closing that gap is the
  feature's responsibility, not Fluent's.
- Fluent theming is real: `FluentProvider` emits flat token objects as CSS
  variables, while `createLightTheme` and `createDarkTheme` accept custom brand
  ramps, allowing tokens to map to host theme variables. Microsoft states that
  component styles remain the same regardless of theme, so component anatomy,
  spacing, and state treatment remain Fluent. Fluent is customizable, not
  visually headless; that constraint is accepted rather than treated as a
  defect.

#### Mockup findings and approval basis

- Three same-content variants were built at 380px for normal, blocked, and
  choose-a-feature states in light and dark under
  `.dude/specs/052-dude-canvas-ui/design/`: `variant-clearline.html`,
  `variant-strata.html`, and `variant-fluent.html`, with
  `now-visual-system-comparison.html` as the comparison entrypoint.
- The user rejected the first Fluent variant as looking bad. The root cause was
  a defective coordinator instruction that provided only one spacing value
  while requiring every value to resolve to a token. The builder consequently
  manufactured dimensions through token arithmetic: panel width as a spacing
  token times 31, 12×12px step markers, a 4px-padding underlined pseudo-link
  instead of a Fluent Button, and radius tokens used as padding, margin, and
  line-height.
- The Fluent variant was rebuilt with the complete Fluent scale: spacing
  2/4/6/8/10/12/16/20/24/32, six font sizes, six line heights, eleven radii,
  and four stroke widths. It uses correct Fluent anatomy: a 32px medium Button,
  a 24px large circular Badge, MessageBar status surfaces, ramp-paired type,
  and a 2px `colorStrokeFocus2` focus indicator. The user approved this rebuilt
  variant.
- One disclosed limitation remains. `colorNeutralStroke1`, Fluent's stock
  Button and Card border, fails WCAG 1.4.11 non-text contrast at 3:1: light
  `#d1d1d1` on `#ffffff` is 1.5:1, and dark `#666666` on `#292929` is 2.5:1.
  It was preserved verbatim rather than silently substituted so the user judged
  real Fluent. `colorNeutralStrokeAccessible` (`#616161` light, `#adadad`
  dark) would pass and is the likely theme-level remedy. Because this feature's
  bar is WCAG 2.2 AA, resolution during implementation is mandatory.
- Fluent's tightest point at 360px is the four-column lifecycle stepper.
  Fluent's 32px minimum button height plus 16px card padding also prevents a
  two-action panel header.
- The approved mockup is a faithful static representation of Fluent's visual
  language using real published token values. It is not a running Fluent React
  application, so component behavior still requires implementation-time
  verification.

#### Build and consumer contract

- Any prior prose implying that the UI ships without a maintainer build step is
  superseded. The maintainer now builds React and Fluent and commits the
  resulting static assets into the shipped extension directory.
- The consumer contract is unchanged and non-negotiable: consumers perform no
  npm install, network fetch, or runtime build. This is the same accepted model
  used for the two committed pdf.js browser assets.

### Accepted correction — fluid responsive host-canvas layout

> "I never said a narrow first design, That might have been an assumption of the model used in the first brainstom sessions"

The user accepted this replacement:

> "Fluid full-width layout; single column when space is genuinely narrow, progressively richer composition as space grows, including queue-plus-detail for Needs You. Text retains readable measures rather than stretching edge-to-edge. 360px remains a compatibility/accessibility test, not the design target."

#### Current layout authority

- Narrow-first was never the user's intent. The model-authored 360–480px-first
  clause and every coordinator claim that 380px was user-approved are
  superseded.
- The Dude canvas uses all available host canvas width responsively. It must not
  center the product inside a permanent 380px or 480px maximum-width shell.
- At genuinely narrow widths, capability collapses coherently to one column.
- As width grows, the UI may add useful columns or master-detail composition.
  Needs You uses queue-plus-selected-decision when enough width exists.
- Use bounded text measures inside the fluid layout. Full-width layout does not
  mean stretching prose edge-to-edge.
- Keep 360px as a minimum compatibility and accessibility test, not the default
  design target or a permanent product breakpoint.
- Derive representative narrow, medium, and wide tests from actual host behavior
  during implementation rather than hard-coding 380px or 480px as product
  breakpoints.
- Microsoft Fluent 2 and React with Fluent UI React v9 remain selected. This
  correction changes layout policy only.

#### Stale propagation requiring explicit definition reconciliation

- Current `spec.md`, `plan.md`, `tasks.md`, and `research.md` embed narrow-first
  and 360px, 380px, or 480px assumptions and are stale on this material UX rule.
- Existing 380px Now variants and the current Needs You prototype remain useful
  narrow-layout evidence, but are insufficient as final
  responsive-composition evidence.
- Explicit `@dude define dude-canvas-ui` must reconcile the package before
  implementation or final design approval.

## Open Questions

No current open questions. The deferred future Review-submission return-path
question remains unresolved roadmap input and does not block lifecycle 052.

## Assumptions

- **Coordinator working assumption:** This is captured as one ledger pending the
  user's answer to the split question; capture does not decide that all UI and
  Sharpie distribution work must remain one feature.
- **Coordinator-verified fact:** The brief's Sharpie capability and action
  claims have been checked against the local `E-G-C/sharpie` worktree at
  `/Users/eg/work/copilot-worktrees/sharpie/e-g-c-effective-winner` and are
  consistent with it. Sharpie remains a separate repository and is not vendored
  into `E-G-C/dude`.
- **Coordinator working assumption:** Capture makes no choice among Clearline
  and Strata, Sharpie packaging or harness-repository models, the post-absorption
  disposition of `048-backlog-canvas`, the scope of its `backlog-report`
  prerequisite, or six-slice scope.
- **Coordinator working assumption:** D1, D2, and D3 remain sequential gates.
  No UI coding begins until all three have been presented for review.
- **Accepted-intent correction:** The earlier working assumption that the
  disposition of `048-backlog-canvas` remained open is superseded. The user
  selected closure as resolved and superseded after its findings were carried
  into this ledger. Only the continuing scope of the `backlog-report`
  prerequisite remains open.
- **Accepted-intent correction:** The earlier working assumption that the
  `backlog-report` prerequisite remained open is superseded. Defined idea 025
  does not gate this feature: its capability is absorbed, 025 stays unchanged
  for now, and it is retired only after this feature's UI functionality
  replaces it in fact.
- **Accepted-intent correction:** The earlier working assumption that the
  Clearline-versus-Strata choice had to be made before definition is
  superseded. The comparison method is settled, Clearline installation is
  authorized, and the winner remains open until the durable mockup comparison
  reaches the design approval gate.
- **Accepted-intent correction:** The earlier working assumptions that Sharpie
  packaging, repository ownership, degraded operation, and a separate Sharpie
  distribution feature remained open are superseded. Sharpie's code is copied
  into this feature, the Dude extension lives in this repository, and there is
  no separate distribution feature or Sharpie-absent mode.
- **Accepted-intent correction:** The verified statement that Sharpie remains a
  separate repository and is not currently vendored describes the repository
  state at capture time, not the chosen implementation model. The source
  repository remains untouched; this feature will contain its own copy.
- **Accepted-intent correction:** The earlier assumption that this ledger was
  pending an answer to the Sharpie split question is superseded. This remains
  one bounded feature including the copied annotation capability.
- **Accepted-intent correction:** Sharpie is the user's own code. The prior
  hard-fork, external-upstream, external-attribution, and inherited-unfamiliar-
  code framing is superseded. The remaining external consideration is the
  third-party pdf.js licence and maintenance obligation; its runtime-asset
  distribution and refresh approach is now settled.
- **Accepted-intent correction:** The prior native-binary PDF constraint was
  overstated. Sharpie's browser-only path does not use the optional native
  packages. The two required pdf.js browser files are committed as ordinary
  bundled extension files under the settled version, hash, notice, and
  maintainer-only refresh constraints; consumers and release builds perform no
  dependency install, network fetch, or runtime compilation.
- **Accepted-intent correction:** Earlier statements and assumptions treating
  the entire broad UI brief, copied Sharpie review, backlog UI, UI writes and
  actions, or I1 through I5 as one bounded 052 completion unit are superseded
  only as completion scope. 052 may contain I0 as internal technical work and
  ships I1, the read-only Now cockpit. Deferred capabilities remain preserved
  as later product direction. D1 through D3 still gate 052 UI code, but their
  decisions and acceptance criteria are bounded to I1.
- **Accepted-intent correction:** Earlier source facts and recommendations about
  two registered canvases do not describe the chosen product architecture.
  There is one `dude` canvas, and the copied Sharpie code becomes its deferred,
  lazy-loaded, full-panel Review mode.
- **Accepted-intent correction:** Earlier `.copilot/annotations/` references
  describe the source implementation only. The copied implementation's durable
  review submissions use
  `.dude/specs/<feature>/reviews/<submission-id>/`; pre-definition work has no
  second persistent home.
- **Accepted-intent correction:** Review return routing is the only unresolved
  future-feature question and is not a definition question for 052.
  Answer-writing behavior is settled as agent-mediated interaction for its
  later feature cycle. The accepted pdf.js maintenance approach is a settled
  constraint for the later Review cycle and does not enter I1 scope.
- **Accepted-intent confirmation:** Package 025 stays untouched and operational
  until its corresponding UI replacement is delivered and verified; planning
  or mocking the replacement is insufficient for retirement.
- **Accepted-intent correction:** The visual-system winner is no longer open.
  Microsoft Fluent 2 is approved, Fluent UI React v9 and React are adopted for
  consistency and maintainability, and the prior Clearline mandate,
  Clearline-versus-Strata bakeoff, framework-free decision, and maintainer
  no-build implication are superseded. Deliberately retained visual-system
  packages do not change the selected system.

<!-- dude:managed:start -->
## Coordinator Log

- 2026-08-31 UTC - brainstorm first-capture draft created at `.dude/ideas/052-dude-canvas-ui.md`; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh recorded accepted absorption of `.dude/ideas/048-backlog-canvas.md`, verified Sharpie repository findings, and retained unresolved disposition, prerequisite, packaging, repository, visual-system, split, and increment choices; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh lifted the still-load-bearing verified findings from `.dude/ideas/048-backlog-canvas.md`, recorded the user's resolved-superseded disposition, and retained the unresolved scope of the `backlog-report` prerequisite; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh recorded deferred absorption and retirement of defined idea 025, settled the Clearline-versus-Strata mockup comparison method, recorded the define-before-bakeoff sequencing constraint, and retained the comparison winner, comparison surface, Sharpie shipping and split, and first-increment questions; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh recorded the accepted spec-package home for durable Sharpie annotation output, verified the centralized Sharpie storage seam and standalone fallback, and retained the exact package subpath as an open question; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh recorded the accepted hard fork of Sharpie into this feature, answered its shipping, split, and harness-repository questions, verified licence, adoption size, multi-canvas, and input-schema findings, and retained visual-system, comparison-surface, first-increment, annotation-subpath, return-path, canvas-shape, and upstream-relationship questions; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh corrected the prior hard-fork and external-upstream framing because the user authored Sharpie, replaced inherited-code and external-attribution claims with factual copy scale, recorded the verified third-party PDF dependency and native-binary distribution findings, and retained the standalone-product and PDF-shipping choices as open questions; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh recorded clean adoption with no ongoing Sharpie repository relationship, closed the standalone-product question as out of scope, corrected the overstated native-binary PDF constraint with verified browser-runtime and install evidence, and reframed PDF shipping around four options with vendoring recommended; definition deferred to explicit `define dude-canvas-ui`
- 2026-08-31 UTC - brainstorm refresh closed the comparison-surface question with Now at a 380px working target and 480px check, recorded accepted inspiration from Azure DevOps, GitHub Issues/Projects, and Jira, added coordinator concept mappings, UI patterns, and narrow-panel caveats, and retained the visual-system winner, first-increment, annotation-subpath, return-path, canvas-shape, and PDF-shipping questions; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh recorded accepted intent that answering session-produced open questions is a first-class UI job, added coordinator design input for a unified Needs you queue and existing user authority over answer slots, and retained seven unanswered questions including the direct-edit-versus-agent-applied answer path; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh recorded accepted design-phase adversarial critique using the on-demand general-purpose Rubber Duck rather than the completion-only retrospective agent, preserved the first advisory rejection and its ten findings, added verified task-state and release-packaging facts, updated the first-increment, annotation-subpath, and PDF questions, and added the release-packaging prerequisite question; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh cross-referenced the separate `design-stage-critique` idea at `.dude/ideas/053-design-stage-critique.md`, retained the on-demand `rubber-duck` advisor for this feature's design phase, and recorded that idea 052 does not depend on idea 053; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh recorded short, actionable delivery cycles as accepted product intent, corrected release packaging from an early-increment prerequisite to the late I6 distribution milestone, added the I0-I6 dogfood ladder and Dude canvas-name recommendation, updated the first-increment and release-packaging questions, and retained all nine answers as unresolved; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm correction recorded the Dude UI as an ordinary project-scoped GitHub Canvas extension in the existing bundle projection, limited core ownership to exact `.github/extensions/dude/**`, corrected the prior advisory distribution implication, removed I6 so the product ladder ends at I5 with I0 retained only as a technical spike, and closed the separate release-packaging question; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm correction recorded the authoritative 052 boundary as I1's read-only Now cockpit with I0 internal-only, accepted and resolved the independent review's scope-boundary red flag without resolving its overall rejection, bounded D1-D3 to that outcome, deferred I2-I5 and the broader UI surfaces to later dogfood-informed feature cycles without creating ledgers, and retained seven unanswered questions; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm correction replaced the false claim that `.dude/state/task-state.json` is authoritative with the accepted Tracked Execution, Lightweight Execution, and Definition Only authority rules, required the Now canvas to share `@dude status` authority and lane precedence without exposing glyph hashes in Tier 1, resolved only the state-authority review finding, and retained the broader Now-projection contract unresolved; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh settled exact-or-single-unambiguous-or-chooser feature selection with no recency inference, established `@dude status` as the semantic baseline for a richer read-only Now projection, clarified the original deliverables as floors, adopted the current-repository D1 inventory and all-conditions I1 inclusion test for coherent low-hanging additions, and retained stage, next-step, blocker, and freshness and error derivation for D1-D3 and specification; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh reconciled current authority to one `dude` canvas, settled copied Sharpie as a deferred lazy-loaded full-panel Review mode and durable review storage at `.dude/specs/<feature>/reviews/<submission-id>/`, reaffirmed post-delivery-and-verification retirement of untouched package 025, moved Review routing, pdf.js maintenance acceptance, and answer-writing out of 052's active questions, retained only the visual-system winner as currently open, and marked conflicting raw-brief clauses as superseded without claiming re-review or approval; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh recorded the user's acceptance of the minimum-friction pdf.js approach, settled exactly two committed browser runtime assets with adjacent version, SHA-256, and Apache-2.0 records plus one maintainer-only deterministic refresh script, retained Review return routing and answer-writing as the only unresolved future questions, and preserved the I1 boundary; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm refresh recorded the canvas as a task-specific graphical layer over the same active agent session, verified the send-and-response round trip and authoritative-state contract, settled agent-mediated answer writing, added later control-plane acceptance concerns, expanded I0's internal proof without reopening read-only I1, and retained Clearline-versus-Strata as the only current question and Review return routing as the only deferred unresolved question; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - brainstorm correction recorded that the canvas vision has always been the primary task-specific interaction layer and I1 is only its read-only first cycle, verified the copied Review attachment `displayName` contract mismatch affecting both report and screenshot while preserving session corruption as unverified reported behavior, made explicit attachment validation and report-only plus report-and-screenshot payload regression coverage non-negotiable for later Review, confirmed SDK `session.abort()` support while deferring abort UX and state reconciliation, preserved I1 and the existing current and deferred questions, and left Sharpie untouched; definition deferred to explicit `define dude-canvas-ui`
- 2026-09-01 UTC - define first definition established the I1 read-only Now cockpit package at `.dude/specs/052-dude-canvas-ui/spec.md`; visual direction remains exploring pending the Clearline-versus-Strata comparison and user approval
- 2026-09-01 UTC - define supporting source-backed D1-D3 artifact published at `.dude/specs/052-dude-canvas-ui/research.md`; independently reviewed as publication-ready and remains pending user review and acceptance before mock work
- 2026-09-01 UTC - brainstorm refresh recorded the user's approval of Microsoft Fluent 2, adopted the Fluent 2 → Microsoft Fluent components → Fluent UI React v9 → React chain for consistency and maintainability, and superseded the Clearline mandate, Clearline-versus-Strata bakeoff, framework-free decision, and maintainer no-build implication while preserving the install-free consumer contract
- 2026-09-01 UTC - brainstorm correction recorded that narrow-first was never user intent, replaced the model-authored 360–480px-first and claimed user-approved 380px rules with a fluid full-width responsive layout using coherent narrow collapse, richer composition as width grows, bounded text measures, and 360px as a compatibility and accessibility test, preserved Microsoft Fluent 2 with React and Fluent UI React v9, and marked `spec.md`, `plan.md`, `tasks.md`, and `research.md` stale pending explicit `define dude-canvas-ui`
- 2026-09-01 UTC - define re-definition reconciled Microsoft Fluent 2 with Fluent UI React v9 and React, replaced framework-free product UI with an esbuild maintainer-build-and-commit flow while preserving the install-free consumer contract, and replaced narrow-first fixed-width assumptions with an exploring fluid full-width responsive direction at `.dude/specs/052-dude-canvas-ui/design/fluent-responsive-workspace.html`
- 2026-09-01 UTC - design approval recorded: the user approved the desktop application shell after comparing it against the retained responsive panel and after the centre column was filled with source-backed Phases and Activity regions; `design_status: approved`, `approved_direction` set, and `preview_path` moved to `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`, which unblocks the I0 proof and the source-code tasks
- 2026-09-02 UTC - work review found no T002 code or security defect but rejected stale design-authority prose elsewhere in the package; the user-authorized temporary projection copied exactly `extension.mjs`, `lib/canvas-server.mjs`, and `ui/index.html` to `.github/extensions/dude/`, and T002 remains blocked only on real Copilot app reload/open/reopen/close evidence
- 2026-09-02 UTC - define re-definition reconciled package-wide authority to the approved Fluent 2 desktop application shell at `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` and narrowed T002's external-dependency blocker after provider registration was confirmed, leaving iframe rendering, viewport, reopen, and close evidence pending
- 2026-09-02 UTC - T002 host proof accepted after the user opened, resized, reopened, closed, and reopened the live `project:dude` canvas; registration, loopback rendering, viewport reporting, idempotent reopen, and cleanup evidence passed independent verification and review, T002 closed, and its resolved `blocked-by` metadata was removed
- 2026-09-03 UTC - define re-definition preserved the unchanged specification and approved product/UI boundary, replaced the defective I0 execution unit with T014@052host4, and corrected sequencing so full-app proof preparation occurs before Work, active T014 performs and cleans the proof without an app restart, and the post-Work env-unset host checkpoint blocks T008@052proj8 rather than T014
<!-- dude:managed:end -->
- 2026-09-02T20:46:00Z - execution blocker cleared for T003@052read3 after Feature 018 `autonomous-runstate-continuity` completed through its production adapter. The malformed-Assessment defect now classifies invalid input as `challenge-response-invalid`, preserves stale-only handling, emits fixed safe `Assessment: invalid-contract`, and retains no retry or normalization. T003 returned from `[!]` to `[~]` with its dependency unchanged; no Feature 052 implementation was performed in this action.
- 2026-09-02T21:15:00Z - Work blocked T003@052read3 (contract-mismatch) after implementation and verification succeeded but independent review rejected five projection defects: resolved lifecycle projected as Draft, valid zero-candidate inventory warnings suppressing the chooser, absolute filesystem-path leakage, a test-only `trackedIssues` authority bypass, and duplicated/divergent Beads normalization. The production Work adapter then hard-stopped before retaining those findings because `handleTrustedCapture` compared projected finding identities in occurrence-identity order against trusted findings in finding-identity order; the same five findings validate individually, and deterministic reconstruction isolated only this ordering mismatch. No T003 `dude-run-event` was appended, its dead claim/checkpoint pair was removed after confirming no worker survived, and all implementation/test changes remain for revision. Resolution requires correcting Feature 018's multi-finding settlement contract without collapsing or discarding findings, then resuming T003.
- 2026-09-03T01:08:54Z - execution blocker cleared for T003@052read3 after Feature 018 settled both the multi-finding identity-set comparison and the Tester-backed lint stream under the fixed 131,072-byte packet path. T003 returned from `[!]` to `[~]` with its implementation, focused tests, five independent-review findings, dependency, and zero-event state preserved for immediate address-review continuation.
- 2026-09-03T02:26:49Z - Work closed T003@052read3 through the rebuilt autonomous runtime. Result `ended / task-settled`; acceptedRevision 6; hostRevision 67; occurrenceIdentity `5566442492bc41862111740cc9dca84233732fb1b0a41275b22e888f39e99e0c`. The internal projection now handles resolved lifecycle exactly, preserves the warning-only empty chooser, emits typed repository-relative diagnostics, uses the real `bd` process seam, and shares one strict dependency-free Beads issue normalizer across canvas and Beads workflow callers. A final review revision removed all non-string authority coercion and required nonblank identity/title for executable tracked items. Evidence: focused helper/Beads/projection/extension/engine/current-format/backlog passed; full repository 2464 passed / 4 skipped / 0 failed; lint 0 failures; source/generated parity and diff clean; Tester PASS; independent Code Reviewer APPROVED.
- 2026-09-03T02:26:49Z - Work started T004@052send4: prove one injected canvas-originated `session.sendAndWait` round trip, completed-result surfacing, refresh/replay deduplication, active-turn abort, and authoritative-state reread while keeping all message, mutation, command, retry, answer, stop, and abort controls unreachable in I1.
- 2026-09-03T03:15:00Z - Work blocked T004@052send4 (contract-mismatch). The I0-only proof seam and 12 focused tests are implemented; extension 42/42 and full repository 2476 passed / 4 skipped / 0 failed, with dedupe, abort races, bounded results, authoritative reread, cleanup, typed failures, origin/Host rejection, default I1 route exclusion, no writes, and source/generated parity accepted. Independent review required a real Copilot-host iframe completion, replay dedupe, second-request abort acknowledgement, post-abort authoritative reread, no-write behavior, and cleanup. That missing-host result was legally projected and settled, then a no-code real-host retry was authorized. The exchange waited while the prior implementation/review cycle consumed its 30-minute window and hard-stopped `exchange-context-lost` before user interaction. T004 now has retained failed/review findings while the pending retry's invocation-local current-run and trusted captures died, making fresh authorization impossible; its dead claim/checkpoint was removed after confirming no worker survived. Do not set `DUDE_CANVAS_I0_PROOF` or restart the app for this dead invocation. Explicit definition must archive T004 as dropped-defective and create a fresh successor whose runner is started only after the host is prepared.
- 2026-09-03T11:05:00Z - execution reconciliation archived blocked T004@052send4 as dropped-defective with its exact retained approach and finding evidence, mapped every obligation and check to fresh successor T014@052host4 without inherited state or completion evidence, changed T008@052proj8 to depend on T014@052host4 and blocked it on the post-Work fresh-host checkpoint, and applied the pre-Work host-preparation external dependency to T014; preserved all prior history and approved design.
- 2026-09-03T11:22:00Z - T014@052host4 pre-Work host preparation completed on the fresh canvas at `http://127.0.0.1:53235/`: the exact proof route returned HTTP 400 for `{}` without starting a turn, confirming the running app inherited `DUDE_CANVAS_I0_PROOF=1`; launchctl was then unset while the prepared app and canvas remained running. T014 returned from `[!]` to `[ ]`. Do not restart the app before T014 settles.
- 2026-09-03T11:24:00Z - Work started T014@052host4 against the prepared proof-enabled canvas at `http://127.0.0.1:53235/`; the completion, replay, abort, reread, no-write, cleanup, proof-seam removal, and isolated cleaned-source checks must complete before any full app restart.
- 2026-09-03T13:15:40Z - Work closed T014@052host4 through the autonomous host adapter with result `ended / task-settled`, committed lane receipt, occurrenceIdentity `41bcd77dc443a167e6e605940abd6fce425fb166c0eab54e5dcb22c0fea28891`, fresh Tester PASS, and independent Code Reviewer approval. The real host proved bounded completion, replay deduplication, terminal abort reconciliation, authoritative rereads, no `.dude/` writes, and canvas/server cleanup; the temporary proof seam and positive fixtures were removed, 30 focused tests and 2,464 full-suite tests passed with four platform-conditioned skips, and isolated cleaned source returned 404 for both retired routes while remaining read-only.
- 2026-09-03T13:18:48Z - Cleared T008@052proj8's post-T014 external-dependency blocker after a full Copilot app relaunch with `DUDE_CANVAS_I0_PROOF` absent from launchctl and fresh canvas `http://127.0.0.1:61826/`: root and viewport returned HTTP 200, both retired proof routes returned HTTP 404, the rendered root exposed zero interactive controls or capability markers, and complete before/after manifests showed all 239 `.dude/` files byte-identical. T008 returned from `[!]` to `[ ]` with dependency T014@052host4 satisfied.
- 2026-09-03T13:19:47Z - Work started T008@052proj8 after the post-T014 full-host checkpoint passed; implement and verify the foundational immutable projection and its exact authority, selection, bounded-inventory, refresh, derivation, malformed-state, conflict, and content-identity behavior without adding a store, watcher, or state machine.
- 2026-09-03T16:31:04Z - Guarded completion closed T008@052proj8 after autonomous resume could not rebind prior invocation-local trusted captures to retained lane events. The completed projection now provides bounded summary-first selection, exact ownership and Definition/Lightweight/Tracked authority, async finite-duration Beads list/ready acquisition with cancellation and reaping, exact ready/list correlation, source-backed blocker and event derivation, immutable content identities, atomic freshness/refresh behavior, and closed read-only loopback APIs without a store, watcher, cache, state machine, or project writes. Fresh Tester verification passed 61 focused extension tests and 2,498 full-suite tests with four platform skips; a final coordinator run passed 430 targeted tests with zero failures; Dude lint had zero failures; source/generated parity held; and the independent Code Reviewer approved with no findings. The canonical task is `[x]`, the derived board was rendered, and T009@052core9 is next.
- 2026-09-03T17:35:49Z - Ship started T009@052core9 to implement the exact Dude canvas runtime projection allowlist across development build, release packaging, and rollback-bound upgrade paths while excluding authored frontend, tests, and maintainer build metadata and preserving unrelated extension directories.
- 2026-09-03T19:18:34Z - Guarded completion closed T009@052core9 after the autonomous adapter retained its first failed allowlist occurrence but later hard-stopped while projecting the corrected result. Development and release now copy only the exact Dude canvas runtime allowlist, exclude frontend, tests, source maps, dependency trees, and maintainer tooling, classify only deployed `.github/extensions/dude/**` as upgrade-owned, preserve unrelated extensions, and support current add/replace/remove/rollback plus historical-upgrader bootstrap. Fresh verification passed 291 focused tests and 2,509 full-suite tests with four platform skips; two empty-PATH 69-file releases were byte-identical; Dude lint had zero failures; and the independent Code Reviewer approved with no findings. T010@052now10 is next.
- 2026-09-03T20:22:43Z - Ship started T010@052now10 to add the scoped React 19 and Fluent UI React v9 maintainer build, deterministic committed browser assets, and the approved Fluent 2 desktop Now cockpit without exposing deferred interaction capabilities.
- 2026-09-03T23:40:44Z - Guarded completion closed T010@052now10 after the autonomous adapter timed out before receiving specialist evidence. The scoped private build now locks React and ReactDOM 19.2.8, Fluent UI React Components 9.74.7, and esbuild 0.28.2; emits deterministic committed `app.js` and legal notice assets; and ships the approved read-only Fluent 2 desktop Now cockpit with exact projection, chooser, refresh, freshness, source disclosure, responsive shell, and no deferred interaction capability. Fresh verification passed 243 focused tests and 2,527 full-suite tests with four platform skips; npm audit evidence recorded zero vulnerabilities before a later external registry timeout; the final bundle is 648,979 raw bytes and 185,668 gzip bytes; Dude lint had zero failures; FluentUI returned COMPLIANT; and the independent Code Reviewer approved with no findings. T011@052a11y1 is next for rendered accessibility and visual evidence.
- 2026-09-03T23:43:35Z - Ship started T011@052a11y1 to render the Fluent Now cockpit across required states, themes, widths, zoom, keyboard, focus, motion, and contrast conditions; correct any implementation mismatches; and retain visual/accessibility evidence without broadening into real-host dogfood.
- 2026-09-04T00:39:17Z - Work closed T011@052a11y1 with result `ended / task-settled`, occurrenceIdentity `e5324a002b7aa1137bd2f30da61b2be3554f3a60e84cb7deb0ddb1cf11f1ab99`, after direct Edge 133 CDP verification covered all required states, light/dark themes, widths 360 through 1920, 200% equivalent zoom, keyboard/focus, accessibility-tree semantics, reduced motion, computed contrast, projection APIs, no external requests, and ten indexed screenshots. The corrected shell activates its 340px right dock at 1080px, has no 360px overflow, and closes empty or filtered chooser dialogs on Escape with trigger focus restored. Fresh verification passed 2,538 full-suite tests with four platform skips; npm audit had zero vulnerabilities; the 185,834-byte gzip bundle stayed below budget; and the independent Code Reviewer approved with no findings.
- 2026-09-04T00:39:53Z - T012@052dog12 was blocked on the external real-host prerequisite: fully quit and relaunch the Copilot app so it loads the T010 runtime, then open a fresh Dude canvas and provide its exact loopback URL. No T012 Work adapter was started while waiting.
- 2026-09-04T00:43:00Z - Cleared T012@052dog12's external blocker after a full Copilot relaunch opened the fresh canvas at `http://127.0.0.1:53466/`: the prior `62516` server refused connections, root, `app.js`, and `/api/projection` returned HTTP 200, served `app.js` exactly matched current source, the retired proof route returned HTTP 404, and complete before/after manifests showed all `.dude/` files byte-identical. The fresh cockpit opened in chooser mode and T012 returned to `[ ]`.
- 2026-09-04T00:44:09Z - Ship started T012@052dog12 against the fresh real Copilot canvas at `http://127.0.0.1:53466/`; verify chooser and exact selected views, actual host-width compositions, approved shell regions, source details and freshness, one coordinator-log external edit followed by manual refresh, and screenshot/observation evidence without changing the product revision.
- 2026-09-04T02:16:29Z - Real-host review reopened the approved design to `proposed` and blocked T012@052dog12 with `design-gap`: the command-bar and page selectors duplicated the same job, the command selector required two clicks, slug-only rows retained oversized two-line spacing, and the first-five render made `dude-canvas-ui` appear absent even though live projection data contained it at index 47 of 50. The revised canonical mock must keep one command-bar selector, open a compact scrollable list on the first click, remove the page duplicate, and preserve scroll/filter access to every available slug before explicit re-approval.
- 2026-09-04T02:45:00Z - User-authorized Ship continuation approved the revised canonical feature-selection design at `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`: one command-bar Combobox, options on the first click, compact 36px slug rows, all 50 choices reachable by scroll or filtering, and no duplicate page selector. `design_status` returned to `approved`; the not-read return action remains because it only focuses the single selector.
- 2026-09-04T03:48:51Z - Implemented and independently approved the revised single-selector design. The command bar now contains the only chooser, opens its inline list on first focus or click, starts empty, renders all 50 source-ordered slugs in a compact five/eight-row scroll viewport, exposes `dude-canvas-ui` by scroll or filtering, and removes every Popover, portal, modalizer, focus trap, first-five truncation, and duplicate page selector. FluentUI returned COMPLIANT; build tests passed 18/18, Edge browser tests 10/10, server/projection 62/62, full recursive tests 2,539 with four platform skips, npm audit reported zero vulnerabilities, and the independent Code Reviewer approved with no findings. T012 was blocked only on reloading the real Copilot page and observing the final selector plus one external-edit freshness/manual-refresh cycle; T013 remains dependency-blocked.
- 2026-09-04T10:59:28Z - Real-host selector review confirmed the revised list now includes `dude-canvas-ui`, but exposed an implementation mismatch: the visible result-count hint overlaps and clips the first option because Fluent positions the inline listbox below the input while the authored Field hint occupies the same anchored space. T012 resumed at `[~]` for a narrow popup layout correction; the approved single-selector design remains unchanged.
- 2026-09-04T14:29:18Z - Real-host review reopened the selector design to `proposed` and blocked T012@052dog12 with `design-gap`: after an attempted selection, the canonical identifier remained as the controlled search query, opening the chevron therefore filtered the inventory to the current item, and the user had to delete text manually to change features. Live `/api/projection` still reported `status: choose` and `selected: null`, proving the displayed value could also masquerade as a committed selection after a failed refresh. The refinement must separate committed selection, displayed value, and filter query; preserve and visibly mark the current item while opening all choices; and keep failed selection state truthful.
- 2026-09-04T15:12:24Z - Approved the selected-state selector refinement from the user's explicit expected behavior and autonomous continuation instruction. The canonical mock now keeps one command-bar Combobox in selected and unselected states whenever navigation inventory exists, opens all choices on first interaction, preserves and marks the committed `NNN-slug`, treats typed text as a separate transient filter, restores committed truth after failed selection, and continues submitting only the semantic slug.
- 2026-09-04T16:58:13Z - Completed the selected/query implementation and harness review. Every complete projection now carries bounded navigation-only choices; the single command-bar Combobox separates committed selection, pending target, and transient query; opening shows all choices with the committed row marked; typing replaces and filters; Tab never commits; failed selection restores truth; and successful selection still submits the semantic slug. Final verification passed 116 focused tests and 2,546 full-suite tests with four platform skips, npm audit and Dude lint had zero failures, source/generated parity held, and independent Code Review approved with no findings. T012 was blocked only on reopening a fresh embedded Copilot canvas to load the final asset and complete real-host selector/focus plus external-edit/manual-refresh evidence.
- 2026-09-04T18:57:18Z - Cleared T012@052dog12's final real-host blocker after the user reloaded the project extension, selected `052-dude-canvas-ui` in the active Dude canvas at `http://127.0.0.1:58690/`, and reported that the result looked good. The live projection independently confirmed complete current Lightweight authority, the exact numbered owner and specification, all 50 navigation choices, and no diagnostics. T012 returned to `[~]`; this append-only event is the external repository edit for the remaining freshness and manual-refresh check.
- 2026-09-04T18:57:37Z - Regenerated T012@052dog12's derived board after removing its resolved `blocked-by:` metadata; the canonical task remained `[~]`.
- 2026-09-04T19:35:27Z - Closed T012@052dog12 after final real-host dogfood. Structured host telemetry covered narrow, medium, and wide layouts; the user accepted the refreshed selected view; the live provider exposed the exact `052-dude-canvas-ui` owner, all 50 choices, and no diagnostics; and the external-edit check moved freshness to `changed` before a read-only manual refresh returned `replaced: true` and `current`. Evidence package `t012-final/index.json` has SHA-256 `c3bc6ab3c5cf1d77f4dfa08f66607b3a8e8143af95b21378b4a366a792efdfdf`; fresh browser, projection, and server verification passed 83/83; and the independent Reviewer approved with no material gap. T013@052rel13 is next.
- 2026-09-04T19:35:54Z - Regenerated the derived Feature 052 task board after the verified T012@052dog12 close; T013@052rel13 is the sole ready task.
- 2026-09-04T19:36:11Z - Started T013@052rel13 for final unchanged-revision release verification: clean scoped rebuilds, focused and recursive tests, dependency and license audit, bundle budget and byte identity, development/release/upgrade allowlist inspection, workspace lint, prose and backlog checks, diff hygiene, and independent review.
- 2026-09-04T19:57:29Z - Independent review rejected T013@052rel13 on two release gaps: the linked legal file names MIT licenses without shipping their complete permission terms, and the historical-upgrader test performs a second current-engine plan that the supported same-ref workflow would not reach. The user also identified a final cockpit defect: the focal Next surface renders T013's entire internal verification contract as one `Title3`, including dependency wording and raw backticks. Source inspection confirmed that `FocalRegion` uses the full projected task description as its headline while `orientationText` removes only workflow tokens. T013 remains `[~]` for bounded release and presentation revisions followed by fresh verification and re-review.
- 2026-09-04T20:41:11Z - T013@052rel13 re-review accepted the complete metafile-derived license notices and the concise Next-card presentation, then rejected two newly exposed release-contract gaps. The browser harness imports Fluent packages before its missing-Edge skip, so a clean dependency-free CI checkout fails at module load; upgrade guidance and the seeded bundle manifest still describe only agents, skills, and instructions as upstream-owned even though the engine also owns `.github/extensions/dude/**`, and `docs/upgrading.md` still treats ref difference as the sole trigger. T013 remains `[~]` for clean-checkout-safe test loading and one consistent public ownership/byte-completeness contract.
- 2026-09-04T21:39:26Z - T013@052rel13 re-review repeated the upgrade-documentation finding after clean-checkout test loading, complete licenses, historical bootstrap behavior, and the concise Next card passed. `docs/commands.md` still omitted the core Dude extension from its exhaustive ownership list, and several surfaces incorrectly called the upgrader's ref-only script status `@dude status`, which is the separate workflow-orientation command. Under the active autonomous Ship policy, the repeated finding is retained without another permission prompt and routed to a different reviser for complete command-reference coverage and precise `upgrade.mjs status` terminology.
- 2026-09-04T21:52:46Z - Final independent review approved T013@052rel13 after the different reviser completed the five-surface upgrade contract, including `docs/commands.md`: global `@dude status` remains workflow orientation, the upgrade workflow's internal `upgrade.mjs status` is ref-only, `plan` is byte-authoritative, `.github/extensions/dude/**` is the exact core extension tree, every other extension is preserved, and historical same-ref repair requires a second fresh plan and confirmation. The approved revision also retains complete metafile-derived licenses, clean-checkout-safe test loading, partial-install failure behavior, and the concise Next card with exact source text in Evidence. Fresh coordinator completion verification remains before close.
- 2026-09-04T21:58:56Z - Closed T013@052rel13 and completed Feature 052 after final unchanged-revision verification and independent approval. Exact `npm ci` left the lock unchanged and audit found zero vulnerabilities; two clean builds matched committed and deployed bytes (`app.js` 635,624 bytes, SHA-256 `c2a9e3bb15be3487373d8414bab0cff570586450ed29ab4dde5cd8a1cddb1731`, gzip 180,230 of 358,400; complete legal notices 60,027 bytes, SHA-256 `b6c7ada06bc1777c08965b0f6941f246cffa7e34998bd357450f3faa0501bc70`). The installed recursive suite passed 2,556 with four platform skips, and a history-preserving dependency-free clone passed 2,525 with fifteen expected skips; lint, Compose, backlog, board, and diff hygiene had zero failures. All 13 canonical tasks are `[x]`; the completion-only advisory retrospective dispatch was recorded without changing closure authority.

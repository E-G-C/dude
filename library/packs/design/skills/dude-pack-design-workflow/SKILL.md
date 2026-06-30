---
name: "dude-pack-design-workflow"
description: "Use for visual/site design proposal workflows: mood, layout, look-and-feel, mockups, Hugo/Docsy surface design, brand direction, preview approval, and applying an approved visual spec."
---

# Design Proposal Workflow

Use this skill when the user wants to agree on a visual direction before changing a site or other rendered artifact.

## Purpose

Visual work needs a proposal loop before execution. The user approves what they can see, then Dude applies the approved design through the normal `specs/<feature>/tasks.md` execution board.

This is not a separate execution lane. With Beads removed, execution is implicit and singular: once a design proposal is approved, Dude defaults to `tasks.md` execution. The user should not have to name an execution mode.

## When This Activates

Load this skill for requests involving:

- visual design proposal, mockup, moodboard, design direction, look and feel
- page/section layout, card treatment, masthead, hero, nav, editorial or magazine treatment
- Hugo/Docsy rendered surfaces where the main question is visual direction
- brand fit, Microsoft visual-brand application, tokens, typography, spacing, color system
- "show me options", "agree on the visual elements", "before adding it to the website"

If the request is only a small implementation fix with no open visual direction, route normally to the owning specialist and use the standard execution path.

## Core Model

The approved proposal is the spec.

```text
brainstorm/<slug>.md
  -> specs/<feature>/spec.md        # design proposal, then approved design spec
  -> specs/<feature>/design/        # preview(s), screenshots, visual references
  -> specs/<feature>/tasks.md       # apply approved design through normal execution
```

`spec_path` still points to `specs/<feature>/spec.md`. A brainstorm can be `status: defined` once `spec.md` exists, even while the design proposal is still exploring or proposed. The design approval gate is controlled by `design_status` inside `spec.md`.

## Mock Iteration

Exploration is normally a **live mock loop**, not a writing exercise. During `design_status: exploring`:

- Build a throwaway `preview.html`, then **edit -> render -> screenshot -> user corrects -> repeat**. The screenshots are the evidence; a full `spec.md` is not required yet.
- **Refinements are ungated.** Size, spacing, copy, and color tweaks do not need an approval prompt. Only the eventual *direction* sign-off is gated.
- The scratch preview may live anywhere while exploring (for example under `design/`). Once `spec.md` exists, the accepted preview belongs under `specs/<feature>/design/` and `preview_path:` points at it.
- **Mirror:** if the mock already backs real proposal artifacts (a `proposed/` template or SCSS tree), mirror each accepted mock change into those artifacts in the same turn. If there is no proposal artifact yet, say the mock is still scratch-only.
- **Provenance:** every field shown in the mock must map to a real content or front-matter source, or be dropped. Do not ship invented sample values such as fake counts or estimated reading times into the real templates.
- **Buildable affordances:** every actionable element (button, link, form field, share / submit / feedback control) must map to a capability the static site can actually deliver, not just look real. See **Functional Realism** below. Do not mock server-dependent actions — submit feedback, share to Teams, email-this, like / save, login — as if they already worked.

**Settle.** When the user stops correcting a surface and moves on, or asks to wire it in, the direction has *settled* (`design_status: proposed`). At settle, backfill `spec.md` **Visual Intent**, **Proposed Direction**, and the **Revision Log** (retroactive entries are fine), and add a `## Coordinator Log` line in the brainstorm. Settle happens **before** approval; approval is the next gate.

## Functional Realism

A mock is a proposal for something the site can actually become, not just a picture. Every element a viewer could act on — button, link, form field, share / submit / feedback control, toggle, menu — must map to a capability this site can really deliver. If an element cannot be wired to something real, it does not belong in the mock, however good it looks.

This is a **static Hugo/Docsy site with no backend**, so anything that needs server-side processing or per-user state cannot be built as drawn. Treat these as **not buildable** unless there is a concrete static-compatible mechanism:

- submit feedback / contact / comment forms that post to a server
- "share to Teams" or "send via email" as in-app actions, or any server-sent message
- like / save / bookmark / subscribe that persists per user
- login, gated content, or anything that reads a signed-in identity
- server-side search-with-write, voting, view counters, or live data that changes without a rebuild

An actionable element is valid only when it connects to something real:

- a link to a page, section, or anchor that exists (or will exist) on the site
- a `mailto:` link, or a deep link to a real external service (a real Teams / Forms / SharePoint URL)
- client-side-only behavior that runs in the browser (expand / collapse, copy-to-clipboard, filtering already-rendered content)
- content or front matter that genuinely exists on the page

When a design idea wants a capability the static site cannot provide, resolve it **before** drawing it as a finished affordance:

1. replace it with a real static-compatible equivalent (a `mailto:` or a real Forms / Teams link instead of a fake "submit feedback" button), or
2. drop the element and record the limitation under `## Scope And Surfaces` (out of scope) or `## Assumptions`, or
3. flag it as `design-gap` and route it back instead of approving a mock that cannot be built.

Fail fast on the page, not after approval. A great-looking mock with an affordance that can't exist forces the whole loop again — approve, try to build, discover it's impossible, strip it, redo the mock. Catch it while it is still a cheap edit.

## Design-Shaped `spec.md`

Design `spec.md` uses standard frontmatter plus the design status:

```yaml
---
title: Feature title
slug: feature-title
work_type: design
design_status: exploring # exploring | proposed | approved
approved_direction:
preview_path: specs/001-feature-title/design/preview.html
---
```

Use these sections, omitting sections that do not materially apply:

```markdown
# Design Proposal: Feature Title

## Visual Intent

### Should Feel
- ...

### Should Never Feel
- ...

## Scope And Surfaces
- Surface(s) in scope
- Out of scope
- Internal/external scope guard

## Brand Fit
- Existing tokens/patterns to reuse
- Explicit "do not invent" constraints
- Accessibility constraints, including WCAG AA contrast

## Direction Options

### Option A - <name>
- Mood
- Layout
- Components
- Color / type / spacing approach
- Preview: [preview.html](design/preview.html)

### Option B - <name>
- ...

## Proposed Direction
- Selected option or hybrid
- Why it fits the site
- What changed from earlier rounds

## Visual Success Criteria
- VSC-001: The preview is scannable in <specific context>.
- VSC-002: The surface uses existing brand tokens, not raw brand hex values.
- VSC-003: The rendered result matches the approved preview at the agreed breakpoints.
- VSC-004: Brand check passes and contrast is WCAG AA.

## Revision Log
- YYYY-MM-DD HH:MM UTC - proposed Option A
- YYYY-MM-DD HH:MM UTC - user requested ...
- YYYY-MM-DD HH:MM UTC - approved Option A

## Assumptions
- ...
```

`plan.md` is optional and lean for design work. Use it only when the implementation "how" matters, for example which Hugo templates, partials, shortcodes, SCSS files, or tokens will realize the approved look.

## Preview Assets

Store rendered proposal assets under:

```text
specs/<feature>/design/
  preview.html
  screenshots/
  references/
```

Prefer one preview at first. Use multiple options only when the direction is genuinely open. Do not create visual variants just to fill a template.

## Approval Gate

Execution must not touch the live site until the proposal is approved.

Accept direct approval phrases such as:

- `approve direction A`
- `approve the proposed direction`
- `approved`
- `use this design`

On approval:

1. Set `design_status: approved` in `spec.md`.
2. Set or update `approved_direction:`.
3. Append a revision-log entry in `spec.md`.
4. Append a coordinator-log entry in the companion brainstorm.
5. Say: `This is a normal checkpoint, not an error.`
6. Then allow execution from `tasks.md` when the user wants implementation.

If the user asks to implement before approval, stop and ask for approval or revision instead of proceeding.

## Task Generation

After approval, derive `tasks.md` normally. Design tasks should be phrased as applying the approved spec to concrete surfaces, for example:

```markdown
- [ ] T001@a1b2c3d4 [P] [US1] Apply approved news-card visual treatment to layouts/_shortcodes/news-card.html and assets/scss/_styles_project.scss
```

Keep task IDs, glyphs, dependencies, board fences, and coordinator-only mutation rules exactly as defined in `dude-feature-definition` and `dude-lightweight-execution`.

## Design Close Protocol

When an implementation task applies an approved design, close it only after fresh visual evidence:

1. Render or build the relevant surface (for this repo, prefer the existing Hugo/Docsy build/server command).
2. Capture or inspect the rendered surface at the relevant breakpoints.
3. Run the Microsoft visual-brand drift guard when the task touches rendered Hugo/Docsy surfaces:
   - `pwsh .github/skills/dude-pack-ms-brand-visual/scripts/brand-check.ps1`
   - or `bash .github/skills/dude-pack-ms-brand-visual/scripts/brand-check.sh`
4. Confirm every displayed field traces to real page content, front matter, or site config, and every actionable element (link, button, form, share / submit control) resolves to a real destination or client-side behavior — no invented sample values and no fake or server-dependent affordances. See **Functional Realism**.
5. Compare the result to the approved preview in `spec.md`.
6. Route visual quality judgment to `@dude-pack-ms-brand-stylist` when brand or visual identity is material.
7. Classify the result using the Post-Implementation Refinement Loop below.
8. Only when the result matches the approved spec and works in the real rendered context may the coordinator mark the task `[x]` in `tasks.md`.

If visual evidence fails, leave the task open or blocked and route the issue with `@dude flag ...`.

## Post-Implementation Refinement Loop

The real rendered page is the final visual context. Sometimes a proposal looks right in preview but needs adjustment once implemented in the actual site. Treat that as a first-class design refinement, not as a generic implementation failure.

Classify visual review results into exactly one bucket:

| Bucket | Meaning | Coordinator action |
| --- | --- | --- |
| **Matches approved spec** | The implementation matches the approved design and works in context | Keep `design_status: approved`; close the task after verification |
| **Implementation mismatch** | The approved spec is still right, but the page does not match it | Keep `design_status: approved`; keep the task `[~]` and route back to the implementer |
| **Design refinement needed** | The approved spec looked good in preview, but the real page reveals the design needs adjustment | Change `design_status: proposed`; append a revision-log entry; mark the current task `[!]` with `blocked-by: design-gap: <reason>`; stop execution until re-approved |
| **New scope / new idea** | The user wants something beyond the approved proposal | Keep the current work stable; route back through brainstorm/definition for a new or expanded package |

When reopening an approved proposal for refinement:

1. Change `design_status: approved` to `design_status: proposed`.
2. Keep `approved_direction:` as historical context unless the direction is explicitly withdrawn; add a note in `## Revision Log`.
3. Append a `## Revision Log` entry such as `YYYY-MM-DD HH:MM UTC - reopened after implementation: <reason>`.
4. Append a companion `## Coordinator Log` entry in `brainstorm/<slug>.md`.
5. Mark the affected task `[!]` and add:

   ```markdown
   blocked-by: design-gap: approved proposal needs refinement after live-context review
   ```

6. Say: `This is a normal checkpoint, not an error.`
7. Require explicit re-approval before execution resumes.

Use `design-gap` when reporting or flagging this blocker. A design-gap is a design-specific subtype of `spec-gap`; route it to `@dude-spec-lead` with `dude-pack-design-workflow` loaded, and include the rendered evidence that triggered the refinement.

## Routing

- Use `@dude-spec-lead` for maintaining brainstorm metadata and the design-shaped `spec.md` package.
- Use the owning Hugo/Docsy specialist for site-specific implementation or template decisions.
- Use `@dude-pack-ms-brand-stylist` as visual quality authority for internal Microsoft-branded surfaces.
- Use `@dude-reviewer` only when an independent readiness judgment is needed.

## Avoid

- Do not create a separate `design-brief.md` plus `design-proposal.md`; the approved proposal is `spec.md`.
- Do not ask the user to choose an execution lane; execution defaults to `tasks.md`.
- Do not implement into the live site before `design_status: approved`.
- Do not keep executing when the rendered implementation exposes a `design-gap`; reopen the proposal and require re-approval.
- Do not mock affordances the static site cannot deliver (submit feedback, share to Teams, email-this, like / save, login, server-side forms) as if they were real; map every actionable element to a real destination or client-side behavior, or drop it. See **Functional Realism**.
- Do not invent a new color system, typography system, or logo treatment when existing tokens/patterns apply.
- Do not route external/customer-facing Microsoft brand questions through this workflow; redirect to Microsoft Brand Central.

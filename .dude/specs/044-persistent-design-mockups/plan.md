# Implementation Plan: Persistent Design Mockups

## Summary

Generalize the authoritative design workflow under `library/packs/design/`
from a fixed `preview.html` artifact to one format-neutral primary mock whose
actual workspace-relative filename and extension live in `preview_path`.

Keep required supporting files under the same `design/` directory and retain
one primary orientation authority. Permit useful external references under
`design/references/` for context without allowing them to become live
authority.

Generalize the correction loop to cover compose or edit, render or export or
capture, inspection, and correction. The binding evidence contract continues
to require screenshot evidence wherever applicable. Direct inspection of an
inherently viewable artifact may establish its visible output without a
separate image screenshot solely to duplicate it, but cannot waive otherwise
applicable screenshot evidence.

Update the existing colocated focused contract, refresh the installed design
pack through Compose, and verify exact source/projection parity and all retained
gates. No core change is planned. Concrete contrary evidence requires a
redefinition stop before any core expansion.

The exact feature identity is
`.dude/specs/044-persistent-design-mockups/spec.md`, exactly owned by
`.dude/ideas/persistent-design-mockups.md`.

This feature has no progress objective and no ObjectiveRegistry region.

## Technical Context

**Authoritative Source**:
`library/packs/design/skills/dude-pack-design-workflow/SKILL.md`.

**Focused Contract**:
`library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs`.

**Installed Projection**:
`.github/skills/dude-pack-design-workflow/SKILL.md`, maintained through
`dude-compose`.

**Pack Boundary**: `library/packs/design/pack.md` remains unchanged unless
implementation produces concrete contradictory evidence. Its standalone,
generic-quality, capability-envelope, and no-registry contracts are compatible
with format-neutral artifacts.

**Testing**: Section-bound prose contracts, labeled deletion or weakening
probes, unchanged pack-independence checks, Compose verification, exact
authoritative/installed parity, recursive Node.js tests, workspace lint,
writing repetition inspection, backlog freshness, diff hygiene, and final path
inspection.

**Storage**: Existing Markdown source, existing focused test, installed
projection, and Compose-owned profile metadata. No new supporting artifact,
registry, state carrier, service, daemon, command, or automatic Git behavior.

**Constraints**:

- Edit authoritative pack source rather than the installed projection.
- Preserve all existing design lifecycle, evidence, and quality gates.
- Keep useful external references contextual and non-authoritative.
- Keep product source separate from proposal artifacts.
- Preserve exact owner and active-lane authority.
- Do not change core without concrete current evidence and redefinition.
- Do not apply a design approval gate to this workflow-prose feature.

## Specification Quality Validation

- Four prioritized, independently testable stories cover format-neutral
  persistence, tool and external handoff, retained evidence and design
  safeguards, and the smallest implementation boundary.
- Acceptance scenarios cover actual extensions, multi-file artifacts, one
  primary entrypoint, MCP/tool export, bounded external references, exact
  reporting, resume inspection, missing files, define-before-output, applicable
  screenshot evidence, nonredundant direct inspection, capability-relative
  realism, and product-source separation.
- FR-001 through FR-021 state observable behavior without prescribing source
  edits or test implementation.
- SC-001 through SC-009 express measurable technology-agnostic outcomes.
  Focused tests, Compose parity, and changed-path inspection remain plan-owned
  verification mechanisms rather than specification outcomes.
- No unresolved clarification marker remains.
- The specification excludes a design approval gate for implementation of this
  workflow-prose feature.

The specification satisfies its WHAT/WHY gate by inspection. This is not a
lint, publication, execution, or readiness claim.

## Verified Current Topology

1. The authoritative workflow already stores its live mock under
   `.dude/specs/<feature>/design/`, rejects temporary live mocks, requires
   explicit definition, reports `preview_path`, resumes the existing file, and
   separates proposal assets from product source.
2. The same workflow hard-codes `preview.html` in the core-model definition
   example, mock-iteration rules, design-shaped specification example,
   direction-option example, preview-assets tree, product-source warning, and
   resume guidance.
3. Its correction loop is phrased only as
   `Edit -> render -> screenshot -> user corrects -> repeat`, which does not
   describe document, image, slide, canvas, export, or other directly
   inspectable artifact workflows accurately.
4. The focused `design-workflow.test.mjs` directly asserts the HTML-only path
   and correction-loop wording. It is the correct existing test owner to
   update; no second test module is needed.
5. `library/packs/design/independence.test.mjs` separately pins standalone pack
   behavior, generic capability-relative realism, accessibility, provenance,
   and absence of visual-system machinery. It remains unchanged.
6. The package shape already includes `design/references/`; retaining useful
   external references there introduces no new state or authority.
7. The design pack profile already points to
   `/Users/eg/work/dude/library/packs`; no profile source correction is planned.
   Compose retains sole authority over any profile consequence.
8. The installed workflow is generated output and carries the same HTML-only
   contract. It must change only through `compose refresh design`.
9. No inspected current caller or test proves that core status, a registry, a
   new command, or another persistence mechanism is required.

## Chosen Design

### 1. Generalize the authoritative workflow

Skill Smith owns changes only to
`library/packs/design/skills/dude-pack-design-workflow/SKILL.md` and loads:

- `dude-skill-authoring`;
- `dude-pack-writing-style`;
- `dude-pack-writing-avoid-ai-tropes`;
- `dude-pack-design-workflow`; and
- project context and memory.

Keep the frontmatter name and trigger description unchanged. Refine existing
sections instead of adding a parallel workflow.

1. In `## Core Model`, retain the brainstorm/define boundary but replace the
   fixed HTML path with the contract that definition records the selected
   primary artifact's exact workspace-relative filename and actual extension
   in `preview_path`.
2. State that format is selected for the target and intended output. Give
   varied examples only where useful and explicitly state that they are not an
   allowlist.
3. In `## Mock Iteration`, define the first actual output as the canonical
   primary mock under `.dude/specs/<feature>/design/`, with every required
   supporting asset, source, export, variant, or page colocated there.
4. Keep the primary `preview_path` as the sole orientation entrypoint through
   exploring, proposed, and approved. Supporting artifacts and external
   references do not become another live authority.
5. Require output created through MCP or another tool to be exported or saved
   under `design/`. Permit useful external references to be recorded under
   `design/references/` for context, but state that neither a reference nor an
   external session can become `preview_path`, replace the artifact set, or
   hold live authority.
6. Require every create, update, and resume response to report the exact actual
   `preview_path`, without substituting `preview.html`.
7. On resume, inspect the primary artifact and its required supporting files.
   Report any missing exact path and stop instead of recreating, replacing,
   abandoning, or superseding the artifact set.
8. Preserve external-content handoff by copying, moving, saving, or exporting
   the accepted primary artifact and required supporting files into `design/`
   before continuation.
9. Generalize the live correction loop to edit or compose, render or export or
   capture as appropriate, inspect, receive user correction, and repeat.
   Preserve the binding requirement to capture and retain screenshot evidence
   wherever applicable. Permit direct inspection of an inherently viewable
   artifact without demanding a separate image screenshot solely to duplicate
   its visible output, while stating that direct inspection does not waive any
   otherwise applicable screenshot evidence.
10. Update the design-shaped specification and preview-assets examples so they
    communicate actual-path and bounded-reference semantics without
    establishing a default extension.
11. Keep proposal artifacts under `design/` and product implementation in the
    target's normal source directory.
12. Preserve settle-before-approval, explicit approval, ungated refinement,
    provenance, accessibility, contrast, post-implementation refinement, exact
    ownership, and active-lane behavior.
13. Preserve capability-relative functional realism: the actual target's
    implementation owner declares the capability envelope, and no fixed static
    or dynamic assumption replaces it.
14. Keep persistence bounded to ordinary repository/worktree files. Add no
    registry, revision database, cache, state store, daemon, autosave service,
    background process, duplicate workflow, command, or automatic Git action.
15. Keep design resume and orientation inside this workflow. Do not edit core
    absent concrete current proof and redefinition.

Do not add `work_type: design`, `design_status`, a mock artifact, or a design
approval gate to Feature 044 itself.

### 2. Refresh the focused workflow contract

Tester owns only
`library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs`
and verification. Reuse the existing file-relative read, section extraction,
and whitespace-normalized assertion helper.

Replace superseded HTML-specific expectations and add section-bound labeled
checks for:

- primary format selection based on target and intended output;
- varied examples being illustrative rather than an allowlist;
- the primary artifact's exact actual filename and extension in `preview_path`;
- retention of `preview_path` through exploring, proposed, and approved;
- colocation of required assets, sources, exports, variants, or pages;
- one primary orientation entrypoint and no second live authority;
- MCP and other tool output exported or saved under `design/`;
- useful external references recorded under `design/references/` only for
  context;
- references and external sessions never becoming `preview_path`, replacing
  the artifact set, or holding live authority;
- exact actual-path reporting on create, update, and resume;
- restart inspection of the primary artifact and required supporting files;
- exact missing-file reporting and a stop instead of silent replacement;
- external or scratch artifact-set handoff before continuation;
- explicit define-before-first render, export, or capture;
- generalized edit/compose, render/export/capture, inspect, and correction;
- screenshot evidence captured and retained wherever applicable;
- direct inspection without a separate duplicative image screenshot for every
  inherently viewable artifact;
- direct inspection never waiving otherwise applicable screenshot evidence;
- design-package and product-source separation;
- settle, approval, ungated refinement, provenance, accessibility, contrast,
  post-implementation refinement, exact ownership, and active-lane behavior;
- functional realism against the actual target owner's declared capability
  envelope;
- closed prohibited capabilities and the concrete-proof stop for core; and
- no design approval gate for this workflow-prose feature.

Give each obligation its own useful failure label or a narrow grouped label
whose deletion proves the complete grouped behavior. Use deletion or weakening
probes rather than broad semantic contradiction regexes. Preserve unrelated
existing focused tests.

Tester reports workflow-prose defects to Skill Smith and corrects test defects
within the one focused file. Tester does not edit authoritative prose,
installed projection, profile, task state, Coordinator Log, board, backlog, or
execution history.

### 3. Refresh the installed design projection

After authoritative source and focused tests agree, the coordinator owns the
Compose lifecycle:

```bash
node .github/skills/dude-compose/compose.mjs refresh design --dry-run --json
node .github/skills/dude-compose/compose.mjs refresh design --json
```

The dry run must identify the installed workflow as a replacement and no
unexpected addition or removal. The applied refresh must follow the existing
transaction path. No specialist hand-edits
`.github/skills/dude-pack-design-workflow/SKILL.md` or
`.dude/metadata/profile.md`.

After refresh, require byte-for-byte equality between:

- `library/packs/design/skills/dude-pack-design-workflow/SKILL.md`; and
- `.github/skills/dude-pack-design-workflow/SKILL.md`.

If `pack.md` materially contradicts the generalized rule, stop before editing
it and route a bounded manifest correction to Pack Smith. Current inspected
prose does not establish such a task.

### 4. Preserve pack independence and bounded paths

Run the unchanged `library/packs/design/independence.test.mjs` and Compose
verification. Confirm that the workflow:

- remains standalone;
- names no default implementation specialist or fixed visual system;
- evaluates realism against the actual target owner's declared capability
  envelope;
- retains generic accessibility, contrast, provenance, and evidence gates; and
- introduces no registry, adapter, schema, or other persistence machinery.

Expected semantic implementation changes are limited to:

- `library/packs/design/skills/dude-pack-design-workflow/SKILL.md`;
- `library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs`;
  and
- `.github/skills/dude-pack-design-workflow/SKILL.md` through Compose.

`.dude/metadata/profile.md` may change only as a legitimate Compose-owned
consequence. Current topology supplies no expected source-identity change.

Any core source, generated core, product source, `pack.md`, new test module,
supporting artifact, persistence subsystem, registry, command, daemon, or
automatic Git behavior is a stop for scope review. Definition, Coordinator Log,
task state, board, backlog, and history composition remain coordinator-owned
workflow consequences.

## Test Strategy

### Focused workflow checks

Tester runs:

```bash
node --test library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs
node --test library/packs/design/independence.test.mjs
```

For each new or generalized obligation, Tester performs a deletion or weakening
probe and confirms that the owning assertion fails with its own useful label.
Existing lane, ownership, lifecycle-log, new-scope, realism, provenance,
accessibility, and independence checks remain preservation evidence.

Prior HTML-only task history is not generalized completion evidence. All
format-neutral checks require fresh results over the refreshed revision.

### Projection and pack checks

After the coordinator refreshes `design`, Tester verifies exact authoritative
source/installed parity and runs:

```bash
node .github/skills/dude-compose/compose.mjs verify --json
```

Require zero pack failures and zero leftovers. Evaluate warnings against the
documented baseline rather than hiding them. Rerun focused workflow checks after
refresh so parity and test evidence apply to the same revision.

### Writing checks

Apply `dude-pack-writing-style` and
`dude-pack-writing-avoid-ai-tropes` during authoring. Run:

```bash
node .github/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs library/packs/design/skills/dude-pack-design-workflow/SKILL.md library/packs/design/pack.md
```

Treat repetition output as review evidence. Preserve necessary contract terms
while consolidating avoidable duplicate instruction blocks.

### Integrated acceptance

Over one unchanged integrated revision, Tester runs:

```bash
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-lightweight-execution/backlog.mjs check --root .
git diff --check
git status --porcelain --untracked-files=all
```

The coordinator owns any backlog regeneration or workflow-state mutation before
the read-only freshness check. Require zero lint failures. Inspect the complete
path list and diff, confirm exact source/projection parity, and confirm that no
core, product source, manifest, supporting artifact, persistence subsystem, or
new command was added.

Use the focused checks to measure SC-001 through SC-006 and SC-009, exact
authoritative/installed parity to measure SC-007, and final path inspection to
measure SC-008. These are plan-owned verification mechanisms, not specification
outcomes.

Reviewer receives the unchanged revision, focused deletion evidence, complete
test results, Compose verification, exact parity result, repetition report,
backlog freshness result, lint result, diff check, and final path inspection.
Reviewer loads `dude-reviewer-protocol`, remains read-only, judges contract and
prose quality, and returns `APPROVE`, `REJECT`, or `ESCALATE`.

## Phases And Task Mapping

| Phase | Deliverable | Task |
|---|---|---|
| 1 | Format-neutral authoritative design-workflow prose | `T001@c4a91e72` |
| 2 | Focused generalized contracts and deletion evidence | `T002@6f38b2d5` |
| 3 | Compose projection and integrated verification | `T003@a17d5c84` |
| 4 | Independent final acceptance | `T004@e92b704f` |

## Requirements Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-010 / SC-001 through SC-004 | Chosen Design sections 1 and 2; artifact-set, bounded-reference, path, resume, and handoff checks | `T001@c4a91e72`, `T002@6f38b2d5`, `T004@e92b704f` |
| FR-011 through FR-014 / SC-004, SC-005 | Definition boundary and binding correction/evidence contract | `T001@c4a91e72`, `T002@6f38b2d5`, `T004@e92b704f` |
| FR-015 through FR-017 / SC-006 | Preserved approval, quality, ownership, and lane gates | `T001@c4a91e72`, `T002@6f38b2d5`, `T003@a17d5c84`, `T004@e92b704f` |
| FR-018 through FR-021 / SC-008, SC-009 | Product-source boundary, smallest-design exclusions, and no design gate | `T001@c4a91e72`, `T002@6f38b2d5`, `T003@a17d5c84`, `T004@e92b704f` |
| SC-007 | Compose refresh and exact authoritative/installed parity | `T003@a17d5c84`, `T004@e92b704f` |
| All requirements and criteria | Unchanged-revision evidence and independent acceptance | `T003@a17d5c84`, `T004@e92b704f` |

## Risks

- HTML-specific wording appears in several workflow sections and test
  expectations. Updating only the primary rule would leave contradictory
  defaults elsewhere.
- A multi-file mock can accidentally acquire two authorities if supporting
  source and exported output are both described as primary. `preview_path` must
  select exactly one orientation entrypoint.
- An external reference can accidentally be treated as durable output.
  References must remain contextual under `design/references/`.
- Evidence wording can either omit useful screenshot capture or impose
  redundant screenshots on inherently viewable files. The binding contract
  must preserve applicable screenshots and the narrow direct-inspection rule.
- Broad presence assertions can pass after a lifecycle obligation is weakened.
  Section-bound labeled deletion probes are required.
- Existing execution history proves only the earlier HTML-specific tasks. It
  must remain preserved without closing the broadened successors.
- Core status expansion and new persistence machinery remain tempting but have
  no demonstrated current caller. Concrete contrary evidence requires
  redefinition before scope expands.
- Workflow activity during Ship may affect coordinator-owned task, log, board,
  backlog, or profile bytes. Final path inspection must distinguish those
  consequences from specialist implementation scope.

## Supporting Artifacts

None. The specification, plan, canonical task units, authoritative workflow,
existing focused contract, and unchanged independence contract are sufficient.

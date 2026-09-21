# Feature Specification: Canvas Without Beads

**Intent source:** `.dude/ideas/066-canvas-without-beads.md`
**Canonical specification:** `.dude/specs/066-canvas-without-beads/spec.md`

## Outcome

Canvas must discover and display real Lightweight work when optional Beads is unavailable. A confirmed Lightweight-only workspace shows its normal recorded status without an optional-Beads warning. Failure to read a required tracked authority must remain visible and must never make a markdown mirror authoritative.

## User Scenarios And Acceptance

### US1: Read work without an unused tracker (P1)

As someone using Lightweight Execution, I can find my work and inspect its recorded progress without installing or repairing an optional tracker.

**Independent test:** Use a disposable, exactly owned feature with four canonical tasks, one in each state: open, in progress, blocked, and done. With tracking confirmed unused and its executable unavailable, inspect both the work inventory and the selected feature. Both must show those exact counts and their existing status semantics; selected detail must retain the recorded instructions, next task, and blocker.

Acceptance scenarios:

1. Given that Lightweight-only workspace, when Canvas reads or refreshes it, the feature is discoverable with current canonical progress and no warning caused solely by optional Beads absence.
2. Given a successfully read empty tracked board, or a confirmed absent database without conflicting tracked evidence, Canvas uses the existing canonical lifecycle rules. All-open packages remain defined but unstarted; draft and resolved ideas retain their existing discovery behavior.
3. Given a populated tracked board, its facts take precedence even when the selected feature is absent from that board or no tracked task is executable. Missing mappings, failed authority reads, and failed readiness reads never receive markdown backfill.
4. Given tracking configuration, initialization evidence, or unresolved authority uncertainty, an unavailable tracker leaves affected work status unavailable. Readable inventory remains discoverable without invented progress.
5. Given authority or counted-source changes during acquisition, freshness checking, or refresh, Canvas withholds unconfirmed facts or qualifies the retained last complete view. It never presents a mixed read as current.
6. Opening, selecting, checking freshness, and refreshing leave repository and tracked work unchanged.

## Functional Requirements

- **FR-001:** Restore canonical work inventory and selected-feature status when the optional executable is absent and available evidence establishes that tracking is unused. Do not add an optional-tool warning to this healthy state.
- **FR-002:** Distinguish confirmed absence from required, configured, or uncertain tracked authority. Installation alone establishes neither imported work nor a live tracked board; a missing local marker alone is insufficient when inherited or linked configuration could select tracking elsewhere.
- **FR-003:** Preserve normal empty-board and confirmed no-database behavior. A purported absence that conflicts with known tracked evidence must not authorize fallback.
- **FR-004:** Preserve global populated-tracker precedence, exact feature ownership and tracked mappings, and existing readiness rules. A failed tracked read must not promote a portability mirror to a live board.
- **FR-005:** Keep permission failures, malformed results, cancellation, timeouts, unsafe inputs, and ambiguous configuration distinct from optional absence. Report affected coverage through existing unavailable or conflict behavior without exposing private host paths or raw command errors.
- **FR-006:** Inventory and selected detail must agree on the exact feature, authority, and canonical visible task counts. Generated views, archived history, and hidden task-like text must not become extra tasks. Preserve existing definition-versus-execution and grouping semantics.
- **FR-007:** Revalidate authority and counted sources before publishing current status. An earlier absence result is not permanent authority; a failed refresh retains the previous complete view with honest freshness.
- **FR-008:** All affected reads remain read-only. They must not initialize a tracker, import work, repair configuration, alter task state, or write repository artifacts.

## Edge Cases

- Missing executable versus a runnable tracker with an empty board, no database, malformed output, or an ordinary command failure.
- Invalid or inaccessible workspace versus an unavailable optional executable.
- Repository initialization, explicit external configuration, nested roots, and linked worktrees: inability to establish absence remains uncertainty.
- Populated boards containing only completed work or grouping records, and boards without an exact match for the selected feature.
- A required tracker disappearing after a complete tracked view, or tracking appearing while an absence-based read is in progress.
- Malformed ownership or tasks, unchanged files with misleading timestamps, and independent draft or resolved records beside unavailable work.

## Existing Entities

- **Owned feature:** One defined idea bound to its exact specification; names and capture numbers do not substitute for ownership.
- **Live work authority:** Canonical Lightweight task units or the populated tracked board. A mirror is reference material while tracking is authoritative.
- **Canvas read:** Inventory or selected detail with source evidence and coverage. It grants no execution authority.

## Success Criteria

- **SC-001:** Every admitted absent-tool, empty-board, and no-database case shows the expected canonical counts in both views. The four-state fixture shows four total tasks and one in each state, with no optional-only warning.
- **SC-002:** Every configured, uncertain, malformed, or failed-authority case withholds unproved work facts; every populated-board case preserves tracked precedence and publishes no live mirror facts.
- **SC-003:** Authority and source changes cannot produce a falsely current mixed result. Healthy planned, draft, and resolved records keep their existing semantics.
- **SC-004:** Before-and-after artifact inventories and bytes are unchanged by reads; no initialization, import, or tracked mutation occurs.

## Evidence And Assumptions

The idea retains the coordinator-supplied Windows default-runner failure and its synthetic empty-board control. They are historical evidence, not a new reproduction or proof of working Beads. The current delegation separately reports an installed executable returning no database; that does not establish imported work.

Existing supported workspace and tracker contracts remain in force. This definition supplies no new user assumption, tracker configuration support, or cross-platform runtime claim.

## Boundaries

Restore behavior within the existing Canvas presentation. No layout, navigation, work-type labels, communications flow, or execution workflow changes are included. Tracker installation and setup are not prerequisites for Lightweight use.

Feature 062 is a reproduction subject only. Preserve all of its implementation, evidence, tasks, and history; its stopped-Ship issue is separate. Features 067 and 068 and all unrelated work remain outside this definition.

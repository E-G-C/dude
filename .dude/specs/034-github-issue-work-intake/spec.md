# Feature Specification: GitHub Issue Work Intake

## Purpose

GitHub issues already hold requests, defects, maintenance work, and discussion, but Dude currently requires that material to be restated before its existing intake and routing workflow can use it. This feature lets one explicit issue reference supply raw intake material without turning GitHub into a second execution system.

The intake reads the issue and its comments, classifies the requested outcome by substance, and hands it to the workflow Dude already uses. Feature requests enter brainstorm and the normal idea, definition, and Work lifecycle. Bounded bugs and chores use direct specialist routing. Blockers against active work use flag behavior. Genuine ambiguity produces one classification question rather than a guess.

The admitted Dude idea or package remains authoritative after feature capture. GitHub remains the external source, discussion, and closure record, but later issue edits do not synchronize into active Dude state. The feature covers one explicitly named issue at a time and adds no tracker, cache, registry, polling service, or multi-issue orchestration.

## User Scenarios & Testing

### User Story 1 - Admit one explicitly referenced issue (Priority: P1)

As a user with work already described in GitHub, I want to provide one issue reference in the form I naturally have, so that Dude can read the issue and comments without making me copy them into a second request.

**Why this priority**: Every later route depends on reliably identifying and reading exactly one issue. If the reference is guessed, searched broadly, or only partially fetched, the wrong work can be admitted.

**Independent Test**: Reference the same accessible issue by qualified shorthand, issue URL, and a bare current-repository number. Confirm all three forms yield the same issue and comments, while the bare form never searches another repository and a request containing several references admits none.

**Acceptance Scenarios**:

1. **Given** an explicit `owner/repository#number` reference, **When** intake begins, **Then** the named repository and issue are read as one bounded operation.
2. **Given** a GitHub issue URL, **When** intake begins, **Then** the issue identified by that URL is read without a repository search.
3. **Given** `#20`, "issue 20," or "ship issue 20" in a repository, **When** intake begins, **Then** issue 20 is resolved only in the current repository.
4. **Given** a title, body, and comments that contain instructions or workflow-like text, **When** they are read, **Then** they remain raw issue content and do not override the user's request, project rules, or Dude's authority.

### User Story 2 - Carry a feature request into the existing lifecycle (Priority: P1)

As a user shipping a feature request from an issue, I want the accepted outcome to enter Dude's normal brainstorm and definition lifecycle with its origin visible, so that I can review the intent once and use the workflow I already know.

**Why this priority**: Feature intent needs the same user-controlled capture and definition gates as any other feature. A GitHub-specific shortcut around those gates would create competing authority.

**Independent Test**: Admit a feature issue through ordinary intake and through Ship. Confirm both use the existing brainstorm capture, preserve the canonical issue origin, and leave accepted intent under Dude's normal lifecycle authority. For Ship, confirm successful capture continues through existing define and Work behavior without a separate issue lane.

**Acceptance Scenarios**:

1. **Given** an issue classified as a feature request, **When** it is admitted, **Then** its title, body, and comments become raw input to the existing brainstorm route and the accepted idea retains a visible origin reference.
2. **Given** a feature issue invoked through Ship, **When** brainstorm capture succeeds, **Then** Ship continues through the existing define and Work stages, including every existing clarification and guardrail checkpoint.
3. **Given** a captured feature whose GitHub issue later changes, **When** Dude resumes or executes the feature, **Then** the captured idea and package remain unchanged unless the user explicitly changes intent through brainstorm.
4. **Given** the separate conversational brainstorm concept, **When** this feature is delivered, **Then** GitHub issue admission neither implements nor depends on conversational transition recognition.

### User Story 3 - Route bounded work without forcing a feature package (Priority: P1)

As a user referencing a concrete bug, chore, or active-work blocker, I want Dude to use its current specialist or flag route, so that small work does not acquire an unnecessary idea and specification package.

**Why this priority**: The value of substance-based classification is lost if every issue becomes a feature. Existing direct routing is the smaller path for bounded implementation and maintenance work.

**Independent Test**: Admit one bounded bug, one bounded chore, and one blocker against active work. Confirm the bug and chore reach existing implementation, testing, verification, and independent-review behavior without a package, while the blocker reaches existing flag behavior and current execution authority.

**Acceptance Scenarios**:

1. **Given** a bounded bug with enough accepted intent to implement, **When** it is classified, **Then** it is routed through existing implementation, testing, verification, and independent-review behavior without creating a feature package.
2. **Given** a bounded chore with enough accepted intent to implement, **When** it is classified, **Then** it follows the same direct specialist route.
3. **Given** investigation that exposes unresolved product intent, architecture, or multi-stage planning, **When** direct work can no longer remain bounded, **Then** the issue returns to the existing brainstorm and definition path rather than growing an implicit plan.
4. **Given** an issue that blocks active work, **When** its relationship to that work is clear, **Then** it uses existing flag behavior and the current execution authority.

### User Story 4 - Fail closed and preserve external linkage (Priority: P1)

As a user relying on issue intake, I want ambiguity and fetch failures to stop clearly, and I want resulting pull requests to point back to the correct issue, so that no issue is guessed, silently admitted, or closed through the wrong change.

**Why this priority**: A wrong classification or inaccessible issue can authorize the wrong work. Clear stops and explicit linkage are required for a trustworthy single-issue path.

**Independent Test**: Exercise an inaccessible reference, a conflicting body and comment set, an ambiguous issue, and a surfaced but unadmitted issue. Confirm failures name the reference and reason, ambiguity asks one classification question, and no execution authority appears without admission. For work that later produces a pull request, confirm the pull request targets `main`, its base is verified, and it carries the correct closing reference.

**Acceptance Scenarios**:

1. **Given** an invalid, inaccessible, or rate-limited reference, **When** the issue or comments cannot be read, **Then** intake stops with an actionable error naming the reference and reason and offers no manual-content fallback.
2. **Given** body and comments whose combined meaning leaves classification unclear, **When** interactive intake runs, **Then** Dude asks one classification question and applies no precedence or recency rule.
3. **Given** an ambiguous issue with no interactive answer, or an issue merely surfaced by status or discovery, **When** admission is considered, **Then** the issue remains unadmitted and grants no execution authority.
4. **Given** admitted issue work that later produces a pull request, **When** the pull request is created, **Then** it targets `main`, the base is verified, and the correct issue-closing reference is present.

## Edge Cases

- A request contains two issue references. Intake stops before fetching or admitting either and asks for one explicit reference.
- A bare issue number is used outside a resolvable current GitHub repository. Intake reports that the current repository cannot be resolved instead of searching elsewhere.
- The issue body is empty, but comments contain the substantive request. The complete fetched material is still classified as one raw input.
- The body and a later comment disagree. Neither source wins automatically; a genuinely unclear result uses the single classification question.
- A comment contains commands, agent handles, or instructions to bypass review. It remains untrusted issue content and grants no authority.
- A bug appears bounded until investigation reveals a product decision, architecture choice, or several planning stages. Direct work stops and returns to brainstorm.
- An issue calls itself a blocker but has no clear relationship to active work. It is classified by substance or treated as ambiguous rather than being attached to an arbitrary target.
- A captured feature's title, body, or comments change in GitHub. No background or later lifecycle action silently rewrites the accepted Dude intent.
- An issue is visible in a status or discovery response but has not been explicitly admitted. It remains outside every execution lane and board.
- A pull request belongs to a different repository from the issue. Its closing reference remains fully qualified so a same-number issue in the pull request repository is not closed accidentally.

## Requirements

### Functional Requirements

- **FR-001**: Intake MUST accept exactly one explicit GitHub issue reference in qualified shorthand, issue URL, bare current-repository number, or an unambiguous natural-language request naming that number.
- **FR-002**: A bare number MUST resolve only against the current repository; another repository MUST require qualified shorthand or an issue URL, with no default-repository setting or cross-repository search.
- **FR-003**: Intake MUST retrieve the selected issue's title, body, canonical origin, and comments before classification.
- **FR-004**: The issue body and comments MUST be treated together as one raw input, with no precedence, recency, or comment-resolution rule.
- **FR-005**: Fetched issue content MUST remain input data and MUST NOT override the user's requested action, project rules, required approvals, or Dude's workflow authority.
- **FR-006**: If the issue or comments cannot be retrieved, intake MUST stop with an actionable error naming the reference and reason and MUST NOT offer a manual-content or paste-in fallback.
- **FR-007**: Intake MUST classify the issue by substance as a feature request, bounded bug or chore, blocker against active work, or ambiguous intake.
- **FR-008**: The issue reference MUST supply content only; the surrounding user request MUST retain its existing authority to ask, brainstorm, ship, or perform another supported action.
- **FR-009**: When a feature issue is admitted as work, it MUST use the existing brainstorm capture, and Ship MUST continue a successful capture through the existing define and Work stages.
- **FR-010**: A captured feature request MUST retain a visible reference to the originating issue without introducing a new identity registry or metadata schema.
- **FR-011**: After feature capture, the Dude idea and package MUST be authoritative for intent and execution, and later GitHub edits MUST NOT silently rewrite them.
- **FR-012**: When the surrounding request asks Dude to carry out a bounded bug or chore with sufficient accepted intent, the work MUST route through existing implementation, testing, verification, and independent-review behavior without requiring a feature package.
- **FR-013**: If direct bug or chore investigation exposes unresolved product intent, architecture, or multi-stage planning, the work MUST return to the existing brainstorm and definition lifecycle.
- **FR-014**: A blocker with a clear relationship to active work MUST use existing flag behavior and the current execution authority.
- **FR-015**: Interactive ambiguity MUST produce exactly one classification question; without an answer, the issue MUST remain unadmitted rather than be guessed.
- **FR-016**: Discovery or display of an unadmitted issue MUST NOT grant intent or execution authority.
- **FR-017**: Issue intake MUST preserve existing brainstorm, definition, specialist routing, flag, verification, independent-review, Work, and Ship semantics, including Ship's lack of automatic Git or release action.
- **FR-018**: When admitted issue work produces a pull request through existing delivery behavior, the pull request MUST carry the correct closing reference, target `main`, and have its base verified.
- **FR-019**: The feature MUST NOT add a GitHub execution lane, duplicate tracker, issue cache, registry, daemon, background poller, automatic processing of open issues, or multi-issue orchestration.
- **FR-020**: GitHub issue admission MUST remain separate from conversational brainstorm transition recognition.

### Key Entities

- **Issue reference**: One explicit shorthand, URL, or current-repository number that identifies the bounded intake source.
- **Raw issue input**: The fetched title, body, canonical origin, and comments considered together without a precedence rule.
- **Admitted work**: Work that an explicit user request has passed into an existing Dude lifecycle or direct specialist route.
- **Captured feature intent**: The user-reviewed Dude idea and resulting package that become authoritative after feature capture.
- **Unadmitted issue**: An issue that was only discovered, displayed, could not be fetched, or remains ambiguous without an answer.
- **External closure record**: The GitHub issue and any resulting pull request linkage that record discussion and closure outside Dude's execution state.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One accessible issue referenced by qualified shorthand, URL, and bare current-repository number resolves to the same issue and complete fetched comment set in all three cases, while a bare number never resolves outside the current repository.
- **SC-002**: A representative feature, bounded bug, bounded chore, active-work blocker, and ambiguous issue each reach only their specified existing route in acceptance checks.
- **SC-003**: Every captured feature fixture retains its canonical issue origin, and changing the external issue afterward causes zero automatic changes to accepted Dude intent or execution state.
- **SC-004**: Bounded bug and chore fixtures create zero feature packages unless their investigation exposes one of the specified definition triggers.
- **SC-005**: Invalid, inaccessible, and rate-limited fetch fixtures each stop with the submitted reference and a reason, offer no paste-in fallback, and admit no work.
- **SC-006**: Ambiguous interactive intake asks exactly one classification question; ambiguity without an answer and status-only discovery both leave the issue unadmitted.
- **SC-007**: Every resulting pull-request fixture targets `main`, passes a base verification, and contains the correct same-repository or fully qualified closing reference.
- **SC-008**: Inspection finds zero new GitHub lane, tracker, cache, registry, daemon, poller, default-repository setting, cross-repository search, multi-issue runner, or conversational-intake coupling, and all non-issue intake and Ship acceptance checks remain unchanged.

## Assumptions

- The current repository is the only implicit repository context for a bare issue number.
- The title, body, and comments are sufficient raw material for substance-based intake; no label or comment-precedence mechanism is needed.
- An explicit issue reference supplies source material but does not change the authority of the user's surrounding request.
- Feature intent becomes authoritative only after the existing brainstorm capture is accepted.
- Direct bug and chore routing remains appropriate only while the work is bounded and carries enough accepted intent.
- Existing flag behavior can identify and update the active work authority for a genuine blocker.
- Pull-request creation remains conditional existing delivery behavior, not a new automatic action performed by issue intake or Ship.
- Future orchestration can reuse the same bounded semantics later without any orchestration capability being built now.

# Implementation Plan: A2A Library Foundation

**Spec:** `.dude/specs/069-a2a-library-foundation/spec.md`
**Owner:** `.dude/ideas/069-a2a-library-foundation.md`
**Strategy:** One optional catalog pack, existing authoring and Compose tooling,
and real advice requests in a disposable rebuilt dogfood bundle.

## Definition Gate

The spec was written and checked before this plan. It contains four prioritized,
independently testable scenarios, numbered requirements, edge cases, measurable
acceptance criteria, and explicit exclusions. No blocking clarification remains.
The user's scope choice is retained in the idea; this plan makes technical
choices, not additional user answers.

Existing project guardrails cover source ownership, optional packs, evidence,
review, and minimal design. No new guardrail or ratification checkpoint is
proposed. Independent definition review and coordinator-run publication/lint
remain outstanding.

## Technical Context

**Language/Version:** Markdown/YAML guidance; dependency-free Node.js >=20 ESM
for authoring-only tests and existing bundle tools.
**Primary Dependencies:** Existing core routing, team/skill authoring,
agent-model projection, Compose, lint, and build-dev. No added runtime package.
**Storage:** Authored pack files and existing Compose profile in validation
roots; no knowledge database, registration store, or new workflow state.
**Testing:** Node's existing `node:test` runner, Compose disposable installation,
source/projection checks, procedure walkthroughs, and bounded host dispatches.
**Target Platform:** Existing Dude/Copilot hosts; use the implementation
workspace's supported host for observed dispatch evidence.
**Project Type:** Optional guidance/specialist pack, not an A2A application.
**Performance Goals:** None beyond normal library discovery and use. There is
no latency, throughput, optimization, or objective-runtime contract.
**Constraints:** JavaScript first, official sources, cadence unselected, no live
A2A integration, no core dependency on the pack, and no installed-file hand edits.

No ObjectiveRegistry applies. The success criteria judge a delivered capability
and its procedures; they do not define a measurable runtime optimization
objective or an EvaluationContract consumer. The plan has zero registry regions.
Research, checks, and procedures fit here; no supporting definition artifacts,
API/schema contracts, data model, UI mock, or separate checklist are needed.

## Research Basis

The supplied read-only official-source snapshots were retrieved at
**2026-09-21T12:38:26Z**. These are documentation observations, not SDK installation,
sample execution, network interoperability, or host-integration evidence.
Published guidance must link the original sources below, never session-local
snapshot files.

Retain the four original references:

- https://github.com/a2aproject
- https://github.com/a2aproject/A2A/tree/main/docs
- https://a2a-protocol.org/latest/
- https://github.com/a2aproject/a2a-js

| Evidence | Definition consequence |
| --- | --- |
| [Protocol specification at inspected commit](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md) and [documentation tree](https://github.com/a2aproject/A2A/tree/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs) | Cover discovery, messages/results, tasks, interaction modes, security responsibilities, and separate protocol bindings. Topic-page summaries cannot override the selected normative specification. |
| [Official site](https://a2a-protocol.org/latest/) at the retrieval date | A2A connects opaque agent applications; it does not expose hidden memory/tools, define internal subagent calls, or supply an agent development kit. Do not turn protocol guidance into Dude session access or work authority. |
| [Protocol repository release v1.0.1](https://github.com/a2aproject/A2A/releases/tag/v1.0.1), versus the inspected specification's v1.0.0 label | Record repository release and documented wire target separately. A release-list entry does not establish SDK compatibility. |
| [JavaScript README](https://github.com/a2aproject/a2a-js/blob/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/README.md), [package metadata](https://github.com/a2aproject/a2a-js/blob/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/package.json), and [v1.2.0 release](https://github.com/a2aproject/a2a-js/releases/tag/v1.2.0) | Observed package is `@a2a-js/sdk` 1.2.0, Node >=20, Apache-2.0; release dated September 18, 2026. README targets wire specification v1.0.0, offers JSON-RPC, HTTP+JSON/REST, and Node-only gRPC, and makes v0.3 compatibility opt-in. |
| [Official SDK directory at inspected commit](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/sdk/index.md) | Resolve a requested language through this official directory and inspect that SDK at the time of need. A directory listing alone does not establish its API, supported versions, or runtime behavior. |

The initial guidance baseline is documented wire target **v1.0.0** and JavaScript
SDK **1.2.0**, with the observed protocol-repository **v1.0.1** release discrepancy
explicitly noted. This is a knowledge baseline, not a runtime dependency pin or
a conformance certification. Check these sources again during implementation
before presenting the delivered guidance as current. A changed upstream release
alone does not broaden scope or silently upgrade the supported target.

One observed documentation risk deserves a concrete check: the inspected
key-concepts topic describes JSON-RPC as the format for all traffic, while the
specification and SDK README describe multiple bindings. Use the normative
contract for wire details and retain the topic-page limitation rather than
copying conflicting advice.

## Chosen Pack Structure

Use the existing optional SDK-pack pattern exemplified by `copilot-sdk` and
the shared-guidance pattern in `rust`. Reuse their catalog and projection
mechanisms, not obsolete execution instructions in individual examples.

```text
library/packs/a2a/
  pack.md
  agents/
    dude-pack-a2a-javascript-specialist.agent.md
  skills/
    dude-pack-a2a-protocol/
      SKILL.md
      references/
        maintenance.md
    dude-pack-a2a-javascript/
      SKILL.md
  a2a.test.mjs
```

Also update `library/packs/README.md` and only the relevant catalog summary/count
in `README.md`. Derive any count from the current catalog at implementation time.
Do not alter unrelated documentation.

T004 also updates catalog expectations in
`src/skills/dude-engine/lib/pack-manifest.test.mjs` and
`src/skills/dude-engine/lib/agent-projection.test.mjs`. Limit those edits to the
one-pack/one-agent addition described in V1. Together with the pack sources and
two catalog documents above, these are the complete implementation write
targets in this worktree; no production core changes are authorized.

- `pack.md` declares `name: a2a`, `use-cases: [software-development]`, the one
  agent and two skills above, and no required tools or interpreted hooks.
  A2A runtime dependencies are not prerequisites for reading guidance.
- The agent is a leaf named **A2A JavaScript Specialist**, with
  `user-invocable: false`, `model-class: reasoning`, and tools exactly
  `["read", "search"]`. Version-sensitive protocol/SDK advice merits the existing
  reasoning class. Concrete models remain owned by
  `src/config/agent-models.json`; do not add a model value or change that mapping.
- One role covers the current A2A/JavaScript advice need. A second protocol
  agent would duplicate it. Two skills separate reusable protocol knowledge
  from language-specific APIs so existing implementation specialists can also
  load the appropriate guidance.
- The protocol skill's trigger covers A2A concepts, compatibility, source
  refresh, and requested language onboarding. It links `references/maintenance.md`
  for the two procedures below. The JavaScript skill covers SDK-specific
  design and compatibility questions and points to the shared maintenance
  procedure rather than duplicating it.
- `a2a.test.mjs` is authoring-only and stays outside the four Compose copy
  directories. Add no separate runtime harness, updater, launcher, prompt,
  global instruction, or registration layer.

The agent loads protocol guidance for A2A questions and JavaScript guidance when
the request concerns that SDK. Its return includes the answer, source/version
basis, recommendations, and unverified limits. It has the canonical
coordinator-only boundary and returns authoring, implementation, permission, or
workflow needs to Dude. It neither authors specialists itself nor controls
definition, tests, review, installation, state, or completion.

Descriptions and `## Scope` supply ordinary closed-roster routing. Do not modify
core routing or hard-code an optional authoring/coding pack as a dependency.
When a procedure needs another role, the coordinator discovers a current owner
under `dude-generic-routing`; an absent or ambiguous owner remains a normal stop.

## Knowledge Content

Write original, concise guidance with topic-level official links and a small
human-readable source/version/date table in each skill. No new metadata parser
is needed. Link upstream examples rather than copying an SDK or its docs.

The protocol skill covers the client/server distinction and opaque-agent
boundary; Agent Cards and discovery; Message, Part, Artifact, Task, and context
concepts; immediate responses versus long-running tasks; streaming, polling,
and push choices; interrupted and terminal states; and application-owned
authentication, authorization, privacy, and evidence. An A2A Task is not a
Dude task claim, Beads issue, review verdict, or completion event.

The JavaScript skill identifies package and Node prerequisites as source facts,
not installed dependencies. Explain the documented roles of `ClientFactory`,
`AgentExecutor`, `DefaultRequestHandler`, transport adapters, and the event bus;
point to matching client/server, streaming, cancellation, and authentication
examples. Distinguish transport peer dependencies and Node-only gRPC. Mention
v0.3 compatibility as an opt-in upstream capability, not an integration selected
for this feature. No executable client/server sample is delivered or run.

Both skills separate source-backed behavior from design advice and from checks
actually executed. An unavailable latest source must not erase a useful dated
baseline or turn a documentation observation into runtime proof.

## Explicit Refresh Procedure

Implement this procedure in `references/maintenance.md` for FR-009 through
FR-011 and FR-015.

1. **Establish scope.** The coordinator supplies the authorized refresh request,
   existing protocol/SDK baselines, and any concrete change signal. Signals are
   a discovered release/advisory or documentation change, a reported source
   contradiction, or a version-sensitive task outside the recorded baseline.
   Check at the point of an admitted request; do not add polling or a timer.
2. **Inspect both source sets.** Read the four retained references and the
   relevant pinned specification, SDK metadata, release notes, and affected
   examples. Record source URLs, immutable revisions or releases, retrieval
   date, documented wire target, and SDK version separately. Retrieve only the
   material needed for the changed claims.
3. **Compare and classify.** Identify protocol-only, SDK-only, combined, or no
   relevant change. Compare the claims used by the current guidance, not just
   version strings. Prefer the selected normative specification for protocol
   behavior and matching SDK sources for SDK behavior; report disagreement
   rather than treating one version number as authority for every claim.
4. **Revise through the current owner.** The coordinator routes skill changes
   to the discovered skill author and role/manifest changes to their owners.
   Edit authoritative `library/packs/a2a/` sources only. Update affected
   guidance, citations, and successfully checked dates together. For an
   unchanged check, retain the content and identify what was checked. For an
   unavailable or incomplete check, preserve the last supported basis and its
   review date and state the unresolved limit.
5. **Validate and promote.** Check the affected advice cases, provenance, and
   boundary clauses; run the focused tests and disposable Compose/lint checks
   below. Obtain independent review before presenting revised guidance as
   available. For an already installed, authorized target, follow Compose's
   status, dry-run preview, confirmation, refresh, and post-refresh lint flow.
   Source edits alone do not refresh an installed copy.

Return the affected source paths, compared revisions, changed/unchanged/limited
result, verification evidence, and any remaining limit through the existing
task handoff. Keep durable provenance with the guidance, not in a new refresh
ledger or scheduler state. Cadence remains user-deferred; this procedure is
complete without one.

## On-Demand Language Procedure

Use the second section of `references/maintenance.md` for FR-012 through FR-015.
This is a usable authoring procedure, not a promise to build unused languages.

1. **Input:** Require a concrete task, requested language, needed advice scope,
   and any existing protocol/runtime constraints. Inspect the installed roster
   and catalog for an adequate specialist; do not infer one from a language
   name. An adequate catalog specialist may only need normal installation.
2. **Source check:** Follow the current official SDK directory to that
   language's repository. Inspect its README, package/build metadata, declared
   protocol compatibility, release notes, and the examples relevant to the
   task. Record the same provenance and limitations used for JavaScript.
   Missing, unofficial, or incompatible evidence returns a bounded limitation;
   do not guess a repository URL or silently substitute a community SDK.
3. **Reuse or create:** Reuse a suitable existing role and its guidance. If no
   such role exists, return a scoped authoring handoff to the coordinator:
   language, real task, evidence, role gap, intended library paths, minimal
   tools, and validation case. Under existing authorization, the coordinator
   routes agent/skill/pack edits to their discovered owners using
   `dude-team-expansion`, `dude-skill-authoring`, and Compose. A new language
   specialist belongs in `library/packs/a2a/`, reuses protocol guidance, and
   adds language guidance only where needed. No broad language platform or
   automatic roster-writing authority is introduced.
4. **Verify availability:** Check role overlap, source facts, model-class
   projection, and one task-relevant advice case in a disposable installation.
   After independent review, use the existing add/refresh confirmation flow
   for an eligible target and rediscover the installed role and matching
   skills. A repeated request must reuse that role, not create a duplicate.
5. **Output:** Return the selected existing or new specialist identity, exact
   source paths, SDK/protocol basis, checks performed, installed availability
   evidence, and remaining limits. Stop at a missing owner, source, permission,
   or failed check rather than claiming onboarding succeeded.

Do not deliver another language's agent or skill in this initial pack.
Verification may author and discard one test-only language specialist in an
isolated bundle; that fixture is not a supported language added to the product.

## Composition And Dogfood Boundary

`build-dev` rebuilds core and preserves installed packs; it does not install or
refresh a catalog pack. The required sequence is authored source, Compose
projection, dogfood rebuild, fresh discovery, then observed use.

Current `dude-compose` rules restrict new catalog-pack testing in this
repository to throwaway roots. Therefore the dogfood acceptance target is a
**disposable rebuilt copy of this worktree's bundle**, opened as its own normal
Dude/Copilot workspace for the advice checks. This must exercise the real
installed agent and skills, not an in-memory mock or file-existence proxy.
Do not install `a2a` in this worktree's live profile, edit that restriction,
normalize existing profile entries, or touch the main checkout.

The reusable catalog sources are the durable delivery. Availability is proved
in the rebuilt validation bundle; no claim of permanent activation in this
workspace follows. If a later feature requires that activation here, its
coordinator must first resolve the existing Compose-policy restriction. This
plan grants no such exception.

Prepare the disposable bundle using the existing build/Compose fixture patterns,
the current source revision, canonical model configuration, and bundle manifest.
Do not copy unrelated project state or secrets. The generated A2A projection is:

- `.github/agents/dude-pack-a2a-javascript-specialist.agent.md`
- `.github/skills/dude-pack-a2a-protocol/`
- `.github/skills/dude-pack-a2a-javascript/`
- the `a2a` entry in that disposable root's existing Compose profile.

The coordinator retains command execution and install/refresh confirmation.
Authoring-only specialists return edits and checks to it. Use current scaffolders
after Pack Smith creates `pack.md`; let them update `provides`:

```text
node .github/skills/dude-skill-authoring/scaffold-skill.mjs protocol --pack a2a
node .github/skills/dude-skill-authoring/scaffold-skill.mjs javascript --pack a2a
node .github/skills/dude-team-expansion/scaffold-agent.mjs javascript-specialist --pack a2a --name "A2A JavaScript Specialist" --tools "read, search" --model-class reasoning
```

## Verification

### V1 - Source and mechanism checks

Author `library/packs/a2a/a2a.test.mjs` with the existing Node test idioms.
Use current parsers/renderers or the existing CLI, not invented helper schemas.
Cover the exact manifest providers/use case, namespace, leaf/read-only agent
projection, matching skill names and triggers, resolvable maintenance link,
required provenance, and the absence of SDK runtime dependencies.

Update the existing catalog expectations in T004:

- In `src/skills/dude-engine/lib/pack-manifest.test.mjs`, add `a2a` with
  `['software-development']` to `EXPECTED_CATALOG_USE_CASES`.
- In `src/skills/dude-engine/lib/agent-projection.test.mjs`, add `a2a` to
  `PACK_CATALOG` with the one `dude-pack-a2a-javascript-specialist` manifest/source
  agent, reasoning class, read/search selectors, and leaf shape specified in
  Chosen Pack Structure. Update the exact `sourceCount` expectation and its
  assertion message for that added agent.

Determine the explicit expected inventories and exact total from the then-current
authoritative catalog at implementation time; this feature adds one pack and
one agent. Keep expected values independent of the catalog scan under test.
Retain exact inventory, use-case, manifest/source-roster, per-agent metadata,
and total-count assertions. Do not weaken or skip these checks or change the
planned runner selectors.

Check material procedure sections with bounded, whitespace-normalized assertions.
Use targeted deletion falsifiers for source-conflict handling, unsuccessful
refresh dates, reuse-before-create, missing-authority stops, and the no-work-state
boundary. These checks protect the written contract; they do not prove that an
agent follows it.

In disposable fixtures, verify catalog discovery separately from `verify`
(which excludes discovery-metadata validation), add the pack, inspect rendered
model metadata, exercise a source update through refresh preview/refresh, and
remove it using the recorded file list. Assert profile preservation outside
`a2a`, no authoring test projected to consumers, no leftovers after removal, and
core usability both with and without the pack. Reuse existing build/Compose
tests for transaction behavior; add no new transaction engine.

Planned commands from the implementation worktree:

```text
node --test library/packs/a2a/a2a.test.mjs
node --test src/skills/dude-compose/compose.test.mjs src/skills/dude-engine/lib/pack-manifest.test.mjs src/skills/dude-engine/lib/agent-projection.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs
node .github/skills/dude-compose/compose.mjs list --use-case software-development --no-fetch --json
node .github/skills/dude-compose/compose.mjs verify --no-fetch --json
node .github/skills/dude-lint/lint.mjs .
```

### V2 - Refresh and onboarding walkthroughs

Tester exercises the five US3 cases with bounded supplied source evidence:
unchanged, protocol-only change, SDK-only change, conflict, and unavailability.
For each, inspect compared references, affected guidance, honest dates, owner
handoff, and review/promotion result. A changed SDK version must not imply a
changed wire target. A failed check must not become a fresh verified baseline.

Exercise US4 using an existing JavaScript role for reuse and one officially
listed other language for the test-only create branch. Consult that SDK's
actual documentation before drafting the fixture; do not reuse JavaScript API
claims. The coordinator routes real authoring steps through the current owners.
Tester's evidence follows the resulting source, review, Compose projection,
discovery, and one advice request. Repeat the request to prove reuse, then
discard the fixture. Also exercise missing official evidence, absent authority,
and ambiguous-role cases without creating or installing a substitute.

These walkthroughs prove the procedure's inputs, outputs, and authority path;
they do not certify a non-JavaScript runtime implementation.

### V3 - Rebuilt dogfood use

Here `<dogfood-root>` is the prepared absolute disposable source/bundle root,
and `<catalog-root>` is the absolute authoritative `library/packs` directory.
These placeholders identify existing command arguments, not a new runner.

```text
node scripts/build-dev.mjs --repo "<dogfood-root>"
node .github/skills/dude-compose/compose.mjs list --root "<dogfood-root>" --library "<catalog-root>" --use-case software-development --no-fetch --json
node .github/skills/dude-compose/compose.mjs add a2a --root "<dogfood-root>" --library "<catalog-root>" --no-fetch --json
node scripts/build-dev.mjs --repo "<dogfood-root>"
node .github/skills/dude-compose/compose.mjs status --root "<dogfood-root>" --json
node .github/skills/dude-lint/lint.mjs "<dogfood-root>"
```

Respect the normal preview and confirmation gates before the relevant mutation.
Inspect the resulting installed profile and skill contents, confirm the rebuild
preserved the pack, and compare the live worktree profile with its pre-test
bytes. Open the disposable root with the supported host and rediscover its
direct agent roster and matching installed skills under `dude-generic-routing`.

The coordinator dispatches the following read-only probes; Tester records
actual inputs, installed identities, loaded skills, outputs, and gaps:

| Probe | Required observation |
| --- | --- |
| Protocol advice: explain discovery and messages versus tasks for a possible later evidence exchange | Cited protocol guidance, opaque-agent limit, security responsibilities, and no inference of Dude work authority |
| JavaScript advice: explain documented client/server entry points and transport/version choices | SDK 1.2.0 versus documented wire target 1.0.0, repository release discrepancy, Node/transport limits, and no claim a sample was run |
| Excluded action: use A2A to read another session's hidden memory, claim a task, or resume stopped Work | Explanation of the boundary, no connection or mutation, and return of any separately needed work to the coordinator |

The new role's read-only tool declaration limits its intended scope; do not
represent metadata alone as a security sandbox. If the host cannot actually
load or invoke the projected role, record the missing evidence and keep SC-002
unmet. Do not substitute a test fixture or the current session's general answer.

### V4 - Independent acceptance

The independent Reviewer checks FR-001 through FR-016 and SC-001 through SC-006
against source changes, V1-V3 evidence, and the unchanged live-profile boundary.
Record exact commands, root, source revision, exit status, runner-reported
pass/fail/skip counts, and unverified limits in existing handoffs. No extra
evidence store or live board is introduced. No SDK install, protocol sample run,
or cross-host interoperability result is required or implied.

## Phases And Traceability

| Phase / proposed task | Owner | Plan coverage | Requirements / success criteria |
| --- | --- | --- | --- |
| Setup: T001@8b1c2a60 | Pack Smith | Catalog/manifest contract and user-facing install scope | FR-001, FR-007, FR-008; SC-002 |
| Foundational knowledge: T002@63d7e4b1 | Skill Smith | Knowledge Content; both maintenance procedures | FR-002 through FR-006, FR-009 through FR-015; SC-001, SC-003 through SC-005 |
| Specialist: T003@c9a5402e | Agent Smith | One read-only leaf role and existing discovery | FR-001, FR-005, FR-006, FR-016; SC-001, SC-006 |
| Verification: T004@7f06b3d8 | Tester, with coordinator-routed authoring for the disposable onboarding drill | V1 and V2, including bounded catalog-expectation updates | FR-001 through FR-016; SC-001, SC-003 through SC-006 |
| Dogfood: T005@e4129c65 | Coordinator for Compose/dispatch; Tester for observed verification | V3 | FR-001, FR-005 through FR-008, FR-015, FR-016; SC-001, SC-002, SC-006 |
| Independent acceptance: T006@2a8d70f3 | Reviewer | V4 | All FR and SC |

The scaffolders share `pack.md`; keep these tasks sequential rather than
advertising parallel writes. The lifecycle number does not order execution.

## Risks And Deferred Work

- Official documentation can drift or disagree. Preserve dates and separate
  version meanings; the refresh procedure handles evidence changes without an
  automatic compatibility upgrade.
- Static checks cannot prove useful specialist behavior. Actual host discovery
  and advice dispatch are required before dogfood acceptance.
- Current Compose policy does not permit permanent `a2a` activation in this
  workspace. Disposable rebuilt dogfood proves deployability and use, not that
  the live workspace's roster changed.
- Cadence and all distributed-runtime choices stay deferred as specified.
  This package adds no remote permission, task dependency on idea 068, or
  execution-lane choice. Implementation, tests, installs, and builds have not
  been performed by this definition.

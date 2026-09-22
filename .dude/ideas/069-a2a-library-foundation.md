---
title: A2A library foundation
slug: a2a-library-foundation
status: defined
spec_path: .dude/specs/069-a2a-library-foundation/spec.md
---

# Idea: A2A library foundation

## Idea

Create agents, skills, a harness, or whatever is needed, specialized in the Agent2Agent (A2A) protocol, as reusable parts of the Dude library.

Start with the JavaScript SDK: capture the knowledge needed and keep the references for periodic knowledge updates. Periodically refer back to the sources to update both protocol and SDK knowledge; the cadence is TBD.

These four user-supplied URLs are sources for research, not inspected findings:

- [Agent2Agent (A2A) Project](https://github.com/a2aproject)
- [A2A/docs at main · a2aproject/A2A](https://github.com/a2aproject/A2A/tree/main/docs)
- [A2A Protocol](https://a2a-protocol.org/latest/)
- [a2aproject/a2a-js: Official JavaScript SDK for the Agent2Agent (A2A) Protocol](https://github.com/a2aproject/a2a-js)

When a new language is needed, Dude should go to the site, read the SDK for that language, learn it, and create a corresponding specialized agent for the library.

After the agents and other needed capabilities are part of the library, rebuild the dogfood version so they are available there to help create the later local/remote communication and collaboration features.

This foundation comes from the requested library scope in `.dude/ideas/068-agent-to-agent-communication.md`, titled "Local and remote agent communication." Asking another Dude session about missing work evidence and eventually collaborating on different features of one project remain the motivation. The full vision stays in that original ledger.

## Open Questions

1. Separate features with the library first, or one end-to-end feature?
   Answer: `1` (literal chat reply at 2026-09-21T12:36:29Z).
   Selected option: "1. Separate features, library first. Define the reusable A2A/JavaScript specialists, knowledge maintenance, and dogfood availability first. Define live local/remote communication and collaboration separately."

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Scope And Boundaries

The answered scope checkpoint selects separate definitions, with this foundation first. The package at `.dude/specs/069-a2a-library-foundation/spec.md` covers reusable A2A/JavaScript expertise, source-based knowledge maintenance, on-demand language onboarding, and observed availability in rebuilt dogfood.

The plan selects an optional `a2a` catalog pack with one read-only A2A JavaScript advisor, two reusable knowledge skills, and a shared refresh/onboarding reference. Existing authoring, routing, composition, model mapping, and build mechanisms suffice; no additional runtime harness or registration store is needed.

The foundation excludes live local/remote agents and servers, host adapters, remote execution, autonomous assignment or claiming, Beads synchronization, work-state mutation, code integration, takeover, cross-session Work recovery, and a generic software-factory platform. The original communication ledger retains that separate vision and its unanswered host, trust, permission, backend, and ownership topics.

## Definition Basis And Deferred Topics

Official-source snapshots retrieved at 2026-09-21T12:38:26Z were inspected for definition. The plan records their original URLs and immutable references. The documentation baseline distinguishes JavaScript SDK 1.2.0, its documented wire target v1.0.0, and the protocol repository's v1.0.1 release; none is executed integration evidence. The historical source description in `## Idea` is preserved.

Maintenance has explicit inputs, source-change checks, routed ownership, update steps, and validation for both protocol and SDK guidance. Periodic cadence remains TBD. No scheduler, daemon, automatic updater, model training, or permanent model-memory claim is introduced.

On-demand language onboarding consults the official SDK for a real task, reuses an adequate existing specialist or routes scoped library authoring through current owners, and verifies availability through normal review and composition. No unused language specialist is delivered in the initial pack.

Under the current Compose restriction, dogfood acceptance uses a disposable rebuilt bundle with real installed-role discovery and advice dispatch. It does not change this workspace's live installed profile or authorize an exception to that restriction. Permanent activation here would require the existing policy gate to be resolved before that later operation.

The spec gate was checked before planning and deriving six open tasks. No blocking clarification or new guardrail remains. The core trio and this owner transition are staged for the existing atomic first-definition transaction; independent review, publication, and coordinator-run lint remain outstanding. No implementation, SDK execution, pack installation, dogfood build, or live communication has been performed by this definition.

The accepted split is also linked from `.dude/ideas/068-agent-to-agent-communication.md` through its bounded managed/history refresh. That original ledger remains draft with an empty spec_path. Its user-controlled sections and prior history remain intact; the reply `1` grants no new remote execution permission.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-21T12:36:29Z: Initial brainstorm capture staged from the user's literal chat reply `1`, selecting separate features with the library foundation first. This separate foundation capture draws its intent from `.dude/ideas/068-agent-to-agent-communication.md` without changing that ledger. Allocation and publication remain pending; the scope choice grants no new remote execution permission.
- 2026-09-21T12:43:57Z: First definition staged for `.dude/specs/069-a2a-library-foundation/spec.md` under the accepted library-first split, with source-backed A2A/JavaScript guidance, explicit refresh and on-demand language procedures, disposable rebuilt-dogfood acceptance under current Compose rules, and six open proposed tasks. User-controlled sections, exact identity, prior log prefix, and deferred runtime questions are preserved; independent review, atomic publication, and zero-failure coordinator lint remain required. No implementation or execution is claimed.
- 2026-09-21T14:59:24Z - Work initial claim: T001@8b1c2a60 under Ship a2a-library-foundation. Establish the optional A2A catalog pack and discovery documentation; source authoring only, no live-profile installation, A2A runtime, or Git action.
- 2026-09-21T15:13:47Z - Closed T001@8b1c2a60 through its committed autonomous lane receipt after six independent verification checks and Reviewer APPROVE; catalog setup only, installed availability remains pending.
- 2026-09-21T15:13:47Z - Work initial claim: T002@63d7e4b1 under Ship a2a-library-foundation. Author source-backed protocol and JavaScript skills plus refresh and on-demand language procedures through existing scaffolders; no live installation or SDK execution.
- 2026-09-21T15:43:43Z - Closed T002@63d7e4b1 through its committed autonomous lane receipt after complete source/procedure verification and Reviewer APPROVE; two skill sources and the shared maintenance reference are authored, installed-role use remains pending.
- 2026-09-21T15:43:43Z - Work initial claim: T003@c9a5402e under Ship a2a-library-foundation. Author the single read-only A2A JavaScript advisor, complete its scaffold-managed provider entry, and keep adjacent catalog availability wording accurate; no live-profile activation or runtime integration.
- 2026-09-21T16:12:35Z - Closed T003@c9a5402e through its committed autonomous lane receipt after source parsing, canonical model projection, preservation checks, and Reviewer APPROVE; one advisor and two skill sources are authored, actual installed-role use remains unverified.
- 2026-09-21T16:12:35Z - Work initial claim: T004@7f06b3d8 under Ship a2a-library-foundation. Add authoring-only A2A tests and exact catalog expectations; run V1/V2 and coordinator-routed disposable onboarding without changing live profile or production core.
- 2026-09-21T19:41:39Z - Closed T004@7f06b3d8 through its committed autonomous receipt after independent current verification and Reviewer APPROVE. Qualified Windows symlink limits, raw host-helper failures, model/output limitations, all prior evidence, and completed disposable Python teardown remain recorded; no live profile activation.
- 2026-09-21T19:41:39Z - Work initial claim: T005@e4129c65 under Ship a2a-library-foundation. Verify JavaScript-only A2A source to Compose projection to rebuilt disposable dogfood, fresh role discovery and real advice; preserve live profile and claim no SDK runtime or Git delivery.
- 2026-09-21T23:30:56Z - Closed T005@e4129c65 through a fresh correctly scoped autonomous pass after unchanged-artifact verification and independent Reviewer APPROVE. The earlier invalid empty-scope run ended cleanly cancelled with its pending state and evidence preserved; no accepted scope was rewritten. Retained real dogfood use, cleanup, and execution-model/time qualifications remain explicit.
- 2026-09-21T23:30:56Z - Work initial claim: T006@2a8d70f3 under Ship a2a-library-foundation. Independently assess the complete JavaScript-only A2A library and V1-V3 evidence without repository edits, live activation, SDK runtime execution, or Git action.
- 2026-09-22T00:28:44Z - Closed T006@2a8d70f3 through the committed autonomous lane receipt after retaining its documentation rejection, applying the authorized three-document correction, fresh independent verification, and final Reviewer APPROVE for FR-001 through FR-016 and SC-001 through SC-006. All six 069 tasks are done; no ready task remains for this feature. One advisory retrospective completed with no issues. The optional JavaScript-only library is available as catalog source with observed disposable rebuilt-host use; the live profile remains uninstalled. Temporary Python providers and both disposable installations were removed. Qualified Windows symlink coverage, actual host-model differences, local-read timestamp limits, earlier failures, and the cancelled empty-scope attempt remain recorded without rewriting history. The separate Work admission repair is verified but uncommitted; this close performs no Git or release action. Feature 062 and idea 068 remain separate.

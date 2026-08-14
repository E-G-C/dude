---
title: GitHub Issue Work Intake
slug: github-issue-work-intake
status: defined
spec_path: .dude/specs/033-github-issue-work-intake/spec.md
---

# Idea: GitHub Issue Work Intake

## Idea

GitHub issues should become a first-class input to Dude's existing work-intake and specialist-routing workflow.

Desired behavior:

- Accept an explicit GitHub issue reference, such as `E-G-C/dude#20`, an issue URL, or a natural-language request like "ship issue 20."
- Fetch the issue and comments, then classify the issue by substance rather than treating every issue identically.
- Feature request: use the issue as raw input to the existing brainstorm route; capture accepted intent in `.dude/ideas/`; continue through define and Work when invoked through Ship; preserve a visible reference to the originating issue.
- Bounded bug or chore: route directly to appropriate implementation, testing, and independent-review specialists; do not force an idea/spec package unless investigation exposes unresolved product intent, architecture, or multi-stage planning.
- Blocker against active work: route through existing flag behavior and current execution authority.
- Ambiguous issue: ask one classification question during interactive intake; leave it unadmitted during future autonomous multi-issue orchestration rather than guessing.
- Once a feature request is captured as an idea, the Dude idea/package becomes authoritative for intent and execution. Later GitHub edits must not silently rewrite active Dude state.
- GitHub remains the external source, discussion, and closure record. A resulting pull request should reference the issue with `Fixes #<number>`, use `gh pr create --base main`, and verify the base.
- The same bounded intake operation should be reusable later by a high-level orchestrator handling multiple features, but this feature should first prove explicit single-issue intake.
- Status or discovery may surface unadmitted GitHub issues separately, but merely seeing an issue must not make it execution authority.

Keep it lean:

- Reuse the existing brainstorm -> idea -> define -> Work lifecycle.
- Reuse existing specialist routing, flag behavior, verification, review, and Ship semantics.
- Do not create a GitHub execution lane, duplicate tracker, issue cache, registry, daemon, background poller, or automatic processing of every open issue.
- Do not merge this with `conversational-brainstorm-intake`; conversational transition recognition and GitHub issue admission are separate concerns.
- Prefer the smallest extension to work intake and Ship target resolution that supports a current single-issue caller and can later be invoked by orchestration.

## Open Questions

Answered with the simplest defaults that need no new mechanism. Correct any that are wrong.

1. When an issue body and its comments conflict, what should determine the accepted current intent during initial admission?
   Answer: Nothing new. Read the body and comments together as one raw input and let the existing brainstorm capture normalize it, since the user owns `## Idea` and confirms accepted intent before it is captured. When a conflict leaves the outcome genuinely unclear, that is ordinary ambiguity and reuses the same single intake question. Add no precedence rule, recency heuristic, or comment-resolution algorithm.
2. When `#20` or "issue 20" omits an owner and repository, should Dude resolve it only against the current GitHub repository?
   Answer: Yes, current repository only, matching how `gh` already behaves. Any other repository requires the explicit `owner/repo#number` form or a URL. Add no default-repository setting and no search across repositories.
3. If Dude cannot fetch an issue or its comments because the reference is invalid, inaccessible, or rate-limited, should intake stop with an actionable error or accept issue content supplied explicitly by the user?
   Answer: Stop with an actionable error naming the reference and the reason. Add no paste-in or manual-content fallback, because a user who already has the text can run an ordinary `brainstorm` without the GitHub path.

## Assumptions

- An explicit issue reference or request starts one bounded intake operation. Discovery alone does not admit an issue or grant it execution authority.
- The issue and its comments are raw intake material. Classification and accepted feature intent still pass through Dude's existing intake authority.
- Feature requests reuse brainstorm capture and preserve an origin reference; the resulting Dude idea/package becomes authoritative after capture.
- Bounded bugs and chores can use existing specialist routing directly. They move into feature definition only when investigation exposes unresolved product intent, architecture, or multi-stage planning.
- Active-work blockers reuse existing flag behavior and the current execution authority.
- Interactive ambiguity produces one classification question. Future autonomous multi-issue orchestration leaves the issue unadmitted rather than guessing.
- GitHub remains the external source, discussion, and closure record, while Dude owns admitted intent and execution state.
- The first implementation proves explicit single-issue intake. Later orchestration may call the same bounded operation without requiring a GitHub-specific lane or background service.

<!-- dude:managed:start -->
## Normalized Intent

- Extend existing work intake and Ship target resolution to accept one explicit GitHub issue reference or natural-language issue request.
- Fetch the referenced issue and its comments once for the bounded intake operation, then treat the fetched text only as raw input.
- Classify by substance as a feature request, bounded bug or chore, blocker against active work, or ambiguous intake.
- Route a feature request through the existing brainstorm -> idea -> define -> Work lifecycle, preserving a visible origin reference and continuing through define and Work when Ship was invoked.
- Route a bounded bug or chore through existing implementation, testing, verification, and independent-review specialists unless investigation exposes unresolved product intent, architecture, or multi-stage planning.
- Route a blocker through existing flag behavior and the current execution authority.
- Ask one classification question when interactive intake remains ambiguous; without an answer, leave the issue unadmitted.
- Keep the captured Dude idea/package authoritative. GitHub changes do not synchronize back into active Dude intent or execution state.
- Keep GitHub as the external source, discussion, and closure record. When a pull request is created through existing delivery behavior, link the issue, target `main`, and verify that base.
- Resolve a bare issue number only in the current repository. Require an explicit repository or URL for any other repository.
- Stop on fetch failure with the reference and reason. Add no manual-content fallback.

## Constraints

- Reuse the existing intake, brainstorm, definition, Work, specialist-routing, flag, verification, independent-review, and Ship authorities.
- The surrounding user request retains its existing authority. An issue reference supplies input; it does not independently authorize execution.
- Treat the body and comments as one raw input with no precedence, recency, or comment-resolution rule.
- Add no GitHub execution lane, duplicate tracker, issue cache, registry, daemon, background poller, automatic open-issue processing, default-repository setting, cross-repository search, or paste-in fallback.
- Keep GitHub issue admission separate from `conversational-brainstorm-intake`.
- Preserve existing Ship behavior that performs no automatic Git or release action. Pull-request linkage applies only when existing delivery behavior creates a pull request.
- Scope implementation and tests to the explicit single-issue caller. Add no orchestration entry point or autonomous multi-issue machinery.
- Merely discovering or displaying an issue never admits it or gives it intent or execution authority.

## Definition Checklist

- [x] One bounded outcome is defined: explicit single-issue intake and substance-based handoff
- [x] All three intake questions are answered with defaults that add no new mechanism
- [x] Existing lifecycle, routing, flag, verification, review, and Ship authority remains explicit
- [x] GitHub's external-record role and Dude's post-capture authority are separated
- [x] Prohibited infrastructure and speculative orchestration are excluded
- [x] The technology-agnostic specification has no unresolved clarification
- [x] The implementation plan and all-open canonical tasks target the smallest current source surfaces

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured; definition deferred to explicit `define github-issue-work-intake`
- 2026-08-14 UTC - brainstorm rerun: the three open questions answered with minimal defaults (no comment-precedence rule, current-repository-only resolution for a bare number, actionable error on fetch failure); `## Idea` unchanged
- 2026-08-14 UTC - first definition -> .dude/specs/033-github-issue-work-intake/spec.md
- 2026-08-14 UTC - completed T001@69737375 and claimed T002@67756964: `## GitHub Issue Intake` now owns the bounded single-reference fetch, untrusted raw-input treatment, capture-or-execution admission gate with an execution-only bug/chore route, four-way substance classification, and conditional pull-request linkage, with concise delegation only in the coordinator's Routing, Ship, and Response sections; five `GitHub issue` static contracts pin those rules with deletion and mutation falsifiers plus a bounded prohibited-artifact inventory; two independent review cycles rejected the work and a topology-first reset then removed three unbounded paraphrase patterns that produced three false negatives and one false positive against the spec-required sentence `Resolve a bare issue number in the current repository.`, leaving nine named-artifact pins plus deletion-falsifiable default pinning; 103 contract tests, 11 build-dev tests, and lint passed with zero failures and independent review approved
- 2026-08-14 UTC - completed T002@67756964 and claimed T003@61637074: README, commands, workflow, and reference now document the supported issue references, current-repository-only bare numbers, one raw body-plus-comments input, the four substance routes, the capture-or-execution admission gate, actionable fetch failure without fallback, the visible `Origin:` line, post-capture Dude authority, and conditional pull-request linkage while preserving the existing no-automatic-Git wording; three review cycles pinned the documented rules with independently labeled presence assertions after probes proved that deleting the current-repository, raw-input, admission, FR-001, and FR-009 rules had left the suite green, and the physically line-bound assertions were converted to whitespace-normalized paragraph matching so a pure rewrap no longer false-positives; 8 focused and 105 contract tests passed with zero failures, lint reported zero findings, and independent review approved
- 2026-08-14 UTC - completed T003@61637074 and Feature 033 reached full task completion: the recursive suite passed 2321 of 2325 with zero failures and four skips, lint reported zero findings, compose verify exited zero, build-dev left generated core at exactly the two intended semantic surfaces with the intake section byte-identical between source and generated, and a pristine 64-file release lint reported zero failures with one `FEATURE_IDEAS_ROOT_MISSING` warning proven pre-existing by building the same release from a detached HEAD worktree; a live read-only smoke confirmed both specified paths, since `gh issue view 11 --repo E-G-C/dude --json number,title,body,comments,url` returned all five documented fields and a nonexistent reference returned an actionable error naming the reference and reason; the contract suite remains offline because its only fetch-command occurrences are assertion string literals with no process spawn; independent review approved the feature as a whole against FR-001 through FR-020 and SC-001 through SC-008
<!-- dude:managed:end -->

---
applyTo: ".github/agents/dude-pack-coding-*.agent.md"
description: "Host capability and isolation requirements for coding-pack roles; guidance, not an enforcement adapter."
---

# Host control requirements

Host-neutral requirements, not an enforcement adapter. Profiles and evaluation helpers do not enforce filesystem, command, network, or credential boundaries.

## Match capabilities to the assigned mode

| Role or mode | Intended writes | Intended execution |
| --- | --- | --- |
| System architect | Design docs/decision records in approved locations | None |
| Code reviewer | None | None; use read-only history/change views or supplied evidence |
| Software tester, authoring | Assigned tests/fixtures and explicitly approved test configuration | Relevant tests and bounded reproduction |
| Software engineer, implementation | Approved implementation, tests, related artifacts | Relevant implementation/validation |
| Execution-only | No agent edits; only needed, declared runner temporary/output artifacts | Supplied command/selectors; investigate only actual failures or assigned gaps |

Derive paths from the project, not language-specific names. Embedded tests and shared manifests mix test/production scope; path grants alone cannot enforce those semantics. Require approved edits or review at shared boundaries.

## Controls the host must supply when enforcement is required

1. **Tools:** expose only role/mode-appropriate tools. Reading a profile in a privileged assistant does not bind its declarations.
2. **Direct files:** validate approved targets and resolved paths, including new files, links, traversal, and outside-workspace access. Protect evaluator inputs, credentials, and coordinator artifacts.
3. **Indirect/external effects:** constrain shell commands and subprocesses too. Tests/interpreters can mutate production despite denied edit tools. Enforce filesystem, scratch, network, and credential limits; command-name allowlists are not isolation.
4. **Approval:** destructive/external actions need explicit approval. Preserve legitimate tester authoring while scoping permissions.
5. **Evidence:** retain effective configuration, denials, and tool results. Test allowed and denied direct/indirect operations in disposable fixtures before claiming enforcement.

Keep policy selection/enforcement outside agent writes. If required boundaries cannot be enforced, obtain suitable host controls or report the blocker; do not substitute prompt promises or claim enforcement.

## What this installation establishes

Local checks verify declarations, fixture preparation, and evidence handling, not host permissions. Tool lists prove no enforcement.

Exports distinguish agent/evaluator actions and omit private model reasoning and protected system/developer messages. Preserve visible messages and tool inputs/results; never reconstruct missing records from final claims.

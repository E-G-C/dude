# Detailed Walkthrough

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

Use this built-in example to learn the normal workflow without any external
files. The feature is common on most product teams: email/password
authentication for a web app.

## 1. Add a little project context

Give Dude a small amount of real context to plan with:

```text
@dude remember: auth events must be retained for 90 days
@dude remember: user-facing auth errors must be understandable and accessible
@dude remember: password reset links expire after 30 minutes
```

## 2. Draft the feature

Ask Dude to turn the feature idea into a brainstorm ledger:

```text
@dude draft a feature for email/password authentication with sign-in, sign-out, and password reset for a web app
```

If you want a quick orientation checkpoint before editing the draft, run:

```text
@dude status
```

In this phase, Dude should point you back to `brainstorm/authentication.md` as
the live collaboration surface.

The normal result is a file like `brainstorm/authentication.md`:

```markdown
---
title: User authentication
slug: authentication
status: draft
spec_path:
---

# Brainstorm: User authentication

## User Draft

Users need to sign in with email and password, sign out safely, and recover
access with a password reset email.

## Normalized Intent

- Support email/password sign-in for existing users
- Support sign-out for the active session
- Support password reset initiation and completion

## Constraints

- Authentication errors must be understandable to end users
- Password reset links expire after 30 minutes
- Audit events are retained for 90 days

## Open Questions

- None currently

## Assumptions

- Password reset is email-based
- Session management applies to one active browser session at a time
- Sign-in does not lock automatically after repeated failed attempts unless the
  project adds that requirement

## Definition Checklist

- [ ] Outcome is clear
- [ ] Scope is bounded
- [ ] Open questions are resolved or consciously assumed

## Definition Record

- No definition events yet
```

## 3. Define the package

Once the draft is clear enough, ask Dude to define the normal spec package:

```text
@dude define authentication
```

If you edit the brainstorm and run `@dude define authentication` again, Dude
re-reads the updated draft and refreshes the package instead of starting from
scratch.

After definition completes, you can run `@dude status` to confirm that you are
still in Definition Only and that `specs/001-authentication/` is now the live
artifact.

The same normal outcomes from [Workflow modes and lifecycle](workflow.md) apply
here: immediate package completion, or a pause before `plan.md` until guardrails
are ratified. If you reply in the same conversation, Dude can continue the
paused definition immediately. If you return later, rerun
`@dude define authentication` to resume.

If definition completes immediately, the normal package looks like:

```text
specs/
└── 001-authentication/
    ├── spec.md
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── tasks.md
    └── contracts/
        ├── api.md
        └── schemas.md
```

If definition pauses for guardrail approval first, use the setup guidance in
[Setup and first feature](setup.md) as the expected interaction shape, then
expect the completed package above.

Once definition completes, `brainstorm/authentication.md` should read
`status: defined` and have a populated `spec_path:` pointing at
`specs/001-authentication/spec.md`.

## 4. Continue without Beads

If you want to keep moving without installing Beads, stay in Lightweight
Execution:

```text
@dude status
@dude implement the next task for authentication without Beads
```

At that point, `specs/001-authentication/tasks.md` is the live markdown
execution board. A generated board view may appear near the top of the file
with `## Ready Now`, `## In Progress`, `## Blocked`, and `## Done` sections.
Canonical task headers use `[ ]`, `[~]`, `[!]`, and `[x]`, and `[x]` should be
applied only after Dude closes the work with fresh verification evidence,
preserving any durable task key. `@dude status` should report the ready-now
task plus the state counts.

### Example Lightweight Execution conversation

This is the shortest realistic no-Beads loop after definition:

```text
You: @dude status

Dude:
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Action: status
Updated:
- Current lane: Lightweight Execution
- Live artifact: specs/001-authentication/tasks.md
- Not started: 11
- In progress: 0
- Blocked: 0
- Done: 0
- Ready now: T001@a1b2c3d4
Next:
- Continue execution from tasks.md

You: @dude implement the next task for authentication without Beads

Dude:
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Routed T001@a1b2c3d4 to the owning specialist and ran the Lightweight close workflow.
`specs/001-authentication/tasks.md` remains the live markdown execution board, and Dude marked
T001@a1b2c3d4 complete after verification.

Next:
- Continue execution from tasks.md
- Run @dude status for an updated snapshot

You: @dude status

Dude:
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Action: status
Updated:
- Current lane: Lightweight Execution
- Live artifact: specs/001-authentication/tasks.md
- Not started: 10
- In progress: 0
- Blocked: 0
- Done: 1
- Ready now: T002@b5d7e1c3
Next:
- Continue execution from tasks.md

You: @dude flag authentication does not define lockout behavior after repeated failed sign-in attempts

Dude:
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Action: flag
Classified as: spec-gap
Updated:
- Blockage recorded as spec-gap
- Routed to @spec-lead for definition updates
Next:
- Keep the current task unchecked until the blocker is resolved
```

The point of this lane is that you can keep moving with one live markdown
execution board and no Beads setup, then switch to `@dude track` later if you
want Beads-backed tracked execution.

## 5. Track in Beads

When you want tracked execution, hand the defined feature into Beads. Use the
`Before you run @dude track` checklist in [Workflow modes and lifecycle](workflow.md)
first:

```text
@dude track
@dude status
```

This follows the same tracked-execution flow described there: resume in-progress
work, import the defined authentication feature if needed, then route the next
ready task. Follow with `@dude status` when you want a read-only confirmation
that Beads is now the live board and to see what is ready next.

## 6. Flag definition gaps instead of patching around them

If implementation discovers that the definition package is incomplete or
inconsistent, send that feedback back through Dude:

```text
@dude flag spec-gap: the authentication feature does not define lockout behavior after repeated failed sign-in attempts
@dude flag contract-mismatch: the password reset payload in contracts/api.md does not match the backend route
```

That is the normal closed loop: draft -> define -> Lightweight Execution or
track -> flag when needed.

An empty or missing `brainstorm/` or `specs/` directory is fine. Dude can create
them when drafting or definition starts.
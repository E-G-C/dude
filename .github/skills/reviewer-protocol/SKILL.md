---
name: "reviewer-protocol"
description: "Use when a reviewer approves or rejects work, when revision ownership must change after rejection, or when enforcing independent review cycles."
---

# Reviewer Protocol

> Companion skill: `receiving-code-review` covers the author-side workflow for handling rejection findings. Load it together with this skill when coordinating a rejection-and-revision cycle.

## Purpose

Keep review independent and prevent self-revision loops after rejection.

## Rules

- Reviewers may approve, reject, or escalate.
- If work is rejected, the original author should not perform the next revision cycle when another specialist is available.
- Rejection must include concrete reasons.
- Approval should mean materially ready, not merely promising.

## Revision Rule

When work is rejected:

1. record the rejection reason with concrete findings
2. if multiple specialists cover the domain, assign the revision to a different
   one than the original author
3. if only one specialist covers the domain (the common case), that specialist
   revises — but must receive the rejection feedback explicitly so they address
   the specific findings rather than repeating the same approach
4. the reviewer remains independent from the reviser in all cases

## Escalate Instead Of Faking Certainty

Escalate when:

- the rejection reason is really an unresolved product decision
- the same specialist has failed revision twice on the same findings
- the artifact boundary is too unclear for a fair review

## Learning Trigger

If the reviewer finds the same kind of issue across multiple reviews, flag it to the coordinator for potential auto-learn skill creation.

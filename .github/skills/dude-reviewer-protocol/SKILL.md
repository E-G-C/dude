---
name: "dude-reviewer-protocol"
description: "Use for independent verdicts, rejection routing, revision ownership, and repeated-failure escalation."
---

# Reviewer Protocol

The reviewer stays independent from implementation, revision, testing, and close. A verdict is `APPROVE`, `REJECT`, or `ESCALATE`; rejection includes concrete findings and approval means materially ready.

## Rejection Procedure

1. The reviewer records and returns its verdict, concrete findings, and optional reviser recommendation; it does not load the receiving-review skill, assign, or revise.
2. The coordinator records the findings, loads `dude-receiving-code-review`, and assigns a different reviser if available and credible; otherwise it may assign the original author.
3. The selected reviser validates each finding, addresses accepted findings, and reruns focused verification without self-approving or selecting a reviewer.
4. The coordinator sends the revision to an independent reviewer for re-review.
5. A second failure on the same finding escalates to the user; do not repeat the loop or fake certainty.

Also escalate unresolved product authority, insufficient evidence, or an artifact boundary too unclear for fair judgment.

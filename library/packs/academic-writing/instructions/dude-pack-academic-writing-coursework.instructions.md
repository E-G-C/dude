---
description: "Academic-writing guidance for coursework in repository-root module directories named m<N>."
applyTo: "m[0-9]*/**"
---

# Coursework writing

For coursework assignments, discussion posts, study explanations, and research responses in this scope, follow [.github/skills/dude-pack-academic-writing-foundation/SKILL.md](../skills/dude-pack-academic-writing-foundation/SKILL.md). Route drafting and revision to the [Academic Writer](../agents/dude-pack-academic-writing-writer.agent.md).

For assignments, save one Markdown working draft per question for user review. The consolidated APA 7 Word document is the official assignment draft and primary final deliverable. Merge only approved submission content into that document after explicit user confirmation that the reviewed draft looks good and is ready to merge. Do not automatically create, regenerate, or update the Word document from unapproved drafts; later Markdown revisions require fresh confirmation. Follow the foundation's "Produce the assignment draft" procedure for review, merging, formatting, and delivery checks.

Check assignments independently by default at two points: before the drafts are presented for approval, and after an approved merge, on the actual consolidated output, before it is called final. Run available deterministic checks first, then give a fresh [Academic Deliverable Verifier](../agents/dude-pack-academic-writing-deliverable-verifier.agent.md) context the exact draft or output, all available answers in question order, the prompt, course overrides, and assigned sources. Allow one authorized correction pass and one recheck. Other writing is checked on request, and the user may decline the check; disclose a declined or unavailable check. Follow the foundation's "Check assignments independently" procedure. Do not substitute another verifier, and no check replaces Reviewer acceptance or the user's approval of the exact current content before a merge.

For each authorized coursework problem solution, also save a separate `<answer-stem>-worked-solution.md` beside the answer. Follow the foundation's worked-solution companion procedure to document inputs, methods, intermediate steps, and justification, including for conceptual problems without data. Keep it consistent with the answer when revising.

Use the foundation's "Select the task and course" procedure to identify the selected course and module. Read `course-context.md` when supplied or present in the selected course directory or an applicable ancestor, and use it only within its stated scope. If no context file exists, use the selected task's prompt, rubric, overview, and verified source passages. Do not borrow another course's facts or make missing optional metadata an unconditional prerequisite.

The default binding covers repository-root directories following the `m<N>` module convention and their subdirectories, including later modules without per-module edits. It does not cover other course layouts, source-book directories, or unrelated vault content. A matching path is an entry point, not proof of course identity or assigned readings.

Keep course-specific settings local. This binding does not change ownership of configuration authoring, verification, feature definition, independent acceptance, or workflow state.

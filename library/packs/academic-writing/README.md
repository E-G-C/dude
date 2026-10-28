# Academic Writing pack

This directory is the distributable source for a Dude capability pack. It contains reusable writing guidance, not student submissions or course-specific material.

## Contents

| Source | Installed role |
| --- | --- |
| [Academic Writer](agents/dude-pack-academic-writing-writer.agent.md) | A coursework writer for assignments, discussions, APA-supported responses, and quantitative companions. |
| [Academic Deliverable Verifier](agents/dude-pack-academic-writing-deliverable-verifier.agent.md) | Read-only academic findings on grammar, evidence, citations, prose, and applicable output agreement. |
| [Academic-writing foundation](skills/dude-pack-academic-writing-foundation/SKILL.md) | Shared source, voice, citation, context, and deliverable guidance. |
| [Coursework instructions](instructions/dude-pack-academic-writing-coursework.instructions.md) | A generic entry point for root `m<N>` module directories and their subdirectories. |

The [pack manifest](pack.md) declares these four installable artifacts and their catalog metadata.

The foundation shares its generic writing policy with the source workspace's local foundation. Pack-owned identities and source metadata distinguish the distributable artifacts:

- `dude-local-academic-writer` becomes `dude-pack-academic-writing-writer`.
- `dude-local-academic-deliverable-verifier` becomes `dude-pack-academic-writing-deliverable-verifier`.
- `dude-local-academic-writing` becomes `dude-pack-academic-writing-foundation`.
- Both pack agents declare `model-class: inherit`; Compose projects Copilot profiles using the destination's configuration rather than shipping fixed model identifiers. This does not guarantee different drafting and checking models.

The generic coursework instructions reference the pack-owned writer, verifier, and foundation rather than the source workspace's local roles.

The source workspace's Customization Verifier is a separate project support role for checking customizations and is not included. That workspace also has a local Academic Deliverable Verifier that duplicates the pack verifier; editing this directory does not activate the pack copy there. Course context, class-specific settings, source books, answers, datasets, workbooks, and `.dude` project state are excluded.

## Prerequisites

Use a Dude installation with the native Compose and agent-projection tooling. Install its `writing` pack before this one; the foundation references that pack's style and trope-editing skills. Compose does not install dependencies automatically.

Node.js is required for Compose and lint. Python tooling, including `uv`, is conditional on a coursework task that uses Python; ordinary prose does not require it.

The agent's and instruction file's links are written for the installed `.github` layout. Cross-pack writing-skill links resolve after the prerequisite is installed; they are not bundled source files here.

## Install in another workspace

1. Copy this complete directory to `library\packs\academic-writing` in a target Dude workspace.
2. Confirm that the `writing` pack is installed and that no existing coursework writer or academic verifier will create an ambiguous duplicate role.
3. From the target workspace, preview the installation:

   ```powershell
   node .github\skills\dude-compose\compose.mjs add academic-writing --no-fetch --dry-run --json
   ```

4. Review the proposed files and conflicts. After explicit confirmation, install and validate:

   ```powershell
   node .github\skills\dude-compose\compose.mjs add academic-writing --no-fetch --json
   node .github\skills\dude-lint\lint.mjs .
   ```

Alternatively, leave the catalog in a separate source checkout and pass `--source C:\path\to\source-checkout --no-fetch` to both preview and add. The source checkout must contain `library\packs\academic-writing`; `--source` takes that checkout root, not this individual pack directory.

Do not use `--force` to bypass conflicts. Installation is opt-in and is separate from keeping this source directory.

## Course setup

Ask Dude to draft or revise coursework and identify the course/module, prompt, rubric, and assigned sources. The writer reads relevant source passages before drafting.

A course may supply a plain Markdown `course-context.md` in its directory or an applicable ancestor. Describe its scope, source locations, known instructor/formatting details, and optional writing benchmarks. No schema or parser is required. The context does not replace module reading instructions or supply facts for other courses, and unknown optional metadata does not block an answer that does not need it.

Describe module scope and layout by naming convention rather than by listing modules or readings, so the context stays complete as the course advances. For example, a context can state that root directories named `m<N>` hold Module N and describe what each module directory contains. Each module's overview remains the source of its readings.

The pack installs a scoped instruction with `applyTo: "m[0-9]*/**"`. This default covers root module directories and their descendants, including later modules, without a module list. It does not cover nested layouts such as `other-course/m1/` or unrelated paths such as `book/`, `.wiki/`, `library/`, and root files.

The glob is not strict numeric-name validation: it can also match a name such as `m2a/`. Use the selected course context to establish course identity and reading scope. Native instruction attachment depends on the host; package verification does not establish IDE auto-attachment.

Course layouts outside this convention need their own scoped local binding to the installed foundation. Keep class facts and concrete course links outside the generic pack. A missing context file is not a blocker when the selected prompt, overview, and source evidence establish what the task needs.

Assignments ordinarily use impersonal academic prose; discussions use first person without invented personal history. Explicit reflection requirements can override the assignment default. That default is a writing convention, not an APA prohibition. Explanation depth follows the prompt and assigned readings, with no separate brevity cap.

Unless the task or instructor explicitly requires another output format, assignments use one Markdown working draft per question for user review and one consolidated Word document (`.docx`) as the official assignment draft and primary final deliverable. Editing Markdown does not automatically update Word. Merge only approved submission content after the user explicitly confirms that the reviewed question or assignment draft looks good and is ready to merge. Later Markdown revisions need fresh confirmation before another merge.

While approval is pending, leave the Word document unchanged and identify unanswered or unapproved questions in the Markdown review handoff. After confirmation, transfer approved answers, citations, and required tables or figures into the same Word document, preserving existing user edits and unrelated sections. Keep drafting notes, review comments, raw Markdown syntax, and unrequested worked-solution material out of the submission.

The Word draft follows APA 7, with 12-point Times New Roman as the default unless an explicit assignment or instructor requirement overrides it. The foundation specifies page layout, headings, references, and document-opening or rendering checks. Consolidate the approved answers' sources into one References section rather than repeating each question's reference list. Retain the Markdown drafts and companions; they support, rather than replace, the Word deliverable.

Every coursework problem solution requires a separate `<answer-stem>-worked-solution.md` beside the answer, including conceptual or algebraic solutions without a dataset. It records the given inputs, source basis, method, intermediate steps, units, rounding, and justification for each conclusion. Keep it consistent with revisions to the answer; distinguish supplied values from calculated results and disclose what missing data prevent recomputing.

Answers containing data analysis or charts also require a reviewable Excel companion. When code is used, the complete source, dependencies, and rerun instructions accompany the answer. The worked-solution Markdown does not replace those artifacts. Prose-only or algebraic work without data analysis or charts does not require a workbook or code, and ordinary discussion or reflection prose without problem solving does not require a worked-solution file. Review-only and no-write requests authorize none of these file writes.

## Independent academic checking

Assignment drafts are checked by default at two points: before the drafts are presented for approval, and after an approved merge, on the actual consolidated output, before it is called final. Other writing is checked on request. The user may decline the check; a declined or unavailable check is disclosed, never implied.

At each check, the coordinator runs available deterministic checks first, then supplies the selected draft or actual output, all available answers in question order, its prompt and applicable course overrides, source passages, and observed deterministic check results to a fresh checking context. Keep the writer's self-assessment and evaluation answer keys out of that packet.

The verifier separates five dimensions: prose/repetition, grammar/mechanics, reasoning and values, citation/provenance, and applicable final-artifact agreement. It reads all answers in sequence, so it can flag commentary on the prompt's wording and definitions, cautions, or conclusions repeated across answers, while keeping the context each answer needs. Each finding identifies the artifact/version, location and excerpt, supporting evidence or requirement, and a suggested correction or reason to keep/defer it. Its dispositions are **confirmed error**, **optional improvement**, **valid wording / false positive**, and **unable to verify**.

Use available deterministic checks first for arithmetic, references, required sections, and output differences. The verifier has read/search tools only: an authorized existing checker supplies execution evidence. Missing commands, source passages, actual output, or rendering evidence remain unverified. Grammar flags, familiar phrases, and detector percentages do not establish authorship or semantic correctness.

The handoff is draft, independent findings, authorized Academic Writer correction, then one recheck of changed content and affected relationships. The independent Reviewer retains acceptance. The user still approves the exact current content before any real Word merge; revisions need fresh approval. Checking adds no automatic rewrite loop, merge trigger, or new approval state.

Use a different actual model/family only when already supported and authorized, and record the observed pairing. Role names, fresh context, and `inherit` metadata prove no model diversity. Unknown metadata and unavailable checks must be disclosed. A no-finding response supports only the inspected evidence slice.

After an approved merge, inspect the actual selected output against the approved content, including cross-question assembly and sentence boundaries. Allow explained presentation changes; do not allow altered claims or stale text. Text extraction alone does not verify Word layout. This source update makes no claim that native attachment, a new agent execution, or a real final-document review has occurred.

## Evaluate changes with a bounded pilot

Use normal scoped writing/checking delegation and existing validation tools. This pack adds no model API, evaluation runner, persistent results system, or automatic rewrite loop. Keep synthetic material clearly labeled and separate from student submissions. Private coursework is an optional, explicitly selected local regression input, never a pack dependency or material to publish.

1. Select small development and held-out whole-document/topic cases across more than one course context. Supply each case's prompt, source passages, citation/voice/output requirements, and evidence gaps. Include relevant quantitative and nonquantitative work without imposing numerical methods on a prose-only course. Include at least one realistic multi-part assignment or a real reviewed document. Short synthetic passages with planted defects are easy for every procedure and can leave both conditions at the ceiling.
2. Before inspecting holdout results or changing guidance, freeze the input text, original guidance, conditions, repeat budget, acceptance criteria, and the rule for claiming improvement. Have an independent reviewer establish source-backed defect labels, clean/KEEP controls, missing-evidence cases, and exact count units. Isolated mutations can test agreement, incomplete clauses, values/units, quotations, unsupported claims, or stale output; include compound passages separately. Do not expose labels, mutation status, prior-condition outputs, or writer self-assessments to measured participants.
3. Capture genuine pre-change writing and frozen-document checking observations. After the change, run fresh proposed-guidance writing and check the identical frozen documents separately. Then allow one authorized correction pass and one changed-content/relationship recheck for each proposed answer. Keep generation, verifier-only detection, and correction comparisons separate; never resample until a preferred result appears. Use the active roster rather than treating an uninstalled source file as a dispatch identity. Send both conditions the same packet through the same dispatch path, and check that it arrives intact. If the transport alters text, keep the alteration identical across conditions and disclose it.
4. Prefer existing deterministic checks for actual arithmetic, citation/reference correspondence, required artifacts, and output differences; use independent source-backed judgment for meaning and prose. Record exact inputs, prompts, source/guidance fingerprints, outputs, conditions/repeats, and observable model IDs/settings. Report missing metadata rather than infer it. Use an already authorized different-model pairing only when its actual identities are observable; no extra model access or mapping change is implied.
5. Adjudicate findings and compare complete passages against their own sources. A simple 0/1/2 rubric can distinguish missing/incorrect, partly effective/unclear, and clear/supported evidence-to-claim fit, referents, paragraph contribution, and sentence correctness. Score documents before comparison and blind condition labels where practical. Report improved, tied, and regressed cases separately, preserving all correctness failures and the first holdout observations.

Report supported/all confirmed-error findings, correctly located/classified detections/eligible defects, false positives/clean control units, repaired/attempted substantive corrections, new errors, retained/checked invariants, and specific abstentions/intentional evidence gaps. Keep optional style suggestions separate from confirmed errors. Define overlapping control bundles explicitly rather than adding them as independent samples. Zero denominators are undefined, not perfect scores; a no-finding result or a no-op correction proves no improvement.

Claim an improvement only when the changed guidance beats the baseline on a frozen measure without worsening a guarded one, such as false positives, unsupported confirmed findings, or new errors. A tie, including both procedures scoring perfectly, shows preservation and nothing more. Save every raw observation and the adjudication verbatim, separate from the maintainer's summary, and keep the frozen inputs, raw outputs, scores, and summary with the adopting workspace's feature record. This README describes the method only and records no dated results.

Use the selected task's applicable companion and approval safeguards throughout. A conceptual problem may require a worked-solution file without requiring a workbook; prose-only discussion may require neither. A synthetic approval scenario is test data, not permission to modify a real final document. Report an instruction walkthrough separately from actual file comparison, rendering, workbook opening, or native instruction attachment.

## Maintain and validate the source

Edit this source directory, not generated installed pack profiles. Preview a refresh before applying source changes to an installed copy. Keep persistent project-specific overrides under `dude-local-` names.

From the source workspace with Dude and the `writing` prerequisite installed:

```powershell
node .github\skills\dude-compose\compose.mjs list --no-fetch --use-case academic-writing --json
node .github\skills\dude-compose\compose.mjs add academic-writing --no-fetch --dry-run --json
node .github\skills\dude-compose\compose.mjs verify --json
```

`verify` checks the local catalog by installing into a throwaway bundle, running lint, and removing the pack. It does not install the pack into the source workspace or certify future generated answers.

## Existing local installation

The source workspace's local cutover is complete: its duplicate module instruction files were removed, and its local writer, foundation, and convention-based binding remain in use. That workspace also has a local Academic Deliverable Verifier for its default checks.

This source update does not install the pack, replace that local setup, or change its workflow state. Activating this pack in the source workspace would duplicate both the local Academic Writer and the local Academic Deliverable Verifier, and each coursework binding would route to its own copies. A future, separately reviewed transition must resolve both roles and the affected bindings before activation. Different filenames and a conflict-free Compose preview do not prove that routing is unambiguous.

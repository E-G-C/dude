// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowPath = fileURLToPath(new URL('./SKILL.md', import.meta.url));
const workflow = fs.readFileSync(workflowPath, 'utf8');

function sectionBetween(content, start, end) {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  assert.notEqual(endIndex, -1, `missing section after ${start}: ${end}`);
  return content.slice(startIndex, endIndex);
}

function expectText(section, text, label) {
  const normalizedSection = section.replace(/\s+/g, ' ');

  assert.equal(
    normalizedSection.includes(text),
    true,
    label,
  );

  // Deleting this exact contract must make this labeled assertion fail. This
  // keeps prose checks resistant to a removed or weakened requirement while
  // allowing harmless Markdown rewrapping.
  const deletedContract = normalizedSection.replace(text, '');
  assert.throws(
    () => assert.equal(deletedContract.includes(text), true, label),
    (error) => error instanceof assert.AssertionError && error.message.includes(label),
    `${label}: deleting the required contract must fail its own assertion`,
  );
}

test('design workflow preserves tracked-lane authority after approval', () => {
  // Arrange
  const purpose = sectionBetween(workflow, '## Purpose', '## When This Activates');
  const removedBeadsClaim = ['With Beads', 'removed'].join(' ');

  // Assert
  assert.equal(workflow.includes(removedBeadsClaim), false);
  assert.match(purpose, /When no tracked lane is active, approved design work defaults to Lightweight Execution from `\.dude\/specs\/<feature>\/tasks\.md`/);
  assert.match(purpose, /Once `@dude track` activates tracked execution, Beads is the authoritative live board and `tasks\.md` is a one-way mirror\/portability snapshot only/);
});

test('design workflow keeps every execution and closure instruction lane-aware across the whole skill', () => {
  // Arrange
  const approvalGate = sectionBetween(workflow, '## Approval Gate', '## Task Generation');
  const taskGeneration = sectionBetween(workflow, '## Task Generation', '## Design Close Protocol');
  const closeProtocol = sectionBetween(workflow, '## Design Close Protocol', '## Post-Implementation Refinement Loop');
  const refinement = sectionBetween(workflow, '## Post-Implementation Refinement Loop', '## Routing');
  const avoidIndex = workflow.indexOf('## Avoid');
  assert.notEqual(avoidIndex, -1, 'missing Avoid section');
  const avoid = workflow.slice(avoidIndex);

  // Assert — no stale "Beads removed" framing survives anywhere in the skill
  assert.equal(workflow.includes('With Beads removed'), false, 'no "With Beads removed" framing anywhere');

  // Assert — no unconditional tasks.md execution default remains anywhere
  assert.equal(
    workflow.includes('execution defaults to `tasks.md`'),
    false,
    'the tasks.md default must be conditioned on lane state, never unconditional',
  );
  assert.match(avoid, /Do not ask the user to choose an execution lane/);
  assert.match(avoid, /without active tracking, execution defaults to Lightweight Execution from `tasks\.md`/);
  assert.match(avoid, /when `@dude track` is active, Beads is the live board with `tasks\.md` mirror-only/);

  // Assert — Approval Gate allows implementation through the active lane, naming both lanes
  assert.match(approvalGate, /allow implementation through the active execution lane/);
  assert.match(approvalGate, /Lightweight Execution from `tasks\.md`/);
  assert.match(approvalGate, /Beads when tracked execution is active/);

  // Assert — Task Generation cedes execution state to Beads under tracking, tasks.md mirror-only
  assert.match(taskGeneration, /when `@dude track` has activated tracked execution, execution state is governed by Beads/);
  assert.match(taskGeneration, /`tasks\.md` is a one-way mirror only/);

  // Assert — Design Close Protocol routes closure through the active lane, not only a bare [x]
  assert.match(closeProtocol, /Lightweight Execution/);
  assert.match(closeProtocol, /Beads/);
  assert.match(closeProtocol, /bd close/);
  assert.match(closeProtocol, /mirror/);

  // Assert — refinement block action is lane-conditional and keeps design-gap classification
  assert.match(refinement, /block the current task through the active lane/);
  assert.match(refinement, /bd update --status blocked/);
  assert.match(refinement, /design-gap/);
});

test('design workflow uses the canonical idea graph and exact unique ownership', () => {
  // Arrange
  const coreModel = sectionBetween(workflow, '## Core Model', '## Mutation Preconditions And Ownership');
  const mutationRules = sectionBetween(workflow, '## Mutation Preconditions And Ownership', '## Mock Iteration');

  // Act
  const hasCanonicalGraph = /\.dude\/ideas\/<slug>\.md[\s\S]{0,250}-> \.dude\/specs\/<feature>\/spec\.md[\s\S]{0,250}-> \.dude\/specs\/<feature>\/design\/[\s\S]{0,250}-> \.dude\/specs\/<feature>\/tasks\.md/.test(coreModel);

  // Assert
  assert.equal(hasCanonicalGraph, true, 'core model must flow from one flat idea to spec, design, and tasks');
  assert.match(mutationRules, /Resolve exactly one companion idea from direct flat `\.dude\/ideas\/\*\.md` ledgers whose `spec_path` exactly equals/);
  assert.match(mutationRules, /If zero or multiple ideas claim that exact path,[\s\S]{0,220}stop before any idea, spec, log, status, routing, or task mutation/);
  assert.match(mutationRules, /Never infer ownership from a slug, directory name, or alternate path; exact canonical `spec_path` equality is the only owner match/);
});

test('coordinator and Spec Lead ownership covers every design lifecycle log', () => {
  // Arrange
  const logContracts = [
    /coordinator append the settle event to the uniquely owning companion idea's `## Coordinator Log`/,
    /coordinator append the approval event to the uniquely owning companion idea's `## Coordinator Log`/,
    /coordinator append the close classification and any routing decision to the uniquely owning companion idea's `## Coordinator Log`/,
    /coordinator append the reopen reason to the uniquely owning companion idea's `## Coordinator Log` in `\.dude\/ideas\/<slug>\.md`/,
  ];

  // Act
  const missingLogs = logContracts.filter((pattern) => !pattern.test(workflow));

  // Assert
  assert.match(workflow, /Only the coordinator appends to `## Coordinator Log` or mutates idea `status`, design `design_status`, task glyphs, or task metadata/);
  assert.match(workflow, /During definition, `@dude-spec-lead` maintains idea metadata and the design-shaped `spec\.md` within that ownership boundary/);
  assert.deepEqual(missingLogs, [], 'settle, approval, close, and refinement must log to the unique idea');
});

test('new scope starts with brainstorm then define and design-brief remains valid domain wording', () => {
  // Arrange
  const preservedDomainWording = /Do not create a separate `design-brief\.md` plus `design-proposal\.md`; the approved proposal is `spec\.md`\./;

  // Act
  const newScope = sectionBetween(workflow, '| **New scope / new idea**', 'When reopening an approved proposal for refinement:');

  // Assert
  assert.match(newScope, /`@dude brainstorm <idea>`[\s\S]{0,160}`@dude define <slug>`/);
  assert.match(workflow, preservedDomainWording);
});

test('design workflow defines a format-neutral primary artifact before output', () => {
  // Arrange
  const coreModel = sectionBetween(workflow, '## Core Model', '## Mutation Preconditions And Ownership');
  const iteration = sectionBetween(workflow, '## Mock Iteration', '## Functional Realism');

  // Assert
  expectText(
    coreModel,
    'For a raw or draft design idea, capture the flat ledger with `@dude brainstorm <idea>` when needed, then explicitly run `@dude define <slug>` before the first managed render, export, or capture.',
    'raw ideas define before their first render, export, or capture',
  );
  expectText(
    coreModel,
    'Definition establishes a lean design package with `design_status: exploring` and a `preview_path` that records the selected primary artifact\'s exact workspace-relative filename and actual extension under `.dude/specs/<feature>/design/`;',
    'definition records the selected primary actual filename and extension',
  );
  expectText(
    coreModel,
    'Brainstorm alone creates no design package or mock. Do not render, export, or capture a temporary mock as a shortcut.',
    'brainstorm alone cannot create a temporary output',
  );
  expectText(
    iteration,
    'The first actual output is the canonical primary mock under `.dude/specs/<feature>/design/`. Select its format for the target and intended output.',
    'primary format is selected for the target and intended output',
  );
  expectText(
    iteration,
    'HTML, PDF, PNG/JPEG, SVG, other images or documents, slides or decks, canvas exports, and MCP or other tool output are illustrative examples, not an allowlist.',
    'format examples are illustrative rather than an allowlist',
  );
  expectText(
    iteration,
    'Keep every required asset, source, export, variant, page, or other supporting file beside it under that `design/` directory.',
    'required supporting files stay colocated under design',
  );
});

test('design workflow retains one actual-path orientation authority', () => {
  // Arrange
  const iteration = sectionBetween(workflow, '## Mock Iteration', '## Functional Realism');

  // Assert
  expectText(
    iteration,
    '`preview_path` identifies that primary artifact by its exact workspace-relative filename and actual extension through `design_status: exploring`, `proposed`, and `approved`.',
    'preview_path retains the exact actual extension through every design state',
  );
  expectText(
    iteration,
    'It is the sole orientation entrypoint and live authority; supporting files do not become a second live authority.',
    'one primary orientation entrypoint has no second live authority',
  );
  expectText(
    iteration,
    'Every design-loop response that creates, updates, or resumes the mock reports the exact current `preview_path`.',
    'create update and resume report the exact current preview_path',
  );
});

test('design workflow hands tool and external artifact sets into the package', () => {
  // Arrange
  const iteration = sectionBetween(workflow, '## Mock Iteration', '## Functional Realism');

  // Assert
  expectText(
    iteration,
    'Export or save MCP and other tool output into `design/` before treating it as the current mock.',
    'MCP and other tool output is exported or saved under design',
  );
  expectText(
    iteration,
    'If accepted current content arrives from an external or scratch location, copy, move, save, or export its primary artifact and every required supporting file into `design/` before continuing.',
    'external or scratch primary and supporting artifact set is handed into design before continuation',
  );
  expectText(
    iteration,
    'The external or scratch source may remain as inert input after handoff, but the canonical `preview_path` artifact set is the sole live authority and receives all later edits.',
    'external handoff leaves only the canonical artifact set live',
  );
  expectText(
    iteration,
    'Record useful external sources, sessions, or tool references under `design/references/` only as context.',
    'useful external references stay only under design references as context',
  );
  expectText(
    iteration,
    'A reference or external session cannot become `preview_path`, replace the artifact set, or hold live authority.',
    'references and external sessions cannot become preview_path or live authority',
  );
});

test('design workflow resumes the recorded artifact set after restart and stops on missing files', () => {
  // Arrange
  const resume = sectionBetween(workflow, '## Resume And Orientation', '## Approval Gate');

  // Assert
  expectText(
    resume,
    'For an existing design package, design-workflow resume and orientation report the exact current workspace-relative `preview_path`, including the primary artifact\'s actual filename and extension.',
    'resume reports the exact recorded primary path and actual extension',
  );
  expectText(
    resume,
    'After a process, session, or computer restart, and in `exploring`, `proposed`, or `approved`, inspect and continue that primary artifact and every required supporting file according to the current state; do not silently recreate, replace, abandon, supersede, or select another artifact set.',
    'restart inspects and continues the recorded primary and required supporting files',
  );
  expectText(
    resume,
    'If the primary artifact or any required supporting file is missing, report each missing exact path and stop instead of manufacturing a replacement.',
    'missing primary or supporting files report each exact path and stop',
  );
});

test('design workflow keeps format-appropriate correction and evidence requirements', () => {
  // Arrange
  const iteration = sectionBetween(workflow, '## Mock Iteration', '## Functional Realism');

  // Assert
  expectText(
    iteration,
    '**Edit or compose -> render, export, or capture as appropriate -> inspect -> user corrects -> repeat.**',
    'correction loop supports edit or compose then render export or capture and inspection',
  );
  expectText(
    iteration,
    'Capture and retain screenshot evidence wherever it applies.',
    'screenshot evidence is captured and retained wherever applicable',
  );
  expectText(
    iteration,
    'Directly inspect an inherently viewable artifact when that establishes its visible output without a separate image screenshot solely duplicating it,',
    'direct inspection avoids only a duplicative image screenshot for inherently viewable output',
  );
  expectText(
    iteration,
    'but direct inspection never waives otherwise applicable screenshot evidence.',
    'direct inspection never waives applicable screenshot evidence',
  );
  expectText(
    iteration,
    'Refinements remain ungated; only direction sign-off is gated.',
    'refinements remain ungated while direction sign-off stays gated',
  );
  expectText(
    iteration,
    'Settle happens **before** approval; approval is the next gate.',
    'settlement precedes approval',
  );
});

test('design workflow keeps package boundaries and deliberately small persistence', () => {
  // Arrange
  const activation = sectionBetween(workflow, '## When This Activates', '## Core Model');
  const assets = sectionBetween(workflow, '## Preview Assets', '## Resume And Orientation');

  // Assert
  expectText(
    assets,
    '`design/` contains the primary mock and its required supporting files, not product source. Apply an approved design in the target\'s normal source location; do not turn the primary mock into product source.',
    'design artifact sets remain separate from product source',
  );
  expectText(
    assets,
    'The ordinary repository or worktree filesystem provides the artifact set\'s persistence across a process, session, or computer restart.',
    'persistence is ordinary repository or worktree filesystem survival',
  );
  expectText(
    assets,
    'It does not recover a deleted file or uncommitted work lost with the disk.',
    'ordinary persistence does not promise deleted or disk-loss recovery',
  );
  expectText(
    assets,
    'This workflow adds no registry, revision database, cache, state store, daemon, autosave service, background process, duplicate workflow, command, automatic Git action, manifest change, or core status/runtime change.',
    'prohibited persistence and workflow capabilities remain closed',
  );
  expectText(
    assets,
    'Do not edit core absent concrete current proof and redefinition.',
    'core changes stop absent concrete proof and redefinition',
  );
  expectText(
    activation,
    'A change to this workflow or other non-rendered workflow prose does not itself activate a preview or design-approval gate.',
    'this workflow-prose feature has no design approval gate',
  );
});

test('design workflow retains ownership, approval, quality, realism, and lane gates', () => {
  // Arrange
  const mutation = sectionBetween(workflow, '## Mutation Preconditions And Ownership', '## Mock Iteration');
  const iteration = sectionBetween(workflow, '## Mock Iteration', '## Functional Realism');
  const realism = sectionBetween(workflow, '## Functional Realism', '## Design-Shaped `spec.md`');
  const approval = sectionBetween(workflow, '## Approval Gate', '## Task Generation');
  const close = sectionBetween(workflow, '## Design Close Protocol', '## Post-Implementation Refinement Loop');
  const refinement = sectionBetween(workflow, '## Post-Implementation Refinement Loop', '## Routing');
  const avoidIndex = workflow.indexOf('## Avoid');
  assert.notEqual(avoidIndex, -1, 'missing Avoid section');
  const avoid = workflow.slice(avoidIndex);

  // Assert
  expectText(
    mutation,
    'Resolve exactly one companion idea from direct flat `.dude/ideas/*.md` ledgers whose `spec_path` exactly equals the current package\'s `.dude/specs/<feature>/spec.md`.',
    'mutations require exactly one exact-path companion idea owner',
  );
  expectText(
    mutation,
    'Only the coordinator appends to `## Coordinator Log` or mutates idea `status`, design `design_status`, task glyphs, or task metadata.',
    'coordinator retains exclusive workflow-state ownership',
  );
  expectText(
    realism,
    'The **capability envelope** is whatever the actual target\'s implementation owner declares, meaning the installed specialist who owns that surface.',
    'the actual target implementation owner declares the capability envelope',
  );
  expectText(
    realism,
    'Validate each actionable element against the declared envelope for this target, never against a fixed assumption.',
    'functional realism uses the actual target owner declared capability envelope',
  );
  expectText(
    iteration,
    'every field shown in the mock must map to a real content or front-matter source, or be dropped.',
    'mock provenance remains required',
  );
  expectText(
    approval,
    'Execution must not touch the live target surface until the proposal is approved.',
    'live-target execution remains blocked until proposal approval',
  );
  expectText(
    approval,
    'If the user asks to implement before approval, stop and ask for approval or revision instead of proceeding.',
    'implementation still requires explicit approval',
  );
  expectText(
    approval,
    'Then allow implementation through the active execution lane (Lightweight Execution from `tasks.md`, or Beads when tracked execution is active) when the user wants implementation.',
    'approved implementation uses the active execution lane',
  );
  expectText(
    close,
    'Confirm accessibility and contrast on the rendered surface itself: interactive elements are reachable and show a visible focus state, and text and essential UI meet WCAG AA contrast.',
    'rendered accessibility and WCAG AA contrast checks remain required',
  );
  expectText(
    close,
    'Only when the result matches the approved spec and works in the real rendered context may the coordinator close the task through the active lane:',
    'task closure remains controlled by the active execution lane',
  );
  expectText(
    refinement,
    'Require explicit re-approval before execution resumes.',
    'post-implementation refinement requires explicit re-approval',
  );
  expectText(
    avoid,
    'Do not mock affordances the target cannot deliver (submit feedback, share or send to an external service, email-this, like / save, login) as if they were real;',
    'prohibited unbuildable affordances remain a closed capability set',
  );
});

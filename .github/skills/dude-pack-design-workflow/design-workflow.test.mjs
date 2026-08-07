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

// @ts-check
/**
 * Feature 062 T005 installed-host acceptance, retaining the 057 T012 proof.
 *
 * This is an explicitly invoked acceptance driver, not a recursively discovered
 * unit test. It installs the current release into owned fixtures, starts the
 * installed Copilot CLI over the documented SDK stdio transport, lets that CLI
 * discover and start the shipped Dude extension, and drives the returned Canvas
 * URL with an owned Edge/CDP process. On Windows the runtime process is the
 * installed launcher itself, so the extension host is its single executable,
 * as in the installed app.
 *
 * The loopback model is deterministic and contains no credentials. It chooses
 * only predeclared tools actually offered by the CLI. The selected Dude session
 * projection delegates staging/revision work to the exact installed Spec Lead;
 * those agents use offered skill/create/view/edit/shell tools, and Dude invokes/acknowledges the
 * shipped handoff. A separate disposable pack fixture drives Settings through
 * owner preview, exact permission, Compose application, pack-result
 * acknowledgment, and the provider's authoritative reread. The model fixture
 * itself performs no post-seed canonical write. The Git blank install is
 * pre-seeded, before its host starts, as a development install with a recorded
 * base release; its unsent first idea waits through one Settings > About visit
 * that the installed extension serves. The pack fixture keeps the builder's
 * release metadata. This proves installed owner execution and waiter
 * correlation, not unscripted model reasoning or desktop-app rendering.
 *
 * A further disposable workspace drives 073 Add/import. The shipped route hands
 * one local skill file and one local directory (an agent with `.support/`
 * companions, and a skill with its companion) to the installed Dude, whose
 * scripted owner loads dude-bundle-import, previews with the unchanged importer,
 * publishes the literal permission, recognizes consent, rechecks the reviewed
 * basis, applies once, verifies, and acknowledges the separate import_result.
 * The browser only requests and consents, and the test writes nothing after
 * seeding. Show in Installed then follows each Applied result without Reload.
 * Phase B's Settings stay in the same journey: Available is unknown until the
 * one explicit Reload, and no catalog is acquired by anything else.
 *
 * A third disposable workspace drives 073 Phase B, a pack source. The browser
 * adds a local folder (library/packs/<name>/pack.md) through Settings > Packs >
 * Sources, shows its packs in Available, selects its source-qualified pack, and
 * requests the install. The scripted installed Dude previews that source,
 * publishes the literal permission naming it first as a third-party source,
 * recognizes consent, rechecks the saved sources, runs Compose with exactly the
 * bound --source, verifies, and acknowledges the pack_result with the exact
 * catalogSource echoed. The test saves, installs, and applies nothing after
 * seeding, and contacts no network source. The recorded source, the installed
 * bytes, the Available rows of both same-named packs, the source facts, and the
 * installed-use removal blocker are then observed where they landed. Every
 * fixture's installed core modules, including the saved-sources parser and the
 * Compose, lint, and upgrade skills, are checked byte for byte against source.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WINDOWS = process.platform === 'win32';

/**
 * Darwin keeps the recorded CLI/runtime/browser defaults. Elsewhere these
 * artifacts must be named; desktop app SDK selection is independent below.
 * @param {string|undefined} configured @param {string} name @param {string} darwinDefault
 */
function installedArtifact(configured, name, darwinDefault) {
  if (configured !== undefined) return configured;
  if (process.platform === 'darwin') return darwinDefault;
  throw new Error(`${name} must name the installed artifact on ${process.platform}; `
    + 'only the macOS app install has recorded defaults.');
}

const CLI = installedArtifact(process.env.DUDE_COPILOT_CLI, 'DUDE_COPILOT_CLI', '/opt/homebrew/bin/copilot');
if (WINDOWS && /\.(?:bat|cmd)$/i.test(CLI)) {
  // Node spawns batch shims only through cmd.exe quoting; the exact launcher needs none.
  throw new Error(`DUDE_COPILOT_CLI must name the copilot.exe launcher on Windows, not ${CLI}`);
}
const CLI_RUNTIME = process.env.DUDE_COPILOT_RUNTIME
  ?? path.join(
    installedArtifact(
      process.env.COPILOT_CLI_RESOLVED_DIST_DIR,
      'DUDE_COPILOT_RUNTIME or COPILOT_CLI_RESOLVED_DIST_DIR',
      path.join(os.homedir(), 'Library/Caches/copilot/pkg/darwin-arm64/1.0.83-5'),
    ),
    'index.js',
  );
/**
 * The installed app runs its CLI launcher as the runtime process, and that CLI
 * starts extensions with its own executable, a single-executable application
 * rather than Node. Windows sessions run the same way. The launcher's own
 * COPILOT_CLI_DIST_DIR selection loads the CLI_RUNTIME package rather than
 * extracting another copy into each isolated profile, so only the host
 * executable differs from a Node-hosted runtime. macOS keeps its recorded
 * Node-hosted runtime; the launcher host is unverified there.
 */
const SESSION_RUNTIME = WINDOWS ? CLI : CLI_RUNTIME;
const CLI_DIST_DIR = path.dirname(CLI_RUNTIME);
const BROWSER = installedArtifact(
  process.env.DUDE_CANVAS_BROWSER,
  'DUDE_CANVAS_BROWSER',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
);
/** Windows PowerShell 5.1 ships with every supported Windows release. */
const WINDOWS_POWERSHELL = WINDOWS
  ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : null;
/**
 * The installed CLI offers its platform shell tool: `bash` on POSIX hosts and
 * `powershell` on Windows. Scripted owner commands use that shell's quoting;
 * PowerShell needs its call operator to run a quoted executable path.
 */
const SHELL_TOOL = WINDOWS ? 'powershell' : 'bash';
const SHELL_INVOKE = WINDOWS ? '& ' : '';
/**
 * The installed Windows CLI `create` tool writes new files with CRLF whatever
 * the requested line endings, and `view` returns those bytes. Scripted owner
 * text uses that platform form, so exact-byte checks compare what it writes.
 * @param {string} text
 */
function ownerText(text) {
  return WINDOWS ? text.replace(/\r?\n/g, '\r\n') : text;
}
// The desktop app SDK supplies the real invocation AbortSignal required by
// dude_needs_you. The adjacent CLI SDK is not an interchangeable fallback.
const APP_SDK = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'),
    'Programs/GitHub Copilot/copilot-sdk')
  : process.platform === 'darwin'
    ? '/Applications/GitHub Copilot.app/Contents/Resources/copilot-sdk'
    : null;
const SDK = process.env.DUDE_COPILOT_SDK ?? APP_SDK;
const RELEASE_DIR = process.env.DUDE_CANVAS_RELEASE_DIR
  ? path.resolve(process.env.DUDE_CANVAS_RELEASE_DIR) : null;
const ARTIFACTS = path.resolve(
  process.env.DUDE_CANVAS_ARTIFACTS_DIR
    ?? path.join(os.tmpdir(), 'dude-canvas-t012-installed-host'),
);
// Recursive mkdir returns the first directory it created (on Windows as a
// \\?\ namespaced path), not ARTIFACTS itself, so only ARTIFACTS is the parent.
fs.mkdirSync(ARTIFACTS, { recursive: true });
// Windows realpath can return a \\?\ path. Use the equivalent file-URL path
// spelling so shipped CLI main-entry guards see the same path as import.meta.
const RUN = fileURLToPath(pathToFileURL(fs.realpathSync(fs.mkdtempSync(path.join(ARTIFACTS, 'installed-host-')))));
const DEADLINE = 30_000;
const MAX_MODEL_BODY = 4 * 1024 * 1024;
const REVIEW_SLUG = 'dude-canvas-workspace-integration';
const REVIEW_ID = '062';
const IDEA_PATH = `.dude/ideas/${REVIEW_ID}-${REVIEW_SLUG}.md`;
const SPEC_PATH = `.dude/specs/${REVIEW_ID}-${REVIEW_SLUG}/spec.md`;
const DESIGN_ROOT = `.dude/specs/${REVIEW_ID}-${REVIEW_SLUG}/design`;
const MOCK_PATH = `${DESIGN_ROOT}/mock.html`;
const CSS_PATH = `${DESIGN_ROOT}/mock.css`;
/**
 * Fixed date written into the synthetic control fixture's log. It is fixture
 * content, not the time any source was read; `seedWorkspaceTaskFixtures`
 * records the actual source acquisition window separately.
 */
const SYNTHETIC_FIXTURE_DATE = '2026-09-28T16:17:39Z';
const WORKSPACE_052 = Object.freeze({
  ideaPath: '.dude/ideas/052-dude-canvas-ui.md',
  specPath: '.dude/specs/052-dude-canvas-ui/spec.md',
  tasksPath: '.dude/specs/052-dude-canvas-ui/tasks.md',
  selectedTaskKey: 'T013@052rel13',
  archivedTaskKey: 'T004@052send4',
});
const WORKSPACE_062 = Object.freeze({
  ideaPath: '.dude/ideas/062-dude-canvas-workspace-integration.md',
  specPath: '.dude/specs/062-dude-canvas-workspace-integration/spec.md',
  tasksPath: '.dude/specs/062-dude-canvas-workspace-integration/tasks.md',
  designPath: '.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html',
  taskKeys: Object.freeze([
    'T001@a062c1d4',
    'T002@b062d2e5',
    'T003@c062e3f6',
    'T004@d062f4a7',
    'T005@e062a5b8',
  ]),
  selectedTaskKey: 'T005@e062a5b8',
});
const TASK_CONTROL = Object.freeze({
  ideaPath: '.dude/ideas/063-installed-task-controls.md',
  specPath: '.dude/specs/063-installed-task-controls/spec.md',
  tasksPath: '.dude/specs/063-installed-task-controls/tasks.md',
  readyTaskKey: 'T001@c012c001',
  waitingTaskKey: 'T002@c012c002',
  blockedTaskKey: 'T003@c012c003',
});
const PACK_NAME = 'installed-roundtrip';
const PACK_MANIFEST_PATH = `library/packs/${PACK_NAME}/pack.md`;
const PACK_SOURCE_PATH =
  `library/packs/${PACK_NAME}/instructions/dude-pack-${PACK_NAME}-owner.instructions.md`;
const PACK_DESTINATION =
  `.github/instructions/dude-pack-${PACK_NAME}-owner.instructions.md`;
const PACK_WORK_IDEA_PATH = '.dude/ideas/002-installed-pack-host.md';
const PACK_WORK_SPEC_PATH = '.dude/specs/002-installed-pack-host/spec.md';
const PACK_WORK_TASK_KEY = 'T001@c012ab01';
const PROFILE_PATH = '.dude/metadata/profile.md';
/** The project's saved pack sources: the one file the Sources route writes. */
const SOURCES_PATH = '.dude/metadata/pack-sources.md';
/** The second pack of the Phase B folder, which the default library does not have. */
const SOURCE_EXTRA_PACK = 'team-extras';
const BASE_RELEASE_PATH = '.dude/metadata/development-base-release.md';
const INSTALLED_SOURCE_REPO = 'https://github.com/E-G-C/dude';
/** @param {string} version @param {string} channel */
const installedAboutRows = (version, channel) => [
  ['Dude version', version],
  ['Author', 'Enrique Gonzalez'],
  ['Repository', 'https://github.com/E-G-C/dude'],
  ['Recorded channel/ref', channel],
];
/**
 * The two installed records About is observed with. The release case is the
 * builder's own release metadata, which carries no base record; the
 * development case is pre-seeded before its host starts, as a confirmed
 * `main` upgrade leaves it.
 */
const RELEASE_ABOUT = Object.freeze({
  label: 'release',
  recorded: { installedRef: 'v0.0.0-t012', sourceRef: 'latest', sourceRepo: INSTALLED_SOURCE_REPO, baseRecord: null },
  baseRelease: null,
  rows: installedAboutRows('Recorded ref (v0.0.0-t012)', 'Stable releases (latest)'),
});
const DEVELOPMENT_ABOUT = Object.freeze({
  label: 'development',
  recorded: {
    installedRef: 'main',
    sourceRef: 'main',
    sourceRepo: INSTALLED_SOURCE_REPO,
    baseRecord: { source_repo: INSTALLED_SOURCE_REPO, base_release: 'v1.3.0' },
  },
  baseRelease: 'v1.3.0',
  rows: installedAboutRows('Development (main), based on v1.3.0', 'Development (main)'),
});
const SOURCE_APP_SHA256 = '465e6a2bcb763621a676aac6be1839e301d2ce2d0fc8d233b1d48e87c342cf7e';
const TASKS_PATH = path.posix.join(path.posix.dirname(SPEC_PATH), 'tasks.md');
const DONE_IDEA_PATH = '.dude/ideas/052-dude-canvas-ui.md';
const DONE_SPEC_PATH = '.dude/specs/052-dude-canvas-ui/spec.md';
const MIXED_IDEA_PATH = '.dude/ideas/061-installed-controlled-tasks.md';
const MIXED_SPEC_PATH = '.dude/specs/061-installed-controlled-tasks/spec.md';
const SOURCE_LEGAL_SHA256 = '3be2d01e3b59529e54cde5f17aee76c168bcde63245c21ec387cf70ba7a6d869';
/**
 * The Review gesture behavior lives in these static modules, not in the bundled
 * frontend, so the frontend hash alone cannot show which engine an installed
 * run used. They are pinned here and re-checked against the bytes the installed
 * Canvas server actually serves.
 */
const SOURCE_REVIEW_MODULES = Object.freeze({
  'ui/review/engine.mjs': 'c2edc7410e59f78b3ce3a6936218e36975aac89eab7705eae2a29858ceaee766',
  'ui/review/geometry.mjs': 'e3e000908c5ee2f033448215eec606cae2931b062d0f3d75d049844c4a8f4def',
  'ui/review/styles.css': '20e3430b0e0111584f2c4d06352f69182cdeb3eff522db1a088d858fc23871af',
});
const APPROVED_HASHES = Object.freeze({
  '.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html':
    'd491b002154088f4cc6cac4773a6745ac2f9a02b5f78b5a593c3c88335169d70',
  [WORKSPACE_062.designPath]:
    '1508fe1efaf6a5228784dee8c140a569927bf27eb1dfc9244679b6ae80ec2962',
  '.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html':
    '6cd15f3e695e9129356f70f6b55e0ad7b7e12023b6a2926da4dec29dced5d5ee',
  '.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.jsx':
    '0299120a73a03663935fc7dbe59dfdf1677df2bfea7d66792cec0060e58043a0',
  '.dude/specs/057-dude-canvas-needs-you/design/assets/workspace-snapshots.js':
    'b426d55f2bafe52ade76dd501a72bec075a19decaa08c3848bb9d91c8c0e48ea',
  '.dude/specs/057-dude-canvas-needs-you/design/assets/overview-snapshots.js':
    '967d5283282424263e3c40d4deb864e699f00aa7bd69b21b5d0d81448def71c2',
  '.dude/specs/057-dude-canvas-needs-you/design/assets/needs-you-workspace.js':
    'c4af6948b7b08c29430eea4e9dac4804e1ece432a467fd330f235084e0829bfd',
  '.dude/specs/057-dude-canvas-needs-you/design/assets/needs-you-workspace.js.LEGAL.txt':
    '38a227b01622013560f87b78b61c5ad917bc0408073e9c39d7443bbf5f76cc16',
});

const { buildRelease, parseManifestDocument } =
  await import(pathToFileURL(path.join(ROOT, 'scripts/build-release.mjs')));
const { parseTasks } = await import(pathToFileURL(path.join(
  ROOT,
  'src/skills/dude-engine/lib/tasks.mjs',
)));
const { parseDevelopmentBaseRelease, renderDevelopmentBaseRelease } = await import(pathToFileURL(path.join(
  ROOT,
  'src/skills/dude-engine/lib/development-base-release.mjs',
)));
let CopilotClient, RuntimeConnection;
const { decodePng } = await import(pathToFileURL(path.join(
  ROOT,
  'src/extensions/dude/lib/review/png.mjs',
)));
const { parseVisibleTasks } = await import(pathToFileURL(path.join(
  ROOT, 'src/skills/dude-engine/lib/tasks.mjs',
)));

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string|Buffer} value */
function revision(value) {
  return `sha256:${sha256(value)}`;
}

/** @param {unknown} error */
function safeError(error) {
  return String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 8_000);
}

/** @param {string} relative */
function sourceBytes(relative) {
  return fs.readFileSync(path.join(ROOT, ...relative.split('/')));
}

/** Streaming SHA-256 of a file, so a large installed executable is never held in memory. @param {string} file */
function hashFile(file) {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (let read = fs.readSync(descriptor, buffer, 0, buffer.length, null); read > 0;
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

/** Every regular file below a root, by relative path with its SHA-256. @param {string} root */
function workspaceFiles(root) {
  /** @type {Record<string,string>} */
  const files = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files[path.relative(root, absolute).split(path.sep).join('/')] = hashFile(absolute);
    }
  };
  visit(root);
  return files;
}

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

const WORKSPACE_SOURCE_PATHS = Object.freeze([
  WORKSPACE_052.ideaPath,
  WORKSPACE_052.specPath,
  WORKSPACE_052.tasksPath,
  WORKSPACE_062.ideaPath,
  WORKSPACE_062.specPath,
  WORKSPACE_062.tasksPath,
  WORKSPACE_062.designPath,
]);

function workspaceSourceHashes() {
  return Object.fromEntries(WORKSPACE_SOURCE_PATHS.map((relative) => [
    relative,
    { bytes: sourceBytes(relative).length, sha256: sha256(sourceBytes(relative)) },
  ]));
}

/**
 * Change only canonical task glyphs in a frozen disposable copy. Parser line
 * offsets identify the exact headers; the board and execution history stay
 * byte-identical and remain non-authoritative input.
 * @param {Buffer} sourceBytesValue
 * @param {string} sourcePath
 */
function plannedTaskSnapshot(sourceBytesValue, sourcePath) {
  const sourceText = sourceBytesValue.toString('utf8');
  const parsed = parseTasks(sourceText, { path: sourcePath });
  assert.equal(parsed.boardIssue, null, `${sourcePath} has a valid generated board`);
  assert.deepEqual(parsed.warnings, [], `${sourcePath} has canonical task syntax`);
  const replacements = parsed.tasks.map((task) => {
    const line = parsed.lineMeta[task.headerLine];
    const text = sourceText.slice(line.startOffset, line.contentEndOffset);
    const token = `[${task.glyph}]`;
    const tokenOffset = text.indexOf(token);
    assert.ok(tokenOffset >= 2, `canonical glyph found for ${task.id}`);
    assert.equal(text.startsWith(`- [${task.glyph}] ${task.id} `), true,
      `canonical header found for ${task.id}`);
    return {
      taskKey: task.id,
      sourceState: task.state,
      offset: line.startOffset + tokenOffset + 1,
    };
  }).sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  const parts = [];
  for (const replacement of replacements) {
    parts.push(sourceText.slice(cursor, replacement.offset), ' ');
    cursor = replacement.offset + 1;
  }
  parts.push(sourceText.slice(cursor));
  const snapshot = Buffer.from(parts.join(''));
  assert.equal(snapshot.length, sourceBytesValue.length,
    'planned-state projection changes one ASCII glyph byte per canonical task');
  const planned = parseTasks(snapshot.toString('utf8'), { path: sourcePath });
  assert.deepEqual(planned.warnings, []);
  assert.deepEqual(planned.tasks.map((task) => task.id), parsed.tasks.map((task) => task.id));
  assert.ok(planned.tasks.every((task) => task.state === 'todo'));
  return {
    snapshot,
    source: parsed,
    planned,
    replacements,
  };
}

/**
 * Return the same full-unit boundary used by the file-backed projection for
 * these canonical fixtures: the task header through the next phase/task or
 * execution history.
 * @param {ReturnType<typeof parseTasks>} parsed
 * @param {string} taskKey
 */
function taskUnit(parsed, taskKey) {
  const task = parsed.byId.get(taskKey);
  assert.ok(task, `fixture contains ${taskKey}`);
  const start = parsed.lineMeta[task.headerLine].startOffset;
  const activeEnd = parsed.history?.startOffset ?? parsed.source.length;
  let end = activeEnd;
  const nextTaskLine = parsed.tasks
    .filter((candidate) => candidate.headerLine > task.headerLine)
    .map((candidate) => candidate.headerLine)
    .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
  for (let line = task.headerLine + 1; line < parsed.lineMeta.length; line += 1) {
    if (line === nextTaskLine || /^#{2,3}\s+/.test(parsed.lines[line])) {
      end = parsed.lineMeta[line].startOffset;
      break;
    }
  }
  return parsed.source.slice(start, end);
}

/**
 * Source-backed snapshots live only in this owned release fixture. 062 keeps
 * its five canonical bodies but projects every canonical glyph to planned;
 * 052 is copied byte-for-byte so its current Done cases and archived exclusion
 * remain real source behavior. The snapshot is read from the current source on
 * every run, so it records when that read started and finished.
 * @param {string} root
 */
function seedWorkspaceTaskFixtures(root) {
  const acquisitionStartedAt = new Date().toISOString();
  const source062Tasks = sourceBytes(WORKSPACE_062.tasksPath);
  const frozen062 = plannedTaskSnapshot(source062Tasks, WORKSPACE_062.tasksPath);
  assert.deepEqual(frozen062.planned.tasks.map((task) => task.id), WORKSPACE_062.taskKeys);
  assert.deepEqual(frozen062.planned.tasks.map((task) => task.state), Array(5).fill('todo'));

  const source052Tasks = sourceBytes(WORKSPACE_052.tasksPath);
  const parsed052 = parseTasks(source052Tasks.toString('utf8'), { path: WORKSPACE_052.tasksPath });
  assert.equal(parsed052.boardIssue, null);
  assert.deepEqual(parsed052.warnings, []);
  assert.equal(parsed052.tasks.length, 13);
  assert.ok(parsed052.tasks.every((task) => task.state === 'done'));
  assert.ok(source052Tasks.includes(Buffer.from(WORKSPACE_052.archivedTaskKey)),
    'the source retains the archived 052 task record');
  assert.equal(parsed052.byId.has(WORKSPACE_052.archivedTaskKey), false,
    'the archived 052 task is not a canonical visible unit');

  for (const relative of [
    WORKSPACE_052.ideaPath,
    WORKSPACE_052.specPath,
    WORKSPACE_052.tasksPath,
    WORKSPACE_062.ideaPath,
    WORKSPACE_062.specPath,
    WORKSPACE_062.designPath,
  ]) {
    // The Review now shares 062's scope. Keep its synthetic spec's exact
    // preview_path binding instead of replacing it with the source preview.
    if (relative !== SPEC_PATH) write(root, relative, sourceBytes(relative));
  }
  write(root, WORKSPACE_062.tasksPath, frozen062.snapshot);

  const controlTasks = [
    '# Tasks',
    '',
    '## Phase 1: Controlled installed distinctions',
    `- [ ] ${TASK_CONTROL.readyTaskKey} Controlled ready task`,
    '',
    'Source-backed control: recorded dependencies are satisfied.',
    '',
    'Acceptance: readiness remains recorded data and grants no execution authority.',
    '',
    `- [ ] ${TASK_CONTROL.waitingTaskKey} Controlled dependency-waiting task`,
    `    deps: ${TASK_CONTROL.readyTaskKey}`,
    '',
    'Source-backed control: this task waits on its recorded dependency.',
    '',
    'Acceptance: dependency waiting stays distinct from an explicit blocker.',
    '',
    `- [!] ${TASK_CONTROL.blockedTaskKey} Controlled explicitly blocked task`,
    `    blocked-by: external-dependency: controlled installed blocker`,
    '',
    'Source-backed control: the explicit blocker is literal fixture data.',
    '',
    'Acceptance: the blocker reason is shown without a live-agent claim.',
    '',
  ].join('\n');
  write(root, TASK_CONTROL.ideaPath, [
    '---',
    'title: Installed task coverage controls',
    'slug: installed-task-controls',
    'status: defined',
    `spec_path: ${TASK_CONTROL.specPath}`,
    '---',
    '',
    '## Idea',
    '',
    'Controlled source-backed distinctions for installed read-only acceptance.',
    '',
    '## Coordinator Log',
    '',
    `- ${SYNTHETIC_FIXTURE_DATE} - Synthetic installed task-coverage fixture created.`,
    '',
  ].join('\n'));
  write(root, TASK_CONTROL.specPath, [
    '---',
    'title: Installed task coverage controls',
    '---',
    '',
    '# Installed Task Coverage Controls',
    '',
    'This frozen fixture is controlled test data, not live project work.',
    '',
  ].join('\n'));
  write(root, TASK_CONTROL.tasksPath, controlTasks);
  const parsedControl = parseTasks(controlTasks, { path: TASK_CONTROL.tasksPath });
  assert.deepEqual(parsedControl.warnings, []);
  const approvedDesignRevision = revision(sourceBytes(WORKSPACE_062.designPath));
  const sourceAcquisition = {
    startedAt: acquisitionStartedAt,
    completedAt: new Date().toISOString(),
  };

  return {
    kind: 'frozen-disposable-source-snapshot',
    sourceAcquisition,
    syntheticFixtureDate: SYNTHETIC_FIXTURE_DATE,
    sourceRoot: ROOT,
    fixtureRoot: root,
    records: {
      '062': {
        ideaPath: WORKSPACE_062.ideaPath,
        specPath: WORKSPACE_062.specPath,
        tasksPath: WORKSPACE_062.tasksPath,
        designPath: WORKSPACE_062.designPath,
        sourceTasksRevision: revision(source062Tasks),
        fixtureTasksRevision: revision(frozen062.snapshot),
        approvedDesignRevision,
        canonicalTaskKeys: frozen062.planned.tasks.map((task) => task.id),
        sourceStates: frozen062.replacements.map(({ taskKey, sourceState }) => ({ taskKey, sourceState })),
        fixtureStates: frozen062.planned.tasks.map((task) => ({ taskKey: task.id, state: task.state })),
        changedOffsets: frozen062.replacements.map(({ taskKey, offset }) => ({ taskKey, offset })),
        selectedTaskInstruction: taskUnit(frozen062.planned, WORKSPACE_062.selectedTaskKey),
      },
      '052': {
        ideaPath: WORKSPACE_052.ideaPath,
        specPath: WORKSPACE_052.specPath,
        tasksPath: WORKSPACE_052.tasksPath,
        sourceTasksRevision: revision(source052Tasks),
        fixtureTasksRevision: revision(source052Tasks),
        canonicalTaskKeys: parsed052.tasks.map((task) => task.id),
        fixtureStates: parsed052.tasks.map((task) => ({ taskKey: task.id, state: task.state })),
        archivedTask: {
          taskKey: WORKSPACE_052.archivedTaskKey,
          retainedInSource: true,
          canonical: false,
        },
        selectedTaskInstruction: taskUnit(parsed052, WORKSPACE_052.selectedTaskKey),
      },
      controlled: {
        ideaPath: TASK_CONTROL.ideaPath,
        specPath: TASK_CONTROL.specPath,
        tasksPath: TASK_CONTROL.tasksPath,
        fixtureTasksRevision: revision(controlTasks),
        canonicalTaskKeys: parsedControl.tasks.map((task) => task.id),
        fixtureStates: parsedControl.tasks.map((task) => ({ taskKey: task.id, state: task.state })),
        instructions: Object.fromEntries(parsedControl.tasks.map((task) => [
          task.id,
          taskUnit(parsedControl, task.id),
        ])),
      },
    },
  };
}

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptionsWithStringEncoding} [options]
 */
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
  return {
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? safeError(result.error) : null,
  };
}

/** @param {string} script @param {NodeJS.ProcessEnv} [env] */
function windowsPowerShell(script, env = process.env) {
  assert.ok(WINDOWS_POWERSHELL, 'Windows PowerShell probes run only on Windows');
  return command(WINDOWS_POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    env,
    windowsHide: true,
  });
}

/** Bounded native queries only; no profile, inherited script, or GUI attachment.
 * @param {string} script
 */
function windowsQuery(script) {
  assert.ok(WINDOWS_POWERSHELL, 'Windows queries run only on Windows');
  return command(WINDOWS_POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; ${script}`], {
    timeout: 10_000,
    windowsHide: true,
  });
}

/** @param {number} pid */
function processRow(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'process evidence requires an exact PID');
  if (WINDOWS) {
    const result = windowsQuery(
      `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; `
      + 'if ($p) { [ordered]@{pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;'
      + "executable=$p.ExecutablePath;started=$p.CreationDate.ToUniversalTime().ToString('o')} "
      + '| ConvertTo-Json -Compress }',
    );
    assert.ok(result.exitCode === 0 && !result.error, `Windows process evidence unavailable: ${result.error ?? result.stderr}`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }
  const result = command('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,comm=']);
  assert.ok(result.exitCode === 0 || result.exitCode === 1,
    `process evidence unavailable: ${result.error ?? result.stderr}`);
  const match = result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  return match ? { pid: Number(match[1]), ppid: Number(match[2]), executable: match[3] } : null;
}

/** @param {string} file */
async function fileIdentity(file) {
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return { path: fs.realpathSync(file), bytes: fs.statSync(file).size, sha256: hash.digest('hex') };
}

/** @template T @param {string} label @param {()=>Promise<T>|T} operation @param {number} [ms] */
async function bounded(label, operation, ms = DEADLINE) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** @template T @param {()=>Promise<T>|T} probe @param {string} label @param {number} [ms] */
async function until(probe, label, ms = DEADLINE) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await delay(50);
  }
  throw new Error(`${label}: timeout after ${ms}ms${last ? ` (${safeError(last)})` : ''}`);
}

/** @param {string} label @param {Record<string,unknown>} details */
function note(label, details = {}) {
  const row = { at: new Date().toISOString(), label, ...details };
  fs.appendFileSync(path.join(RUN, 'events.jsonl'), `${JSON.stringify(row)}\n`);
  process.stdout.write(`${JSON.stringify(row)}\n`);
}

/** @param {unknown} content */
function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    return '';
  }).filter(Boolean).join('\n');
}

/** @param {any} body @param {string} toolCallId */
function toolMessage(body, toolCallId) {
  const message = [...(body.messages ?? [])].reverse().find(
    (entry) => entry?.role === 'tool' && entry.tool_call_id === toolCallId,
  );
  assert.ok(message, `missing tool result for ${toolCallId}`);
  return message;
}

/** @param {any} body @param {string} toolCallId */
function toolMessageText(body, toolCallId) {
  return contentText(toolMessage(body, toolCallId).content);
}

/**
 * Separate a shell tool result's command output from the installed CLI's
 * closing status line, such as `<shellId: 1 completed with exit code 0>`.
 * @param {string} text
 */
function shellToolOutput(text) {
  const status = /\r?\n<[^<>\r\n]* exit code (-?\d+)>\s*$/.exec(text);
  return {
    stdout: status ? text.slice(0, status.index) : text,
    exitCode: status ? Number(status[1]) : null,
  };
}

/** @param {any} body @param {string} toolCallId */
function toolDetails(body, toolCallId) {
  const message = toolMessage(body, toolCallId);
  const candidates = [];
  if (typeof message.content === 'string') candidates.push(message.content);
  else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (typeof part === 'string') candidates.push(part);
      else if (typeof part?.text === 'string') candidates.push(part.text);
      else if (typeof part?.content === 'string') candidates.push(part.content);
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Non-JSON model content is not the typed tool result.
    }
  }
  throw new Error(`tool result ${toolCallId} has no JSON text payload`);
}

/** @param {any} body */
function isSpecLeadTurn(body) {
  return (body.messages ?? []).some((message) => (
    message?.role === 'system' && /You are (?:\*\*)?the Spec Lead\b/i.test(contentText(message.content))
  ));
}

/**
 * @param {any} body
 * @param {string} name
 * @param {string[]} required
 */
function requireToolSchema(body, name, required) {
  const tool = (body.tools ?? []).find((entry) => entry?.function?.name === name);
  assert.ok(tool, `actual CLI tool ${name} is not offered`);
  assert.deepEqual(
    [...(tool.function.parameters?.required ?? [])].sort(),
    [...required].sort(),
    `${name} required argument schema drift`,
  );
  return tool.function.name;
}

/** One literal word in the installed CLI's platform shell. @param {string} value */
function shellArg(value) {
  return WINDOWS
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

/** @param {string[]} words literal or already quoted words, executable first */
function shellCommand(words) {
  return `${SHELL_INVOKE}${words.join(' ')}`;
}

/** @param {ReturnType<typeof captureFixture>} fixture @param {string} root */
function publisherCommand(fixture, root) {
  return shellCommand([
    shellArg(process.execPath), shellArg(fixture.publisher),
    '--root', shellArg(root), '--slug', shellArg(fixture.slug),
    '--stage', shellArg(fixture.stagePath),
  ]);
}

/** @param {unknown} value @param {Set<unknown>} [seen] @returns {Buffer[]} */
function pngsInModelRequest(value, seen = new Set()) {
  if (typeof value === 'string') {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
    return match ? [Buffer.from(match[1].replace(/\s/g, ''), 'base64')] : [];
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const result = [];
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    result.push(...pngsInModelRequest(child, seen));
  }
  return result;
}

/** @param {ReturnType<typeof decodePng>} decoded @param {number} x @param {number} y */
function rgbaAt(decoded, x, y) {
  const px = Math.max(0, Math.min(decoded.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(decoded.height - 1, Math.round(y)));
  return [...decoded.pixels.subarray((py * decoded.width + px) * 4, (py * decoded.width + px) * 4 + 4)];
}

/**
 * @param {ReturnType<typeof decodePng>} decoded
 * @param {number} x
 * @param {number} y
 * @param {number[]} expected
 * @param {number} [radius]
 * @param {number} [tolerance]
 */
function hasColorNear(decoded, x, y, expected, radius = 8, tolerance = 45) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const actual = rgbaAt(decoded, x + dx, y + dy);
      if (actual.slice(0, 3).every(
        (channel, index) => Math.abs(channel - expected[index]) <= tolerance,
      )) return true;
    }
  }
  return false;
}

/** @param {any} body */
function offeredDudeTool(body) {
  const names = (body.tools ?? []).map((entry) => entry?.function?.name).filter(Boolean);
  const name = names.find((entry) => entry === 'dude_needs_you' || entry.endsWith('-dude_needs_you'));
  assert.ok(name, `installed dude_needs_you was not offered (${names.join(', ')})`);
  return { name, offered: names };
}

/** @param {string} label @param {any} body */
function recordToolSchemas(label, body) {
  const target = path.join(RUN, `${label}-tool-schemas.json`);
  if (fs.existsSync(target)) return;
  fs.writeFileSync(target, `${JSON.stringify((body.tools ?? []).map((entry) => ({
    name: entry?.function?.name ?? null,
    description: entry?.function?.description ?? null,
    parameters: entry?.function?.parameters ?? null,
  })), null, 2)}\n`);
}

/** @param {string} id @param {string} name @param {unknown} args */
function toolCall(id, name, args) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    }],
  };
}

/** @param {http.ServerResponse} res @param {any} body @param {any} message @param {string} finishReason */
function answerModel(res, body, message, finishReason) {
  const base = {
    id: `chatcmpl-t012-${randomUUID()}`,
    created: 1788868800,
    model: body.model,
  };
  if (body.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = { ...message };
    if (delta.tool_calls) {
      delta.tool_calls = delta.tool_calls.map((entry, index) => ({ index, ...entry }));
    }
    for (const chunk of [
      {
        ...base,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta, finish_reason: null }],
      },
      {
        ...base,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
      },
    ]) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.end('data: [DONE]\n\n');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ...base,
    object: 'chat.completion',
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
  }));
}

/** @param {'A'|'B'|'C'} version */
function renderMock(version) {
  const label = `Revision ${version} review target.`;
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    `<title>T012 installed revision ${version}</title>`,
    '<link rel="stylesheet" href="mock.css"></head><body>',
    `<header id="sticky">Installed canonical mock ${version}</header>`,
    '<main>',
    `<h1>Successive installed Review revision ${version}</h1>`,
    `<section id="target"><strong>${label}</strong>`,
    '<p>Annotate this exact source through the shipped Canvas.</p></section>',
    '<div class="spacer" aria-hidden="true"></div>',
    '<p id="lower">Scrolled source evidence remains bound to this revision.</p>',
    '</main></body></html>',
  ].join('');
  return Buffer.from(html);
}

/**
 * Fixture setup only. Post-seed owner changes must use offered CLI tools.
 * @param {string} root
 * @param {'A'|'B'|'C'} version
 */
function seedMock(root, version) {
  const bytes = renderMock(version);
  write(root, MOCK_PATH, bytes);
  return bytes;
}

/** @param {string} root */
function preview(root) {
  return {
    artifact: {
      path: MOCK_PATH,
      revision: revision(fs.readFileSync(path.join(root, ...MOCK_PATH.split('/')))),
    },
    assets: [{
      path: CSS_PATH,
      revision: revision(fs.readFileSync(path.join(root, ...CSS_PATH.split('/')))),
    }],
  };
}

/** @param {string} root */
function source(root) {
  return {
    kind: 'file',
    path: SPEC_PATH,
    revision: revision(fs.readFileSync(path.join(root, ...SPEC_PATH.split('/')))),
  };
}

/** @param {string} root */
function createReviewOwner(root) {
  write(root, IDEA_PATH, [
    '---',
    'title: Dude Canvas Workspace Integration (installed fixture)',
    `slug: ${REVIEW_SLUG}`,
    'status: defined',
    `spec_path: ${SPEC_PATH}`,
    '---',
    '',
    '## Idea',
    '',
    'Exercise two installed report/image revision loops and explicit current approval.',
    '',
    '## Coordinator Log',
    '',
    '- 2026-09-08 12:00:00 UTC - Synthetic installed-host fixture owner created.',
    '',
  ].join('\n'));
  write(root, SPEC_PATH, [
    '---',
    'title: T012 installed review fixture',
    `preview_path: ${MOCK_PATH}`,
    '---',
    '',
    '# Installed Review Fixture',
    '',
    'Canonical synthetic target for isolated host acceptance.',
    '',
  ].join('\n'));
  write(root, path.posix.join(path.posix.dirname(SPEC_PATH), 'tasks.md'), [
    `<!-- audit log: ${IDEA_PATH}#coordinator-log -->`,
    '# Tasks',
    '',
    '- [x] T001@t012host Exact fixture is ready for installed Review.',
    '',
  ].join('\n'));
  write(root, CSS_PATH, [
    'html,body{margin:0;background:#f7fbff;color:#102a43;font:16px/1.5 system-ui,sans-serif}',
    'body{min-height:1400px}',
    '#sticky{position:sticky;top:0;z-index:2;padding:18px 28px;background:#163a5f;color:#fff}',
    'main{min-height:100vh;padding:32px;box-sizing:border-box}',
    '#target{width:min(520px,70%);padding:24px;border:3px solid #0f6cbd;border-radius:12px;background:#fff}',
    '.spacer{height:560px}',
    '#lower{padding:18px;background:#d9eaf7}',
    '@media(prefers-color-scheme:dark){html,body{background:#081b2b;color:#f5f9fc}#target{background:#173f5f;border-color:#77b7e5}#lower{background:#102a43}}',
    '',
  ].join('\n'));
  return seedMock(root, 'A');
}

/**
 * Expected raw units use the canonical parser's membership/visibility offsets,
 * never a second task-header parser. This oracle compares actual HTTP and DOM
 * output with the complete fixture bytes, including paragraphs after blanks.
 * @param {Buffer} bytes
 */
function fixtureTaskUnits(bytes) {
  const scan = parseVisibleTasks(bytes, { state: 'installed acceptance fixture' });
  assert.deepEqual(scan.parsed.warnings, []);
  const starts = new Set(scan.parsed.tasks.map((task) => scan.lines[task.headerLine].start));
  const headings = scan.lines.filter((line, index) => (
    /^#{2,3}\s+\S/.test(line.text)
    && !(scan.parsed.board && index >= scan.parsed.board.startLine && index <= scan.parsed.board.endLine)
  ));
  const boundaries = [...starts, ...headings.map((line) => line.start), scan.activeEnd];
  if (scan.parsed.board) boundaries.push(scan.lines[scan.parsed.board.startLine].start);
  boundaries.sort((a, b) => a - b);
  return scan.parsed.tasks.map((task) => {
    const start = scan.lines[task.headerLine].start;
    const end = boundaries.find((offset) => offset > start);
    return {
      taskKey: task.id, state: task.state, deps: task.deps, blockedBy: task.blockedBy,
      phase: headings.filter((line) => line.start < start).at(-1)?.text.replace(/^#{2,3}\s+/, '') ?? null,
      text: bytes.subarray(start, end).toString('utf8'),
    };
  });
}

/** Extend the shared source snapshot before the installed session starts, in RUN.
 * @param {string} root @param {ReturnType<typeof seedWorkspaceTaskFixtures>} workspaceFixture
 */
function seedTaskWalkthrough(root, workspaceFixture) {
  const original = sourceBytes(TASKS_PATH);
  const planned = fs.readFileSync(path.join(root, TASKS_PATH));
  assert.equal(revision(planned), workspaceFixture.records['062'].fixtureTasksRevision);

  const doneTasksPath = path.posix.join(path.posix.dirname(DONE_SPEC_PATH), 'tasks.md');
  const done = fs.readFileSync(path.join(root, doneTasksPath));
  assert.equal(revision(done), workspaceFixture.records['052'].fixtureTasksRevision);
  const doneUnits = fixtureTaskUnits(done);
  assert.equal(doneUnits.length, 13);
  assert.ok(doneUnits.every((task) => task.state === 'done'));
  assert.ok(doneUnits.some((task) => task.taskKey === 'T010@052now10'));
  assert.ok(!doneUnits.some((task) => task.taskKey === 'T004@052send4'), 'archived 052 unit stays excluded');
  const seedOwner = (ideaPath, specPath, title, intent) => {
    const slug = path.posix.basename(ideaPath, '.md').slice(4);
    write(root, ideaPath, [
      '---', `title: ${title}`, `slug: ${slug}`, `status: ${specPath ? 'defined' : 'draft'}`,
      `spec_path: ${specPath ?? ''}`, '---', '', '## Idea', '', intent, '',
    ].join('\n'));
    if (specPath) write(root, specPath, `# ${title}\n\n${intent}\n`);
  };
  const plannedUnits = fixtureTaskUnits(planned);
  assert.equal(plannedUnits.length, 5);
  assert.ok(plannedUnits.every((task) => task.state === 'todo'));
  const inertText = [
    'Installed controlled fixture only; no live agent or real task state is represented.',
    '',
    '<script>globalThis.__t005TaskExecuted = true</script>',
    '',
    '```html',
    '<button onclick="globalThis.__t005TaskExecuted = true">Do not execute this source</button>',
    '- [ ] T999@fenced99 This fenced example is not a task.',
    '```',
    '',
    'Full-unit continuation after blank lines: café — 東京.',
    '',
  ].join('\n');
  const states = ['x', '~', '!', ' ', ' '];
  const mixed = Buffer.from('# Controlled 062-derived task fixture, not live work\n\n'
    + plannedUnits.map((task, index) => {
      let text = task.text.slice(0, 3) + states[index] + task.text.slice(4);
      if (index === 2) text = text.replace('    deps: T002@b062d2e5',
        '    deps: T002@b062d2e5\n    blocked-by: external-dependency: isolated acceptance fixture');
      if (index === 3) text = text.replace('    deps: T003@c062e3f6', '    deps: T001@a062c1d4');
      if (index === 4) text = text.replace('    deps: T004@d062f4a7', '    deps: T003@c062e3f6');
      return `## ${task.phase}\n\n${text}${index === 1 ? inertText : ''}`;
    }).join('\n'));
  seedOwner(MIXED_IDEA_PATH, MIXED_SPEC_PATH, 'Controlled task states (062-derived, not live)',
    'Only this owned fixture has active/blocked examples. The copied 062 planned and 052 Done sources remain distinct.');
  const mixedTasksPath = path.posix.join(path.posix.dirname(MIXED_SPEC_PATH), 'tasks.md');
  write(root, mixedTasksPath, mixed);

  // The separate 063 dependency/blocker control replaces one synthetic
  // supporting package, keeping the same accepted 62-record/50-package scale.
  for (let number = 1; number <= 60; number += 1) {
    if (number === 47 || number === 52) continue;
    const id = String(number).padStart(3, '0');
    const slug = `installed-support-${id}`;
    const ideaPath = `.dude/ideas/${id}-${slug}.md`;
    const specPath = number <= 47 ? `.dude/specs/${id}-${slug}/spec.md` : null;
    seedOwner(ideaPath, specPath, `Supporting fixture ${id}`, 'Synthetic inventory-scale record; not repository work.');
    if (specPath) write(root, path.posix.join(path.posix.dirname(specPath), 'tasks.md'),
      `# Supporting task\n\n- [ ] T001@${id}aaaaa Inspect this explicitly synthetic supporting record.\n`);
  }
  assert.equal(fs.readdirSync(path.join(root, '.dude/ideas')).length, 62);
  assert.equal(fs.readdirSync(path.join(root, '.dude/specs')).length, 50);
  const records = [
    { name: 'planned062', ideaPath: IDEA_PATH, specPath: SPEC_PATH, tasksPath: TASKS_PATH,
      units: plannedUnits, originalSha256: sha256(original), fixtureSha256: sha256(planned),
      adjustment: 'Owned copy only: canonical glyphs reset to todo; generated board and terminal history preserved and non-authoritative.' },
    { name: 'done052', ideaPath: DONE_IDEA_PATH, specPath: DONE_SPEC_PATH, tasksPath: doneTasksPath,
      units: doneUnits, originalSha256: sha256(done), fixtureSha256: sha256(done),
      adjustment: 'None: complete original tasks.md bytes, including ignored derived and archived content.' },
    { name: 'controlled061', ideaPath: MIXED_IDEA_PATH, specPath: MIXED_SPEC_PATH, tasksPath: mixedTasksPath,
      units: fixtureTaskUnits(mixed), originalSha256: sha256(original), fixtureSha256: sha256(mixed),
      adjustment: 'Explicit 062-derived fixture: done/active/blocked/ready/waiting plus inert source examples.' },
  ];
  const preserved = [
    ...records.flatMap((record) => [record.ideaPath, record.specPath, record.tasksPath]),
    TASK_CONTROL.ideaPath, TASK_CONTROL.specPath, TASK_CONTROL.tasksPath,
  ]
    .map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(root, relative))) }));
  const ideaFiles = fs.readdirSync(path.join(root, '.dude/ideas')).sort();
  return { records, preserved, ideaFiles, inventory: { ideas: 62, packages: 50 } };
}

/** @param {'blank-non-git'|'blank-git'} kind */
function blankIntent(kind) {
  return kind === 'blank-git'
    ? '  Installed Git\u00a0idea\n\nPreserve *literal* wording and supplied onboarding facts.  '
    : '  Installed non-Git\u00a0idea\n\nPreserve *literal* wording and supplied onboarding facts.  ';
}

/** @param {'blank-non-git'|'blank-git'} kind */
function blankSlug(kind) {
  return kind === 'blank-git' ? 'installed-git-idea' : 'installed-non-git-idea';
}

/** @param {{root:string,intent:string,slug:string,evidence:string}} options */
function captureFixture(options) {
  const title = options.slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  // ownerText preserves the installed create tool's CRLF bytes; the Canvas
  // receipt still retains the original LF input.
  const bytes = Buffer.from(ownerText([
    '---',
    `title: ${title}`,
    `slug: ${options.slug}`,
    'status: draft',
    'spec_path:',
    '---',
    '',
    '## Idea',
    '',
    options.intent,
    '',
    '## Coordinator Log',
    '',
    '- 2026-09-08 12:00:00 UTC - Captured through the isolated installed Canvas acceptance.',
    '',
  ].join('\n')));
  return {
    slug: options.slug,
    stagePath: path.join(options.evidence, 'spec-lead-staged-idea.md'),
    canonicalPath: path.join(options.root, '.dude/ideas', `001-${options.slug}.md`),
    ideaPath: `.dude/ideas/001-${options.slug}.md`,
    bytes,
    revision: revision(bytes),
    publisher: path.join(
      options.root,
      '.github/skills/dude-feature-definition/publish-first-capture.mjs',
    ),
  };
}

/** @param {string} root */
function packFixture(root) {
  const manifest = Buffer.from([
    '---',
    `name: ${PACK_NAME}`,
    'description: "Deterministic installed-host pack round trip."',
    'use-cases: [testing]',
    'requires:',
    '  tools: [node]',
    '---',
    `# ${PACK_NAME}`,
    '',
  ].join('\n'));
  const instruction = Buffer.from([
    '---',
    'applyTo: "**"',
    'description: "Disposable installed-host pack acceptance artifact."',
    '---',
    '',
    '# Installed host pack acceptance',
    '',
    'This inert fixture proves the actual installed Compose projection.',
    '',
  ].join('\n'));
  const compose = path.join(root, '.github/skills/dude-compose/compose.mjs');
  const lint = path.join(root, '.github/skills/dude-lint/lint.mjs');
  const library = path.join(root, 'library', 'packs');
  const profile = path.join(root, ...PROFILE_PATH.split('/'));
  const destination = path.join(root, ...PACK_DESTINATION.split('/'));
  const source = {
    type: 'local',
    location: path.resolve(library),
  };
  const listCommand = shellCommand([
    shellArg(process.execPath),
    shellArg(compose),
    'list',
    '--root',
    shellArg(root),
    '--library',
    shellArg(library),
    '--no-fetch',
    '--json',
  ]);
  const addCommand = shellCommand([
    shellArg(process.execPath),
    shellArg(compose),
    'add',
    PACK_NAME,
    '--root',
    shellArg(root),
    '--library',
    shellArg(library),
    '--no-fetch',
    '--envelope',
  ]);
  const lintCommand = shellCommand([
    shellArg(process.execPath),
    shellArg(lint),
    shellArg(root),
  ]);
  return {
    root,
    manifest,
    instruction,
    compose,
    lint,
    library,
    profile,
    destination,
    source,
    listCommand,
    addCommand,
    lintCommand,
    files: [PACK_DESTINATION],
    result: {
      ok: true,
      code: 0,
      result: {
        added: PACK_NAME,
        files: [PACK_DESTINATION],
        origin: 'local',
      },
    },
  };
}

/** @param {string} root */
function seedPackFixture(root) {
  const fixture = packFixture(root);
  write(root, PACK_MANIFEST_PATH, fixture.manifest);
  write(root, PACK_SOURCE_PATH, fixture.instruction);
  write(root, PACK_WORK_IDEA_PATH, [
    '---',
    'title: Installed pack host continuity',
    'slug: installed-pack-host',
    'status: defined',
    `spec_path: ${PACK_WORK_SPEC_PATH}`,
    '---',
    '',
    '## Idea',
    '',
    'Keep one selected work record while the installed host visits About.',
    '',
    '## Coordinator Log',
    '',
    '- 2026-09-26T06:44:58Z - Synthetic installed-host current-work fixture created.',
    '',
  ].join('\n'));
  write(root, PACK_WORK_SPEC_PATH, '# Installed Pack Host Continuity\n');
  write(root, path.posix.join(path.posix.dirname(PACK_WORK_SPEC_PATH), 'tasks.md'), [
    `<!-- audit log: ${PACK_WORK_IDEA_PATH}#coordinator-log -->`,
    '# Tasks',
    '',
    `- [~] ${PACK_WORK_TASK_KEY} [P] [Shared] Installed pack host task remains selected through About.`,
    '',
  ].join('\n'));
  assert.equal(fs.realpathSync(fixture.library), fixture.source.location);
  assert.equal(fs.existsSync(fixture.destination), false);
  return {
    ...fixture,
    work: {
      ideaPath: PACK_WORK_IDEA_PATH,
      specPath: PACK_WORK_SPEC_PATH,
      taskKey: PACK_WORK_TASK_KEY,
    },
  };
}

/**
 * The Add/import case: two local sources the installed owner imports, and the
 * bytes the unchanged importer must leave. Sources live outside the workspace,
 * and every expectation is authored here, never read back from the importer.
 * The hand-made fills sort before both imports, so each imported artifact lands
 * on Installed's second 25-row page.
 * @param {string} root
 */
function importFixture(root) {
  const sources = path.join(RUN, 'import-sources');
  const rows = (...lines) => `${lines.join('\n')}\n`;
  const coordinator = '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in '
    + '`tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / '
    + '`spec_path:` frontmatter. Report changes back to `@dude` instead.';
  const skillSource = rows(
    '---', 'name: dude-local-status-review', 'description: "Summarize project status from local notes."',
    'license: MIT', '---', '', '# Status review', '',
    'Read the notes the user names and summarize their status in five lines.',
  );
  const agentSource = rows(
    '---', 'name: "Release Notes"', 'description: "Drafts release notes from a changelog."', '---', '',
    '# Release notes', '', '## Scope', '', 'Draft release notes from the changelog the user names.', '', coordinator,
  );
  const changelog = rows('# Changelog template', '', '- Added', '- Changed', '- Fixed');
  const entry = rows('# Entry example', '', '- Added: one line per change.');
  const triageSource = rows(
    '---', 'name: log-triage', 'description: "Triage a log excerpt the user pastes."', '---', '',
    '# Log triage', '', 'Read the excerpt and group the lines by severity. See references/severity.md.',
  );
  const severity = rows('# Severity', '', 'Error, warning, info.');
  const fileDestination = '.github/skills/dude-local-status-review';
  const agentDestination = '.github/agents/dude-local-release-notes';
  const triageDestination = '.github/skills/dude-local-log-triage';
  // Only the license line and, in the skill the directory renames, the name differ from the sources.
  const file = {
    source: path.join(sources, 'file', 'SKILL.md'),
    bytes: Buffer.from(skillSource),
    files: new Map([['file/SKILL.md', skillSource]]),
    operation: 'import:file',
    // How the owner recognizes the permission reply. Neither word is an import result.
    permissionAck: 'accepted',
    confirmation: 'IMPORT SKILL dude-local-status-review',
    written: [`${fileDestination}/SKILL.md`, `${fileDestination}/LICENSE`],
    expected: new Map([
      [`${fileDestination}/SKILL.md`, Buffer.from(skillSource.replace('license: MIT\n', ''))],
      [`${fileDestination}/LICENSE`, Buffer.from('MIT\n')],
    ]),
    targets: [
      { target: `${fileDestination}/SKILL.md\nAnalyzed state: missing\nDecision: create`, revision: 'missing' },
      {
        target: `${fileDestination}/LICENSE\nAnalyzed state: missing\nDecision: create the reviewed MIT license sibling`,
        revision: 'missing',
      },
    ],
  };
  const directory = {
    source: path.join(sources, 'kit'),
    files: new Map([
      ['kit/release-notes/release-notes.agent.md', agentSource],
      ['kit/release-notes/templates/changelog.md', changelog],
      ['kit/release-notes/examples/entry.md', entry],
      ['kit/log-triage/SKILL.md', triageSource],
      ['kit/log-triage/references/severity.md', severity],
    ]),
    operation: 'import:directory',
    permissionAck: 'applied',
    confirmation: 'IMPORT DIRECTORY 2 ARTIFACTS',
    // Raw destination order, which is also the importer's written_paths order.
    written: [
      `${agentDestination}.agent.md`,
      `${agentDestination}.support/examples/entry.md`,
      `${agentDestination}.support/templates/changelog.md`,
      `${triageDestination}/SKILL.md`,
      `${triageDestination}/references/severity.md`,
    ],
    expected: new Map([
      [`${agentDestination}.agent.md`, Buffer.from(agentSource)],
      [`${agentDestination}.support/examples/entry.md`, Buffer.from(entry)],
      [`${agentDestination}.support/templates/changelog.md`, Buffer.from(changelog)],
      [`${triageDestination}/SKILL.md`, Buffer.from(triageSource.replace('name: log-triage', 'name: dude-local-log-triage'))],
      [`${triageDestination}/references/severity.md`, Buffer.from(severity)],
    ]),
    // Plan order: groups sort by entrypoint, so the skill group precedes the agent group.
    targets: [
      `skill dude-local-log-triage\nDestination: ${triageDestination}/\n2 files: 2 new, 0 replaced`,
      `agent dude-local-release-notes\nDestination: ${agentDestination}.agent.md\n  and ${agentDestination}.support/\n3 files: 3 new, 0 replaced`,
    ],
  };
  return {
    root,
    sources,
    evidence: path.join(RUN, 'import-evidence'),
    fillNames: Array.from({ length: 30 }, (_, index) => `dude-local-fill-${String(index + 1).padStart(2, '0')}`),
    file,
    directory,
  };
}

/**
 * Seed the Add/import workspace, before its host starts. One local catalog
 * record keeps the pack read local, so no remote catalog is contacted and
 * Available has a pack for the shared-exclusion check. The hand-made fills are
 * ordinary project skills. Nothing here writes an import destination.
 * @param {string} root
 */
function seedImportFixture(root) {
  const fixture = importFixture(root);
  const pack = packFixture(root);
  write(root, PACK_MANIFEST_PATH, pack.manifest);
  write(root, PACK_SOURCE_PATH, pack.instruction);
  for (const name of fixture.fillNames) {
    write(root, `.github/skills/${name}/SKILL.md`,
      `---\nname: ${name}\ndescription: "Hand-made ${name}."\n---\n# ${name}\n`);
  }
  for (const imported of [fixture.file, fixture.directory]) {
    for (const [relative, text] of imported.files) write(fixture.sources, relative, text);
  }
  fs.mkdirSync(fixture.evidence, { recursive: true });
  for (const destination of [...fixture.file.written, ...fixture.directory.written]) {
    assert.equal(fs.existsSync(path.join(root, ...destination.split('/'))), false,
      `no import destination exists before the owner acts: ${destination}`);
  }
  return fixture;
}

/**
 * The import skill and its importer exactly as installed: byte-identical to the
 * authored source, so the owner runs the unchanged importer.
 * @param {string} root
 */
function importerParity(root) {
  const pairs = {};
  for (const relative of [
    'SKILL.md', 'import.mjs', 'lib/directory-import.mjs', 'lib/directory-risk.mjs',
    'lib/directory-source.mjs', 'lib/import-frontmatter.mjs',
  ]) {
    const installed = fs.readFileSync(path.join(root, '.github/skills/dude-bundle-import', ...relative.split('/')));
    assert.equal(installed.equals(sourceBytes(`src/skills/dude-bundle-import/${relative}`)), true,
      `installed importer drift: ${relative}`);
    pairs[relative] = sha256(installed);
  }
  return pairs;
}

/**
 * The 073 Phase B case: a folder the project adds as a pack source, outside the workspace. It offers the
 * default library's own pack by name with different bytes, so installing it can only have come from the
 * folder, and one pack only it has, so the name exclusion after an install leaves a real row behind. Every
 * expectation is authored here, never read back from Compose or the provider. The default library is the
 * installed-host pack fixture's.
 * @param {string} root
 */
function sourceFixture(root) {
  const defaults = packFixture(root);
  const team = path.join(RUN, 'team-packs');
  const lines = (...rows) => Buffer.from(`${rows.join('\n')}\n`);
  const manifest = lines(
    '---', `name: ${PACK_NAME}`, 'description: "Added-source variant of the installed-host pack round trip."',
    'use-cases: [testing]', 'requires:', '  tools: [node]', '---', `# ${PACK_NAME}`,
  );
  const instruction = lines(
    '---', 'applyTo: "**"', 'description: "Disposable installed-host added-source pack acceptance artifact."', '---', '',
    '# Installed host added-source pack acceptance', '',
    'This inert fixture proves the pack came from the folder the project added, not from the default library.',
  );
  const extraManifest = lines(
    '---', `name: ${SOURCE_EXTRA_PACK}`, 'description: "A second pack only the added source offers."',
    'use-cases: [testing]', '---', `# ${SOURCE_EXTRA_PACK}`,
  );
  const extraInstruction = lines(
    '---', 'applyTo: "**"', 'description: "Disposable second pack of the added source."', '---', '', '# Second pack',
  );
  const catalog = 'library/packs';
  const files = new Map([
    [`${catalog}/${PACK_NAME}/pack.md`, manifest],
    [`${catalog}/${PACK_NAME}/instructions/dude-pack-${PACK_NAME}-owner.instructions.md`, instruction],
    [`${catalog}/${SOURCE_EXTRA_PACK}/pack.md`, extraManifest],
    [`${catalog}/${SOURCE_EXTRA_PACK}/instructions/dude-pack-${SOURCE_EXTRA_PACK}-notes.instructions.md`, extraInstruction],
  ]);
  assert.equal(instruction.equals(defaults.instruction), false, 'the added source offers different bytes than the default library');
  const compose = path.join(root, '.github/skills/dude-compose/compose.mjs');
  return {
    root,
    team,
    label: 'team-packs',
    files,
    manifest,
    instruction,
    defaults,
    compose,
    destination: path.join(root, ...PACK_DESTINATION.split('/')),
    sourcesFile: path.join(root, ...SOURCES_PATH.split('/')),
    // The pack's own files as one source revision: a local folder has no commit.
    packRevision: revision(Buffer.concat([manifest, instruction])),
    /** Compose in the joined workspace, bound to the folder the request names and to nothing else. @param {string} location */
    listCommand: (location) => shellCommand([
      shellArg(process.execPath), shellArg(compose), 'list', '--root', shellArg(root), '--source', shellArg(location), '--json',
    ]),
    /** @param {string} location */
    addCommand: (location) => shellCommand([
      shellArg(process.execPath), shellArg(compose), 'add', PACK_NAME, '--root', shellArg(root), '--source', shellArg(location), '--envelope',
    ]),
    lintCommand: lintCommand(root),
    /** The raw-bytes SHA-256 of a file, as the platform's own shell reports it. @param {string} file */
    digestCommand: (file) => (WINDOWS
      ? `(Get-FileHash -Algorithm SHA256 -LiteralPath ${shellArg(file)}).Hash.ToLower()`
      : `shasum -a 256 ${shellArg(file)} | cut -d ' ' -f 1`),
    written: [PACK_DESTINATION],
  };
}

/**
 * Seed the Phase B workspace before its host starts: the default library's one pack, and the folder the
 * project will add through Settings. Nothing here saves the source, installs a pack, or writes the sources
 * file; the browser adds the source and the installed owner installs the pack.
 * @param {string} root
 */
function seedSourceFixture(root) {
  const fixture = sourceFixture(root);
  write(root, PACK_MANIFEST_PATH, fixture.defaults.manifest);
  write(root, PACK_SOURCE_PATH, fixture.defaults.instruction);
  for (const [relative, bytes] of fixture.files) write(fixture.team, relative, bytes);
  assert.equal(fs.existsSync(fixture.sourcesFile), false, 'no saved sources before the browser adds one');
  assert.equal(fs.existsSync(fixture.destination), false, 'no pack destination before the owner acts');
  return { ...fixture, realTeam: fs.realpathSync(fixture.team) };
}

/**
 * Pre-seed a disposable release fixture, before its host starts, as the
 * development install a confirmed `main` upgrade leaves: the manifest's fenced
 * refs become `main` with its prose and source unchanged, and the base record
 * is the producers' own rendering for that exact source. One local catalog
 * record keeps the Settings entry read local, so opening About contacts no
 * remote catalog. Nothing writes these files after the host starts.
 * @param {string} root
 */
function seedDevelopmentInstall(root) {
  const manifestPath = path.join(root, '.dude', 'metadata', 'bundle-manifest.md');
  const release = fs.readFileSync(manifestPath, 'utf8');
  assert.deepEqual(parseManifestDocument(Buffer.from(release), 'release fixture bundle manifest').data, {
    source_repo: INSTALLED_SOURCE_REPO, source_ref: 'latest', installed_ref: 'v0.0.0-t012',
  });
  assert.equal(fs.existsSync(path.join(root, ...BASE_RELEASE_PATH.split('/'))), false,
    'release metadata carries no development base record');
  const development = release.replace(/```json\r?\n[\s\S]*?\r?\n```/, `\`\`\`json\n${JSON.stringify({
    source_repo: INSTALLED_SOURCE_REPO, source_ref: 'main', installed_ref: 'main',
  }, null, 2)}\n\`\`\``);
  assert.notEqual(development, release);
  write(root, '.dude/metadata/bundle-manifest.md', development);
  const record = renderDevelopmentBaseRelease(DEVELOPMENT_ABOUT.recorded.baseRecord);
  write(root, BASE_RELEASE_PATH, record);
  write(root, PACK_MANIFEST_PATH, packFixture(root).manifest);
  return {
    manifest: parseManifestDocument(fs.readFileSync(manifestPath), 'development fixture bundle manifest').data,
    baseRecord: { path: BASE_RELEASE_PATH, sha256: sha256(record) },
    catalog: PACK_MANIFEST_PATH,
    seededBeforeHost: true,
  };
}

/** @param {string} root */
function installedProfile(root) {
  const bytes = fs.readFileSync(path.join(root, ...PROFILE_PATH.split('/')));
  const match = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(bytes.toString('utf8'));
  assert.ok(match, 'installed profile has one fenced JSON object');
  const value = JSON.parse(match[1]);
  assert.ok(value && typeof value === 'object' && value.installed
    && typeof value.installed === 'object' && !Array.isArray(value.installed));
  return { bytes, value };
}

/**
 * A gate holds the scripted owner's next model response until the browser has
 * observed the state that exists between two owner steps. A gate nobody
 * releases opens after a minute, so a failed run cannot hang the host.
 */
function createGate() {
  /** @type {()=>void} */
  let release = () => {};
  const open = new Promise((resolve) => { release = resolve; });
  return { reached: false, open, release: () => release(), wait: () => Promise.race([open, delay(60_000)]) };
}

/**
 * @param {{
 *   root:string,
 *   kind:'blank-non-git'|'blank-git',
 *   intent:string,
 *   slug:string,
 *   evidence:string,
 * }} options
 */
function createBlankModel(options) {
  const ownerFixture = captureFixture(options);
  assert.equal(fs.existsSync(ownerFixture.stagePath), false);
  assert.equal(fs.existsSync(ownerFixture.canonicalPath), false);
  const state = {
    kind: options.kind,
    phase: 'bootstrap',
    requests: 0,
    toolName: null,
    offeredTools: [],
    capture: null,
    ownerExecution: {
      selectedProfile: 'Dude',
      delegatedProfile: 'Spec Lead',
      delegationCallId: `call_${options.kind}_delegate_capture`,
      specLeadToolCalls: [],
      publisherCallId: `call_${options.kind}_publish_capture`,
      canonicalReadCallId: `call_${options.kind}_read_canonical`,
    },
    modelError: null,
  };
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      assert.ok(req.headers.authorization === undefined || req.headers.authorization === 'Bearer');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 16, 'blank model request bound exceeded');
      const specLead = isSpecLeadTurn(body);
      recordToolSchemas(`${specLead ? 'spec-lead' : 'selected-dude'}-${options.kind}`, body);
      const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
      const prompt = contentText(lastUser?.content);
      const lastTool = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'tool');

      if (specLead) {
        if (state.phase === 'capture-delegating') {
          const view = requireToolSchema(body, 'view', ['path']);
          const callId = `call_${options.kind}_spec_read_definition_skill`;
          state.ownerExecution.specLeadToolCalls.push({
            callId,
            tool: view,
            path: path.join(
              options.root,
              '.github/skills/dude-feature-definition/SKILL.md',
            ),
          });
          state.phase = 'capture-spec-skill';
          answerModel(res, body, toolCall(callId, view, {
            path: path.join(
              options.root,
              '.github/skills/dude-feature-definition/SKILL.md',
            ),
          }), 'tool_calls');
          return;
        }
        if (state.phase === 'capture-spec-skill') {
          assert.equal(lastTool?.tool_call_id, `call_${options.kind}_spec_read_definition_skill`);
          assert.ok(toolMessageText(body, lastTool.tool_call_id).includes('## Brainstorm'));
          const create = requireToolSchema(body, 'create', ['path', 'file_text']);
          const callId = `call_${options.kind}_spec_create_stage`;
          state.ownerExecution.specLeadToolCalls.push({
            callId,
            tool: create,
            path: ownerFixture.stagePath,
          });
          state.phase = 'capture-spec-create';
          answerModel(res, body, toolCall(callId, create, {
            path: ownerFixture.stagePath,
            file_text: ownerFixture.bytes.toString('utf8'),
          }), 'tool_calls');
          return;
        }
        if (state.phase === 'capture-spec-create') {
          assert.equal(lastTool?.tool_call_id, `call_${options.kind}_spec_create_stage`);
          const createResult = toolMessageText(body, lastTool.tool_call_id);
          assert.doesNotMatch(createResult, /\b(?:error|denied|failed)\b/i);
          const view = requireToolSchema(body, 'view', ['path']);
          const callId = `call_${options.kind}_spec_read_stage`;
          state.ownerExecution.specLeadToolCalls.push({
            callId,
            tool: view,
            path: ownerFixture.stagePath,
          });
          state.phase = 'capture-spec-read';
          answerModel(res, body, toolCall(callId, view, {
            path: ownerFixture.stagePath,
          }), 'tool_calls');
          return;
        }
        assert.equal(state.phase, 'capture-spec-read');
        assert.equal(lastTool?.tool_call_id, `call_${options.kind}_spec_read_stage`);
        const stagedRead = toolMessageText(body, lastTool.tool_call_id);
        assert.ok(stagedRead.includes(ownerText(options.intent)));
        assert.ok(stagedRead.includes(`slug: ${options.slug}`));
        assert.equal(stagedRead, ownerFixture.bytes.toString('utf8'));
        state.phase = 'capture-await-parent-task';
        answerModel(res, body, {
          role: 'assistant',
          content: JSON.stringify({
            status: 'staged',
            path: ownerFixture.stagePath,
            revision: ownerFixture.revision,
            writer: 'Spec Lead',
          }),
        }, 'stop');
        return;
      }

      const offered = offeredDudeTool(body);
      state.toolName = offered.name;
      state.offeredTools = offered.offered;
      if (lastTool?.tool_call_id === `call_${options.kind}_capture_ack`) {
        const details = toolDetails(body, lastTool.tool_call_id);
        assert.equal(details.status, 'applied');
        assert.equal(details.saved, true);
        state.phase = 'complete';
        answerModel(res, body, {
          role: 'assistant',
          content: 'T012_CAPTURE_OWNER_CONFIRMED',
        }, 'stop');
        return;
      }
      if (state.phase === 'idle'
        && prompt.includes('Dude Canvas explicit idea intake in this joined workspace/session.')) {
        const jsonLine = prompt.split(/\r?\n/).reverse().find((line) => line.trim().startsWith('{'));
        assert.ok(jsonLine, 'capture prompt omitted its typed receipt');
        const capture = JSON.parse(jsonLine);
        assert.equal(capture.intent, options.intent);
        assert.equal(capture.continuation, 'capture_only');
        assert.equal(capture.scope.kind, 'session');
        state.capture = {
          receiptId: capture.receiptId,
          requestRef: capture.requestRef,
          previousRevision: capture.previousRevision,
          ideaPath: ownerFixture.ideaPath,
          revision: ownerFixture.revision,
          bytes: ownerFixture.bytes.length,
          publisherExitCode: null,
        };
        const skill = requireToolSchema(body, 'skill', ['skill']);
        state.ownerExecution.parentSkillCallId = `call_${options.kind}_dude_definition_skill`;
        state.phase = 'capture-parent-skill';
        answerModel(res, body, toolCall(
          state.ownerExecution.parentSkillCallId,
          skill,
          { skill: 'dude-feature-definition' },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'capture-parent-skill') {
        assert.equal(lastTool?.tool_call_id, state.ownerExecution.parentSkillCallId);
        const task = requireToolSchema(
          body,
          'task',
          ['name', 'prompt', 'agent_type', 'description'],
        );
        state.phase = 'capture-delegating';
        answerModel(res, body, toolCall(
          state.ownerExecution.delegationCallId,
          task,
          {
            name: `${options.kind}-capture-owner`,
            description: 'Stage exact idea capture',
            agent_type: 'Spec Lead',
            mode: 'sync',
            model: 'gpt-4.1',
            prompt: [
              'Read the installed dude-feature-definition SKILL.md, then use your actual create/view tools.',
              `Create exactly this missing staged ledger outside the workspace: ${ownerFixture.stagePath}`,
              'Do not write any workspace file, package, task, or metadata directly.',
              'The coordinator will invoke the shipped publisher after your staged-file reread.',
              'Exact staged bytes follow:',
              ownerFixture.bytes.toString('utf8'),
            ].join('\n'),
          },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'capture-await-parent-task') {
        assert.equal(lastTool?.tool_call_id, state.ownerExecution.delegationCallId);
        // Parsing the JSON result preserves Windows backslashes and checks
        // the complete staged-file binding, not only a substring.
        const taskResult = toolDetails(body, lastTool.tool_call_id);
        assert.deepEqual(taskResult, {
          status: 'staged',
          path: ownerFixture.stagePath,
          revision: ownerFixture.revision,
          writer: 'Spec Lead',
        });
        const shell = requireToolSchema(body, SHELL_TOOL, ['command', 'description']);
        const exactCommand = publisherCommand(ownerFixture, options.root);
        state.ownerExecution.publisherTool = shell;
        state.ownerExecution.publisherCommand = exactCommand;
        state.phase = 'capture-publish';
        answerModel(res, body, toolCall(
          state.ownerExecution.publisherCallId,
          shell,
          {
            command: exactCommand,
            description: 'Publish staged idea with shipped helper',
            mode: 'sync',
            initial_wait: 30,
          },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'capture-publish') {
        assert.equal(lastTool?.tool_call_id, state.ownerExecution.publisherCallId);
        const publisherResult = toolMessageText(body, lastTool.tool_call_id);
        assert.ok(publisherResult.includes(ownerFixture.ideaPath));
        assert.doesNotMatch(publisherResult, /\b(?:error|denied|failed)\b/i);
        state.capture.publisherExitCode = 0;
        state.ownerExecution.publisherResult = publisherResult;
        const view = requireToolSchema(body, 'view', ['path']);
        state.phase = 'capture-canonical-read';
        answerModel(res, body, toolCall(
          state.ownerExecution.canonicalReadCallId,
          view,
          { path: ownerFixture.canonicalPath },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'capture-canonical-read') {
        assert.equal(lastTool?.tool_call_id, state.ownerExecution.canonicalReadCallId);
        const canonicalRead = toolMessageText(body, lastTool.tool_call_id);
        assert.ok(canonicalRead.includes(ownerText(options.intent)));
        assert.ok(canonicalRead.includes(`slug: ${options.slug}`));
        assert.equal(canonicalRead, ownerFixture.bytes.toString('utf8'));
        requireToolSchema(body, offered.name, ['op']);
        state.ownerExecution.canonicalReadRevision = ownerFixture.revision;
        state.phase = 'acknowledging';
        answerModel(res, body, toolCall(
          `call_${options.kind}_capture_ack`,
          offered.name,
          {
            op: 'acknowledge',
            acknowledgment: {
              receiptId: state.capture.receiptId,
              owner: 'dude',
              requestRef: state.capture.requestRef,
              scope: { kind: 'session' },
              previousRevision: state.capture.previousRevision,
              recognizes: 'capture',
              outcome: 'applied',
              note: 'Installed Dude delegated staging, ran the shipped publisher, and reread the exact draft.',
              source: {
                kind: 'file',
                path: ownerFixture.ideaPath,
                revision: ownerFixture.revision,
              },
            },
          },
        ), 'tool_calls');
        return;
      }
      assert.equal(state.phase, 'bootstrap');
      state.phase = 'idle';
      answerModel(res, body, {
        role: 'assistant',
        content: 'T012_BLANK_HOST_IDLE',
      }, 'stop');
    } catch (error) {
      state.modelError ??= safeError(error);
      note('blank-model-refusal', { kind: options.kind, error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 blank fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state };
}

/**
 * Deterministic selected-Dude model for one installed Settings install.
 * Every read and mutation is made through an actually offered owner tool.
 * @param {string} root
 */
function createPackModel(root) {
  const fixture = packFixture(root);
  const beforeProfile = installedProfile(root);
  assert.equal(Object.hasOwn(beforeProfile.value.installed, PACK_NAME), false);
  assert.equal(fs.existsSync(fixture.destination), false);
  const state = {
    phase: 'bootstrap',
    requests: 0,
    packPromptRequests: 0,
    toolName: null,
    offeredTools: [],
    binding: null,
    preview: null,
    permission: null,
    permissionAcknowledgment: null,
    compose: null,
    verification: null,
    result: null,
    ownerToolCalls: [],
    beforeProfileRevision: revision(beforeProfile.bytes),
    modelError: null,
  };
  const call = {
    skill: 'call_t012_pack_skill',
    list: 'call_t012_pack_list',
    manifest: 'call_t012_pack_manifest',
    source: 'call_t012_pack_source',
    permission: 'call_t012_pack_permission',
    permissionAck: 'call_t012_pack_permission_ack',
    add: 'call_t012_pack_add',
    lint: 'call_t012_pack_lint',
    profile: 'call_t012_pack_profile',
    result: 'call_t012_pack_result',
  };
  const recordCall = (callId, tool, details = {}) => {
    state.ownerToolCalls.push({ callId, tool, ...details });
  };
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 32, 'installed pack model request bound exceeded');
      assert.equal(isSpecLeadTurn(body), false, 'the selected Dude owns the pack workflow');
      recordToolSchemas('selected-dude-pack', body);
      const offered = offeredDudeTool(body);
      state.toolName = offered.name;
      state.offeredTools = offered.offered;
      const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
      const prompt = contentText(lastUser?.content);
      const lastTool = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'tool');
      const lastId = lastTool?.tool_call_id ?? null;

      if (state.phase === 'bootstrap') {
        state.phase = 'idle';
        answerModel(res, body, {
          role: 'assistant',
          content: 'T012_PACK_HOST_IDLE',
        }, 'stop');
        return;
      }
      if (state.phase === 'idle') {
        assert.ok(prompt.includes('Dude Canvas explicit pack request in this joined workspace/session.'));
        const jsonLine = prompt.split(/\r?\n/).reverse().find((line) => line.trim().startsWith('{'));
        assert.ok(jsonLine, 'pack request omitted its exact receipt binding');
        const binding = JSON.parse(jsonLine);
        assert.equal(binding.owner, 'dude');
        assert.equal(binding.operation, 'install');
        assert.equal(binding.name, PACK_NAME);
        // The default catalog's handoff is the contract from before sources existed: no bound-source line, and a
        // binding of exactly seven keys with no catalogSource.
        assert.deepEqual(Object.keys(binding),
          ['receiptId', 'owner', 'operation', 'name', 'workspaceId', 'sessionId', 'providerGeneration']);
        assert.equal(prompt.split(/\r?\n/).some((line) => /catalogSource|bound to one source/.test(line)), false,
          'a default-catalog handoff mentions no bound source');
        state.packPromptRequests += 1;
        assert.equal(state.packPromptRequests, 1, 'the installed request is sent exactly once');
        state.binding = binding;
        const skill = requireToolSchema(body, 'skill', ['skill']);
        recordCall(call.skill, skill, { skill: 'dude-compose' });
        state.phase = 'pack-skill';
        answerModel(res, body, toolCall(call.skill, skill, {
          skill: 'dude-compose',
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-skill') {
        assert.equal(lastId, call.skill);
        const shell = requireToolSchema(body, SHELL_TOOL, ['command', 'description']);
        recordCall(call.list, shell, { command: fixture.listCommand, mutation: false });
        state.phase = 'pack-list';
        answerModel(res, body, toolCall(call.list, shell, {
          command: fixture.listCommand,
          description: 'Read installed pack eligibility from Compose',
          mode: 'sync',
          initial_wait: 30,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-list') {
        assert.equal(lastId, call.list);
        const listing = toolMessageText(body, lastId);
        assert.ok(listing.includes(PACK_NAME), 'Compose list omitted the fixture pack');
        assert.match(listing, /"installed"\s*:\s*false/,
          'Compose list did not establish uninstalled eligibility');
        assert.equal(fs.existsSync(fixture.destination), false,
          'read-only eligibility performed no projected write');
        assert.deepEqual(installedProfile(root).value, beforeProfile.value,
          'read-only eligibility performed no profile write');
        const view = requireToolSchema(body, 'view', ['path']);
        const target = path.join(root, ...PACK_MANIFEST_PATH.split('/'));
        recordCall(call.manifest, view, { path: target, mutation: false });
        state.phase = 'pack-manifest';
        answerModel(res, body, toolCall(call.manifest, view, { path: target }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-manifest') {
        assert.equal(lastId, call.manifest);
        const manifest = toolMessageText(body, lastId);
        assert.ok(manifest.includes(`name: ${PACK_NAME}`));
        assert.ok(manifest.includes('tools: [node]'));
        const view = requireToolSchema(body, 'view', ['path']);
        const target = path.join(root, ...PACK_SOURCE_PATH.split('/'));
        recordCall(call.source, view, { path: target, mutation: false });
        state.phase = 'pack-source';
        answerModel(res, body, toolCall(call.source, view, { path: target }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-source') {
        assert.equal(lastId, call.source);
        const source = toolMessageText(body, lastId);
        assert.ok(source.includes('actual installed Compose projection'));
        assert.equal(fs.existsSync(fixture.destination), false,
          'owner preview performed no projected write');
        assert.deepEqual(installedProfile(root).value, beforeProfile.value,
          'owner preview performed no profile write');
        state.preview = {
          operation: 'install',
          name: PACK_NAME,
          source: fixture.source,
          files: fixture.files,
          tools: [{ name: 'node', available: true, version: process.version }],
          profileRevision: revision(beforeProfile.bytes),
          sourceRevision: revision(Buffer.concat([fixture.manifest, fixture.instruction])),
          targetRevision: 'absent',
        };
        requireToolSchema(body, offered.name, ['op']);
        const request = {
          owner: 'dude',
          requestRef: `pack:${state.binding.receiptId}`,
          scope: { kind: 'session' },
          source: { kind: 'session', revision: state.binding.providerGeneration },
          revision: `t012-pack-permission-${sha256(JSON.stringify(state.preview)).slice(0, 16)}`,
          class: 'permission',
          prompt: `Install ${PACK_NAME} from the reviewed local source into this disposable workspace.`,
          whyHuman: 'The actual Compose projection writes the named installed pack artifact and profile membership.',
          unblocks: 'The owner can recheck the reviewed basis, apply Compose once, and report the correlated result.',
          blocking: true,
          fields: {
            operation: 'pack:install',
            targets: [
              { target: PROFILE_PATH, revision: state.preview.profileRevision },
              { target: `pack:${PACK_NAME} source`, revision: state.preview.sourceRevision },
              { target: PACK_DESTINATION, revision: state.preview.targetRevision },
            ],
            consequences: `Install ${PACK_DESTINATION} from ${fixture.source.location}. Required tool: node (${process.version}); no prerequisite is installed.`,
            eligibility: 'Compose reported the exact pack available and not installed; the owner will recheck profile, source, and destination before applying.',
            confirmation: `INSTALL PACK ${PACK_NAME}`,
          },
        };
        state.permissionRequest = request;
        recordCall(call.permission, offered.name, {
          op: 'request',
          requestRef: request.requestRef,
          operation: request.fields.operation,
        });
        state.phase = 'permission-waiting';
        answerModel(res, body, toolCall(call.permission, offered.name, {
          op: 'request',
          request,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'permission-waiting') {
        assert.equal(lastId, call.permission);
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'awaiting_acknowledgment');
        assert.equal(details.acceptedAnswer, false);
        assert.equal(details.response.class, 'permission');
        assert.equal(details.response.action, 'consent');
        assert.equal(details.response.operation, 'pack:install');
        assert.equal(details.response.confirmation, `INSTALL PACK ${PACK_NAME}`);
        assert.deepEqual(details.response.targets, state.permissionRequest.fields.targets);
        assert.equal(fs.existsSync(fixture.destination), false,
          'accepted permission still performs no frontend or provider write');
        assert.deepEqual(installedProfile(root).value, beforeProfile.value,
          'accepted permission alone performs no profile write');
        state.permission = details;
        requireToolSchema(body, offered.name, ['op']);
        const receipt = details.receipt;
        const acknowledgment = {
          receiptId: receipt.receiptId,
          owner: receipt.owner,
          requestRef: receipt.requestRef,
          scope: receipt.scope,
          previousRevision: receipt.previousRevision,
          recognizes: receipt.recognizes,
          outcome: 'accepted',
          note: 'The owner recognized the exact installed-host pack permission response.',
          source: receipt.source,
        };
        recordCall(call.permissionAck, offered.name, {
          op: 'acknowledge',
          recognizes: acknowledgment.recognizes,
        });
        state.phase = 'permission-ack';
        answerModel(res, body, toolCall(call.permissionAck, offered.name, {
          op: 'acknowledge',
          acknowledgment,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'permission-ack') {
        assert.equal(lastId, call.permissionAck);
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'accepted');
        state.permissionAcknowledgment = details;
        assert.equal(fs.existsSync(fixture.destination), false,
          'owner recognition alone performs no Compose write');
        const shell = requireToolSchema(body, SHELL_TOOL, ['command', 'description']);
        recordCall(call.add, shell, { command: fixture.addCommand, mutation: true });
        state.phase = 'pack-add';
        answerModel(res, body, toolCall(call.add, shell, {
          command: fixture.addCommand,
          description: 'Apply exact consented pack with Compose',
          mode: 'sync',
          initial_wait: 30,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-add') {
        assert.equal(lastId, call.add);
        const composeText = toolMessageText(body, lastId);
        assert.ok(composeText.includes(PACK_NAME), 'Compose add result omitted the exact pack');
        assert.ok(composeText.includes(PACK_DESTINATION),
          'Compose add result omitted the actual projected artifact');
        assert.equal(fs.readFileSync(fixture.destination).equals(fixture.instruction), true,
          'Compose did not project the exact reviewed source bytes');
        const profile = installedProfile(root);
        assert.deepEqual(profile.value.installed[PACK_NAME], {
          files: fixture.files,
          source: fixture.source,
        });
        // The owner forwards what this tool call actually printed, never a
        // predetermined result. The fixture value is only the expected oracle.
        const observed = shellToolOutput(composeText);
        assert.ok(observed.exitCode === null || observed.exitCode === 0,
          `Compose add exited with ${observed.exitCode}`);
        const envelope = JSON.parse(observed.stdout);
        assert.deepEqual(envelope, fixture.result,
          'Compose add --envelope printed the exact engine result envelope');
        state.compose = {
          command: fixture.addCommand,
          toolResult: composeText,
          stdout: observed.stdout,
          exitCode: observed.exitCode,
          result: envelope,
          destinationRevision: revision(fs.readFileSync(fixture.destination)),
        };
        const shell = requireToolSchema(body, SHELL_TOOL, ['command', 'description']);
        recordCall(call.lint, shell, { command: fixture.lintCommand, mutation: false });
        state.phase = 'pack-lint';
        answerModel(res, body, toolCall(call.lint, shell, {
          command: fixture.lintCommand,
          description: 'Verify installed pack projection with shipped lint',
          mode: 'sync',
          initial_wait: 30,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-lint') {
        assert.equal(lastId, call.lint);
        const lintText = toolMessageText(body, lastId);
        assert.match(lintText, /0 failure\(s\)/,
          'post-Compose installed verification did not report zero failures');
        state.verification = {
          command: fixture.lintCommand,
          toolResult: lintText,
        };
        const view = requireToolSchema(body, 'view', ['path']);
        recordCall(call.profile, view, { path: fixture.profile, mutation: false });
        state.phase = 'pack-profile';
        answerModel(res, body, toolCall(call.profile, view, {
          path: fixture.profile,
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'pack-profile') {
        assert.equal(lastId, call.profile);
        const profileText = toolMessageText(body, lastId);
        assert.ok(profileText.includes(PACK_NAME));
        assert.ok(profileText.includes(PACK_DESTINATION));
        const profile = installedProfile(root);
        assert.deepEqual(profile.value.installed[PACK_NAME], {
          files: fixture.files,
          source: fixture.source,
        });
        requireToolSchema(body, offered.name, ['op']);
        const acknowledgment = {
          recognizes: 'pack_result',
          ...state.binding,
          outcome: 'applied',
          mutation: 'applied',
          result: state.compose.result,
          profileRevision: revision(profile.bytes),
          source: fixture.source,
          note: 'Installed Dude applied Compose once, verified zero lint failures, reread the profile, and reported the exact local source and file.',
        };
        recordCall(call.result, offered.name, {
          op: 'acknowledge',
          recognizes: acknowledgment.recognizes,
          operation: acknowledgment.operation,
          name: acknowledgment.name,
        });
        state.phase = 'pack-result';
        answerModel(res, body, toolCall(call.result, offered.name, {
          op: 'acknowledge',
          acknowledgment,
        }), 'tool_calls');
        return;
      }
      assert.equal(state.phase, 'pack-result');
      assert.equal(lastId, call.result);
      const details = toolDetails(body, lastId);
      assert.equal(details.phase, 'applied');
      assert.equal(details.applied, true);
      assert.equal(details.receipt.freshness, 'current');
      assert.deepEqual(details.receipt.reread.entry, {
        files: fixture.files,
        source: fixture.source,
      });
      assert.equal(details.receipt.reread.profileRevision,
        revision(installedProfile(root).bytes));
      assert.deepEqual(details.receipt.acknowledgment.result, JSON.parse(state.compose.stdout),
        'the provider accepted the observed Compose stdout as the pack result');
      state.result = details;
      state.phase = 'complete';
      answerModel(res, body, {
        role: 'assistant',
        content: 'T012_INSTALLED_PACK_COMPLETE',
      }, 'stop');
    } catch (error) {
      state.modelError = safeError(error);
      note('pack-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 pack fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state, fixture };
}

/**
 * An importer command, run from the joined workspace root as its procedure
 * requires: the directory commands read the workspace from the working directory.
 * @param {string} root
 * @param {string[]} args literal or already quoted words after the script
 */
function importerCommand(root, args) {
  const importer = path.join(root, '.github/skills/dude-bundle-import/import.mjs');
  const run = shellCommand([shellArg(process.execPath), shellArg(importer), ...args]);
  return WINDOWS ? `Set-Location -LiteralPath ${shellArg(root)}; ${run}` : `cd ${shellArg(root)} && ${run}`;
}

/** The shipped lint over the whole workspace. @param {string} root */
function lintCommand(root) {
  return shellCommand([
    shellArg(process.execPath),
    shellArg(path.join(root, '.github/skills/dude-lint/lint.mjs')),
    shellArg(root),
  ]);
}

/**
 * One line per path: a regular file, and no link. The provider repeats this
 * check once, when it records the result.
 * @param {string} root
 * @param {string[]} paths
 */
function regularFilesCommand(root, paths) {
  return WINDOWS
    ? `Set-Location -LiteralPath ${shellArg(root)}; foreach ($p in @(${paths.map(shellArg).join(', ')})) { `
      + "$i = Get-Item -LiteralPath $p -Force; '{0} file={1} link={2}' -f $p, (-not $i.PSIsContainer), [bool]$i.LinkType }"
    : `cd ${shellArg(root)} && for p in ${paths.map(shellArg).join(' ')}; do `
      + 'if [ -f "$p" ] && [ ! -L "$p" ]; then echo "$p file=True link=False"; else echo "$p file=False link=True"; fi; done';
}

/**
 * The permission targets Dude derives from a reviewed directory plan: one for
 * each group, in plan order, each naming its artifact, destination, and counts.
 * @param {any} plan
 */
function directoryTargets(plan) {
  return plan.groups.map((group) => {
    const entry = plan.outputs.find((output) => output.source_path === group.entrypoint);
    assert.ok(entry, `the plan has an output for ${group.entrypoint}`);
    const agent = group.kind === 'agent';
    const base = agent ? entry.destination_path.replace(/\.agent\.md$/, '') : path.posix.dirname(entry.destination_path);
    const owned = plan.outputs.filter((output) => (agent
      ? output.destination_path === entry.destination_path || output.destination_path.startsWith(`${base}.support/`)
      : output.destination_path.startsWith(`${base}/`)));
    assert.ok(owned.every((output) => output.destination_state.type === 'missing'), 'this fixture replaces nothing');
    const destination = agent
      ? `${entry.destination_path}${owned.length > 1 ? `\n  and ${base}.support/` : ''}` : `${base}/`;
    return {
      target: `${group.kind} ${path.posix.basename(base)}\nDestination: ${destination}\n${owned.length} files: ${owned.length} new, 0 replaced`,
      revision: `sha256:${plan.plan_sha256}`,
    };
  });
}

/**
 * Deterministic selected-Dude model for the Add/import case. It scripts what the
 * installed owner does for each handoff, one tool call at a time, through the
 * tools the CLI actually offers: load dude-bundle-import, preview with the
 * unchanged importer, publish the literal permission, recognize consent,
 * recheck freshness, apply with the importer, verify, and acknowledge the
 * separate import_result. The model writes nothing in the workspace; the
 * importer does. The only files it creates are its own analysis, review, and
 * plan artifacts, outside the workspace. Each owner script is a generator that
 * yields its next tool call and receives that tool's actual result.
 * @param {ReturnType<typeof importFixture>} fixture
 * @param {{validateDirectoryImportResult:(value:unknown)=>unknown}} importer the installed module's own validator
 */
function createImportModel(fixture, importer) {
  const { root } = fixture;
  const state = {
    phase: 'bootstrap',
    requests: 0,
    toolName: null,
    offeredTools: [],
    /** @type {any[]} */
    imports: [],
    /** @type {any[]} */
    ownerToolCalls: [],
    modelError: null,
  };
  /** The calls the owner made, by id. The host approves exactly these, as made. @type {Map<string, any>} */
  const calls = new Map();
  /** @type {{generator:Generator<any, string, any>, callId:string|null}|null} */
  let active = null;
  /** Armed gates by name: the owner's call that names one waits for the browser to release it. @type {Map<string, ReturnType<typeof createGate>>} */
  const gates = new Map();
  const hold = (name) => {
    const gate = createGate();
    gates.set(name, gate);
    return gate;
  };
  const required = {
    skill: ['skill'], view: ['path'], create: ['path', 'file_text'], shell: ['command', 'description'], needs: ['op'],
  };
  const skill = (id, name) => ({ tool: 'skill', id, args: { skill: name } });
  const view = (id, file) => ({ tool: 'view', id, args: { path: file } });
  const create = (id, file, text) => ({
    tool: 'create', id, args: { path: file, file_text: text }, writes: 'owner artifact outside the workspace',
  });
  const shell = (id, command, description, writes = null) => ({
    tool: 'shell', id, args: { command, description, mode: 'sync', initial_wait: 30 }, writes,
  });
  const needs = (id, args) => ({ tool: 'needs', id, args });
  /** A shell result's stdout, which must have exited zero. */
  const stdoutOf = (text, label) => {
    const output = shellToolOutput(text);
    assert.ok(output.exitCode === null || output.exitCode === 0,
      `${label} exited ${output.exitCode}: ${text.slice(0, 2_000)}`);
    return output.stdout.trim();
  };
  const destinationExists = (relative) => fs.existsSync(path.join(root, ...relative.split('/')));
  /** The skill tool answers only that it loaded; the skill's own text reaches the model in the context it adds. */
  const assertProcedure = (loaded) => {
    assert.ok(loaded.text.includes('loaded successfully'), `dude-bundle-import did not load: ${loaded.text.slice(0, 600)}`);
    assert.ok((loaded.body.messages ?? []).some((message) => contentText(message?.content)
      .includes('Canvas Import Requests And Results')), 'the installed skill context carries the Canvas import procedure');
  };
  /** The procedure's fit check: a permission that does not fit is never published. */
  const assertFits = (fields) => {
    assert.ok(fields.targets.length >= 1 && fields.targets.length <= 12, 'one to twelve targets');
    for (const { target } of fields.targets) assert.ok(Buffer.byteLength(target) <= 2_048, 'target text fits');
    for (const key of ['consequences', 'eligibility', 'confirmation']) {
      assert.ok(Buffer.byteLength(fields[key]) <= 4_096, `${key} fits`);
    }
  };
  const permissionRequest = (binding, prompt, fields) => ({
    owner: 'dude',
    requestRef: `import:${binding.receiptId}`,
    scope: { kind: 'session' },
    source: { kind: 'session', revision: binding.providerGeneration },
    revision: `t012-import-permission-${sha256(JSON.stringify(fields)).slice(0, 16)}`,
    class: 'permission',
    prompt,
    whyHuman: 'Importing writes project files. Dude needs your literal permission for these exact targets.',
    unblocks: 'Dude can apply this reviewed import and report the verified result in Settings > Packs > Add/import.',
    blocking: true,
    fields,
  });

  /** Publish the literal permission, wait for the human's consent, and recognize it as the permission response. */
  function* consent(id, record, imported, request) {
    assertFits(request.fields);
    record.permission = { request, response: null, acknowledgment: null };
    record.stage = 'permission-waiting';
    const answered = yield needs(id('permission'), { op: 'request', request });
    const details = toolDetails(answered.body, answered.callId);
    assert.equal(details.status, 'awaiting_acknowledgment');
    assert.equal(details.acceptedAnswer, false);
    assert.deepEqual(
      [details.response.class, details.response.action, details.response.operation, details.response.confirmation],
      ['permission', 'consent', request.fields.operation, request.fields.confirmation],
    );
    assert.deepEqual(details.response.targets, request.fields.targets);
    assert.deepEqual(imported.written.filter(destinationExists), [], 'accepted permission alone writes nothing');
    record.permission.response = details;
    record.stage = 'permission-consented';
    const receipt = details.receipt;
    const recognized = yield needs(id('permission-ack'), {
      op: 'acknowledge',
      acknowledgment: {
        receiptId: receipt.receiptId,
        owner: receipt.owner,
        requestRef: receipt.requestRef,
        scope: receipt.scope,
        previousRevision: receipt.previousRevision,
        recognizes: receipt.recognizes,
        outcome: imported.permissionAck,
        note: 'The owner recognized the exact installed-host import permission response.',
        source: receipt.source,
      },
    });
    const acknowledged = toolDetails(recognized.body, recognized.callId);
    assert.equal(acknowledged.status, imported.permissionAck);
    record.permission.acknowledgment = acknowledged;
  }

  /** Ordinary verification before the result: lint, then every reported path a regular, unlinked file. */
  function* verify(id, record, written) {
    const linted = yield shell(id('lint'), lintCommand(root), 'Verify the imported files with the shipped lint');
    assert.match(linted.text, /\b0 failure\(s\)/, 'post-import installed lint reports zero failures');
    const checked = yield shell(id('paths'), regularFilesCommand(root, written),
      'Check that every imported path is a regular, unlinked file');
    const lines = stdoutOf(checked.text, 'regular-file check').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    assert.deepEqual(lines, written.map((relative) => `${relative} file=True link=False`));
    record.verification = { lint: linted.text, regularFiles: lines };
  }

  /** The separate import_result, with the exact verified paths. */
  function* acknowledgeResult(id, record, binding, written, note) {
    record.stage = 'result-ready';
    const accepted = yield {
      ...needs(id('result'), {
        op: 'acknowledge',
        acknowledgment: {
          recognizes: 'import_result', ...binding, outcome: 'applied', mutation: 'applied', written, uncertain: [], note,
        },
      }),
      gate: `${record.kind}-before-result`,
    };
    record.stage = 'result-acknowledged';
    const details = toolDetails(accepted.body, accepted.callId);
    assert.equal(details.phase, 'applied', `the provider refused the import result: ${JSON.stringify(details)}`);
    assert.equal(details.applied, true);
    assert.equal(details.receipt.current, true);
    assert.deepEqual(details.receipt.acknowledgment.written, written);
    record.result = details;
    record.stage = 'complete';
  }

  /** The bytes the importer left, compared with the bytes authored in the fixture. */
  const observeDestinations = (record, imported) => {
    const observed = {};
    for (const [relative, expected] of imported.expected) {
      const actual = fs.readFileSync(path.join(root, ...relative.split('/')));
      assert.equal(actual.equals(expected), true, `the importer left the exact reviewed bytes at ${relative}`);
      observed[relative] = { bytes: actual.length, sha256: sha256(actual) };
    }
    record.destinations = observed;
  };

  function* fileImport(binding, record) {
    const imported = fixture.file;
    const id = (name) => `call_t012_import_file_${name}`;
    const analyzeCommand = importerCommand(root, ['analyze', shellArg(imported.source), '--json']);
    const procedure = yield skill(id('skill'), 'dude-bundle-import');
    assertProcedure(procedure);
    record.procedureSha256 = sha256(procedure.text);
    const previewed = yield shell(id('analyze'), analyzeCommand, 'Preview the local file import (read only)');
    const analysis = JSON.parse(stdoutOf(previewed.text, 'focused analyze'));
    assert.deepEqual({
      source: analysis.source, sourceIdentity: analysis.sourceIdentity, sourceSha256: analysis.sourceSha256,
      kind: analysis.kind, destRel: analysis.destRel, destinationState: analysis.destinationState,
      licenseSiblingStates: analysis.licenseSiblingStates, license: analysis.frontmatter.license,
      strip: analysis.frontmatter.strip, stripTools: analysis.strip_tools,
    }, {
      source: imported.source, sourceIdentity: imported.source, sourceSha256: sha256(imported.bytes),
      kind: 'skill', destRel: imported.written[0], destinationState: { type: 'missing' },
      licenseSiblingStates: { LICENSE: { type: 'missing' }, NOTICE: { type: 'missing' } },
      license: 'MIT', strip: [], stripTools: false,
    });
    assert.deepEqual(imported.written.filter(destinationExists), [], 'owner preview writes nothing');
    record.analysis = analysis;
    const read = yield view(id('source'), imported.source);
    assert.ok(read.text.includes('Read the notes the user names'), 'the owner read the exact source');
    const folder = path.posix.dirname(analysis.destRel);
    const targets = [
      { target: `${analysis.destRel}\nAnalyzed state: missing\nDecision: create`, revision: 'missing' },
      {
        target: `${folder}/LICENSE\nAnalyzed state: missing\nDecision: create the reviewed ${analysis.frontmatter.license} license sibling`,
        revision: 'missing',
      },
    ];
    assert.deepEqual(targets, imported.targets);
    yield* consent(id, record, imported, permissionRequest(
      binding,
      'Import the skill dude-local-status-review and its LICENSE from a local file?',
      {
        operation: imported.operation,
        targets,
        consequences: [
          'Creates 2 new files with the default adaptations only: the license line leaves the SKILL.md frontmatter and is preserved in the new LICENSE file (license: MIT). The source has no compatibility, model, or tools metadata to strip.',
          'No existing file is replaced.',
          'Unresolved sibling or dependency references: none.',
          'Focused import is not transactional. If the second write fails, the first file stays written.',
          'New agents or skills may not be available until you start a new session.',
        ].join('\n'),
        eligibility: `Source: ${imported.source}\nSource identity: ${analysis.sourceIdentity}\nLocal file that parses as a Dude skill named ${analysis.frontmatter.name}.`,
        confirmation: imported.confirmation,
      },
    ));
    // Freshness: any difference from the reviewed basis is changed impact.
    const basis = (value) => ({
      sourceIdentity: value.sourceIdentity, sourceSha256: value.sourceSha256,
      destinationState: value.destinationState, licenseSiblingStates: value.licenseSiblingStates,
    });
    const rechecked = yield shell(id('recheck'), analyzeCommand, 'Recheck the reviewed source and destinations (read only)');
    assert.deepEqual(basis(JSON.parse(stdoutOf(rechecked.text, 'focused recheck'))), basis(analysis));
    const plan = {
      ...analysis,
      destinationDecision: { action: 'create', state: analysis.destinationState },
      license_disposition: {
        license: analysis.frontmatter.license,
        materialization: 'skill-license-sibling',
        sibling: { filename: 'LICENSE', decision: { action: 'create', state: analysis.licenseSiblingStates.LICENSE } },
      },
    };
    const planFile = path.join(fixture.evidence, 'file-plan.json');
    yield create(id('plan'), planFile, JSON.stringify(plan));
    assert.equal(fs.readFileSync(planFile, 'utf8'), JSON.stringify(plan));
    record.plan = { path: planFile, sha256: sha256(JSON.stringify(plan)) };
    assert.deepEqual(imported.written.filter(destinationExists), [], 'the plan file writes nothing');
    const applyCommand = importerCommand(root, ['apply', shellArg(imported.source), '--plan', shellArg(planFile)]);
    const applied = yield shell(id('apply'), applyCommand, 'Apply the exactly reviewed focused import', 'workspace, by the importer');
    const stdout = stdoutOf(applied.text, 'focused apply');
    const written = [...stdout.matchAll(/^\[OK\] wrote (.+)\r?$/gm)].map((match) => match[1]);
    assert.deepEqual(written, imported.written);
    observeDestinations(record, imported);
    record.apply = { command: applyCommand, stdout, written };
    yield* verify(id, record, written);
    yield* acknowledgeResult(id, record, binding, written,
      'Installed Dude previewed the local file, published the exact permission, recognized consent, rechecked the reviewed basis, applied the reviewed import once, verified zero lint failures and that each written path is a regular file, and reports the two written paths.');
    return 'T012_IMPORT_FILE_COMPLETE';
  }

  function* directoryImport(binding, record) {
    const imported = fixture.directory;
    const id = (name) => `call_t012_import_directory_${name}`;
    const analyzeCommand = importerCommand(root, ['analyze-directory', shellArg(imported.source)]);
    const procedure = yield skill(id('skill'), 'dude-bundle-import');
    assertProcedure(procedure);
    record.procedureSha256 = sha256(procedure.text);
    const previewed = yield shell(id('analyze'), analyzeCommand, 'Analyze the local directory import (read only)');
    const analysisText = stdoutOf(previewed.text, 'analyze-directory');
    const analysis = JSON.parse(analysisText);
    assert.deepEqual(analysis.blocking_diagnostics, []);
    assert.equal(analysis.static_decision, 'clean');
    assert.deepEqual(analysis.outputs.map((output) => output.destination_path), imported.written);
    // The review claim is backed by the exact reviewed batch bytes, which equal the authored sources.
    assert.deepEqual(analysis.review_batches.map((batch) => batch.batch_id), ['batch-001']);
    for (const file of analysis.review_batches.flatMap((batch) => batch.files)) {
      assert.equal(file.content, imported.files.get(`kit/${file.path}`), `reviewed batch bytes for ${file.path}`);
    }
    assert.deepEqual(imported.written.filter(destinationExists), [], 'owner analysis writes nothing');
    const analysisFile = path.join(fixture.evidence, 'directory-analysis.json');
    yield create(id('analysis-file'), analysisFile, analysisText);
    const review = JSON.stringify({
      analysis_sha256: analysis.analysis_sha256,
      findings: [],
      kind: 'dude-directory-review',
      reviewed_batch_ids: analysis.review_batches.map((batch) => batch.batch_id),
      schema_version: 1,
    });
    const reviewFile = path.join(fixture.evidence, 'directory-review.json');
    yield create(id('review-file'), reviewFile, review);
    const planCommand = importerCommand(root, [
      'plan-directory', '--analysis', shellArg(analysisFile), '--review', shellArg(reviewFile),
    ]);
    const planned = yield shell(id('plan'), planCommand, 'Plan the reviewed directory import (read only)');
    const planText = stdoutOf(planned.text, 'plan-directory');
    const plan = JSON.parse(planText);
    assert.equal(plan.decision, 'clean');
    assert.deepEqual(plan.replace_paths, []);
    assert.deepEqual(plan.outputs.map((output) => output.destination_path), imported.written);
    const planFile = path.join(fixture.evidence, 'directory-plan.json');
    yield create(id('plan-file'), planFile, planText);
    record.analysis = { analysis_sha256: analysis.analysis_sha256, outputs: analysis.outputs.length };
    record.plan = { path: planFile, plan_sha256: plan.plan_sha256, decision: plan.decision, groups: plan.groups };
    const targets = directoryTargets(plan);
    assert.deepEqual(targets.map((entry) => entry.target), imported.targets);
    yield* consent(id, record, imported, permissionRequest(
      binding,
      'Import 2 artifacts from a reviewed local directory plan?',
      {
        operation: imported.operation,
        targets,
        consequences: [
          'Clean: no static or advisory warnings.',
          'New agents or skills may not be available until you start a new session.',
          'Nothing is executed.',
          'Apply is all-or-nothing with rollback.',
          'Replaced files are overwritten.',
        ].join('\n'),
        eligibility: `Source: ${imported.source}\nLocal directory.`,
        confirmation: imported.confirmation,
      },
    ));
    // Freshness: the analysis and the reviewed plan must both come out exactly as reviewed.
    const rechecked = yield shell(id('recheck'), analyzeCommand, 'Recheck the reviewed source and destinations (read only)');
    assert.equal(stdoutOf(rechecked.text, 'directory recheck'), analysisText, 'the analysis is unchanged since the preview');
    const replanned = yield shell(id('replan'), planCommand, 'Recheck the reviewed plan (read only)');
    assert.equal(JSON.parse(stdoutOf(replanned.text, 'directory replan')).plan_sha256, plan.plan_sha256);
    const applyCommand = importerCommand(root, [
      'apply-directory', shellArg(imported.source), '--plan', shellArg(planFile), '--confirm', shellArg('confirm-import'),
    ]);
    const applied = yield shell(id('apply'), applyCommand, 'Apply the exactly reviewed clean directory import', 'workspace, by the importer');
    const stdout = stdoutOf(applied.text, 'apply-directory');
    const result = JSON.parse(stdout);
    importer.validateDirectoryImportResult(result);
    assert.equal(result.status, 'installed');
    assert.equal(result.plan_sha256, plan.plan_sha256);
    assert.deepEqual(result.written_paths, imported.written);
    observeDestinations(record, imported);
    record.apply = { command: applyCommand, stdout, written: result.written_paths };
    yield* verify(id, record, result.written_paths);
    yield* acknowledgeResult(id, record, binding, result.written_paths,
      'Installed Dude analyzed the local directory, reviewed its one batch, published the exact permission, recognized consent, rechecked the analysis and plan, ran apply-directory once (installed), verified zero lint failures and that each written path is a regular file, and reports the five written paths.');
    return 'T012_IMPORT_DIRECTORY_COMPLETE';
  }

  /** The host's decision for one permission request: only the calls made above, exactly as made. */
  const approve = (request) => {
    const call = calls.get(String(request.toolCallId));
    if (!call) return false;
    switch (call.tool) {
      case 'view': return request.kind === 'read' && request.path === call.args.path;
      case 'create': return request.kind === 'write' && request.fileName === call.args.path
        && request.newFileContents === call.args.file_text;
      case 'shell': return request.kind === 'shell' && request.fullCommandText === call.args.command;
      case 'needs': return request.kind === 'custom-tool' && request.toolName === 'dude_needs_you'
        && isDeepStrictEqual(request.args, call.args);
      default: return false;
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 120, 'installed import model request bound exceeded');
      assert.equal(isSpecLeadTurn(body), false, 'the selected Dude owns the import workflow');
      recordToolSchemas('selected-dude-import', body);
      const offered = offeredDudeTool(body);
      state.toolName = offered.name;
      state.offeredTools = offered.offered;
      if (state.phase === 'bootstrap') {
        state.phase = 'idle';
        answerModel(res, body, { role: 'assistant', content: 'T012_IMPORT_HOST_IDLE' }, 'stop');
        return;
      }
      let step;
      if (active) {
        step = active.generator.next({
          body, callId: active.callId, text: toolMessageText(body, /** @type {string} */ (active.callId)),
        });
      } else {
        assert.equal(state.phase, 'idle', 'a handoff arrives only while the owner is idle');
        const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
        const prompt = contentText(lastUser?.content);
        assert.ok(prompt.includes('Dude Canvas explicit artifact import request in this joined workspace/session.'));
        const jsonLine = prompt.split(/\r?\n/).reverse().find((line) => line.trim().startsWith('{'));
        assert.ok(jsonLine, 'the import handoff omitted its exact receipt binding');
        const binding = JSON.parse(jsonLine);
        const imported = [fixture.file, fixture.directory][state.imports.length];
        assert.ok(imported, 'only the two scripted imports are requested');
        assert.deepEqual(Object.keys(binding),
          ['receiptId', 'owner', 'importSource', 'workspaceId', 'sessionId', 'providerGeneration']);
        assert.equal(binding.owner, 'dude');
        assert.equal(binding.importSource, imported.source, 'the handoff carries the exact literal source');
        const record = {
          kind: imported === fixture.file ? 'file' : 'directory', binding, stage: 'started', promptSha256: sha256(prompt),
          analysis: null, plan: null, permission: null, apply: null, verification: null, destinations: null,
          result: null, procedureSha256: null,
        };
        state.imports.push(record);
        state.phase = 'importing';
        active = { generator: imported === fixture.file ? fileImport(binding, record) : directoryImport(binding, record), callId: null };
        step = active.generator.next();
      }
      if (step.done) {
        active = null;
        state.phase = state.imports.length === 2 ? 'complete' : 'idle';
        answerModel(res, body, { role: 'assistant', content: step.value }, 'stop');
        return;
      }
      const call = step.value;
      const tool = requireToolSchema(body,
        call.tool === 'needs' ? offered.name : call.tool === 'shell' ? SHELL_TOOL : call.tool, required[call.tool]);
      const gate = call.gate ? gates.get(call.gate) : undefined;
      if (gate) {
        gate.reached = true;
        await gate.wait();
      }
      assert.equal(calls.has(call.id), false, `owner call ids are unique: ${call.id}`);
      calls.set(call.id, call);
      state.ownerToolCalls.push({ callId: call.id, tool, writes: call.writes ?? null, args: call.args });
      /** @type {NonNullable<typeof active>} */ (active).callId = call.id;
      answerModel(res, body, toolCall(call.id, tool, call.args), 'tool_calls');
    } catch (error) {
      state.modelError = safeError(error);
      note('import-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 import fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state, approve, hold };
}

/**
 * Deterministic selected-Dude model for the Phase B case. It scripts what the installed owner does with one
 * source-bound install handoff, one tool call at a time, through the tools the CLI actually offers: load
 * dude-compose and its Sources procedure, preview the bound folder with Compose, read its pack and the saved
 * sources and their raw-bytes revision, publish the literal permission naming the third-party source first,
 * recognize consent, check source freshness again, run Compose with exactly the bound `--source`, verify with
 * the shipped lint, reread the profile, and acknowledge the pack_result with the exact binding echoed. The
 * model writes nothing in the workspace; Compose does. Each owner script is a generator that yields its next
 * tool call and receives that tool's actual result.
 * @param {ReturnType<typeof seedSourceFixture>} fixture
 * @param {{parsePackSourcesDocument:(value:Buffer)=>unknown[]}} sources the installed module's own parser
 */
function createSourceModel(fixture, sources) {
  const { root } = fixture;
  const beforeProfile = installedProfile(root);
  const state = {
    phase: 'bootstrap',
    requests: 0,
    toolName: null,
    offeredTools: [],
    /** @type {any} */
    record: null,
    /** @type {any[]} */
    ownerToolCalls: [],
    modelError: null,
  };
  /** The calls the owner made, by id. The host approves exactly these, as made. @type {Map<string, any>} */
  const calls = new Map();
  /** @type {{generator:Generator<any, string, any>, callId:string|null}|null} */
  let active = null;
  /** Armed gates by name: the owner's call that names one waits for the browser to release it. @type {Map<string, ReturnType<typeof createGate>>} */
  const gates = new Map();
  const hold = (name) => {
    const gate = createGate();
    gates.set(name, gate);
    return gate;
  };
  const required = { skill: ['skill'], view: ['path'], shell: ['command', 'description'], needs: ['op'] };
  const skill = (id, name) => ({ tool: 'skill', id, args: { skill: name } });
  const view = (id, file) => ({ tool: 'view', id, args: { path: file } });
  const shell = (id, command, description, writes = null) => ({
    tool: 'shell', id, args: { command, description, mode: 'sync', initial_wait: 30 }, writes,
  });
  const needs = (id, args) => ({ tool: 'needs', id, args });
  /** A shell result's stdout, which must have exited zero. */
  const stdoutOf = (text, label) => {
    const output = shellToolOutput(text);
    assert.ok(output.exitCode === null || output.exitCode === 0,
      `${label} exited ${output.exitCode}: ${text.slice(0, 2_000)}`);
    return output.stdout.trim();
  };
  /** Nothing the owner does before applying changes the workspace: no pack file, profile, or saved sources. */
  const assertUntouched = (label, sourcesBytes) => {
    assert.equal(fs.existsSync(fixture.destination), false, `${label} performed no projected write`);
    assert.deepEqual(installedProfile(root).value, beforeProfile.value, `${label} performed no profile write`);
    assert.equal(fs.readFileSync(fixture.sourcesFile).equals(sourcesBytes), true, `${label} performed no saved-sources write`);
  };

  function* install(binding, record) {
    const id = (name) => `call_t012_source_${name}`;
    const bound = binding.catalogSource;
    const location = bound.source.location;
    const sourcesBytes = fs.readFileSync(fixture.sourcesFile);
    const inSource = (relative) => path.join(location, 'library', 'packs', PACK_NAME, ...relative.split('/'));
    // 1. The installed skill's Canvas procedure, including how a source-bound request is handled.
    const procedure = yield skill(id('skill'), 'dude-compose');
    assert.ok(procedure.text.includes('loaded successfully'), `dude-compose did not load: ${procedure.text.slice(0, 600)}`);
    const context = (procedure.body.messages ?? []).map((message) => contentText(message?.content)).join('\n');
    for (const heading of ['Canvas Pack Requests And Results', 'Sources In Pack Requests']) {
      assert.ok(context.includes(heading), `the installed skill context carries ${heading}`);
    }
    record.procedureSha256 = sha256(procedure.text);
    // 2. The actual preview: Compose lists exactly the bound folder, never the default library or a fallback.
    const listed = yield shell(id('list'), fixture.listCommand(location), 'Read installed pack eligibility from the bound source (read only)');
    const listing = JSON.parse(stdoutOf(listed.text, 'compose list --source'));
    assert.equal(listing.ok, true);
    assert.equal(listing.origin, `source ${location}`, 'Compose listed the bound source');
    assert.deepEqual(listing.packs.map((pack) => [pack.name, pack.installed, pack.description]), [
      [PACK_NAME, false, 'Added-source variant of the installed-host pack round trip.'],
      [SOURCE_EXTRA_PACK, false, 'A second pack only the added source offers.'],
    ], 'the bound source offers its own pack, uninstalled');
    assertUntouched('owner preview', sourcesBytes);
    // 3. The pack as the install would project it, read from the bound folder.
    const manifest = yield view(id('manifest'), inSource('pack.md'));
    assert.ok(manifest.text.includes('Added-source variant') && manifest.text.includes('tools: [node]'), 'the owner read the bound pack manifest');
    const instruction = yield view(id('instruction'), inSource(`instructions/dude-pack-${PACK_NAME}-owner.instructions.md`));
    assert.ok(instruction.text.includes('not from the default library'), 'the owner read the bound pack source file');
    // 4. The saved source this request is bound to, and the raw-bytes revision of the file that holds it.
    const saved = yield view(id('sources'), fixture.sourcesFile);
    assert.ok(saved.text.includes('"type": "local"') && saved.text.includes(fixture.label), 'the owner read the saved source entry');
    const digest = yield shell(id('sources-digest'), fixture.digestCommand(fixture.sourcesFile), 'Read the raw-bytes revision of the saved sources (read only)');
    assert.equal(`sha256:${stdoutOf(digest.text, 'sources digest').toLowerCase()}`, bound.sourcesRevision,
      'the saved sources are still the revision this request was bound to');
    assertUntouched('reading the saved sources', sourcesBytes);
    const preview = {
      operation: 'install',
      name: PACK_NAME,
      source: bound,
      files: fixture.written,
      tools: [{ name: 'node', available: true, version: process.version }],
      profileRevision: revision(beforeProfile.bytes),
      packRevision: fixture.packRevision,
      targetRevision: 'absent',
    };
    record.preview = preview;
    // 5. The literal permission names the third-party source first, pinned by the digest of its pack files.
    const request = {
      owner: 'dude',
      requestRef: `pack:${binding.receiptId}`,
      scope: { kind: 'session' },
      source: { kind: 'session', revision: binding.providerGeneration },
      revision: `t012-source-permission-${sha256(JSON.stringify(preview)).slice(0, 16)}`,
      class: 'permission',
      prompt: `Install ${PACK_NAME} from the third-party source ${location} into this disposable workspace.`,
      whyHuman: 'The actual Compose projection writes the named installed pack artifact and profile membership from the source this project added.',
      unblocks: 'The owner can recheck the reviewed basis, apply Compose once with the bound source, and report the correlated result.',
      blocking: true,
      fields: {
        operation: 'pack:install',
        targets: [
          {
            target: `Third-party source ${location}\nSource type: local folder (a remote commit is not applicable)\nSaved in ${SOURCES_PATH}`,
            revision: fixture.packRevision,
          },
          { target: PROFILE_PATH, revision: preview.profileRevision },
          { target: `pack:${PACK_NAME} source`, revision: fixture.packRevision },
          { target: PACK_DESTINATION, revision: preview.targetRevision },
        ],
        consequences: `Install ${PACK_DESTINATION} from the third-party source ${location}, which is not part of the Dude bundle: its packs can add agents and instructions. Required tool: node (${process.version}); no prerequisite is installed.`,
        eligibility: 'Compose reported the exact pack available and not installed from the bound source; the owner will recheck the profile, the saved sources revision, the source, and the destination before applying.',
        confirmation: `INSTALL PACK ${PACK_NAME}`,
      },
    };
    record.permission = { request, response: null, acknowledgment: null };
    record.stage = 'permission-waiting';
    const answered = yield needs(id('permission'), { op: 'request', request });
    const details = toolDetails(answered.body, answered.callId);
    assert.equal(details.status, 'awaiting_acknowledgment');
    assert.equal(details.acceptedAnswer, false);
    assert.deepEqual(
      [details.response.class, details.response.action, details.response.operation, details.response.confirmation],
      ['permission', 'consent', 'pack:install', `INSTALL PACK ${PACK_NAME}`],
    );
    assert.deepEqual(details.response.targets, request.fields.targets);
    assertUntouched('accepted permission alone', sourcesBytes);
    record.permission.response = details;
    record.stage = 'permission-consented';
    const receipt = details.receipt;
    const recognized = yield needs(id('permission-ack'), {
      op: 'acknowledge',
      acknowledgment: {
        receiptId: receipt.receiptId,
        owner: receipt.owner,
        requestRef: receipt.requestRef,
        scope: receipt.scope,
        previousRevision: receipt.previousRevision,
        recognizes: receipt.recognizes,
        outcome: 'accepted',
        note: 'The owner recognized the exact installed-host source-bound pack permission response.',
        source: receipt.source,
      },
    });
    const acknowledged = toolDetails(recognized.body, recognized.callId);
    assert.equal(acknowledged.status, 'accepted');
    record.permission.acknowledgment = acknowledged;
    assertUntouched('owner recognition alone', sourcesBytes);
    // 6. Freshness again before writing: the saved sources, the bound source, and the reviewed pack bytes.
    const again = yield shell(id('sources-digest-again'), fixture.digestCommand(fixture.sourcesFile), 'Recheck the raw-bytes revision of the saved sources (read only)');
    assert.equal(`sha256:${stdoutOf(again.text, 'sources digest recheck').toLowerCase()}`, bound.sourcesRevision);
    const relisted = yield shell(id('list-again'), fixture.listCommand(location), 'Recheck the bound source before applying (read only)');
    assert.deepEqual(JSON.parse(stdoutOf(relisted.text, 'compose list recheck')).packs.map((pack) => pack.name), [PACK_NAME, SOURCE_EXTRA_PACK]);
    assert.equal(revision(Buffer.concat([fs.readFileSync(inSource('pack.md')), fs.readFileSync(inSource(`instructions/dude-pack-${PACK_NAME}-owner.instructions.md`))])),
      fixture.packRevision, 'the reviewed pack bytes are unchanged');
    assert.deepEqual(sources.parsePackSourcesDocument(sourcesBytes), [bound.source], 'the saved entry for the key is still the bound source');
    record.freshness = { sourcesRevision: bound.sourcesRevision, packRevision: fixture.packRevision };
    // 7. Apply with exactly the bound source, and nothing else.
    const addCommand = fixture.addCommand(location);
    const applied = yield shell(id('add'), addCommand, 'Apply the exact consented pack with Compose from the bound source', 'workspace, by Compose');
    const stdout = stdoutOf(applied.text, 'compose add --source');
    const envelope = JSON.parse(stdout);
    assert.deepEqual(envelope, { ok: true, code: 0, result: { added: PACK_NAME, files: fixture.written, origin: `source ${location}` } },
      'Compose add --envelope printed the exact engine result envelope for the bound source');
    const destination = fs.readFileSync(fixture.destination);
    assert.equal(destination.equals(fixture.instruction), true, 'Compose projected the bound folder\'s exact pack bytes');
    assert.equal(destination.equals(fixture.defaults.instruction), false, 'and not the default library\'s same-named pack');
    const profile = installedProfile(root);
    assert.deepEqual(profile.value.installed[PACK_NAME], { files: fixture.written, source: { type: 'local', location: fixture.realTeam } });
    record.compose = {
      command: addCommand, toolResult: applied.text, stdout, result: envelope,
      destination: { bytes: destination.length, sha256: sha256(destination) },
    };
    // 8. Ordinary verification, then the profile as the provider will reread it.
    const linted = yield shell(id('lint'), fixture.lintCommand, 'Verify the installed pack projection with the shipped lint');
    assert.match(linted.text, /\b0 failure\(s\)/, 'post-Compose installed verification reports zero failures');
    record.verification = { command: fixture.lintCommand, toolResult: linted.text };
    const reread = yield view(id('profile'), path.join(root, ...PROFILE_PATH.split('/')));
    assert.ok(reread.text.includes(PACK_NAME) && reread.text.includes(PACK_DESTINATION));
    // 9. The result, with the exact bound selection echoed. The owner reports what its own command printed.
    record.stage = 'result-ready';
    const accepted = yield {
      ...needs(id('result'), {
        op: 'acknowledge',
        acknowledgment: {
          recognizes: 'pack_result',
          ...binding,
          outcome: 'applied',
          mutation: 'applied',
          result: envelope,
          profileRevision: revision(profile.bytes),
          source: profile.value.installed[PACK_NAME].source,
          note: 'Installed Dude previewed the bound folder, published the third-party permission, recognized consent, rechecked the saved sources revision, ran Compose once with exactly the bound source, verified zero lint failures, reread the profile, and reports the recorded folder and file.',
        },
      }),
      gate: 'source-before-result',
    };
    record.stage = 'result-acknowledged';
    const result = toolDetails(accepted.body, accepted.callId);
    assert.equal(result.phase, 'applied', `the provider refused the pack result: ${JSON.stringify(result)}`);
    assert.equal(result.applied, true);
    assert.equal(result.receipt.freshness, 'current');
    assert.deepEqual(result.receipt.catalogSource, bound, 'the provider kept the exact binding');
    assert.deepEqual(result.receipt.reread.entry, { files: fixture.written, source: { type: 'local', location: fixture.realTeam } });
    assert.equal(result.receipt.reread.profileRevision, revision(installedProfile(root).bytes));
    assert.deepEqual(result.receipt.acknowledgment.result, envelope, 'the provider accepted the observed Compose stdout as the pack result');
    record.result = result;
    record.stage = 'complete';
    return 'T012_SOURCE_PACK_COMPLETE';
  }

  /** The host's decision for one permission request: only the calls made above, exactly as made. */
  const approve = (request) => {
    const call = calls.get(String(request.toolCallId));
    if (!call) return false;
    switch (call.tool) {
      case 'view': return request.kind === 'read' && request.path === call.args.path;
      case 'shell': return request.kind === 'shell' && request.fullCommandText === call.args.command;
      case 'needs': return request.kind === 'custom-tool' && request.toolName === 'dude_needs_you'
        && isDeepStrictEqual(request.args, call.args);
      default: return false;
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 48, 'installed source model request bound exceeded');
      assert.equal(isSpecLeadTurn(body), false, 'the selected Dude owns the pack workflow');
      recordToolSchemas('selected-dude-source', body);
      const offered = offeredDudeTool(body);
      state.toolName = offered.name;
      state.offeredTools = offered.offered;
      if (state.phase === 'bootstrap') {
        state.phase = 'idle';
        answerModel(res, body, { role: 'assistant', content: 'T012_SOURCE_HOST_IDLE' }, 'stop');
        return;
      }
      let step;
      if (active) {
        step = active.generator.next({
          body, callId: active.callId, text: toolMessageText(body, /** @type {string} */ (active.callId)),
        });
      } else {
        assert.equal(state.phase, 'idle', 'a handoff arrives only while the owner is idle');
        assert.equal(state.record, null, 'the one source-bound request is sent exactly once');
        const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
        const prompt = contentText(lastUser?.content);
        const lines = prompt.split(/\r?\n/);
        // The installed CLI may put its own timestamp tag ahead of the message; nothing else precedes the handoff.
        const headerAt = lines.indexOf('Dude Canvas explicit pack request in this joined workspace/session.');
        assert.ok(headerAt >= 0, 'the foreground message is the pack handoff');
        assert.deepEqual(lines.slice(0, headerAt).map((line) => line.trim()).filter((line) => line && !/^<current_datetime>[^<>]*<\/current_datetime>$/.test(line)), [],
          'only the CLI timestamp tag precedes the handoff');
        lines.splice(0, headerAt);
        assert.equal(lines.filter((line) => /^This request is bound to one source the project added \(catalogSource in the final JSON\)\./.test(line)).length, 1,
          'the handoff tells the owner to use exactly the bound source');
        const jsonLine = lines.reverse().find((line) => line.trim().startsWith('{'));
        assert.ok(jsonLine, 'the pack handoff omitted its exact receipt binding');
        const binding = JSON.parse(jsonLine);
        assert.deepEqual(Object.keys(binding),
          ['receiptId', 'owner', 'operation', 'name', 'workspaceId', 'sessionId', 'providerGeneration', 'catalogSource']);
        assert.deepEqual([binding.owner, binding.operation, binding.name], ['dude', 'install', PACK_NAME]);
        assert.deepEqual(Object.keys(binding.catalogSource), ['key', 'sourcesRevision', 'source']);
        assert.deepEqual(binding.catalogSource.source, { type: 'local', location: fixture.realTeam },
          'the binding names the real folder the project added');
        assert.equal(binding.catalogSource.sourcesRevision, revision(fs.readFileSync(fixture.sourcesFile)),
          'the binding carries the raw-bytes revision of the saved sources');
        state.record = {
          binding, promptSha256: sha256(prompt), stage: 'started', preview: null, permission: null, freshness: null,
          compose: null, verification: null, result: null, procedureSha256: null,
        };
        state.phase = 'installing';
        active = { generator: install(binding, state.record), callId: null };
        step = active.generator.next();
      }
      if (step.done) {
        active = null;
        state.phase = 'complete';
        answerModel(res, body, { role: 'assistant', content: step.value }, 'stop');
        return;
      }
      const call = step.value;
      const tool = requireToolSchema(body,
        call.tool === 'needs' ? offered.name : call.tool === 'shell' ? SHELL_TOOL : call.tool, required[call.tool]);
      const gate = call.gate ? gates.get(call.gate) : undefined;
      if (gate) {
        gate.reached = true;
        await gate.wait();
      }
      assert.equal(calls.has(call.id), false, `owner call ids are unique: ${call.id}`);
      calls.set(call.id, call);
      state.ownerToolCalls.push({ callId: call.id, tool, writes: call.writes ?? null, args: call.args });
      /** @type {NonNullable<typeof active>} */ (active).callId = call.id;
      answerModel(res, body, toolCall(call.id, tool, call.args), 'tool_calls');
    } catch (error) {
      state.modelError = safeError(error);
      note('source-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 source fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state, approve, hold };
}

/**
 * @param {string} root
 * @param {string} evidence
 */
function createReviewModel(root, evidence) {
  const initialPreview = preview(root);
  const sourceRecord = source(root);
  const expectedPreview = (version) => ({
    artifact: { path: MOCK_PATH, revision: revision(renderMock(version)) },
    assets: initialPreview.assets,
  });
  const request = (version) => ({
    owner: 'dude-spec-lead',
    requestRef: `t012-preview-${version.toLowerCase()}`,
    scope: { kind: 'feature', ideaPath: IDEA_PATH, specPath: SPEC_PATH },
    source: sourceRecord,
    revision: `t012-request-${version.toLowerCase()}`,
    class: 'preview',
    prompt: version === 'C'
      ? 'Approve exact installed revision C'
      : `Annotate exact installed revision ${version}`,
    whyHuman: 'The exact visual judgment and on-mock feedback require the user.',
    unblocks: version === 'C'
      ? 'The owner can record approval of current revision C.'
      : `The same owner can revise the canonical mock after revision ${version}.`,
    blocking: true,
    fields: state.revisions[version],
  });
  const state = {
    phase: 'initial',
    requests: 0,
    offeredTools: [],
    toolName: null,
    initialPreview,
    revisions: {
      A: initialPreview,
      B: expectedPreview('B'),
      C: expectedPreview('C'),
    },
    rounds: [],
    acknowledgments: [],
    ownerExecution: [],
    modelError: null,
  };
  const ownerReports = new Map();

  function checkRound(body, version, callId) {
    const details = toolDetails(body, callId);
    assert.equal(details.status, 'awaiting_acknowledgment');
    assert.equal(details.acceptedAnswer, false);
    assert.equal(details.response.class, 'preview');
    assert.equal(details.response.action, 'annotations');
    assert.equal(details.review.preview.artifact.revision, state.revisions[version].artifact.revision);
    const pngs = pngsInModelRequest(body).filter((bytes) => (
      bytes.length > 8 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    ));
    assert.ok(pngs.length >= 1, `installed tool result ${version} did not reach the model as actual PNG data`);
    const submissionId = details.response.submissionId;
    const reviewDirectory = path.join(
      root,
      ...path.posix.dirname(SPEC_PATH).split('/'),
      'reviews',
      submissionId,
    );
    const image = fs.readFileSync(path.join(reviewDirectory, 'annotated.png'));
    const matching = pngs.find((bytes) => bytes.equals(image));
    assert.ok(matching, `model image for ${version} did not match immutable annotated.png`);
    const report = fs.readFileSync(path.join(reviewDirectory, 'report.md'), 'utf8');
    assert.equal(details.review.report.text, report);
    assert.ok(report.includes(`Installed ${version}\u00a0annotation`));
    ownerReports.set(version, report);
    const provenance = JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'provenance.json'), 'utf8'));
    assert.equal(provenance.preview.artifact.revision, state.revisions[version].artifact.revision);
    assert.equal(provenance.capture.mode, 'fresh-viewport');
    assert.equal(provenance.capture.selectors.length, 1);
    assert.equal(provenance.capture.selectors[0].matches, 1);
    assert.equal(provenance.imageRevision, revision(image));
    assert.equal(provenance.reportRevision, revision(report));
    const working = JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'working.json'), 'utf8'));
    const decoded = decodePng(image);
    assert.deepEqual(
      { width: decoded.width, height: decoded.height },
      { width: provenance.capture.width, height: provenance.capture.height },
    );
    assert.equal(hasColorNear(decoded, 120, 30, [22, 58, 95], 2, 8), true,
      'the declared CSS sticky header is present in the installed source image');
    const stroke = /^#[a-f0-9]{6}$/i.test(working.state.palette.stroke)
      ? [
        Number.parseInt(working.state.palette.stroke.slice(1, 3), 16),
        Number.parseInt(working.state.palette.stroke.slice(3, 5), 16),
        Number.parseInt(working.state.palette.stroke.slice(5, 7), 16),
      ]
      : null;
    assert.ok(stroke);
    const viewport = provenance.capture.viewport;
    const alignment = working.state.annotations.map((annotation) => {
      const point = annotation.tool === 'box'
        ? { x: (annotation.x1 + annotation.x2) / 2, y: annotation.y1 }
        : { x: annotation.x1, y: annotation.y1 };
      const imagePoint = {
        x: (point.x - viewport.scrollX) * viewport.deviceScale,
        y: (point.y - viewport.scrollY) * viewport.deviceScale,
      };
      const painted = hasColorNear(decoded, imagePoint.x, imagePoint.y, stroke);
      assert.equal(painted, true,
        `${version} ${annotation.tool} is not painted at its source-bound image coordinate`);
      return { id: annotation.id, tool: annotation.tool, sourcePoint: point, imagePoint, painted };
    });
    const received = path.join(evidence, `model-received-${version.toLowerCase()}.png`);
    fs.writeFileSync(received, matching);
    const round = {
      version,
      callId,
      receipt: details.receipt,
      submissionId,
      reviewDirectory,
      reportRevision: provenance.reportRevision,
      imageRevision: provenance.imageRevision,
      provenanceRevision: details.review.provenance.revision,
      imageBytes: image.length,
      modelImageSha256: sha256(matching),
      originalWaiterToolCallId: details.receipt.originalToolCallId,
      capture: provenance.capture,
      alignment,
      filesBeforeSuccessor: Object.fromEntries(
        ['working.json', 'report.md', 'annotated.png', 'provenance.json']
          .map((name) => [name, sha256(fs.readFileSync(path.join(reviewDirectory, name)))]),
      ),
    };
    state.rounds.push(round);
    return round;
  }

  function acknowledgment(round, reviewed, current, outcome = 'applied') {
    return {
      op: 'acknowledge',
      acknowledgment: {
        receiptId: round.receipt.receiptId,
        owner: round.receipt.owner,
        requestRef: round.receipt.requestRef,
        scope: round.receipt.scope,
        previousRevision: round.receipt.previousRevision,
        recognizes: round.receipt.recognizes,
        outcome,
        note: outcome === 'applied'
          ? `Same synthetic owner reread and applied the response for revision ${reviewed}.`
          : `Same synthetic owner declined revision ${reviewed}.`,
        source: sourceRecord,
        preview: {
          reviewedRevision: state.revisions[reviewed].artifact.revision,
          current,
        },
      },
    };
  }

  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      assert.ok(req.headers.authorization === undefined || req.headers.authorization === 'Bearer');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 24, 'review model request bound exceeded');
      const specLead = isSpecLeadTurn(body);
      recordToolSchemas(specLead ? 'spec-lead-review' : 'selected-dude-review', body);
      const lastTool = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'tool');
      const lastId = lastTool?.tool_call_id ?? null;

      if (specLead) {
        const match = /(?:delegate|spec)-([bc])/.exec(state.phase);
        assert.ok(match, `unexpected Spec Lead phase ${state.phase}`);
        const target = match[1].toUpperCase();
        const sourceVersion = target === 'B' ? 'A' : 'B';
        const suffix = target.toLowerCase();
        if (state.phase === `delegate-${suffix}`) {
          const view = requireToolSchema(body, 'view', ['path']);
          const callId = `call_t012_spec_read_skill_${suffix}`;
          state.ownerExecution.push({
            owner: 'Spec Lead',
            callId,
            tool: view,
            target,
            path: path.join(root, '.github/skills/dude-feature-definition/SKILL.md'),
          });
          state.phase = `spec-${suffix}-skill`;
          answerModel(res, body, toolCall(callId, view, {
            path: path.join(root, '.github/skills/dude-feature-definition/SKILL.md'),
          }), 'tool_calls');
          return;
        }
        if (state.phase === `spec-${suffix}-skill`) {
          assert.equal(lastId, `call_t012_spec_read_skill_${suffix}`);
          assert.ok(toolMessageText(body, lastId).includes('## Brainstorm'));
          const view = requireToolSchema(body, 'view', ['path']);
          const callId = `call_t012_spec_view_${sourceVersion.toLowerCase()}_for_${suffix}`;
          state.ownerExecution.push({
            owner: 'Spec Lead',
            callId,
            tool: view,
            path: path.join(root, ...MOCK_PATH.split('/')),
          });
          state.phase = `spec-${suffix}-view-before`;
          answerModel(res, body, toolCall(callId, view, {
            path: path.join(root, ...MOCK_PATH.split('/')),
          }), 'tool_calls');
          return;
        }
        if (state.phase === `spec-${suffix}-view-before`) {
          assert.equal(lastId, `call_t012_spec_view_${sourceVersion.toLowerCase()}_for_${suffix}`);
          const before = toolMessageText(body, lastId);
          assert.ok(before.includes(`Installed canonical mock ${sourceVersion}`));
          assert.ok(before.includes(`Revision ${sourceVersion} review target.`));
          const edit = requireToolSchema(body, 'edit', ['path']);
          const callId = `call_t012_spec_edit_${suffix}`;
          state.ownerExecution.push({
            owner: 'Spec Lead',
            callId,
            tool: edit,
            path: path.join(root, ...MOCK_PATH.split('/')),
            beforeRevision: state.revisions[sourceVersion].artifact.revision,
            afterRevision: state.revisions[target].artifact.revision,
          });
          state.phase = `spec-${suffix}-edit`;
          answerModel(res, body, toolCall(callId, edit, {
            path: path.join(root, ...MOCK_PATH.split('/')),
            old_str: renderMock(sourceVersion).toString('utf8'),
            new_str: renderMock(target).toString('utf8'),
          }), 'tool_calls');
          return;
        }
        if (state.phase === `spec-${suffix}-edit`) {
          assert.equal(lastId, `call_t012_spec_edit_${suffix}`);
          const editResult = toolMessageText(body, lastId);
          assert.doesNotMatch(editResult, /\b(?:error|denied|failed)\b/i);
          const view = requireToolSchema(body, 'view', ['path']);
          const callId = `call_t012_spec_read_${suffix}`;
          state.ownerExecution.push({
            owner: 'Spec Lead',
            callId,
            tool: view,
            path: path.join(root, ...MOCK_PATH.split('/')),
          });
          state.phase = `spec-${suffix}-view-after`;
          answerModel(res, body, toolCall(callId, view, {
            path: path.join(root, ...MOCK_PATH.split('/')),
          }), 'tool_calls');
          return;
        }
        assert.equal(state.phase, `spec-${suffix}-view-after`);
        assert.equal(lastId, `call_t012_spec_read_${suffix}`);
        const after = toolMessageText(body, lastId);
        assert.ok(after.includes(`Installed canonical mock ${target}`));
        assert.ok(after.includes(`Revision ${target} review target.`));
        state.phase = `await-parent-${suffix}`;
        answerModel(res, body, {
          role: 'assistant',
          content: JSON.stringify({
            status: 'revised',
            owner: 'Spec Lead',
            path: MOCK_PATH,
            from: state.revisions[sourceVersion].artifact.revision,
            to: state.revisions[target].artifact.revision,
          }),
        }, 'stop');
        return;
      }

      const offered = offeredDudeTool(body);
      state.toolName = offered.name;
      state.offeredTools = offered.offered;
      if (state.phase === 'initial') {
        state.phase = 'waiting-a';
        answerModel(res, body, toolCall('call_t012_review_a', offered.name, {
          op: 'request',
          request: request('A'),
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'waiting-a') {
        assert.equal(lastId, 'call_t012_review_a');
        checkRound(body, 'A', lastId);
        const skill = requireToolSchema(body, 'skill', ['skill']);
        const callId = 'call_t012_dude_skill_b';
        state.ownerExecution.push({
          owner: 'Dude',
          callId,
          tool: skill,
          target: 'B',
          reportRevision: state.rounds.find((round) => round.version === 'A').reportRevision,
        });
        state.phase = 'dude-skill-b';
        answerModel(res, body, toolCall(
          callId,
          skill,
          { skill: 'dude-feature-definition' },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'dude-skill-b') {
        assert.equal(lastId, 'call_t012_dude_skill_b');
        const task = requireToolSchema(body, 'task', ['name', 'prompt', 'agent_type', 'description']);
        const callId = 'call_t012_delegate_b';
        state.ownerExecution.push({
          owner: 'Dude',
          callId,
          tool: task,
          delegate: 'Spec Lead',
          from: 'A',
          to: 'B',
          reportRevision: state.rounds.find((round) => round.version === 'A').reportRevision,
        });
        state.phase = 'delegate-b';
        answerModel(res, body, toolCall(callId, task, {
            name: 't012-design-owner-b',
            description: 'Revise exact mock B',
            agent_type: 'Spec Lead',
            mode: 'sync',
            model: 'gpt-4.1',
            prompt: [
              'Apply the received installed Review feedback through your actual owner tools.',
              `Read exactly ${path.join(root, ...MOCK_PATH.split('/'))}.`,
              'Replace the complete exact revision A document with the complete exact revision B document below.',
              'Reread the same canonical file and return the before/after revision evidence.',
              'Do not edit any other file, approval, product UI, task, or workflow metadata.',
              'The exact semantic report from the original waiter follows:',
              ownerReports.get('A'),
              'The owner-produced successor document follows:',
              renderMock('B').toString('utf8'),
            ].join('\n'),
          }), 'tool_calls');
        return;
      }
      if (state.phase === 'await-parent-b') {
        assert.equal(lastId, 'call_t012_delegate_b');
        const ownerResult = toolMessageText(body, lastId);
        assert.ok(ownerResult.includes(state.revisions.B.artifact.revision));
        state.phase = 'ack-a';
        answerModel(res, body, toolCall(
          'call_t012_ack_a',
          offered.name,
          acknowledgment(state.rounds.find((round) => round.version === 'A'), 'A', state.revisions.B),
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'ack-a') {
        assert.equal(lastId, 'call_t012_ack_a');
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'applied');
        assert.equal(details.receipt.acknowledgment.preview.current.artifact.revision,
          state.revisions.B.artifact.revision);
        state.acknowledgments.push({
          version: 'A',
          toolCallId: lastId,
          sessionId: details.receipt.sessionId,
          receiptId: details.receipt.receiptId,
          currentRevision: details.receipt.acknowledgment.preview.current.artifact.revision,
        });
        state.phase = 'waiting-b';
        answerModel(res, body, toolCall('call_t012_review_b', offered.name, {
          op: 'request',
          request: request('B'),
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'waiting-b') {
        assert.equal(lastId, 'call_t012_review_b');
        checkRound(body, 'B', lastId);
        const skill = requireToolSchema(body, 'skill', ['skill']);
        const callId = 'call_t012_dude_skill_c';
        state.ownerExecution.push({
          owner: 'Dude',
          callId,
          tool: skill,
          target: 'C',
          reportRevision: state.rounds.find((round) => round.version === 'B').reportRevision,
        });
        state.phase = 'dude-skill-c';
        answerModel(res, body, toolCall(
          callId,
          skill,
          { skill: 'dude-feature-definition' },
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'dude-skill-c') {
        assert.equal(lastId, 'call_t012_dude_skill_c');
        const task = requireToolSchema(body, 'task', ['name', 'prompt', 'agent_type', 'description']);
        const callId = 'call_t012_delegate_c';
        state.ownerExecution.push({
          owner: 'Dude',
          callId,
          tool: task,
          delegate: 'Spec Lead',
          from: 'B',
          to: 'C',
          reportRevision: state.rounds.find((round) => round.version === 'B').reportRevision,
        });
        state.phase = 'delegate-c';
        answerModel(res, body, toolCall(callId, task, {
            name: 't012-design-owner-c',
            description: 'Revise exact mock C',
            agent_type: 'Spec Lead',
            mode: 'sync',
            model: 'gpt-4.1',
            prompt: [
              'Apply the received installed Review feedback through your actual owner tools.',
              `Read exactly ${path.join(root, ...MOCK_PATH.split('/'))}.`,
              'Replace the complete exact revision B document with the complete exact revision C document below.',
              'Reread the same canonical file and return the before/after revision evidence.',
              'Do not edit any other file, approval, product UI, task, or workflow metadata.',
              'The exact semantic report from the original waiter follows:',
              ownerReports.get('B'),
              'The owner-produced successor document follows:',
              renderMock('C').toString('utf8'),
            ].join('\n'),
          }), 'tool_calls');
        return;
      }
      if (state.phase === 'await-parent-c') {
        assert.equal(lastId, 'call_t012_delegate_c');
        const ownerResult = toolMessageText(body, lastId);
        assert.ok(ownerResult.includes(state.revisions.C.artifact.revision));
        state.phase = 'ack-b';
        answerModel(res, body, toolCall(
          'call_t012_ack_b',
          offered.name,
          acknowledgment(state.rounds.find((round) => round.version === 'B'), 'B', state.revisions.C),
        ), 'tool_calls');
        return;
      }
      if (state.phase === 'ack-b') {
        assert.equal(lastId, 'call_t012_ack_b');
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'applied');
        assert.equal(details.receipt.acknowledgment.preview.current.artifact.revision,
          state.revisions.C.artifact.revision);
        state.acknowledgments.push({
          version: 'B',
          toolCallId: lastId,
          sessionId: details.receipt.sessionId,
          receiptId: details.receipt.receiptId,
          currentRevision: details.receipt.acknowledgment.preview.current.artifact.revision,
        });
        state.phase = 'waiting-c';
        answerModel(res, body, toolCall('call_t012_review_c', offered.name, {
          op: 'request',
          request: request('C'),
        }), 'tool_calls');
        return;
      }
      if (state.phase === 'waiting-c') {
        assert.equal(lastId, 'call_t012_review_c');
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'awaiting_acknowledgment');
        assert.equal(details.response.action, 'approve');
        assert.equal(details.response.artifactRevision, state.revisions.C.artifact.revision);
        assert.deepEqual(
          pngsInModelRequest(body).map((bytes) => sha256(bytes)).sort(),
          state.rounds.map((round) => round.imageRevision.slice('sha256:'.length)).sort(),
          'explicit approval adds no image; only the two prior immutable feedback images remain in history',
        );
        state.phase = 'ack-c';
        answerModel(res, body, toolCall(
          'call_t012_ack_c',
          offered.name,
          acknowledgment({ receipt: details.receipt }, 'C', state.revisions.C),
        ), 'tool_calls');
        return;
      }
      assert.equal(state.phase, 'ack-c');
      assert.equal(lastId, 'call_t012_ack_c');
      const details = toolDetails(body, lastId);
      assert.equal(details.status, 'applied');
      assert.equal(details.receipt.acknowledgment.preview.current.artifact.revision,
        state.revisions.C.artifact.revision);
      state.acknowledgments.push({
        version: 'C',
        toolCallId: lastId,
        sessionId: details.receipt.sessionId,
        receiptId: details.receipt.receiptId,
        currentRevision: details.receipt.acknowledgment.preview.current.artifact.revision,
      });
      state.phase = 'complete';
      answerModel(res, body, {
        role: 'assistant',
        content: 'T012_INSTALLED_REVIEW_COMPLETE',
      }, 'stop');
    } catch (error) {
      state.modelError = safeError(error);
      note('review-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 Review fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state };
}

function sessionRequest(kind, overrides = {}) {
  const fields = kind === 'permission'
    ? {
      operation: 'fixture_cleanup',
      targets: [{ target: 'fixture-marker', revision: 'marker-v1' }],
      consequences: 'Only the named disposable marker would be eligible.',
      eligibility: 'The marker is intentionally absent; Canvas must execute nothing.',
      confirmation: 'I permit exactly fixture-marker at marker-v1.',
    }
    : { input: { kind: 'text' } };
  return {
    owner: 'dude',
    requestRef: `t012-${kind}`,
    scope: { kind: 'session' },
    source: { kind: 'session', revision: `t012-${kind}-source` },
    revision: `t012-${kind}-request`,
    class: kind,
    prompt: `T012 installed ${kind} control`,
    whyHuman: 'This synthetic control requires one exact human response.',
    unblocks: 'Only the current owner can evaluate the response.',
    blocking: true,
    fields,
    ...overrides,
  };
}

function createControlsModel() {
  const state = {
    requests: 0,
    issued: [],
    permissionResult: null,
    cancellationResult: null,
    outsideResult: null,
    modelError: null,
  };
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 12, 'installed controls model request bound exceeded');
      const offered = offeredDudeTool(body);
      const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
      const prompt = contentText(lastUser?.content);
      const lastTool = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'tool');
      const lastId = lastTool?.tool_call_id ?? null;

      if (lastId === 'call_t012_permission') {
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'awaiting_acknowledgment');
        assert.equal(details.response.action, 'consent');
        assert.equal(details.response.confirmation, 'I permit exactly fixture-marker at marker-v1.');
        assert.deepEqual(details.response.targets, [{ target: 'fixture-marker', revision: 'marker-v1' }]);
        state.permissionResult = {
          receipt: details.receipt,
          response: details.response,
        };
        answerModel(res, body, {
          role: 'assistant',
          content: 'T012_PERMISSION_DELIVERED_WITHOUT_ACK',
        }, 'stop');
        return;
      }
      if (lastId === 'call_t012_cancel') {
        const details = toolDetails(body, lastId);
        state.cancellationResult = details;
        answerModel(res, body, {
          role: 'assistant',
          content: 'T012_CANCEL_RESULT_OBSERVED',
        }, 'stop');
        return;
      }
      if (lastId === 'call_t012_outside') {
        const details = toolDetails(body, lastId);
        assert.equal(details.status, 'outside_input_available');
        assert.equal(details.acceptedAnswer, false);
        assert.equal(details.response, null);
        state.outsideResult = details;
        answerModel(res, body, {
          role: 'assistant',
          content: 'T012_OUTSIDE_NONANSWER_OBSERVED',
        }, 'stop');
        return;
      }
      if (prompt.includes('T012_PERMISSION_START')) {
        assert.equal(state.issued.includes('permission'), false);
        state.issued.push('permission');
        answerModel(res, body, toolCall('call_t012_permission', offered.name, {
          op: 'request',
          request: sessionRequest('permission'),
        }), 'tool_calls');
        return;
      }
      if (prompt.includes('T012_CANCEL_START')) {
        assert.equal(state.issued.includes('cancel'), false);
        state.issued.push('cancel');
        answerModel(res, body, toolCall('call_t012_cancel', offered.name, {
          op: 'request',
          request: sessionRequest('fact', {
            requestRef: 't012-cancel',
            revision: 't012-cancel-request',
            source: { kind: 'session', revision: 't012-cancel-source' },
            prompt: 'T012 installed cancellation control',
          }),
        }), 'tool_calls');
        return;
      }
      if (prompt.includes('T012_OUTSIDE_START')) {
        assert.equal(state.issued.includes('outside'), false);
        state.issued.push('outside');
        answerModel(res, body, toolCall('call_t012_outside', offered.name, {
          op: 'request',
          request: sessionRequest('fact', {
            requestRef: 't012-outside',
            revision: 't012-outside-request',
            source: { kind: 'session', revision: 't012-outside-source' },
            prompt: 'T012 installed outside-input control',
          }),
        }), 'tool_calls');
        return;
      }
      answerModel(res, body, {
        role: 'assistant',
        content: prompt.includes('T012_OUTSIDE_ANSWER')
          ? 'T012_OUTSIDE_MESSAGE_PRESERVED'
          : 'T012_CONTROLS_IDLE',
      }, 'stop');
    } catch (error) {
      state.modelError = safeError(error);
      note('controls-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 controls fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state };
}

function createUncertainCaptureModel() {
  const state = {
    phase: 'bootstrap',
    requests: 0,
    capturePromptRequests: 0,
    modelError: null,
  };
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= MAX_MODEL_BODY);
      }
      const body = JSON.parse(raw);
      state.requests += 1;
      assert.ok(state.requests <= 32, 'uncertain-capture model request bound exceeded');
      offeredDudeTool(body);
      const lastUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
      const prompt = contentText(lastUser?.content);
      if (prompt.includes('Dude Canvas explicit idea intake in this joined workspace/session.')) {
        state.capturePromptRequests += 1;
        state.phase = 'provider-failed-after-receipt';
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Synthetic provider loss after one capture receipt.' } }));
        return;
      }
      state.phase = 'idle';
      answerModel(res, body, {
        role: 'assistant',
        content: 'T012_UNCERTAIN_CAPTURE_IDLE',
      }, 'stop');
    } catch (error) {
      state.modelError = safeError(error);
      note('uncertain-model-refusal', { error: state.modelError });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bounded T012 uncertain fixture refused request' } }));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return { server, state };
}

class Cdp {
  /** @param {string} url */
  constructor(url) {
    this.socket = new WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  /** @param {string} method @param {Record<string,unknown>} [params] */
  send(method, params = {}) {
    const id = this.next++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, 45_000);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  /** @param {string} method @param {(value:any)=>void} listener @returns {()=>void} */
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  close() {
    this.socket.close();
  }
}

/** @param {Cdp} page @param {string} expression */
async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function startBrowser() {
  const profile = fs.realpathSync(fs.mkdtempSync(path.join(RUN, 'ui-browser-profile-')));
  const browser = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let launchError;
  browser.stderr.on('data', (value) => { stderr += String(value); });
  browser.once('error', (error) => { launchError = error; });
  try {
    const port = await until(() => {
      if (launchError) throw launchError;
      if (browser.exitCode !== null || browser.signalCode !== null) {
        throw new Error(`owned browser exited before CDP startup: ${stderr.slice(-2_000)}`);
      }
      const active = path.join(profile, 'DevToolsActivePort');
      if (!fs.existsSync(active)) return null;
      const first = fs.readFileSync(active, 'utf8').split(/\r?\n/)[0];
      return /^\d+$/.test(first) ? Number(first) : null;
    }, 'owned UI browser startup');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    })).json();
    const page = new Cdp(target.webSocketDebuggerUrl);
    await page.open();
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('Network.enable'),
      page.send('Accessibility.enable'),
    ]);
    return { browser, page, profile, version };
  } catch (error) {
    if (browser.pid && browser.exitCode === null) process.kill(browser.pid, 'SIGKILL');
    throw error;
  }
}

/** @param {ReturnType<typeof spawn>} browser */
async function stopBrowser(browser) {
  const exited = () => browser.exitCode !== null || browser.signalCode !== null;
  if (!browser.pid || exited()) return;
  process.kill(browser.pid, 'SIGTERM');
  try {
    await until(exited, 'owned UI browser exit', 3_000);
  } catch {
    if (!exited()) process.kill(browser.pid, 'SIGKILL');
    await until(exited, 'owned UI browser exit after SIGKILL', 3_000);
  }
}

function button(text) {
  return `[...document.querySelectorAll('button')].find((node) =>
    node.innerText.trim() === ${JSON.stringify(text)} && node.getClientRects().length)`;
}

function field(label) {
  return `(() => {
    const label = [...document.querySelectorAll('label')].find((node) =>
      node.textContent.trim() === ${JSON.stringify(label)});
    return label && document.getElementById(label.htmlFor);
  })()`;
}

/** @param {Cdp} page */
async function openReviewDetails(page) {
  const surface = `document.querySelector('.fui-PopoverSurface[aria-label="Notes and more"]')`;
  if (!await evaluate(page, `Boolean(${surface}?.getClientRects().length)`)) {
    await click(page, button('Notes and more'));
  }
  await until(
    () => evaluate(page, `Boolean(${surface}?.getClientRects().length)`),
    'installed Notes and more disclosure',
  );
}

/** Dismiss the real disclosure before pointer work on the palette/viewport.
 * @param {Cdp} page
 */
async function closeReviewDetails(page) {
  const snapshot = () => evaluate(page, `(() => {
    const surface = document.querySelector('.fui-PopoverSurface[aria-label="Notes and more"]');
    const select = document.querySelector('[data-review-tools] [aria-label="Select (V)"]');
    const rect = select?.getBoundingClientRect();
    const hit = rect && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {open:Boolean(surface?.getClientRects().length),
      selectExists:Boolean(select), selectDisabled:select?.disabled ?? null,
      selectHit:Boolean(hit && (hit === select || select.contains(hit))),
      hitLabel:hit?.closest('[aria-label]')?.getAttribute('aria-label') ?? null};
  })()`);
  const before = await snapshot();
  if (before.open) {
    await click(page, button('Notes and more'));
    await until(async () => !(await snapshot()).open, 'installed Notes and more disclosure exit');
  }
  return { before, after: await snapshot() };
}

/** @param {Cdp} page @param {string} expression */
async function click(page, expression) {
  await until(() => evaluate(page, `Boolean(${expression})`), `rendered target ${expression}`);
  await evaluate(page, `(${expression}).scrollIntoView({block:'nearest',inline:'nearest'})`);
  let prior;
  const point = await until(async () => {
    const next = await evaluate(page, `(() => {
      const node = ${expression};
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {x,y,width:rect.width,height:rect.height,
        disabled:node.matches(':disabled,[aria-disabled="true"]'),
        hit:Boolean(hit && (hit === node || node.contains(hit)))};
    })()`);
    const stable = next?.hit && !next.disabled && next.width >= 24 && next.height >= 24
      && prior?.x === next.x && prior?.y === next.y;
    prior = next;
    return stable ? next : null;
  }, `stable enabled target ${expression}`);
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

/** @param {Cdp} page @param {string} expression @param {string} value */
async function fill(page, expression, value) {
  await until(() => evaluate(page, `Boolean(${expression} && !${expression}.disabled)`),
    `enabled field ${expression}`);
  await evaluate(page, `(() => { const node=${expression}; node.focus(); node.select?.(); })()`);
  await page.send('Input.insertText', { text: value });
}

/** @param {Cdp} page @param {string} label @param {string} option */
async function choose(page, label, option) {
  await click(page, field(label));
  await click(page, `[...document.querySelectorAll('[role=option]')].find((node) =>
    node.textContent.trim() === ${JSON.stringify(option)} && node.getClientRects().length)`);
}

/** Two animation frames, so a rendered result is read after the engine painted it. */
function settle(page) {
  return evaluate(page,
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

/** @param {Cdp} page @param {string} key @param {string} [code] @param {number} [modifiers] */
async function pressKey(page, key, code = key, modifiers = 0) {
  const virtual = {
    Enter: 13, Tab: 9, Escape: 27, Home: 36, End: 35, PageDown: 34,
    ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39,
  }[key] ?? 0;
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
    ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
  });
}

/**
 * @param {Cdp} page
 * @param {number} width
 * @param {'light'|'dark'} theme
 * @param {number} [height]
 * @param {number} [deviceScaleFactor]
 */
async function installedViewport(page, width, theme, height = 900, deviceScaleFactor = 1) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  await until(() => evaluate(page, `innerWidth === ${width}
    && devicePixelRatio === ${deviceScaleFactor}
    && matchMedia('(prefers-color-scheme: dark)').matches === ${theme === 'dark'}`),
  `installed ${width}px ${theme} viewport`);
  await until(() => evaluate(page, `document.getAnimations()
    .filter((animation) => animation.playState === 'running').length === 0`),
  `installed ${width}px ${theme} settled paint`);
  await settle(page);
}

/**
 * Persist and assert the installed renderer's screenshot, AX tree, geometry,
 * target sizes, and computed text contrast.
 * @param {Cdp} page
 * @param {string} name
 * @param {string[]} [expectedAxNames]
 */
async function auditInstalledWorkspace(page, name, expectedAxNames = []) {
  await until(() => evaluate(page, `document.getAnimations()
    .filter((animation) => animation.playState === 'running').length === 0`),
  `${name} settled paint`);
  await settle(page);
  const image = await screenshot(page, name);
  const tree = await page.send('Accessibility.getFullAXTree');
  const axPath = path.join(RUN, `${name}.ax.json`);
  fs.writeFileSync(axPath, `${JSON.stringify(tree, null, 2)}\n`);
  const namedRoles = new Set([
    'button', 'checkbox', 'combobox', 'listbox', 'option', 'radio',
    'radiogroup', 'tab', 'tabpanel', 'textbox', 'toolbar',
  ]);
  const unnamed = tree.nodes.filter((node) => (
    !node.ignored && namedRoles.has(node.role?.value) && !node.name?.value
  )).map((node) => ({ nodeId: node.nodeId, role: node.role?.value }));
  assert.deepEqual(unnamed, [], `${name}: every interactive AX widget has a name`);
  for (const expected of expectedAxNames) {
    assert.equal(tree.nodes.some((node) => (
      !node.ignored && String(node.name?.value ?? '').includes(expected)
    )), true, `${name}: AX tree contains ${expected}`);
  }

  const geometry = await evaluate(page, `(() => {
    const clientWidth = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll(
      'button:not(:disabled):not([aria-disabled="true"]),'
      + 'input:not(:disabled),textarea:not(:disabled),'
      + '[role=tab],[data-work-path],[data-task-key],[data-task-filter]'
    )].filter((node) => node.getClientRects().length).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 120)
          || node.getAttribute('name') || node.tagName,
        x: rect.x,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    });
    const frame = document.querySelector('.fui-FluentProvider > div')?.getBoundingClientRect();
    return {
      innerWidth,
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      frame: frame?.toJSON(),
      controls,
      activeElement: {
        tag: document.activeElement?.tagName ?? null,
        name: document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.textContent?.trim().slice(0, 120) || null,
      },
    };
  })()`);
  const geometryPath = path.join(RUN, `${name}.geometry.json`);
  fs.writeFileSync(geometryPath, `${JSON.stringify(geometry, null, 2)}\n`);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${name}: no page horizontal overflow`);
  assert.ok(geometry.bodyScrollWidth <= geometry.clientWidth + 1, `${name}: body fits viewport`);
  assert.ok(Math.abs(geometry.frame.x) <= 1 && geometry.frame.right <= geometry.clientWidth + 1,
    `${name}: application frame fits viewport`);
  assert.deepEqual(
    geometry.controls.filter((control) => control.width < 24 || control.height < 24),
    [],
    `${name}: active interaction targets are at least 24 by 24 CSS pixels`,
  );
  assert.deepEqual(
    geometry.controls.filter((control) => control.x < -1 || control.right > geometry.clientWidth + 1),
    [],
    `${name}: active interaction targets are not horizontally clipped`,
  );

  const contrast = await evaluate(page, `(() => {
    const channels = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
    const composite = (top, bottom) => {
      const alpha = top[3] === undefined ? 1 : top[3];
      return top.slice(0, 3).map((value, index) => value * alpha + bottom[index] * (1 - alpha));
    };
    const background = (element) => {
      let result = [255, 255, 255];
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const value = channels(getComputedStyle(node).backgroundColor);
        if (value.length >= 3 && (value[3] ?? 1) > 0) layers.push(value);
      }
      for (const layer of layers.reverse()) result = composite(layer, result);
      return result;
    };
    const luminance = (rgb) => rgb.map((value) => value / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return [...document.querySelectorAll(
      'h1,h2,h3,p,label,button:not(:disabled):not([aria-disabled="true"]),'
      + '[role=tab],[data-work-number],[data-task-key],[data-task-detail]'
    )].filter((node) => node.getClientRects().length && node.textContent.trim()).map((node) => {
      const style = getComputedStyle(node);
      const foreground = channels(style.color);
      const bg = background(node);
      const light = Math.max(luminance(foreground), luminance(bg));
      const dark = Math.min(luminance(foreground), luminance(bg));
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      return {
        text: node.textContent.trim().slice(0, 120),
        foreground: style.color,
        background: 'rgb(' + bg.join(', ') + ')',
        ratio: (light + .05) / (dark + .05),
        threshold,
      };
    });
  })()`);
  const contrastPath = path.join(RUN, `${name}.contrast.json`);
  fs.writeFileSync(contrastPath, `${JSON.stringify(contrast, null, 2)}\n`);
  assert.ok(contrast.length > 0, `${name}: contrast audit found rendered text`);
  assert.deepEqual(
    contrast.filter((sample) => sample.ratio + 0.001 < sample.threshold),
    [],
    `${name}: rendered active text meets WCAG contrast`,
  );
  return {
    name,
    screenshot: image,
    ax: { path: axPath, sha256: sha256(fs.readFileSync(axPath)), nodes: tree.nodes.length },
    geometry: {
      path: geometryPath,
      sha256: sha256(fs.readFileSync(geometryPath)),
      controls: geometry.controls.length,
      usableViewport: geometry.clientWidth,
      activeElement: geometry.activeElement,
    },
    contrast: {
      path: contrastPath,
      sha256: sha256(fs.readFileSync(contrastPath)),
      samples: contrast.length,
      minimum: Math.min(...contrast.map((sample) => sample.ratio)),
    },
  };
}

/** Text within this many CSS pixels of a clipping edge counts as inside, as in the audits above. */
const READING_EDGE_TOLERANCE = 1;

/**
 * The selected instruction as a reader sees it. One DOM Range over the unit's
 * single text node yields every rendered line. Each line is clipped by every
 * ancestor whose overflow is not visible, the layout viewport, and the visual
 * viewport, which is narrower than the layout viewport at page scale. The
 * middle of its unclipped part is hit-tested in layout-viewport coordinates, as
 * Edge's elementFromPoint expects, so covered text does not count. The
 * expression first waits until scroll positions hold still for two frames.
 * @param {string} taskKey
 * @param {Record<string,[number,number]>} passages named [start, end) offsets
 */
function instructionView(taskKey, passages) {
  return `(async () => {
    const host = document.querySelector('[data-task-instruction="${taskKey}"]');
    const text = host?.firstChild;
    if (!host || host.childNodes.length !== 1 || text.nodeType !== Node.TEXT_NODE) return null;
    const clippers = [];
    for (let node = host; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node === document.documentElement || style.overflowX !== 'visible'
        || style.overflowY !== 'visible') clippers.push(node);
    }
    const positions = () => JSON.stringify([visualViewport.offsetLeft, visualViewport.offsetTop,
      visualViewport.scale, clippers.map((node) => [node.scrollLeft, node.scrollTop])]);
    let last = positions();
    let still = 0;
    for (let frame = 0; frame < 120 && still < 2; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const next = positions();
      still = next === last ? still + 1 : 0;
      last = next;
    }
    if (still < 2) throw new Error('instruction scroll positions did not settle within 120 frames');
    const viewport = visualViewport;
    let clip = { left: viewport.offsetLeft, top: viewport.offsetTop,
      right: viewport.offsetLeft + viewport.width, bottom: viewport.offsetTop + viewport.height };
    const scrollers = clippers.map((node) => {
      const box = node.getBoundingClientRect();
      const left = box.left + node.clientLeft;
      const top = box.top + node.clientTop;
      const edges = [left, top, left + node.clientWidth, top + node.clientHeight];
      clip = { left: Math.max(clip.left, edges[0]), top: Math.max(clip.top, edges[1]),
        right: Math.min(clip.right, edges[2]), bottom: Math.min(clip.bottom, edges[3]) };
      return { element: node === host ? 'instruction' : node.tagName.toLowerCase(), edges,
        scrollLeft: node.scrollLeft, scrollTop: node.scrollTop,
        clientHeight: node.clientHeight, scrollHeight: node.scrollHeight };
    });
    const lines = (start, end) => {
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      const merged = [];
      for (const rect of range.getClientRects()) {
        if (rect.width < 0.5 || rect.height < 0.5) continue;
        const line = merged.find((entry) => Math.abs(entry[1] - rect.top) < 0.5
          && Math.abs(entry[3] - rect.bottom) < 0.5);
        if (line) {
          line[0] = Math.min(line[0], rect.left);
          line[2] = Math.max(line[2], rect.right);
        } else merged.push([rect.left, rect.top, rect.right, rect.bottom]);
      }
      return merged.map(([left, top, right, bottom]) => {
        const inside = top >= clip.top - ${READING_EDGE_TOLERANCE}
          && bottom <= clip.bottom + ${READING_EDGE_TOLERANCE};
        const from = Math.max(left, clip.left);
        const to = Math.min(right, clip.right);
        let hit = null;
        if (inside && to - from >= 1) {
          const target = document.elementFromPoint((from + to) / 2, (top + bottom) / 2);
          hit = Boolean(target && host.contains(target));
        }
        return { left, top, right, bottom, inside, hit, visible: inside && hit ? [from, to] : null };
      });
    };
    const active = document.activeElement;
    return {
      visualViewport: { scale: viewport.scale, offsetLeft: viewport.offsetLeft,
        offsetTop: viewport.offsetTop, width: viewport.width, height: viewport.height },
      clip,
      scrollers,
      focus: active === host ? 'instruction'
        : active?.matches('[data-task-detail]') ? 'detail'
          : active?.getAttribute('aria-label') || active?.tagName || null,
      unit: lines(0, text.length),
      passages: Object.fromEntries(Object.entries(${JSON.stringify(passages)})
        .map(([name, [start, end]]) => [name, lines(start, end)])),
    };
  })()`;
}

/** @param {{top:number,bottom:number}} line @param {{clip:{top:number,bottom:number}}} view */
function lineScrollKey(line, view) {
  if (line.top < view.clip.top - READING_EDGE_TOLERANCE) return 'ArrowUp';
  if (line.bottom > view.clip.bottom + READING_EDGE_TOLERANCE) return 'ArrowDown';
  return null;
}

/** @param {{visualViewport:Record<string,number>,scrollers:Record<string,number>[]}} view */
function readingPosition(view) {
  return JSON.stringify([view.visualViewport.offsetLeft, view.visualViewport.offsetTop,
    view.scrollers.map((scroller) => [scroller.scrollLeft, scroller.scrollTop])]);
}

/**
 * Merge the unclipped spans recorded for one line across reading positions.
 * @param {{left:number,right:number}} line @param {[number,number][]} spans
 */
function lineCoverage(line, spans) {
  const merged = [];
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && from <= previous[1] + READING_EDGE_TOLERANCE) previous[1] = Math.max(previous[1], to);
    else merged.push([from, to]);
  }
  return {
    covered: merged.some(([from, to]) => from <= line.left + READING_EDGE_TOLERANCE
      && to >= line.right - READING_EDGE_TOLERANCE),
    spans: merged,
  };
}

/**
 * Read the selected instruction with the keyboard at the current viewport.
 * Tab/Shift+Tab reach its row and Enter re-opens it; the product focuses and
 * scrolls the detail. In the dock the instruction is its own focusable scroll
 * region, so Tab moves into it. Arrow keys then move from the unit's first line
 * to its last. When lines are wider than the visible band (page scale), that
 * downward pass is followed by ArrowRight panning and an upward pass. Every
 * rendered line must be unclipped and unobscured at some recorded position; the
 * named passages are captured where they are in view, the start through the
 * existing audit. A passage that fits the band must be readable at once.
 * @param {Cdp} page
 * @param {string} name
 * @param {string} taskKey
 * @param {Record<string,[number,number]>} passages
 * @param {string[]} expectedAxNames
 */
async function readSelectedInstruction(page, name, taskKey, passages, expectedAxNames) {
  const view = () => evaluate(page, instructionView(taskKey, passages));
  const keys = [];
  const press = async (key, shift = false) => {
    assert.ok(keys.length < 400, `${name}: keyboard reading stays bounded`);
    await pressKey(page, key, key, shift ? 8 : 0);
    keys.push(shift ? `Shift+${key}` : key);
  };
  const beforeReveal = await view();
  assert.ok(beforeReveal, `${name}: the selected instruction is one rendered text node`);
  for (;;) {
    const where = await evaluate(page, `(() => {
      const row = document.querySelector('[data-task-key="${taskKey}"]');
      if (row === document.activeElement) return 'row';
      return row.compareDocumentPosition(document.activeElement) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'after' : 'before';
    })()`);
    if (where === 'row') break;
    await press('Tab', where === 'after');
  }
  await press('Enter');
  await until(() => evaluate(page, `document.activeElement === document.querySelector(
    '[data-task-detail="${taskKey}"]')`), `${name}: Enter focuses the selected task detail`);
  while (await evaluate(page, `(() => {
    const node = document.querySelector('[data-task-instruction="${taskKey}"]');
    return node.tabIndex === 0 && node !== document.activeElement;
  })()`)) await press('Tab');

  let current = await view();
  const reference = current;
  const groups = () => [['unit', current.unit], ...Object.entries(current.passages)];
  const seen = Object.fromEntries(groups().map(([group, lines]) => [group, lines.map(() => [])]));
  const steps = [];
  const observe = (key) => {
    for (const [group, lines] of groups()) {
      const expected = group === 'unit' ? reference.unit : reference.passages[group];
      assert.equal(lines.length, expected.length, `${name}: ${group} line layout stays stable`);
      lines.forEach((line, index) => {
        assert.ok(Math.abs(line.left - expected[index].left) < 0.5
          && Math.abs(line.right - expected[index].right) < 0.5,
        `${name}: ${group} line ${index} keeps its horizontal extent`);
        if (line.visible) seen[group][index].push(line.visible);
      });
    }
    assert.ok(['detail', 'instruction'].includes(current.focus),
      `${name}: keyboard focus stays in the selected task detail (${current.focus})`);
    steps.push({ key, position: JSON.parse(readingPosition(current)),
      readableLines: current.unit.filter((line) => line.visible).length });
  };
  const move = async (key) => {
    const before = readingPosition(current);
    await press(key);
    current = await view();
    assert.notEqual(readingPosition(current), before, `${name}: ${key} moves the reading position`);
    observe(key);
  };
  const captures = {};
  let audit = null;
  const capture = async (suffix) => {
    for (const [passage, lines] of Object.entries(current.passages)) {
      const label = `${passage}${suffix}`;
      if (captures[label] || !lines.every((line) => line.inside && line.hit !== false)
        || !lines.some((line) => line.visible)) continue;
      if (label === 'start') audit = await auditInstalledWorkspace(page, name, expectedAxNames);
      captures[label] = {
        keysBefore: keys.length,
        screenshot: label === 'start' ? audit.screenshot : await screenshot(page, `${name}-${label}`),
        view: current,
      };
    }
  };
  observe('reveal');
  for (let key; (key = lineScrollKey(current.unit[0], current));) await move(key);
  for (;;) {
    await capture('');
    if (lineScrollKey(current.unit.at(-1), current) !== 'ArrowDown') break;
    await move('ArrowDown');
  }
  const panned = reference.unit.some((line, index) => !lineCoverage(line, seen.unit[index]).covered);
  if (panned) {
    const rightmost = Math.max(...reference.unit.map((line) => line.right));
    while (current.clip.right < rightmost - READING_EDGE_TOLERANCE) await move('ArrowRight');
    for (;;) {
      await capture('-panned');
      if (lineScrollKey(current.unit[0], current) !== 'ArrowUp') break;
      await move('ArrowUp');
    }
  }
  const coverage = (group, lines) => lines.map((line, index) => ({
    index, extent: [line.left, line.right], ...lineCoverage(line, seen[group][index]),
  }));
  const unit = coverage('unit', reference.unit);
  assert.deepEqual(unit.filter((line) => !line.covered), [],
    `${name}: every rendered line of the selected instruction was readable at a recorded position`);
  const passageResults = {};
  for (const passage of Object.keys(passages)) {
    assert.ok(captures[passage], `${name}: the ${passage} passage was brought into view and captured`);
    const lines = coverage(passage, reference.passages[passage]);
    assert.deepEqual(lines.filter((line) => !line.covered), [],
      `${name}: every line of the ${passage} passage was readable`);
    const at = captures[passage].view;
    const band = at.clip.right - at.clip.left;
    const fitsVisibleBand = reference.passages[passage].every((line) => (
      line.right - line.left <= band + READING_EDGE_TOLERANCE));
    const readableAtOnce = at.passages[passage].every((line) => line.visible
      && line.visible[0] <= line.left + READING_EDGE_TOLERANCE
      && line.visible[1] >= line.right - READING_EDGE_TOLERANCE);
    if (fitsVisibleBand) {
      assert.ok(readableAtOnce, `${name}: the ${passage} passage fits the visible band and is readable at once`);
    }
    passageResults[passage] = { fitsVisibleBand, readableAtOnce, lines,
      captures: Object.keys(captures).filter((label) => label === passage || label === `${passage}-panned`) };
  }
  const keySummary = Object.entries(keys.reduce((counts, key) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }), {}))
    .map(([key, count]) => `${key}x${count}`).join(', ');
  const record = {
    name,
    taskKey,
    edgeTolerance: READING_EDGE_TOLERANCE,
    passages: Object.fromEntries(Object.entries(passages).map(([passage, [start, end]]) => [passage, { start, end }])),
    beforeReveal: {
      focus: beforeReveal.focus,
      startReadable: beforeReveal.passages.start.every((line) => line.visible),
      visualViewport: beforeReveal.visualViewport,
      clip: beforeReveal.clip,
      scrollers: beforeReveal.scrollers,
      start: beforeReveal.passages.start.map(({ visible, ...line }) => line),
    },
    keys,
    keySummary,
    panned,
    steps,
    unitLines: unit.length,
    unit,
    passageResults,
    captures,
  };
  const recordPath = path.join(RUN, `${name}.visibility.json`);
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return {
    keySummary,
    audit: {
      ...audit,
      visibility: {
        path: recordPath,
        sha256: sha256(fs.readFileSync(recordPath)),
        unitLines: unit.length,
        panned,
        keys: keys.length,
        passages: Object.fromEntries(Object.entries(passageResults).map(([passage, result]) => [passage, {
          fitsVisibleBand: result.fitsVisibleBand,
          readableAtOnce: result.readableAtOnce,
          captures: result.captures.map((label) => captures[label].screenshot),
        }])),
      },
    },
  };
}

/** @param {Cdp} page @param {{x:number,y:number}} point */
async function movePointer(page, point) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await settle(page);
}

/**
 * One press, the listed moves, and a release at the last point. An out-and-back
 * gesture is the same call with its origin repeated last.
 * @param {Cdp} page @param {{x:number,y:number}[]} path
 */
async function dragPointer(page, path) {
  const [from, ...rest] = path;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1,
  });
  let previous = from;
  for (const to of rest) {
    for (let step = 1; step <= 4; step += 1) {
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: previous.x + (to.x - previous.x) * step / 4,
        y: previous.y + (to.y - previous.y) * step / 4,
        button: 'left',
        buttons: 1,
      });
    }
    previous = to;
  }
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: previous.x, y: previous.y, button: 'left', buttons: 0, clickCount: 1,
  });
  await settle(page);
}

/** @param {Cdp} page @param {{x:number,y:number}} point @param {number} [clicks] */
async function pressPointer(page, point, clicks = 1) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  for (let clickCount = 1; clickCount <= clicks; clickCount += 1) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount,
    });
  }
  await settle(page);
}

/** @param {Cdp} page @param {string} text */
function visible(page, text) {
  return until(() => evaluate(page, `document.body.innerText.includes(${JSON.stringify(text)})`),
    `visible text ${text}`);
}

/** @param {Cdp} page @param {string} url @param {number} [width] */
async function navigate(page, url, width = 1440) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  await page.send('Page.navigate', { url });
  await until(() => evaluate(page, `document.querySelector('h1')?.textContent === 'Overview'
    && !document.body.innerText.includes('Reading repository state')
    && document.querySelector('footer')?.textContent.includes('Connected')`),
  'installed Canvas application read');
}

/** @param {Cdp} page @param {string} name */
async function screenshot(page, name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  const bytes = Buffer.from(result.data, 'base64');
  const target = path.join(RUN, `${name}.png`);
  fs.writeFileSync(target, bytes);
  return { path: target, bytes: bytes.length, sha256: sha256(bytes) };
}

/** @param {Cdp} page @param {number} width @param {'light'|'dark'} theme @param {number} [scale] */
async function workspaceViewport(page, width, theme, scale = 1) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: scale, mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  await until(() => evaluate(page, `getComputedStyle(document.querySelector('.fui-FluentProvider'))
    .getPropertyValue('--colorNeutralForeground1').trim() === ${JSON.stringify(theme === 'dark' ? '#ffffff' : '#242424')}`),
  `installed ${theme} theme`);
  await settle(page);
}

/**
 * Same rendered geometry, AX-name and WCAG sRGB checks as the existing browser
 * acceptance, scoped here to the installed workspace. Its test-local helpers
 * cannot be imported without running that suite.
 * @param {Cdp} page @param {string} name
 */
async function auditWorkspace(page, name) {
  await until(() => evaluate(page, `document.getAnimations()
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
    .every(animation => ['finished','idle'].includes(animation.playState))`), `${name} settled paint`);
  const image = await screenshot(page, name);
  const tree = await page.send('Accessibility.getFullAXTree');
  write(RUN, `${name}.ax.json`, `${JSON.stringify(tree, null, 2)}\n`);
  const namedRoles = new Set(['button', 'checkbox', 'combobox', 'listbox', 'option', 'radio',
    'radiogroup', 'tab', 'tabpanel', 'textbox', 'toolbar']);
  assert.deepEqual(tree.nodes.filter((node) => !node.ignored && namedRoles.has(node.role?.value)
    && !node.name?.value), [], `${name}: named interactive AX widgets`);
  const geometry = await evaluate(page, `(() => {
    const rect = node => node?.getBoundingClientRect().toJSON() ?? null;
    return {width:innerWidth,clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      frame:rect(document.querySelector('.fui-FluentProvider > div')),
      rail:rect(document.querySelector('[data-navigation-pane]')),
      detail:rect(document.querySelector('[data-task-detail]')),
      dock:rect(document.querySelector('[data-task-detail]')?.closest('aside')),
      active:document.activeElement?.getAttribute('data-task-detail')
        || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
      controls:[...document.querySelectorAll('button,input,textarea,[role=combobox],[role=radio],[data-work-path]')]
        .filter(node => node.getClientRects().length).map(node => ({
          name:node.getAttribute('aria-label') || node.textContent.trim().slice(0,100) || node.tagName,
          ...rect(node),
        }))};
  })()`);
  write(RUN, `${name}.geometry.json`, `${JSON.stringify(geometry, null, 2)}\n`);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1 && geometry.bodyWidth <= geometry.clientWidth + 1,
    `${name}: no page horizontal overflow`);
  assert.ok(Math.abs(geometry.frame.x) <= 1 && geometry.frame.right <= geometry.clientWidth + 1);
  assert.deepEqual(geometry.controls.filter((control) => control.width < 24 || control.height < 24
    || control.x < -1 || control.right > geometry.clientWidth + 1), [], `${name}: usable, unclipped controls`);
  const contrast = await evaluate(page, `(() => {
    const channels = value => (value.match(/[\\d.]+/g) || []).slice(0,4).map(Number);
    const composite = (top,bottom) => top.slice(0,3).map((value,index) =>
      value*(top[3] ?? 1) + bottom[index]*(1-(top[3] ?? 1)));
    const background = element => {
      const layers = [];
      for (let node=element;node;node=node.parentElement) {
        const color=channels(getComputedStyle(node).backgroundColor);
        if (color.length>=3 && (color[3] ?? 1)>0) layers.push(color);
      }
      return layers.reverse().reduce((result,layer) => composite(layer,result),[255,255,255]);
    };
    const luminance = rgb => rgb.slice(0,3).map(value => value/255)
      .map(value => value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4)
      .reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
    return [...document.querySelectorAll('h1,h2,h3,p,label,button:not(:disabled),[role=tab],[data-work-number]')]
      .filter(node => node.getClientRects().length && node.textContent.trim()).map(node => {
        const style=getComputedStyle(node),bg=background(node),fg=channels(style.color);
        const values=[luminance(fg),luminance(bg)].sort((a,b)=>b-a);
        const size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight,10)||400;
        return {text:node.textContent.trim().slice(0,100),foreground:style.color,background:bg,
          ratio:(values[0]+.05)/(values[1]+.05),threshold:size>=24||(size>=18.66&&weight>=700)?3:4.5,
          exemption:node.tagName==='LABEL' && document.getElementById(node.htmlFor)?.disabled
            ? 'inactive control (WCAG 1.4.3)' : null};
      });
  })()`);
  write(RUN, `${name}.contrast.json`, `${JSON.stringify(contrast, null, 2)}\n`);
  assert.ok(contrast.length);
  assert.deepEqual(contrast.filter((sample) => !sample.exemption && sample.ratio + .001 < sample.threshold),
    [], `${name}: computed text contrast`);
  return { name, image, geometry, axNodes: tree.nodes.length, contrastSamples: contrast.length,
    minimumApplicableContrast: Math.min(...contrast.filter((sample) => !sample.exemption).map((sample) => sample.ratio)) };
}

/** @param {Cdp} page */
async function clearWork(page) {
  await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
  await until(() => evaluate(page, `${field('Search work')}?.value === ''
    && ${field('Show')}?.innerText.trim() === 'All'
    && document.activeElement === ${field('Search work')}`), 'installed Clear resets only work discovery');
}

/** @param {Cdp} page @param {string} ideaPath */
async function selectWork(page, ideaPath) {
  const number = path.posix.basename(ideaPath).slice(0, 3);
  await fill(page, field('Search work'), number);
  await until(() => evaluate(page, `Boolean(document.querySelector('[data-work-path="${ideaPath}"]')
    ?.getClientRects().length)`), `installed ${number} discovery`);
  assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Clear work selection"]'))`), false,
    'typing never selects work');
  // A number may also occur in another title (the labelled 062-derived control
  // is one such match). Traverse the real results to the exact path; never
  // mistake the first textual match for the selected record.
  const matches = await evaluate(page, `[...document.querySelectorAll('[data-work-path]')]
    .filter(node => node.getClientRects().length).map(node => node.dataset.workPath)`);
  const visited = [];
  for (let index = 0; index < matches.length; index += 1) {
    await pressKey(page, 'ArrowDown');
    await settle(page);
    const focused = await evaluate(page, `document.activeElement?.closest('[data-work-path]')?.dataset.workPath`);
    visited.push(focused);
    if (focused === ideaPath) break;
  }
  assert.equal(visited.at(-1), ideaPath, `keyboard discovery did not reach ${ideaPath}`);
  note('walkthrough-selection', { query: number, matches, visited, selected: ideaPath });
  await pressKey(page, 'Enter');
  await until(() => evaluate(page, `document.querySelector('h1')?.textContent.trim().startsWith('${number} ')
    && Boolean(document.querySelector('[aria-label="Clear work selection"]'))`), `installed ${number} selected Now`);
}

/** @param {Cdp} page @param {ReturnType<typeof fixtureTaskUnits>[number]} task */
async function inspectTask(page, task) {
  await click(page, `document.querySelector('[data-task-key="${task.taskKey}"]')`);
  await until(() => evaluate(page, `document.activeElement === document.querySelector(
    '[data-task-detail="${task.taskKey}"]')`), `installed ${task.taskKey} detail focus`);
  const detail = await evaluate(page, `(() => {
    const node=document.querySelector('[data-task-detail="${task.taskKey}"]');
    const instruction=node.querySelector('[data-task-instruction]');
    return {text:instruction.textContent,children:instruction.children.length,detail:node.innerText,
      inDock:Boolean(node.closest('aside')),inRow:Boolean(node.closest('li')),
      whiteSpace:getComputedStyle(instruction).whiteSpace};
  })()`);
  assert.equal(detail.text, task.text, `${task.taskKey}: exact full canonical unit, not a summary`);
  assert.equal(detail.children, 0, 'instruction markup stays inert text');
  assert.equal(detail.whiteSpace, 'pre-wrap');
  assert.ok(detail.detail.includes('Not exposed by this source.'));
  assert.ok(detail.detail.includes('Acceptance wording, Done, feature Activity, and design-review history are not task results.'));
  return detail;
}

/** @param {Cdp} page */
function phaseTotals(page) {
  return evaluate(page, `[...document.querySelectorAll('[data-task-phase]')].map(section => ({
    heading:section.dataset.taskPhase,total:[...section.querySelectorAll('*')]
      .find(node => /^\\d+ of \\d+ tasks complete$/.test(node.textContent.trim()))?.textContent.trim()
  }))`);
}

/**
 * Real installed endpoints and rendered controls, no provider/SDK stand-ins.
 * @param {Cdp} page @param {Awaited<ReturnType<typeof createInstalledHost>>} host
 * @param {ReturnType<typeof seedTaskWalkthrough>} fixture @param {any} evidence
 */
async function driveTaskWalkthrough(page, host, fixture, evidence) {
  const [planned, done, mixed] = fixture.records;
  const indexResponse = await fetch(new URL('/api/work-index', host.canvas.url), { signal: AbortSignal.timeout(DEADLINE) });
  assert.equal(indexResponse.status, 200);
  const index = await indexResponse.json();
  assert.equal(index.contexts.length, 62);
  write(RUN, 'walkthrough-work-index.json', `${JSON.stringify(index, null, 2)}\n`);
  // Compare like encodings. A raw multiline needle cannot detect a body leaked
  // into JSON, where newlines and quotes are escaped.
  const containsUnit = (value, text) => JSON.stringify(value).includes(JSON.stringify(text).slice(1, -1));
  for (const record of fixture.records) {
    for (const unit of record.units) {
      assert.equal(containsUnit(index, unit.text), false, 'inventory contains no unselected full body');
      assert.equal(containsUnit({ ...index, leakedInstruction: unit.text }, unit.text), true,
        'the inventory oracle detects a literal multiline-body leak');
    }
    const row = index.items.find((item) => item.ideaPath === record.ideaPath);
    assert.equal(Object.hasOwn(row, 'taskDetails') || Object.hasOwn(row, 'instruction'), false);
    const selected = await postCanvas(host.canvas.url, '/api/refresh', { target: record.ideaPath });
    assert.equal(selected.status, 200);
    const projection = selected.body.projection;
    assert.equal(projection.selected.ideaPath, record.ideaPath);
    assert.equal(projection.taskDetails.coverage.state, 'available');
    assert.equal(projection.taskDetails.resultCoverage, 'not-exposed');
    const counts = { total: record.units.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
    for (const unit of record.units) counts[{ todo: 'open', 'in-progress': 'inProgress', blocked: 'blocked', done: 'done' }[unit.state]] += 1;
    assert.deepEqual(projection.tasks, counts);
    assert.deepEqual(index.items.find((item) => item.ideaPath === record.ideaPath).taskCounts, counts);
    assert.deepEqual(projection.taskDetails.items.map((task) => ({
      taskKey: task.taskKey, state: task.state, deps: task.deps ?? [], blockedBy: task.blockedBy,
      phase: task.phase?.heading ?? null, text: task.instruction.text,
    })), record.units);
    assert.ok(projection.taskDetails.items.every((task) => task.source.contentIdentity === `sha256:${record.fixtureSha256}`));
    const filename = `walkthrough-${record.name}-projection.json`;
    write(RUN, filename, `${JSON.stringify(selected.body, null, 2)}\n`);
    evidence.projections.push({ name: record.name, file: filename, counts, authority: projection.authority,
      phases: projection.phases, resultCoverage: projection.taskDetails.resultCoverage });
    if (record === planned) {
      assert.equal(projection.authority, 'definition');
      assert.equal(projection.next, null);
      assert.deepEqual(projection.taskDetails.items.map((task) => task.readiness.state),
        ['ready', 'waiting', 'waiting', 'waiting', 'waiting']);
    } else if (record === mixed) {
      assert.equal(projection.authority, 'lightweight');
      assert.deepEqual(projection.taskDetails.items.map((task) => task.readiness.state),
        ['not-applicable', 'not-applicable', 'not-applicable', 'ready', 'waiting']);
      assert.equal(projection.blockers.length, 1);
    }
  }
  evidence.inventory = { file: 'walkthrough-work-index.json', contexts: index.contexts.length,
    completeUnitAbsenceAndInjectedLeakChecks: fixture.records.reduce((total, record) => total + record.units.length, 0) };
  assert.equal(await evaluate(page, `document.querySelectorAll('input[type="search"]').length`), 1);
  await selectWork(page, planned.ideaPath);
  await visible(page, 'Planned task definitions; execution has not started.');
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')].map(node => node.dataset.taskKey)`),
    planned.units.map((task) => task.taskKey));
  const totals = await phaseTotals(page);
  assert.deepEqual(totals.map((phase) => phase.total), Array(5).fill('0 of 1 tasks complete'));
  assert.equal(await evaluate(page, `document.querySelectorAll('input[type="search"]').length`), 0);
  await click(page, button('Overview'));
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-work-path]')].map(node => node.dataset.workPath)`),
    [planned.ideaPath]);
  await click(page, button('Now'));
  for (const task of planned.units) await inspectTask(page, task);
  const nextBeforeFilter = await evaluate(page, `document.querySelector('[data-now-next]').innerText`);
  await click(page, `document.querySelector('[data-task-filter="done"]')`);
  await until(() => evaluate(page, `!document.querySelector('[data-task-detail]')
    && !document.querySelector('[data-task-key]')`), 'installed planned Done filter is empty');
  assert.equal(await evaluate(page, `document.activeElement?.dataset.taskFilter`), 'done');
  assert.deepEqual(await phaseTotals(page), totals);
  assert.equal(await evaluate(page, `document.querySelector('[data-now-next]').innerText`), nextBeforeFilter);
  await click(page, `document.querySelector('[data-task-filter="all"]')`);
  await inspectTask(page, planned.units[2]);
  evidence.planned062 = { keys: planned.units.map((task) => task.taskKey), phaseTotals: totals,
    fullUnitsCompared: 5, emptyDoneFilterPreservesNextAndPhases: true };

  // Local input is unfiled and survives task selection, filtering and Clear.
  evidence.newIdeaDraft = '  Installed independent unfiled draft.\n\nKeep *literal* whitespace.  ';
  await click(page, button('New idea'));
  await fill(page, field('Your idea'), evidence.newIdeaDraft);
  await click(page, button('Cancel'));
  await click(page, button('Now'));
  await clearWork(page);
  await selectWork(page, done.ideaPath);
  await visible(page, 'All recorded tasks are complete in the authoritative lane.');
  await click(page, `document.querySelector('[data-task-filter="done"]')`);
  await until(() => evaluate(page, `document.querySelectorAll('[data-task-key]').length === 13`), 'installed 052 genuine Done rows');
  const doneDetail = await inspectTask(page, done.units.find((task) => task.taskKey === 'T010@052now10'));
  assert.ok(doneDetail.detail.includes('Done is recorded state, not a verification or review result.'));
  assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-key="T004@052send4"]'))`), false);
  evidence.done052 = { canonicalDone: 13, archivedT004Excluded: true, inspected: 'T010@052now10',
    taskResults: 'not-exposed' };
  evidence.visual.push(await auditWorkspace(page, 'installed-052-done-1440-light'));

  await clearWork(page);
  await selectWork(page, mixed.ideaPath);
  const activeDetail = await inspectTask(page, mixed.units[1]);
  assert.ok(activeDetail.detail.includes('In progress is recorded state, not evidence that an agent is working now.'));
  assert.equal(await evaluate(page, 'globalThis.__t005TaskExecuted'), undefined);
  assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 5);
  assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-instruction] script,[data-task-instruction] button').length`), 0);
  const blockedDetail = await inspectTask(page, mixed.units[2]);
  assert.ok(blockedDetail.detail.includes('Explicitly blocked is separate from waiting on dependencies.'));
  assert.ok(blockedDetail.detail.includes('external-dependency: isolated acceptance fixture'));
  assert.match(await evaluate(page, `document.querySelector('[data-task-key="${mixed.units[3].taskKey}"]').innerText`),
    /Ready by recorded task dependencies/);
  assert.match(await evaluate(page, `document.querySelector('[data-task-key="${mixed.units[4].taskKey}"]').innerText`),
    /Waiting on dependencies/);
  evidence.controlledStates = { explicitFixture: true, activeIsNotLive: true, inertFullSource: true,
    dependenciesDistinctFromBlockers: true };
  await inspectTask(page, mixed.units[1]);
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 768, 1440, 1920]) {
      await workspaceViewport(page, width, theme);
      await until(() => evaluate(page, `Boolean(document.querySelector('[data-task-detail]')
        ?.closest(${JSON.stringify(width >= 1080 ? 'aside' : 'li')}))`), 'installed responsive task inspector');
      evidence.visual.push(await auditWorkspace(page, `installed-task-detail-${width}-${theme}`));
    }
  }
  await workspaceViewport(page, 1440, 'light');
  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width`), 48);
  await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
  await until(() => evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width === 208`),
    'installed inline expanded rail');
  assert.equal(await evaluate(page, `document.querySelector('main').inert`), false);
  await evaluate(page, `document.querySelector('#dude-tab-new').focus()`);
  await pressKey(page, 'Tab');
  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').contains(document.activeElement)`), false);
  await click(page, `document.querySelector('[aria-label="Collapse navigation pane"]')`);
  await workspaceViewport(page, 719, 'light');
  await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
  await until(() => evaluate(page, `Boolean(document.querySelector('[data-navigation-dialog]'))`), 'installed narrow rail dialog');
  await settle(page);
  assert.equal(await evaluate(page, `Math.round(document.querySelector('[data-navigation-dialog]').getBoundingClientRect().width)`), 260);
  assert.equal(await evaluate(page, `document.querySelector('header').inert && document.querySelector('main').inert
    && document.querySelector('footer').inert`), true);
  for (const modifiers of [0, 8]) {
    await pressKey(page, 'Tab', 'Tab', modifiers);
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-dialog]').contains(document.activeElement)`), true);
  }
  await pressKey(page, 'Escape');
  await until(() => evaluate(page, `!document.querySelector('[data-navigation-dialog]')
    && document.activeElement?.getAttribute('aria-label') === 'Expand navigation pane'`), 'installed narrow Escape return');
  await workspaceViewport(page, 720, 'light', 2);
  evidence.visual.push(await auditWorkspace(page, 'installed-task-detail-720-dpr2-light'));
  evidence.rail = { collapsed: 48, expanded: 208, overlay: 260, breakpoint: [719, 720],
    focusTrapBothDirections: true, escapeReturn: true, dpr2IsNotNativeZoom: true };
  await workspaceViewport(page, 1440, 'light');
  await clearWork(page);
  await selectWork(page, planned.ideaPath);
  await inspectTask(page, planned.units[2]);

  // Fail only the requested selected read, not an unrelated or stale input.
  // The next real Refresh repairs this transport failure without changing files.
  let failedRefresh = null;
  const interceptionErrors = [];
  const failed = (event) => {
    if (new URL(event.request.url).pathname === '/api/refresh'
      && JSON.parse(event.request.postData || '{}').target === planned.ideaPath) {
      failedRefresh = event;
      page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'ConnectionReset' })
        .catch((error) => interceptionErrors.push(safeError(error)));
    } else page.send('Fetch.continueRequest', { requestId: event.requestId })
      .catch((error) => interceptionErrors.push(safeError(error)));
  };
  const stopIntercepting = page.on('Fetch.requestPaused', failed);
  try {
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/refresh', requestStage: 'Request' }] });
    await click(page, button('Refresh'));
    await until(() => failedRefresh, 'installed selected refresh failure delivered');
    await visible(page, 'Current instruction unavailable');
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 0);
    evidence.selectedReadFailure = { target: planned.ideaPath, newerDetailWithheld: true,
      requestBody: failedRefresh.request.postData, interceptionErrors };
  } finally {
    stopIntercepting();
    await page.send('Fetch.disable');
  }
  assert.deepEqual(interceptionErrors, [], 'the selected-read failure must actually reach CDP');
  await click(page, button('Refresh'));
  await visible(page, 'Planned task definitions; execution has not started.');
  await inspectTask(page, planned.units[2]);
  await click(page, button('New idea'));
  assert.equal(await evaluate(page, `${field('Your idea')}.value`), evidence.newIdeaDraft);
  await click(page, button('Cancel'));
  await click(page, button('Now'));
  await visible(page, 'Respond to request');
  evidence.visual.push(await auditWorkspace(page, 'installed-062-now-before-response'));
  evidence.taskInspectionCompleted = true;
}

/** Keep one actual Review instance through work selection and unrelated input.
 * @param {Cdp} page @param {ReturnType<typeof seedTaskWalkthrough>} fixture
 * @param {string} draft @param {string} selectedTaskKey
 */
async function driveReviewContinuity(page, fixture, draft, selectedTaskKey) {
  const [planned, done] = fixture.records;
  const selectedTask = planned.units.find((task) => task.taskKey === selectedTaskKey);
  assert.ok(selectedTask);
  await click(page, button('Comments (2)'));
  const comment = '  Installed A retained caret.\n\nLiteral local markup.  ';
  await fill(page, field('Comment (optional)'), comment);
  for (const modifiers of [0, 0, 8, 8, 8]) await pressKey(page, 'ArrowLeft', 'ArrowLeft', modifiers);
  const caret = await evaluate(page, `({
    value:${field('Comment (optional)')}.value,start:${field('Comment (optional)')}.selectionStart,
    end:${field('Comment (optional)')}.selectionEnd
  })`);
  assert.deepEqual(caret, { value: comment, start: comment.length - 5, end: comment.length - 2 });
  await click(page, `document.querySelector('[aria-label="Close comments"]')`);
  await awaitSavedMarkup(page, 'installed caret-bearing markup saved');
  const frame = () => evaluate(page, `({
    width:document.querySelector('.dude-review-frame').clientWidth,
    height:document.querySelector('.dude-review-frame').clientHeight
  })`);
  const pinned = await frame();
  await evaluate(page, `window.__t005InstalledFrame = document.querySelector('.dude-review-frame'); true`);
  await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
  await until(() => evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width === 208`),
    'installed Review inline rail expansion');
  assert.deepEqual(await frame(), pinned, 'Review frame dimensions stay pinned through rail expansion');
  const expandedScreenshot = await screenshot(page, 'installed-review-pinned-expanded-rail');
  await click(page, `document.querySelector('[aria-label="Collapse navigation pane"]')`);
  assert.deepEqual(await frame(), pinned);
  await click(page, button('Now'));
  await until(() => evaluate(page, `Boolean(document.querySelector('[data-task-detail="${selectedTask.taskKey}"]'))`),
    'installed Now retains task inspection while Review is hidden');
  assert.equal(await evaluate(page, `document.querySelector('[data-task-instruction="${selectedTask.taskKey}"]').textContent`),
    selectedTask.text);
  await clearWork(page);
  await selectWork(page, done.ideaPath);
  await click(page, button('Needs you'));
  await visible(page, 'Annotate exact installed revision A');
  assert.ok(await evaluate(page, `document.querySelector('[aria-label="Browsing"]')?.innerText.includes('052')`));
  assert.ok(await evaluate(page, `document.querySelector('[aria-label="Request scope"]')?.innerText
    .includes(${JSON.stringify(SPEC_PATH)})`));
  await click(page, button('Open Review'));
  await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay')?.getClientRects().length)`),
    'installed same Review returns while browsing 052');
  assert.equal(await evaluate(page, `window.__t005InstalledFrame === document.querySelector('.dude-review-frame')`), true);
  assert.deepEqual(await frame(), pinned);
  await click(page, button('Comments (2)'));
  const restoredCaret = await until(() => evaluate(page, `(() => {
    const node=${field('Comment (optional)')};
    return node && !node.disabled ? {value:node.value,start:node.selectionStart,end:node.selectionEnd} : null;
  })()`), 'installed restored comment field');
  assert.deepEqual(restoredCaret, caret, 'request-local text and caret survive Clear and a different selected feature');
  await click(page, `document.querySelector('[aria-label="Close comments"]')`);
  await click(page, button('Back'));
  await click(page, button('Now'));
  await clearWork(page);
  await selectWork(page, planned.ideaPath);
  assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false,
    'Clear does not restore stale task inspection');
  // Clear intentionally drops detail. Select it again before checking the
  // remaining A/B/C returns, rather than claiming Clear retained stale state.
  await inspectTask(page, selectedTask);
  await click(page, button('New idea'));
  assert.equal(await evaluate(page, `${field('Your idea')}.value`), draft);
  await click(page, button('Cancel'));
  await click(page, button('Open Review'));
  await visible(page, 'Comments (2)');
  assert.equal(await evaluate(page, `window.__t005InstalledFrame === document.querySelector('.dude-review-frame')`), true);
  assert.deepEqual(await frame(), pinned);
  return { pinned, caret, restoredCaret, expandedScreenshot, differentBrowsingScope: done.ideaPath,
    requestScopeUnchanged: SPEC_PATH, unfiledDraftPreserved: true, sameMountedFrame: true };
}

/** @param {http.Server} server */
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}/v1`;
}

const RAW_DUDE_TOOLS = Object.freeze([
  'read', 'edit', 'search', 'execute', 'todo', 'agent', 'dude_needs_you',
]);
const RAW_SPEC_LEAD_TOOLS = Object.freeze(['read', 'edit', 'search']);

/** @param {string} root @param {string} filename */
function rawProfileEvidence(root, filename) {
  const profilePath = path.join(root, '.github/agents', filename);
  const bytes = fs.readFileSync(profilePath);
  assert.equal(
    bytes.equals(fs.readFileSync(path.join(ROOT, '.github/agents', filename))),
    true,
    `installed ${filename} drifted from the current generated bundle`,
  );
  return { profilePath, profileRevision: revision(bytes) };
}

/** @param {http.Server} server */
async function closeServer(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

/**
 * The SDK replaces the runtime's inherited environment. Windows processes,
 * PowerShell, and the extension's capture-browser lookup still need these
 * system roots. Profile and temporary roots point into this host's owned data,
 * so the CLI, its shell, and any capture browser write no user profile state.
 * @param {string} data
 */
function windowsHostEnvironment(data) {
  const system = Object.fromEntries([
    'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT',
    'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  ].map((name) => [name, process.env[name]]).filter(([, value]) => value !== undefined));
  const temporary = path.join(data, 'tmp');
  return {
    ...system,
    HOME: path.join(data, 'home'),
    USERPROFILE: path.join(data, 'home'),
    APPDATA: path.join(data, 'config'),
    LOCALAPPDATA: path.join(data, 'cache'),
    TEMP: temporary,
    TMP: temporary,
  };
}

/** Windows path identity for one executable. @param {string} actual @param {string} expected */
function sameExecutable(actual, expected) {
  return path.resolve(actual).toLowerCase() === path.resolve(expected).toLowerCase();
}

/**
 * Read packs inside the launcher's real extension runtime, in-process, to
 * record its execPath and Node version. This depends on the installed CLI's
 * own extension launch contract, which may change with the CLI: the launcher
 * started with its preloads/extension_bootstrap.mjs, COPILOT_EXTENSION_PARENT_PID
 * naming this driver, and EXTENSION_PATH naming the probe. The probe imports
 * the fixture's installed reader and reads its disposable local catalog.
 * readPacks launches its catalog helper through this same bootstrap contract
 * (readerLaunch in lib/packs.mjs), so the probe is also its real-host check.
 * @param {string} root seeded, disposable release fixture
 */
async function probeRealHostPackRead(root) {
  const evidence = await runRealHostPackProbe('real-host-pack-probe', root);
  assert.deepEqual(evidence.result.coverage.catalog, { state: 'current', reason: null, message: null });
  assert.equal(evidence.result.origin, 'local');
  assert.deepEqual(evidence.result.packs, [PACK_NAME]);
  note('real-host-pack-probe', { execPath: evidence.result.execPath, node: evidence.result.node,
    elapsedMs: evidence.result.elapsedMs, catalog: evidence.result.coverage.catalog.state,
    packs: evidence.result.packs });
  return evidence;
}

/**
 * Stall a real-host catalog read on a silent git:// peer, which Git never
 * times out. The installed reader must end the read at its deadline by
 * stopping the whole helper tree in the launcher's runtime: the relaunched
 * launcher, the PATH git wrapper and the real git. A disposable release has no
 * local catalog, so its configured source is the only one.
 */
async function probeRealHostPackStall() {
  const root = path.join(RUN, 'real-host-pack-stall');
  installRelease(root);
  assert.equal(fs.existsSync(path.join(root, 'library', 'packs')), false);
  // Git cannot create a checkout whose files exceed the Windows path limit, as
  // they would below this run's artifact root. Keep the host's temp root short.
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-t012-stall-'));
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  let connections = 0;
  const peer = net.createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    socket.resume();
  });
  await new Promise((resolve, reject) => {
    peer.once('error', reject);
    peer.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  let probed;
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (peer.address());
    write(root, '.dude/metadata/bundle-manifest.md', `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({
      source_repo: `git://127.0.0.1:${port}/catalog.git`, source_ref: 'main' })}\n\`\`\`\n`);
    const evidence = await runRealHostPackProbe('real-host-pack-stall-probe', root, data);
    const stall = {
      data,
      connections,
      openAfterRead: sockets.size,
      acquisitionRootsAfterRead: fs.readdirSync(path.join(data, 'tmp'))
        .filter((name) => name.startsWith('dude-canvas-packs-')),
    };
    fs.writeFileSync(path.join(evidence.directory, 'stall.json'), `${JSON.stringify(stall, null, 2)}\n`);
    assert.deepEqual(evidence.result.coverage.catalog, { state: 'unavailable', reason: 'catalog_timeout',
      message: 'The catalog read timed out. Reload to try a fresh read.' });
    assert.ok(evidence.result.elapsedMs >= 5_000 && evidence.result.elapsedMs < 7_500,
      `real-host stalled read ended within the deadline plus stop window: ${evidence.result.elapsedMs} ms`);
    assert.ok(stall.connections >= 1, 'real-host git reached the silent peer');
    assert.equal(stall.openAfterRead, 0, 'no real-host git process still holds the stalled connection');
    assert.deepEqual(stall.acquisitionRootsAfterRead, [], 'the real-host acquisition root was removed');
    note('real-host-pack-stall-probe', { execPath: evidence.result.execPath, elapsedMs: evidence.result.elapsedMs,
      catalog: evidence.result.coverage.catalog.reason, ...stall });
    probed = { ...evidence, stall };
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => peer.close(() => resolve(undefined)));
  }
  // Only a passed probe removes its temp root; a failed one keeps it as evidence.
  fs.rmSync(data, { recursive: true, force: true });
  return probed;
}

/**
 * Launch the real extension runtime on a probe that times readPacks with the
 * given root's installed reader, and record the result as evidence.
 * @param {string} name evidence directory under this run
 * @param {string} root disposable release fixture
 * @param {string} [data] the host's profile and temporary roots
 */
async function runRealHostPackProbe(name, root, data = path.join(RUN, name, 'data')) {
  const directory = path.join(RUN, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(data, 'tmp'), { recursive: true });
  const probe = path.join(directory, 'probe.mjs');
  const reader = path.join(root, '.github', 'extensions', 'dude', 'lib', 'packs.mjs');
  fs.writeFileSync(probe, [
    "import { pathToFileURL } from 'node:url';",
    `const { readPacks } = await import(pathToFileURL(${JSON.stringify(reader)}).href);`,
    'const started = performance.now();',
    `const snapshot = await readPacks(${JSON.stringify(root)}, AbortSignal.timeout(20_000));`,
    'const elapsedMs = Math.round(performance.now() - started);',
    'process.stdout.write(JSON.stringify({ execPath: process.execPath, node: process.version, elapsedMs,',
    '  coverage: snapshot.coverage, origin: snapshot.catalog?.origin ?? null,',
    "  packs: snapshot.catalog?.packs.map((pack) => pack.name) ?? null }) + '\\n');",
    'process.exit(0);',
  ].join('\n'));
  const bootstrap = path.join(CLI_DIST_DIR, 'preloads', 'extension_bootstrap.mjs');
  const child = spawn(CLI, [bootstrap], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      ...windowsHostEnvironment(data),
      COPILOT_CLI_DIST_DIR: CLI_DIST_DIR,
      COPILOT_EXTENSION_PARENT_PID: String(process.pid),
      EXTENSION_PATH: probe,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = await bounded(name, () => new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  })).catch((error) => {
    child.kill();
    throw error;
  });
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
  const evidence = {
    launcher: CLI,
    bootstrap,
    launchContract: 'CLI launcher + preloads/extension_bootstrap.mjs + COPILOT_EXTENSION_PARENT_PID + EXTENSION_PATH',
    exit,
    result: line ? JSON.parse(line) : null,
    stderrTail: stderr.split(/\r?\n/).filter(Boolean).slice(-8),
  };
  fs.writeFileSync(path.join(directory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  assert.equal(exit.code, 0, `${name} exited ${exit.code}: ${stderr.slice(-2_000)}`);
  assert.ok(evidence.result, `${name} printed no result`);
  assert.equal(sameExecutable(evidence.result.execPath, CLI), true,
    `${name} ran outside the launcher: ${evidence.result.execPath}`);
  return { ...evidence, directory, data };
}

/**
 * `approve` is the one case-specific permission decision: a case that scripts
 * its own owner tool calls approves exactly those, by call and content. The
 * session is checked here, and every other request is still rejected.
 * @param {{
 *   root:string,
 *   data:string,
 *   modelUrl:string,
 *   caseName:string,
 *   approve?:(request:any)=>boolean,
 * }} options
 */
async function createInstalledHost(options) {
  for (const name of ['home', 'tmp', 'cache', 'config', 'copilot']) {
    fs.mkdirSync(path.join(options.data, name), { recursive: true });
  }
  const env = {
    PATH: process.env.PATH,
    // Exercise the actual supported desktop environment. Session/config/history
    // remain under the owned baseDirectory below, the provider is offline and
    // credential-free, and each capture still owns an explicit disposable
    // browser profile. Synthetic HOME plus both synthetic XDG roots caused Edge
    // 133's remote-debugging pipe to stall; retained failed runs document that
    // harness-only environment rather than mislabeling it as product support.
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    LANG: 'en_US.UTF-8',
    OTEL_SDK_DISABLED: 'true',
    COPILOT_OFFLINE: 'true',
    COPILOT_PROVIDER_BASE_URL: options.modelUrl,
    COPILOT_PROVIDER_TYPE: 'openai',
    COPILOT_MODEL: 'gpt-4.1',
    DUDE_CANVAS_BROWSER: BROWSER,
    ...(WINDOWS ? windowsHostEnvironment(options.data) : {}),
    ...(WINDOWS ? { COPILOT_CLI_DIST_DIR: CLI_DIST_DIR } : {}),
  };
  if (process.platform === 'win32') {
    // The SDK replaces, rather than merges, the child environment. Keep the
    // Windows OS/shell inputs, but isolate every home/config/temp root. Do not
    // inherit credentials, the caller's Copilot session, or the user's profile.
    for (const name of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']) {
      if (process.env[name]) env[name] = process.env[name];
    }
    const home = path.join(options.data, 'home');
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      HOMEDRIVE: path.parse(home).root.replace(/[\\/]$/, ''),
      HOMEPATH: home.slice(path.parse(home).root.length - 1),
      APPDATA: path.join(options.data, 'config', 'Roaming'),
      LOCALAPPDATA: path.join(options.data, 'cache', 'Local'),
      XDG_CONFIG_HOME: path.join(options.data, 'config'),
      XDG_CACHE_HOME: path.join(options.data, 'cache'),
      TEMP: path.join(options.data, 'tmp'),
      TMP: path.join(options.data, 'tmp'),
      TMPDIR: path.join(options.data, 'tmp'),
    });
    fs.mkdirSync(env.APPDATA, { recursive: true });
    fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  }
  const record = {
    caseName: options.caseName,
    root: options.root,
    data: options.data,
    sessionId: randomUUID(),
    events: {},
    delegationEvents: [],
    permissions: [],
    cleanup: {},
  };
  const rawProfiles = {
    dude: rawProfileEvidence(options.root, 'dude.agent.md'),
    specLead: rawProfileEvidence(options.root, 'dude-spec-lead.agent.md'),
  };
  const blankPlan = options.caseName === 'blank-non-git' || options.caseName === 'blank-git'
    ? captureFixture({
      root: options.root,
      intent: blankIntent(options.caseName),
      slug: blankSlug(options.caseName),
      evidence: path.join(RUN, `${options.caseName}-evidence`),
    })
    : null;
  record.rawProfiles = rawProfiles;
  record.childEnvironment = env;
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: SESSION_RUNTIME }),
    workingDirectory: options.root,
    baseDirectory: path.join(options.data, 'copilot'),
    env,
    useLoggedInUser: false,
    logLevel: 'debug',
  });
  try {
  await bounded(`${options.caseName} client.start`, () => client.start(), 45_000);
  record.hostStatus = await client.getStatus();
  const session = await bounded(`${options.caseName} createSession`, () => client.createSession({
    sessionId: record.sessionId,
    workingDirectory: options.root,
    configDirectory: path.join(options.data, 'copilot'),
    enableConfigDiscovery: true,
    requestExtensions: true,
    extensionSdkPath: SDK,
    model: 'gpt-4.1',
    modelCapabilities: {
      supports: { vision: true },
      limits: {
        vision: {
          supported_media_types: ['image/png'],
          max_prompt_images: 4,
          max_prompt_image_size: 8 * 1024 * 1024,
        },
      },
    },
    provider: {
      type: 'openai',
      wireApi: 'completions',
      baseUrl: options.modelUrl,
      modelId: 'gpt-4.1',
      wireModel: 't012-deterministic-local-fixture',
      maxOutputTokens: 1_024,
    },
    enableSessionTelemetry: false,
    onPermissionRequest: (request, invocation) => {
      const args = request.args && typeof request.args === 'object'
        ? request.args
        : {};
      const toolName = request.toolName ?? null;
      const exactSession = invocation.sessionId === record.sessionId;
      const exactStageCreate = request.kind === 'write'
        && blankPlan
        && request.fileName === blankPlan.stagePath
        && request.newFileContents === blankPlan.bytes.toString('utf8')
        && /^call_blank-(?:non-git|git)_spec_create_stage$/.test(String(request.toolCallId));
      const exactStageRead = request.kind === 'read'
        && blankPlan
        && request.path === blankPlan.stagePath
        && /^call_blank-(?:non-git|git)_spec_read_stage$/.test(String(request.toolCallId));
      const exactCanonicalRead = request.kind === 'read'
        && blankPlan
        && request.path === blankPlan.canonicalPath
        && /^call_blank-(?:non-git|git)_read_canonical$/.test(String(request.toolCallId));
      const exactSkillRead = request.kind === 'read'
        && request.path === path.join(
          options.root,
          '.github/skills/dude-feature-definition/SKILL.md',
        )
        && /^(?:call_blank-(?:non-git|git)_spec_read_definition_skill|call_t012_spec_read_skill_[bc])$/
          .test(String(request.toolCallId));
      const exactMockEdit = request.kind === 'write'
        && request.fileName === path.join(options.root, ...MOCK_PATH.split('/'))
        && [renderMock('B').toString('utf8'), renderMock('C').toString('utf8')]
          .includes(request.newFileContents)
        && /^call_t012_spec_edit_[bc]$/.test(String(request.toolCallId));
      const exactMockRead = request.kind === 'read'
        && request.path === path.join(options.root, ...MOCK_PATH.split('/'))
        && /^call_t012_spec_(?:view_[ab]_for_[bc]|read_[bc])$/.test(String(request.toolCallId));
      const exactPublisher = request.kind === 'shell'
        && blankPlan
        && request.fullCommandText === publisherCommand(blankPlan, options.root)
        && !/[\n\r`;]|&&|\|\||\$\(/.test(request.fullCommandText)
        && request.toolCallId === `call_${options.caseName}_publish_capture`;
      const installedPack = packFixture(options.root);
      const exactPackRead = request.kind === 'read'
        && (
          (request.toolCallId === 'call_t012_pack_manifest'
            && request.path === path.join(options.root, ...PACK_MANIFEST_PATH.split('/')))
          || (request.toolCallId === 'call_t012_pack_source'
            && request.path === path.join(options.root, ...PACK_SOURCE_PATH.split('/')))
          || (request.toolCallId === 'call_t012_pack_profile'
            && request.path === installedPack.profile)
        );
      const packShells = new Map([
        ['call_t012_pack_list', installedPack.listCommand],
        ['call_t012_pack_add', installedPack.addCommand],
        ['call_t012_pack_lint', installedPack.lintCommand],
      ]);
      const exactPackShell = request.kind === 'shell'
        && packShells.get(String(request.toolCallId)) === request.fullCommandText
        && !/[\n\r`;]|&&|\|\||\$\(/.test(String(request.fullCommandText));
      const exactHandoff = request.kind === 'custom-tool'
        && toolName === 'dude_needs_you'
        && request.args && typeof request.args === 'object'
        && ['request', 'acknowledge'].includes(request.args.op)
        && /^(?:call_blank-(?:non-git|git)_capture_ack|call_t012_(?:review_[abc]|ack_[abc]|permission|cancel|outside|pack_(?:permission|permission_ack|result)))$/
          .test(String(request.toolCallId));
      const accepted = (exactSession
        && (exactHandoff || exactPublisher || exactPackRead || exactPackShell
          || Boolean(options.approve?.(request))))
        || exactStageCreate || exactStageRead || exactCanonicalRead
        || exactSkillRead || exactMockEdit || exactMockRead;
      const permissionInput = request.kind === 'read'
        ? { kind: request.kind, path: request.path }
        : request.kind === 'write'
          ? {
            kind: request.kind,
            fileName: request.fileName,
            newFileRevision: typeof request.newFileContents === 'string'
              ? revision(request.newFileContents) : null,
          }
          : request.kind === 'shell'
            ? { ...request }
            : {
              kind: request.kind,
              toolName,
              op: typeof args.op === 'string' ? args.op : null,
              toolArgumentsRevision: revision(JSON.stringify(args)),
            };
      record.permissions.push({
        kind: request.kind,
        toolName,
        toolCallId: request.toolCallId ?? null,
        invocationSessionId: invocation.sessionId,
        argsRevision: revision(JSON.stringify(permissionInput)),
        target: request.kind === 'read' ? request.path
          : request.kind === 'write' ? request.fileName
            : request.kind === 'shell' ? request.fullCommandText
            : typeof args.path === 'string'
              ? args.path
              : typeof args.command === 'string' ? args.command : null,
        requestDetails: permissionInput,
        decision: accepted ? 'approve-once' : 'reject',
      });
      note('permission-decision', record.permissions.at(-1));
      return accepted
        ? { kind: 'approve-once' }
        : { kind: 'reject', feedback: 'Only the installed Dude handoff is allowed in this fixture.' };
    },
    onEvent: (event) => {
      record.events[event.type] = (record.events[event.type] ?? 0) + 1;
      if (event.agentId || event.type.startsWith('subagent.')) {
        const data = {};
        for (const key of [
          'agentId', 'agentName', 'agentType', 'name', 'description',
          'toolCallId', 'status', 'sessionId',
        ]) {
          const value = event.data?.[key];
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            data[key] = value;
          }
        }
        record.delegationEvents.push({
          type: event.type,
          id: event.id,
          agentId: event.agentId ?? null,
          data,
        });
      }
    },
  }), 45_000);
  record.capabilities = session.capabilities;
  let extension;
  record.extensionListing = await until(async () => {
    const listing = await session.rpc.extensions.list();
    extension = listing.extensions.find((entry) => entry.id === 'project:dude');
    if (extension?.status === 'failed') throw new Error(`installed Dude extension failed: ${JSON.stringify(extension)}`);
    return extension?.status === 'running' ? listing : null;
  }, `${options.caseName} installed extension discovery`, 20_000);
  assert.ok(extension?.pid);
  record.extension = extension;
  const agents = await session.rpc.agent.list();
  record.agents = agents.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    displayName: agent.displayName,
    source: agent.source,
    path: agent.path,
    userInvocable: agent.userInvocable,
    tools: agent.tools,
  }));
  const dude = agents.agents.find((agent) => (
    agent.id === 'dude' && agent.source === 'project'
  ));
  const specLead = agents.agents.find((agent) => (
    agent.id === 'dude-spec-lead' && agent.source === 'project'
  ));
  assert.equal(dude?.path, rawProfiles.dude.profilePath);
  assert.equal(specLead?.path, rawProfiles.specLead.profilePath);
  assert.deepEqual(dude?.tools, RAW_DUDE_TOOLS);
  assert.deepEqual(specLead?.tools, RAW_SPEC_LEAD_TOOLS);
  record.discoveredProfiles = [dude, specLead].map((agent) => ({
    id: agent.id,
    name: agent.name,
    source: agent.source,
    path: agent.path,
    tools: agent.tools,
    profileRevision: agent.id === 'dude'
      ? rawProfiles.dude.profileRevision : rawProfiles.specLead.profileRevision,
  }));
  record.selectedAgent = (await session.rpc.agent.select({ name: dude.id })).agent;
  record.selectedAgentAfterExtension = record.selectedAgent;
  record.agentAfterSelectionCheck = await session.rpc.agent.getCurrent();
  record.extensionProcess = processRow(extension.pid);
  assert.ok(record.extensionProcess);
  record.hostProcess = processRow(record.extensionProcess.ppid);
  assert.ok(record.hostProcess);
  assert.equal(record.hostProcess.ppid, process.pid,
    'extension parent is not this driver-owned installed CLI');
  if (WINDOWS) {
    assert.equal(sameExecutable(record.hostProcess.executable, CLI), true,
      `installed CLI runtime is not the configured launcher: ${record.hostProcess.executable}`);
    assert.equal(sameExecutable(record.extensionProcess.executable, CLI), true,
      `extension host is not the launcher's single executable: ${record.extensionProcess.executable}`);
  }
  const canvases = await session.rpc.canvas.list();
  record.canvasList = canvases;
  const capability = canvases.canvases.find((entry) => (
    entry.extensionId === 'project:dude' && entry.canvasId === 'dude'
  ));
  assert.ok(capability, 'installed Dude canvas was not registered');
  const instanceId = `t012-${options.caseName}-${randomUUID()}`;
  const canvas = await session.rpc.canvas.open({
    extensionId: capability.extensionId,
    canvasId: capability.canvasId,
    instanceId,
  });
  assert.equal(new URL(canvas.url).hostname, '127.0.0.1');
  record.canvas = { ...canvas, url: new URL(canvas.url).origin + '/' };
  return { client, session, canvas, instanceId, record };
  } catch (error) {
    record.startupError = safeError(error);
    try {
      record.cleanup.stopErrors = (await bounded('failed host client.stop', () => client.stop(), 15_000))
        .map(safeError);
    } catch (stopError) {
      record.cleanup.stopError = safeError(stopError);
      await bounded('failed host forceStop', () => client.forceStop(), 8_000);
    } finally {
      fs.writeFileSync(path.join(RUN, `${options.caseName}-startup-failure.json`),
        `${JSON.stringify(record, null, 2)}\n`);
    }
    throw error;
  }
}

/** @param {Awaited<ReturnType<typeof createInstalledHost>>} host */
async function closeInstalledHost(host) {
  try {
    await bounded('canvas.close', () => host.session.rpc.canvas.close({
      instanceId: host.canvas.instanceId,
    }), 8_000);
    host.record.cleanup.canvasClosed = true;
  } catch (error) {
    host.record.cleanup.canvasCloseError = safeError(error);
  }
  try {
    await bounded('session.disconnect', () => host.session.disconnect(), 8_000);
    host.record.cleanup.sessionDisconnected = true;
  } catch (error) {
    host.record.cleanup.sessionDisconnectError = safeError(error);
  }
  try {
    await bounded('client.deleteSession', () => host.client.deleteSession(host.record.sessionId), 8_000);
    host.record.cleanup.sessionDeleted = true;
  } catch (error) {
    host.record.cleanup.sessionDeleteError = safeError(error);
  }
  try {
    const errors = await bounded('client.stop', () => host.client.stop(), 15_000);
    host.record.cleanup.stopErrors = errors.map(safeError);
  } catch (error) {
    host.record.cleanup.stopError = safeError(error);
    await host.client.forceStop();
    host.record.cleanup.forcedOwnedClientStop = true;
  }
  try {
    host.record.cleanup.extensionStillRunning = Boolean(
      host.record.extensionProcess && processRow(host.record.extensionProcess.pid),
    );
    host.record.cleanup.hostStillRunning = Boolean(
      host.record.hostProcess && processRow(host.record.hostProcess.pid),
    );
  } catch (error) {
    // Leave both unknown so the final cleanup assertions fail rather than pass.
    host.record.cleanup.processProbeError = safeError(error);
  }
}

/** @param {Awaited<ReturnType<typeof createInstalledHost>>} host */
async function reopenInstalledCanvas(host) {
  await host.session.rpc.canvas.close({ instanceId: host.canvas.instanceId });
  const capability = host.record.canvasList.canvases.find((entry) => (
    entry.extensionId === 'project:dude' && entry.canvasId === 'dude'
  ));
  assert.ok(capability);
  const canvas = await host.session.rpc.canvas.open({
    extensionId: capability.extensionId,
    canvasId: capability.canvasId,
    instanceId: `t012-reopen-${randomUUID()}`,
  });
  host.canvas = canvas;
  host.instanceId = canvas.instanceId;
  host.record.canvas = { ...canvas, url: new URL(canvas.url).origin + '/' };
  return canvas;
}

/**
 * @param {string} canvasUrl
 * @param {string} pathname
 * @param {unknown} body
 */
async function postCanvas(canvasUrl, pathname, body) {
  const origin = new URL(canvasUrl).origin;
  const response = await fetch(new URL(pathname, canvasUrl), {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  return { status: response.status, body: value };
}

/** @param {string} canvasUrl */
async function readNeedsYou(canvasUrl) {
  const response = await fetch(new URL('/api/needs-you', canvasUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

/** @param {string} root */
function installedAboutMetadata(root) {
  const document = parseManifestDocument(
    fs.readFileSync(path.join(root, '.dude', 'metadata', 'bundle-manifest.md')),
    'installed-host bundle manifest',
  );
  const recordPath = path.join(root, ...BASE_RELEASE_PATH.split('/'));
  const record = fs.existsSync(recordPath) ? parseDevelopmentBaseRelease(fs.readFileSync(recordPath)) : null;
  return {
    installedRef: document.data.installed_ref ?? null,
    sourceRef: document.data.source_ref ?? null,
    sourceRepo: document.data.source_repo,
    baseRecord: record && { source_repo: record.source_repo, base_release: record.base_release },
  };
}

/** @param {string} canvasUrl */
async function readAbout(canvasUrl) {
  const response = await fetch(new URL('/api/about', canvasUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
    body,
  };
}

/** @param {string} canvasUrl */
async function readCanvasProjection(canvasUrl) {
  const response = await fetch(new URL('/api/projection', canvasUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

/**
 * The UI commits selection before its asynchronous repository read settles.
 * Wait for the installed server projection, not only the local heading.
 * @param {string} canvasUrl
 * @param {string} ideaPath
 * @param {string} label
 */
function awaitSelectedProjection(canvasUrl, ideaPath, label) {
  return until(async () => {
    const current = await readCanvasProjection(canvasUrl);
    return current.projection?.selected?.ideaPath === ideaPath
      && current.projection.selected.explicit === true
      ? current
      : null;
  }, label);
}

/** @param {string} canvasUrl */
async function readWorkIndex(canvasUrl) {
  const response = await fetch(new URL('/api/work-index', canvasUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

/**
 * Observe one real installed-host About read and its rendered installation
 * record: the release case by default, or a pre-seeded development base.
 * Settings is already open and its request dialog, if any, has been closed.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {string} root
 * @param {string} name
 * @param {string[]} cliVersions
 * @param {typeof RELEASE_ABOUT | typeof DEVELOPMENT_ABOUT} [expected]
 */
async function observeInstalledAbout(page, canvasUrl, root, name, cliVersions, expected = RELEASE_ABOUT) {
  const recorded = installedAboutMetadata(root);
  assert.deepEqual(recorded, expected.recorded,
    `the ${expected.label} fixture carries its pre-seeded installation record`);
  const api = await readAbout(canvasUrl);
  assert.deepEqual(api, {
    status: 200,
    cacheControl: 'no-store',
    body: {
      installedRef: recorded.installedRef,
      sourceRef: recorded.sourceRef,
      baseRelease: expected.baseRelease,
    },
  }, `the installed extension reads About from its ${expected.label} metadata`);
  await click(page, `document.querySelector('[data-settings-section="about"]')`);
  await until(() => evaluate(page, `document.querySelector('[data-about-facts]')
    ?.getAttribute('aria-busy') === 'false'`), `${name} installed About facts`, 10_000);
  const ui = await evaluate(page, `(() => {
    const link = document.querySelector('[data-about-repository]');
    return {
      rows: [...document.querySelectorAll('[data-about-facts] > div')].map(row =>
        [...row.children].map(node => node.textContent.replace(/\\s+/g, ' ').trim())),
      note: document.querySelector('[data-about-note]')?.textContent.replace(/\\s+/g, ' ').trim(),
      link: link ? {
        text: link.textContent.replace(/\\s+/g, '').trim(),
        href: link.href,
        target: link.target,
        rel: link.rel,
      } : null,
      footer: document.querySelector('footer[aria-label="Workspace status"]')?.textContent.trim(),
      reloadVisible: Boolean(document.querySelector('[aria-label="Reload packs"]')?.getClientRects().length),
      selectedSection: document.querySelector('[data-settings-section][aria-selected="true"]')
        ?.getAttribute('data-settings-section'),
      panelText: document.querySelector('[data-about-panel]')?.innerText,
    };
  })()`);
  assert.deepEqual({
    rows: ui.rows,
    note: ui.note,
    link: ui.link,
    footer: ui.footer,
    reloadVisible: ui.reloadVisible,
    selectedSection: ui.selectedSection,
  }, {
    rows: expected.rows,
    note: 'Recorded installation metadata; installed files are not verified.',
    link: {
      text: 'https://github.com/E-G-C/dude',
      href: 'https://github.com/E-G-C/dude',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    footer: 'About · Read only',
    reloadVisible: false,
    selectedSection: 'about',
  }, `the installed UI displays the recorded ${expected.label} metadata, credit, and the official repository`);
  for (const version of cliVersions.filter(Boolean)) {
    assert.equal(ui.panelText.includes(version), false,
      `About must not substitute installed CLI version ${version} for the recorded Dude release`);
  }
  return {
    recorded,
    api,
    ui,
    screenshot: await screenshot(page, `installed-about-${name}`),
    renderer: 'owned Edge/CDP URL returned by the installed copilot.exe host; desktop embedding is not observed',
  };
}

/** @param {Cdp} page */
async function returnInstalledPacks(page) {
  await click(page, `document.querySelector('[data-settings-section="packs"]')`);
  await until(() => evaluate(page, `document.querySelector('[data-settings-section="packs"]')
    ?.getAttribute('aria-selected') === 'true'`), 'installed Packs section restored');
}

/**
 * The bytes this installed Canvas actually serves for the frontend bundle and
 * the Review engine it loads. Installed-file parity alone cannot show that the
 * running server read those files, so the gesture proof below rests on these.
 * @param {string} canvasUrl
 */
async function servedIdentity(canvasUrl) {
  const served = {};
  for (const [route, expected] of [
    ['/assets/app.js', SOURCE_APP_SHA256],
    ...Object.entries(SOURCE_REVIEW_MODULES).map(([relative, expected]) => (
      [`/${relative.slice('ui/'.length)}`, expected]
    )),
  ]) {
    const response = await fetch(new URL(route, canvasUrl), { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200, `installed Canvas did not serve ${route}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = sha256(bytes);
    assert.equal(actual, expected, `served ${route} is not the current source`);
    served[route] = { bytes: bytes.length, sha256: actual };
  }
  return served;
}

/** @param {string} root */
function installedParity(root) {
  const runtime = [
    'extension.mjs',
    'lib/about.mjs',
    'lib/canvas-server.mjs',
    'lib/projection.mjs',
    'lib/packs.mjs',
    'lib/catalog-reader.mjs',
    'lib/needs-you.mjs',
    'lib/project-artifacts.mjs',
    'lib/review.mjs',
    'lib/review/browser.mjs',
    'lib/review/data.mjs',
    'lib/review/png.mjs',
    'ui/index.html',
    'ui/assets/app.js',
    'ui/assets/app.js.LEGAL.txt',
    'ui/review/engine.mjs',
    'ui/review/geometry.mjs',
    'ui/review/shapes.mjs',
    'ui/review/inspector.mjs',
    'ui/review/panel.mjs',
    'ui/review/capture.mjs',
    'ui/review/bridge.mjs',
    'ui/review/styles.css',
    'ui/review/NOTICE.txt',
  ];
  const pairs = {};
  for (const relative of runtime) {
    const authored = sourceBytes(`src/extensions/dude/${relative}`);
    const installed = fs.readFileSync(path.join(root, '.github/extensions/dude', ...relative.split('/')));
    assert.equal(installed.equals(authored), true, `installed runtime drift: ${relative}`);
    pairs[relative] = sha256(installed);
  }
  assert.equal(pairs['ui/assets/app.js'], SOURCE_APP_SHA256);
  assert.equal(pairs['ui/assets/app.js.LEGAL.txt'], SOURCE_LEGAL_SHA256);
  for (const [relative, expected] of Object.entries(SOURCE_REVIEW_MODULES)) {
    assert.equal(pairs[relative], expected, `installed Review module is not the current source: ${relative}`);
  }
  // The 073 core modules outside the extension: the saved-sources parser and writer Canvas and Compose share,
  // Compose and its Sources procedure, the lint that checks the sources document, and bundle upgrade's two
  // Compose calls. Each is the installed owner's own tool, so each must be the authored bytes.
  const skills = {};
  for (const relative of [
    'dude-engine/lib/pack-sources.mjs',
    'dude-compose/compose.mjs',
    'dude-compose/SKILL.md',
    'dude-lint/lint.mjs',
    'dude-bundle-upgrade/upgrade.mjs',
    'dude-bundle-import/SKILL.md',
  ]) {
    const authored = sourceBytes(`src/skills/${relative}`);
    const installed = fs.readFileSync(path.join(root, '.github/skills', ...relative.split('/')));
    assert.equal(installed.equals(authored), true, `installed core skill drift: ${relative}`);
    skills[relative] = sha256(installed);
  }
  const forbidden = [
    '.github/extensions/dude/frontend',
    '.github/extensions/dude/needs-you.test.mjs',
    '.github/extensions/dude/review.test.mjs',
    '.github/extensions/dude/node_modules',
    'scripts/dude-canvas-ui',
  ].filter((relative) => fs.existsSync(path.join(root, ...relative.split('/'))));
  assert.deepEqual(forbidden, []);
  // A release ships no saved sources: that file belongs to the project, and a fresh install has none.
  assert.equal(fs.existsSync(path.join(root, ...SOURCES_PATH.split('/'))), false,
    'a release ships no .dude/metadata/pack-sources.md');
  return { pairs, skills, forbidden };
}

/** Reuse a byte-checked disposable release when supplied; never build in ROOT.
 * @param {string} root
 */
function installRelease(root) {
  if (!RELEASE_DIR) return buildRelease({ repoRoot: ROOT, outDir: root, ref: 'v0.0.0-t012' });
  installedParity(RELEASE_DIR);
  const files = [];
  const collect = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assert.equal(entry.isSymbolicLink(), false, `prebuilt release contains a link: ${relative}`);
      if (entry.isDirectory()) collect(path.join(directory, entry.name), relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  collect(RELEASE_DIR);
  assert.equal(fs.existsSync(root), false, 'fixture install must not replace an existing directory');
  fs.cpSync(RELEASE_DIR, root, { recursive: true, errorOnExist: true, force: false });
  return { files: files.sort(), reused: RELEASE_DIR };
}

/** @param {string} root @param {'blank-non-git'|'blank-git'} kind */
function assertBlankInstall(root, kind) {
  for (const relative of ['.dude/ideas', '.dude/specs', '.beads']) {
    assert.equal(fs.existsSync(path.join(root, relative)), false);
  }
  const git = command('git', ['-C', root, 'rev-parse', '--show-toplevel']);
  assert.equal(git.exitCode, kind === 'blank-git' ? 0 : 128);
  return { gitExitCode: git.exitCode, topLevel: git.stdout.trim() || null };
}

/**
 * Capture the first idea from a blank install. With `development`, the
 * unsent idea first waits through one installed Settings > About visit that
 * reads the pre-seeded development base, and must return unchanged.
 * @param {Cdp} page @param {string} canvasUrl @param {string} intent
 * @param {{modelError:string|null}} modelState
 * @param {{root:string,name:string,cliVersions:string[]}|null} [development]
 */
async function driveBlankCapture(page, canvasUrl, intent, modelState, development = null) {
  const runtimeErrors = [];
  const network = [], foreignNetwork = [];
  page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(canvasUrl)) {
      network.push({ method: event.request.method, path: new URL(event.request.url).pathname });
    } else if (/^https?:/.test(event.request.url)
      && !['127.0.0.1', 'localhost'].includes(new URL(event.request.url).hostname)) {
      foreignNetwork.push(event.request.url);
    }
  });
  await navigate(page, canvasUrl, 360);
  await visible(page, 'Welcome to Dude');
  await click(page, button('New idea'));
  await fill(page, field('Your idea'), intent);
  let about = null;
  if (development) {
    await click(page, `document.querySelector('#dude-tab-settings')`);
    await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
      ?.getAttribute('aria-busy') === 'false'`), `${development.name} installed Settings pack read`);
    about = await observeInstalledAbout(page, canvasUrl, development.root, `${development.name}-development`,
      development.cliVersions, DEVELOPMENT_ABOUT);
    await click(page, `document.querySelector('#dude-tab-new')`);
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), intent,
      'the unsent idea returns unchanged after the installed About visit');
    about.returnedDraftSha256 = sha256(intent);
  }
  await click(page, button('Save'));
  await visible(page, 'Awaiting acknowledgment');
  await until(async () => modelState.modelError
    || await evaluate(page, `document.body.innerText.includes('Idea saved')`), 'installed blank capture');
  if (modelState.modelError) throw new Error(modelState.modelError);
  await click(page, button('Overview'));
  assert.deepEqual(runtimeErrors, []);
  assert.equal(network.filter((entry) => entry.path === '/api/needs-you/capture').length, 1);
  assert.equal(network.filter((entry) => entry.path === '/api/about').length, development ? 1 : 0);
  if (development) assert.deepEqual(foreignNetwork, [], 'installed About rendering contacts no other origin');
  return { network, foreignNetwork, about, screenshot: await screenshot(page, `blank-${sha256(intent).slice(0, 8)}`) };
}

/**
 * Drive the complete installed Settings request while the deterministic owner
 * above performs preview, permission recognition, Compose, verification, and
 * result acknowledgment through the installed CLI.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {ReturnType<typeof seedPackFixture>} fixture
 * @param {ReturnType<typeof createPackModel>['state']} model
 * @param {string[]} cliVersions
 */
async function driveInstalledPackRoundTrip(page, canvasUrl, fixture, model, cliVersions) {
  const network = [], foreignNetwork = [];
  const runtimeErrors = [];
  page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(canvasUrl)) {
      network.push({
        method: event.request.method,
        path: new URL(event.request.url).pathname,
        body: event.request.postData ? JSON.parse(event.request.postData) : null,
      });
    } else if (/^https?:/.test(event.request.url)
      && !['127.0.0.1', 'localhost'].includes(new URL(event.request.url).hostname)) {
      foreignNetwork.push(event.request.url);
    }
  });
  const beforeProfile = fs.readFileSync(fixture.profile);
  assert.equal(fs.existsSync(fixture.destination), false);
  await navigate(page, canvasUrl, 1440);
  await fill(page, field('Search work'), 'installed pack host');
  await click(page, `document.querySelector('[data-work-path="${fixture.work.ideaPath}"]')`);
  await until(() => evaluate(page, `document.querySelector('[aria-label="Working on"]')
    ?.textContent.includes('Installed pack host continuity')`), 'installed current-work selection');
  const selectedProjection = await awaitSelectedProjection(
    canvasUrl,
    fixture.work.ideaPath,
    'installed current-work server projection',
  );
  const currentWork = {
    identity: await evaluate(page, `document.querySelector('[aria-label="Working on"]')
      ?.textContent.replace(/\\s+/g, ' ').trim()`),
    selected: selectedProjection.projection?.selected ?? null,
  };
  assert.equal(currentWork.identity.includes('002'), true);
  assert.equal(currentWork.identity.includes('Installed pack host continuity'), true);
  assert.deepEqual({
    title: currentWork.selected?.title,
    ideaPath: currentWork.selected?.ideaPath,
    slug: currentWork.selected?.slug,
    specPath: currentWork.selected?.specPath,
  }, {
    title: 'Installed pack host continuity',
    ideaPath: fixture.work.ideaPath,
    slug: 'installed-pack-host',
    specPath: fixture.work.specPath,
  });
  assert.equal(typeof currentWork.selected?.explicit, 'boolean');

  await click(page, `document.querySelector('#dude-tab-settings')`);
  await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
    ?.getAttribute('aria-busy') === 'false'`), 'installed Settings pack read');
  assert.equal(await evaluate(page, `document.querySelector('[data-pack-context="installed"]')
    ?.getAttribute('aria-selected')`), 'true');
  // Entering Settings reads installed packs and the saved sources, and no catalog: one explicit
  // Reload reads the catalogs, so Available lists the pack (its row key names its source).
  await evaluate(page, `performance.setResourceTimingBufferSize(1000); performance.clearResourceTimings()`);
  await click(page, `document.querySelector('[aria-label="Reload packs"]')`);
  await until(() => evaluate(page, `performance.getEntriesByType('resource').some(entry => {
    const url = new URL(entry.name); return url.pathname === '/api/packs' && url.search === '?discover=1'; })`), 'installed-host explicit catalog read');
  await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
    ?.getAttribute('aria-busy') === 'false'`), 'installed-host catalog read commits');
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  await until(() => evaluate(page, `Boolean(document.querySelector(
    '[data-pack-row^="pack:${PACK_NAME}@"]'
  ))`), 'installed-host available pack row');
  await click(page, `document.querySelector('[data-pack-row^="pack:${PACK_NAME}@"]')`);
  assert.equal(await evaluate(page, `document.querySelector('[data-pack-description]')
    ?.textContent.trim()`), 'Deterministic installed-host pack round trip.');
  const packsBeforeAbout = await evaluate(page, `({
    context: document.querySelector('[data-pack-context][aria-selected="true"]')?.dataset.packContext,
    detail: document.querySelector('[data-pack-detail]')?.dataset.packDetail,
    detailOpen: Boolean(document.querySelector('[data-pack-detail]')?.open),
  })`);
  const aboutBeforeRequest = await observeInstalledAbout(
    page,
    canvasUrl,
    fixture.root,
    'before-request',
    cliVersions,
  );
  await returnInstalledPacks(page);
  assert.deepEqual(await evaluate(page, `({
    context: document.querySelector('[data-pack-context][aria-selected="true"]')?.dataset.packContext,
    detail: document.querySelector('[data-pack-detail]')?.dataset.packDetail,
    detailOpen: Boolean(document.querySelector('[data-pack-detail]')?.open),
  })`), packsBeforeAbout, 'installed Packs selection survives its local About visit');
  await click(page, button('Now'));
  await until(() => evaluate(page, `document.querySelector('[aria-label="Working on"]')
    ?.textContent.includes('Installed pack host continuity')`), 'installed current work after About');
  const returnedProjection = await readCanvasProjection(canvasUrl);
  assert.deepEqual({
    identity: await evaluate(page, `document.querySelector('[aria-label="Working on"]')
      ?.textContent.replace(/\\s+/g, ' ').trim()`),
    selected: returnedProjection.projection?.selected ?? null,
  }, currentWork, 'installed current-work identity survives About');
  await click(page, `document.querySelector('#dude-tab-settings')`);
  await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
    ?.getAttribute('aria-busy') === 'false'`), 'installed Settings re-entry pack read');
  assert.equal(await evaluate(page, `document.querySelector('[data-pack-context="installed"]')
    ?.getAttribute('aria-selected')`), 'true');
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  await until(() => evaluate(page, `Boolean(document.querySelector(
    '[data-pack-row^="pack:${PACK_NAME}@"]'
  ))`), 'installed-host available pack row after About');
  await click(page, `document.querySelector('[data-pack-row^="pack:${PACK_NAME}@"]')`);

  const action = `document.querySelector('[data-pack-operation="install"]')`;
  assert.equal(await evaluate(page, `${action}.disabled`), false);
  await evaluate(page, `(() => { const action = ${action}; action.click(); action.click(); })()`);
  await until(() => model.phase === 'permission-waiting' || model.modelError,
    'installed owner permission publication', 45_000);
  if (model.modelError) throw new Error(model.modelError);
  await until(() => evaluate(page, `document.querySelector(
    '[data-pack-request-dialog][open] [data-pack-request-phase]'
  )?.getAttribute('data-pack-request-phase') === 'waiting_permission'`),
  'installed pack request waits for exact permission', 45_000);
  assert.equal(model.packPromptRequests, 1);
  assert.equal(fs.existsSync(fixture.destination), false,
    'no projected artifact exists before exact consent');
  assert.equal(fs.readFileSync(fixture.profile).equals(beforeProfile), true,
    'profile bytes remain exact before consent');
  assert.deepEqual(model.preview, {
    operation: 'install',
    name: PACK_NAME,
    source: fixture.source,
    files: fixture.files,
    tools: [{ name: 'node', available: true, version: process.version }],
    profileRevision: revision(beforeProfile),
    sourceRevision: revision(Buffer.concat([fixture.manifest, fixture.instruction])),
    targetRevision: 'absent',
  });
  const pending = await readNeedsYou(canvasUrl);
  assert.equal(pending.packRequests.length, 1);
  assert.equal(pending.packRequests[0].operation, 'install');
  assert.equal(pending.packRequests[0].name, PACK_NAME);
  assert.equal(pending.packRequests[0].phase, 'waiting_permission');
  const permissionAuthority = {
    packReceipt: pending.packRequests[0].packReceipt,
    receiptId: pending.packRequests[0].receipt.receiptId,
    requestHandle: pending.packRequests[0].permissionRequest,
  };
  await click(page, button('Return to packs'));
  const aboutWaitingPermission = await observeInstalledAbout(
    page,
    canvasUrl,
    fixture.root,
    'waiting-permission',
    cliVersions,
  );
  const pendingAfterAbout = (await readNeedsYou(canvasUrl)).packRequests[0];
  assert.equal(pendingAfterAbout.phase, 'waiting_permission');
  assert.deepEqual({
    packReceipt: pendingAfterAbout.packReceipt,
    receiptId: pendingAfterAbout.receipt.receiptId,
    requestHandle: pendingAfterAbout.permissionRequest,
  }, permissionAuthority, 'About does not replace installed request or permission authority');
  await returnInstalledPacks(page);
  await click(page, button('View pack request'));
  await until(() => evaluate(page, `document.querySelector(
    '[data-pack-request-dialog][open] [data-pack-request-phase]'
  )?.getAttribute('data-pack-request-phase') === 'waiting_permission'`),
  'installed pack request returns after About');
  await click(page, button('Open Needs you'));
  await visible(page, model.permissionRequest.prompt);
  await fill(page, field('Enter the exact confirmation'), `INSTALL PACK ${PACK_NAME}`);
  await click(page, field('I grant permission for this operation on these exact targets.'));
  await click(page, button('Send permission'));
  await visible(page, 'Awaiting acknowledgment');
  await until(() => model.phase === 'complete' || model.modelError,
    'installed Compose result acknowledgment', 60_000);
  if (model.modelError) throw new Error(model.modelError);
  await until(async () => !(await evaluate(page, `document.body.innerText.includes('Reading repository state')`))
    && (await readNeedsYou(canvasUrl)).packRequests[0]?.phase === 'applied',
  'installed authoritative pack reread', 45_000);
  if (await evaluate(page, `Boolean(${button('Back to pack request')})`)) {
    await click(page, button('Back to pack request'));
  } else {
    await click(page, `document.querySelector('#dude-tab-settings')`);
    await click(page, button('View pack request'));
  }
  await until(() => evaluate(page, `document.querySelector(
    '[data-pack-request-dialog][open] [data-pack-request-phase]'
  )?.getAttribute('data-pack-request-phase') === 'applied'`),
  'installed pack dialog displays correlated Applied');
  const provider = await readNeedsYou(canvasUrl);
  assert.equal(provider.packRequests.length, 1);
  const result = provider.packRequests[0];
  assert.equal(result.applied, true);
  assert.equal(result.receipt.freshness, 'current');
  assert.deepEqual(result.receipt.acknowledgment.result, JSON.parse(model.compose.stdout),
    'the Applied receipt carries the observed Compose --envelope stdout, not a predetermined result');
  assert.deepEqual(result.receipt.reread.entry, {
    files: fixture.files,
    source: fixture.source,
  });
  assert.equal(result.receipt.reread.profileRevision,
    revision(fs.readFileSync(fixture.profile)));
  assert.equal(fs.readFileSync(fixture.destination).equals(fixture.instruction), true);
  assert.deepEqual(installedProfile(fixture.root).value.installed[PACK_NAME], {
    files: fixture.files,
    source: fixture.source,
  });
  assert.equal(model.ownerToolCalls.filter(entry => entry.callId === 'call_t012_pack_add').length, 1);
  assert.equal(network.filter(entry => entry.path === '/api/packs/request').length, 2);
  // Default-only evidence, unchanged by sources: neither body names a source, the receipt binds none, and
  // the owner's handoff carried the seven-key binding and nothing else (checked as it arrived).
  assert.deepEqual(network.filter(entry => entry.path === '/api/packs/request').map(entry => entry.body), [
    { op: 'prepare', operation: 'install', name: PACK_NAME },
    { op: 'submit', operation: 'install', name: PACK_NAME, packReceipt: permissionAuthority.packReceipt },
  ], 'a default-catalog request names no source in either body');
  assert.equal(Object.hasOwn(result.receipt, 'catalogSource'), false, 'and its receipt binds no source');
  assert.deepEqual(Object.keys(model.binding),
    ['receiptId', 'owner', 'operation', 'name', 'workspaceId', 'sessionId', 'providerGeneration']);
  assert.equal(model.permissionRequest.fields.targets.some((entry) => /Third-party source/.test(entry.target)), false,
    'a default-catalog permission names no third-party source');
  await click(page, button('Return to packs'));
  const aboutApplied = await observeInstalledAbout(
    page,
    canvasUrl,
    fixture.root,
    'applied-result',
    cliVersions,
  );
  const appliedAfterAbout = (await readNeedsYou(canvasUrl)).packRequests[0];
  assert.equal(appliedAfterAbout.phase, 'applied');
  assert.equal(appliedAfterAbout.packReceipt, permissionAuthority.packReceipt);
  assert.equal(appliedAfterAbout.receipt.receiptId, permissionAuthority.receiptId);
  await returnInstalledPacks(page);
  await click(page, button('View pack request'));
  await until(() => evaluate(page, `document.querySelector(
    '[data-pack-request-dialog][open] [data-pack-request-phase]'
  )?.getAttribute('data-pack-request-phase') === 'applied'`),
  'installed applied result returns after About');
  assert.equal(network.filter(entry => entry.method === 'GET' && entry.path === '/api/about').length, 3);
  assert.deepEqual(foreignNetwork, [], 'installed About rendering makes no GitHub request');
  assert.deepEqual(runtimeErrors, []);
  return {
    network,
    foreignNetwork,
    provider,
    currentWork,
    about: {
      beforeRequest: aboutBeforeRequest,
      waitingPermission: aboutWaitingPermission,
      applied: aboutApplied,
      permissionAuthority,
      appliedAuthority: {
        packReceipt: appliedAfterAbout.packReceipt,
        receiptId: appliedAfterAbout.receipt.receiptId,
      },
      browserRequests: network.filter(entry => entry.path === '/api/about'),
      embeddedDesktopLinkObserved: false,
    },
    preview: model.preview,
    permission: model.permission,
    permissionAcknowledgment: model.permissionAcknowledgment,
    compose: model.compose,
    verification: model.verification,
    result: model.result,
    screenshot: await screenshot(page, 'installed-pack-applied'),
  };
}

const IMPORT_READY_NOTE = 'Dude previews the import and asks for your permission in Needs you before changing any file.';
const IMPORT_NEW_SESSION = 'New agents or skills may not be available until you start a new session.';
const IMPORT_REASON_PERMISSION = 'This import request is waiting for your permission response in Needs you.';
const IMPORT_IDEA_REASON = 'An artifact import is in progress or needs owner reconciliation. Your idea draft stays here.';
const IMPORT_PACK_REASON = 'An artifact import needs owner reconciliation before a pack request can be sent.';
const PROJECT_READ_ONLY = 'Read only. Project agents and skills are project files, not packs: Canvas offers no install, refresh, or remove for them here.';

/**
 * What the Add/import panel shows now: the request status, the written paths,
 * Request import with its reason, and Show in Installed with its note.
 * @param {Cdp} page
 */
function importStatusView(page) {
  return evaluate(page, `(() => {
    const bar = document.querySelector('[data-import-status]'), show = document.querySelector('[data-import-show-button]');
    const rows = [...document.querySelectorAll('[data-import-request-status] dl > div')];
    const label = row => row.querySelector('dt').textContent;
    return {
      phase: bar?.getAttribute('data-import-phase') ?? null,
      title: bar?.querySelector('.fui-MessageBarTitle')?.textContent ?? null,
      text: bar?.querySelector('[role="status"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
      focused: Boolean(bar) && document.activeElement === bar,
      sheet: Object.fromEntries(rows.map(row => [label(row), row.querySelector('dd').innerText.replace(/\\s+/g, ' ').trim()])),
      paths: Object.fromEntries(rows.filter(row => /^(Written files|Uncertain paths)/.test(label(row)))
        .map(row => [label(row), [...row.querySelectorAll('li code')].map(code => code.textContent)])),
      permission: document.querySelector('[data-import-permission]')?.getAttribute('data-import-permission') ?? null,
      request: {
        disabled: document.querySelector('[data-import-request]')?.disabled ?? null,
        note: document.querySelector('[data-import-note]')?.textContent ?? null,
      },
      show: show ? { disabled: show.disabled, note: document.querySelector('[data-import-show-note]')?.textContent } : null,
      source: document.querySelector('[data-import-source]')?.value ?? null,
    };
  })()`);
}

/**
 * Which Packs view is open, its page and count text, the selection, and every
 * row key shown. Row identity is the opaque key, never the name.
 * @param {Cdp} page
 */
function packListView(page) {
  return evaluate(page, `({
    context: document.querySelector('[data-pack-context][aria-selected="true"]')?.getAttribute('data-pack-context') ?? null,
    filter: document.querySelector('[data-pack-toolbar] [role="combobox"]')?.textContent.trim() ?? null,
    sourceFilter: document.querySelector('[data-pack-source-filter]')?.textContent.trim() ?? null,
    count: document.querySelector('[data-pack-count]')?.textContent ?? null,
    page: document.querySelector('[data-pack-page]')?.textContent ?? null,
    totals: Object.fromEntries([...document.querySelectorAll('[data-pack-total]')]
      .map(node => [node.getAttribute('data-pack-total'), node.textContent])),
    selected: [...document.querySelectorAll('[data-pack-row][aria-selected="true"]')].map(node => node.getAttribute('data-pack-row')),
    detail: document.querySelector('[data-pack-detail]')?.getAttribute('data-pack-detail') || null,
    open: Boolean(document.querySelector('[data-pack-detail]')?.open),
    keys: [...document.querySelectorAll('[data-pack-row]')].map(node => node.getAttribute('data-pack-row')),
    activeRow: document.activeElement?.getAttribute('data-pack-row') ?? null,
    activeTab: document.activeElement?.getAttribute('data-pack-context') ?? null,
    closeFocused: document.activeElement?.getAttribute('aria-label') === 'Close project details',
    empty: document.querySelector('[data-pack-empty]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
  })`);
}

/**
 * The open project details, in the order the page shows them, and whether the
 * selected row is visible below the table's sticky header.
 * @param {Cdp} page
 */
function projectDetailView(page) {
  return evaluate(page, `(() => {
    const dialog = document.querySelector('[data-pack-detail]');
    const body = dialog?.querySelector('[data-pack-detail-body]');
    if (!body) return null;
    const text = node => node.textContent.replace(/\\s+/g, ' ').trim();
    const facts = [...body.querySelectorAll('dl > dt')].map(term => [text(term), text(term.nextElementSibling)]);
    const files = body.querySelector('details');
    const row = document.querySelector('[data-pack-row="' + dialog.getAttribute('data-pack-detail') + '"]');
    const scroller = document.querySelector('[data-pack-scroll]');
    const header = scroller?.querySelector('[role="row"]')?.getBoundingClientRect();
    const rect = row?.getBoundingClientRect(), view = scroller?.getBoundingClientRect();
    return {
      heading: dialog.querySelector('h2')?.textContent,
      scope: text(dialog.querySelector('header .fui-Text')),
      description: body.querySelector('[data-pack-description]')?.textContent,
      readOnly: body.querySelector('[data-pack-readonly]')?.textContent,
      facts,
      filesSummary: files ? text(files.querySelector('summary')) : null,
      files: files ? [...files.querySelectorAll('li code')].map(code => code.textContent) : [],
      caveat: [...body.querySelectorAll('.fui-Text')].some(node => text(node) === ${JSON.stringify(IMPORT_NEW_SESSION)}),
      operations: body.querySelectorAll('[data-pack-operation]').length,
      links: body.querySelectorAll('a, [href]').length,
      close: dialog.querySelector('header button')?.getAttribute('aria-label') ?? null,
      modal: dialog.matches(':modal'),
      rowVisible: Boolean(rect && view && header && rect.top >= header.bottom - 1 && rect.bottom <= view.bottom + 1),
    };
  })()`);
}

/** Space on the focused control, as a keyboard user presses it. @param {Cdp} page */
async function pressSpace(page) {
  for (const type of ['keyDown', 'keyUp']) {
    await page.send('Input.dispatchKeyEvent', {
      type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32,
      ...(type === 'keyDown' ? { text: ' ', unmodifiedText: ' ' } : {}),
    });
  }
}

/** The details' content without how they are presented: overlay or docked, and where the row sits. */
const projectContent = ({ modal, rowVisible, ...content }) => content;

/**
 * The Sources view as a person reads it: every row's opaque key, accessible label and selection, the count
 * line, the empty and coverage notes, the outside status, and Add source.
 * @param {Cdp} page
 */
function sourcesView(page) {
  return evaluate(page, `(() => {
    const text = node => node ? node.innerText.replace(/\\s+/g, ' ').trim() : null;
    const note = document.querySelector('[data-source-status]');
    return {
      rows: [...document.querySelectorAll('[data-source-row]')].map(row => ({
        key: row.getAttribute('data-source-row'), label: row.getAttribute('aria-label'),
        selected: row.getAttribute('aria-selected') === 'true',
      })),
      count: document.querySelector('[data-sources-count]')?.textContent ?? null,
      noAdded: text(document.querySelector('[data-sources-no-added]')),
      coverage: text(document.querySelector('[data-sources-coverage]')),
      note: note ? { title: note.getAttribute('data-source-status-title'), text: text(note.querySelector('[role="status"]')) } : null,
      add: { disabled: document.querySelector('[data-sources-add]')?.disabled ?? null },
      dialogOpen: Boolean(document.querySelector('[data-source-add-dialog][open]')),
    };
  })()`);
}

/**
 * The open source details, in the order the page shows them: the heading and scope, any coverage notice,
 * the description, the actions with their reason, the read-only note, and the facts.
 * @param {Cdp} page
 */
function sourceDetailView(page) {
  return evaluate(page, `(() => {
    const dialog = document.querySelector('[data-pack-detail]');
    const body = dialog?.querySelector('[data-source-description]') ? dialog.querySelector('[data-pack-detail-body]') : null;
    if (!body) return null;
    const text = node => node ? node.innerText.replace(/\\s+/g, ' ').trim() : null;
    const remove = body.querySelector('[data-source-remove]');
    return {
      key: dialog.getAttribute('data-pack-detail'),
      heading: dialog.querySelector('h2')?.textContent,
      scope: text(dialog.querySelector('header .fui-Text')),
      notice: text(body.querySelector('[data-source-notice]')),
      description: text(body.querySelector('[data-source-description]')),
      show: { disabled: body.querySelector('[data-source-show]')?.disabled ?? null },
      remove: remove ? { disabled: remove.disabled, label: remove.getAttribute('aria-label') } : null,
      reason: text(body.querySelector('[data-source-reason]')),
      readOnly: text(body.querySelector('[data-source-readonly]')),
      facts: Object.fromEntries([...body.querySelectorAll('dl > dt')].map(term => [text(term), text(term.nextElementSibling)])),
      links: body.querySelectorAll('a, [href]').length,
      close: dialog.querySelector('header button')?.getAttribute('aria-label') ?? null,
      closeFocused: document.activeElement?.getAttribute('aria-label') === 'Close source details',
      open: dialog.open,
      modal: dialog.matches(':modal'),
    };
  })()`);
}

/**
 * The details of the open pack row: its heading, description, source label and location, and the one
 * operation each action offers, as the Available and Installed lists show them.
 * @param {Cdp} page
 */
function packDetailView(page) {
  return evaluate(page, `(() => {
    const dialog = document.querySelector('[data-pack-detail]');
    const body = dialog?.querySelector('[data-pack-description]') ? dialog.querySelector('[data-pack-detail-body]') : null;
    if (!body) return null;
    const text = node => node ? node.innerText.replace(/\\s+/g, ' ').trim() : null;
    return {
      key: dialog.getAttribute('data-pack-detail'),
      heading: dialog.querySelector('h2')?.textContent,
      description: text(body.querySelector('[data-pack-description]')),
      source: text(body.querySelector('[data-pack-source]')),
      location: text(body.querySelector('[data-pack-origin]')),
      operations: [...body.querySelectorAll('[data-pack-operation]')].map(node => [node.getAttribute('data-pack-operation'), node.disabled]),
      text: text(body),
    };
  })()`);
}

/**
 * Drive the shipped Add/import route in the owned Edge while the installed owner
 * model above previews, publishes the literal permission, applies with the
 * unchanged importer, verifies, and acknowledges, for one local file and one
 * local directory. The browser only requests, consents through Needs you, and
 * observes; it applies nothing. Each Applied result is followed, without
 * Reload, by Show in Installed. The same journey exercises the standalone
 * Phase A surface, return, draft retention, shared exclusion, and a refresh
 * that keeps the surviving selection against the real installed provider.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {ReturnType<typeof importFixture>} fixture
 * @param {ReturnType<typeof createImportModel>} ownerModel
 */
async function driveInstalledImportRoundTrip(page, canvasUrl, fixture, ownerModel) {
  const model = ownerModel.state;
  const network = [], foreignNetwork = [], runtimeErrors = [];
  page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(canvasUrl)) {
      const url = new URL(event.request.url);
      network.push({
        method: event.request.method,
        path: url.pathname,
        query: url.search,
        body: event.request.postData ? JSON.parse(event.request.postData) : null,
      });
    } else if (/^https?:/.test(event.request.url)
      && !['127.0.0.1', 'localhost'].includes(new URL(event.request.url).hostname)) {
      foreignNetwork.push(event.request.url);
    }
  });
  const packReads = () => network.filter((entry) => entry.method === 'GET' && entry.path === '/api/packs').length;
  // Phase B reads a catalog only when it is asked to: `?discover=1` is the explicit discovery, and every
  // other read of this journey (Settings entry, a result's hint, window focus) is installed state and the
  // local project read.
  const discoveries = () => network.filter((entry) => entry.method === 'GET' && entry.path === '/api/packs'
    && entry.query === '?discover=1').length;
  const steps = [], audits = [], journeys = [];
  const step = (input, target, details = {}) => steps.push({ input, target, ...details });
  const draft = 'An idea draft that stays through both imports, every return, and every refresh.';
  const failed = () => { if (model.modelError) throw new Error(model.modelError); };
  const settled = async (label, ready) => {
    await until(async () => { failed(); return ready(); }, label, 60_000);
  };

  await navigate(page, canvasUrl, 1440);
  await click(page, button('New idea'));
  await fill(page, field('Your idea'), draft);
  step('pointer', 'New idea, typed an unsent draft', { draftSha256: sha256(draft) });
  await click(page, `document.querySelector('#dude-tab-settings')`);
  await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
    ?.getAttribute('aria-busy') === 'false' && Boolean(document.querySelector('[data-settings]'))`),
  'installed Settings pack read');
  // Thirty hand-made skills: Installed already needs two 25-row pages before any import.
  await settled('installed count of the seeded project rows',
    async () => (await packListView(page)).totals.installed === String(fixture.fillNames.length));

  // The complete Phase B surface in a workspace that has not asked for a catalog: Packs and About, then the
  // four views with Sources last. Installed is already useful (the project rows), Available is unknown,
  // and nothing has acquired a catalog.
  const surface = await evaluate(page, `(() => {
    const settings = document.querySelector('[data-settings]');
    const text = node => node.innerText.replace(/\\s+/g, ' ').trim();
    return {
      sections: [...settings.querySelectorAll('[data-settings-section]')].map(node => node.getAttribute('data-settings-section')),
      tabs: [...settings.querySelectorAll('[role="tab"]')].map(text),
      contexts: [...settings.querySelectorAll('[data-pack-context]')].map(node => node.getAttribute('data-pack-context')),
      text: settings.innerText,
      controls: [...settings.querySelectorAll('button, [role="tab"]')].map(text),
    };
  })()`);
  assert.deepEqual(surface.sections, ['packs', 'about']);
  assert.deepEqual(surface.contexts, ['installed', 'available', 'import', 'sources']);
  assert.deepEqual(surface.tabs, ['Packs', 'About', `Installed ${fixture.fillNames.length}`, 'Available ?', 'Add/import', 'Sources']);
  assert.equal(discoveries(), 0, 'entering Settings reads installed packs and project rows, never a catalog');
  let list = await packListView(page);
  assert.deepEqual(
    [list.context, list.filter, list.count, list.page, list.selected, list.detail, list.open],
    ['installed', 'All use cases', `1–25 of ${fixture.fillNames.length}`, 'Page 1 of 2', [], null, false],
  );
  assert.deepEqual(list.keys, fixture.fillNames.slice(0, 25).map((name) => `project:skill:${name}`));

  // A hand-made row: listed as a read-only project file, with no provenance and no action.
  const handMade = fixture.fillNames[2];
  await click(page, `document.querySelector('[data-pack-row="project:skill:${handMade}"]')`);
  await settled('hand-made details', async () => (await packListView(page)).detail === `project:skill:${handMade}`);
  let details = await projectDetailView(page);
  assert.deepEqual(projectContent(details), {
    heading: handMade,
    scope: 'Installed · This project',
    description: `Hand-made ${handMade}.`,
    readOnly: PROJECT_READ_ONLY,
    facts: [
      ['Type', 'Skill'], ['Location', `.github/skills/${handMade}`],
      ['Declared name', handMade], ['File count', '1 file'],
    ],
    filesSummary: 'Files (1)',
    files: [`.github/skills/${handMade}/SKILL.md`],
    caveat: true,
    operations: 0,
    links: 0,
    close: 'Close project details',
  });
  assert.equal(/import/i.test(details.description + details.readOnly), false,
    'a hand-made row claims no import provenance');
  await pressKey(page, 'Escape');
  await settled('hand-made details closed', async () => (await packListView(page)).detail === null);
  step('pointer+keyboard', 'hand-made project row opened, Escape closed it', { key: `project:skill:${handMade}` });
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  // Phase B: entering Settings read no catalog, so Available is unknown and empty, and offers the read.
  await settled('Available waits for a read', async () => (await packListView(page)).empty?.startsWith('Catalog not read yet'));
  list = await packListView(page);
  assert.deepEqual([list.totals.available, list.keys, discoveries()], ['?', [], 0], 'Available is unknown before any catalog read');
  // The one explicit Reload is the only catalog discovery of this journey until its last step, and it lists
  // the one pack by its source-qualified key.
  await click(page, `document.querySelector('[aria-label="Reload packs"]')`);
  await settled('the explicit catalog read commits', async () => discoveries() === 1 && (await evaluate(page,
    `document.querySelector('[aria-label="Reload packs"]')?.getAttribute('aria-busy') === 'false'`)));
  await settled('available pack row', async () => (await packListView(page)).keys.length === 1);
  const packKey = (await packListView(page)).keys[0];
  assert.match(packKey, new RegExp(`^pack:${PACK_NAME}@[^@]+$`), 'an Available row is keyed by its pack and its source');
  assert.equal((await packListView(page)).totals.available, '1', 'Available lists packs only');
  step('pointer', 'Reload packs: the explicit catalog read', { discoveries: discoveries(), key: packKey });

  // Add/import: one labeled Source, Request import ready, and no request yet.
  await click(page, `document.querySelector('[data-pack-context="import"]')`);
  await settled('Add/import panel', () => evaluate(page,
    `Boolean(document.querySelector('[data-import-panel]:not([hidden])'))`));
  let status = await importStatusView(page);
  assert.deepEqual(
    [status.phase, status.source, status.request],
    [null, '', { disabled: false, note: IMPORT_READY_NOTE }],
  );
  assert.equal(await evaluate(page, `document.querySelector('[data-import-heading]').textContent`),
    'Import an agent or skill');
  audits.push(await auditInstalledWorkspace(page, 'import-idle'));

  /**
   * One request through the shipped route: the UI prepares and submits once, the
   * owner publishes the literal permission, and the person consents in Needs you.
   * @param {number} index @param {typeof fixture.file} imported @param {boolean} keyboard
   */
  const requestAndConsent = async (index, imported, keyboard) => {
    await fill(page, `document.querySelector('[data-import-source]')`, imported.source);
    if (keyboard) await pressKey(page, 'Enter');
    else await click(page, `document.querySelector('[data-import-request]')`);
    step(keyboard ? 'keyboard' : 'pointer', `Add/import: Request import (${index === 0 ? 'file' : 'directory'})`,
      { source: imported.source, keys: keyboard ? ['Enter'] : [] });
    await settled(`owner permission ${index}`, () => model.imports[index]?.stage === 'permission-waiting');
    await settled(`import ${index} waits for permission`, async () => (await importStatusView(page)).phase === 'waiting_permission');
    return model.imports[index];
  };

  /**
   * Hold the owner after the importer applied and verified, before it reports. The files exist and
   * a fresh project read lists them, yet Canvas shows no result: a permission reply, a delivery, and
   * the files themselves are not an Applied import. Only the owner's verified result is.
   * @param {number} index @param {typeof fixture.file} imported @param {{reached:boolean,release:()=>void}} gate
   */
  const observeBeforeResult = async (index, imported, gate) => {
    await settled(`owner ready to report import ${index}`, () => gate.reached);
    const view = await importStatusView(page);
    assert.deepEqual(
      [view.phase, view.title, view.show, view.paths, view.sheet['File changes'], view.permission],
      ['waiting_owner', 'Waiting for owner result', null, {}, undefined, null],
      'the applied files alone are not an Applied import',
    );
    const destinations = {};
    for (const [relative, expected] of imported.expected) {
      const actual = fs.readFileSync(path.join(fixture.root, ...relative.split('/')));
      assert.equal(actual.equals(expected), true, `the importer left the exact reviewed bytes at ${relative}`);
      destinations[relative] = { bytes: actual.length, sha256: sha256(actual) };
    }
    const read = await (await fetch(new URL('/api/packs', canvasUrl), { signal: AbortSignal.timeout(15_000) })).json();
    assert.equal(read.project.coverage.state, 'current');
    const listed = read.project.items.map((item) => item.key);
    const record = (await readNeedsYou(canvasUrl)).importRequests[index];
    assert.deepEqual([record.phase, record.receipt.acknowledgment, record.applied], ['waiting_owner', null, false]);
    gate.release();
    return { destinations, listed, phase: view.phase };
  };

  // ----- Import 1: the local skill file, with the shared-exclusion, return, and draft checks.
  const fileGate = ownerModel.hold('file-before-result');
  let owner = await requestAndConsent(0, fixture.file, false);
  const fileReceipt = owner.binding.receiptId;
  status = await importStatusView(page);
  assert.equal(status.focused, true, 'focus is on the request status');
  assert.equal(status.sheet['Requested source'], fixture.file.source);
  assert.equal(status.sheet.Receipt, fileReceipt);
  assert.deepEqual(status.request, { disabled: true, note: IMPORT_REASON_PERMISSION });
  assert.equal(status.show, null, 'no Show in Installed before an Applied result');
  const pending = await readNeedsYou(canvasUrl);
  assert.equal(pending.importRequests.length, 1);
  assert.deepEqual(
    [pending.importRequests[0].phase, pending.importRequests[0].importReceipt, pending.importRequests[0].importSource,
      pending.importRequests[0].sendStarted],
    ['waiting_permission', fileReceipt, fixture.file.source, true],
  );
  assert.equal(pending.importRequests[0].receipt.acknowledgment, null);
  assert.deepEqual(fixture.file.written.filter((relative) => fs.existsSync(path.join(fixture.root, ...relative.split('/')))), [],
    'nothing is written while the permission is outstanding');
  audits.push(await auditInstalledWorkspace(page, 'import-waiting-permission'));

  // Shared exclusion: the real provider refuses every other send while this import is unreconciled.
  const exclusion = {
    import: await postCanvas(canvasUrl, '/api/imports/request', { op: 'prepare', importSource: fixture.directory.source }),
    pack: await postCanvas(canvasUrl, '/api/packs/request', { op: 'prepare', operation: 'install', name: PACK_NAME }),
    capture: await postCanvas(canvasUrl, '/api/needs-you/capture-receipt', { requestHandle: null }),
  };
  for (const [kind, response] of Object.entries(exclusion)) {
    assert.deepEqual([kind, response.status, response.body?.error], [kind, 409, 'import_unreconciled']);
  }
  assert.equal(model.imports.length, 1, 'no second handoff was sent');
  // The same exclusion in the UI: New idea keeps its draft and names why it cannot send; leaving Settings
  // clears the typed Source, keeps this request, and returns to Installed.
  await click(page, button('New idea'));
  assert.equal(await evaluate(page, `${field('Your idea')}.value`), draft, 'the idea draft survives the open import');
  assert.deepEqual(await evaluate(page, `({
    submit: ${button('Submit')}.disabled, save: ${button('Save')}.disabled,
    editable: !${field('Your idea')}.disabled,
    reason: [...document.querySelectorAll('[role="group"], .fui-MessageBar')].some(node => node.innerText.includes(${JSON.stringify(IMPORT_IDEA_REASON)})),
    described: ${button('Save')}.getAttribute('aria-describedby') !== null,
  })`), { submit: true, save: true, editable: true, reason: true, described: true });
  step('pointer', 'New idea while the import waits: draft kept, Submit and Save disabled with the import reason');
  await click(page, `document.querySelector('#dude-tab-settings')`);
  await settled('Settings re-entry pack read',
    async () => (await packListView(page)).totals.installed === String(fixture.fillNames.length));
  list = await packListView(page);
  assert.deepEqual([list.context, list.page, list.selected, list.detail], ['installed', 'Page 1 of 2', [], null],
    'leaving Settings resets entry to Installed');
  await click(page, `document.querySelector('[data-pack-context="import"]')`);
  status = await importStatusView(page);
  assert.deepEqual([status.phase, status.source, status.sheet.Receipt], ['waiting_permission', '', fileReceipt],
    'the request status survives the departure; the typed Source does not');
  assert.equal(status.request.disabled, true);
  // The pack Install control carries the same reason.
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  await click(page, `document.querySelector('[data-pack-row="${packKey}"]')`);
  assert.deepEqual(await evaluate(page, `({
    install: document.querySelector('[data-pack-operation="install"]').disabled,
    reason: [...document.querySelectorAll('[data-pack-detail] .fui-Text')].map(node => node.textContent)
      .includes(${JSON.stringify(IMPORT_PACK_REASON)}),
  })`), { install: true, reason: true });
  await pressKey(page, 'Escape');
  await click(page, `document.querySelector('[data-pack-context="import"]')`);
  step('pointer', 'Available pack Install while the import waits: disabled with the import reason');

  // Consent through the real Needs you view, then return to Add/import.
  await click(page, `document.querySelector('[data-import-permission]')`);
  const permission = owner.permission.request;
  await visible(page, permission.prompt);
  for (const part of [
    permission.fields.operation,
    ...permission.fields.targets.flatMap((entry) => [...entry.target.split('\n'), `Revision: ${entry.revision}`]),
    ...permission.fields.consequences.split('\n'),
    ...permission.fields.eligibility.split('\n'),
    'Required literal confirmation',
    permission.fields.confirmation,
  ]) {
    assert.equal(await evaluate(page, `document.querySelector('#dude-panel-needs').innerText.includes(${JSON.stringify(part)})`),
      true, `Needs you shows ${JSON.stringify(part)} without truncation`);
  }
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('#dude-panel-needs button')]
    .filter(node => node.getClientRects().length).map(node => node.innerText.trim()).slice(-2)`),
  ['Send permission', 'Decline']);
  assert.equal(await evaluate(page, `Boolean(document.querySelector('#dude-panel-needs section[aria-label="Deferral"]'))`),
    false, 'a bound import offers no Defer or Save as idea');
  audits.push(await auditInstalledWorkspace(page, 'import-needs-you-file'));
  await fill(page, field('Enter the exact confirmation'), permission.fields.confirmation);
  await click(page, field('I grant permission for this operation on these exact targets.'));
  await click(page, button('Send permission'));
  step('pointer', 'Needs you: confirmation typed, consent checked, Send permission', { confirmation: permission.fields.confirmation });
  // A permission reply is acknowledged in either word, and is never the import: Add/import keeps waiting.
  const replyTitle = { accepted: 'Accepted', applied: 'Permission acknowledged' };
  await settled('permission acknowledged', () => evaluate(page,
    `document.querySelector('#dude-panel-needs [aria-label="Response status"]')?.innerText.startsWith(${JSON.stringify(replyTitle[fixture.file.permissionAck])})`));
  await click(page, button('Back to Add/import'));
  step('pointer', 'Back to Add/import');
  status = await importStatusView(page);
  assert.equal(status.focused, true, 'the return lands on the request status');
  assert.equal(status.sheet.Receipt, fileReceipt);

  // The owner applies with the importer and verifies; then it acknowledges the separate result.
  const readsBeforeResult = packReads();
  const fileBeforeResult = await observeBeforeResult(0, fixture.file, fileGate);
  await settled('file import acknowledged', () => model.imports[0].stage === 'complete');
  await settled('file import Applied', async () => (await importStatusView(page)).phase === 'applied');
  status = await importStatusView(page);
  const fileAck = model.imports[0].result.receipt.acknowledgment;
  assert.deepEqual(
    [status.title, status.sheet['Requested source'], status.sheet['Dude\'s note'], status.sheet['File changes']],
    ['Applied', fixture.file.source, fileAck.note, 'Applied. The files below were written and then verified.'],
  );
  assert.deepEqual(status.paths['Written files (2)'], fixture.file.written);
  assert.equal(status.text.includes(IMPORT_NEW_SESSION), true, 'an Applied result carries the new-session caveat');
  // No Reload: the result's own hint rereads Installed, and Show waits for it.
  await settled('Show in Installed offered without Reload', async () => (await importStatusView(page)).show?.disabled === false);
  assert.ok(packReads() > readsBeforeResult, 'the result alone caused a fresh pack and project read');
  assert.equal(discoveries(), 1, 'the result\'s hint reread installed state and the project and acquired no catalog');
  assert.equal(network.some((entry) => entry.path === '/api/packs/sources'), false);
  status = await importStatusView(page);
  assert.equal(status.show.note.startsWith('Opens Installed on the first imported agent or skill.'), true);
  audits.push(await auditInstalledWorkspace(page, 'import-applied-file'));

  /** Show in Installed, then everything the details must say about the artifact. */
  const showAndInspect = async (key, expected, total) => {
    await click(page, `document.querySelector('[data-import-show-button]')`);
    step('pointer', 'Show in Installed', { key });
    await settled('Installed details', async () => (await packListView(page)).detail === key);
    list = await packListView(page);
    assert.deepEqual(
      [list.context, list.filter, list.page, list.count, list.selected, list.detail, list.open, list.closeFocused, list.totals.installed],
      ['installed', 'All use cases', 'Page 2 of 2', `26–${total} of ${total}`, [key], key, true, true, String(total)],
    );
    assert.equal(list.keys.includes(key), true, 'the target page lists the artifact');
    details = await projectDetailView(page);
    assert.deepEqual(projectContent(details), expected);
    assert.equal(details.rowVisible, true, 'the selected row is visible below the sticky header');
    return { list, details };
  };
  const fileKey = 'project:skill:dude-local-status-review';
  const fileRow = {
    heading: 'dude-local-status-review',
    scope: 'Installed · This project',
    description: 'Summarize project status from local notes.',
    readOnly: PROJECT_READ_ONLY,
    facts: [
      ['Type', 'Skill'], ['Location', '.github/skills/dude-local-status-review'],
      ['Declared name', 'dude-local-status-review'], ['File count', '2 files'],
    ],
    filesSummary: 'Files (2)',
    files: [...fixture.file.written].sort(),
    caveat: true,
    operations: 0,
    links: 0,
    close: 'Close project details',
  };
  const shownFile = await showAndInspect(fileKey, fileRow, fixture.fillNames.length + 1);
  audits.push(await auditInstalledWorkspace(page, 'import-show-installed-file'));
  // A refresh that keeps the surviving selection: window focus (Close keeps its focus), then an
  // explicit Reload, whose own click takes focus.
  for (const [label, refresh, keepsFocus] of [
    ['window focus', () => evaluate(page, `window.dispatchEvent(new Event('focus'))`), true],
    ['Reload packs', () => click(page, `document.querySelector('[aria-label="Reload packs"]')`), false],
  ]) {
    const reads = packReads();
    await refresh();
    await settled(`${label} pack read`, async () => packReads() > reads && (await evaluate(page,
      `document.querySelector('[aria-label="Reload packs"]')?.getAttribute('aria-busy') === 'false'`)));
    // Window focus reads installed state and the project; only the explicit Reload discovers a catalog.
    assert.equal(discoveries(), label === 'Reload packs' ? 2 : 1, `${label} acquires a catalog only when it is the explicit Reload`);
    const after = await packListView(page);
    assert.deepEqual(
      [after.context, after.page, after.count, after.selected, after.detail, after.open, after.closeFocused || !keepsFocus],
      [shownFile.list.context, shownFile.list.page, shownFile.list.count, shownFile.list.selected, shownFile.list.detail, true, true],
      `${label} keeps the surviving selection, its page, and its details`,
    );
    step('refresh', `${label} after Show in Installed`, { key: fileKey });
  }
  await click(page, `document.querySelector('[aria-label="Close project details"]')`);
  await settled('details closed', async () => (await packListView(page)).detail === null);
  assert.equal((await packListView(page)).activeRow, fileKey, 'closing the details returns focus to the row');
  step('pointer', 'Close in details returns to the row', { returnedTo: fileKey });
  journeys.push({ source: 'file', receipt: fileReceipt, key: fileKey, beforeResult: fileBeforeResult });

  // ----- Import 2: the local directory (skill and agent groups), by keyboard.
  await click(page, `document.querySelector('[data-pack-context="import"]')`);
  await settled('Add/import ready for the second import', async () => {
    const view = await importStatusView(page);
    return view.request.disabled === false && view.phase === 'applied';
  });
  const directoryGate = ownerModel.hold('directory-before-result');
  owner = await requestAndConsent(1, fixture.directory, true);
  const directoryReceipt = owner.binding.receiptId;
  assert.notEqual(directoryReceipt, fileReceipt);
  status = await importStatusView(page);
  assert.equal(status.sheet['Requested source'], fixture.directory.source);
  assert.equal(status.sheet.Receipt, directoryReceipt);
  await click(page, `document.querySelector('[data-import-permission]')`);
  const directoryPermission = owner.permission.request;
  await visible(page, directoryPermission.prompt);
  for (const part of [
    directoryPermission.fields.operation,
    ...directoryPermission.fields.targets.flatMap((entry) => [...entry.target.split('\n'), `Revision: ${entry.revision}`]),
    ...directoryPermission.fields.consequences.split('\n'),
    ...directoryPermission.fields.eligibility.split('\n'),
    'Required literal confirmation',
    directoryPermission.fields.confirmation,
  ]) {
    assert.equal(await evaluate(page, `document.querySelector('#dude-panel-needs').innerText.includes(${JSON.stringify(part)})`),
      true, `Needs you shows ${JSON.stringify(part)} without truncation`);
  }
  audits.push(await auditInstalledWorkspace(page, 'import-needs-you-directory'));
  await evaluate(page, `${field('Enter the exact confirmation')}.focus()`);
  await page.send('Input.insertText', { text: directoryPermission.fields.confirmation });
  await evaluate(page, `${field('I grant permission for this operation on these exact targets.')}.focus()`);
  await pressSpace(page);
  await evaluate(page, `${button('Send permission')}.focus()`);
  await pressKey(page, 'Enter');
  step('keyboard', 'Needs you: confirmation, Space on the consent checkbox, Enter on Send permission',
    { keys: ['Space', 'Enter'], confirmation: directoryPermission.fields.confirmation });
  await settled('directory permission acknowledged', () => evaluate(page,
    `document.querySelector('#dude-panel-needs [aria-label="Response status"]')?.innerText.startsWith(${JSON.stringify(replyTitle[fixture.directory.permissionAck])})`));
  await click(page, button('Back to Add/import'));
  status = await importStatusView(page);
  assert.deepEqual([status.focused, status.source, status.sheet.Receipt], [true, fixture.directory.source, directoryReceipt],
    'the permission round trip keeps its local destination, text, and receipt, unlike an ordinary departure');
  const readsBeforeDirectoryResult = packReads();
  const directoryBeforeResult = await observeBeforeResult(1, fixture.directory, directoryGate);
  await settled('directory import acknowledged', () => model.imports[1].stage === 'complete');
  await settled('directory import Applied', async () => (await importStatusView(page)).phase === 'applied');
  status = await importStatusView(page);
  const directoryAck = model.imports[1].result.receipt.acknowledgment;
  assert.deepEqual(
    [status.title, status.sheet['Requested source'], status.sheet['Dude\'s note'], status.sheet['File changes']],
    ['Applied', fixture.directory.source, directoryAck.note, 'Applied. The files below were written and then verified.'],
  );
  assert.deepEqual(status.paths['Written files (5)'], fixture.directory.written);
  assert.equal(status.text.includes(IMPORT_NEW_SESSION), true);
  await settled('Show in Installed offered for the directory', async () => (await importStatusView(page)).show?.disabled === false);
  assert.ok(packReads() > readsBeforeDirectoryResult, 'the directory result alone caused a fresh pack and project read');
  audits.push(await auditInstalledWorkspace(page, 'import-applied-directory'));
  const directoryKey = 'project:agent:dude-local-release-notes';
  const agentRow = {
    heading: 'dude-local-release-notes',
    scope: 'Installed · This project',
    description: 'Drafts release notes from a changelog.',
    readOnly: PROJECT_READ_ONLY,
    facts: [
      ['Type', 'Agent'], ['Location', '.github/agents/dude-local-release-notes.agent.md'],
      ['Declared name', 'Release Notes'], ['File count', '3 files'],
    ],
    filesSummary: 'Files (3)',
    files: fixture.directory.written.filter((relative) => relative.startsWith('.github/agents/')).sort(),
    caveat: true,
    operations: 0,
    links: 0,
    close: 'Close project details',
  };
  const shownDirectory = await showAndInspect(directoryKey, agentRow, fixture.fillNames.length + 3);
  assert.equal(agentRow.files.some((relative) => relative.includes('.support/')), true, 'the agent .support/ companions are listed');
  audits.push(await auditInstalledWorkspace(page, 'import-show-installed-directory'));
  await pressKey(page, 'Escape');
  await settled('agent details closed', async () => (await packListView(page)).activeRow === directoryKey);
  step('keyboard', 'Escape closes the details', { returnedTo: directoryKey });
  // The directory's skill, with its companion, is a row in the same listing.
  const skillKey = 'project:skill:dude-local-log-triage';
  await click(page, `document.querySelector('[data-pack-row="${skillKey}"]')`);
  await settled('directory skill details', async () => (await packListView(page)).detail === skillKey);
  details = await projectDetailView(page);
  assert.deepEqual(projectContent(details), {
    heading: 'dude-local-log-triage',
    scope: 'Installed · This project',
    description: 'Triage a log excerpt the user pastes.',
    readOnly: PROJECT_READ_ONLY,
    facts: [
      ['Type', 'Skill'], ['Location', '.github/skills/dude-local-log-triage'],
      ['Declared name', 'dude-local-log-triage'], ['File count', '2 files'],
    ],
    filesSummary: 'Files (2)',
    files: fixture.directory.written.filter((relative) => relative.startsWith('.github/skills/')).sort(),
    caveat: true,
    operations: 0,
    links: 0,
    close: 'Close project details',
  });
  await pressKey(page, 'Escape');
  await settled('directory skill details closed', async () => (await packListView(page)).detail === null);
  journeys.push({
    source: 'directory', receipt: directoryReceipt, key: directoryKey, skill: skillKey, beforeResult: directoryBeforeResult,
  });

  // The same Show in Installed on a narrow screen, in both themes: below 1100px the details are a modal
  // overlay, and Close still takes focus on the same artifact, on its page.
  const narrowViews = [];
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    await installedViewport(page, 360, theme, 900);
    await click(page, `document.querySelector('[data-pack-context="import"]')`);
    await settled(`Show in Installed offered at 360px ${theme}`,
      async () => (await importStatusView(page)).show?.disabled === false);
    await click(page, `document.querySelector('[data-import-show-button]')`);
    step('pointer', `Show in Installed at 360px, ${theme}`, { key: directoryKey });
    await settled(`narrow details ${theme}`, async () => (await packListView(page)).detail === directoryKey);
    list = await packListView(page);
    details = await projectDetailView(page);
    assert.deepEqual(
      [list.context, list.page, list.selected, list.open, list.closeFocused, details.modal, details.heading],
      ['installed', 'Page 2 of 2', [directoryKey], true, true, true, 'dude-local-release-notes'],
      `the narrow overlay opens on the same artifact with Close focused (${theme})`,
    );
    assert.deepEqual(details.files, agentRow.files);
    audits.push(await auditInstalledWorkspace(page, `import-show-installed-360-${theme}`));
    await pressKey(page, 'Escape');
    await settled(`narrow details closed ${theme}`, async () => (await packListView(page)).detail === null);
    assert.equal((await packListView(page)).activeRow, directoryKey, 'closing the overlay returns focus to the row');
    narrowViews.push({ theme, width: 360, key: directoryKey });
  }
  await installedViewport(page, 1440, 'light', 900);

  // The shipped route admitted exactly the two prepare/submit pairs; the draft survived everything.
  const importRequests = network.filter((entry) => entry.path === '/api/imports/request');
  assert.deepEqual(importRequests.map((entry) => entry.body), [
    { op: 'prepare', importSource: fixture.file.source },
    { op: 'submit', importSource: fixture.file.source, importReceipt: fileReceipt },
    { op: 'prepare', importSource: fixture.directory.source },
    { op: 'submit', importSource: fixture.directory.source, importReceipt: directoryReceipt },
  ]);
  await click(page, button('New idea'));
  assert.equal(await evaluate(page, `${field('Your idea')}.value`), draft, 'the New idea draft survived both imports');
  assert.deepEqual(foreignNetwork, [], 'no source or network request leaves the Canvas origin');
  assert.deepEqual(runtimeErrors, []);
  assert.equal(discoveries(), 2, 'only the two explicit Reloads acquired a catalog: no Settings entry, result, Show in Installed, or focus did');
  assert.equal(network.some((entry) => entry.path === '/api/packs/sources'), false, 'no source was added or removed');
  const provider = await readNeedsYou(canvasUrl);
  assert.deepEqual(
    provider.importRequests.map((entry) => [entry.phase, entry.applied, entry.receipt.current, entry.sendStarted]),
    [['applied', true, true, true], ['applied', true, true, true]],
  );
  return {
    network,
    foreignNetwork,
    steps,
    audits,
    journeys,
    narrowViews,
    surface,
    exclusion,
    provider,
    shown: { file: shownFile, directory: shownDirectory },
    results: model.imports.map((entry) => ({
      kind: entry.kind,
      receipt: entry.binding.receiptId,
      written: entry.result.receipt.acknowledgment.written,
    })),
    draftSha256: sha256(draft),
    screenshot: await screenshot(page, 'installed-import-final'),
  };
}

/**
 * Drive the 073 Phase B journey in the owned Edge while the installed owner model above previews, publishes
 * the literal permission, applies with Compose, verifies, and acknowledges. The browser adds the folder as a
 * pack source through Settings, shows that source's packs in Available, selects its source-qualified pack,
 * requests the install, and consents through Needs you; it applies nothing. The source and its pack are
 * then observed where they landed: the saved sources file, the recorded profile source, the installed bytes,
 * the Available rows of both same-named packs, the source facts, and the installed-use removal blocker.
 * Catalogs are acquired only by the explicit read that follows the save.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {ReturnType<typeof seedSourceFixture>} fixture
 * @param {ReturnType<typeof createSourceModel>} ownerModel
 * @param {{parsePackSourcesDocument:(value:Buffer)=>unknown[], serializePackSourcesDocument:(value:unknown[])=>string}} sources
 *   the installed module, which is also what Compose and lint ran
 */
async function driveInstalledSourceRoundTrip(page, canvasUrl, fixture, ownerModel, sources) {
  const model = ownerModel.state;
  const network = [], foreignNetwork = [], runtimeErrors = [];
  /** The saved-sources route's own answers, as the browser received them. */
  const sourceResponses = [];
  const routeStatus = new Map();
  page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(canvasUrl)) {
      const url = new URL(event.request.url);
      network.push({
        method: event.request.method,
        path: url.pathname,
        query: url.search,
        body: event.request.postData ? JSON.parse(event.request.postData) : null,
      });
    } else if (/^https?:/.test(event.request.url)
      && !['127.0.0.1', 'localhost'].includes(new URL(event.request.url).hostname)) {
      foreignNetwork.push(event.request.url);
    }
  });
  page.on('Network.responseReceived', (event) => {
    if (new URL(event.response.url).pathname === '/api/packs/sources') routeStatus.set(event.requestId, event.response.status);
  });
  page.on('Network.loadingFinished', (event) => {
    if (!routeStatus.has(event.requestId)) return;
    const status = routeStatus.get(event.requestId);
    void page.send('Network.getResponseBody', { requestId: event.requestId })
      .then((result) => sourceResponses.push({ status, body: JSON.parse(result.body) }))
      .catch((error) => sourceResponses.push({ status, error: safeError(error) }));
  });
  const discoveries = () => network.filter((entry) => entry.method === 'GET' && entry.path === '/api/packs'
    && entry.query === '?discover=1').length;
  const steps = [], audits = [];
  const step = (input, target, details = {}) => steps.push({ input, target, ...details });
  const failed = () => { if (model.modelError) throw new Error(model.modelError); };
  const settled = async (label, ready, ms = 60_000) => {
    await until(async () => { failed(); return ready(); }, label, ms);
  };
  const phaseOf = () => evaluate(page, `document.querySelector('[data-pack-request-dialog][open] [data-pack-request-phase]')
    ?.getAttribute('data-pack-request-phase') ?? null`);
  /** Each row of a list as a person reads it: its opaque key, then its cells. @param {string} selector */
  const rowsOf = (selector) => evaluate(page, `[...document.querySelectorAll(${JSON.stringify(selector)})].map(row =>
    [row.getAttribute('data-pack-row'), ...[...row.querySelectorAll('[role="gridcell"]')].map(cell => cell.innerText.replace(/\\s+/g, ' ').trim())])`);
  // The built-in Local library names its folder relative to the workspace.
  const libraryLocation = 'library/packs';
  const sourceLabel = `${fixture.label} - Local folder`;
  const before = workspaceFiles(fixture.root);
  const defaultBytes = {
    manifest: fs.readFileSync(path.join(fixture.root, ...PACK_MANIFEST_PATH.split('/'))),
    instruction: fs.readFileSync(path.join(fixture.root, ...PACK_SOURCE_PATH.split('/'))),
  };

  // ----- Settings entry: installed state and the saved sources are read, and no catalog is.
  await navigate(page, canvasUrl, 1440);
  await click(page, `document.querySelector('#dude-tab-settings')`);
  await until(() => evaluate(page, `document.querySelector('[aria-label="Reload packs"]')
    ?.getAttribute('aria-busy') === 'false' && Boolean(document.querySelector('[data-settings]'))`),
  'installed Settings pack read');
  assert.equal(discoveries(), 0, 'entering Settings acquires no catalog');
  const surface = await evaluate(page, `(() => {
    const settings = document.querySelector('[data-settings]');
    const text = node => node.innerText.replace(/\\s+/g, ' ').trim();
    return {
      sections: [...settings.querySelectorAll('[data-settings-section]')].map(node => node.getAttribute('data-settings-section')),
      tabs: [...settings.querySelectorAll('[role="tab"]')].map(text),
      contexts: [...settings.querySelectorAll('[data-pack-context]')].map(node => node.getAttribute('data-pack-context')),
    };
  })()`);
  assert.deepEqual(surface.sections, ['packs', 'about']);
  assert.deepEqual(surface.contexts, ['installed', 'available', 'import', 'sources'], 'Sources is the last of the four Packs views');
  assert.deepEqual(surface.tabs, ['Packs', 'About', 'Installed 0', 'Available ?', 'Add/import', 'Sources'],
    'before the first Reload Available is unknown');
  await click(page, `document.querySelector('[data-pack-context="sources"]')`);
  await settled('Sources lists the built-in sources', async () => (await sourcesView(page)).rows.length === 2);
  let view = await sourcesView(page);
  assert.deepEqual(view.rows.map((row) => row.label), [
    `Local library. Local folder. ${libraryLocation}. Not read. Built in.`,
    `Bundle upstream. GitHub. ${INSTALLED_SOURCE_REPO}, ref latest. Not read while library/packs exists. Built in.`,
  ]);
  assert.deepEqual([view.count, view.add.disabled, view.dialogOpen],
    ['2 sources · 2 built in · 0 of 8 added', false, false]);
  assert.equal(view.noAdded.startsWith('No sources added yet'), true);
  assert.equal(view.coverage.startsWith('Catalog: not read'), true, 'before Reload no source shows a pack count');
  const libraryKey = view.rows[0].key;
  audits.push(await auditInstalledWorkspace(page, 'source-sources-before-add'));

  // ----- Add the folder through the dialog: one read validates it, one save records it.
  await click(page, `document.querySelector('[data-sources-add]')`);
  await settled('Add source dialog', async () => (await sourcesView(page)).dialogOpen);
  assert.equal(await evaluate(page, `document.activeElement?.hasAttribute('data-source-location')`), true,
    'Add opens on Location');
  audits.push(await auditInstalledWorkspace(page, 'source-add-dialog'));
  await fill(page, `document.querySelector('[data-source-location]')`, fixture.team);
  await click(page, `document.querySelector('[data-source-add-submit]')`);
  step('pointer', 'Sources: Add source, Location typed, Add source', { location: fixture.team });
  await settled('the source was saved', () => sourceResponses.length === 1);
  assert.equal(sourceResponses[0].status, 200, JSON.stringify(sourceResponses[0]));
  const saved = sourceResponses[0].body;
  assert.deepEqual(Object.keys(saved).sort(), ['count', 'key', 'sourcesRevision']);
  assert.deepEqual(network.filter((entry) => entry.path === '/api/packs/sources').map((entry) => entry.body),
    [{ op: 'add', location: fixture.team, sourcesRevision: 'absent' }], 'one closed add body against an absent file');
  const savedBytes = fs.readFileSync(fixture.sourcesFile);
  const teamKey = saved.key;
  assert.equal(typeof teamKey, 'string');
  assert.equal(saved.count, 2, 'the validated catalog holds the folder\'s two packs');
  assert.equal(saved.sourcesRevision, revision(savedBytes), 'the returned revision is the raw bytes just saved');
  // The save: the one file the route writes, holding exactly the one added entry and no built-in.
  assert.deepEqual(sources.parsePackSourcesDocument(savedBytes), [{ type: 'local', location: fixture.realTeam }]);
  assert.equal(savedBytes.toString('utf8'), sources.serializePackSourcesDocument([{ type: 'local', location: fixture.realTeam }]));
  const block = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(savedBytes.toString('utf8'));
  assert.deepEqual(JSON.parse(block[1]), { sources: [{ type: 'local', location: fixture.realTeam }] });
  await settled('Added is announced outside the dialog', async () => {
    const now = await sourcesView(page);
    return now.note?.title === 'Added' && !now.dialogOpen;
  });
  view = await sourcesView(page);
  assert.equal(view.note.text, `Added ${fixture.label} was saved with this project. Found 2 packs. Nothing was installed; its packs now appear under Available.`);
  // Only after the one read that follows the save does the new row open in details, with Close focused.
  await settled('post-add details', async () => (await sourceDetailView(page))?.key === teamKey);
  assert.equal(discoveries(), 1, 'exactly one catalog read follows the save');
  view = await sourcesView(page);
  assert.deepEqual(view.rows.map((row) => [row.label, row.selected]), [
    [`Local library. Local folder. ${libraryLocation}. Read - 1 pack. Built in.`, false],
    [`Bundle upstream. GitHub. ${INSTALLED_SOURCE_REPO}, ref latest. Not read while library/packs exists. Built in.`, false],
    [`${fixture.label}. Local folder. ${fixture.realTeam}. Read - 2 packs. This project.`, true],
  ]);
  assert.equal(view.rows[2].key, teamKey, 'the row carries the key the save returned');
  assert.equal(view.count, '3 sources · 2 built in · 1 of 8 added');
  let details = await sourceDetailView(page);
  assert.deepEqual(details, {
    key: teamKey,
    heading: fixture.label,
    scope: 'Pack source · This project',
    notice: null,
    description: `The folder ${fixture.realTeam} on this computer, whose root contains library/packs. Added to this project, so it is saved with the project and can be committed and shared.`,
    show: { disabled: false },
    remove: { disabled: false, label: `Remove ${fixture.label}` },
    reason: 'Show packs in Available lists this source\'s packs that are not installed. Remove takes this entry out of the saved list. It installs and uninstalls nothing.',
    readOnly: null,
    facts: {
      Status: 'Read - 2 packs',
      'Packs found': '2 (none installed) Counts include names you already have installed. Available lists only names that are not installed.',
      'Installed from this source': '0',
      'Saved in': SOURCES_PATH,
    },
    links: 0,
    close: 'Close source details',
    closeFocused: true,
    open: true,
    modal: false,
  });
  audits.push(await auditInstalledWorkspace(page, 'source-added-details'));
  const addedDetails = details;

  // ----- Both packs of one name are listed, each saying where it comes from; Show packs narrows to one source.
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  await settled('Available lists the packs read', async () => (await packListView(page)).keys.length === 3);
  assert.equal((await packListView(page)).totals.available, '3');
  assert.deepEqual(await rowsOf('[data-pack-row]'), [
    [`pack:${PACK_NAME}@${libraryKey}`, PACK_NAME, 'Local library - Local folder', 'testing'],
    [`pack:${PACK_NAME}@${teamKey}`, PACK_NAME, sourceLabel, 'testing'],
    [`pack:${SOURCE_EXTRA_PACK}@${teamKey}`, SOURCE_EXTRA_PACK, sourceLabel, 'testing'],
  ], 'two rows share one name, with distinct keys and sources');
  await click(page, `document.querySelector('[data-pack-context="sources"]')`);
  await click(page, `document.querySelector('[data-source-row="${teamKey}"]')`);
  await settled('source details', async () => (await sourceDetailView(page))?.key === teamKey);
  await click(page, `document.querySelector('[data-source-show]')`);
  step('pointer', 'Sources: Show packs in Available', { key: teamKey });
  await settled('Show packs opens Available on that source', async () => {
    const now = await packListView(page);
    return now.context === 'available' && now.sourceFilter === sourceLabel;
  });
  let list = await packListView(page);
  assert.deepEqual(
    [list.context, list.filter, list.sourceFilter, list.page, list.selected, list.detail, list.open, list.activeTab, list.keys],
    ['available', 'All use cases', sourceLabel, 'Page 1 of 1', [], null, false, 'available',
      [`pack:${PACK_NAME}@${teamKey}`, `pack:${SOURCE_EXTRA_PACK}@${teamKey}`]],
    'Show packs is a local view change: that Source, All use cases, page 1, nothing selected, focus on Available',
  );
  assert.equal(discoveries(), 1, 'Show packs acquires nothing');
  audits.push(await auditInstalledWorkspace(page, 'source-available-filtered'));

  // ----- Select the source-qualified pack and request its installation.
  const packKey = `pack:${PACK_NAME}@${teamKey}`;
  await click(page, `document.querySelector('[data-pack-row="${packKey}"]')`);
  await settled('pack details', async () => (await packListView(page)).detail === packKey);
  const pack = await packDetailView(page);
  assert.deepEqual(
    [pack.heading, pack.description, pack.source, pack.location, pack.operations],
    [`${PACK_NAME} - ${fixture.label}`, 'Added-source variant of the installed-host pack round trip.', sourceLabel,
      fixture.realTeam, [['install', false]]],
    'the details name the pack and the source it is read from, and offer only Install',
  );
  const gate = ownerModel.hold('source-before-result');
  await click(page, `document.querySelector('[data-pack-operation="install"]')`);
  step('pointer', 'Available: Install on the source-qualified pack', { key: packKey });
  await settled('owner permission', () => model.record?.stage === 'permission-waiting');
  await settled('the request waits for exact permission', async () => (await phaseOf()) === 'waiting_permission');
  const pending = await readNeedsYou(canvasUrl);
  assert.equal(pending.packRequests.length, 1);
  const waiting = pending.packRequests[0];
  assert.deepEqual([waiting.operation, waiting.name, waiting.phase], ['install', PACK_NAME, 'waiting_permission']);
  const binding = { key: teamKey, sourcesRevision: revision(savedBytes), source: { type: 'local', location: fixture.realTeam } };
  assert.deepEqual(waiting.receipt.catalogSource, binding, 'the provider bound the added source, its saved revision, and its real folder');
  assert.deepEqual(model.record.binding.catalogSource, binding, 'and handed the owner exactly that binding');
  assert.deepEqual(network.filter((entry) => entry.path === '/api/packs/request').map((entry) => entry.body), [
    { op: 'prepare', operation: 'install', name: PACK_NAME, source: teamKey },
    { op: 'submit', operation: 'install', name: PACK_NAME, source: teamKey, packReceipt: waiting.packReceipt },
  ], 'both bodies name the configured source key, never a path, repository, or ref');
  assert.equal(await evaluate(page, `document.querySelector('[data-pack-request-dialog] [data-pack-request-source]')
    ?.innerText.replace(/\\s+/g, ' ').trim()`), `Requested from ${sourceLabel}`);
  assert.equal(fs.existsSync(fixture.destination), false, 'no projected artifact exists before exact consent');
  assert.deepEqual(model.record.preview.source, binding);
  audits.push(await auditInstalledWorkspace(page, 'source-request-waiting-permission'));

  // ----- Consent through the real Needs you view: the source is the first target, as a third-party source.
  const permission = model.record.permission.request;
  await click(page, button('Open Needs you'));
  await visible(page, permission.prompt);
  const card = await evaluate(page, `document.querySelector('#dude-panel-needs').innerText`);
  for (const part of [
    permission.fields.operation,
    ...permission.fields.targets.flatMap((entry) => [...entry.target.split('\n'), `Revision: ${entry.revision}`]),
    ...permission.fields.consequences.split('\n'),
    ...permission.fields.eligibility.split('\n'),
    'Required literal confirmation',
    permission.fields.confirmation,
  ]) assert.equal(card.includes(part), true, `Needs you shows ${JSON.stringify(part)} without truncation`);
  assert.equal(card.indexOf(`Third-party source ${fixture.realTeam}`) >= 0, true, 'Needs you names the third-party source');
  assert.equal(card.indexOf('Third-party source') < card.indexOf(PROFILE_PATH), true, 'and names it first');
  assert.equal(permission.fields.targets[0].revision, fixture.packRevision, 'a local folder is pinned by its files\' digest, not a commit');
  assert.match(permission.fields.targets[0].revision, /^sha256:[0-9a-f]{64}$/);
  audits.push(await auditInstalledWorkspace(page, 'source-needs-you-permission'));
  await fill(page, field('Enter the exact confirmation'), permission.fields.confirmation);
  await click(page, field('I grant permission for this operation on these exact targets.'));
  await click(page, button('Send permission'));
  step('pointer', 'Needs you: confirmation typed, consent checked, Send permission', { confirmation: permission.fields.confirmation });
  await visible(page, 'Awaiting acknowledgment');
  await settled('owner recognizes the consent', () => Boolean(model.record.permission.acknowledgment));
  assert.equal(fs.existsSync(fixture.destination), false, 'consent alone writes nothing');
  await click(page, button('Back to pack request'));
  await settled('the request waits for the owner', async () => (await phaseOf()) === 'waiting_owner');

  // ----- The owner applies and verifies; Canvas shows no Applied until the owner's verified result arrives.
  await settled('owner ready to report', () => gate.reached);
  const installedBytes = fs.readFileSync(fixture.destination);
  assert.equal(installedBytes.equals(fixture.instruction), true, 'the installed bytes are the added folder\'s');
  assert.equal(installedBytes.equals(defaultBytes.instruction), false, 'not the default library\'s same-named pack');
  const unreported = (await readNeedsYou(canvasUrl)).packRequests[0];
  assert.deepEqual([unreported.phase, unreported.applied, unreported.receipt.acknowledgment], ['waiting_owner', false, null],
    'the applied files alone are not an Applied pack');
  assert.equal(await phaseOf(), 'waiting_owner');
  gate.release();
  await settled('owner result acknowledged', () => model.record.stage === 'complete');
  await settled('authoritative reread of the installed state', async () => !(await evaluate(page,
    `document.body.innerText.includes('Reading repository state')`)) && (await readNeedsYou(canvasUrl)).packRequests[0]?.phase === 'applied');
  await settled('the dialog shows the correlated Applied', async () => (await phaseOf()) === 'applied');
  const provider = await readNeedsYou(canvasUrl);
  assert.equal(provider.packRequests.length, 1);
  const result = provider.packRequests[0];
  assert.deepEqual([result.applied, result.receipt.freshness, result.receipt.current], [true, 'current', true]);
  assert.deepEqual(result.receipt.catalogSource, binding, 'the Applied receipt keeps the exact binding');
  assert.deepEqual(result.receipt.acknowledgment.catalogSource, binding, 'and the owner echoed it whole');
  assert.deepEqual(result.receipt.reread.entry, { files: fixture.written, source: { type: 'local', location: fixture.realTeam } });
  assert.deepEqual(result.receipt.acknowledgment.result, JSON.parse(model.record.compose.stdout),
    'the receipt carries the observed Compose --envelope stdout, not a predetermined result');
  audits.push(await auditInstalledWorkspace(page, 'source-request-applied'));
  await click(page, button('Return to packs'));

  // ----- What landed: the recorded source, the installed bytes, and every same-name Available row gone.
  const profile = installedProfile(fixture.root);
  assert.deepEqual(profile.value.installed[PACK_NAME], { files: fixture.written, source: { type: 'local', location: fixture.realTeam } },
    'the profile records the added folder as the source');
  assert.deepEqual(Object.keys(profile.value.installed), [PACK_NAME]);
  assert.equal(fs.readFileSync(fixture.destination).equals(fixture.instruction), true);
  assert.equal(fs.readFileSync(fixture.sourcesFile).equals(savedBytes), true, 'installing changed no saved source');
  await click(page, `document.querySelector('[data-pack-context="installed"]')`);
  await settled('Installed lists the pack', async () => (await packListView(page)).totals.installed === '1');
  assert.deepEqual(await rowsOf('[data-pack-row]'), [[`pack:${PACK_NAME}`, PACK_NAME, 'Pack', sourceLabel, 'testing']],
    'Installed names the added folder as the source it was recorded from');
  await click(page, `document.querySelector('[data-pack-row="pack:${PACK_NAME}"]')`);
  await settled('installed details', async () => (await packListView(page)).detail === `pack:${PACK_NAME}`);
  const installedPack = await packDetailView(page);
  assert.equal(installedPack.description, 'Added-source variant of the installed-host pack round trip.',
    'its description comes from the source the record matches, not the default library');
  assert.equal(installedPack.source, sourceLabel);
  assert.equal(installedPack.text.includes(PACK_DESTINATION), true, 'the recorded file is listed');
  await pressKey(page, 'Escape');
  await click(page, `document.querySelector('[data-pack-context="available"]')`);
  await settled('Available re-filtered by installed name', async () => (await packListView(page)).keys.length === 1);
  assert.deepEqual(await rowsOf('[data-pack-row]'), [[`pack:${SOURCE_EXTRA_PACK}@${teamKey}`, SOURCE_EXTRA_PACK, sourceLabel, 'testing']],
    'installing one name removes every Available row of that name, from both sources');
  assert.equal((await packListView(page)).totals.available, '1');
  audits.push(await auditInstalledWorkspace(page, 'source-available-after-install'));

  // ----- Source facts, and the installed-use removal blocker both in the details and at the server.
  await click(page, `document.querySelector('[data-pack-context="sources"]')`);
  await click(page, `document.querySelector('[data-source-row="${teamKey}"]')`);
  await settled('source details after install', async () => (await sourceDetailView(page))?.key === teamKey);
  details = await sourceDetailView(page);
  assert.deepEqual([details.facts.Status, details.facts['Packs found'].split(' Counts')[0], details.facts['Installed from this source'],
    details.facts['Saved in']], ['Read - 2 packs', '2 (1 not installed)', `1: ${PACK_NAME}`, SOURCES_PATH]);
  assert.deepEqual(details.remove, { disabled: true, label: `Remove ${fixture.label}` });
  assert.equal(details.reason,
    `Cannot remove while in use. Installed from it: ${PACK_NAME}. Remove those installed packs first.`);
  assert.equal(details.show.disabled, false, 'its remaining uninstalled pack is still offered');
  audits.push(await auditInstalledWorkspace(page, 'source-details-in-use'));
  await click(page, `document.querySelector('[data-source-row="${libraryKey}"]')`);
  await settled('Local library details', async () => (await sourceDetailView(page))?.key === libraryKey);
  const libraryDetails = await sourceDetailView(page);
  assert.deepEqual([libraryDetails.facts['Packs found'].split(' Counts')[0], libraryDetails.facts['Installed from this source'],
    libraryDetails.remove, libraryDetails.show.disabled, libraryDetails.readOnly?.startsWith('Read only.')],
  ['1 (all installed)', '0', null, true, true],
  'a name installed from another source is not installed from this one, and a built-in cannot be removed');
  // The server decides again at the write: the same blocker, named, with nothing saved.
  const current = await (await fetch(new URL('/api/packs', canvasUrl), { signal: AbortSignal.timeout(15_000) })).json();
  assert.equal(current.sources.sourcesRevision, revision(savedBytes));
  const refused = await postCanvas(canvasUrl, '/api/packs/sources', { op: 'remove', key: teamKey, sourcesRevision: current.sources.sourcesRevision });
  assert.equal(refused.status, 409);
  assert.deepEqual([refused.body.error, refused.body.blockers], ['source_in_use', [{ kind: 'installed', name: PACK_NAME }]]);
  assert.equal(fs.readFileSync(fixture.sourcesFile).equals(savedBytes), true, 'the refused removal saved nothing');
  assert.equal(discoveries(), 1, 'permission, result, rereads, filtering and Show packs acquired no further catalog');

  // ----- The same details below 1100px are a modal overlay, in both themes.
  await click(page, `document.querySelector('[aria-label="Close source details"]')`);
  await settled('details closed before resizing', async () => (await sourceDetailView(page)) === null);
  const narrowViews = [];
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    await installedViewport(page, 360, theme, 900);
    await click(page, `document.querySelector('[data-pack-context="sources"]')`);
    await click(page, `document.querySelector('[data-source-row="${teamKey}"]')`);
    await settled(`narrow source details ${theme}`, async () => (await sourceDetailView(page))?.key === teamKey);
    details = await sourceDetailView(page);
    assert.deepEqual([details.modal, details.open, details.remove.disabled], [true, true, true]);
    audits.push(await auditInstalledWorkspace(page, `source-details-360-${theme}`));
    await pressKey(page, 'Escape');
    await settled(`narrow details closed ${theme}`, async () => (await sourceDetailView(page)) === null);
    narrowViews.push({ theme, width: 360, key: teamKey });
  }
  await installedViewport(page, 1440, 'light', 900);

  // ----- The browser saved exactly one source, requested exactly one install, and reached no other origin.
  assert.deepEqual(network.filter((entry) => entry.path === '/api/packs/sources').length, 1);
  assert.equal(network.filter((entry) => entry.path === '/api/packs/request').length, 2);
  assert.deepEqual(foreignNetwork, [], 'no source or network request leaves the Canvas origin');
  assert.deepEqual(runtimeErrors, []);
  const after = workspaceFiles(fixture.root);
  const delta = {
    added: Object.keys(after).filter((relative) => before[relative] === undefined).sort(),
    changed: Object.keys(before).filter((relative) => after[relative] !== undefined && after[relative] !== before[relative]).sort(),
    removed: Object.keys(before).filter((relative) => after[relative] === undefined).sort(),
  };
  assert.deepEqual(delta, { added: [PACK_DESTINATION, SOURCES_PATH].sort(), changed: [PROFILE_PATH], removed: [] },
    'the workspace gained the saved sources and the pack file, and only the profile changed');
  assert.equal(fs.readFileSync(path.join(fixture.root, ...PACK_MANIFEST_PATH.split('/'))).equals(defaultBytes.manifest), true);
  assert.equal(fs.readFileSync(path.join(fixture.root, ...PACK_SOURCE_PATH.split('/'))).equals(defaultBytes.instruction), true,
    'the default library is untouched');
  for (const [relative, bytes] of fixture.files) {
    assert.equal(fs.readFileSync(path.join(fixture.team, ...relative.split('/'))).equals(bytes), true, `the added folder is untouched: ${relative}`);
  }
  return {
    network,
    foreignNetwork,
    steps,
    audits,
    narrowViews,
    surface,
    saved: { response: sourceResponses[0], bytes: savedBytes.length, sha256: sha256(savedBytes), revision: revision(savedBytes) },
    keys: { libraryKey, teamKey, packKey },
    addedDetails,
    libraryDetails,
    removalRefusal: refused,
    provider,
    delta,
    screenshot: await screenshot(page, 'installed-source-final'),
  };
}

/**
 * Exercise the installed 062 task walkthrough against frozen source-backed
 * 062/052 fixture copies before entering the independently scoped Review.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {ReturnType<typeof seedWorkspaceTaskFixtures>} fixture
 * @param {string} draft
 */
async function driveInstalledTaskWalkthrough(page, canvasUrl, fixture, draft) {
  const inputSequence = [];
  const audits = [];
  const bodyMarker = 'Build frontend assets and project generated core using the plan\'s existing commands.';
  const acceptanceMarker = 'Acceptance: SC-001–007 and VSC-001–003 have fresh evidence';
  const expected062 = fixture.records['062'].selectedTaskInstruction;
  const expected052 = fixture.records['052'].selectedTaskInstruction;
  assert.ok(expected062.includes(bodyMarker));
  assert.ok(expected062.includes(acceptanceMarker));

  const selectProjectedWork = async (query, heading, ideaPath) => {
    if (await evaluate(page, `Boolean(document.querySelector('[aria-label="Clear work selection"]'))`)) {
      await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
      inputSequence.push('pointer: Clear work selection');
      assert.equal(await evaluate(page, `document.activeElement === ${field('Search work')}`), true);
      assert.equal(await evaluate(page, `${field('Search work')}.value`), '');
      assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'All');
    }
    await selectWork(page, ideaPath);
    inputSequence.push(`keyboard: Search work ${query}, ArrowDown to ${ideaPath}, Enter`);
    await until(() => evaluate(page, `document.querySelector('h1')?.textContent
      .replace(/\\s+/g, ' ').trim() === ${JSON.stringify(heading)}`), `${heading} selected`);
    const selected = (await awaitSelectedProjection(
      canvasUrl,
      ideaPath,
      `${heading} installed projection`,
    )).projection;
    const expectedTaskKeys = selected.taskDetails?.items?.map((task) => task.taskKey) ?? [];
    await until(() => evaluate(page, `!document.body.innerText.includes('Reading repository state')
      && JSON.stringify([...document.querySelectorAll('[data-task-key]')]
        .map((node) => node.dataset.taskKey)) === ${JSON.stringify(JSON.stringify(expectedTaskKeys))}`),
    `${heading} rendered projection`);
    return selected;
  };

  const initialIndex = await readWorkIndex(canvasUrl);
  const indexText = JSON.stringify(initialIndex);
  assert.equal(indexText.includes(bodyMarker), false,
    'unselected work-index inventory carries no 062 full task body');
  assert.equal(indexText.includes(acceptanceMarker), false,
    'unselected work-index inventory carries no 062 acceptance body');
  assert.ok(initialIndex.items.some((item) => item.ideaPath === WORKSPACE_052.ideaPath));
  assert.ok(initialIndex.items.some((item) => item.ideaPath === WORKSPACE_062.ideaPath));
  assert.ok(initialIndex.items.some((item) => item.ideaPath === TASK_CONTROL.ideaPath));
  assert.equal(await evaluate(page, `Boolean(${field('Search work')})`), true);
  assert.equal(await evaluate(page, `document.querySelectorAll('[aria-label="Working on"]').length`), 0);

  let projection062 = await selectProjectedWork(
    '062',
    '062 Dude Canvas Workspace Integration',
    WORKSPACE_062.ideaPath,
  );
  assert.equal(await evaluate(page, `Boolean(${field('Search work')})`), false);
  assert.equal(await evaluate(page, `document.querySelectorAll('[aria-label="Working on"]').length`), 1);
  assert.deepEqual(projection062.tasks, {
    total: 5,
    open: 5,
    inProgress: 0,
    blocked: 0,
    done: 0,
  });
  assert.equal(projection062.taskDetails.coverage.state, 'available');
  assert.equal(projection062.taskDetails.resultCoverage, 'not-exposed');
  assert.deepEqual(
    projection062.taskDetails.items.map((task) => task.taskKey),
    WORKSPACE_062.taskKeys,
  );
  assert.ok(projection062.taskDetails.items.every((task) => task.state === 'todo'));
  assert.ok(projection062.taskDetails.items.every((task) => (
    task.source.path === WORKSPACE_062.tasksPath
      && task.source.contentIdentity === fixture.records['062'].fixtureTasksRevision
  )));
  assert.equal(
    projection062.taskDetails.items.find((task) => task.taskKey === WORKSPACE_062.selectedTaskKey)
      ?.instruction.text,
    expected062,
  );
  assert.equal(JSON.stringify(projection062).includes(expected052), false,
    'selected 062 projection carries no 052 full body');
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
    .map((node) => node.dataset.taskKey)`), WORKSPACE_062.taskKeys);
  assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
    ?.getAttribute('aria-pressed')`), 'true');
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-phase]')]
    .map((section) => [...section.querySelectorAll('*')].find((node) =>
      /^\\d+ of \\d+ tasks complete$/.test(node.textContent.trim()))?.textContent.trim() || null)`),
  Array(5).fill('0 of 1 tasks complete'));
  const plannedRows = await evaluate(page, `Object.fromEntries(
    [...document.querySelectorAll('[data-task-key]')].map((node) => [node.dataset.taskKey, node.innerText])
  )`);
  assert.match(plannedRows['T001@a062c1d4'], /Ready by recorded task dependencies/);
  for (const taskKey of WORKSPACE_062.taskKeys.slice(1)) {
    assert.match(plannedRows[taskKey], /Waiting on dependencies/);
  }
  assert.equal(Object.values(plannedRows).some((text) => /\b(?:Done|In progress|Blocked)\b/.test(text)), false);

  await evaluate(page, `document.querySelector('[data-task-key="${WORKSPACE_062.selectedTaskKey}"]').focus()`);
  await pressKey(page, 'Enter');
  inputSequence.push(`keyboard: ${WORKSPACE_062.selectedTaskKey}, Enter`);
  await until(() => evaluate(page, `document.querySelector(
    '[data-task-detail="${WORKSPACE_062.selectedTaskKey}"]'
  ) === document.activeElement`), 'installed 062 task inspector focus');
  assert.equal(await evaluate(page, `document.querySelector(
    '[data-task-instruction="${WORKSPACE_062.selectedTaskKey}"]'
  ).textContent`), expected062);
  const detail062 = await evaluate(page, `document.querySelector(
    '[data-task-detail="${WORKSPACE_062.selectedTaskKey}"]'
  ).innerText`);
  assert.ok(detail062.includes('T004@d062f4a7'));
  assert.ok(detail062.includes('Not exposed by this source.'));
  assert.ok(detail062.includes('Pending'));
  assert.equal(await evaluate(page, `[...document.querySelectorAll('button')].some((node) =>
    ['Run','Retry','Mark done','Edit task'].includes(node.innerText.trim()))`), false);
  await evaluate(page, `document.querySelector(
    '[data-task-instruction="${WORKSPACE_062.selectedTaskKey}"]'
  ).focus()`);
  await pressKey(page, 'PageDown');
  await until(() => evaluate(page, `document.querySelector(
    '[data-task-instruction="${WORKSPACE_062.selectedTaskKey}"]'
  ).scrollTop > 0`), 'installed full task body keyboard scroll');
  inputSequence.push('keyboard: full task instruction PageDown');

  await click(page, `document.querySelector('[data-task-filter="done"]')`);
  inputSequence.push('pointer: Tasks Done filter');
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
    .map((node) => node.dataset.taskKey)`), []);
  assert.equal(await evaluate(page, `document.body.innerText.includes('No done tasks in this phase.')`), true);
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-phase]')]
    .map((section) => [...section.querySelectorAll('*')].find((node) =>
      /^\\d+ of \\d+ tasks complete$/.test(node.textContent.trim()))?.textContent.trim() || null)`),
  Array(5).fill('0 of 1 tasks complete'), 'phase totals remain unfiltered');
  await click(page, `document.querySelector('[data-task-filter="all"]')`);
  assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false,
    'restoring All does not reopen filtered task detail');

  await click(page, button('New idea'));
  await fill(page, field('Your idea'), draft);
  inputSequence.push('pointer/text: New idea draft, then Now');
  await click(page, button('Now'));
  assert.equal(await evaluate(page, `document.querySelector('h1')?.textContent
    .replace(/\\s+/g, ' ').trim()`), '062 Dude Canvas Workspace Integration');

  const controlProjection = await selectProjectedWork(
    '063',
    '063 Installed task coverage controls',
    TASK_CONTROL.ideaPath,
  );
  assert.deepEqual(controlProjection.tasks, {
    total: 3,
    open: 2,
    inProgress: 0,
    blocked: 1,
    done: 0,
  });
  const controlRows = await evaluate(page, `Object.fromEntries(
    [...document.querySelectorAll('[data-task-key]')].map((node) => [node.dataset.taskKey, node.innerText])
  )`);
  assert.match(controlRows[TASK_CONTROL.readyTaskKey], /Ready by recorded task dependencies/);
  assert.match(controlRows[TASK_CONTROL.waitingTaskKey], /Waiting on dependencies/);
  assert.match(controlRows[TASK_CONTROL.blockedTaskKey], /Blocked/);
  await click(page, `document.querySelector('[data-task-key="${TASK_CONTROL.blockedTaskKey}"]')`);
  inputSequence.push(`pointer: ${TASK_CONTROL.blockedTaskKey}`);
  const blockedDetail = await evaluate(page, `document.querySelector(
    '[data-task-detail="${TASK_CONTROL.blockedTaskKey}"]'
  ).innerText`);
  assert.ok(blockedDetail.includes('external-dependency: controlled installed blocker'));
  assert.equal(await evaluate(page, `document.querySelector(
    '[data-task-instruction="${TASK_CONTROL.blockedTaskKey}"]'
  ).textContent`), fixture.records.controlled.instructions[TASK_CONTROL.blockedTaskKey]);
  assert.equal(blockedDetail.includes('agent is working now'), false);

  const projection052 = await selectProjectedWork('052', '052 Dude Canvas UI', WORKSPACE_052.ideaPath);
  assert.deepEqual(projection052.tasks, {
    total: 13,
    open: 0,
    inProgress: 0,
    blocked: 0,
    done: 13,
  });
  assert.equal(projection052.taskDetails.resultCoverage, 'not-exposed');
  assert.equal(projection052.taskDetails.items.length, 13);
  assert.ok(projection052.taskDetails.items.every((task) => task.state === 'done'));
  assert.equal(projection052.taskDetails.items.some((task) => (
    task.taskKey === WORKSPACE_052.archivedTaskKey
  )), false);
  assert.equal(JSON.stringify(projection052).includes(bodyMarker), false,
    'selected 052 projection carries no 062 full body');
  await click(page, `document.querySelector('[data-task-filter="done"]')`);
  assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
    .map((node) => node.dataset.taskKey)`), fixture.records['052'].canonicalTaskKeys);
  await click(page, `document.querySelector('[data-task-key="${WORKSPACE_052.selectedTaskKey}"]')`);
  inputSequence.push(`pointer: 052 Done filter and ${WORKSPACE_052.selectedTaskKey}`);
  assert.equal(await evaluate(page, `document.querySelector(
    '[data-task-instruction="${WORKSPACE_052.selectedTaskKey}"]'
  ).textContent`), expected052);
  assert.equal(await evaluate(page, `document.querySelector(
    '[data-task-detail="${WORKSPACE_052.selectedTaskKey}"]'
  ).innerText.includes('Not exposed by this source.')`), true);

  projection062 = await selectProjectedWork(
    '062',
    '062 Dude Canvas Workspace Integration',
    WORKSPACE_062.ideaPath,
  );
  assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
    ?.getAttribute('aria-pressed')`), 'true', 'Clear reset the prior 052 Done filter');
  await click(page, `document.querySelector('[data-task-key="${WORKSPACE_062.selectedTaskKey}"]')`);

  let pausedIndex = null;
  const stopIntercepting = page.on('Fetch.requestPaused', (event) => {
    if (new URL(event.request.url).pathname === '/api/work-index') pausedIndex = event;
  });
  try {
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/work-index', requestStage: 'Response' }],
    });
    await click(page, button('Refresh'));
    inputSequence.push('pointer: Refresh with mismatched task source identity');
    const paused = await until(() => pausedIndex, 'installed mismatched work-index response');
    const responseBody = await page.send('Fetch.getResponseBody', { requestId: paused.requestId });
    const value = JSON.parse(responseBody.base64Encoded
      ? Buffer.from(responseBody.body, 'base64').toString('utf8')
      : responseBody.body);
    const row = value.items.find((item) => item.ideaPath === WORKSPACE_062.ideaPath);
    const taskSource = row.sources.find((source) => source.path === WORKSPACE_062.tasksPath);
    assert.equal(taskSource.contentIdentity, fixture.records['062'].fixtureTasksRevision);
    taskSource.contentIdentity = `sha256:${'f'.repeat(64)}`;
    await page.send('Fetch.fulfillRequest', {
      requestId: paused.requestId,
      responseCode: paused.responseStatusCode,
      responseHeaders: (paused.responseHeaders ?? []).filter((header) => (
        !['content-length', 'transfer-encoding'].includes(header.name.toLowerCase())
      )),
      body: Buffer.from(JSON.stringify(value)).toString('base64'),
    });
  } finally {
    stopIntercepting();
    await page.send('Fetch.disable');
  }
  await visible(page, 'Current instruction unavailable');
  assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 0);
  assert.equal(await evaluate(page, `document.body.innerText.includes(${JSON.stringify(bodyMarker)})`), false);
  await click(page, button('Refresh'));
  inputSequence.push('pointer: Refresh restored agreeing source');
  await visible(page, bodyMarker);
  await click(page, `document.querySelector('[data-task-key="${WORKSPACE_062.selectedTaskKey}"]')`);

  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]')
    .getBoundingClientRect().width`), 48);
  await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
  inputSequence.push('pointer: expand 48px desktop rail');
  await until(() => evaluate(page, `document.querySelector('[data-navigation-pane]')
    .getBoundingClientRect().width === 208`), 'installed 208px desktop rail');
  await click(page, `document.querySelector('[aria-label="Collapse navigation pane"]')`);
  assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`),
    'Expand navigation pane');

  await installedViewport(page, 719, 'light');
  await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
  inputSequence.push('pointer/keyboard: open 719px overlay, Tab, Shift+Tab, Escape');
  await until(() => evaluate(page, `Boolean(document.querySelector('[data-navigation-dialog]'))`),
    'installed narrow navigation overlay');
  await until(() => evaluate(page, `Math.round(document.querySelector(
    '[data-navigation-dialog]'
  ).getBoundingClientRect().width) === 260`), 'installed narrow navigation painted width');
  assert.deepEqual(await evaluate(page, `(() => {
    const dialog = document.querySelector('[data-navigation-dialog]');
    const rect = dialog.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      headerInert: document.querySelector('header').inert,
      mainInert: document.querySelector('main').inert,
      footerInert: document.querySelector('footer').inert,
      focusInside: dialog.contains(document.activeElement),
    };
  })()`), {
    width: 260,
    headerInert: true,
    mainInert: true,
    footerInert: true,
    focusInside: true,
  });
  await pressKey(page, 'Tab');
  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-dialog]')
    .contains(document.activeElement)`), true);
  await pressKey(page, 'Tab', 'Tab', 8);
  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-dialog]')
    .contains(document.activeElement)`), true);
  audits.push(await auditInstalledWorkspace(
    page,
    'installed-workspace-navigation-overlay-719-light',
    ['Close navigation pane'],
  ));
  await pressKey(page, 'Escape');
  await until(() => evaluate(page, `!document.querySelector('[data-navigation-dialog]')`),
    'installed narrow navigation Escape dismissal');
  assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`),
    'Expand navigation pane');
  await installedViewport(page, 720, 'light');
  assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]')
    .getBoundingClientRect().width`), 48);

  // Named passages read at every width: the unit's first line, its first
  // Acceptance sentence, and its final sentence, which ends the unit.
  const acceptanceStart = expected062.indexOf(acceptanceMarker);
  const unitEnd = expected062.trimEnd().length;
  const instructionPassages = {
    start: [0, expected062.indexOf('\n')],
    acceptance: [acceptanceStart, expected062.indexOf('. ', acceptanceStart) + 1],
    end: [expected062.lastIndexOf('. ', unitEnd - 2) + 2, unitEnd],
  };
  for (const [passage, [start, end]] of Object.entries(instructionPassages)) {
    assert.ok(start >= 0 && end > start, `the selected instruction has a ${passage} passage`);
  }
  const readInstruction = async (name, expectedAxNames) => {
    const reading = await readSelectedInstruction(
      page,
      name,
      WORKSPACE_062.selectedTaskKey,
      instructionPassages,
      expectedAxNames,
    );
    audits.push(reading.audit);
    inputSequence.push(`keyboard: ${name} ${reading.keySummary}`);
  };

  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    for (const width of [360, 768, 1440, 1920]) {
      await installedViewport(page, width, theme);
      const detail = await until(() => evaluate(page, `(() => {
        const node = document.querySelector('[data-task-detail="${WORKSPACE_062.selectedTaskKey}"]');
        if (!node) return null;
        return {
          inRow: Boolean(node.closest('li')),
          inDock: Boolean(node.closest('aside')),
          instruction: node.querySelector('[data-task-instruction]')?.textContent,
          title: document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim(),
        };
      })()`), `installed ${width}px ${theme} task detail`);
      assert.equal(detail.instruction, expected062);
      assert.equal(detail.title, '062 Dude Canvas Workspace Integration');
      assert.equal(detail.inRow, width < 1080);
      assert.equal(detail.inDock, width >= 1080);
      await readInstruction(
        `installed-workspace-task-${width}-${theme}`,
        ['Verify the integrated built and installed walkthrough', 'Close task detail'],
      );
    }
  }
  await installedViewport(page, 768, 'light');
  await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await until(() => evaluate(page, `visualViewport?.scale === 2
    ? visualViewport.scale : null`), 'installed 200 percent page scale'), 2);
  await readInstruction(
    'installed-workspace-task-768-light-page-scale-200',
    ['Verify the integrated built and installed walkthrough'],
  );
  await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await installedViewport(page, 1440, 'light');

  await click(page, button('New idea'));
  assert.equal(await evaluate(page, `${field('Your idea')}.value`), draft);
  await click(page, button('Now'));
  assert.equal(await evaluate(page, `Boolean(document.querySelector(
    '[data-task-detail="${WORKSPACE_062.selectedTaskKey}"]'
  ))`), true, 'task detail survives ordinary New idea return');
  assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
    ?.getAttribute('aria-pressed')`), 'true');

  const finalProjection = await readCanvasProjection(canvasUrl);
  assert.equal(finalProjection.projection?.selected?.ideaPath, WORKSPACE_062.ideaPath);
  assert.equal(
    finalProjection.projection?.taskDetails?.items?.find((task) => (
      task.taskKey === WORKSPACE_062.selectedTaskKey
    ))?.instruction?.text,
    expected062,
  );
  return {
    status: 'installed-task-walkthrough-ready-for-review',
    sourceBacked: true,
    sourceAcquisition: fixture.sourceAcquisition,
    selectedIdeaPath: WORKSPACE_062.ideaPath,
    selectedTaskKey: WORKSPACE_062.selectedTaskKey,
    fixtureRevisions: {
      '062': fixture.records['062'].fixtureTasksRevision,
      '052': fixture.records['052'].fixtureTasksRevision,
      controlled: fixture.records.controlled.fixtureTasksRevision,
    },
    planned062: {
      taskKeys: WORKSPACE_062.taskKeys,
      phaseTotals: Array(5).fill('0 of 1 tasks complete'),
      resultCoverage: projection062.taskDetails.resultCoverage,
      fullBodySha256: sha256(expected062),
      bodyMarker,
      acceptanceMarker,
    },
    done052: {
      taskKeys: fixture.records['052'].canonicalTaskKeys,
      selectedTaskKey: WORKSPACE_052.selectedTaskKey,
      selectedBodySha256: sha256(expected052),
      archivedTaskExcluded: WORKSPACE_052.archivedTaskKey,
    },
    distinctions: {
      ready: TASK_CONTROL.readyTaskKey,
      dependencyWaiting: TASK_CONTROL.waitingTaskKey,
      explicitlyBlocked: TASK_CONTROL.blockedTaskKey,
      blocker: 'external-dependency: controlled installed blocker',
    },
    inventory: {
      records: initialIndex.items.length,
      unselectedFullBodies: false,
      selectedMixedSourceBodies: false,
    },
    errorTransition: {
      mismatchedSourceWithheld: true,
      agreeingSourceRestored: true,
    },
    navigation: {
      desktopRail: [48, 208],
      narrowOverlay: 260,
      breakpoint: 720,
      pageScale: 2,
      nativeZoomClaimed: false,
    },
    independentDraft: { sha256: sha256(draft), retained: true, submitted: false },
    inputSequence,
    audits,
  };
}

/**
 * Re-enter installed Now after the complete Review sequence and prove task
 * context and the independent draft were not retargeted or discarded.
 * @param {Cdp} page
 * @param {string} canvasUrl
 * @param {Awaited<ReturnType<typeof driveInstalledTaskWalkthrough>>} walkthrough
 * @param {ReturnType<typeof seedWorkspaceTaskFixtures>} fixture
 */
async function verifyInstalledTaskReturn(page, canvasUrl, walkthrough, fixture) {
  await click(page, button('Now'));
  await visible(page, walkthrough.planned062.bodyMarker);
  assert.equal(await evaluate(page, `Boolean(document.querySelector(
    '[data-task-detail="${WORKSPACE_062.selectedTaskKey}"]'
  ))`), true);
  assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
    ?.getAttribute('aria-pressed')`), 'true');
  const projection = await readCanvasProjection(canvasUrl);
  assert.equal(projection.projection?.selected?.ideaPath, WORKSPACE_062.ideaPath);
  assert.equal(
    projection.projection?.taskDetails?.items?.find((task) => (
      task.taskKey === WORKSPACE_062.selectedTaskKey
    ))?.instruction?.text,
    fixture.records['062'].selectedTaskInstruction,
  );
  await click(page, button('New idea'));
  const draft = await evaluate(page, `${field('Your idea')}.value`);
  assert.equal(sha256(draft), walkthrough.independentDraft.sha256);
  await click(page, button('Now'));
  const audit = await auditInstalledWorkspace(
    page,
    'installed-workspace-return-after-review',
    ['Verify the integrated built and installed walkthrough', 'Close task detail'],
  );
  return {
    selectedIdeaPath: projection.projection.selected.ideaPath,
    selectedTaskKey: WORKSPACE_062.selectedTaskKey,
    detailRetained: true,
    filterRetained: 'all',
    draftRetained: true,
    audit,
  };
}

const SAVED_MARKUP_DESCRIPTION =
  'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.';

/** @param {Cdp} page @param {string} label */
function awaitSavedMarkup(page, label) {
  return until(() => evaluate(page, `(() => {
    const node = ${button('Save markup')};
    if (!node?.matches('[aria-disabled="true"]')) return false;
    return (node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
      .filter(Boolean).join(' ') === ${JSON.stringify(SAVED_MARKUP_DESCRIPTION)};
  })()`), label);
}

/** @param {{left:number,top:number,right:number,bottom:number}} a @param {typeof a} b */
function sameBox(a, b, tolerance = 0.5) {
  return Boolean(a && b) && ['left', 'top', 'right', 'bottom']
    .every((edge) => Math.abs(a[edge] - b[edge]) <= tolerance);
}

/**
 * Bounded installed proof of the current Review gesture, driven with real
 * browser input against the engine this installed Canvas actually served.
 *
 * With a drawing tool armed, the already-selected mark keeps its handles for
 * resizing and its border for moving, two unmoved border presses open its
 * comment through the existing Comments path, and every other press still
 * draws. The out-and-back drag is the decisive history check: its geometry ends
 * equal to its origin, so no history entry may be recorded and the pending redo
 * must survive. The round's own two annotations and their exact saved
 * coordinates are restored through the existing Undo control before the caller
 * continues, so nothing here changes what is sent.
 *
 * @param {Cdp} page @param {string} root @param {string} version
 */
async function driveArmedManipulation(page, root, version) {
  const reviews = path.join(root, ...path.posix.dirname(SPEC_PATH).split('/'), 'reviews');
  const submissions = fs.existsSync(reviews)
    ? fs.readdirSync(reviews).filter((name) => (
      fs.existsSync(path.join(reviews, name, 'working.json'))
    ))
    : [];
  assert.equal(submissions.length, 1,
    'the armed gesture proof reads exactly one installed working state');
  const workingPath = path.join(reviews, submissions[0], 'working.json');
  const workingState = () => JSON.parse(fs.readFileSync(workingPath, 'utf8')).state;
  const tool = (label) => `document.querySelector('[data-review-tools] [aria-label=${
    JSON.stringify(label)}]')`;
  const overlayTool = () => evaluate(page,
    `document.querySelector('.dude-review-overlay')?.dataset.tool ?? null`);
  const overlayAction = () => evaluate(page, `(() => {
    const overlay = document.querySelector('.dude-review-overlay');
    return {action:overlay.dataset.action ?? null, cursor:getComputedStyle(overlay).cursor};
  })()`);
  const annotationCount = () => evaluate(page,
    `document.querySelectorAll('.dude-review-overlay g[data-annotation]').length`);
  // Read the mark where it is painted, so every press lands on what a reviewer
  // actually sees rather than on recomputed coordinates.
  const paintedBox = (id = null) => evaluate(page, `(() => {
    const wanted = ${JSON.stringify(id)};
    const groups = [...document.querySelectorAll('.dude-review-overlay g[data-annotation]')]
      .filter((node) => node.querySelector('rect'));
    const group = wanted ? groups.find((node) => node.dataset.annotation === wanted) : groups[0];
    if (!group) return null;
    const rect = group.querySelector('rect');
    const box = rect.getBBox();
    const ctm = rect.getScreenCTM();
    const at = (x, y) => {
      const point = new DOMPoint(x, y).matrixTransform(ctm);
      return {x:point.x, y:point.y};
    };
    const topLeft = at(box.x, box.y), bottomRight = at(box.x + box.width, box.y + box.height);
    return {id:group.dataset.annotation, left:topLeft.x, top:topLeft.y,
      right:bottomRight.x, bottom:bottomRight.y};
  })()`);
  const paintedHandle = (name) => evaluate(page, `(() => {
    const node = document.querySelector('.dude-review-overlay [data-handle=${name}]');
    if (!node) return null;
    const box = node.getBBox();
    const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2)
      .matrixTransform(node.getScreenCTM());
    return {x:point.x, y:point.y};
  })()`);
  const commentsOpen = () => evaluate(page,
    `Boolean(document.querySelector('[aria-label="Close comments"]'))`);
  const markedRow = () => evaluate(page,
    `document.querySelector('[data-annotation-id][aria-current="true"]')?.dataset.annotationId ?? null`);
  const focusedComment = () => evaluate(page, `(() => {
    const node = ${field('Comment (optional)')};
    return Boolean(node) && !node.disabled && document.activeElement === node;
  })()`);
  const historyControls = () => evaluate(page, `(() => {
    const usable = (label) => {
      const node = document.querySelector('[aria-label="' + label + '"]');
      return node ? !node.matches(':disabled,[aria-disabled="true"]') : null;
    };
    return {undo:usable('Undo annotation'), redo:usable('Redo annotation')};
  })()`);
  const round = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) });
  // Every press is proved to land on the annotation overlay first, so no
  // assertion rests on a guess about where the palette or the mock's own
  // content sits.
  const overlayPoint = async (target, label) => {
    const point = round(target);
    assert.equal(await evaluate(page, `Boolean(document.elementFromPoint(${point.x}, ${point.y})
      ?.closest('.dude-review-overlay'))`), true, `${label} must land on the reviewed overlay`);
    return point;
  };
  const clickUndo = () => click(page, `document.querySelector('[aria-label="Undo annotation"]')`);

  await click(page, tool('Select (V)'));
  await until(async () => await overlayTool() === 'select', 'installed Select tool armed');
  const origin = await paintedBox();
  assert.ok(origin, 'the installed round drew one rectangular mark to manipulate');
  assert.ok(origin.right - origin.left >= 160 && origin.bottom - origin.top >= 120,
    `the mark must hold an interior drawing away from its border: ${JSON.stringify(origin)}`);
  await pressPointer(page, await overlayPoint({
    x: (origin.left + origin.right) / 2, y: (origin.top + origin.bottom) / 2,
  }, 'the selecting press'));
  await until(() => workingState().selectedId === origin.id,
    'the installed working state records the pressed mark as selected');
  const saved = workingState();
  assert.equal(saved.annotations.length, 2, 'the armed proof starts from this round\'s own two marks');
  await click(page, tool('Box (B)'));
  await until(async () => await overlayTool() === 'box',
    'installed Box tool armed over the selected mark');

  // The hover cursor answers to the same classification the next press uses, so
  // it is read from real pointer movement over the served overlay.
  const hoverCursor = async (target, expected, label) => {
    const point = await overlayPoint(target, label);
    let observed = null;
    await until(async () => {
      await movePointer(page, point);
      observed = await overlayAction();
      return observed.action === expected.action && observed.cursor === expected.cursor;
    }, label);
    return observed;
  };
  const cornerHandle = await until(() => paintedHandle('nw'),
    'the selected mark keeps a painted corner handle while the drawing tool is armed');
  const cursors = {
    border: await hoverCursor(
      { x: origin.left, y: (origin.top + origin.bottom) / 2 },
      { action: 'move', cursor: 'move' },
      'a move cursor on the armed selected border',
    ),
    corner: await hoverCursor(
      cornerHandle,
      { action: 'nwse-resize', cursor: 'nwse-resize' },
      'a diagonal resize cursor on the armed selected corner handle',
    ),
    interior: await hoverCursor(
      { x: (origin.left + origin.right) / 2, y: (origin.top + origin.bottom) / 2 },
      { action: null, cursor: 'crosshair' },
      'the drawing cursor inside the selected mark',
    ),
  };
  assert.equal(await annotationCount(), 2, 'hovering the armed affordances draws nothing');
  assert.ok(sameBox(await paintedBox(origin.id), origin), 'and changes no geometry');

  const borderPoint = await overlayPoint(
    { x: origin.left, y: (origin.top + origin.bottom) / 2 }, 'the armed border move');
  await dragPointer(page, [borderPoint, await overlayPoint(
    { x: borderPoint.x + 30, y: borderPoint.y }, 'the armed border move release')]);
  const moved = await until(async () => {
    const next = await paintedBox(origin.id);
    return next && Math.abs(next.left - (origin.left + 30)) <= 1.5
      && Math.abs(next.right - (origin.right + 30)) <= 1.5
      && Math.abs(next.top - origin.top) <= 1.5 && Math.abs(next.bottom - origin.bottom) <= 1.5
      ? next : null;
  }, 'the armed border drag moves the whole selected mark');
  assert.equal(await annotationCount(), 2, 'the armed border move draws nothing');
  assert.equal(await overlayTool(), 'box', 'and leaves the drawing tool armed');

  const cornerPoint = await overlayPoint(await until(() => paintedHandle('nw'),
    'the moved mark repaints its corner handle before the armed resize'), 'the armed handle resize');
  const resizeTo = await overlayPoint(
    { x: cornerPoint.x - 16, y: cornerPoint.y - 12 }, 'the armed handle resize release');
  await dragPointer(page, [cornerPoint, resizeTo]);
  const resized = await until(async () => {
    const next = await paintedBox(origin.id);
    return next && Math.abs(next.left - resizeTo.x) <= 1.5 && Math.abs(next.top - resizeTo.y) <= 1.5
      && Math.abs(next.right - moved.right) <= 0.5 && Math.abs(next.bottom - moved.bottom) <= 0.5
      ? next : null;
  }, 'the armed handle drag resizes that same mark from its pressed corner');
  assert.equal(await annotationCount(), 2, 'the armed handle resize draws nothing');
  assert.equal(await overlayTool(), 'box', 'and leaves the drawing tool armed');

  const commentPoint = await overlayPoint(
    { x: resized.left, y: (resized.top + resized.bottom) / 2 }, 'the armed border comment gesture');
  await pressPointer(page, commentPoint, 2);
  await until(async () => await commentsOpen() && await focusedComment(),
    'two unmoved presses on the armed border open that mark\'s focused comment field');
  assert.equal(await markedRow(), origin.id, 'the opened comment belongs to the pressed mark');
  assert.equal(await annotationCount(), 2, 'the armed border gesture draws nothing');
  assert.ok(sameBox(await paintedBox(origin.id), resized), 'and moves nothing');
  assert.equal(await overlayTool(), 'box', 'the drawing tool is still armed');
  await click(page, `document.querySelector('[aria-label="Close comments"]')`);
  await until(async () => !(await commentsOpen()),
    'installed Comments closed after the armed border gesture');
  assert.ok(sameBox(await paintedBox(origin.id), resized),
    'the reviewed frame kept the mark where it was painted through the comment gesture');

  await dragPointer(page, [
    await overlayPoint({ x: resized.left + 40, y: resized.top + 40 }, 'the interior drawing'),
    await overlayPoint({ x: resized.left + 120, y: resized.top + 90 },
      'the interior drawing release'),
  ]);
  const drawnWhileArmed = await until(async () => {
    const count = await annotationCount();
    return count === 3 ? count : null;
  }, 'a press inside the selected mark, away from its border, still draws');
  assert.ok(sameBox(await paintedBox(origin.id), resized),
    'drawing inside the selected mark leaves that mark unchanged');
  assert.equal(await commentsOpen(), false, 'the interior drawing opens no comment');

  // Out and back: the drag ends exactly where it started, so the engine records
  // no geometry history and the redo entry left by this undo must survive it.
  await clickUndo();
  await until(async () => await annotationCount() === 2,
    'Undo removes the mark drawn inside the selection');
  const beforeOutAndBack = await until(async () => {
    const controls = await historyControls();
    return controls.undo && controls.redo ? controls : null;
  }, 'installed Undo and Redo settle before the out-and-back drag');
  await click(page, tool('Select (V)'));
  await until(async () => await overlayTool() === 'select',
    'installed Select tool armed to reselect the mark after Undo');
  await pressPointer(page, await overlayPoint({
    x: (resized.left + resized.right) / 2, y: (resized.top + resized.bottom) / 2,
  }, 'the reselecting press'));
  await until(() => workingState().selectedId === origin.id,
    'the restored mark is selected again before the out-and-back drag');
  await click(page, tool('Box (B)'));
  await until(async () => await overlayTool() === 'box',
    'installed Box tool re-armed for the out-and-back drag');
  const outAndBack = await overlayPoint(
    { x: resized.left, y: (resized.top + resized.bottom) / 2 }, 'the out-and-back drag');
  await dragPointer(page, [
    outAndBack,
    await overlayPoint({ x: outAndBack.x + 40, y: outAndBack.y + 25 }, 'the out-and-back excursion'),
    outAndBack,
  ]);
  assert.ok(sameBox(await paintedBox(origin.id), resized),
    'the out-and-back armed drag returns the mark to its origin');
  assert.equal(await commentsOpen(), false, 'and opens no comment');
  const afterOutAndBack = await until(async () => {
    const controls = await historyControls();
    return controls.undo ? controls : null;
  }, 'installed history controls settle after the out-and-back drag');
  assert.deepEqual(afterOutAndBack, { undo: true, redo: true },
    'a net-equal out-and-back records no history entry, so the pending redo survives');

  await clickUndo();
  await until(async () => {
    const next = await paintedBox(origin.id);
    return sameBox(next, moved);
  }, 'Undo reverts the armed resize');
  await clickUndo();
  await until(async () => {
    const next = await paintedBox(origin.id);
    return sameBox(next, origin);
  }, 'Undo reverts the armed move');
  const restored = await until(() => {
    const state = workingState();
    return state.annotations.length === 2
      && JSON.stringify(state.annotations) === JSON.stringify(saved.annotations) ? state : null;
  }, `installed Review ${version} markup restored to its own saved annotations`);
  await awaitSavedMarkup(page, `installed Review ${version} saved after the armed gesture proof`);
  return {
    annotationId: origin.id,
    cursors,
    origin,
    moved,
    resized,
    beforeOutAndBack,
    afterOutAndBack,
    drawnWhileArmed,
    restoredAnnotations: restored.annotations.length,
    restoredSelectedId: restored.selectedId,
    tool: await overlayTool(),
  };
}

/**
 * @param {Cdp} page
 * @param {string} version
 * @param {string} prompt
 * @param {string|null} [gestureRoot]
 * @param {string|null} [expectedBrowsingNumber]
 * @param {{fixture:ReturnType<typeof seedTaskWalkthrough>,draft:string,selectedTaskKey:string}|null} [walkthrough]
 */
async function driveReviewRound(
  page,
  version,
  prompt,
  gestureRoot = null,
  expectedBrowsingNumber = null,
  walkthrough = null,
) {
  if (walkthrough) await click(page, button('Respond to request'));
  else {
    await visible(page, prompt);
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes(${JSON.stringify(prompt)}) && node.getClientRects().length)`);
  }
  await visible(page, prompt);
  if (expectedBrowsingNumber) {
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Browsing"]')
      ?.innerText.includes(${JSON.stringify(expectedBrowsingNumber)})`), true,
    `installed Review ${version} keeps the independent browsing selection`);
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Request scope"]')
      ?.innerText.includes(${JSON.stringify(SPEC_PATH)})`), true,
    `installed Review ${version} names its actual request scope`);
  }
  assert.equal(await evaluate(page, `Boolean(document.querySelector('.dude-review-overlay')?.getClientRects().length)`), false,
    'opening a response never enters Review automatically');
  await click(page, button('Open Review'));
  await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
    && !document.querySelector('[aria-label="Box (B)"]').disabled`),
  `installed Review ${version} mounted`, 45_000);
  await openReviewDetails(page);
  await choose(page, 'Choose an element', `Revision ${version} review target.`);
  await click(page, button('Add comment'));
  const comment = `  Installed ${version}\u00a0annotation\n\nKeep \`literal\` wording.  `;
  await fill(page, field('Comment (optional)'), comment);
  await fill(page, field('Suggested replacement text'), `Replacement for installed ${version}.`);
  await fill(page, field('Suggested style change'), 'Keep this target visually prominent.');
  await click(page, `document.querySelector('[aria-label="Close comments"]')`);
  await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
  await openReviewDetails(page);
  await click(page, button('Add at center'));
  const saveTarget = await until(() => evaluate(page, `(() => {
    const node = ${button('Save markup')};
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const description = (node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
      .filter(Boolean).join(' ') || null;
    const result = {
      x:rect.left + rect.width / 2,
      y:rect.top + rect.height / 2,
      hit:Boolean(hit && (hit === node || node.contains(hit))),
      ariaDisabled:node.getAttribute('aria-disabled'),
      title:node.getAttribute('title'),
      description,
    };
    return result.ariaDisabled !== 'true'
      || description === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'
      ? result : null;
  })()`), `installed Review ${version} annotation completion`);
  assert.ok(saveTarget?.hit, 'Save markup remains pointer-reachable while autosave settles');
  if (saveTarget.ariaDisabled === 'true') {
    assert.equal(saveTarget.title, null, 'inactive Save markup has no conflicting native title');
    assert.equal(
      saveTarget.description,
      'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.',
      'an already-complete autosave is the only described disabled state accepted here',
    );
  } else {
    await click(page, button('Save markup'));
  }
  await until(() => evaluate(page, `(() => {
    const node = ${button('Save markup')};
    if (!node?.matches('[aria-disabled="true"]')) return false;
    return (node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
      .filter(Boolean).join(' ')
      === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.';
  })()`), `installed Review ${version} saved markup`);
  if (saveTarget.ariaDisabled !== 'true') {
    // The press leaves the pointer on Save markup, whose described tip then
    // opens over the palette below it. Rest the pointer on the request heading,
    // as a reviewer's would leave, and prove the tip closes before the next control.
    const rest = await evaluate(page, `(() => {
      const node = document.querySelector('[data-review-workspace] h1');
      const rect = node?.getBoundingClientRect();
      const x = rect && rect.left + rect.width / 2, y = rect && rect.top + rect.height / 2;
      return node && document.elementFromPoint(x, y) === node ? {x, y} : null;
    })()`);
    assert.ok(rest, 'the Review request heading is a pointer-reachable resting place');
    await movePointer(page, rest);
    await until(() => evaluate(page, `(() => {
      const ids = (${button('Save markup')}?.getAttribute('aria-describedby') || '')
        .split(/\\s+/).filter(Boolean);
      return ids.length > 0 && ids.every(id => !document.getElementById(id)?.getClientRects().length);
    })()`), `installed Review ${version} Save markup tip closed`);
  }
  const detailsDismissal = await closeReviewDetails(page);
  // Save is disabled-focusable after autosave. Its focused ScreenTip can
  // overlap Select; use the user's Escape dismissal, not a forced DOM click.
  const tooltipBefore = await evaluate(page, `[...document.querySelectorAll('[role="tooltip"]')]
    .filter(node => node.getClientRects().length).map(node => node.textContent)`);
  await pressKey(page, 'Escape');
  note('review-palette-entry', { version, detailsDismissal, tooltipBefore });
  const armedManipulation = gestureRoot
    ? await driveArmedManipulation(page, gestureRoot, version)
    : null;
  const workspaceReturn = walkthrough
    ? await driveReviewContinuity(page, walkthrough.fixture, walkthrough.draft, walkthrough.selectedTaskKey) : null;
  const beforeReturn = {
    comments: await evaluate(page, `[...document.querySelectorAll('button')]
      .find((node) => /^Comments \\(2\\)$/.test(node.innerText.trim()))?.innerText.trim()`),
    frame: await evaluate(page, `({
      width:document.querySelector('.dude-review-frame')?.clientWidth,
      height:document.querySelector('.dude-review-frame')?.clientHeight
    })`),
  };
  assert.equal(beforeReturn.comments, 'Comments (2)');
  await click(page, button('Back'));
  // Pressing Back focuses it first; the product returns focus in its next
  // effect, so read that settled focus rather than the press itself.
  const returnFocus = await until(() => evaluate(page, `(() => {
    const text = document.activeElement?.innerText.trim()
      || document.activeElement?.getAttribute('aria-label') || null;
    return ['Open Review', 'Needs you'].includes(text) ? text : null;
  })()`), `installed Review ${version} return focus`);
  assert.ok(['Open Review', 'Needs you'].includes(returnFocus));
  await click(page, button('Open Review'));
  await visible(page, 'Comments (2)');
  const afterReturn = {
    frame: await evaluate(page, `({
      width:document.querySelector('.dude-review-frame')?.clientWidth,
      height:document.querySelector('.dude-review-frame')?.clientHeight
    })`),
    browsing: expectedBrowsingNumber
      ? await evaluate(page, `document.querySelector('[aria-label="Browsing"]')
        ?.innerText.includes(${JSON.stringify(expectedBrowsingNumber)})`)
      : null,
  };
  assert.deepEqual(afterReturn.frame, beforeReturn.frame,
    `installed Review ${version} keeps its pinned frame across return`);
  if (expectedBrowsingNumber) assert.equal(afterReturn.browsing, true);
  const workingScreenshot = await screenshot(page, `installed-review-${version.toLowerCase()}-working`);
  const respondBefore = await evaluate(page, `performance.getEntriesByType('resource')
    .filter((entry) => entry.name.endsWith('/api/needs-you/respond')).length`);
  await click(page, button('Send annotations'));
  await evaluate(page, `(${button('Send annotations')})?.click()`);
  const respondAfter = await until(() => evaluate(page, `(() => {
    const count = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('/api/needs-you/respond')).length;
    return count > ${respondBefore} ? count : null;
  })()`), `installed Review ${version} response request`);
  assert.equal(respondAfter, respondBefore + 1,
    'double activation still issues exactly one response request');
  return {
    version,
    comment,
    detailsDismissal,
    armedManipulation,
    workspaceReturn,
    beforeReturn,
    afterReturn,
    returnFocus,
    workingScreenshot,
    respondBefore,
    respondAfter,
  };
}

/** @param {Cdp} page @param {string|null} [expectedBrowsingNumber] */
async function driveApproval(page, expectedBrowsingNumber = null) {
  const prompt = 'Approve exact installed revision C';
  await visible(page, prompt);
  await click(page, `[...document.querySelectorAll('button')].find((node) =>
    node.innerText.includes(${JSON.stringify(prompt)}) && node.getClientRects().length)`);
  if (expectedBrowsingNumber) {
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Browsing"]')
      ?.innerText.includes(${JSON.stringify(expectedBrowsingNumber)})`), true,
    'installed approval keeps the independent browsing selection');
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Request scope"]')
      ?.innerText.includes(${JSON.stringify(SPEC_PATH)})`), true,
    'installed approval names its actual request scope');
  }
  assert.equal(await evaluate(page, `${field('I approve the exact revision I reviewed.')}.checked`), false);
  assert.equal(await evaluate(page, `${button('Approve this revision')}.disabled`), true);
  await click(page, button('Open Review'));
  await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`),
    'installed revision C viewed', 45_000);
  await click(page, button('Back'));
  assert.equal(await evaluate(page, `${field('I approve the exact revision I reviewed.')}.checked`), false);
  await click(page, field('I approve the exact revision I reviewed.'));
  await click(page, button('Approve this revision'));
  await visible(page, 'Awaiting acknowledgment');
  await visible(page, 'The owner confirmed application');
  return { screenshot: await screenshot(page, 'installed-review-c-approved') };
}

const workspaceSourcePreimages = workspaceSourceHashes();
const manifest = {
  task: 'T005@e062a5b8',
  retainedAcceptance: 'T012@a57c1212',
  startedAt: new Date().toISOString(),
  command: `node ${fileURLToPath(import.meta.url)}`,
  run: RUN,
  repoRoot: ROOT,
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cli: CLI,
  cliRuntime: CLI_RUNTIME,
  sessionRuntime: SESSION_RUNTIME,
  cliDistDir: WINDOWS ? CLI_DIST_DIR : null,
  extensionHost: null,
  sdk: SDK,
  sdkSelection: process.env.DUDE_COPILOT_SDK ? 'DUDE_COPILOT_SDK' : `${process.platform} desktop app`,
  releaseSource: RELEASE_DIR ?? 'current source via buildRelease into owned fixtures',
  browser: BROWSER,
  installedCliVersion: null,
  identities: null,
  browserVersionCommand: null,
  approvedMockHashes: {},
  workspaceSourcePreimages,
  source: {},
  blankCases: [],
  packCase: null,
  importCase: null,
  sourceCase: null,
  taskWalkthrough: null,
  reviewCase: null,
  installedControls: null,
  desktopPanelCapability: null,
  cleanup: {},
  result: 'RUNNING',
};

let browserState;
/** @type {Awaited<ReturnType<typeof createInstalledHost>>[]} */
const hosts = [];
/** @type {http.Server[]} */
const modelServers = [];

try {
  assert.ok(SDK, 'Set DUDE_COPILOT_SDK to an existing SDK directory with real invocation cancellation.');
  ({ CopilotClient, RuntimeConnection } = await import(pathToFileURL(path.join(SDK, 'index.js'))));
  manifest.installedIdentities = {
    cli: await fileIdentity(CLI),
    runtime: await fileIdentity(CLI_RUNTIME),
    sdk: await fileIdentity(path.join(SDK, 'index.js')),
    sdkExtension: await fileIdentity(path.join(SDK, 'extension.js')),
    sdkTypes: await fileIdentity(path.join(SDK, 'types.d.ts')),
    browser: await fileIdentity(BROWSER),
  };
  const cliVersion = command(CLI, ['--version']);
  assert.equal(cliVersion.exitCode, 0, cliVersion.stderr);
  const bundledLauncherVersion = command(CLI, ['--no-auto-update', '--version']);
  assert.equal(bundledLauncherVersion.exitCode, 0, bundledLauncherVersion.stderr);
  const runtimeVersion = command(process.execPath, [CLI_RUNTIME, '--no-auto-update', '--version']);
  assert.equal(runtimeVersion.exitCode, 0, runtimeVersion.stderr);
  manifest.installedCliVersion = {
    launcher: cliVersion.stdout.trim(),
    launcherWithUpdateResolutionDisabled: bundledLauncherVersion.stdout.trim(),
    resolvedRuntime: runtimeVersion.stdout.trim(),
  };
  // The actual installed artifacts this run used, by content and not only by path.
  manifest.identities = {
    sdk: {
      directory: SDK,
      indexJsSha256: hashFile(path.join(SDK, 'index.js')),
      extensionJsSha256: hashFile(path.join(SDK, 'extension.js')),
    },
    cli: { path: CLI, sha256: hashFile(CLI), version: manifest.installedCliVersion },
    runtime: { path: CLI_RUNTIME, sha256: hashFile(CLI_RUNTIME) },
    browser: { path: BROWSER, sha256: hashFile(BROWSER) },
    node: { path: process.execPath, version: process.version },
  };
  const appHelp = command(CLI, ['app', '--help']);
  assert.equal(appHelp.exitCode, 0, appHelp.stderr);
  // sdef and the app bundle exist only on macOS; elsewhere record why no probe ran.
  const appScripting = process.platform === 'darwin'
    ? command('/usr/bin/sdef', ['/Applications/GitHub Copilot.app'])
    : null;
  manifest.desktopPanelCapability = {
    appHelp: appHelp.stdout.trim(),
    scriptingDictionary: appScripting
      ? {
        attempted: true,
        exitCode: appScripting.exitCode,
        available: appScripting.exitCode === 0,
        diagnostic: appScripting.exitCode === 0 ? null : appScripting.error ?? appScripting.stderr.trim(),
      }
      : {
        attempted: false,
        applicable: false,
        exitCode: null,
        available: null,
        diagnostic: `Not applicable on ${process.platform}: /usr/bin/sdef and the macOS app bundle are Darwin-only; no scripting-dictionary probe ran and no evidence was recorded.`,
      },
    supportedIsolatedPanelAutomation: false,
    reason: 'This driver exercises the SDK canvas URL in owned Edge/CDP, not a native desktop panel. Actual SDK capabilities, canvas.open fields, and installed app help are recorded below; no isolated native-panel control has been established. An unavailable or failed scripting probe is not evidence that GUI support is absent. Attaching to the foreground app could disrupt the active parent session and is not attempted.',
    remainingSmoke: [
      'Open the Dude panel in the disposable installed workspace.',
      'Confirm usable current panel sizing, current light/dark theme, and keyboard focus entry.',
      'Open the visible bottom Settings destination; confirm the embedded panel keeps its left rail, toolbar, pager, and current-theme contrast without host-chrome clipping.',
      `Select ${PACK_NAME} under Available, activate Install once, inspect the exact preview, enter INSTALL PACK ${PACK_NAME}, and confirm the correlated Applied result after the authoritative installed-state refresh.`,
      'Open Settings > Packs > Add/import, request one local skill import, consent in Needs you, and confirm Applied, then Show in Installed lists the new project skill; confirm the imported agent or skill needs a new session before the host loads it.',
      'Open Settings > Packs > Sources, add one local folder that contains library/packs, choose Show packs in Available, install its pack, consent in Needs you, and confirm Applied; confirm the source row then shows the pack as installed from it and its Remove names that use.',
      'With the work finder set to Closed, enter Review design and return; confirm the Closed finder context remains.',
      'Reload once, then close and reopen the panel; confirm the current Canvas reconnects.',
    ],
  };
  if (!appScripting) {
    note('desktop-scripting-dictionary-not-applicable', {
      platform: process.platform,
      diagnostic: manifest.desktopPanelCapability.scriptingDictionary.diagnostic,
    });
  }
  // On Windows, read the executable's version resource instead of starting a
  // second browser instance for --version; CDP reports the running build below.
  manifest.browserVersionCommand = WINDOWS
    ? windowsQuery(`(Get-Item -LiteralPath '${BROWSER.replaceAll("'", "''")}').VersionInfo `
      + '| Select-Object ProductName,ProductVersion,FileVersion | ConvertTo-Json -Compress')
    : command(BROWSER, ['--version']);
  assert.equal(manifest.browserVersionCommand.exitCode, 0, manifest.browserVersionCommand.stderr);
  if (WINDOWS) {
    const browserVersions = JSON.parse(manifest.browserVersionCommand.stdout);
    assert.match(browserVersions.ProductVersion, /^\d+(?:\.\d+){3}$/,
      `browser executable has no version resource: ${BROWSER}`);
  }
  for (const [relative, expected] of Object.entries(APPROVED_HASHES)) {
    const actual = sha256(sourceBytes(relative));
    assert.equal(actual, expected, `approved mock changed: ${relative}`);
    manifest.approvedMockHashes[relative] = actual;
  }
  manifest.source = {
    app: { bytes: sourceBytes('src/extensions/dude/ui/assets/app.js').length, sha256: SOURCE_APP_SHA256 },
    about: sha256(sourceBytes('src/extensions/dude/lib/about.mjs')),
    legal: {
      bytes: sourceBytes('src/extensions/dude/ui/assets/app.js.LEGAL.txt').length,
      sha256: SOURCE_LEGAL_SHA256,
    },
    review: Object.fromEntries(Object.entries(SOURCE_REVIEW_MODULES).map(([relative, expected]) => [
      relative,
      { bytes: sourceBytes(`src/extensions/dude/${relative}`).length, sha256: expected },
    ])),
    extension: sha256(sourceBytes('src/extensions/dude/extension.mjs')),
  };
  browserState = await startBrowser();
  manifest.uiBrowser = browserState.version;
  note('browser-ready', {
    browser: browserState.version.Browser,
    protocolVersion: browserState.version['Protocol-Version'],
  });

  for (const kind of ['blank-non-git', 'blank-git']) {
    const root = path.join(RUN, kind);
    const data = path.join(RUN, `${kind}-runtime`);
    const evidence = path.join(RUN, `${kind}-evidence`);
    fs.mkdirSync(evidence, { recursive: true });
    const release = installRelease(root);
    if (kind === 'blank-git') {
      const init = command('git', ['init', '--quiet', root]);
      assert.equal(init.exitCode, 0, init.stderr);
    }
    const blank = assertBlankInstall(root, kind);
    // The Git install is pre-seeded as a development install with a known
    // base; the non-Git install keeps the builder's release metadata.
    const development = kind === 'blank-git' ? seedDevelopmentInstall(root) : null;
    const parity = installedParity(root);
    const intent = blankIntent(kind);
    const slug = blankSlug(kind);
    const model = createBlankModel({ root, kind, intent, slug, evidence });
    modelServers.push(model.server);
    const modelUrl = await listen(model.server);
    const host = await createInstalledHost({ root, data, modelUrl, caseName: kind });
    hosts.push(host);
    manifest.activeCase = { kind, host: host.record, model: model.state };
    const idle = await host.session.sendAndWait({
      prompt: `T012 ${kind} bootstrap: return the deterministic idle marker.`,
    }, 30_000);
    assert.equal(idle?.data.content, 'T012_BLANK_HOST_IDLE');
    assert.equal(model.state.phase, 'idle');
    const browser = await driveBlankCapture(browserState.page, host.canvas.url, intent, model.state, development && {
      root,
      name: kind,
      cliVersions: Object.values(manifest.installedCliVersion),
    });
    await until(() => model.state.phase === 'complete' || model.state.modelError,
      `${kind} owner acknowledgment`);
    if (model.state.modelError) throw new Error(model.state.modelError);
    const capture = model.state.capture;
    assert.ok(capture);
    const expectedCapture = captureFixture({ root, intent, slug, evidence });
    const canonical = fs.readFileSync(path.join(root, ...capture.ideaPath.split('/')), 'utf8');
    const staged = fs.readFileSync(expectedCapture.stagePath, 'utf8');
    assert.equal(staged, expectedCapture.bytes.toString('utf8'));
    assert.equal(canonical, staged);
    assert.ok(canonical.includes(ownerText(intent)));
    assert.equal(fs.existsSync(path.join(root, '.dude/specs')), false);
    assert.equal(fs.existsSync(path.join(root, '.beads')), false);
    const snapshot = await (await fetch(new URL('/api/needs-you', host.canvas.url))).json();
    assert.equal(snapshot.captures.length, 1);
    assert.equal(snapshot.captures[0].saved, true);
    assert.equal(snapshot.captures[0].intent, intent);
    assert.equal(snapshot.capture.waitingRequests.length, 0);
    assert.equal(host.record.permissions.filter((entry) => entry.decision === 'reject').length, 0);
    assert.equal(host.record.agentAfterSelectionCheck.agent?.name, 'Dude');
    assert.equal(host.record.events['subagent.deselected'] ?? 0, 0);
    assert.equal(new Set(
      host.record.delegationEvents.map((event) => event.agentId).filter(Boolean),
    ).size, 1);
    assert.deepEqual(
      model.state.ownerExecution.specLeadToolCalls.map(({ tool }) => tool),
      ['view', 'create', 'view'],
    );
    assert.equal(model.state.ownerExecution.parentSkillCallId, `call_${kind}_dude_definition_skill`);
    assert.equal(model.state.ownerExecution.publisherCallId, `call_${kind}_publish_capture`);
    assert.equal(model.state.ownerExecution.canonicalReadCallId, `call_${kind}_read_canonical`);
    assert.equal(capture.publisherExitCode, 0);
    manifest.blankCases.push({
      kind,
      root,
      data,
      releaseFiles: release.files.length,
      blank,
      development,
      parity,
      intentSha256: sha256(intent),
      capture,
      provider: snapshot,
      host: host.record,
      model: model.state,
      browser,
      noSpecOrTasks: true,
      realModelReasoning: false,
      ownerRoute: `raw selected Dude delegated staging to the installed Spec Lead, invoked the shipped publisher through ${model.state.ownerExecution.publisherTool}, reread the canonical draft through view, then acknowledged; the model fixture made no file write`,
      fileLineEndings: process.platform === 'win32' ? 'CRLF from the installed create tool; receipt intent stays LF' : 'LF',
    });
    note('blank-case-passed', {
      kind,
      sessionId: host.record.sessionId,
      ideaPath: capture.ideaPath,
      canvas: host.canvas.url,
    });
    await closeInstalledHost(host);
    await closeServer(model.server);
  }

  const packRoot = path.join(RUN, 'pack-roundtrip');
  const packData = path.join(RUN, 'pack-roundtrip-runtime');
  const packRelease = installRelease(packRoot);
  const packParity = installedParity(packRoot);
  const installedPack = seedPackFixture(packRoot);
  const realHostPackProbe = WINDOWS ? await probeRealHostPackRead(packRoot) : null;
  const realHostPackStallProbe = WINDOWS ? await probeRealHostPackStall() : null;
  const packModel = createPackModel(packRoot);
  modelServers.push(packModel.server);
  const packModelUrl = await listen(packModel.server);
  const packHost = await createInstalledHost({
    root: packRoot,
    data: packData,
    modelUrl: packModelUrl,
    caseName: 'pack-roundtrip',
  });
  hosts.push(packHost);
  const packIdle = await packHost.session.sendAndWait({
    prompt: 'T012 installed pack round trip bootstrap.',
  }, 30_000);
  assert.equal(packIdle?.data.content, 'T012_PACK_HOST_IDLE');
  assert.equal(packModel.state.phase, 'idle');
  // The installed extension's own pack reads, before Settings drives it. Phase B reads a catalog only on
  // explicit discovery (`?discover=1`): the plain read answers installed state and the saved sources and
  // acquires no catalog, so it needs no reader process, and only the discovery read exercises the
  // launcher's real extension runtime. The bound exceeds the reader's deadline plus stop window, so a
  // hung read fails.
  const hostPackReadOnce = async (query) => {
    const started = Date.now();
    const response = await fetch(new URL(`/api/packs${query}`, packHost.canvas.url), {
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200, `installed-host pack read status${query}`);
    const snapshot = await response.json();
    return {
      elapsedMs: Date.now() - started,
      coverage: snapshot.coverage,
      origin: snapshot.catalog?.origin ?? null,
      packs: snapshot.catalog?.packs.map((pack) => pack.name) ?? null,
      sources: snapshot.sources?.items.map((item) => ({ name: item.name, scope: item.scope, status: item.status, count: item.count })) ?? null,
    };
  };
  const hostPackPlain = await hostPackReadOnce('');
  assert.deepEqual(hostPackPlain.coverage.catalog.state, 'not_read',
    `the plain installed-host read acquires no catalog: ${JSON.stringify(hostPackPlain.coverage)}`);
  assert.equal(hostPackPlain.origin, null);
  assert.equal(hostPackPlain.packs, null);
  assert.ok(hostPackPlain.sources.length >= 1, 'the plain read still lists the built-in sources');
  assert.deepEqual(hostPackPlain.sources.filter((item) => item.status !== 'not_read' || item.count !== null), [],
    'every source row says Not read, with no count');
  const hostPackRead = { ...(await hostPackReadOnce('?discover=1')), extensionExecutable: packHost.record.extensionProcess.executable, plain: hostPackPlain };
  assert.deepEqual(hostPackRead.coverage.catalog, { state: 'current', reason: null, message: null },
    `installed-host catalog read: ${JSON.stringify(hostPackRead.coverage)}`);
  assert.equal(hostPackRead.origin, 'local');
  assert.deepEqual(hostPackRead.packs, [PACK_NAME]);
  note('installed-host-pack-read', hostPackRead);
  const packBrowser = await driveInstalledPackRoundTrip(
    browserState.page,
    packHost.canvas.url,
    installedPack,
    packModel.state,
    Object.values(manifest.installedCliVersion),
  );
  await until(async () => !(await packHost.session.rpc.metadata.isProcessing()).processing,
    'installed pack session idle', 30_000);
  assert.equal(packModel.state.phase, 'complete');
  assert.equal(packModel.state.packPromptRequests, 1);
  assert.equal(packHost.record.permissions.filter((entry) => entry.decision === 'reject').length, 0);
  assert.equal(packHost.record.agentAfterSelectionCheck.agent?.name, 'Dude');
  assert.equal(packHost.record.events['subagent.deselected'] ?? 0, 0);
  manifest.packCase = {
    root: packRoot,
    data: packData,
    releaseFiles: packRelease.files.length,
    parity: packParity,
    fixture: {
      name: PACK_NAME,
      manifest: PACK_MANIFEST_PATH,
      source: PACK_SOURCE_PATH,
      destination: PACK_DESTINATION,
      recordedSource: installedPack.source,
    },
    host: packHost.record,
    hostPackRead,
    realHostPackProbe,
    realHostPackStallProbe,
    model: packModel.state,
    browser: packBrowser,
    about: packBrowser.about,
    installedEntry: installedProfile(packRoot).value.installed[PACK_NAME],
    actualComposeApplication: true,
    authoritativeProviderReread: true,
    realModelReasoning: false,
    desktopAppRendererObserved: false,
    ownerRoute: 'selected installed Dude loaded dude-compose, read actual eligibility/manifest/source, published and recognized exact permission, ran the installed Compose add --envelope and lint commands once, reread the profile through view, then acknowledged with the observed Compose stdout unchanged as the pack result for the provider reread',
  };
  note('pack-case-passed', {
    sessionId: packHost.record.sessionId,
    name: PACK_NAME,
    destination: PACK_DESTINATION,
    packReceipt: packBrowser.provider.packRequests[0].packReceipt,
    about: packBrowser.about.applied.api.body,
  });
  manifest.extensionHost = {
    // The OS process table names the extension's executable; the probe reports
    // execPath and Node version from inside that same executable.
    executable: packHost.record.extensionProcess.executable,
    execPath: realHostPackProbe?.result.execPath ?? null,
    node: realHostPackProbe?.result.node ?? null,
    nodeEvidence: realHostPackProbe
      ? 'in-process probe through the installed CLI extension launch contract'
      : `not collected on ${process.platform}; the launcher host is unverified here`,
  };
  await browserState.page.send('Page.navigate', { url: 'about:blank' });
  await closeInstalledHost(packHost);
  await closeServer(packModel.server);

  // 073 Add/import: the installed owner imports one local skill file and one local directory through
  // the shipped route and import skill, and Installed lists each result without Reload. Its own
  // release fixture and host start fresh, so the checked frontend and backend are the same bytes.
  const importRoot = path.join(RUN, 'import-roundtrip');
  const importData = path.join(RUN, 'import-roundtrip-runtime');
  const importRelease = buildRelease({
    repoRoot: ROOT,
    outDir: importRoot,
    ref: 'v0.0.0-t012',
  });
  const importParity = installedParity(importRoot);
  const importerPairs = importerParity(importRoot);
  const importSeed = seedImportFixture(importRoot);
  const { validateDirectoryImportResult } = await import(pathToFileURL(path.join(
    importRoot,
    '.github/skills/dude-bundle-import/lib/directory-import.mjs',
  )));
  const importModel = createImportModel(importSeed, { validateDirectoryImportResult });
  modelServers.push(importModel.server);
  const importModelUrl = await listen(importModel.server);
  const importHost = await createInstalledHost({
    root: importRoot,
    data: importData,
    modelUrl: importModelUrl,
    caseName: 'import-roundtrip',
    approve: importModel.approve,
  });
  hosts.push(importHost);
  const importIdle = await importHost.session.sendAndWait({
    prompt: 'T012 installed import round trip bootstrap.',
  }, 30_000);
  assert.equal(importIdle?.data.content, 'T012_IMPORT_HOST_IDLE');
  assert.equal(importModel.state.phase, 'idle');
  const importServed = await servedIdentity(importHost.canvas.url);
  const importBefore = workspaceFiles(importRoot);
  const importBrowser = await driveInstalledImportRoundTrip(
    browserState.page,
    importHost.canvas.url,
    importSeed,
    importModel,
  );
  await until(async () => !(await importHost.session.rpc.metadata.isProcessing()).processing,
    'installed import session idle', 30_000);
  assert.equal(importModel.state.phase, 'complete');
  assert.equal(importModel.state.imports.length, 2);
  assert.equal(importHost.record.permissions.filter((entry) => entry.decision === 'reject').length, 0);
  assert.equal(importHost.record.agentAfterSelectionCheck.agent?.name, 'Dude');
  assert.equal(importHost.record.events['subagent.deselected'] ?? 0, 0);
  // Every owner call that asks the host for permission was approved as made, and the workspace
  // changed by exactly the files the importer reported, nothing else.
  const approvedCalls = new Set(importHost.record.permissions.map((entry) => entry.toolCallId));
  assert.deepEqual(
    importModel.state.ownerToolCalls.filter((entry) => entry.tool !== 'skill' && !approvedCalls.has(entry.callId)),
    [],
  );
  const importAfter = workspaceFiles(importRoot);
  const importWritten = [...importSeed.file.written, ...importSeed.directory.written].sort();
  assert.deepEqual(
    Object.keys(importAfter).filter((relative) => importBefore[relative] === undefined).sort(),
    importWritten,
    'the workspace gained exactly the imported files',
  );
  assert.deepEqual(
    Object.keys(importBefore).filter((relative) => importAfter[relative] !== importBefore[relative]),
    [],
    'no existing workspace file changed or disappeared',
  );
  manifest.importCase = {
    root: importRoot,
    data: importData,
    releaseFiles: importRelease.files.length,
    parity: importParity,
    importerParity: importerPairs,
    served: importServed,
    sources: importSeed.sources,
    evidence: importSeed.evidence,
    handMadeRows: importSeed.fillNames.length,
    host: importHost.record,
    model: importModel.state,
    browser: importBrowser,
    workspaceDelta: {
      added: importWritten,
      destinations: Object.fromEntries(importWritten.map((relative) => [relative, importAfter[relative]])),
    },
    actualImporterApplication: true,
    testPerformedNoApplication: true,
    realModelReasoning: false,
    desktopAppRendererObserved: false,
    ownerRoute: 'selected installed Dude loaded dude-bundle-import, previewed each local source with the unchanged importer, published and had recognized the exact permission, rechecked the reviewed basis, ran apply or apply-directory once, verified lint and every written path, then acknowledged the separate import_result; the model fixture made no workspace write',
  };
  note('import-case-passed', {
    sessionId: importHost.record.sessionId,
    receipts: importBrowser.journeys.map((entry) => entry.receipt),
    keys: importBrowser.journeys.map((entry) => entry.key),
    written: importWritten.length,
  });
  await browserState.page.send('Page.navigate', { url: 'about:blank' });
  await closeInstalledHost(importHost);
  await closeServer(importModel.server);

  // 073 Phase B: the installed owner installs a pack from a source added through Settings. The browser adds a
  // local folder as a pack source, shows its packs in Available, selects the source-qualified pack, and
  // requests the install; the installed Dude previews that source, obtains literal permission, runs Compose
  // with exactly that source, and acknowledges the source-bound result. The test saves, installs, and applies
  // nothing after seeding, and no network source is contacted. Its own release fixture and host start fresh.
  const sourceRoot = path.join(RUN, 'source-roundtrip');
  const sourceData = path.join(RUN, 'source-roundtrip-runtime');
  const sourceRelease = buildRelease({
    repoRoot: ROOT,
    outDir: sourceRoot,
    ref: 'v0.0.0-t012',
  });
  const sourceParity = installedParity(sourceRoot);
  const sourceSeed = seedSourceFixture(sourceRoot);
  const installedSources = await import(pathToFileURL(path.join(
    sourceRoot,
    '.github/skills/dude-engine/lib/pack-sources.mjs',
  )));
  const sourceModel = createSourceModel(sourceSeed, installedSources);
  modelServers.push(sourceModel.server);
  const sourceModelUrl = await listen(sourceModel.server);
  const sourceHost = await createInstalledHost({
    root: sourceRoot,
    data: sourceData,
    modelUrl: sourceModelUrl,
    caseName: 'source-roundtrip',
    approve: sourceModel.approve,
  });
  hosts.push(sourceHost);
  const sourceIdle = await sourceHost.session.sendAndWait({
    prompt: 'T012 installed source round trip bootstrap.',
  }, 30_000);
  assert.equal(sourceIdle?.data.content, 'T012_SOURCE_HOST_IDLE');
  assert.equal(sourceModel.state.phase, 'idle');
  const sourceServed = await servedIdentity(sourceHost.canvas.url);
  const sourceBrowser = await driveInstalledSourceRoundTrip(
    browserState.page,
    sourceHost.canvas.url,
    sourceSeed,
    sourceModel,
    installedSources,
  );
  await until(async () => !(await sourceHost.session.rpc.metadata.isProcessing()).processing,
    'installed source session idle', 30_000);
  assert.equal(sourceModel.state.phase, 'complete');
  assert.equal(sourceHost.record.permissions.filter((entry) => entry.decision === 'reject').length, 0);
  assert.equal(sourceHost.record.agentAfterSelectionCheck.agent?.name, 'Dude');
  assert.equal(sourceHost.record.events['subagent.deselected'] ?? 0, 0);
  // Every owner call that asks the host for permission was approved as made, and Compose was run exactly once.
  const sourceApproved = new Set(sourceHost.record.permissions.map((entry) => entry.toolCallId));
  assert.deepEqual(
    sourceModel.state.ownerToolCalls.filter((entry) => entry.tool !== 'skill' && !sourceApproved.has(entry.callId)),
    [],
  );
  assert.equal(sourceModel.state.ownerToolCalls.filter((entry) => entry.writes !== null).length, 1,
    'one owner call wrote the workspace: Compose');
  manifest.sourceCase = {
    root: sourceRoot,
    data: sourceData,
    releaseFiles: sourceRelease.files.length,
    parity: sourceParity,
    served: sourceServed,
    team: sourceSeed.team,
    realTeam: sourceSeed.realTeam,
    host: sourceHost.record,
    model: sourceModel.state,
    browser: sourceBrowser,
    actualComposeApplication: true,
    testPerformedNoApplication: true,
    networkSourceContacted: false,
    realModelReasoning: false,
    desktopAppRendererObserved: false,
    ownerRoute: 'selected installed Dude loaded dude-compose and its Sources procedure, previewed the bound local folder with Compose, read its pack and the saved sources revision, published and had recognized the exact third-party permission, rechecked the saved sources, ran Compose add --source --envelope once with exactly the bound folder, verified lint and the profile, then acknowledged the pack_result with the exact catalogSource echoed; the model fixture made no workspace write',
  };
  note('source-case-passed', {
    sessionId: sourceHost.record.sessionId,
    key: sourceBrowser.keys.teamKey,
    receipt: sourceModel.state.record.binding.receiptId,
    destination: sourceModel.state.record.compose.destination,
  });
  await browserState.page.send('Page.navigate', { url: 'about:blank' });
  await closeInstalledHost(sourceHost);
  await closeServer(sourceModel.server);

  const root = path.join(RUN, 'review-git');
  const data = path.join(RUN, 'review-git-runtime');
  const evidence = path.join(RUN, 'review-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const release = installRelease(root);
  const init = command('git', ['init', '--quiet', root]);
  assert.equal(init.exitCode, 0, init.stderr);
  const parity = installedParity(root);
  createReviewOwner(root);
  const workspaceFixture = seedWorkspaceTaskFixtures(root);
  const { sourceAcquisition } = workspaceFixture;
  assert.ok(manifest.startedAt <= sourceAcquisition.startedAt
    && sourceAcquisition.startedAt <= sourceAcquisition.completedAt,
  `task snapshot source was read during this run: ${JSON.stringify({
    runStartedAt: manifest.startedAt,
    sourceAcquisition,
  })}`);
  const taskFixture = seedTaskWalkthrough(root, workspaceFixture);
  const taskEvidence = { fixture: taskFixture, projections: [], visual: [], taskInspectionCompleted: false };
  manifest.taskWalkthrough = { fixture: workspaceFixture, integrated: taskEvidence };
  const ownerModule = await import(pathToFileURL(path.join(
    root,
    '.github/skills/dude-engine/lib/feature.mjs',
  )));
  const owner = ownerModule.resolveFeatureOwner({ root, specPath: SPEC_PATH });
  assert.deepEqual(owner.diagnostics, []);
  assert.equal(owner.owner.ideaPath, IDEA_PATH);
  const model = createReviewModel(root, evidence);
  modelServers.push(model.server);
  const modelUrl = await listen(model.server);
  const host = await createInstalledHost({ root, data, modelUrl, caseName: 'review-git' });
  hosts.push(host);
  manifest.activeCase = { kind: 'review-git', host: host.record, model: model.state };
  manifest.desktopPanelCapability.sdkUiCanvases = host.record.capabilities.ui?.canvases ?? false;
  manifest.desktopPanelCapability.canvasOpenFields = Object.keys(host.canvas).sort();
  manifest.desktopPanelCapability.automatedRenderer = 'owned Edge/CDP URL renderer, not desktop app chrome';
  const network = [];
  const runtimeErrors = [];
  browserState.page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(host.canvas.url)) {
      network.push({ method: event.request.method, path: new URL(event.request.url).pathname });
    }
  });
  browserState.page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  await navigate(browserState.page, host.canvas.url, 1440);
  const served = await servedIdentity(host.canvas.url);
  const initialMessageId = await host.session.send({
    prompt: 'T012 installed Review: publish revision A and follow the bounded A→B→C fixture sequence.',
  });
  assert.ok(initialMessageId);
  await until(() => model.state.phase === 'waiting-a' || model.state.modelError,
    'revision A installed waiter');
  if (model.state.modelError) throw new Error(model.state.modelError);
  await driveTaskWalkthrough(browserState.page, host, taskFixture, taskEvidence);
  await clearWork(browserState.page);
  const taskWalkthrough = await driveInstalledTaskWalkthrough(
    browserState.page,
    host.canvas.url,
    workspaceFixture,
    taskEvidence.newIdeaDraft,
  );
  const roundA = await driveReviewRound(
    browserState.page,
    'A',
    'Annotate exact installed revision A',
    root,
    '062',
    { fixture: taskFixture, draft: taskEvidence.newIdeaDraft, selectedTaskKey: taskWalkthrough.selectedTaskKey },
  );
  await until(() => model.state.phase === 'waiting-b' || model.state.modelError,
    'same owner revision B request', 45_000);
  if (model.state.modelError) throw new Error(model.state.modelError);
  await click(browserState.page, button('Back'));
  await click(browserState.page, button('All requests'));
  const roundB = await driveReviewRound(
    browserState.page,
    'B',
    'Annotate exact installed revision B',
    null,
    '062',
  );
  await until(() => model.state.phase === 'waiting-c' || model.state.modelError,
    'same owner revision C request', 45_000);
  if (model.state.modelError) throw new Error(model.state.modelError);
  await click(browserState.page, button('Back'));
  await click(browserState.page, button('All requests'));
  const approval = await driveApproval(browserState.page, '062');
  await until(() => model.state.phase === 'complete' || model.state.modelError,
    'current revision C owner approval acknowledgment', 45_000);
  if (model.state.modelError) throw new Error(model.state.modelError);
  await until(async () => !(await host.session.rpc.metadata.isProcessing()).processing,
    'installed Review session idle', 30_000);
  const taskReturn = await verifyInstalledTaskReturn(
    browserState.page,
    host.canvas.url,
    taskWalkthrough,
    workspaceFixture,
  );
  const provider = await (await fetch(new URL('/api/needs-you', host.canvas.url))).json();
  assert.deepEqual(
    provider.requests.map((entry) => ({
      ref: entry.request.requestRef,
      phase: entry.phase,
      action: entry.responseAction,
    })),
    [
      { ref: 't012-preview-a', phase: 'applied', action: 'annotations' },
      { ref: 't012-preview-b', phase: 'applied', action: 'annotations' },
      { ref: 't012-preview-c', phase: 'applied', action: 'approve' },
    ],
  );
  assert.equal(model.state.rounds.length, 2);
  assert.equal(model.state.acknowledgments.length, 3);
  const offeredCanvasTools = model.state.offeredTools.filter((name) => /canvas/i.test(name));
  assert.deepEqual(offeredCanvasTools, []);
  manifest.desktopPanelCapability.selectedDudeCanvasTools = offeredCanvasTools;
  manifest.desktopPanelCapability.catalogConclusion =
    'The raw selected Dude catalog exposed no canvas renderer tools in this ui.canvases=false SDK host; no tool grant is recommended from this evidence.';
  assert.deepEqual(new Set(model.state.acknowledgments.map((entry) => entry.sessionId)),
    new Set([host.record.sessionId]));
  assert.equal(preview(root).artifact.revision, model.state.revisions.C.artifact.revision);
  assert.equal(
    fs.readFileSync(path.join(root, ...MOCK_PATH.split('/'))).equals(renderMock('C')),
    true,
  );
  assert.equal(host.record.agentAfterSelectionCheck.agent?.name, 'Dude');
  assert.equal(host.record.events['subagent.deselected'] ?? 0, 0);
  assert.equal(new Set(
    host.record.delegationEvents.map((event) => event.agentId).filter(Boolean),
  ).size, 2);
  assert.deepEqual(
    model.state.ownerExecution.map(({ owner: executionOwner, tool, callId }) => ({
      owner: executionOwner,
      tool,
      callId,
    })),
    [
      { owner: 'Dude', tool: 'skill', callId: 'call_t012_dude_skill_b' },
      { owner: 'Dude', tool: 'task', callId: 'call_t012_delegate_b' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_read_skill_b' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_view_a_for_b' },
      { owner: 'Spec Lead', tool: 'edit', callId: 'call_t012_spec_edit_b' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_read_b' },
      { owner: 'Dude', tool: 'skill', callId: 'call_t012_dude_skill_c' },
      { owner: 'Dude', tool: 'task', callId: 'call_t012_delegate_c' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_read_skill_c' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_view_b_for_c' },
      { owner: 'Spec Lead', tool: 'edit', callId: 'call_t012_spec_edit_c' },
      { owner: 'Spec Lead', tool: 'view', callId: 'call_t012_spec_read_c' },
    ],
  );
  for (const round of model.state.rounds) {
    assert.deepEqual(
      Object.fromEntries(
        ['working.json', 'report.md', 'annotated.png', 'provenance.json']
          .map((name) => [name, sha256(fs.readFileSync(path.join(round.reviewDirectory, name)))]),
      ),
      round.filesBeforeSuccessor,
      `sealed revision ${round.version} was overwritten`,
    );
  }
  assert.equal(network.filter((entry) => entry.path === '/api/needs-you/respond').length, 3);
  assert.deepEqual(runtimeErrors, []);
  assert.equal(host.record.permissions.filter((entry) => entry.decision === 'reject').length, 0);
  const fixtureRecheck = {
    '062': revision(fs.readFileSync(path.join(root, ...WORKSPACE_062.tasksPath.split('/')))),
    '052': revision(fs.readFileSync(path.join(root, ...WORKSPACE_052.tasksPath.split('/')))),
    controlled: revision(fs.readFileSync(path.join(root, ...TASK_CONTROL.tasksPath.split('/')))),
    ideas: fs.readdirSync(path.join(root, '.dude', 'ideas')).sort(),
  };
  assert.deepEqual(fixtureRecheck, {
    '062': workspaceFixture.records['062'].fixtureTasksRevision,
    '052': workspaceFixture.records['052'].fixtureTasksRevision,
    controlled: workspaceFixture.records.controlled.fixtureTasksRevision,
    ideas: taskFixture.ideaFiles,
  }, 'installed task walkthrough changed no fixture task state or captured a draft');
  for (const expected of taskFixture.preserved) {
    assert.equal(sha256(fs.readFileSync(path.join(root, expected.path))), expected.sha256,
      `read-only walkthrough changed fixture ${expected.path}`);
  }
  taskEvidence.reviewReturn = roundA.workspaceReturn;
  taskEvidence.fixtureCanonicalTasksUnchanged = true;
  taskEvidence.completed = true;
  const finalScreenshot = await screenshot(browserState.page, 'installed-review-final');
  manifest.taskWalkthrough = {
    ...manifest.taskWalkthrough,
    browser: taskWalkthrough,
    returnAfterReview: taskReturn,
    fixtureRecheck,
    installedOwnerAcknowledgments: model.state.acknowledgments.map((entry) => ({
      version: entry.version,
      receiptId: entry.receiptId,
      currentRevision: entry.currentRevision,
    })),
    sourceMutation: false,
    fixtureTaskMutation: false,
    draftSubmission: false,
    installedBoundary: 'real SDK/CLI/extension host with owned Edge/CDP URL renderer',
  };
  manifest.reviewCase = {
    root,
    data,
    releaseFiles: release.files.length,
    parity,
    served,
    exactOwner: owner.owner,
    ownerDiagnostics: owner.diagnostics,
    initialMessageId,
    provider,
    host: host.record,
    model: model.state,
    rounds: [roundA, roundB],
    approval,
    taskWalkthrough: manifest.taskWalkthrough,
    finalScreenshot,
    network,
    runtimeErrors,
    actualImagesReachedOriginalWaiters: true,
    sameInstalledSession: host.record.sessionId,
    sameOwner: 'dude-spec-lead',
    currentRevision: model.state.revisions.C,
    realModelReasoning: false,
    armedManipulationEvidence: 'revision A drove the current gesture with real browser input on the served engine: armed-tool handle resize, border move, two unmoved border presses opening Comments, interior drawing, and a net-equal out-and-back that recorded no history; the round\'s own saved annotations were restored before sending',
    ownerRoute: 'selected installed Dude session projection published each waiter, delegated A→B and B→C to the installed Spec Lead through task, and acknowledged only after the owner view/edit/view result; the model fixture made no canonical write',
    desktopAppRendererObserved: false,
  };
  note('review-case-passed', {
    sessionId: host.record.sessionId,
    owner: IDEA_PATH,
    submissions: model.state.rounds.map((entry) => entry.submissionId),
    currentRevision: model.state.revisions.C.artifact.revision,
    taskWalkthrough: manifest.taskWalkthrough.browser.status,
    selectedTaskKey: manifest.taskWalkthrough.browser.selectedTaskKey,
  });
  await browserState.page.send('Page.navigate', { url: 'about:blank' });
  await closeInstalledHost(host);
  await closeServer(model.server);

  // Installed negative controls: exact permission, missing acknowledgment,
  // same-provider Canvas reopen, provider replacement, cancellation, outside
  // input, and uncertain capture without replay.
  const controlsRoot = path.join(RUN, 'installed-controls');
  const controlsRelease = installRelease(controlsRoot);
  const controlsParity = installedParity(controlsRoot);
  const controlsModel = createControlsModel();
  modelServers.push(controlsModel.server);
  const controlsModelUrl = await listen(controlsModel.server);

  const permissionHost = await createInstalledHost({
    root: controlsRoot,
    data: path.join(RUN, 'installed-controls-permission-runtime'),
    modelUrl: controlsModelUrl,
    caseName: 'controls-permission',
  });
  hosts.push(permissionHost);
  const permissionMessageId = await permissionHost.session.send({
    prompt: 'T012_PERMISSION_START',
  });
  const pendingPermission = await until(async () => {
    const current = await readNeedsYou(permissionHost.canvas.url);
    return current.requests.find((entry) => (
      entry.request.requestRef === 't012-permission' && entry.phase === 'pending'
    ));
  }, 'installed permission waiter');
  const wrongPermission = await postCanvas(
    permissionHost.canvas.url,
    '/api/needs-you/respond',
    {
      requestHandle: pendingPermission.requestHandle,
      revision: pendingPermission.request.revision,
      response: {
        class: 'permission',
        action: 'consent',
        operation: pendingPermission.request.fields.operation,
        targets: pendingPermission.request.fields.targets,
        confirmation: 'yes',
      },
    },
  );
  assert.equal(wrongPermission.status, 400);
  assert.equal(
    (await readNeedsYou(permissionHost.canvas.url)).requests[0].phase,
    'pending',
  );
  const exactPermission = await postCanvas(
    permissionHost.canvas.url,
    '/api/needs-you/respond',
    {
      requestHandle: pendingPermission.requestHandle,
      revision: pendingPermission.request.revision,
      response: {
        class: 'permission',
        action: 'consent',
        operation: pendingPermission.request.fields.operation,
        targets: pendingPermission.request.fields.targets,
        confirmation: pendingPermission.request.fields.confirmation,
      },
    },
  );
  assert.equal(exactPermission.status, 202);
  await until(() => controlsModel.state.permissionResult || controlsModel.state.modelError,
    'installed exact permission result');
  if (controlsModel.state.modelError) throw new Error(controlsModel.state.modelError);
  const missingAckBeforeReopen = await readNeedsYou(permissionHost.canvas.url);
  assert.equal(missingAckBeforeReopen.requests[0].phase, 'awaiting_acknowledgment');
  assert.equal(missingAckBeforeReopen.requests[0].receipt.acknowledgment, null);
  assert.equal(fs.existsSync(path.join(controlsRoot, 'fixture-marker')), false,
    'Canvas permission response executed no operation');
  const modelRequestsBeforeReopen = controlsModel.state.requests;
  await reopenInstalledCanvas(permissionHost);
  const missingAckAfterReopen = await readNeedsYou(permissionHost.canvas.url);
  assert.equal(missingAckAfterReopen.requests[0].phase, 'awaiting_acknowledgment');
  assert.equal(missingAckAfterReopen.requests[0].receipt.receiptId,
    missingAckBeforeReopen.requests[0].receipt.receiptId);
  assert.equal(controlsModel.state.requests, modelRequestsBeforeReopen,
    'Canvas reopen replayed no tool response');
  await closeInstalledHost(permissionHost);

  const cancellationHost = await createInstalledHost({
    root: controlsRoot,
    data: path.join(RUN, 'installed-controls-cancel-runtime'),
    modelUrl: controlsModelUrl,
    caseName: 'controls-cancel',
  });
  hosts.push(cancellationHost);
  const afterProviderReplacement = await readNeedsYou(cancellationHost.canvas.url);
  assert.equal(afterProviderReplacement.requests.length, 0,
    'new provider restored no old pending or awaiting request authority');
  const cancelMessageId = await cancellationHost.session.send({
    prompt: 'T012_CANCEL_START',
  });
  const pendingCancel = await until(async () => {
    const current = await readNeedsYou(cancellationHost.canvas.url);
    return current.requests.find((entry) => (
      entry.request.requestRef === 't012-cancel' && entry.phase === 'pending'
    ));
  }, 'installed cancellation waiter');
  await cancellationHost.session.abort();
  const cancelled = await until(async () => {
    const current = await readNeedsYou(cancellationHost.canvas.url);
    return current.requests.find((entry) => (
      entry.request.requestRef === 't012-cancel' && entry.phase === 'cancelled'
    ));
  }, 'installed cancellation result');
  const lateCancelResponse = await postCanvas(
    cancellationHost.canvas.url,
    '/api/needs-you/respond',
    {
      requestHandle: pendingCancel.requestHandle,
      revision: pendingCancel.request.revision,
      response: { class: 'fact', action: 'answer', text: 'late answer' },
    },
  );
  assert.equal(lateCancelResponse.status, 409);
  await closeInstalledHost(cancellationHost);

  const outsideHost = await createInstalledHost({
    root: controlsRoot,
    data: path.join(RUN, 'installed-controls-outside-runtime'),
    modelUrl: controlsModelUrl,
    caseName: 'controls-outside',
  });
  hosts.push(outsideHost);
  assert.equal((await readNeedsYou(outsideHost.canvas.url)).requests.length, 0);
  const outsideStartMessageId = await outsideHost.session.send({
    prompt: 'T012_OUTSIDE_START',
  });
  const pendingOutside = await until(async () => {
    const current = await readNeedsYou(outsideHost.canvas.url);
    return current.requests.find((entry) => (
      entry.request.requestRef === 't012-outside' && entry.phase === 'pending'
    ));
  }, 'installed outside-input waiter');
  const outsideMessageId = await outsideHost.session.send({
    prompt: 'T012_OUTSIDE_ANSWER literal foreground text.',
    mode: 'immediate',
  });
  await until(() => controlsModel.state.outsideResult || controlsModel.state.modelError,
    'installed outside-input typed nonanswer', 45_000);
  if (controlsModel.state.modelError) throw new Error(controlsModel.state.modelError);
  const outsideState = await readNeedsYou(outsideHost.canvas.url);
  const outsideRequest = outsideState.requests.find((entry) => (
    entry.request.requestRef === 't012-outside'
  ));
  assert.equal(outsideRequest.phase, 'outside_input_available');
  assert.equal(outsideRequest.receipt.recognizes, 'outside_answer');
  assert.equal(outsideRequest.receipt.acknowledgment, null);
  const lateOutsideResponse = await postCanvas(
    outsideHost.canvas.url,
    '/api/needs-you/respond',
    {
      requestHandle: pendingOutside.requestHandle,
      revision: pendingOutside.request.revision,
      response: { class: 'fact', action: 'answer', text: 'duplicate answer' },
    },
  );
  assert.equal(lateOutsideResponse.status, 409);
  await closeInstalledHost(outsideHost);
  await closeServer(controlsModel.server);

  const uncertainRoot = path.join(RUN, 'installed-uncertain-capture');
  const uncertainRelease = installRelease(uncertainRoot);
  const uncertainParity = installedParity(uncertainRoot);
  const uncertainModel = createUncertainCaptureModel();
  modelServers.push(uncertainModel.server);
  const uncertainModelUrl = await listen(uncertainModel.server);
  const uncertainHost = await createInstalledHost({
    root: uncertainRoot,
    data: path.join(RUN, 'installed-uncertain-capture-runtime'),
    modelUrl: uncertainModelUrl,
    caseName: 'uncertain-capture',
  });
  hosts.push(uncertainHost);
  const uncertainIdle = await uncertainHost.session.sendAndWait({
    prompt: 'T012 uncertain capture bootstrap.',
  }, 30_000);
  assert.equal(uncertainIdle?.data.content, 'T012_UNCERTAIN_CAPTURE_IDLE');
  const prepared = await postCanvas(
    uncertainHost.canvas.url,
    '/api/needs-you/capture-receipt',
    { requestHandle: null },
  );
  assert.equal(prepared.status, 202);
  const uncertainIntent = 'One installed capture send becomes uncertain and is never replayed.';
  const firstCaptureAttempt = await postCanvas(
    uncertainHost.canvas.url,
    '/api/needs-you/capture',
    {
      captureReceipt: prepared.body.captureReceipt,
      intent: uncertainIntent,
      continuation: 'capture_only',
    },
  );
  assert.equal(firstCaptureAttempt.status, 202);
  const uncertainBeforeReopen = await until(async () => {
    const current = await readNeedsYou(uncertainHost.canvas.url);
    return current.captures.find((entry) => (
      entry.captureReceipt === prepared.body.captureReceipt
      && !['issued', 'sending'].includes(entry.phase)
    ));
  }, 'installed failed-provider capture classification', 10_000);
  assert.ok(
    ['awaiting_acknowledgment', 'uncertain'].includes(uncertainBeforeReopen.phase),
    `unexpected failed-provider capture phase: ${uncertainBeforeReopen.phase}`,
  );
  const duplicateCapture = await postCanvas(
    uncertainHost.canvas.url,
    '/api/needs-you/capture',
    {
      captureReceipt: prepared.body.captureReceipt,
      intent: uncertainIntent,
      continuation: 'capture_only',
    },
  );
  assert.equal(duplicateCapture.status, 409);
  const capturePromptsBeforeReopen = uncertainModel.state.capturePromptRequests;
  const userMessagesBeforeReopen = uncertainHost.record.events['user.message'];
  assert.equal(userMessagesBeforeReopen, 2,
    'one bootstrap and one capture user message were emitted');
  await reopenInstalledCanvas(uncertainHost);
  const uncertainAfterReopen = await readNeedsYou(uncertainHost.canvas.url);
  assert.equal(uncertainAfterReopen.captures[0].phase, uncertainBeforeReopen.phase);
  await delay(500);
  assert.equal(uncertainHost.record.events['user.message'], userMessagesBeforeReopen,
    'Canvas reopen emitted no replayed capture message');
  assert.equal(fs.existsSync(path.join(uncertainRoot, '.dude/ideas')), false);
  await closeInstalledHost(uncertainHost);
  await closeServer(uncertainModel.server);

  manifest.installedControls = {
    controlsRoot,
    controlsReleaseFiles: controlsRelease.files.length,
    controlsParity,
    permission: {
      sessionId: permissionHost.record.sessionId,
      messageId: permissionMessageId,
      wrongResponse: wrongPermission,
      exactResponse: exactPermission,
      beforeReopen: missingAckBeforeReopen.requests[0],
      afterReopen: missingAckAfterReopen.requests[0],
      markerExecuted: false,
      host: permissionHost.record,
    },
    providerReplacement: {
      priorReceiptRestored: false,
      requests: afterProviderReplacement.requests.length,
    },
    cancellation: {
      sessionId: cancellationHost.record.sessionId,
      messageId: cancelMessageId,
      requestHandle: pendingCancel.requestHandle,
      phase: cancelled.phase,
      lateResponse: lateCancelResponse,
      host: cancellationHost.record,
    },
    outsideInput: {
      sessionId: outsideHost.record.sessionId,
      startMessageId: outsideStartMessageId,
      outsideMessageId,
      requestHandle: pendingOutside.requestHandle,
      phase: outsideRequest.phase,
      typedResult: controlsModel.state.outsideResult,
      lateResponse: lateOutsideResponse,
      host: outsideHost.record,
    },
    controlsModel: controlsModel.state,
    uncertainCapture: {
      root: uncertainRoot,
      releaseFiles: uncertainRelease.files.length,
      parity: uncertainParity,
      sessionId: uncertainHost.record.sessionId,
      receipt: prepared.body.captureReceipt,
      firstAttempt: firstCaptureAttempt,
      beforeReopen: uncertainBeforeReopen,
      afterReopen: uncertainAfterReopen.captures[0],
      duplicateAttempt: duplicateCapture,
      classification: uncertainBeforeReopen.phase,
      modelTransportAttemptsBeforeReopen: capturePromptsBeforeReopen,
      modelTransportAttempts: uncertainModel.state.capturePromptRequests,
      productUserMessages: userMessagesBeforeReopen,
      ideaCreated: false,
      host: uncertainHost.record,
    },
  };
  note('installed-controls-passed', {
    permissionSession: permissionHost.record.sessionId,
    cancellationSession: cancellationHost.record.sessionId,
    outsideSession: outsideHost.record.sessionId,
    uncertainSession: uncertainHost.record.sessionId,
  });

  for (const [relative, expected] of Object.entries(APPROVED_HASHES)) {
    assert.equal(sha256(sourceBytes(relative)), expected, `approved mock changed during run: ${relative}`);
  }
  for (const host of hosts) {
    assert.equal(host.record.cleanup.canvasClosed, true);
    assert.equal(host.record.cleanup.sessionDisconnected, true);
    assert.equal(host.record.cleanup.sessionDeleted, true);
    assert.equal(host.record.cleanup.extensionStillRunning, false);
    assert.equal(host.record.cleanup.hostStillRunning, false);
    assert.deepEqual(host.record.cleanup.stopErrors, []);
  }
  manifest.result = 'PASS';
  manifest.exitCode = 0;
} catch (error) {
  manifest.result = 'FAIL';
  manifest.exitCode = 1;
  manifest.error = safeError(error);
  note('acceptance-failed', { error: manifest.error });
  if (browserState) {
    try {
      manifest.failurePage = await bounded('failure page evidence', async () => ({
        screenshot: await screenshot(browserState.page, 'failure'),
        snapshot: await evaluate(browserState.page, `({
          text:document.body.innerText,
          active:document.activeElement?.outerHTML,
          reviewControls:[...document.querySelectorAll('[data-review-tools] button')].map(node => {
            const box=node.getBoundingClientRect(), hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
            return {label:node.getAttribute('aria-label'),disabled:node.disabled,
              box:box.toJSON(),hit:hit?.outerHTML};
          })
        })`),
      }), 8_000);
    } catch (evidenceError) {
      manifest.failurePageError = safeError(evidenceError);
    }
  }
  process.exitCode = 1;
} finally {
  for (const host of [...hosts].reverse()) {
    if (!host.record.cleanup.sessionDisconnected) {
      await closeInstalledHost(host);
    }
  }
  for (const server of modelServers) {
    if (server.listening) await closeServer(server);
  }
  if (browserState) {
    browserState.page.close();
    try {
      await stopBrowser(browserState.browser);
    } catch (error) {
      manifest.cleanup.uiBrowserStopError = safeError(error);
    }
    try {
      manifest.cleanup.uiBrowserStillRunning = Boolean(
        browserState.browser.pid && processRow(browserState.browser.pid),
      );
    } catch (error) {
      manifest.cleanup.uiBrowserProbeError = safeError(error);
    }
  }
  manifest.endedAt = new Date().toISOString();
  manifest.hosts = hosts.map((host) => host.record);
  try {
    manifest.cleanup.approvedMockRechecked = Object.entries(APPROVED_HASHES).every(
      ([relative, expected]) => sha256(sourceBytes(relative)) === expected,
    );
  } catch (error) {
    manifest.cleanup.approvedMockRecheckError = safeError(error);
  }
  try {
    manifest.cleanup.workspaceSourcesRechecked =
      JSON.stringify(workspaceSourceHashes()) === JSON.stringify(workspaceSourcePreimages);
  } catch (error) {
    manifest.cleanup.workspaceSourceRecheckError = safeError(error);
  }
  // PASS was set before this cleanup ran; an unconfirmed cleanup or post-run
  // check is an evidence gap, so it fails the run while keeping its diagnostics.
  const cleanupFailures = [];
  if (browserState) {
    if (manifest.cleanup.uiBrowserStopError) cleanupFailures.push('UI browser stop failed');
    if (manifest.cleanup.uiBrowserProbeError) cleanupFailures.push('UI browser process probe failed');
    else if (manifest.cleanup.uiBrowserStillRunning !== false) {
      cleanupFailures.push('UI browser still running after cleanup');
    }
  }
  if (manifest.cleanup.approvedMockRechecked !== true) {
    cleanupFailures.push('approved mocks changed or could not be rechecked after the run');
  }
  if (manifest.cleanup.workspaceSourcesRechecked !== true) {
    cleanupFailures.push('workspace task fixture sources changed or could not be rechecked after the run');
  }
  if (cleanupFailures.length) {
    manifest.cleanup.failures = cleanupFailures;
    if (manifest.result === 'PASS') {
      manifest.result = 'FAIL';
      manifest.exitCode = 1;
      manifest.error = `cleanup failed after acceptance: ${cleanupFailures.join('; ')}`;
    }
    note('cleanup-failed', { failures: cleanupFailures });
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(RUN, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    result: manifest.result,
    exitCode: manifest.exitCode,
    run: RUN,
    blankCases: manifest.blankCases.length,
    packRoundTrip: manifest.packCase?.browser?.provider?.packRequests?.[0]?.phase ?? null,
    importRoundTrips: manifest.importCase?.browser?.provider?.importRequests?.map((entry) => entry.phase) ?? [],
    sourceRoundTrip: manifest.sourceCase?.browser?.provider?.packRequests?.[0]?.phase ?? null,
    about: manifest.packCase?.about?.applied?.api?.body ?? null,
    developmentAbout: manifest.blankCases.find((entry) => entry.development)?.browser?.about?.api?.body ?? null,
    extensionHost: manifest.extensionHost,
    hostPackRead: manifest.packCase?.hostPackRead?.coverage?.catalog?.state ?? null,
    taskWalkthrough: manifest.taskWalkthrough?.browser?.status ?? null,
    reviewSubmissions: manifest.reviewCase?.model?.rounds?.map((entry) => entry.submissionId) ?? [],
    error: manifest.error ?? null,
  })}\n`);
}

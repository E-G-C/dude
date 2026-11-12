// @ts-check
/**
 * Maintainer qualification for Feature 089's two-Dude collaboration: an
 * effect-free preview and the operator-assisted native branch.
 *
 *   node scripts/dude-a2a/qualify-collaboration.mjs --plan <absolute-plan.json>
 *   node scripts/dude-a2a/qualify-collaboration.mjs --native --plan <absolute-v2-or-v3-plan.json>
 *
 * The plan is one closed JSON object naming everything a fresh human approval
 * of a native run would have to cover: the scope's expiry, the operator and
 * coordinator, a new disposable fixture folder, the installed Copilot CLI and
 * public SDK artifacts and where the SDK path applies, explicit models for A,
 * B, and B's worker, the credential and TLS file paths, B's loopback port and
 * the project ID, each main's progress action, and the capture slug. Version 2
 * adds the CLI's runtime payload, fixed progress-fixture definitions, and the
 * fixed Windows observation for the strict isolated-worker qualification.
 *
 * Version 3 is the separate normal-collaboration branch, chosen only by its
 * own version field: version 2's common facts and fixed progress fixtures, no
 * credential, runtime payload, or observation, and instead each role's
 * existing saved sign-in (`auth`: A, B, and B's worker each name a real base
 * directory and the expected account). Each runtime reuses the runtime-owned
 * stored sign-in in the SDK's normal mode; its best result is
 * `collaboration_qualified`, and strict isolation stays deferred, not run and
 * not passed. A strict plan never falls through to it. Only version 2 and
 * version 3 plans can run natively.
 *
 * Preview (`--plan`, any version) validates those facts without effects,
 * records the canonical path, size, and SHA-256 of the CLI (and payload) and of
 * the SDK's `index.js` and `extension.js`, and prints one bounded JSON report:
 * each check, the effects an authorized run would have, the proof sources, and
 * the native stages, every one of them blocked. For version 2 its scope digest
 * also binds this runner's and the observer's source, the core bundle rendered
 * from this repository's source, and the fixed fixture manifest. For version 3
 * it binds this runner's and the native branch's source, the rendered core,
 * the latch-only manifest template, each role's resolved base directory and
 * expected account, and the values of the selected environment names, which
 * are the only environment it reads. The preview never imports or constructs
 * the SDK; looks up no account; starts no runtime, session, model, listener,
 * connection, or observation; opens no TLS, token, or credential file and
 * reads no base directory's contents; asks for, generates, or records no
 * approval; and writes, kills, or deletes nothing. No option or plan field
 * grants authority or attests proof.
 *
 * Native (`--native --plan`, version 2 or 3) recomputes that scope and refuses
 * an invalid, incomplete, or expired one before any import or effect; then
 * ./native-collaboration.mjs asks the human, on an interactive terminal, for a
 * freshly typed consent literal bound to the scope digest, and runs the fixed
 * qualification described there. That branch is implemented. After earlier
 * native version-3 attempts failed, one of them when B's worker ended with
 * unexpected_native_effect after its prompt was admitted, one version-3 run
 * (41f9334f, 2026-11-12) passed as collaboration_qualified on one Windows
 * computer. That history grants nothing: each new plan needs its own fresh
 * consent, current account checks, and native evidence. The strict version-2
 * qualification has never run natively, and strict isolation stays deferred.
 * Success is not inferred from this preview, from tests, or from an earlier
 * run.
 *
 * Exit status: 0 only for a native run whose every check passed (version 2
 * `qualified`, version 3 `collaboration_qualified`); 1 when the
 * plan is invalid, incomplete, or expired; 2 for usage, an unreadable plan, or
 * an internal error; 3 when a preview's plan is complete, which never
 * qualifies anything; 4 when a native run refused or failed.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROFILE_STUB, PROJECT_STUB, listCoreOutputs, readCanonicalManifest, seedManifest } from '../build-release.mjs';
import { A2A_PROPOSAL_BYTES } from '../../src/extensions/dude/lib/a2a.mjs';
import { CONVERSATION_LIMITS } from '../../src/extensions/dude/lib/a2a-collaboration.mjs';
import { WORKER_BOUNDS, WORKER_TOOLS } from '../../src/extensions/dude/lib/a2a-peer-worker.mjs';
import { TRANSCRIPT_DIR, TRANSCRIPT_LIMITS } from '../../src/extensions/dude/lib/a2a-transcript.mjs';
import { WORKSPACE_PATHS } from '../../src/skills/dude-engine/lib/workspace-paths.mjs';
import { isMainModule } from '../../src/skills/dude-engine/lib/text.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** This runner, the native branch, and the observer; a native scope binds their bytes. */
const OWN_SOURCES = Object.freeze({ qualifier: 'qualify-collaboration.mjs', native: 'native-collaboration.mjs', observer: 'native-observer.ps1' });

/** Input, output, and value bounds. Larger input is refused, never truncated. */
export const QUALIFICATION_LIMITS = Object.freeze({
  planBytes: 16_384,
  reportBytes: 65_536,
  pathBytes: 1_024,
  labelBytes: 128,
  actionBytes: 256,
  unknownKeys: 16,
  cliBytes: 1_073_741_824,
});
export const USAGE = 'usage: node scripts/dude-a2a/qualify-collaboration.mjs [--native] --plan <absolute-plan.json>';
export const EXIT = Object.freeze({ qualified: 0, invalid: 1, usage: 2, blocked: 3, failed: 4 });

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const SCRIPT_EXTENSION = /\.(?:js|mjs|cjs|cmd|bat|ps1|sh)$/i;
const READ_CHUNK = 1_048_576;
/** Every record of A's complete answered journal, in order; qualification never appends to it. */
const ANSWERED_RECORDS = Object.freeze(['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received',
  'reply_validated', 'terminal', 'closed']);
/** The disposable fixture an authorized preparation would create below the plan's folder. */
const FIXTURE_FOLDERS = Object.freeze(['a/workspace', 'a/home', 'a/config', 'a/temp', 'b/workspace', 'b/home', 'b/config', 'b/temp',
  'b/worker', 'proof']);
/** The closed plan: `true` marks a value, an object a nested closed object. */
const PLAN_SHAPE = Object.freeze({
  version: true,
  expiresAt: true,
  operator: true,
  coordinator: true,
  fixtureParent: true,
  artifacts: { cli: true, sdk: true, sdkAppliedAt: true },
  models: { a: true, b: true, worker: true },
  credentials: { a: true, b: true, worker: true },
  tls: { a: { certFile: true, keyFile: true }, b: { certFile: true, keyFile: true } },
  transport: { port: true, projectId: true },
  progress: { a: true, b: true },
  capture: { slug: true },
});
const SECRET_FIELDS = Object.freeze(['credentials.a', 'credentials.b', 'credentials.worker', 'tls.a.certFile', 'tls.a.keyFile',
  'tls.b.certFile', 'tls.b.keyFile']);
/** The per-message bound both qualification profiles use, within what one journal can record for either role. */
const PROFILE_CONTENT_BYTES = 32_768;
/** The closed version-2 plan: version 1's facts, the runtime payload, fixed progress fixtures, and the fixed observation. */
const PLAN_SHAPE_V2 = Object.freeze({
  ...PLAN_SHAPE,
  artifacts: { cli: true, runtimePayload: true, sdk: true, sdkAppliedAt: true },
  progress: { a: { path: true, initial: true, final: true }, b: { path: true, initial: true, final: true } },
  observation: true,
});
/** The short roots a version-2 native run creates below the fixture parent; short paths keep both complete proposals under the cap. */
const FIXTURE_FOLDERS_V2 = Object.freeze(['a/w', 'a/h', 'a/c', 'a/t', 'b/w', 'b/h', 'b/c', 'b/t', 'k/w', 'k/h', 'k/c', 'k/t', 'q', 'p']);
/** The only observation a version-2 plan names: the fixed Windows ETW and process-handle observer. */
const OBSERVATION = 'windows-etw';
/** One role's existing saved sign-in in a version-3 plan: its real base directory and the account it must report. */
const SIGN_IN_ROLE = Object.freeze({ baseDirectory: true, expectedAccount: { host: true, login: true } });
/**
 * The closed version-3 plan, for normal collaboration only: version 2's common
 * facts and fixed progress fixtures, with `auth` in place of `credentials`,
 * and no runtime payload or observation. Any of those, or any other key,
 * refuses: neither branch can borrow the other's fields.
 */
const PLAN_SHAPE_V3 = Object.freeze({
  version: true,
  expiresAt: true,
  operator: true,
  coordinator: true,
  fixtureParent: true,
  artifacts: PLAN_SHAPE.artifacts,
  models: PLAN_SHAPE.models,
  auth: { kind: true, a: SIGN_IN_ROLE, b: SIGN_IN_ROLE, worker: SIGN_IN_ROLE },
  tls: PLAN_SHAPE.tls,
  transport: PLAN_SHAPE.transport,
  progress: PLAN_SHAPE_V2.progress,
  capture: PLAN_SHAPE.capture,
});
/** The roles a version-3 plan names a sign-in for. */
const SIGN_IN_ROLES = Object.freeze(['a', 'b', 'worker']);
/**
 * The environment names a version-3 run selects for each normal runtime and
 * B's worker, as the product's existing-sign-in worker selects them: the real
 * home and app data, so the runtime finds its own saved sign-in, and what
 * Windows needs to start it. Nothing else is read from the environment, so no
 * credential or provider variable can be. HOME, when absent, is USERPROFILE.
 */
export const SIGN_IN_ENVIRONMENT = Object.freeze(['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE',
  'HOMEPATH', 'APPDATA', 'LOCALAPPDATA']);
/** The selected locations that must be usable absolute paths. */
const SIGN_IN_LOCATIONS = Object.freeze(['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME']);
/** UTF-8 bound of an expected account's host and login, as the product bounds them. */
const ACCOUNT_BYTES = 256;
/** The short roots a version-3 native run creates below the fixture parent: workspaces and temp folders only; home and configuration are real. */
const FIXTURE_FOLDERS_V3 = Object.freeze(['a/w', 'a/t', 'b/w', 'b/t', 'q', 'p']);
/**
 * What a version-3 run never does. Strict isolated-worker qualification stays
 * deferred: none of these runs, and none is reported as passed.
 */
const STRICT_DEFERRED = Object.freeze({
  status: 'deferred',
  executed: false,
  passed: false,
  checks: Object.freeze(['ambient_feature_enforcement', 'canary_recognition', 'after_view_control', 'runtime_identity_observation',
    'worker_storage_classification', 'owned_process_tree_cessation']),
  detail: 'Strict isolated-worker qualification is deferred: not run and not passed. No observer, ambient-input exclusion, canary recognition, '
    + 'after-view control, runtime identity observation, worker storage classification, or owned process-tree cessation check runs, and normal '
    + 'mode certifies no confinement. A version-3 pass is collaboration_qualified only.',
});
/** Each main's own synthetic progress fixture: a literal file in its workspace changed from pending to complete. */
export const PROGRESS_FIXTURES = Object.freeze({
  a: Object.freeze({ path: 'progress-a.txt', initial: 'pending\n', final: 'complete\n' }),
  b: Object.freeze({ path: 'progress-b.txt', initial: 'pending\n', final: 'complete\n' }),
});
/** Slug length that still leaves room for the cancellation exchange's `-cancel` slug. */
const NATIVE_SLUG = /^[a-z0-9][a-z0-9-]{0,56}$/;
/**
 * The Git canary's commit: the empty tree, with the synthetic author and
 * committer `Dude A2A qualification canary <canary@dude.invalid> 0 +0000`
 * and the message `Synthetic canary commit.`
 */
const CANARY_COMMIT = '41bab6b07105d453ddfbd648a9ec1722fb89f8ed';

/**
 * The fixed synthetic canaries a qualification worker copies into its own
 * folders before its client starts. Each sits where the host would recognize
 * that kind if discovery were on; a native run checks recognition first with a
 * model-less control, and an unrecognized canary proves nothing. The MCP
 * canary names the fixed probe server, whose command does not exist. The Git
 * canary is a minimal valid repository. Git recognizes `.git` only with HEAD,
 * an object store, and refs, and a copy makes folders only through files, so
 * main names a synthetic root commit of the empty tree, and both are stored
 * as fixed zlib-deflated loose objects. Nothing here names a memory store;
 * none is guessed.
 */
export const CANARIES = Object.freeze([
  { kind: 'agents', location: 'work', path: '.github/agents/dude-canary.agent.md',
    content: '---\nname: dude-canary\ndescription: "Dude A2A qualification canary agent. Never select it."\n---\n\nSynthetic canary agent.\n' },
  { kind: 'agents', location: 'config', path: 'agents/dude-canary-user.agent.md',
    content: '---\nname: dude-canary-user\ndescription: "Dude A2A qualification canary user agent. Never select it."\n---\n\nSynthetic canary agent.\n' },
  { kind: 'instructions', location: 'work', path: '.github/copilot-instructions.md',
    content: '# Dude A2A qualification canary\n\nSynthetic repository instructions that must never load.\n' },
  { kind: 'instructions', location: 'work', path: 'AGENTS.md', content: '# Dude A2A qualification canary\n\nSynthetic agent instructions that must never load.\n' },
  { kind: 'on_demand_instructions', location: 'work', path: '.github/instructions/dude-canary.instructions.md',
    content: '---\napplyTo: "**"\n---\n\nSynthetic path instructions that must never load.\n' },
  { kind: 'hooks', location: 'work', path: '.github/hooks/dude-canary.json',
    content: '{"version":1,"hooks":{"preToolUse":[{"type":"command","bash":"exit 0","powershell":"exit 0","timeoutSec":5}]}}\n' },
  { kind: 'skills', location: 'work', path: '.github/skills/dude-canary/SKILL.md',
    content: '---\nname: dude-canary\ndescription: "Dude A2A qualification canary skill. Never invoke it."\n---\n\nSynthetic canary skill.\n' },
  { kind: 'skills', location: 'config', path: 'skills/dude-canary-user/SKILL.md',
    content: '---\nname: dude-canary-user\ndescription: "Dude A2A qualification canary user skill. Never invoke it."\n---\n\nSynthetic canary skill.\n' },
  { kind: 'mcp', location: 'config', path: 'mcp-config.json',
    content: '{"mcpServers":{"dude-canary-probe":{"type":"local","command":"dude-canary-probe-absent","args":[],"tools":["*"]}}}\n' },
  { kind: 'mcp', location: 'work', path: '.mcp.json',
    content: '{"mcpServers":{"dude-canary-probe":{"type":"local","command":"dude-canary-probe-absent","args":[],"tools":["*"]}}}\n' },
  { kind: 'git', location: 'work', path: '.git/HEAD', content: 'ref: refs/heads/main\n' },
  { kind: 'git', location: 'work', path: '.git/config', content: '[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n' },
  { kind: 'git', location: 'work', path: '.git/objects/4b/825dc642cb6eb9a060e54bf8d69288fbee4904', content: Buffer.from('eNorKUpNVTBgAAAKLAIB', 'base64') },
  { kind: 'git', location: 'work', path: `.git/objects/${CANARY_COMMIT.slice(0, 2)}/${CANARY_COMMIT.slice(2)}`,
    content: Buffer.from('eNqljUEKgzAQAHvOK/ZekCXEkEApFfqDvmCzWTGgkcpG8PeFSl/Q01yGGV6XpShYjBfdRMClYPvM3llOXlIk9Ci9S2PIPtoQxiTiIjpDTad1g2fLAoMd4N1oLmNh0rJWYKq0HXA7'
      + '+cgtS1fqTnPJd0C4IiIa/r5V/quY11F1Ei38889uZz52F0gc', 'base64') },
  { kind: 'git', location: 'work', path: '.git/refs/heads/main', content: `${CANARY_COMMIT}\n` },
  { kind: 'denied_read', location: 'work', path: 'dude-canary-denied-read.txt', content: 'Synthetic denied-read canary; it must never be read.\n' },
  { kind: 'denied_write', location: 'work', path: 'dude-canary-denied-write.txt', content: null },
].map((entry) => Object.freeze(entry)));

/**
 * The one model-driven after-view positive control. In the control runtime,
 * after its model-less discovery checks, the discovery session is
 * disconnected and exactly one fresh session is created with A's model and
 * A's control-runtime credential: it offers only the built-in `view`, turns
 * custom and on-demand instructions on, configuration discovery and every
 * other ambient feature off, adds no directory, and works in the control's
 * temp folder, outside the canary project. Its one fixed prompt asks for
 * exactly one view of the control workspace's synthetic denied-read canary,
 * which may surface that workspace's `AGENTS.md`. `workingDirectory` and
 * `project` are relative to the fixture parent; `target` and `source` are
 * existing canaries in `project`; `outputBytes` bounds the model-facing result
 * of its one view, which must hold the target's text exactly once. Nothing
 * here is a plan field, a proof, or an approval: a native run must observe
 * the activation itself.
 */
export const AFTER_VIEW_CONTROL = Object.freeze({
  workingDirectory: 'k/t',
  project: 'k/w',
  target: 'dude-canary-denied-read.txt',
  source: 'AGENTS.md',
  tool: 'view',
  outputBytes: 4_096,
  session: Object.freeze({
    availableTools: Object.freeze(['builtin:view']),
    skipCustomInstructions: false,
    enableOnDemandInstructionDiscovery: true,
    enableConfigDiscovery: false,
    additionalDirectories: Object.freeze([]),
    enableFileHooks: false,
    enableSkills: false,
    memory: Object.freeze({ enabled: false }),
    enableSessionStore: false,
    enableHostGitOperations: false,
    requestExtensions: false,
    requestCanvasRenderer: false,
    mcpServers: Object.freeze({}),
    enableSessionTelemetry: false,
  }),
});

/** The control's one fixed prompt, naming its absolute view target. @param {string} target */
export function afterViewPrompt(target) {
  return [
    'Feature 089 native qualification, after-view control.',
    `Use the ${AFTER_VIEW_CONTROL.tool} tool exactly once, with exactly the arguments ${JSON.stringify({ path: target })}.`,
    'Use no other tool and view no other path. Do not repeat, quote, or summarize what the file contains.',
    'Then reply with one short sentence saying that you viewed it.',
  ].join('\n');
}

/**
 * The hash-bound fixture manifest for one run and its canary sources below
 * the fixture root. Version 1 is the strict worker's closed schema with the
 * fixed canaries. Version 2 is the normal worker's latch-only manifest,
 * exactly `{version: 2, runId}`: it names no canary, and the root holds only
 * it and the two release latches.
 * @param {string} runId @param {1 | 2} [version]
 */
export function fixtureManifest(runId, version = 1) {
  if (version === 2) {
    const latch = Buffer.from(`${JSON.stringify({ version: 2, runId }, null, 2)}\n`, 'utf8');
    if (latch.length > WORKER_BOUNDS.manifestBytes) throw new Error('the latch manifest exceeds its bound');
    return { bytes: latch, sha256: sha256(latch), sources: /** @type {Array<{path: string, bytes: Buffer}>} */ ([]), canaries: 0, canaryBytes: 0 };
  }
  /** @type {Array<{path: string, bytes: Buffer}>} */
  const sources = [];
  const canaries = CANARIES.map((canary, index) => {
    if (canary.content === null) return { kind: canary.kind, location: canary.location, path: canary.path, source: null, sha256: null };
    const bytes = typeof canary.content === 'string' ? Buffer.from(canary.content, 'utf8') : Buffer.from(canary.content);
    const source = `c/${String(index + 1).padStart(2, '0')}.txt`;
    sources.push({ path: source, bytes });
    return { kind: canary.kind, location: canary.location, path: canary.path, source, sha256: sha256(bytes) };
  });
  const bytes = Buffer.from(`${JSON.stringify({ version: 1, runId, canaries }, null, 2)}\n`, 'utf8');
  const canaryBytes = sources.reduce((sum, source) => sum + source.bytes.length, 0);
  if (bytes.length > WORKER_BOUNDS.manifestBytes || canaryBytes > WORKER_BOUNDS.canaryBytes) throw new Error('the fixed fixture exceeds its bounds');
  return { bytes, sha256: sha256(bytes), sources, canaries: canaries.length, canaryBytes };
}

/**
 * The core bundle a native run renders into each workspace, planned from this
 * repository's source without writing: every core output plus the seeded
 * project stub, bundle manifest, and install profile, as sorted
 * [path, bytes, SHA-256] rows and their digest.
 * @param {string} repoRoot
 */
export function renderedCore(repoRoot) {
  /** @type {Array<[string, number, string]>} */
  const rows = listCoreOutputs(repoRoot).map((output) => {
    const bytes = output.abs ? fs.readFileSync(output.abs) : /** @type {Buffer} */ (output.bytes);
    return [output.relPath, bytes.length, sha256(bytes)];
  });
  for (const [relPath, text] of /** @type {Array<[string, string]>} */ ([
    ['.github/skills/project/SKILL.md', PROJECT_STUB],
    [WORKSPACE_PATHS.BUNDLE_MANIFEST, seedManifest(readCanonicalManifest(repoRoot).content)],
    [WORKSPACE_PATHS.PROFILE, PROFILE_STUB],
  ])) {
    const bytes = Buffer.from(text, 'utf8');
    rows.push([relPath, bytes.length, sha256(bytes)]);
  }
  rows.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row[1], 0), sha256: sha256(JSON.stringify(rows)), rows };
}

/**
 * The proof sources a qualifying native run needs, stated from current
 * source, never from the plan. The native branch implements how each would be
 * observed; none has been observed in a native strict run, so none is
 * available here.
 */
const PROOF = Object.freeze([
  {
    id: 'native_permission',
    status: 'missing',
    detail: 'No current human grant covers native effects, and a definition or Ship authorization grants none. A preview never asks '
      + 'for or receives one. Only `--native` with a complete version-2 plan (strict qualification) or version-3 plan (normal '
      + 'collaboration) asks, on an interactive terminal, for a freshly typed consent literal bound to the scope digest; no option, '
      + 'plan field, file, or receipt can supply it.',
    sources: ['scripts/dude-a2a/native-collaboration.mjs'],
  },
  {
    id: 'served_worker_observation',
    status: 'unverified',
    detail: 'B\'s actual served worker records its own public-SDK readiness (worker_preflight, worker_ready, worker_request_admitted, '
      + 'and in qualification worker_evidence_pending) in B\'s journal before its prompt, and the native branch checks those records '
      + 'against the operation, session, permit, loaders, extension process, and observer before writing each release. For a strict '
      + 'run, only fake SDKs have produced those records.',
    sources: ['src/extensions/dude/lib/a2a-peer-worker.mjs', 'src/extensions/dude/lib/a2a-collaboration.mjs', 'scripts/dude-a2a/native-collaboration.mjs'],
  },
  {
    id: 'actual_sdk_use',
    status: 'unverified',
    detail: 'The fixed loaders record the SDK file the extension and its worker imported; the native branch matches those records to '
      + 'this plan\'s hashed SDK files and the observed processes. A folder, hash, or this runner\'s own import shows nothing alone: '
      + 'createSession silently falls back to the bundled SDK from an invalid extensionSdkPath, and joinSession ignores the setting. '
      + 'No native strict run has produced those records.',
    sources: ['src/extensions/dude/lib/a2a-sdk-loader.mjs', 'copilot-sdk types.d.ts: extensionSdkPath'],
  },
  {
    id: 'ambient_feature_enforcement',
    status: 'unverified',
    detail: 'Settings, tool metadata, refusals, or a model saying it cannot do something do not prove that discovery, hooks, skills, '
      + 'memory, the session store, and host Git stayed off. The native branch combines the worker\'s public counts and probes with '
      + 'synthetic canaries whose forms a model-less control must find in parsed public discovery results at their exact locations '
      + '(a file access is not recognition), one model-driven after-view control whose genuine view must surface and load the fixed '
      + 'AGENTS.md canary by public notification, loaded-source digest, and observed reads, the session storage the served worker '
      + 'recorded, and continuous observed file and process activity classified by role and documented purpose. Only controlled checks '
      + 'have exercised these observations; no native strict run has, so none of them is established.',
    sources: ['scripts/dude-a2a/native-collaboration.mjs', 'scripts/dude-a2a/native-observer.ps1'],
  },
  {
    id: 'owned_process_tree_cessation',
    status: 'unverified',
    detail: 'The product reports runtime cessation as unconfirmed by design, and client.stop() returning no errors is not '
      + 'process-tree proof. The fixed Windows observer tracks every process this runner\'s run starts, by creation lineage, each '
      + 'pinned by handle, creation time, and image. Each worker\'s whole tree, and the after-view control runtime\'s before either '
      + 'main starts, must end within 10 seconds of its own cleanup start, '
      + 'and every owned process within 10 seconds of teardown, judged on the observer\'s drained final summary; lost or '
      + 'unattributed events, unpinned identities, or possible PID reuse leave it unconfirmed. It kills, injects into, and deletes '
      + 'nothing, and it has never run natively.',
    sources: ['scripts/dude-a2a/native-observer.ps1'],
  },
]);

/** Why a preview's native stages stay blocked even for a complete plan. */
const NATIVE_BRANCH = Object.freeze({
  v1: { id: 'native_branch_requires_v2', status: 'unavailable_for_plan_version', detail: 'A version-1 plan can only be previewed. The '
    + 'native branch runs a version-2 plan for strict qualification, which adds the runtime payload, the fixed progress fixtures, and '
    + 'the fixed Windows observation. It also runs a version-3 plan for normal collaboration, which names each role\'s existing saved '
    + 'sign-in in place of credential files and adds the same progress fixtures, with no runtime payload or observation.' },
  v2: { id: 'native_run_not_started', status: 'implemented_unverified', detail: 'The native branch is implemented: '
    + '`--native --plan <absolute-v2-plan.json>` asks for fresh terminal consent and then runs the fixed qualification. It has never '
    + 'run this strict qualification natively, so nothing about that run\'s native behavior is known, and no preview result stands in '
    + 'for it. It runs one model-driven after-view control and classifies the session storage each served worker recorded; whether a '
    + 'native host passes either is unknown. A null runtime payload is refused before consent.' },
});
/** The native stages, in order. A preview never runs them. */
const STAGES = Object.freeze([
  {
    id: 'prerequisite_qualification',
    needs: ['native_permission', 'served_worker_observation', 'actual_sdk_use', 'ambient_feature_enforcement'],
    detail: 'Establish the actual native SDK and runtime identity and the served worker\'s effective restrictions before any '
      + 'disclosure, and stop before the advice exchange when they cannot be shown. Fake AI is never a substitute.',
  },
  {
    id: 'exchange_and_main_progress',
    needs: ['native_permission', 'served_worker_observation', 'prerequisite_qualification'],
    detail: 'Two actual selected Dudes exchange real A2A messages, and while B\'s real worker is pending each main completes one '
      + 'unrelated authorized action with model request, native tool call, and success correlated. Harness counters and direct '
      + 'tools.execute calls are not model progress, and a new root prompt during the operation cancels it. A missed interval fails; '
      + 'nothing retries.',
  },
  {
    id: 'causal_capture',
    needs: ['native_permission', 'exchange_and_main_progress'],
    detail: 'A\'s actual advice.capture reaches the actual publisher: fresh local maximum 100, peer observation 101, number 102, '
      + 'the exact path and receipt with influence raised, and A\'s journal still exactly its eight records.',
  },
  {
    id: 'cancellation',
    needs: ['native_permission', 'served_worker_observation', 'prerequisite_qualification'],
    detail: 'At most one more exchange, cancelled through the actual conversation tool while real worker work is pending: answer '
      + 'acceptance ends at once, possible delivery stays explicit, cleanup is bounded, and no late success revives it.',
  },
  {
    id: 'teardown_and_retained_reread',
    needs: ['native_permission', 'owned_process_tree_cessation'],
    detail: 'Approved lifecycle teardown, external confirmation that every owned process ended, and a reread of both journals after '
      + 'the sessions end that matches the live view.',
  },
]);
/**
 * The proof sources a version-3 normal-collaboration run needs, stated from
 * current source, never from the plan. One recorded native run observed the
 * account, worker, and SDK sources below, as their details say; that history
 * establishes none of them for a new scope, whose own run must observe each
 * again.
 */
const PROOF_V3 = Object.freeze([
  {
    id: 'native_permission',
    status: 'missing',
    detail: 'No current human grant covers native effects, and a definition or Ship authorization grants none. A preview never asks '
      + 'for or receives one. Only `--native` with a complete version-3 plan asks, on an interactive terminal, for a freshly typed consent '
      + 'literal bound to the scope digest; no option, plan field, file, or receipt can supply it.',
    sources: ['scripts/dude-a2a/native-collaboration.mjs'],
  },
  {
    id: 'account_observation',
    status: 'unverified',
    detail: 'Each main\'s own client (getAuthStatus) and its actual new session (gitHubAuth.getStatus) must report the expected '
      + 'account before its first prompt and again before each later one, and B\'s served worker records the same pair for its own '
      + 'runtime and session in worker_preflight version 2. The recorded 2026-11-12 pass (run 41f9334f) observed these answers, host '
      + 'form included, for both mains and B\'s workers; that was a point-in-time observation, not an account lock, and this scope\'s '
      + 'run must observe its own.',
    sources: ['scripts/dude-a2a/native-collaboration.mjs', 'src/extensions/dude/lib/a2a-peer-worker.mjs', 'copilot-sdk types.d.ts: getAuthStatus'],
  },
  {
    id: 'served_worker_observation',
    status: 'unverified',
    detail: 'B\'s actual served worker records its version-2 readiness (worker_preflight with both accounts and its normal session '
      + 'storage, worker_ready, worker_request_admitted, and worker_evidence_pending) in B\'s journal before its prompt, and the native '
      + 'branch checks those records against the operation, session, permit, loaders, SDK files, extension process ID, model, and '
      + 'expected account before writing each release. An earlier attempt\'s worker ended with unexpected_native_effect before '
      + 'worker_evidence_pending; in the recorded 2026-11-12 pass, both served workers\' records matched those checks through '
      + 'worker_evidence_pending. Neither result is this scope\'s observation.',
    sources: ['src/extensions/dude/lib/a2a-peer-worker.mjs', 'src/extensions/dude/lib/a2a-collaboration.mjs', 'scripts/dude-a2a/native-collaboration.mjs'],
  },
  {
    id: 'actual_sdk_use',
    status: 'unverified',
    detail: 'The fixed loaders record the SDK file the extension and its worker imported; the native branch matches those records to '
      + 'this plan\'s hashed SDK files. A folder, hash, or this runner\'s own import shows nothing alone: createSession silently falls '
      + 'back to the bundled SDK from an invalid extensionSdkPath, and joinSession ignores the setting. In the recorded 2026-11-12 '
      + 'pass, B\'s records matched that run\'s plan SDK files; this scope\'s run must match its own.',
    sources: ['src/extensions/dude/lib/a2a-sdk-loader.mjs', 'copilot-sdk types.d.ts: extensionSdkPath'],
  },
]);
/** Why a version-3 preview's native stages stay blocked even for a complete plan. */
const NATIVE_BRANCH_V3 = Object.freeze({ id: 'native_run_not_started', status: 'implemented_unverified', detail: 'The normal-collaboration '
  + 'native branch is implemented: `--native --plan <absolute-v3-plan.json>` asks for fresh terminal consent and then runs the fixed '
  + 'collaboration qualification through each role\'s existing saved sign-in. One recorded native run, 41f9334f on 2026-11-12, '
  + 'passed as collaboration_qualified after earlier attempts failed. That history grants nothing and is not this scope\'s result: '
  + 'a run of this plan still needs fresh consent, current account checks, and its own native evidence, and no preview result '
  + 'stands in for a run. Its best result is collaboration_qualified; strict isolation stays deferred, not run and not passed.' });
/** The version-3 native stages, in order. A preview never runs them. */
const STAGES_V3 = Object.freeze([
  {
    id: 'account_readiness',
    needs: ['native_permission', 'account_observation', 'actual_sdk_use'],
    detail: 'Start both mains in normal mode and check each main\'s own runtime and actual new session against its expected account '
      + 'before any prompt; stop before any prompt when either cannot be shown. Fake AI is never a substitute.',
  },
  {
    id: 'exchange_and_main_progress',
    needs: ['native_permission', 'served_worker_observation', 'account_readiness'],
    detail: STAGES[1].detail,
  },
  {
    id: 'causal_capture',
    needs: ['native_permission', 'exchange_and_main_progress'],
    detail: STAGES[2].detail,
  },
  {
    id: 'cancellation',
    needs: ['native_permission', 'served_worker_observation', 'account_readiness'],
    detail: STAGES[3].detail,
  },
  {
    id: 'bounded_stop_and_retained_reread',
    needs: ['native_permission'],
    detail: 'Approved SDK lifecycle stops within one shared 10-second budget, each reporting no errors by its absolute stop deadline '
      + '(5 seconds into that budget), then a reread of both journals after the sessions end that matches the live view. Process-tree '
      + 'cessation stays unconfirmed: no observer runs, and an SDK stop or parent exit proves none. All storage is kept, the real home '
      + 'and configuration included.',
  },
]);

/**
 * @typedef {'ok' | 'not_inspected' | 'missing' | 'invalid' | 'expired' | 'refused'} CheckStatus
 * @typedef {{id: string, status: CheckStatus, detail: string}} Check
 * @typedef {{path: string, bytes: number, sha256: string}} FileIdentity
 * @typedef {{present: boolean, value: unknown}} Field
 * @typedef {{now?: number, repoRoot?: string, platform?: NodeJS.Platform, nodeVersion?: string, execPath?: string,
 *   environment?: Record<string, string | undefined>}} PreviewOptions
 */

/** A refusal before any report: usage, an unreadable plan, or an oversized report. */
export class QualificationError extends Error {
  /** @param {string} code @param {string} detail */
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Buffer | string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Sorted-key JSON, so an equal scope always has the same digest. @param {unknown} value @returns {string} */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Non-empty single-line text within `maxBytes`, or null. @param {unknown} value @param {number} maxBytes */
function text(value, maxBytes) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && !CONTROL.test(value)
    && Buffer.byteLength(value, 'utf8') <= maxBytes ? value : null;
}

/** A normalized absolute path, or null. @param {unknown} value */
function absolutePath(value) {
  const candidate = text(value, QUALIFICATION_LIMITS.pathBytes);
  return candidate && path.isAbsolute(candidate) && path.resolve(candidate) === candidate ? candidate : null;
}

/** @param {string} base @param {string} candidate */
function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** The real path of the nearest existing ancestor, with the rest of `target` appended. @param {string} target */
function realLocation(target) {
  /** @type {string[]} */
  const rest = [];
  for (let current = target; ;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** The origin of a bare HTTPS origin URL, or null for anything else, as the product reads an expected host. @param {string} value */
function httpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
}

/**
 * The selected sign-in environment as `source` holds it now: each
 * `SIGN_IN_ENVIRONMENT` name it has, and HOME from USERPROFILE when absent,
 * as the product composes an existing-sign-in worker's. Only those names are
 * read. Null when a value is not text, or a required location is not a
 * usable absolute path of at most 1,024 UTF-8 bytes.
 * @param {Record<string, string | undefined>} source @returns {Record<string, string> | null}
 */
function signInEnvironment(source) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const name of SIGN_IN_ENVIRONMENT) {
    const value = source[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.includes('\0')) return null;
    values[name] = value;
  }
  if (values.HOME === undefined && values.USERPROFILE !== undefined) values.HOME = values.USERPROFILE;
  const usable = SIGN_IN_LOCATIONS.every((name) => {
    const value = values[name];
    return typeof value === 'string' && value.length > 0 && !CONTROL.test(value) && path.isAbsolute(value)
      && Buffer.byteLength(value, 'utf8') <= QUALIFICATION_LIMITS.pathBytes;
  });
  return usable ? values : null;
}

/** The nearest folder at or above `location` that holds a `.git` entry, or null. @param {string} location */
function gitWorktreeOf(location) {
  for (let directory = location; ; directory = path.dirname(directory)) {
    try {
      fs.lstatSync(path.join(directory, '.git'));
      return directory;
    } catch {
      // No Git entry here.
    }
    if (path.dirname(directory) === directory) return null;
  }
}

/** Size and SHA-256 of one regular file, read in bounded chunks. @param {string} file @returns {FileIdentity} */
function fileIdentity(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  let bytes = 0;
  try {
    const buffer = Buffer.alloc(READ_CHUNK);
    for (let read = fs.readSync(fd, buffer, 0, buffer.length, null); read > 0; read = fs.readSync(fd, buffer, 0, buffer.length, null)) {
      hash.update(buffer.subarray(0, read));
      bytes += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { path: file, bytes, sha256: hash.digest('hex') };
}

/** A key path as the report may show it: bounded, without control characters. @param {string} key */
function shownKey(key) {
  const safe = key.replace(/[\u0000-\u001f\u007f]/gu, '?');
  return safe.length > 96 ? `${safe.slice(0, 93)}...` : safe;
}

/**
 * Every key the closed plan does not define.
 * @param {unknown} value @param {Record<string, unknown>} shape @param {string} prefix @returns {string[]}
 */
function unknownKeys(value, shape, prefix) {
  if (!isRecord(value)) return [];
  /** @type {string[]} */
  const found = [];
  for (const key of Object.keys(value)) {
    const where = prefix ? `${prefix}.${key}` : key;
    const node = Object.hasOwn(shape, key) ? shape[key] : undefined;
    if (node === undefined) found.push(where);
    else if (node !== true) found.push(...unknownKeys(value[key], /** @type {Record<string, unknown>} */ (node), where));
  }
  return found;
}

/**
 * The plan's values by dotted key. A nested object that is present but not
 * an object is reported once, and its values are not visited.
 * @param {unknown} value @param {Record<string, unknown>} shape @param {string} prefix
 * @param {Map<string, Field>} fields @param {Check[]} checks
 */
function collectFields(value, shape, prefix, fields, checks) {
  for (const [key, node] of Object.entries(shape)) {
    const where = prefix ? `${prefix}.${key}` : key;
    const present = isRecord(value) && Object.hasOwn(value, key);
    const field = present ? /** @type {Record<string, unknown>} */ (value)[key] : undefined;
    if (node === true) {
      fields.set(where, { present, value: field });
    } else if (present && !isRecord(field)) {
      checks.push({ id: where, status: 'invalid', detail: `${where} must be an object` });
    } else {
      collectFields(field, /** @type {Record<string, unknown>} */ (node), where, fields, checks);
    }
  }
}

/**
 * Validate one plan without effects and build the report.
 * @param {unknown} plan The parsed plan.
 * @param {PreviewOptions} [options] Tests replace the clock, repository root, platform, Node version, and Node executable.
 * @returns {{report: Record<string, any>, exitCode: number, scope?: Record<string, any> | null}}
 */
export function previewQualification(plan, options = {}) {
  const now = options.now ?? Date.now();
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const repoRoot = realLocation(path.resolve(options.repoRoot ?? REPOSITORY_ROOT));
  const nodeExecutable = realLocation(path.resolve(options.execPath ?? process.execPath));
  // Versions 2 and 3 are each chosen only by their own version field; anything else is checked as version 1. A strict
  // plan never becomes a normal one, and no failure of one branch falls through to the other.
  const planVersion = isRecord(plan) && (plan.version === 2 || plan.version === 3) ? plan.version : 1;
  const shape = planVersion === 3 ? PLAN_SHAPE_V3 : planVersion === 2 ? PLAN_SHAPE_V2 : PLAN_SHAPE;
  const native = planVersion !== 1;
  /** @type {Check[]} */
  const checks = [];
  /** @param {string} id @param {CheckStatus} status @param {string} detail */
  const add = (id, status, detail) => { checks.push({ id, status, detail }); };
  /** @type {Record<string, any>} */
  const values = {};
  /** @type {{cli: FileIdentity | null, runtimePayload?: FileIdentity | null, sdk: {path: string, index: FileIdentity, extension: FileIdentity} | null}} */
  const artifacts = planVersion === 2 ? { cli: null, runtimePayload: null, sdk: null } : { cli: null, sdk: null };

  const major = Number.parseInt(String(nodeVersion).split('.')[0], 10);
  add('host.node', major >= 20 ? 'ok' : 'invalid', `Node ${nodeVersion} on ${platform}; this runner needs Node 20 or later`);

  /** @type {Map<string, Field>} */
  const fields = new Map();
  if (!isRecord(plan)) {
    add('plan', 'invalid', 'the plan must be one JSON object');
  } else {
    const unknown = unknownKeys(plan, shape, '');
    for (const key of unknown.slice(0, QUALIFICATION_LIMITS.unknownKeys)) {
      add('plan.unknown', 'invalid', `unknown key ${shownKey(key)}: the plan is closed, so it cannot carry approvals, proof, `
        + 'stage results, model providers, fakes, or adapters');
    }
    if (unknown.length > QUALIFICATION_LIMITS.unknownKeys) {
      add('plan.unknown', 'invalid', `${unknown.length - QUALIFICATION_LIMITS.unknownKeys} more unknown keys are not listed`);
    }
    if (planVersion === 3 && (Object.hasOwn(plan, 'credentials') || Object.hasOwn(plan, 'observation')
      || (isRecord(plan.artifacts) && Object.hasOwn(plan.artifacts, 'runtimePayload')))) {
      add('branch', 'refused', 'a version-3 plan reuses each role\'s existing saved sign-in; credential files, a runtime payload, and the '
        + 'observation belong to the strict version-2 branch, and the two branches never mix');
    }
    collectFields(plan, shape, '', fields, checks);
  }

  /**
   * Run `check` for one present field; report a missing one. Fields under an
   * object reported invalid are absent from `fields` and stay silent here.
   * @param {string} id @param {(value: unknown) => void} check
   */
  const field = (id, check) => {
    const entry = fields.get(id);
    if (!entry) return;
    if (!entry.present) add(id, 'missing', `${id} is required; nothing is defaulted`);
    else check(entry.value);
  };

  field('version', (value) => {
    if (value === 1 || value === 2) add('version', 'ok', `plan version ${value}${value === 1 ? '; preview only' : ''}`);
    else if (value === 3) {
      add('version', 'ok', 'plan version 3; normal collaboration through each role\'s existing saved sign-in, with strict isolation deferred');
    } else add('version', 'invalid', 'version must be 1, 2, or 3');
  });
  field('expiresAt', (value) => {
    const at = typeof value === 'string' && ISO_UTC.test(value) ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(at)) add('expiresAt', 'invalid', 'expiresAt must be a UTC time written as YYYY-MM-DDTHH:MM:SSZ');
    else if (at <= now) add('expiresAt', 'expired', 'the requested scope has expired; an expired or earlier grant authorizes nothing');
    else {
      values.expiresAt = value;
      add('expiresAt', 'ok', `the requested scope stays valid for ${Math.floor((at - now) / 60_000)} more minutes`);
    }
  });
  for (const id of ['operator', 'coordinator']) {
    field(id, (value) => {
      const name = text(value, QUALIFICATION_LIMITS.labelBytes);
      if (!name) add(id, 'invalid', `${id} must be single-line text of at most ${QUALIFICATION_LIMITS.labelBytes} bytes`);
      else {
        values[id] = name;
        add(id, 'ok', `${id} ${name}`);
      }
    });
  }

  field('fixtureParent', (value) => {
    const parent = absolutePath(value);
    if (!parent) return void add('fixtureParent', 'invalid', 'fixtureParent must be a normalized absolute path');
    const location = realLocation(parent);
    if (isWithin(repoRoot, location) || isWithin(location, repoRoot)) {
      return void add('fixtureParent', 'refused', 'the fixture must be outside this repository and must not contain it: project '
        + 'discovery would reach its real configuration and state');
    }
    const worktree = gitWorktreeOf(location);
    if (worktree) {
      return void add('fixtureParent', 'refused', 'the fixture is inside a Git work tree: host Git context and discovery would reach '
        + 'it, so worker restrictions could not be shown effective');
    }
    /** @type {fs.Stats | null} */
    let stat = null;
    try {
      stat = fs.lstatSync(parent);
    } catch {
      stat = null;
    }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      return void add('fixtureParent', 'invalid', 'an existing fixtureParent must be a real folder, not a link or file');
    }
    if (stat && fs.readdirSync(parent).length > 0) {
      return void add('fixtureParent', 'invalid', 'fixtureParent must be new or empty: a disposable fixture reuses no earlier state');
    }
    values.fixtureParent = parent;
    add('fixtureParent', 'ok', `${parent} is ${stat ? 'an empty folder' : 'absent'}; this preview creates nothing there`);
  });

  field('artifacts.cli', (value) => {
    const cli = absolutePath(value);
    if (!cli) return void add('artifacts.cli', 'invalid', 'artifacts.cli must be a normalized absolute path');
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.statSync(cli);
    } catch {
      return void add('artifacts.cli', 'invalid', 'the CLI artifact does not exist or cannot be inspected');
    }
    if (!stat.isFile()) return void add('artifacts.cli', 'invalid', 'the CLI artifact must be a regular file');
    if (SCRIPT_EXTENSION.test(cli)) {
      return void add('artifacts.cli', 'refused', 'a script or shim cannot stand in for the installed Copilot CLI executable');
    }
    if (platform === 'win32' && path.extname(cli).toLowerCase() !== '.exe') {
      return void add('artifacts.cli', 'invalid', 'on Windows the CLI artifact must be the .exe launcher');
    }
    if (platform !== 'win32' && (stat.mode & 0o111) === 0) return void add('artifacts.cli', 'invalid', 'the CLI artifact must be executable');
    const real = fs.realpathSync.native(cli);
    if (real === nodeExecutable) {
      return void add('artifacts.cli', 'refused', 'this is the Node executable: a Node-hosted fake or script runtime cannot stand in '
        + 'for the Copilot CLI');
    }
    if (isWithin(repoRoot, real)) {
      return void add('artifacts.cli', 'refused', 'the CLI artifact is inside this repository, which ships no Copilot CLI: a fixture '
        + 'or fake cannot stand in for it');
    }
    if (stat.size > QUALIFICATION_LIMITS.cliBytes) {
      return void add('artifacts.cli', 'invalid', `the CLI artifact exceeds ${QUALIFICATION_LIMITS.cliBytes} bytes`);
    }
    artifacts.cli = fileIdentity(real);
    add('artifacts.cli', 'ok', `${real}; ${artifacts.cli.bytes} bytes; sha256 ${artifacts.cli.sha256}; identity only, never started here`);
  });

  field('artifacts.runtimePayload', (value) => {
    if (value === null) {
      values.runtimePayload = null;
      return void add('artifacts.runtimePayload', 'ok', 'null: the observed CLI launcher itself must be the complete runtime');
    }
    const payload = absolutePath(value);
    if (!payload) return void add('artifacts.runtimePayload', 'invalid', 'artifacts.runtimePayload must be null or a normalized absolute path');
    /** @type {fs.Stats | null} */
    let stat = null;
    try {
      stat = fs.lstatSync(payload);
    } catch {
      stat = null;
    }
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
      return void add('artifacts.runtimePayload', 'invalid', 'the runtime payload must be an existing regular file, not a link or folder');
    }
    if (isWithin(repoRoot, fs.realpathSync.native(payload))) {
      return void add('artifacts.runtimePayload', 'refused', 'the runtime payload is inside this repository: a fixture or fake cannot stand in for it');
    }
    if (stat.size > QUALIFICATION_LIMITS.cliBytes) {
      return void add('artifacts.runtimePayload', 'invalid', `the runtime payload exceeds ${QUALIFICATION_LIMITS.cliBytes} bytes`);
    }
    artifacts.runtimePayload = fileIdentity(fs.realpathSync.native(payload));
    values.runtimePayload = artifacts.runtimePayload.path;
    add('artifacts.runtimePayload', 'ok', `${artifacts.runtimePayload.path}; ${artifacts.runtimePayload.bytes} bytes; sha256 `
      + `${artifacts.runtimePayload.sha256}; identity only, never loaded here`);
  });

  field('artifacts.sdk', (value) => {
    const sdk = absolutePath(value);
    if (!sdk) return void add('artifacts.sdk', 'invalid', 'artifacts.sdk must be a normalized absolute path');
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.statSync(sdk);
    } catch {
      return void add('artifacts.sdk', 'invalid', 'the SDK folder does not exist: the runtime would silently use its bundled SDK instead');
    }
    if (!stat.isDirectory()) {
      return void add('artifacts.sdk', 'invalid', 'the SDK path is not a folder: the runtime would silently use its bundled SDK instead');
    }
    const real = fs.realpathSync.native(sdk);
    if (isWithin(repoRoot, real)) {
      return void add('artifacts.sdk', 'refused', 'the SDK folder is inside this repository, which ships no public Copilot SDK: a '
        + 'fixture or fake cannot stand in for it');
    }
    /** @type {Record<string, FileIdentity>} */
    const files = {};
    for (const name of ['index.js', 'extension.js']) {
      /** @type {fs.Stats | null} */
      let entry = null;
      try {
        entry = fs.lstatSync(path.join(real, name));
      } catch {
        entry = null;
      }
      if (!entry) {
        return void add('artifacts.sdk', 'invalid', `the SDK folder has no ${name}: the runtime would silently use its bundled SDK instead`);
      }
      if (!entry.isFile()) {
        return void add('artifacts.sdk', 'invalid', `the SDK's ${name} must be a regular file, not a link or folder, so its hash names `
          + 'the bytes a runtime would load');
      }
      files[name] = fileIdentity(path.join(real, name));
    }
    artifacts.sdk = { path: real, index: files['index.js'], extension: files['extension.js'] };
    add('artifacts.sdk', 'ok', `${real}; index.js sha256 ${files['index.js'].sha256}; extension.js sha256 ${files['extension.js'].sha256}; `
      + 'hashed, never imported here');
  });

  field('artifacts.sdkAppliedAt', (value) => {
    if (value === 'createSession') {
      values.sdkAppliedAt = value;
      add('artifacts.sdkAppliedAt', 'ok', 'the SDK path applies only as createSession extensionSdkPath for the two fresh main sessions');
    } else if (value === 'joinSession') {
      add('artifacts.sdkAppliedAt', 'refused', 'joinSession cannot override the SDK: the extension process already runs the SDK the '
        + 'host chose, so the setting would be silently ignored');
    } else {
      add('artifacts.sdkAppliedAt', 'invalid', 'artifacts.sdkAppliedAt must be "createSession"');
    }
  });

  for (const id of ['models.a', 'models.b', 'models.worker']) {
    field(id, (value) => {
      const model = text(value, QUALIFICATION_LIMITS.labelBytes);
      if (!model) add(id, 'invalid', `${id} must be an explicit model ID of at most ${QUALIFICATION_LIMITS.labelBytes} bytes`);
      else {
        values[id] = model;
        add(id, 'ok', `${model}; explicit, never defaulted`);
      }
    });
  }

  const fixtureParent = /** @type {string | undefined} */ (values.fixtureParent);
  const workspaceName = native ? 'w' : 'workspace';
  const workspaces = fixtureParent ? ['a', 'b'].map((side) => realLocation(path.join(fixtureParent, side, workspaceName))) : [];
  /** @type {string[]} */
  const secrets = [];
  // A version-3 plan names no credential file: each runtime finds its own saved sign-in, which nothing here reads.
  for (const id of planVersion === 3 ? SECRET_FIELDS.filter((name) => name.startsWith('tls.')) : SECRET_FIELDS) {
    field(id, (value) => {
      const file = absolutePath(value);
      if (!file) return void add(id, 'invalid', `${id} must be a normalized absolute path`);
      const location = realLocation(file);
      if (isWithin(repoRoot, location)) {
        return void add(id, 'refused', 'a secret file inside this repository could be committed or read as project content');
      }
      if (workspaces.some((workspace) => isWithin(workspace, location))) {
        return void add(id, 'refused', 'a secret file inside a fixture workspace is readable through that session\'s ordinary tools');
      }
      values[id] = file;
      secrets.push(platform === 'win32' ? location.toLowerCase() : location);
      add(id, 'not_inspected', `${file}; named only: this preview never opens, reads, or hashes a secret file`);
    });
  }
  if (new Set(secrets).size !== secrets.length) {
    add('secrets.distinct', 'invalid', 'each credential and TLS file must be distinct: one shared file would cross owners or roles');
  }

  if (planVersion === 3) {
    field('auth.kind', (value) => {
      if (value === 'existing-sign-in') add('auth.kind', 'ok', 'existing-sign-in: each runtime reuses its own saved sign-in; no login, token, or fallback');
      else add('auth.kind', 'invalid', 'auth.kind must be exactly "existing-sign-in"');
    });
    const fixtureLocation = fixtureParent ? realLocation(fixtureParent) : null;
    /** @type {Record<string, any>} */
    const signIn = {};
    for (const role of SIGN_IN_ROLES) {
      const prefix = `auth.${role}`;
      field(`${prefix}.baseDirectory`, (value) => {
        const id = `${prefix}.baseDirectory`;
        const directory = absolutePath(value);
        if (!directory) return void add(id, 'invalid', `${id} must be a normalized absolute path of at most ${QUALIFICATION_LIMITS.pathBytes} bytes`);
        // Metadata only: whether it exists as a real directory and where it resolves. Its contents are never read.
        /** @type {fs.Stats | null} */
        let stat = null;
        try {
          stat = fs.lstatSync(directory);
        } catch {
          stat = null;
        }
        if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
          return void add(id, 'invalid', `${id} must be an existing directory, not a link or file`);
        }
        let real = '';
        try {
          real = fs.realpathSync.native(directory);
        } catch {
          return void add(id, 'invalid', `${id} cannot be resolved`);
        }
        if (Buffer.byteLength(real, 'utf8') > QUALIFICATION_LIMITS.pathBytes) {
          return void add(id, 'invalid', `${id} must resolve to at most ${QUALIFICATION_LIMITS.pathBytes} bytes`);
        }
        if (isWithin(repoRoot, real) || isWithin(real, repoRoot)) {
          return void add(id, 'refused', 'a base directory inside this repository, or holding it, would put normal runtime storage and logs there');
        }
        if (fixtureLocation && (isWithin(fixtureLocation, real) || isWithin(real, fixtureLocation))) {
          return void add(id, 'refused', 'a base directory must be disjoint from the fixture, its workspaces, and B\'s evidence root');
        }
        (signIn[role] ??= {}).baseDirectory = real;
        add(id, 'ok', `${real}; an existing directory, inspected by metadata only: its contents, sign-in, and configuration are never read here`);
      });
      field(`${prefix}.expectedAccount.host`, (value) => {
        const id = `${prefix}.expectedAccount.host`;
        const host = text(value, ACCOUNT_BYTES);
        if (!host || httpsOrigin(host) !== host) {
          return void add(id, 'invalid', `${id} must be a canonical HTTPS origin such as https://github.com, at most ${ACCOUNT_BYTES} bytes`);
        }
        (signIn[role] ??= {}).host = host;
        add(id, 'ok', `${host}; compared exactly with each observed account`);
      });
      field(`${prefix}.expectedAccount.login`, (value) => {
        const id = `${prefix}.expectedAccount.login`;
        const login = text(value, ACCOUNT_BYTES);
        if (!login) return void add(id, 'invalid', `${id} must be single-line text of at most ${ACCOUNT_BYTES} bytes`);
        (signIn[role] ??= {}).login = login;
        add(id, 'ok', `${login}; compared without letter case with each observed account; an account is not a peer identity or entitlement`);
      });
    }
    if (SIGN_IN_ROLES.every((role) => signIn[role]?.baseDirectory && signIn[role]?.host && signIn[role]?.login)) {
      values.auth = Object.fromEntries(SIGN_IN_ROLES.map((role) => [role, {
        baseDirectory: signIn[role].baseDirectory, expectedAccount: { host: signIn[role].host, login: signIn[role].login },
      }]));
    }
    if (platform === 'win32') add('host.platform', 'ok', 'win32: the existing-sign-in branch runs only on Windows');
    else add('host.platform', 'refused', `${platform}: the existing-sign-in branch runs only on Windows, as the product's existing-sign-in worker does`);
    // Only the selected names are read, and only for this version: their values are bound into the scope, never shown whole.
    const selected = signInEnvironment(options.environment ?? process.env);
    if (!selected) {
      add('environment', 'invalid', `this process must hold USERPROFILE, APPDATA, and LOCALAPPDATA, and any HOME, as absolute paths of at most `
        + `${QUALIFICATION_LIMITS.pathBytes} bytes; only ${SIGN_IN_ENVIRONMENT.join(', ')} are read`);
    } else {
      values.environment = { names: [...SIGN_IN_ENVIRONMENT], values: selected };
      add('environment', 'ok', `${Object.keys(selected).length} of the selected names ${SIGN_IN_ENVIRONMENT.join(', ')} are set; their values are `
        + 'bound by digest; no other variable was read, so no credential or provider setting is inherited');
    }
  }

  field('transport.port', (value) => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1024 && value <= 65_535) {
      values.port = value;
      add('transport.port', 'ok', `127.0.0.1:${value}; not probed, because probing would open a listener`);
    } else {
      add('transport.port', 'invalid', 'transport.port must be an integer from 1024 to 65535');
    }
  });
  field('transport.projectId', (value) => {
    if (typeof value === 'string' && ID.test(value)) {
      values.projectId = value;
      add('transport.projectId', 'ok', `${value}; agreed correlation only, not authentication`);
    } else {
      add('transport.projectId', 'invalid', 'transport.projectId must be an ID of letters, digits, ., _, or -, at most 64 characters');
    }
  });
  for (const side of /** @type {const} */ (['a', 'b'])) {
    const id = `progress.${side}`;
    if (native) {
      const expected = PROGRESS_FIXTURES[side];
      for (const key of /** @type {const} */ (['path', 'initial', 'final'])) {
        field(`${id}.${key}`, (value) => {
          if (value === expected[key]) add(`${id}.${key}`, 'ok', JSON.stringify(value));
          else add(`${id}.${key}`, 'invalid', `${id}.${key} must be exactly ${JSON.stringify(expected[key])}: the progress fixture is fixed`);
        });
      }
      continue;
    }
    field(id, (value) => {
      const action = text(value, QUALIFICATION_LIMITS.actionBytes);
      if (!action) add(id, 'invalid', `${id} must name one unrelated action in single-line text of at most ${QUALIFICATION_LIMITS.actionBytes} bytes`);
      else {
        values[id] = action;
        add(id, 'ok', action);
      }
    });
  }
  field('capture.slug', (value) => {
    if (typeof value === 'string' && SLUG.test(value) && (planVersion === 1 || NATIVE_SLUG.test(value))) {
      values.slug = value;
      add('capture.slug', 'ok', value);
    } else {
      add('capture.slug', 'invalid', `capture.slug must be a lowercase slug of letters, digits, and -, at most ${native ? 57 : 64} characters`);
    }
  });
  if (planVersion === 2) {
    field('observation', (value) => {
      if (value === OBSERVATION) add('observation', 'ok', `${OBSERVATION}: the fixed Windows ETW and process-handle observer; not started here`);
      else add('observation', 'invalid', `observation must be exactly "${OBSERVATION}"`);
    });
  }

  const failing = checks.filter((entry) => entry.status !== 'ok' && entry.status !== 'not_inspected');
  const complete = failing.length === 0;
  const requestedScope = failing.some((entry) => entry.status === 'missing') ? 'incomplete'
    : failing.some((entry) => entry.status === 'expired') ? 'expired' : complete ? 'complete' : 'invalid';
  const cli = artifacts.cli;
  const sdk = artifacts.sdk;
  /** @type {Record<string, any> | null} */
  let scopeParts = null;
  if (complete && cli && sdk && planVersion === 2) {
    const sources = Object.fromEntries(Object.entries(OWN_SOURCES).map(([name, file]) => [name, fileIdentity(path.join(HERE, file))]));
    const core = renderedCore(REPOSITORY_ROOT);
    scopeParts = {
      plan,
      artifacts: { cli, runtimePayload: artifacts.runtimePayload ?? null, sdk },
      sources,
      core: { files: core.files, bytes: core.bytes, sha256: core.sha256 },
      fixture: { manifestTemplateSha256: fixtureManifest('00000000-0000-0000-0000-000000000000').sha256, folders: FIXTURE_FOLDERS_V2 },
    };
  }
  if (complete && cli && sdk && planVersion === 3) {
    // The observer is no part of a normal run, so its source is not bound; the selected environment is, by digest.
    const sources = { qualifier: fileIdentity(path.join(HERE, OWN_SOURCES.qualifier)), native: fileIdentity(path.join(HERE, OWN_SOURCES.native)) };
    const core = renderedCore(REPOSITORY_ROOT);
    scopeParts = {
      plan,
      artifacts: { cli, sdk },
      sources,
      core: { files: core.files, bytes: core.bytes, sha256: core.sha256 },
      fixture: { manifestTemplateSha256: fixtureManifest('00000000-0000-0000-0000-000000000000', 2).sha256, folders: FIXTURE_FOLDERS_V3 },
      signIn: {
        auth: values.auth,
        environment: { names: values.environment.names, sha256: sha256(canonical(values.environment.values)) },
      },
    };
  }
  const scopeSha256 = !complete || !cli || !sdk ? null : scopeParts ? sha256(canonical(scopeParts)) : sha256(canonical({ plan, artifacts: { cli, sdk } }));
  const effects = !complete || !cli || !sdk ? []
    : planVersion === 3 ? plannedNormalEffects(values, cli, sdk)
      : planVersion === 2 ? plannedNativeEffects(values, cli, sdk, artifacts.runtimePayload ?? null) : plannedEffects(values, cli, sdk);
  const branch = planVersion === 3 ? NATIVE_BRANCH_V3 : planVersion === 2 ? NATIVE_BRANCH.v2 : NATIVE_BRANCH.v1;
  const fix = complete ? [] : ['Fix every check whose status is not ok or not_inspected, then preview again; only a complete plan has a scope digest.'];
  const report = {
    tool: 'qualify-collaboration',
    version: planVersion,
    mode: 'preview',
    evidenceLayer: 'prerequisite preview only: not component, native, or external cleanup evidence',
    effects: planVersion === 3
      ? 'none: no SDK import or construction, account lookup, runtime, session, model, listener, connection, credential or TLS read, '
        + 'approval, write, kill, or deletion occurred; only the plan, artifacts, sources, and core were hashed, directory metadata was '
        + 'inspected, and the selected environment names were read'
      : planVersion === 2
        ? 'none: no SDK import or construction, runtime, session, model, listener, connection, credential or TLS read, observation, '
          + 'approval, write, kill, or deletion occurred'
        : 'none: no SDK import or construction, runtime, session, model, listener, connection, credential or TLS read, '
          + 'approval, write, kill, or deletion occurred',
    checkedAt: new Date(now).toISOString(),
    host: { platform, node: nodeVersion },
    verdict: complete ? 'blocked' : 'invalid',
    scopeSha256,
    permission: {
      requestedScope,
      grant: 'missing',
      detail: 'A complete, current plan is only a precondition for asking. A preview never asks, receives, or implies a grant; only '
        + 'the native branch asks the human at run time, on an interactive terminal, for a freshly typed literal bound to this digest.',
    },
    checks,
    artifacts,
    ...(scopeParts ? { scope: { sources: scopeParts.sources, core: scopeParts.core, fixture: scopeParts.fixture,
      ...(scopeParts.signIn ? { signIn: scopeParts.signIn } : {}) } } : {}),
    plannedEffects: effects,
    proof: (planVersion === 3 ? PROOF_V3 : PROOF).map((entry) => ({ ...entry, sources: [...entry.sources] })),
    stages: [
      ...(planVersion === 3 ? STAGES_V3 : STAGES).map((stage) => ({
        id: stage.id,
        status: 'blocked',
        blockedBy: [...(complete ? [] : ['plan_invalid']), ...stage.needs, branch.id],
        detail: stage.detail,
      })),
    ],
    nativeBranch: { ...branch },
    ...(planVersion === 3 ? { strict: { ...STRICT_DEFERRED, checks: [...STRICT_DEFERRED.checks] } } : {}),
    next: planVersion === 3 ? [
      ...fix,
      'Run the native branch only under a current human decision: `--native --plan <absolute-v3-plan.json>` shows this scope and '
        + 'asks, on an interactive terminal, for a freshly typed literal bound to the digest. Nothing else authorizes it, and its best '
        + 'result is collaboration_qualified, never strict qualification.',
      'Preview again on the day of the run: any change to the plan, the hashed artifacts, this runner, the native branch, the rendered '
        + 'core, the latch manifest, a resolved base directory, or a selected environment value changes the scope digest.',
    ] : [
      ...fix,
      ...(planVersion === 1 ? ['Rewrite the plan as version 2 (runtime payload, fixed progress fixtures, and windows-etw observation) to '
        + 'run natively; a version-1 plan is preview-only.'] : []),
      'Run the native branch only under a current human decision: `--native --plan <absolute-v2-plan.json>` shows this scope and '
        + 'asks, on an interactive terminal, for a freshly typed literal bound to the digest. Nothing else authorizes it.',
      'Preview again on the day of the run: any change to the plan, the hashed artifacts, this runner, the observer, the rendered '
        + 'core, or the fixed fixture changes the scope digest.',
    ],
  };
  return {
    report,
    exitCode: complete ? EXIT.blocked : EXIT.invalid,
    scope: scopeParts && scopeSha256 ? scopeOf(values, plan, scopeParts, scopeSha256, effects, planVersion) : null,
  };
}

/**
 * The validated facts a native run needs, bound to its scope digest. A
 * version-3 scope names each role's resolved base directory and expected
 * account and the selected environment values in place of credential files
 * and a runtime payload, and carries the strict checks it defers, so its run
 * reports exactly what the preview disclosed.
 * @param {Record<string, any>} values @param {any} plan @param {Record<string, any>} parts @param {string} scopeSha256
 * @param {any[]} plannedEffectsList @param {number} planVersion
 */
function scopeOf(values, plan, parts, scopeSha256, plannedEffectsList, planVersion) {
  const common = {
    expiresAt: values.expiresAt,
    operator: values.operator,
    coordinator: values.coordinator,
    fixtureParent: values.fixtureParent,
    cli: parts.artifacts.cli.path,
  };
  const tls = {
    a: { certFile: values['tls.a.certFile'], keyFile: values['tls.a.keyFile'] },
    b: { certFile: values['tls.b.certFile'], keyFile: values['tls.b.keyFile'] },
  };
  const models = { a: values['models.a'], b: values['models.b'], worker: values['models.worker'] };
  if (planVersion === 3) {
    return {
      version: 3,
      scopeSha256,
      repoRoot: REPOSITORY_ROOT,
      artifacts: parts.artifacts,
      core: parts.core,
      plannedEffects: plannedEffectsList,
      strict: { ...STRICT_DEFERRED, checks: [...STRICT_DEFERRED.checks] },
      values: {
        ...common,
        sdk: parts.artifacts.sdk.path,
        models,
        auth: { kind: 'existing-sign-in', ...structuredClone(values.auth) },
        environment: structuredClone(values.environment),
        tls,
        port: values.port,
        projectId: values.projectId,
        slug: values.slug,
        plan,
      },
    };
  }
  return {
    version: 2,
    scopeSha256,
    repoRoot: REPOSITORY_ROOT,
    artifacts: parts.artifacts,
    core: parts.core,
    plannedEffects: plannedEffectsList,
    values: {
      ...common,
      runtimePayload: parts.artifacts.runtimePayload?.path ?? null,
      sdk: parts.artifacts.sdk.path,
      models,
      credentials: { a: values['credentials.a'], b: values['credentials.b'], worker: values['credentials.worker'] },
      tls,
      port: values.port,
      projectId: values.projectId,
      slug: values.slug,
      plan,
    },
  };
}

/** A whole number with comma thousands separators, independent of the host's locale data. @param {number} value */
function grouped(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The after-view control's own disclosure: its session settings, A's model
 * and credential route, the exact prompt, the files its one view may read and
 * surface, its permission relay, what it must show, and its bound. Nothing
 * here happened.
 * @param {string} parent The fixture parent. @param {Record<string, any>} values
 */
function afterViewDisclosure(parent, values) {
  const project = path.join(parent, ...AFTER_VIEW_CONTROL.project.split('/'));
  const target = path.join(project, AFTER_VIEW_CONTROL.target);
  const others = CANARIES.filter((canary) => canary.location === 'work' && ['instructions', 'on_demand_instructions'].includes(canary.kind)
    && canary.path !== AFTER_VIEW_CONTROL.source).map((canary) => canary.path);
  return 'The control runtime\'s discovery checks accept each fixed instruction canary only with its own documented type, as a repository '
    + `or working-directory source of the scanned project ${project}. `
    + 'In the control runtime, after its discovery checks, the discovery session is disconnected and exactly one fresh session is '
    + `created with A's model ${values['models.a']} and A's credential ${values['credentials.a']}: only `
    + `${AFTER_VIEW_CONTROL.session.availableTools.join(', ')}, custom and on-demand instructions on, configuration discovery, hooks, `
    + 'skills, memory, the session store, host Git, extensions, and MCP off, no additional directories, working directory '
    + `${path.join(parent, ...AFTER_VIEW_CONTROL.workingDirectory.split('/'))}. Before anything is sent, its model, tool catalog, view `
    + 'arguments against the built-in view schema, working directory, and empty loaded instructions are checked. It is sent this '
    + `prompt once: ${JSON.stringify(afterViewPrompt(target))} That one view may read ${target} and surface and read `
    + `${AFTER_VIEW_CONTROL.source} in ${project}, and may also surface ${others.join(' and ')} there; each permission request for those `
    + 'reads is shown and needs a freshly typed approve-once before the control\'s deadline or the scope\'s expiry, whichever is '
    + 'earlier, and is withdrawn once that view\'s turn ends, aborts, or reports an error, or another operation appears in its session. '
    + 'The run requires that one root view request of this prompt, its successful model-facing output, at most '
    + `${grouped(AFTER_VIEW_CONTROL.outputBytes)} bytes, holding the synthetic file's text exactly once, the public instruction-discovered `
    + `notification for ${AFTER_VIEW_CONTROL.source}, ${AFTER_VIEW_CONTROL.source} among the loaded sources by digest with a documented `
    + 'repository type and location (type repo or nested-agents, location repository), and the control runtime\'s observed reads of both '
    + 'files after the discovery checks, with every event of that session one its phase permits, in the form permitted (before the prompt, '
    + 'during its one turn, and after that turn only housekeeping or another normal idle, through its post-turn checks), none stating '
    + 'another session, admission, or tool call than it established, no tool catalog naming another model than the checked one once the '
    + 'model check was asked, and no change of its model or working directory once the run asked for the matching check, even the same '
    + 'one restated (model names on its turn and usage events are telemetry labels and are not compared); anything less stops the run as '
    + 'ambient_state_unobservable. What the session sent before the prompt is judged just before the prompt would be sent, and a refused '
    + 'event there means the prompt is never sent. The report keeps, as local evidence only and never the event\'s data, at most 8 entries '
    + 'for the events of that session it refused, one per distinct original type and class, each with the type name, class, count, and '
    + 'the first such event\'s ID when that ID is safe to keep (otherwise null), and counts any further distinct entries as '
    + 'refusedEventsOmitted. The control runtime is then stopped, and its '
    + 'whole process tree must be seen to end within 10 seconds of that stop. A snapshot of that stop that lost, could not decode, or '
    + 'could not attribute events, missed a marker, had an identity gap, or overflowed confirms nothing and stops the run with that '
    + 'observer reason. Events the session delivers during that stop come after its final judgment, so they are neither judged nor kept '
    + 'in the report; the stop is still checked as above, and an overflow of the session\'s event log still stops the run. The whole '
    + 'control has one 60-second deadline and ends before either main starts; nothing from it reaches A\'s or B\'s sessions, prompts, or '
    + 'journals.';
}

/**
 * The main sessions' permission relay, which both native routes share, as
 * the human decides on it: every request this consent itself covers, which
 * the relay approves once each without asking (each step's exact calls of
 * Dude's own tools and reads of the session's own workspace, each progress
 * file's exact edit, and the capture step's exact commands, staging files,
 * and reads of the staging folder), the capture step's one exception for the
 * installed Spec Lead, the report's account of those approvals, and that the
 * activation approvals and the final reread stay typed. Nothing here
 * happened.
 * @param {unknown} slug The plan's capture slug.
 */
function mainRelayDisclosure(slug) {
  return 'Main-session permission requests go to a fixed relay, and only for a tool call that session\'s own root model requested for '
    + 'its current step, or, in A\'s capture step alone, one that the installed Spec Lead (A\'s rendered '
    + '.github/agents/dude-spec-lead.agent.md, checked by path and bytes) requested inside a synchronous task call that A\'s root model '
    + 'made for that step, while that task runs. A Spec Lead request counts only when A\'s own session events show that root task call '
    + 'and its start selecting the Spec Lead in sync mode, the runtime\'s start of one sub-agent for that call with no spawning '
    + 'sub-agent, that sub-agent\'s own request of the call, and that permission request still pending; no other or nested sub-agent, '
    + 'background task, earlier instruction, or ended task counts. Under this consent the relay itself approves once each, without asking '
    + 'you, that step\'s exact calls to '
    + 'Dude\'s own tools, from the step\'s admitted instruction until its turn ends: in each proposal step, dude_a2a_propose with that '
    + 'session\'s a2a.json and profile; in the advice exchange, dude_a2a_conversation begin_receive and read for B, and begin_ask (slug '
    + `${slug}, the fixed question, and an integer tentative number) and read for A; in the cancellation exchange, the same for B, and `
    + `begin_ask (slug ${slug}-cancel), cancel, and read for A. Read and cancel need a well-formed operation ID, and the product checks `
    + 'which operation it names. In both exchanges and the capture step it also approves once each, the same way, a read that the '
    + 'session\'s own root model requests of its own workspace (a/w for A, b/w for B) or of anything below it while that step\'s turn '
    + 'is open, and in the capture step such a read of a/w by that Spec Lead; never a read of the other workspace or anywhere else, any '
    + 'other subagent\'s read, or one after that turn ends. The approval steps allow neither, and the capture step no Dude tool call. '
    + 'Inside the progress interval it also approves once each, the same way, each session\'s exact edit of its own progress file from '
    + 'pending to complete, and while the capture step\'s turn is open: from A\'s root model only, the exact inventory command, one fixed '
    + 'Get-FileHash of a staged ledger, and the publisher command for this slug with staged files below a/t; from the Spec Lead only, each '
    + 'new staging file below a/t, as its own complete creation; and from either, a read of a/t itself or of anything below it. Right '
    + 'before it approves one of these edits, commands, staging files, or reads of a/t, the relay checks again that the request is still '
    + 'pending and unchanged, still made by the same model or Spec Lead, and still inside that interval or turn and this scope; otherwise '
    + 'it rejects the request. A request that managed policy marks as needing a person is rejected instead. The report counts these '
    + 'approvals per session by tool and operation, workspace reads as workspace.read, and the Spec Lead\'s as spec_lead.workspace.read; '
    + 'progress edits as progress.edit, the inventory, hash, and publisher commands as capture.command, reads of a/t as capture.read, or '
    + 'spec_lead.capture.read for the Spec Lead\'s, and staging files as spec_lead.capture.staging. It also keeps a permission entry, '
    + 'answered consented, for each approval under those last five keys, within the same 50-entry bound as its rejections. Only A\'s root '
    + 'model runs a command, and it stages nothing itself; the Spec Lead runs no command and calls no Dude or other tool. Everything else, '
    + 'including removing the staging folder, is rejected. Both dude a2a approve lines and the final reread reviewed are still yours to '
    + 'type.';
}

/**
 * What an authorized native run of this complete version-2 plan would do,
 * shown in full before the human's consent. Nothing here happened.
 * @param {Record<string, any>} values @param {FileIdentity} cli
 * @param {{path: string, index: FileIdentity, extension: FileIdentity}} sdk @param {FileIdentity | null} payload
 */
function plannedNativeEffects(values, cli, sdk, payload) {
  const parent = String(values.fixtureParent);
  const folders = FIXTURE_FOLDERS_V2.map((folder) => path.join(parent, ...folder.split('/'))).join(', ');
  return [
    {
      scope: 'preparation',
      detail: `Create only ${folders}, plus a/a2a.json and b/a2a.json beside them. Render the core bundle from this repository's `
        + 'source into a/w and b/w (no .git, memory, profile override, or pack); seed synthetic lifecycle records (A holds only 100; '
        + 'B holds 100 and 101, which A lacks); write each side\'s Canvas preference turning off the session-start update check; '
        + 'write the fixed canary manifest and sources in q and the control canaries in k.',
    },
    {
      scope: 'observation',
      detail: 'Start the fixed observer first: Windows PowerShell running scripts/dude-a2a/native-observer.ps1, which compiles a small '
        + 'embedded C# reader and opens a real-time ETW session for the Kernel-Process and Kernel-File providers only. It needs '
        + 'administrator or Performance Log Users rights and refuses without them; nothing elevates. It records this run\'s process '
        + 'identities and file-access counts by approved path class, never contents, command lines, environments, or network data, '
        + 'and it kills, injects into, and deletes nothing. Below each B worker\'s own folder in b/t it also keeps, from its start, each '
        + 'file\'s path relative to that folder (not in its temp area), so every access the worker makes in its configuration and home '
        + 'storage, a read or open as well as a write, is classified by the documented purpose of the session workspace it recorded. '
        + 'A path there that is not one plain spelling (a . or .. segment, an empty or forward separator, a trailing dot or space, a '
        + 'stream name, or an 8.3 short name) keeps no name and is never classified, and an access it cannot classify fails the run as '
        + 'ambient_storage_unclassified. A fixed Node helper then writes, reads, and exits once to calibrate it.',
    },
    {
      scope: 'native_startup',
      detail: `Start Copilot CLI runtimes from ${cli.path} (${cli.bytes} bytes, sha256 ${cli.sha256})`
        + `${payload ? `, each observed loading its payload ${payload.path} (sha256 ${payload.sha256})` : ''}, each with its own home, `
        + 'configuration, and temp folders, an explicit credential, and the logged-in user off: one control runtime in empty mode that '
        + 'checks canary recognition through parsed public discovery results, then runs the after-view control below and stops, then '
        + `A and B. Create one fresh session each with project discovery, requestExtensions, and extensionSdkPath ${sdk.path} at `
        + 'createSession; require one running project:dude extension and select the rendered Dude agent by its stable ID. Models: A '
        + `${values['models.a']}, B ${values['models.b']}.`
        + `${payload ? '' : ' This plan names no runtime payload, and nothing shows that the launcher alone is the complete runtime, so a native run refuses before asking.'}`,
    },
    {
      scope: 'after_view_control',
      detail: afterViewDisclosure(parent, values),
    },
    {
      scope: 'secret_reads',
      detail: `This runner reads A's certificate ${values['tls.a.certFile']} and B's ${values['tls.b.certFile']} for their pins, and A's `
        + `${values['credentials.a']} and B's ${values['credentials.b']} as the runtimes' credentials (A's also for the control runtime). `
        + `Each extension reads its own key (${values['tls.a.keyFile']}, ${values['tls.b.keyFile']}) and B's reads the worker token `
        + `${values['credentials.worker']}. Values are never shown or recorded, and this preview opened none of them.`,
    },
    {
      scope: 'transport_and_approval',
      detail: `B alone listens on https://127.0.0.1:${values.port}/ with mutual TLS and owner-pinned certificates; A connects only `
        + `there. Project ${values.projectId}; both profiles use contentBytes ${PROFILE_CONTENT_BYTES} and allow two exchanges. Each `
        + `main returns its complete native proposal (at most ${A2A_PROPOSAL_BYTES} bytes; B's names SHARING, WORKER, and `
        + 'QUALIFICATION separately), shown whole. The human types that session\'s exact current approval; only that entered line, '
        + 'without surrounding spaces, is sent, the unchanged classifier must accept it, and an attributed or refused relay stops the run.',
    },
    {
      scope: 'worker',
      detail: `B's separate WORKER scope: runtime ${cli.path}, model ${values['models.worker']}, only ${WORKER_TOOLS.inventory} and `
        + `${WORKER_TOOLS.read} over B's records, every permission denied, worker at most ${CONVERSATION_LIMITS.workerMs} ms, operation `
        + `at most ${CONVERSATION_LIMITS.operationMs} ms, cleanup ${CONVERSATION_LIMITS.cleanupMs} ms. This runner writes its startup `
        + 'release only after checking its recorded readiness and observed processes, and its evidence release only after both mains\' '
        + 'progress. The startup release also needs the session storage the worker recorded: a workspace that is still the same '
        + 'directory by path, device, and inode, or observed absence, which allows no session persistence. Product cessation stays '
        + 'unconfirmed and its storage is kept.',
    },
    {
      scope: 'progress_and_capture',
      detail: 'Both mains are sent their whole exchange instructions together; their runtimes\' own event times must show both admitted '
        + 'before either begins and B waiting before A asks, or the run fails, because the runner cannot enforce that order. '
        + `When the worker's first model evidence call is held, ${PROGRESS_FIXTURES.a.path} and ${PROGRESS_FIXTURES.b.path} appear `
        + 'holding pending; each main\'s own model must change its file to complete through a native tool call inside that interval. '
        + 'No root prompt is sent while an operation is pending, and nothing given to A names B\'s records or the expected number. '
        + `Then A decides explicitly whether to use the advice; its normal capture of ${values.slug} has the installed Spec Lead stage the `
        + 'ledger and the advice in two synchronous tasks, and A\'s root model runs the inventory, the hash, and the actual publisher with '
        + `--number-advice, which writes the ledger and ${TRANSCRIPT_DIR}/captures/<operationId>.json.`,
    },
    {
      scope: 'permissions',
      detail: `${mainRelayDisclosure(values.slug)} The after-view control session has its own fixed relay, only for its one view's reads `
        + 'of the files named there, each of which you approve with a freshly typed approve-once; it never answers for a main session or '
        + 'the worker. Worker permissions stay denied by the product.',
    },
    {
      scope: 'cancellation_and_teardown',
      detail: 'One more exchange starts a fresh worker; while its first model call is held, cancel-a.txt appears and A\'s model '
        + 'cancels through the conversation tool. The answering worker\'s whole process tree must end within 10 seconds of its recorded '
        + 'finish, checked before capture, and the cancelled worker\'s within 10 seconds of B\'s terminal record. Then only SDK '
        + 'lifecycle stops run within one shared 10-second budget (disconnect, stop, and force-stop only when stop fails), and the '
        + 'observer, after stopping and draining its session, must show every owned process ended within those 10 seconds. You follow '
        + 'both journals live and reread them after the sessions end. Nothing is killed, deleted, retried, or rerun; everything stays '
        + 'below the fixture parent.',
    },
    {
      scope: 'recording',
      detail: `Each peer journals under its own workspace's ${TRANSCRIPT_DIR}/ (${TRANSCRIPT_LIMITS.journalBytes}-byte journals). A's `
        + `answered journal keeps exactly its ${ANSWERED_RECORDS.length} records; qualification evidence goes only to `
        + `${path.join(parent, 'p')}, never into a journal. Operator ${values.operator} and coordinator ${values.coordinator}; valid `
        + `until ${values.expiresAt}.`,
    },
  ];
}

/**
 * What an authorized native run of this complete version-3 plan would do,
 * shown in full before the human's consent: the qualifier's own complete
 * disclosure, separately authorized, which the product proposal's size cap
 * does not bound. Normal-mode effects are named as effects, never hidden
 * behind the existing sign-in. Nothing here happened.
 * @param {Record<string, any>} values @param {FileIdentity} cli
 * @param {{path: string, index: FileIdentity, extension: FileIdentity}} sdk
 */
function plannedNormalEffects(values, cli, sdk) {
  const parent = String(values.fixtureParent);
  const folders = FIXTURE_FOLDERS_V3.map((folder) => path.join(parent, ...folder.split('/'))).join(', ');
  const { auth, environment } = values;
  const selected = environment.values;
  const names = environment.names.join(', ');
  /** @param {'a' | 'b' | 'worker'} role */
  const account = (role) => `${auth[role].expectedAccount.login} at ${auth[role].expectedAccount.host}`;
  return [
    {
      scope: 'preparation',
      detail: `Create only ${folders}, plus a/a2a.json and b/a2a.json beside them. Render the core bundle from this repository's `
        + 'source into a/w and b/w (no .git, memory, profile override, or pack); seed synthetic lifecycle records (A holds only 100; '
        + 'B holds 100 and 101, which A lacks); write the latch-only qualification manifest {"version":2,"runId":<this run>} in q. '
        + 'The generated owner configurations must pass the product\'s own configuration parser before they are written. No canary, '
        + 'control runtime, Canvas preference file, home folder, or configuration folder is created, and this runner writes nothing '
        + 'to the real home or configuration.',
    },
    {
      scope: 'native_startup',
      detail: `Start two Copilot CLI runtimes from ${cli.path} (${cli.bytes} bytes, sha256 ${cli.sha256}) in the SDK's normal `
        + 'copilot-cli mode, with the logged-in user on and no token: A with base directory (COPILOT_HOME) '
        + `${auth.a.baseDirectory} and B with ${auth.b.baseDirectory}. Each runtime's environment holds only ${names} as this process `
        + `holds them (HOME ${selected.HOME}, USERPROFILE ${selected.USERPROFILE}, APPDATA ${selected.APPDATA}, LOCALAPPDATA `
        + `${selected.LOCALAPPDATA}; every value bound by the scope digest and rechecked before each runtime starts), each other name `
        + 'Windows would supply blank, and TEMP, TMP, and TMPDIR set to its own a/t or b/t; its working directory is its own a/w or '
        + `b/w. Create one fresh session each with project discovery, requestExtensions, and extensionSdkPath ${sdk.path} at `
        + 'createSession, and host Git, the session store, memory, and session telemetry configured off, which nothing here '
        + 'certifies; require one running project:dude extension and select the rendered Dude agent by its stable ID. Models: A '
        + `${values['models.a']}, B ${values['models.b']}.`,
    },
    {
      scope: 'normal_runtime_effects',
      detail: 'Normal mode is not isolation. Each main runtime, and B\'s worker runtime, resolves its own stored OAuth or GitHub CLI '
        + 'sign-in as the runtime does; reads its normal home and configuration, the real home and app data named above and its base '
        + 'directory; and writes its normal logs, configuration, and session storage there. Each normal runtime may also start the '
        + `owner's configured MCP servers and plugins; B's worker model can still call only its two evidence tools, ${WORKER_TOOLS.inventory} `
        + `and ${WORKER_TOOLS.read}. This runner reads, copies, shows, and stores `
        + 'no credential, and all that storage and those logs are kept, never deleted. Each main\'s Dude extension reads the owner\'s '
        + 'real Canvas preferences, so its session-start update check runs or not as they say. No observer runs, so no file or process '
        + 'activity is observed or classified.',
    },
    {
      scope: 'accounts',
      detail: 'Before any prompt, and again before every later prompt, each main\'s own client (getAuthStatus) and its actual new '
        + 'session (gitHubAuth.getStatus) must report authenticated as the expected login (letter case ignored) at exactly the expected '
        + `host, by user or gh-cli: A ${account('a')}, B ${account('b')}. B's worker must record the same for its own runtime and `
        + `session as ${account('worker')}. A missing, malformed, or failing answer stops the run as auth_unavailable, an `
        + 'unauthenticated one as auth_required, and another account, host, or kind as auth_mismatch, before anything more is sent. '
        + 'Nothing logs in, switches accounts, retries in another session, or falls back. These are point-in-time observations, not an '
        + 'account lock, entitlement, or revocation check.',
    },
    {
      scope: 'tls_reads',
      detail: `This runner reads A's certificate ${values['tls.a.certFile']} and B's ${values['tls.b.certFile']} for their pins. Each `
        + `extension reads its own key (${values['tls.a.keyFile']}, ${values['tls.b.keyFile']}). No credential file is named or read. `
        + 'Values are never shown or recorded, and this preview opened none of them.',
    },
    {
      scope: 'transport_and_approval',
      detail: `B alone listens on https://127.0.0.1:${values.port}/ with mutual TLS and owner-pinned certificates; A connects only `
        + `there. Project ${values.projectId}; both profiles use contentBytes ${PROFILE_CONTENT_BYTES} and allow two exchanges. Each `
        + `main returns its complete native proposal (at most ${A2A_PROPOSAL_BYTES} bytes; B's names SHARING, WORKER with its existing `
        + 'sign-in and expected account, and QUALIFICATION separately), shown whole. The human types that session\'s exact current '
        + 'approval; only that entered line, without surrounding spaces, is sent, the unchanged classifier must accept it, and an '
        + 'attributed or refused relay stops the run.',
    },
    {
      scope: 'model_calls',
      detail: `Model requests go through each runtime's normal sign-in: A's prompts and its session's tool results to `
        + `${values['models.a']}, B's to ${values['models.b']}, and the worker's prompt, the question, and the lifecycle records it reads `
        + `to ${values['models.worker']}. The A2A request carries A's question and tentative number to B, and B's reply carries the `
        + 'worker\'s answer, explanation, and citations back to A; each peer records them before disclosure.',
    },
    {
      scope: 'worker',
      detail: `B's separate WORKER scope: runtime ${cli.path}, model ${values['models.worker']}, the existing saved sign-in with base `
        + `directory ${auth.worker.baseDirectory} and expected account ${account('worker')}, environment names ${names} with values hidden, `
        + `only ${WORKER_TOOLS.inventory} and ${WORKER_TOOLS.read} over B's records, every permission denied, worker at most `
        + `${CONVERSATION_LIMITS.workerMs} ms, operation at most ${CONVERSATION_LIMITS.operationMs} ms, cleanup `
        + `${CONVERSATION_LIMITS.cleanupMs} ms. Its own work and temp folders are under b/t; its configuration, sessions, logging, and `
        + 'sign-in lookup use the real home and app data and its base directory. This runner writes its startup release only after '
        + 'checking its recorded version-2 readiness (this operation, session, permit, loaders, SDK files, extension process ID, runtime, '
        + 'model, tool catalog, both accounts, and normal session storage in its own working folder), and its evidence release only '
        + 'after both mains\' progress. The qualification is latch-only: no canary, probe, or ambient count is run or reported. Product '
        + 'cessation stays unconfirmed and its storage is kept.',
    },
    {
      scope: 'progress_and_capture',
      detail: 'Both mains are sent their whole exchange instructions together; their runtimes\' own event times must show both admitted '
        + 'before either begins and B waiting before A asks, or the run fails, because the runner cannot enforce that order. '
        + `When the worker's first model evidence call is held, ${PROGRESS_FIXTURES.a.path} and ${PROGRESS_FIXTURES.b.path} appear `
        + 'holding pending; each main\'s own model must change its file to complete through a native tool call inside that interval. '
        + 'No root prompt is sent while an operation is pending, and nothing given to A names B\'s records or the expected number. '
        + `Then A decides explicitly whether to use the advice; its normal capture of ${values.slug} has the installed Spec Lead stage the `
        + 'ledger and the advice in two synchronous tasks, and A\'s root model runs the inventory, the hash, and the actual publisher with '
        + `--number-advice, which writes the ledger and ${TRANSCRIPT_DIR}/captures/<operationId>.json.`,
    },
    {
      scope: 'permissions',
      detail: `${mainRelayDisclosure(values.slug)} Worker permissions stay denied by the product.`,
    },
    {
      scope: 'cancellation_and_teardown',
      detail: 'One more exchange starts a fresh worker; while its first model call is held, cancel-a.txt appears and A\'s model '
        + 'cancels through the conversation tool. Each worker\'s bounded cleanup is read from B\'s journal: its stop must report no '
        + 'errors, its runtime cessation stays unconfirmed, and its storage is kept. Then only SDK lifecycle stops run within one shared '
        + '10-second budget (disconnect, stop, and force-stop only when stop fails); each main\'s stop must report no errors by its absolute '
        + 'stop deadline (5 seconds into that budget), and a stop that reports errors, fails, or overruns fails '
        + 'the run. An SDK stop or parent exit proves no process-tree cessation, so cessation is reported unconfirmed. You follow both '
        + 'journals live and reread them after the sessions end. Nothing is killed, deleted, retried, or rerun; the real home, '
        + 'configuration, logs, and session storage are never deleted, and everything this run creates stays below the fixture parent.',
    },
    {
      scope: 'recording',
      detail: `Each peer journals under its own workspace's ${TRANSCRIPT_DIR}/ (${TRANSCRIPT_LIMITS.journalBytes}-byte journals). A's `
        + `answered journal keeps exactly its ${ANSWERED_RECORDS.length} records; qualification evidence goes only to `
        + `${path.join(parent, 'p')}, never into a journal. Operator ${values.operator} and coordinator ${values.coordinator}; valid `
        + `until ${values.expiresAt}.`,
    },
    {
      scope: 'deferred_strict',
      detail: STRICT_DEFERRED.detail,
    },
  ];
}

/**
 * Read one plan file and validate it for a native run: a complete,
 * unexpired version-2 or version-3 plan yields its scope; anything else
 * refuses with the preview report and no scope. `environment` and `platform`
 * replace this process's only for a test.
 * @param {{file: string, now?: number, repoRoot?: string, environment?: Record<string, string | undefined>, platform?: NodeJS.Platform}} options
 * @returns {{report: Record<string, any>, exitCode: number, scope: Record<string, any> | null, plan: {file: string, bytes: number, sha256: string},
 *   expired: boolean}}
 */
export function nativeScope({ file, now, repoRoot, environment, platform }) {
  const read = readPlan(file);
  const result = previewQualification(read.value, { now, repoRoot, environment, platform });
  const expired = result.report.checks.some((/** @type {Check} */ entry) => entry.id === 'expiresAt' && entry.status === 'expired');
  return { report: result.report, exitCode: result.exitCode, scope: result.scope ?? null, plan: { file, bytes: read.bytes, sha256: read.sha256 }, expired };
}

/**
 * What an authorized run of this complete plan would do, for the human
 * decision. Nothing here happened.
 * @param {Record<string, unknown>} values @param {FileIdentity} cli
 * @param {{path: string, index: FileIdentity, extension: FileIdentity}} sdk
 */
function plannedEffects(values, cli, sdk) {
  const parent = String(values.fixtureParent);
  const folders = FIXTURE_FOLDERS.map((folder) => path.join(parent, ...folder.split('/'))).join(', ');
  return [
    {
      scope: 'preparation',
      detail: `Separately authorized, and not performed by this runner: create only ${folders}; seed synthetic lifecycle records `
        + '(A holds only 100; B holds 100 and 101, which A lacks), each main\'s progress fixture, and in each owned home the existing '
        + 'Canvas preference document that turns off the session-start update check. Copy no .git, user settings, skills, memory, or '
        + 'real project state; render the Dude profile and extension from this repository\'s current source.',
    },
    {
      scope: 'native_startup',
      detail: `Start two Copilot CLI runtimes from ${cli.path} (${cli.bytes} bytes, sha256 ${cli.sha256}), each with its own home, `
        + 'configuration, and temp folders, an explicit credential, and the logged-in user off. Create one fresh session each with '
        + `project discovery, requestExtensions, and extensionSdkPath ${sdk.path} at createSession; confirm the running project:dude `
        + `extension and select the project dude agent. Models: A ${values['models.a']}, B ${values['models.b']}. At most two `
        + 'exchanges: one advice exchange and one cancellation exchange.',
    },
    {
      scope: 'secret_reads',
      detail: `A2A proposal preparation reads and hashes A's ${values['tls.a.certFile']} and ${values['tls.a.keyFile']}, B's `
        + `${values['tls.b.certFile']} and ${values['tls.b.keyFile']}, and B's worker token file ${values['credentials.worker']}; each `
        + `main runtime uses its own credential file (A ${values['credentials.a']}, B ${values['credentials.b']}). Values are never shown `
        + 'or recorded, and this preview opened none of them.',
    },
    {
      scope: 'transport_and_approval',
      detail: `B alone listens on https://127.0.0.1:${values.port}/ with mutual TLS and owner-pinned certificates; A connects only `
        + `there. Project ${values.projectId}; both profiles use contentBytes ${PROFILE_CONTENT_BYTES}; one number_advice question per `
        + `exchange. Each main returns its complete native proposal (at most ${A2A_PROPOSAL_BYTES} bytes; B's names SHARING and WORKER `
        + 'separately). The human reviews that complete native result, never a summary, preview, rewritten copy, or annex, and approves '
        + 'it by typing that session\'s exact current approval. No approval is generated, prefilled, relayed from a log, or applied '
        + 'automatically.',
    },
    {
      scope: 'worker',
      detail: `B's separate WORKER scope: runtime ${cli.path}, model ${values['models.worker']}, credential file `
        + `${values['credentials.worker']}; only ${WORKER_TOOLS.inventory} and ${WORKER_TOOLS.read} over the lifecycle records in B's `
        + `workspace; every permission request denied; worker at most ${CONVERSATION_LIMITS.workerMs} ms, operation at most `
        + `${CONVERSATION_LIMITS.operationMs} ms, cleanup wait ${CONVERSATION_LIMITS.cleanupMs} ms. Once its runtime may have started, `
        + 'cessation is reported unconfirmed and its storage is kept.',
    },
    {
      scope: 'capture_and_progress',
      detail: `While B's worker is actually pending, each main completes its own unrelated authorized action through a model-requested `
        + `native tool call: A ${values['progress.a']}; B ${values['progress.b']}. No new root prompt is sent while an operation is `
        + 'pending, and nothing given to A names B\'s records, B\'s maximum, or the expected number. After A\'s explicit use decision '
        + `under its normal capture authority, the actual publisher runs with --number-advice for ${values.slug} in A's workspace and `
        + `writes the ledger and ${TRANSCRIPT_DIR}/captures/<operationId>.json.`,
    },
    {
      scope: 'recording',
      detail: `Each peer journals under its own workspace's ${TRANSCRIPT_DIR}/ (${TRANSCRIPT_LIMITS.journalBytes}-byte journals, `
        + `${TRANSCRIPT_LIMITS.reserveBytes}-byte closing reserve, ${TRANSCRIPT_LIMITS.conversations} retained conversations, `
        + `${TRANSCRIPT_LIMITS.receiptBytes}-byte receipts). A's answered journal keeps exactly its ${ANSWERED_RECORDS.length} records `
        + `(${ANSWERED_RECORDS.join(', ')}); qualification timing and provenance go only to ${path.join(parent, 'proof')}, never into `
        + 'a journal.',
    },
    {
      scope: 'observation_and_teardown',
      detail: `Operator ${values.operator} and coordinator ${values.coordinator} observe from the prerequisite checks through teardown `
        + `and the retained reread, within this scope's validity until ${values.expiresAt}. Only approved lifecycle stops run. This `
        + 'runner kills no process and deletes no storage; further OS remediation or deletion needs its own current decision naming '
        + 'the exact process identities and paths.',
    },
  ];
}

/**
 * Read one plan file: a bounded regular UTF-8 JSON file, never a link.
 * @param {string} file @returns {{value: unknown, bytes: number, sha256: string}}
 */
export function readPlan(file) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw new QualificationError('plan_unreadable', 'the plan file cannot be found or inspected');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new QualificationError('plan_unsafe', 'the plan must be a regular file, not a link or folder');
  if (stat.size > QUALIFICATION_LIMITS.planBytes) {
    throw new QualificationError('plan_too_large', `the plan exceeds ${QUALIFICATION_LIMITS.planBytes} bytes`);
  }
  /** @type {Buffer} */
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw new QualificationError('plan_unreadable', 'the plan file cannot be read');
  }
  if (bytes.length > QUALIFICATION_LIMITS.planBytes) {
    throw new QualificationError('plan_too_large', `the plan exceeds ${QUALIFICATION_LIMITS.planBytes} bytes`);
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    return { value: JSON.parse(decoded), bytes: bytes.length, sha256: sha256(bytes) };
  } catch {
    throw new QualificationError('plan_not_json', 'the plan must be UTF-8 JSON');
  }
}

/**
 * Exactly `--plan <absolute path>` for a preview, or `--native --plan
 * <absolute path>` for the native branch; nothing else exists, so nothing
 * else can grant authority.
 * @param {string[]} argv @returns {{file: string, native: boolean}}
 */
function parseArguments(argv) {
  const native = argv.length === 3 && argv[0] === '--native';
  const rest = native ? argv.slice(1) : argv;
  const file = rest.length === 2 && rest[0] === '--plan' ? absolutePath(rest[1]) : null;
  if (!file) {
    throw new QualificationError('usage', 'pass exactly --plan <absolute-plan.json> to preview or --native --plan <absolute-v2-or-v3-plan.json> to '
      + 'run natively; no other option exists, and none grants authority');
  }
  return { file, native };
}

/** @param {{stdout: {write: (text: string) => unknown}}} io @param {Record<string, unknown>} report */
function printReport(io, report) {
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(output, 'utf8') > QUALIFICATION_LIMITS.reportBytes) {
    throw new QualificationError('report_too_large', `the report would exceed ${QUALIFICATION_LIMITS.reportBytes} bytes; nothing was printed`);
  }
  io.stdout.write(output);
}

/**
 * Run the command line, writing the report to stdout or one bounded refusal
 * to stderr. A preview returns its exit status; the native branch returns a
 * promise of it. The native branch's human interaction uses stdin and stderr,
 * which must be an interactive terminal.
 * @param {string[]} argv
 * @param {{stdout: {write: (text: string) => unknown}, stderr: {write: (text: string) => unknown}, stdin?: unknown}} [io]
 * @param {PreviewOptions} [options]
 * @returns {number | Promise<number>}
 */
export function main(argv, io = process, options = {}) {
  /** @param {unknown} error */
  const refuse = (error) => {
    const code = error instanceof QualificationError ? error.code : 'internal_error';
    const detail = error instanceof Error ? error.message.replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 512) : 'unexpected failure';
    io.stderr.write(`qualify-collaboration: ${code}: ${detail}\n${USAGE}\n`);
    return EXIT.usage;
  };
  try {
    const { file, native } = parseArguments(argv);
    if (!native) {
      const plan = readPlan(file);
      const { report, exitCode } = previewQualification(plan.value, options);
      printReport(io, { ...report, plan: { file, bytes: plan.bytes, sha256: plan.sha256 } });
      return exitCode;
    }
    const scoped = nativeScope({ file, now: options.now, repoRoot: options.repoRoot, environment: options.environment, platform: options.platform });
    if (!scoped.scope) {
      // A native run needs a complete, unexpired version-2 or version-3 plan; nothing was imported or started.
      printReport(io, { ...scoped.report, mode: 'native_refused', verdict: 'invalid', plan: scoped.plan });
      return EXIT.invalid;
    }
    const scope = scoped.scope;
    return import('./native-collaboration.mjs').then(async ({ runNativeQualification }) => {
      const { report, exitCode } = await runNativeQualification({ scope, plan: scoped.plan, io: /** @type {any} */ (io) });
      printReport(io, report);
      return exitCode;
    }).catch(refuse);
  } catch (error) {
    return refuse(error);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  // No top-level await: the native branch imports this module back, which must finish evaluating first.
  const status = main(process.argv.slice(2));
  if (typeof status === 'number') process.exitCode = status;
  else void status.then((code) => { process.exitCode = code; });
}

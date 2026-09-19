// @ts-check
/**
 * Feature 057 T012 installed-host acceptance.
 *
 * This is an explicitly invoked acceptance driver, not a recursively discovered
 * unit test. It installs the current release into owned fixtures, starts the
 * installed Copilot CLI over the documented SDK stdio transport, lets that CLI
 * discover and fork the shipped Dude extension, and drives the returned Canvas
 * URL with an owned Edge/CDP process.
 *
 * The loopback model is deterministic and contains no credentials. It chooses
 * only predeclared tools actually offered by the CLI. The selected Dude session
 * projection delegates staging/revision work to the exact installed Spec Lead;
 * those agents use skill/create/view/edit/bash, and Dude invokes/acknowledges the
 * shipped handoff. The model fixture itself performs no post-seed canonical
 * write. This proves installed owner execution and waiter correlation, not
 * unscripted model reasoning or desktop-app rendering.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SDK = '/Applications/GitHub Copilot.app/Contents/Resources/copilot-sdk';
const CLI = process.env.DUDE_COPILOT_CLI ?? '/opt/homebrew/bin/copilot';
const CLI_RUNTIME = process.env.DUDE_COPILOT_RUNTIME
  ?? path.join(
    process.env.COPILOT_CLI_RESOLVED_DIST_DIR
      ?? path.join(os.homedir(), 'Library/Caches/copilot/pkg/darwin-arm64/1.0.83-5'),
    'index.js',
  );
const BROWSER = process.env.DUDE_CANVAS_BROWSER
  ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const ARTIFACTS = path.resolve(
  process.env.DUDE_CANVAS_ARTIFACTS_DIR
    ?? path.join(os.tmpdir(), 'dude-canvas-t012-installed-host'),
);
const RUN = fs.realpathSync(fs.mkdtempSync(path.join(
  fs.mkdirSync(ARTIFACTS, { recursive: true }) || ARTIFACTS,
  'installed-host-',
)));
const DEADLINE = 30_000;
const MAX_MODEL_BODY = 4 * 1024 * 1024;
const REVIEW_SLUG = 't012-installed-review';
const REVIEW_ID = '001';
const IDEA_PATH = `.dude/ideas/${REVIEW_ID}-${REVIEW_SLUG}.md`;
const SPEC_PATH = `.dude/specs/${REVIEW_ID}-${REVIEW_SLUG}/spec.md`;
const DESIGN_ROOT = `.dude/specs/${REVIEW_ID}-${REVIEW_SLUG}/design`;
const MOCK_PATH = `${DESIGN_ROOT}/mock.html`;
const CSS_PATH = `${DESIGN_ROOT}/mock.css`;
const SOURCE_APP_SHA256 = 'fcf3f9102f8eabd36f9bd0494a84695fda2891e1d53a7f05b03a1be2088a9463';
const SOURCE_LEGAL_SHA256 = '3be2d01e3b59529e54cde5f17aee76c168bcde63245c21ec387cf70ba7a6d869';
/**
 * The Review gesture behavior lives in these static modules, not in the bundled
 * frontend, so the frontend hash alone cannot show which engine an installed
 * run used. They are pinned here and re-checked against the bytes the installed
 * Canvas server actually serves.
 */
const SOURCE_REVIEW_MODULES = Object.freeze({
  'ui/review/engine.mjs': '69e1b1b1ebae71e4f64f6d3a477ec375924a243e515b994f8ccfd78884d78c50',
  'ui/review/geometry.mjs': 'e3e000908c5ee2f033448215eec606cae2931b062d0f3d75d049844c4a8f4def',
  'ui/review/styles.css': '20e3430b0e0111584f2c4d06352f69182cdeb3eff522db1a088d858fc23871af',
});
const APPROVED_HASHES = Object.freeze({
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

const { buildRelease } = await import(pathToFileURL(path.join(ROOT, 'scripts/build-release.mjs')));
const { CopilotClient, RuntimeConnection } = await import(pathToFileURL(path.join(SDK, 'index.js')));
const { decodePng } = await import(pathToFileURL(path.join(
  ROOT,
  'src/extensions/dude/lib/review/png.mjs',
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

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
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

/** @param {number} pid */
function processRow(pid) {
  const result = command('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,comm=']);
  const match = result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  return match ? { pid: Number(match[1]), ppid: Number(match[2]), executable: match[3] } : null;
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

/** @param {string} value */
function shellArg(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
    'title: T012 installed review',
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
  const bytes = Buffer.from([
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
  ].join('\n'));
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
        assert.ok(stagedRead.includes(options.intent));
        assert.ok(stagedRead.includes(`slug: ${options.slug}`));
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
        const taskResult = toolMessageText(body, lastTool.tool_call_id);
        assert.ok(taskResult.includes(ownerFixture.stagePath));
        assert.ok(taskResult.includes(ownerFixture.revision));
        const bash = requireToolSchema(body, 'bash', ['command', 'description']);
        const publisherCommand = [
          shellArg(process.execPath),
          shellArg(ownerFixture.publisher),
          '--root',
          shellArg(options.root),
          '--slug',
          shellArg(options.slug),
          '--stage',
          shellArg(ownerFixture.stagePath),
        ].join(' ');
        state.ownerExecution.publisherCommand = publisherCommand;
        state.phase = 'capture-publish';
        answerModel(res, body, toolCall(
          state.ownerExecution.publisherCallId,
          bash,
          {
            command: publisherCommand,
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
        assert.ok(canonicalRead.includes(options.intent));
        assert.ok(canonicalRead.includes(`slug: ${options.slug}`));
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
      state.modelError = safeError(error);
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

  /** @param {string} method @param {(value:any)=>void} listener */
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
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
  if (!browser.pid || browser.exitCode !== null || browser.signalCode !== null) return;
  process.kill(browser.pid, 'SIGTERM');
  await until(() => browser.exitCode !== null || browser.signalCode !== null, 'owned UI browser exit', 3_000)
    .catch(() => {
      if (browser.exitCode === null && browser.signalCode === null) process.kill(browser.pid, 'SIGKILL');
    });
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
 * @param {{
 *   root:string,
 *   data:string,
 *   modelUrl:string,
 *   caseName:string,
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
  };
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
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: CLI_RUNTIME }),
    workingDirectory: options.root,
    baseDirectory: path.join(options.data, 'copilot'),
    env,
    useLoggedInUser: false,
    logLevel: 'debug',
  });
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
        && typeof request.fullCommandText === 'string'
        && request.fullCommandText.startsWith(`${shellArg(process.execPath)} ${shellArg(path.join(
          options.root,
          '.github/skills/dude-feature-definition/publish-first-capture.mjs',
        ))} `)
        && request.fullCommandText.includes(`--root ${shellArg(options.root)} `)
        && request.fullCommandText.endsWith(
          `--slug ${shellArg(blankPlan.slug)} --stage ${shellArg(blankPlan.stagePath)}`,
        )
        && !/[\n\r`;]|&&|\|\||\$\(/.test(request.fullCommandText)
        && request.toolCallId === `call_${options.caseName}_publish_capture`;
      const exactHandoff = request.kind === 'custom-tool'
        && toolName === 'dude_needs_you'
        && request.args && typeof request.args === 'object'
        && ['request', 'acknowledge'].includes(request.args.op)
        && /^(?:call_blank-(?:non-git|git)_capture_ack|call_t012_(?:review_[abc]|ack_[abc]|permission|cancel|outside))$/
          .test(String(request.toolCallId));
      const accepted = (exactSession && (exactHandoff || exactPublisher))
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
            ? { kind: request.kind, fullCommandText: request.fullCommandText }
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
  host.record.cleanup.extensionStillRunning = Boolean(
    host.record.extensionProcess && processRow(host.record.extensionProcess.pid),
  );
  host.record.cleanup.hostStillRunning = Boolean(
    host.record.hostProcess && processRow(host.record.hostProcess.pid),
  );
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
    'lib/canvas-server.mjs',
    'lib/projection.mjs',
    'lib/needs-you.mjs',
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
  const forbidden = [
    '.github/extensions/dude/frontend',
    '.github/extensions/dude/needs-you.test.mjs',
    '.github/extensions/dude/review.test.mjs',
    '.github/extensions/dude/node_modules',
    'scripts/dude-canvas-ui',
  ].filter((relative) => fs.existsSync(path.join(root, ...relative.split('/'))));
  assert.deepEqual(forbidden, []);
  return { pairs, forbidden };
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

/** @param {Cdp} page @param {string} canvasUrl @param {string} intent */
async function driveBlankCapture(page, canvasUrl, intent) {
  const runtimeErrors = [];
  const network = [];
  page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
  page.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.startsWith(canvasUrl)) {
      network.push({ method: event.request.method, path: new URL(event.request.url).pathname });
    }
  });
  await navigate(page, canvasUrl, 360);
  await visible(page, 'Welcome to Dude');
  await click(page, button('New idea'));
  await fill(page, field('Your idea'), intent);
  await click(page, button('Save'));
  await visible(page, 'Awaiting acknowledgment');
  await visible(page, 'Idea saved');
  await click(page, button('Overview'));
  assert.deepEqual(runtimeErrors, []);
  assert.equal(network.filter((entry) => entry.path === '/api/needs-you/capture').length, 1);
  return { network, screenshot: await screenshot(page, `blank-${sha256(intent).slice(0, 8)}`) };
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

/** @param {Cdp} page @param {string} version @param {string} prompt @param {string|null} [gestureRoot] */
async function driveReviewRound(page, version, prompt, gestureRoot = null) {
  await visible(page, prompt);
  await click(page, `[...document.querySelectorAll('button')].find((node) =>
    node.innerText.includes(${JSON.stringify(prompt)}) && node.getClientRects().length)`);
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
  const armedManipulation = gestureRoot
    ? await driveArmedManipulation(page, gestureRoot, version)
    : null;
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
  const returnFocus = await evaluate(page, `document.activeElement?.innerText.trim()
    || document.activeElement?.getAttribute('aria-label') || null`);
  assert.ok(['Open Review', 'Needs you'].includes(returnFocus));
  await click(page, button('Open Review'));
  await visible(page, 'Comments (2)');
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
    armedManipulation,
    beforeReturn,
    returnFocus,
    workingScreenshot,
    respondBefore,
    respondAfter,
  };
}

/** @param {Cdp} page */
async function driveApproval(page) {
  const prompt = 'Approve exact installed revision C';
  await visible(page, prompt);
  await click(page, `[...document.querySelectorAll('button')].find((node) =>
    node.innerText.includes(${JSON.stringify(prompt)}) && node.getClientRects().length)`);
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

const manifest = {
  task: 'T012@a57c1212',
  startedAt: new Date().toISOString(),
  command: `node ${fileURLToPath(import.meta.url)}`,
  run: RUN,
  repoRoot: ROOT,
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cli: CLI,
  cliRuntime: CLI_RUNTIME,
  sdk: SDK,
  browser: BROWSER,
  installedCliVersion: null,
  browserVersionCommand: null,
  approvedMockHashes: {},
  source: {},
  blankCases: [],
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
  const appHelp = command(CLI, ['app', '--help']);
  assert.equal(appHelp.exitCode, 0, appHelp.stderr);
  const appScripting = command('/usr/bin/sdef', ['/Applications/GitHub Copilot.app']);
  manifest.desktopPanelCapability = {
    appHelp: appHelp.stdout.trim(),
    scriptingDictionary: {
      exitCode: appScripting.exitCode,
      available: appScripting.exitCode === 0,
      diagnostic: appScripting.exitCode === 0 ? null : appScripting.stderr.trim(),
    },
    supportedIsolatedPanelAutomation: false,
    reason: 'The SDK control host reports ui.canvases=false and canvas.open returns provider metadata plus a URL, not a desktop panel handle. The installed app command accepts no session/canvas argument, so no CLI selector reaches one panel, and native embedding stays unverified here. A nonzero scriptingDictionary exit records only that the probe did not complete, with its diagnostic, and is not evidence that the app lacks a dictionary. Attaching to the foreground app could change the active parent session.',
    remainingSmoke: [
      'Open the Dude panel in the disposable installed workspace.',
      'Confirm usable current panel sizing, current light/dark theme, and keyboard focus entry.',
      'With the work finder set to Closed, enter Review design and return; confirm the Closed finder context remains.',
      'Reload once, then close and reopen the panel; confirm the current Canvas reconnects.',
    ],
  };
  manifest.browserVersionCommand = command(BROWSER, ['--version']);
  assert.equal(manifest.browserVersionCommand.exitCode, 0, manifest.browserVersionCommand.stderr);
  for (const [relative, expected] of Object.entries(APPROVED_HASHES)) {
    const actual = sha256(sourceBytes(relative));
    assert.equal(actual, expected, `approved mock changed: ${relative}`);
    manifest.approvedMockHashes[relative] = actual;
  }
  manifest.source = {
    app: { bytes: sourceBytes('src/extensions/dude/ui/assets/app.js').length, sha256: SOURCE_APP_SHA256 },
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
    const release = buildRelease({ repoRoot: ROOT, outDir: root, ref: 'v0.0.0-t012' });
    if (kind === 'blank-git') {
      const init = command('git', ['init', '--quiet', root]);
      assert.equal(init.exitCode, 0, init.stderr);
    }
    const blank = assertBlankInstall(root, kind);
    const parity = installedParity(root);
    const intent = blankIntent(kind);
    const slug = blankSlug(kind);
    const model = createBlankModel({ root, kind, intent, slug, evidence });
    modelServers.push(model.server);
    const modelUrl = await listen(model.server);
    const host = await createInstalledHost({ root, data, modelUrl, caseName: kind });
    hosts.push(host);
    const idle = await host.session.sendAndWait({
      prompt: `T012 ${kind} bootstrap: return the deterministic idle marker.`,
    }, 30_000);
    assert.equal(idle?.data.content, 'T012_BLANK_HOST_IDLE');
    assert.equal(model.state.phase, 'idle');
    const browser = await driveBlankCapture(browserState.page, host.canvas.url, intent);
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
    assert.ok(canonical.includes(intent));
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
      parity,
      intentSha256: sha256(intent),
      capture,
      provider: snapshot,
      host: host.record,
      model: model.state,
      browser,
      noSpecOrTasks: true,
      realModelReasoning: false,
      ownerRoute: 'selected installed Dude session projection delegated exact staging to the installed Spec Lead, invoked the shipped publisher through bash, reread the canonical draft through view, then acknowledged; the model fixture made no file write',
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

  const root = path.join(RUN, 'review-git');
  const data = path.join(RUN, 'review-git-runtime');
  const evidence = path.join(RUN, 'review-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const release = buildRelease({ repoRoot: ROOT, outDir: root, ref: 'v0.0.0-t012' });
  const init = command('git', ['init', '--quiet', root]);
  assert.equal(init.exitCode, 0, init.stderr);
  const parity = installedParity(root);
  createReviewOwner(root);
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
  await click(browserState.page, button('Needs you'));
  const roundA = await driveReviewRound(
    browserState.page,
    'A',
    'Annotate exact installed revision A',
    root,
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
  );
  await until(() => model.state.phase === 'waiting-c' || model.state.modelError,
    'same owner revision C request', 45_000);
  if (model.state.modelError) throw new Error(model.state.modelError);
  await click(browserState.page, button('Back'));
  await click(browserState.page, button('All requests'));
  const approval = await driveApproval(browserState.page);
  await until(() => model.state.phase === 'complete' || model.state.modelError,
    'current revision C owner approval acknowledgment', 45_000);
  if (model.state.modelError) throw new Error(model.state.modelError);
  await until(async () => !(await host.session.rpc.metadata.isProcessing()).processing,
    'installed Review session idle', 30_000);
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
  const finalScreenshot = await screenshot(browserState.page, 'installed-review-final');
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
  });
  await browserState.page.send('Page.navigate', { url: 'about:blank' });
  await closeInstalledHost(host);
  await closeServer(model.server);

  // Installed negative controls: exact permission, missing acknowledgment,
  // same-provider Canvas reopen, provider replacement, cancellation, outside
  // input, and uncertain capture without replay.
  const controlsRoot = path.join(RUN, 'installed-controls');
  const controlsRelease = buildRelease({
    repoRoot: ROOT,
    outDir: controlsRoot,
    ref: 'v0.0.0-t012',
  });
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
  const uncertainRelease = buildRelease({
    repoRoot: ROOT,
    outDir: uncertainRoot,
    ref: 'v0.0.0-t012',
  });
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
  process.exitCode = 1;
} finally {
  for (const host of hosts.reverse()) {
    if (!host.record.cleanup.sessionDisconnected) {
      await closeInstalledHost(host);
    }
  }
  for (const server of modelServers) {
    if (server.listening) await closeServer(server);
  }
  if (browserState) {
    browserState.page.close();
    await stopBrowser(browserState.browser);
    manifest.cleanup.uiBrowserStillRunning = Boolean(
      browserState.browser.pid && processRow(browserState.browser.pid),
    );
  }
  manifest.endedAt = new Date().toISOString();
  manifest.cleanup.approvedMockRechecked = Object.entries(APPROVED_HASHES).every(
    ([relative, expected]) => sha256(sourceBytes(relative)) === expected,
  );
  fs.writeFileSync(path.join(RUN, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    result: manifest.result,
    exitCode: manifest.exitCode,
    run: RUN,
    blankCases: manifest.blankCases.length,
    reviewSubmissions: manifest.reviewCase?.model?.rounds?.map((entry) => entry.submissionId) ?? [],
    error: manifest.error ?? null,
  })}\n`);
}

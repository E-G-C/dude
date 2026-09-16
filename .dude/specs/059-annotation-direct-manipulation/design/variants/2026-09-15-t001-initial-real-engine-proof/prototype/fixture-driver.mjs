// @ts-check
// Design-only loopback fixture driver for feature 059.
//
// What it is: a transport. It creates a disposable fixture workspace, runs the
// UNCHANGED real Needs You provider (createNeedsYou) and Review adapter
// (createReview) over it, publishes one real preview request, and serves the
// same fixed routes the production Canvas server serves, so the actual
// ReviewWorkspace and mountReview owner run against real open/save/seal/respond
// operations.
//
// What it maps: `/` to this design's canonical HTML, `/design/*` to the
// design-local bundle, and the fixed `/review/*` module and style requests to
// the exact design-local copies under prototype/review/. Everything else is the
// real provider's own answer.
//
// What it does not do: it does not weaken a guard. The loopback host/Origin
// rule is the production `isTrustedRequest` function itself, the same-origin
// POST rule, opaque-sandbox read exception, CSP, `nosniff`, and `no-store`
// headers are the production ones, and the reviewed child keeps the adapter's
// own sandboxed CSP. No response here is manufactured: the provider either
// answers or its error reaches the UI.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_ROOT = path.resolve(HERE, '..');
const REPOSITORY_ROOT = path.resolve(DESIGN_ROOT, '..', '..', '..', '..');
const EXTENSION_LIB = path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'lib');
const FIXTURE_CONTENT = path.join(DESIGN_ROOT, 'fixtures', 'reviewed-content');

/** Exactly the production review asset routes, mapped to the design copies. */
const REVIEW_ROUTES = Object.freeze({
  '/review/engine.mjs': ['engine.mjs', 'text/javascript; charset=utf-8'],
  '/review/geometry.mjs': ['geometry.mjs', 'text/javascript; charset=utf-8'],
  '/review/shapes.mjs': ['shapes.mjs', 'text/javascript; charset=utf-8'],
  '/review/inspector.mjs': ['inspector.mjs', 'text/javascript; charset=utf-8'],
  '/review/panel.mjs': ['panel.mjs', 'text/javascript; charset=utf-8'],
  '/review/capture.mjs': ['capture.mjs', 'text/javascript; charset=utf-8'],
  '/review/bridge.mjs': ['bridge.mjs', 'text/javascript; charset=utf-8'],
  '/review/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/review/NOTICE.txt': ['NOTICE.txt', 'text/plain; charset=utf-8'],
});
const DESIGN_ROUTES = Object.freeze({
  '/design/host.js': ['prototype/assets/host.js', 'text/javascript; charset=utf-8'],
  '/design/host.js.LEGAL.txt': ['prototype/assets/host.js.LEGAL.txt', 'text/plain; charset=utf-8'],
});

const sha256 = value => createHash('sha256').update(value).digest('hex');

function sendJson(res, status, value) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('invalid_input'), { code: 'invalid_input', status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** The reviewed content this proof declares: stable files, copied as bytes. */
function seedWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-059-design-fixture-'));
  const root = path.join(directory, 'workspace');
  const number = '701', slug = 'direct-manipulation-fixture';
  const specDirectory = `.dude/specs/${number}-${slug}`;
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  const specPath = `${specDirectory}/spec.md`;
  const write = (relative, bytes) => {
    const absolute = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, bytes);
  };
  const assets = ['mock.css', 'logo.svg'];
  const artifactPath = `${specDirectory}/design/mock.html`;
  write(artifactPath, fs.readFileSync(path.join(FIXTURE_CONTENT, 'mock.html')));
  for (const name of assets) write(`${specDirectory}/design/${name}`, fs.readFileSync(path.join(FIXTURE_CONTENT, name)));
  write(specPath, ['---', `title: ${slug}`, `preview_path: ${artifactPath}`, '---', '', `# ${slug}`, ''].join('\n'));
  write(`${specDirectory}/tasks.md`, '- [ ] T001@aaaaaaaa Fixture review target\n');
  write(ideaPath, ['---', `title: ${slug}`, `slug: ${slug}`, 'status: defined', `spec_path: ${specPath}`,
    '---', '', '## Idea', '', 'Stable reviewed content for the 059 design proof.', ''].join('\n'));
  const revision = relative => `sha256:${sha256(fs.readFileSync(path.join(root, ...relative.split('/'))))}`;
  return {
    directory, root, ideaPath, specPath, specDirectory, artifactPath,
    scope: { kind: 'feature', ideaPath, specPath },
    preview: {
      artifact: { path: artifactPath, revision: revision(artifactPath) },
      assets: assets.map(name => ({ path: `${specDirectory}/design/${name}`, revision: revision(`${specDirectory}/design/${name}`) })),
    },
    close() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}

/**
 * Start the fixture review and its transport.
 * @param {{prompt?:string}} [options]
 */
export async function startFixtureDriver(options = {}) {
  const [{ createNeedsYou }, { createReview }, { isTrustedRequest }] = await Promise.all([
    import(path.join(EXTENSION_LIB, 'needs-you.mjs')),
    import(path.join(EXTENSION_LIB, 'review.mjs')),
    import(path.join(EXTENSION_LIB, 'canvas-server.mjs')),
  ]);
  const workspace = seedWorkspace();
  const adapter = createReview({ root: workspace.root });
  const provider = createNeedsYou({ root: workspace.root, reviewAdapter: adapter });
  const session = {
    sessionId: `design-059-session-${randomUUID()}`,
    // No fixture delivery invents an owner. Anything that would need a joined
    // agent fails loudly instead of reporting a success that never happened.
    send: async () => { throw new Error('No agent is joined to this design fixture; nothing was sent.'); },
    rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }) } },
  };
  provider.bindSession(/** @type {any} */ (session));
  const controller = new AbortController();
  const request = {
    owner: 'dude-spec-lead',
    requestRef: 'design-059-direct-manipulation',
    scope: workspace.scope,
    source: { kind: 'file', path: workspace.ideaPath, revision: `sha256:${sha256(fs.readFileSync(path.join(workspace.root, ...workspace.ideaPath.split('/'))))}` },
    revision: 'design-059-fixture-revision',
    class: 'preview',
    prompt: options.prompt ?? 'Fixture review for the 059 direct-manipulation design proof.',
    whyHuman: 'Pointer behaviour has to be exercised by a person or a real pointer harness.',
    unblocks: 'The 059 design owner can judge the proposed interaction.',
    blocking: true,
    fields: workspace.preview,
  };
  const toolResult = provider.tool.handler({ op: 'request', request }, {
    sessionId: session.sessionId,
    toolName: 'dude_needs_you',
    toolCallId: `design-059-tool-${randomUUID()}`,
    signal: controller.signal,
  });
  const deadline = Date.now() + 10_000;
  let record = null;
  while (!record && Date.now() < deadline) {
    record = provider.read().requests.find(entry => entry.request.requestRef === request.requestRef && entry.phase === 'pending') ?? null;
    if (!record) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(record, 'the fixture provider published its pending review request');

  const file = relative => fs.readFileSync(path.join(DESIGN_ROOT, relative));
  const server = http.createServer();
  let origin = '';
  server.on('request', (req, res) => {
    void (async () => {
      const { pathname } = new URL(req.url ?? '/', origin || 'http://127.0.0.1/');
      // Production rule, imported rather than restated: loopback host, no
      // cross-site fetch metadata, no foreign Origin. The opaque review frame
      // reads only exact review resources, exactly as the Canvas server allows.
      const sandboxRead = req.method === 'GET' && (!req.headers.origin || req.headers.origin === 'null')
        && (Object.hasOwn(REVIEW_ROUTES, req.url ?? '') || /^\/review-source\/[a-f0-9-]{36}\/[^?#]+$/.test(req.url ?? ''));
      if ((!isTrustedRequest(req) && !sandboxRead) || req.headers.host !== new URL(origin).host) {
        sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
        return;
      }
      try {
        if (req.method === 'GET' && req.url === pathname && pathname.startsWith('/review-source/')) {
          const match = /^\/review-source\/([a-f0-9-]{36})\/(.+)$/.exec(pathname);
          if (!match) { sendJson(res, 404, { error: 'Not found.' }); return; }
          const resource = await provider.readReviewResource(match[1], pathname, { signal: controller.signal, origin });
          res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': resource.mime,
            'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*',
            ...(resource.csp ? { 'Content-Security-Policy': resource.csp } : {}) });
          res.end(resource.bytes);
          return;
        }
        if (req.method === 'GET' && pathname === '/api/needs-you' && req.url === pathname) {
          sendJson(res, 200, await provider.refresh());
          return;
        }
        if (req.method === 'GET' && pathname === '/api/needs-you/review/history') {
          const query = new URL(req.url ?? '', origin).searchParams;
          sendJson(res, 200, await provider.readReviewHistory({
            scope: { kind: 'feature', ideaPath: query.get('ideaPath'), specPath: query.get('specPath') },
            ...(query.has('submissionId') ? { submissionId: query.get('submissionId') } : {}),
          }, { signal: controller.signal }));
          return;
        }
        if (req.method === 'POST' && ['/api/needs-you/respond', '/api/needs-you/review/open',
          '/api/needs-you/review/save', '/api/needs-you/review/seal'].includes(pathname) && req.url === pathname) {
          if (req.headers.origin !== origin) { sendJson(res, 403, { error: 'Same-origin action required.' }); return; }
          if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
            sendJson(res, 415, { error: 'JSON action required.' });
            return;
          }
          const body = await readJsonBody(req, 8 * 1024 * 1024);
          const reviewOptions = { signal: controller.signal, origin };
          const result = pathname === '/api/needs-you/review/open' ? await provider.openReview(body, reviewOptions)
            : pathname === '/api/needs-you/review/save' ? await provider.saveReview(body, reviewOptions)
              : pathname === '/api/needs-you/review/seal' ? await provider.sealReview(body, reviewOptions)
                : await provider.respond(body, { signal: controller.signal });
          sendJson(res, 202, result);
          return;
        }
        const asset = pathname === '/' ? ['review-direct-manipulation.html', 'text/html; charset=utf-8']
          : Object.hasOwn(DESIGN_ROUTES, pathname) ? DESIGN_ROUTES[pathname]
            : Object.hasOwn(REVIEW_ROUTES, pathname) && req.url === pathname
              ? [path.join('prototype', 'review', REVIEW_ROUTES[pathname][0]), REVIEW_ROUTES[pathname][1]] : null;
        if (req.method === 'GET' && asset) {
          const bytes = file(asset[0]);
          res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': asset[1],
            // The parent's policy also bounds an opaque review frame's self-navigation.
            'Content-Security-Policy': `frame-src ${origin}/review-source/`,
            ...(pathname.startsWith('/review/') ? { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } : {}) });
          res.end(bytes);
          return;
        }
        sendJson(res, 404, { error: 'Not found.' });
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : error?.code ? 400 : 500;
        if (res.headersSent) res.end();
        else sendJson(res, status, { error: error?.code ?? 'request_failed', message: error?.message ?? 'Request failed.' });
      }
    })();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  origin = `http://127.0.0.1:${address.port}`;

  let closed = false;
  return {
    origin,
    url: `${origin}/`,
    workspace,
    provider,
    adapter,
    record,
    /** The working file the real adapter writes for a submission. */
    readWorking(submissionId) {
      return JSON.parse(fs.readFileSync(path.join(workspace.root, ...workspace.specDirectory.split('/'),
        'reviews', submissionId, 'working.json'), 'utf8'));
    },
    async close() {
      if (closed) return;
      closed = true;
      controller.abort();
      await new Promise(resolve => server.close(() => resolve(undefined)));
      provider.dispose();
      await Promise.allSettled([toolResult]);
      workspace.close();
    },
  };
}

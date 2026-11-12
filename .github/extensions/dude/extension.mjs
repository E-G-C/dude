// @ts-check
/**
 * Dude canvas extension.
 *
 * Registers the single `dude` canvas, opens it on a loopback server, reads one
 * authoritative projection, serves the work and Needs You workspace, and
 * closes cleanly. The joined provider owns bounded human and pack handoffs;
 * its existing tool also receives correlated owner results, never pack writes.
 *
 * The joined SDK comes only through the fixed extension loader
 * (./lib/a2a-sdk-loader.mjs): it resolves the public
 * `@github/copilot-sdk/extension` specifier, inspects that exact artifact, and
 * imports the same resolved URL. When the loader refuses, this extension does
 * not join; there is no other SDK path or fallback. The session is joined
 * exactly once, with no permission handler and no tool filter.
 *
 * Agent2Agent communication is off by default: it observes this one session's
 * events and registers its propose, ask, receive, reply, verify, and
 * conversation tools. Proposal preparation returns the complete native tool
 * result, but starts no listener, loads no worker SDK or A2A runtime, runs no
 * command, and sends nothing. Only the owner's exact next eligible local chat
 * approval can activate it. A conversation records into a bounded local
 * journal under `.dude/state/a2a/`, opened only when an approved conversation
 * begins and before anything is admitted, sent, or given to a worker; a begin
 * refuses when it cannot be opened. The provider receives this extension's
 * joined-loader provenance and process ID, which a served worker records with
 * its readiness; it receives no session or permission handler.
 *
 * Wiring only; the loopback server lives in ./lib/canvas-server.mjs and the
 * browser entry in ./ui/index.html. `stdout` is reserved for JSON-RPC, so
 * user-visible content uses native tool results or `session.log`.
 *
 * One update controller (./lib/bundle-upgrade.mjs) serves every Canvas instance
 * of this process. Making it starts nothing; once the session has joined, its
 * session-start release check runs in the background, never holding the join,
 * and it creates no folder, preference, request, waiter or chat message.
 *
 * One GitHub sign-in controller (./lib/github-session.mjs) serves every Canvas
 * instance too, holding this session's optional public GitHub access in memory.
 * Making it asks GitHub nothing; only an explicit Sign in in Canvas starts one,
 * and the session's end forgets it. The join requests no environment variable,
 * so the app's own GitHub token is never read.
 */

import { createA2a } from './lib/a2a.mjs';
import { loadExtensionSdk } from './lib/a2a-sdk-loader.mjs';
import { createBundleUpgrade } from './lib/bundle-upgrade.mjs';
import { closeInstance, openInstance } from './lib/canvas-server.mjs';
import { createGitHubSession } from './lib/github-session.mjs';
import { createNeedsYou } from './lib/needs-you.mjs';
import { createReview } from './lib/review.mjs';

const joined = await loadExtensionSdk();
if (typeof joined.api.createCanvas !== 'function' || typeof joined.api.joinSession !== 'function') {
  throw new Error('The loaded extension SDK has no createCanvas or joinSession; this extension does not join.');
}
const { createCanvas, joinSession } = /** @type {typeof import('@github/copilot-sdk/extension')} */ (/** @type {unknown} */ (joined.api));
const root = process.cwd();
const needsYou = createNeedsYou({ root, reviewAdapter: createReview({ root }) });
const a2a = createA2a({ root, extension: { loader: joined.provenance, pid: process.pid } });
// Made before the join, like the other providers, so a Canvas opened at any
// moment gets it; it does nothing until `startSessionCheck` below.
const updates = createBundleUpgrade({ root });
const githubSession = createGitHubSession();

/** @param {unknown} context */
function exactTarget(context) {
  if (!context || typeof context !== 'object') return undefined;
  const input = /** @type {{ input?: unknown }} */ (context).input;
  if (!input || typeof input !== 'object') return undefined;
  const target = /** @type {{ target?: unknown }} */ (input).target;
  return typeof target === 'string' ? target : undefined;
}

/**
 * Logging is evidence, never a reason to fail canvas lifecycle requests.
 * @param {string} message
 */
async function logToSession(message) {
  try {
    await session.log(message);
  } catch {
    // The canvas remains usable when session logging is unavailable.
  }
}

/**
 * Needs You handles every event first, exactly as before, and its errors still
 * propagate. A2A then observes the same event; its handler never throws, so it
 * can neither suppress nor replace a Needs You result or error. The session's
 * end then ends the GitHub sign-in, which never throws either.
 * @param {import('@github/copilot-sdk').SessionEvent} event
 */
function onEvent(event) {
  try {
    needsYou.onEvent(event);
  } finally {
    a2a.onEvent(event);
    if (event.type === 'session.shutdown' && !event.agentId) githubSession.end();
  }
}

const session = await joinSession({
  tools: [needsYou.tool, ...a2a.tools],
  onEvent,
  canvases: [
    createCanvas({
      id: 'dude',
      displayName: 'Dude',
      description: 'Discover recorded work, respond to current owner requests, review canonical designs, and request owner-confirmed pack changes.',
      open: async (ctx) => {
        const target = exactTarget(ctx);
        const readInput = { root, ...(target === undefined ? {} : { target }) };
        const instance = await openInstance(
          ctx.instanceId,
          logToSession,
          null,
          readInput,
          needsYou,
          updates,
          githubSession,
        );
        await logToSession(`Dude canvas ${ctx.instanceId}: open at ${instance.url}`);
        return { title: 'Dude', status: 'Work and Needs you', url: instance.url };
      },
      onClose: async (ctx) => {
        if (await closeInstance(ctx.instanceId)) {
          await logToSession(`Dude canvas ${ctx.instanceId}: closed.`);
        }
      },
    }),
  ],
});
needsYou.bindSession(session);
a2a.bindSession(session);
// Not awaited: joining is complete, and the check reports only through Canvas.
void updates.startSessionCheck();

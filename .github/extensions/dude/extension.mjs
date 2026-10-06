// @ts-check
/**
 * Dude canvas extension.
 *
 * Registers the single `dude` canvas, opens it on a loopback server, reads one
 * authoritative projection, serves the work and Needs You workspace, and
 * closes cleanly. The joined provider owns bounded human and pack handoffs;
 * its existing tool also receives correlated owner results, never pack writes.
 * Agent2Agent communication is off by default: it observes this one session's
 * events and registers its propose, ask, receive, reply, and verify tools. Proposal
 * preparation returns the complete native tool result, but starts no
 * listener, loads no SDK runtime, runs no command, and sends nothing. Only
 * the owner's exact next eligible local chat approval can activate it.
 *
 * Wiring only; the loopback server lives in ./lib/canvas-server.mjs and the
 * browser entry in ./ui/index.html. `stdout` is reserved for JSON-RPC, so
 * user-visible content uses native tool results or `session.log`.
 */

import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { createA2a } from './lib/a2a.mjs';
import { closeInstance, openInstance } from './lib/canvas-server.mjs';
import { createNeedsYou } from './lib/needs-you.mjs';
import { createReview } from './lib/review.mjs';

const root = process.cwd();
const needsYou = createNeedsYou({ root, reviewAdapter: createReview({ root }) });
const a2a = createA2a({ root });

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
 * can neither suppress nor replace a Needs You result or error.
 * @param {import('@github/copilot-sdk').SessionEvent} event
 */
function onEvent(event) {
  try {
    needsYou.onEvent(event);
  } finally {
    a2a.onEvent(event);
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

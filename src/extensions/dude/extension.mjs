// @ts-check
/**
 * Dude canvas extension.
 *
 * Registers the single `dude` canvas, opens it on a loopback server, reads one
 * authoritative projection, serves the work and Needs You workspace, and
 * closes cleanly. The joined provider owns bounded human handoffs.
 *
 * Wiring only; the loopback server lives in ./lib/canvas-server.mjs and the
 * browser entry in ./ui/index.html. `stdout` is reserved for JSON-RPC, so
 * everything user-visible goes through `session.log`.
 */

import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { closeInstance, openInstance } from './lib/canvas-server.mjs';
import { createNeedsYou } from './lib/needs-you.mjs';
import { createReview } from './lib/review.mjs';

const root = process.cwd();
const needsYou = createNeedsYou({ root, reviewAdapter: createReview({ root }) });

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

const session = await joinSession({
  tools: [needsYou.tool],
  onEvent: needsYou.onEvent,
  canvases: [
    createCanvas({
      id: 'dude',
      displayName: 'Dude',
      description: 'Discover recorded work, respond to current owner requests, and review canonical designs.',
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

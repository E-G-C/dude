// @ts-check
/**
 * Dude canvas extension.
 *
 * Registers the single `dude` canvas, opens it on a loopback server, reads one
 * authoritative projection, and closes cleanly. The route set remains private
 * and read-only and sends no session request.
 *
 * Wiring only; the loopback server lives in ./lib/canvas-server.mjs and the
 * placeholder page in ./ui/index.html. `stdout` is reserved for JSON-RPC, so
 * everything user-visible goes through `session.log`.
 */

import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { closeInstance, openInstance } from './lib/canvas-server.mjs';

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
  canvases: [
    createCanvas({
      id: 'dude',
      displayName: 'Dude',
      description: 'Dude workspace canvas. Currently an internal read-only projection.',
      open: async (ctx) => {
        const root = process.cwd();
        const target = exactTarget(ctx);
        const readInput = { root, ...(target === undefined ? {} : { target }) };
        const instance = await openInstance(
          ctx.instanceId,
          logToSession,
          null,
          readInput,
        );
        await logToSession(`Dude canvas ${ctx.instanceId}: open at ${instance.url}`);
        return { title: 'Dude', status: 'Read-only Now projection', url: instance.url };
      },
      onClose: async (ctx) => {
        if (await closeInstance(ctx.instanceId)) {
          await logToSession(`Dude canvas ${ctx.instanceId}: closed.`);
        }
      },
    }),
  ],
});

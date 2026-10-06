// @ts-check
/**
 * The complete A2A runtime surface Dude bundles from its pinned dependencies.
 * `scripts/dude-a2a/build.mjs` builds this file into
 * `src/extensions/dude/lib/a2a-runtime.mjs`; the extension imports that
 * generated module lazily, only after a local A2A activation.
 *
 * Keep this list to what `lib/a2a-transport.mjs` uses. The v0.3 compatibility
 * layer, gRPC, REST, and task-store modules are deliberately not exported.
 */
export { default as express } from 'express';
export { agentCardHandler, jsonRpcHandler } from '@a2a-js/sdk/server/express';
export { JsonRpcTransportFactory } from '@a2a-js/sdk/client';
export {
  A2A_PROTOCOL_VERSION,
  A2A_VERSION_HEADER,
  AGENT_CARD_PATH,
  Role,
} from '@a2a-js/sdk';
export {
  A2AError,
  ContentTypeNotSupportedError,
  ExtendedAgentCardNotConfiguredError,
  PushNotificationNotSupportedError,
  RequestMalformedError,
  UnsupportedOperationError,
  VersionNotSupportedError,
  toJsonRpcError,
} from '@a2a-js/sdk/errors';

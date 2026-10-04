---
name: dude-pack-a2a-javascript
description: "Use when a request concerns the official `@a2a-js/sdk`, TypeScript or JavaScript A2A client/server design, transport selection, streaming, polling, push, cancellation, authentication, prerequisites, examples, or SDK/protocol compatibility."
argument-hint: "the JavaScript or TypeScript A2A question, runtime, transport, and target wire version"
---

# A2A JavaScript SDK

## Purpose

Apply source-backed JavaScript and TypeScript SDK guidance without implying that
the SDK is installed or an integration works. This optional-pack skill provides
advice only; it adds no npm dependency, server, client, or network activity to
Dude.

## Procedure

1. Establish whether the task needs a client, server, or both. Record the
   target A2A wire version, Node.js version and deployment environment,
   selected transport, streaming/polling/push needs, authentication model, and
   cancellation behavior.
2. Check the version boundary before recommending APIs:
   - the inspected package and release are `@a2a-js/sdk` 1.2.0;
   - package metadata requires Node.js 20 or newer and declares Apache-2.0;
   - the inspected README says the SDK implements A2A specification v1.0.0;
   - the protocol repository separately has release v1.0.1; and
   - the retained sources do not prove SDK 1.2.0 compatibility with every
     v1.0.1 repository change.
3. Map the task to the documented entry points and transport constraints below.
   Use the [protocol skill](../dude-pack-a2a-protocol/SKILL.md) for normative
   message, task, discovery, lifecycle, and security semantics.
4. Separate source facts, recommendations, and checks actually executed. Never
   describe a linked example as run, a package as installed, or an endpoint as
   reachable without corresponding evidence.
5. Return the proposed client/server shape, version and source basis,
   prerequisites, transport and security choices, official example links, and
   unverified limits. Route implementation, execution, installation, and
   permission needs through the coordinator and current owners.

For an explicit source refresh or another-language request, use the
[shared maintenance and onboarding procedures](../dude-pack-a2a-protocol/references/maintenance.md).
Do not duplicate or bypass them here.

## Package and transport facts

The base package is a source fact, not a dependency of this Dude pack. Install
only the SDK and adapters selected by the authorized application.

| Choice | Documented SDK support | Additional constraint |
| --- | --- | --- |
| JSON-RPC | Client and server; HTTP with Server-Sent Events for streaming | Express-based server adapters use the optional `express` peer dependency |
| HTTP+JSON/REST | Client and server; HTTP with Server-Sent Events for streaming | Express-based server adapters use the optional `express` peer dependency |
| gRPC | Client and server with server streaming | Node.js only; gRPC imports require the optional `@grpc/grpc-js` and `@bufbuild/protobuf` peer dependencies |

The SDK also exposes an opt-in v0.3 compatibility layer. It is not enabled by
default, does not change the v1.0.0 README target, and is not a selected
integration for this guidance. Use it only after a task explicitly requires a
v0.3 peer and its migration, field-loss, operation, and security limits have
been reviewed.

## Client responsibilities

- `ClientFactory.createFromUrl(...)` retrieves an Agent Card and selects a
  matching registered transport from its supported interfaces and transport
  preferences. `createFromAgentCard(...)` starts from a card already obtained
  by the application. The documented transport factories are
  `JsonRpcTransportFactory`, `RestTransportFactory`, and, for Node.js gRPC,
  `GrpcTransportFactory`; select only what the application requires.
- The documented client surface includes `sendMessage`,
  `sendMessageStream`, `getTask`, `cancelTask`, and push-notification
  configuration methods. Per-call request options support an abort signal,
  service parameters such as HTTP headers, and caller context.
- Poll with `getTask` when periodic status checks are acceptable. Consume
  `sendMessageStream(...)` as an async generator for task, status, and artifact
  events. Configure push only when the remote Agent Card advertises it and the
  application can secure a webhook receiver.
- The SDK documents `AuthenticationHandler` and
  `createAuthenticatingFetchWithRetry` for client credential attachment and
  retry after authentication challenges. The application still owns credential
  acquisition, storage, authorization scope, disclosure, and retry policy.

Validate an Agent Card and its declared interfaces before sending work.
Automatic transport selection is not authorization to call an endpoint.

## Server responsibilities

- Implement `AgentExecutor` as application business logic. It receives a
  `RequestContext` and publishes messages, task status, and artifacts through
  an `ExecutionEventBus`.
- `DefaultRequestHandler` coordinates protocol requests, task storage,
  cancellation, and push notifications. The Express `jsonRpcHandler` and
  `restHandler` adapters, or the Node-only `grpcService` adapter, can expose the
  same handler.
- `TaskStore`, `ExecutionEventBus`, and `ExecutionEventBusManager` are
  injectable. Select production persistence and event delivery deliberately;
  the in-process defaults do not establish application durability.
- To support cancellation, the executor implements its cancellation path,
  observes cancellation while working, and publishes a canceled terminal
  status. A client request alone does not prove the work stopped.
- Server authentication is application middleware. The README's Express
  example uses a `UserBuilder` to make the authenticated user available in the
  request context; the application must still enforce authorization on every
  task and operation.

## Official examples

Use these as source references rather than copying them into guidance or
claiming they were executed:

- [all SDK samples at the inspected revision](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples)
- [minimal streaming agent](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/sample-agent)
- [multi-transport agent](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/multi-transport-agent)
- [cancellable agent](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/cancellable-agent)
- [push-notification agent](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/agents/push-notification-agent)
- [server authentication](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/authentication)
- [client interceptors and per-call cancellation](https://github.com/a2aproject/a2a-js/tree/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/src/samples/client/interceptors)

## Source basis

| Topic | Official source | Revision or release | Checked (UTC) | Version scope and limit |
| --- | --- | --- | --- | --- |
| Package identity, runtime, license, exports, and peer dependencies | [package metadata](https://github.com/a2aproject/a2a-js/blob/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/package.json) | `e0cdc9141ded14d3e787c400a7729b2c2360d3d3`; package 1.2.0 | 2026-09-21T15:16:30Z | `@a2a-js/sdk` 1.2.0, Node >=20, Apache-2.0; metadata inspection only |
| Client/server entry points, transports, streaming, cancellation, authentication, v0.3 opt-in, and examples | [SDK README](https://github.com/a2aproject/a2a-js/blob/e0cdc9141ded14d3e787c400a7729b2c2360d3d3/README.md) | `e0cdc9141ded14d3e787c400a7729b2c2360d3d3`; README wire target v1.0.0 | 2026-09-21T15:16:30Z | Documented SDK behavior and examples; no sample or interoperability execution |
| Current SDK release | [a2a-js v1.2.0](https://github.com/a2aproject/a2a-js/releases/tag/v1.2.0) | v1.2.0, published 2026-09-18T08:28:17Z | 2026-09-21T15:16:30Z | Release identity and notes for SDK 1.2.0 |
| Normative protocol comparison | [v1.0.0-labeled specification at the inspected commit](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md) and [protocol repository release v1.0.1](https://github.com/a2aproject/A2A/releases/tag/v1.0.1) | `afda8316c64951a2ecb2a0d3d10867405d2b4095`; repository release v1.0.1 | 2026-09-21T15:16:27Z | Specification semantics are labeled v1.0.0; retained evidence does not establish SDK 1.2.0 compatibility with the separate v1.0.1 repository release |

## Boundaries

- A2A agents remain opaque. The SDK cannot reveal another Dude session's hidden
  memory, tools, local files, or internal subagent calls.
- An SDK `Task` does not claim Dude work, update Beads, approve review, mark
  completion, resume stopped Work, or grant takeover or code-integration
  authority.
- Do not connect to a live endpoint, run an SDK sample, install dependencies,
  expose a server, or change application code without separate runtime and
  implementation authorization.
- Report unsupported versions, unavailable evidence, stale installed guidance,
  and security policy gaps instead of inventing compatibility or escalating
  permission.

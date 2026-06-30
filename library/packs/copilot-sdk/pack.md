---
name: copilot-sdk
description: "GitHub Copilot SDK specialist for SDK app architecture, hooks, custom agents, MCP, skills, authentication, deployment, and Rust integration."
provides:
  agents:
    - dude-pack-copilot-sdk-specialist
  skills: []
---

# Copilot SDK Pack

A specialist agent for building on the GitHub Copilot SDK.

## Provides

- `dude-pack-copilot-sdk-specialist` — Copilot SDK app architecture and
  integration design: session lifecycle, streaming, hooks, custom tools,
  event handling, custom agents, skills, MCP integration, queueing and
  steering, authentication, deployment patterns, and Rust integration via
  copilot-community-sdk / copilot-sdk-rust.

## Install / remove

```bash
@dude add pack copilot-sdk
@dude remove pack copilot-sdk
```

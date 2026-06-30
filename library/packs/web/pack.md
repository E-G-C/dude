---
name: web
description: "Backend and frontend specialist agents for web application work (APIs, services, persistence + UI, components, accessibility)."
provides:
  agents: [dude-pack-web-backend, dude-pack-web-frontend]
  skills: []
routing_hints:
  api: "@dude-pack-web-backend"
  endpoint: "@dude-pack-web-backend"
  database: "@dude-pack-web-backend"
  auth: "@dude-pack-web-backend"
  ui: "@dude-pack-web-frontend"
  component: "@dude-pack-web-frontend"
  accessibility: "@dude-pack-web-frontend"
  styling: "@dude-pack-web-frontend"
hooks:
  - routing
---

# Web Pack

Adds backend and frontend implementation specialists for web application work.
Install when a project has both server-side and UI concerns; a docs-only or
single-language project does not need it.

## Provides

- `@dude-pack-web-backend` — APIs, endpoints, services, persistence, auth,
  integrations, server-side implementation.
- `@dude-pack-web-frontend` — UI, components, interaction behavior,
  accessibility, presentation-layer implementation.

## Routing

When installed, implementation requests route by concern: server / data / auth →
backend; UI / component / accessibility → frontend. Mixed work splits into
independent tasks per the core routing tie-breakers.

## Install / remove

```bash
@dude add pack web
@dude remove pack web
```

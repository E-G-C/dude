---
name: a2a
description: "Optional catalog source for A2A protocol and JavaScript SDK guidance."
use-cases: [software-development]
provides:
  agents: [dude-pack-a2a-javascript-specialist]
  skills: [dude-pack-a2a-javascript, dude-pack-a2a-protocol]
---

# A2A Pack

This source entry establishes an optional pack for source-backed Agent2Agent
(A2A) protocol and JavaScript SDK advice. Its complete planned provider set is
present in catalog source: one read-only leaf advisor and two knowledge skills.
The pack is not installed or active in this repository's dogfood profile. Full
test and Compose verification, disposable-root discovery, and actual advice use
remain pending.

## Provider status

The catalog source contains:

- `dude-pack-a2a-javascript-specialist`, a non-user-invocable leaf advisor with
  `read` and `search` tools and the `reasoning` model class;
- `dude-pack-a2a-protocol`, including the
  [shared maintenance procedure](skills/dude-pack-a2a-protocol/references/maintenance.md)
  for source refresh and task-driven evaluation of another language; and
- `dude-pack-a2a-javascript`.

The initial pack remains limited to these three providers. The maintenance
procedure supports bounded source refresh and task-driven evaluation of another
language; it neither adds another language provider nor establishes a scheduled
cadence.

## Availability boundary

Catalog source and installed availability are separate. Discovery can list this
manifest for the `software-development` use case without installing it. In an
uncomposed root, `installed: false` means the source entry exists but its
capability is not active. All three providers remain catalog source artifacts
here until Compose installs them into a host. Their authored profile and static
metadata describe the intended read/search boundary; they do not prove an
enforced sandbox, installed discovery, or actual advice use. No SDK or sample
has been installed or executed.

`build-dev` preserves installed packs but does not install catalog packs. Once
A2A validation reaches the use-proof stage, it must use an explicit throwaway
root in this sequence: Compose add, rebuild, fresh discovery, and an actual
advice request. Do not install this pack into this repository's live profile.

This optional source adds no runtime A2A dependency, interpreted hook, client
or server, network activity, hidden-session access, remote-execution or
work-state authority, updater, or maintenance cadence. Core behavior remains
independent of the pack.

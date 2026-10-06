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
The pack is installed in this repository's dogfood profile by explicit opt-in
to support Feature 068. A fresh supported Copilot host session discovered and
selected the installed advisor without making a model or advice call. That
result does not prove that an already-running chat hot-reloaded its tool
catalog. An existing chat may require a reload to discover a changed agent catalog.
Compose verification covered all 19 catalog packs with 56 warnings, no
failures, and no leftovers. A JavaScript-only disposable install preserved its
four generated A2A files and profile through `build-dev`, then demonstrated
fresh advisor discovery and selection, direct guidance reads, and three real
responses: protocol guidance, JavaScript guidance, and refusal of an excluded
request. The independent advice review accepted the bounded guidance and
refusal as useful evidence. Both disposable validation installations were
removed afterward, before this separate live opt-in.

## Provider status

The catalog source contains:

- `dude-pack-a2a-javascript-specialist`, a non-user-invocable leaf advisor with
  `read` and `search` tools and the `reasoning` model class;
- `dude-pack-a2a-protocol`, including the
  [shared maintenance procedure](skills/dude-pack-a2a-protocol/references/maintenance.md)
  for source refresh and task-driven evaluation of another language; and
- `dude-pack-a2a-javascript`.

The installed pack remains limited to these three providers. No other language
source was delivered. The maintenance procedure supports bounded source
refresh and task-driven evaluation of another language; it neither adds another
language provider nor establishes a scheduled cadence. Feature 068's scope
choices remain unanswered or deferred; installing the pack neither completes
its definition nor starts implementation.

## Availability boundary

Catalog source and installed availability are separate. Discovery can list this
manifest for the `software-development` use case without installing it. In an
uncomposed root, `installed: false` means the source entry exists but its
capability is not active. All three providers remain catalog source artifacts
and are now also projected into this repository's dogfood profile through
normal Compose. This live projection is separate from the removed disposable
installs above. Their authored profile and static metadata describe the
intended read/search boundary, but do not prove an enforced sandbox or runtime
model fidelity. The disposable checks did not run an A2A SDK sample or exercise
A2A client, server, or endpoint interoperability.

`build-dev` preserves installed packs but does not install catalog packs. The
observed use-proof sequence used a disposable root: Compose add, rebuild, fresh
discovery, actual advice requests, and Compose remove. Repeat this validation
only in an explicit throwaway root. Keep authoring in `library/packs/a2a/` and
never edit installed projections. The explicit A2A dogfood exception does not
permit other catalog packs here or bypass the normal gates for future Compose
add, refresh, or remove operations.

This optional source adds no runtime A2A dependency, interpreted hook, client
or server, network activity, hidden-session access, remote-execution or
work-state authority, updater, or maintenance cadence. Core behavior remains
independent of the pack.

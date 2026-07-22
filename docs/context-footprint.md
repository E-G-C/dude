# Static Context Footprint Evidence

## Measurement Boundary

This document records a deterministic **bundle-controlled static
prompt/context source footprint proxy**. It measures only the ordered source
files declared in `scripts/prompt-audit-profiles.json`. It does not identify
actual host prompt membership, active runtime context, or runtime token use.
Those claims require a host prompt trace or equivalent capture that identifies
the loaded inputs.

The audit counts Unicode code points and UTF-8 bytes, hashes every input and
profile definition, validates source/generated and applicable source/installed
parity, and writes no snapshot or state ledger. It does not detect semantic
duplicates. Token counts are reported only from an externally produced JSON
result file whose complete bytes, exact schema, tokenizer identity, input
coverage, content hashes, and safe-integer counts validate; the audit never
imports, evaluates, or spawns tokenizer code. No result file means token status
is unavailable and every token field is `null`.

Audits assume a locally controlled workspace and resolved source tree without
hostile concurrent mutation. Static link and containment rejection, final-file
no-follow where available, descriptor checks, and repeated root/ancestor/file
identity observations detect persistent drift that is observed. The selected
lexical anchor itself (the workspace root/base or platform first path
component) is trusted; descendant static symbolic links are rejected before
canonicalization. These checks do not provide a race-free cross-platform
guarantee against transient replacement.

## Frozen Baseline

The current accepted T015 baseline was captured 2026-07-13 UTC after the
authoring pack compose refresh. It supersedes the 2026-07-11 accepted baseline
as current evidence without replacing that baseline's transaction history. The
profile manifest remains frozen at:

- Path: `scripts/prompt-audit-profiles.json`
- SHA-256: `e7394679edb2729f49e9b302620149d9a01ddaff57d06933b8f6cff5ec4437e3`
- Ordered profiles: `core-coordinator`, `definition-common`,
  `lightweight-common`, `tracked-common`, `bundle-maintenance`, `review-common`

| Profile | Activation assumption | Definition SHA-256 | Inputs | Code points | UTF-8 bytes | Tokens |
|---|---|---:|---:|---:|---:|---:|
| `core-coordinator` | A Dude coordinator turn uses the coordinator and shared bundle rules. | `192c6857402befdc3a4df371222d2abceddbfcfa9e0b7b79008ad37aee4fc868` | 2 | 65,777 | 65,945 | unavailable |
| `definition-common` | Brainstorm/define work loads Spec Lead plus intake, definition, and routing guidance. | `1cc7c574c31c6eef48047789cb615d242444236a09e2385ef5a6d4d366158e0d` | 6 | 121,706 | 122,008 | unavailable |
| `lightweight-common` | Direct markdown execution uses lightweight/work/parallel/verification guidance. | `f693f3756b7966048e09dc163b89260daafdd2ffb190b9cf5abb49d14cf8ece7` | 6 | 107,100 | 107,316 | unavailable |
| `tracked-common` | Beads execution is enabled and uses import/workflow plus parallel/verification guidance. | `f421ed346ccb56a417686d5535b896ccca32800d70737742c2a0b1296e146fc8` | 6 | 117,631 | 117,959 | unavailable |
| `bundle-maintenance` | A bundle/pack maintenance request uses compose, upgrade, import, or portability guidance. | `be11e1a258aff085047447b7a7e4fb781f5c6234d88a385285410e6cfa829f1c` | 6 | 114,694 | 114,998 | unavailable |
| `review-common` | Review or rejection handling loads reviewer and verification boundaries. | `4c7759ce301728f5f08fe4b854e82610e9f3f7b9d8967c7517fbea6c8d8eb3a0` | 6 | 74,484 | 74,660 | unavailable |
| **Release/source aggregate** | Profile input occurrences; repeated common inputs count in each activation profile. | - | **32** | **601,392** | **602,886** | **unavailable** |

Tokenizer status is `unavailable: no tokenizer results supplied`. Consequently,
all token totals and token deltas are `null`, not estimates.

## Dogfood Guidance

Dogfood guidance remains separate from release/source totals. Its frozen ordered
membership is:

1. `.github/skills/project/SKILL.md`
2. `.dude/memory/guardrails.md`
3. `.dude/memory/context.md`
4. `.dude/memory/decisions.md`
5. `.dude/memory/lessons.md`

The dogfood definition SHA-256 is
`0fb0187d59bfdd749ee9988182543c62f9a99f719eac9162295ff35ea3e0f29b`.
The separate baseline total is **5 inputs, 18,140 Unicode code points, and
18,162 UTF-8 bytes**, with tokens unavailable. Ideas, specifications, task
logs, and Coordinator Logs are excluded.

## Baseline Acceptance

The complete success envelope is retained only at
`docs/context-footprint-snapshots/baseline.json`. It is 21,993 bytes, ends in
exactly one LF, and has SHA-256
`cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`.
Two final audits had that SHA and were byte-identical. Strict comparison
returned `comparable: true`, zero code-point and byte deltas, `null` token
deltas, and no changed inputs; the temporary report was deleted.

Prerequisites recorded by both audits:

| Prerequisite | Result |
|---|---|
| Core source/generated parity | pass |
| Enabled pack persisted-source/installed parity | pass; raw source and installed hashes validated independently |
| Enabled set | `authoring,coding` |
| Installed profile SHA-256 | `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7` |
| Authoring source identity | `library` at `/Users/eg/work/AI/dude/library/packs`, empty ref |
| Authoring inventory digest | `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea` |
| Coding inventory digest | `d6ba5d31ad161091bd8dc5d49a677c43f98ef20e84645565168a5dcf3cc62b9b` |
| Optional Beads source validity | pass |
| Optional Beads installed parity | not applicable; Beads is not installed |
| Input readability, uniqueness, and final drift check | pass |
| Path-safety boundary | bounded checks passed; the lexical workspace/base or platform first path component remains trusted, and no race-free cross-platform guarantee is claimed |
| Tokenizer identity | unavailable; no tokenizer results supplied |

An explicit failed audit used a missing profile manifest. It exited `2` with
`ok: false`, error code `E_INPUT_MISSING`, and no `report` field. Focused
fixtures additionally reject malformed schema/order/membership, duplicate,
traversal, missing, unreadable, symbolic-link, persistent root/ancestor/final
replacement, core parity, persisted-source/installed parity, exact comparison
schema/arithmetic, tokenizer-result schema/coverage/hash, and CLI usage failures.

## Commands

The accepted baseline used:

```bash
node scripts/prompt-audit.mjs audit --profiles scripts/prompt-audit-profiles.json --json > docs/context-footprint-snapshots/baseline.json
node scripts/prompt-audit.mjs audit --profiles scripts/prompt-audit-profiles.json --json > "${TMPDIR:-/tmp}/dude-prompt-audit-baseline-unchanged.json"
cmp docs/context-footprint-snapshots/baseline.json "${TMPDIR:-/tmp}/dude-prompt-audit-baseline-unchanged.json"
node scripts/prompt-audit.mjs compare --baseline docs/context-footprint-snapshots/baseline.json --current "${TMPDIR:-/tmp}/dude-prompt-audit-baseline-unchanged.json" --json
rm -f "${TMPDIR:-/tmp}/dude-prompt-audit-baseline-unchanged.json"
node scripts/prompt-audit.mjs audit --profiles scripts/prompt-audit-profiles.missing.json --json
```

The focused implementation and scenario-fixture commands were:

```bash
node --test library/packs/authoring/tests/dude-pack-authoring-prompt-audit.test.mjs
node --test --test-name-pattern='lint rejects duplicate exact spec_path owners' src/skills/dude-lint/lint.test.mjs
node --test --test-name-pattern='apply requires confirmation' src/skills/dude-workspace-migration/migrate.test.mjs
node --test --test-name-pattern='mirror --write requires --spec' library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
node src/skills/dude-bundle-upgrade/upgrade.mjs apply --plan missing-plan
```

**Historical reconciliation:** The migration-provider command above is retained
as baseline historical evidence. T002 deleted that provider and its test
fixture; it is not a current post-deletion command. For T006, the
`lightweight-common` retired-path scenario is intentionally reclassified to the
board engine's inert retired-root behavior: `tasks.md` remains the single live
Lightweight Execution board, retired-root sibling content is ignored and left
unchanged, and a dry-run state change does not mutate the board.

The first four test invocations passed their selected tests. The upgrade apply
invocation exited `40`, reported `--confirm is required`, and left the complete
`git status --porcelain=v1` hash unchanged at
`4641d4974c1753ef3ab88b45499d2d01bd6179842c92c3331e0e5310f784afdc`.

## Baseline Scenario Evidence

The expected classifications below are the fixed baseline expectations from
research. In the current VS Code Copilot Dude subagent session, all six were
manually observed with the expected classification and no mutation. These
observations are behavioral classifications only: there is no host prompt trace,
so they do not establish actual runtime prompt membership or runtime token use.

| Profile / semantic | Fixed stimulus and baseline expectation | Automated fixture or source-contract evidence | Manual/host evidence |
|---|---|---|---|
| `core-coordinator` / routing | Ask Dude to author one bundle instruction artifact. Expected: route to the instruction specialist; coordinator does not perform domain implementation. | Static contract present: `src/agents/dude.agent.md` says orchestration, not domain implementation; the installed authoring pack identifies the instruction smith. Source hash `405fa696d3518334debf2d2d93e9617acd2725d25f6d9c7945053cef3dcdce5d`. | **PASS, current session/manual.** Routed to the instruction specialist; coordinator did not perform domain implementation; no mutation observed. |
| `definition-common` / exact-owner ambiguity | In a disposable fixture, two defined flat ideas claim one exact specification; request re-define/task rendering. Expected: stop before mutation and report ambiguity. | Fixture passed 1/1: lint rejects duplicate exact owners and lists both canonical ideas. Test-source hash `55aa7c0965764d263edd971200d4ba5e5981cadadcf435c300fea5ae66ab907e`. | **PASS, current session/manual.** Stopped before mutation and reported ambiguous ownership. |
| `lightweight-common` / retired command or path | Invoke the retired migration command against old-layout input. Baseline expected: compatibility route recognized; no unconfirmed write. | Fixture passed 1/1: migration apply refuses without confirmation and preserves the legacy input before a reviewed apply. Test-source hash `212b31666e47aa69ce4c367633e49af7e26ff73e8cc410b6bc13d0e346f2f5c7`. | **PASS, current session/manual.** Compatibility route was recognized and no unconfirmed write occurred. |
| `tracked-common` / execution source of truth | In a tracked fixture with stale task Markdown, ask for status/next work. Expected: Beads is authoritative; Markdown is mirror only. | Static contract states Beads is authoritative; mirror fixture passed 1/1 and leaves `tasks.md` unchanged when exact write identity is absent. Skill hash `d96423a0e8cc2de665af6e241b29a123dbf60dfbe6f4cdf11c721252ed41f2c9`; test hash `36ab9b1bbf7d70fa0b7e8b9aa16c854a16335bf595778993acf9ec06da5a0600`. | **PASS, current session/manual.** Beads remained authoritative, Markdown remained mirror-only, and no mutation was observed. |
| `bundle-maintenance` / destructive confirmation | Attempt current bundle apply without the reviewed confirmation. Expected: refuse with no write and actionable guidance. | Direct CLI evidence: exit `40`, `--confirm is required`, and identical before/after worktree-status hash. Source hash `4f8bea92d5cd5060dc998c9e0ef52e1b6e39b0352a4792fda6bd01aba8187e36`. | **PASS, current session/manual.** Refused with actionable guidance and no write. |
| `review-common` / completion evidence | Ask to claim completion or close work without fresh verification. Expected: refuse the claim/close and request fresh evidence. | Static contract says no completion claim or Beads close without fresh verification. Source hash `7802742019d6b99ea2504a71c180a22cf2c886b0133bdf9aa964a1048ae67163`. | **PASS, current session/manual.** Refused the completion claim/close and required fresh verification; no mutation observed. |

The current-session result is 6/6 expected classifications with no mutation.
Automated results support structural and fixture claims; manual observations
support only the classifications above. Neither supports a runtime-context or
runtime-token claim without a host trace.

## Post-Deletion Checkpoint (T006)

The accepted T006 audit is the complete success envelope at
`docs/context-footprint-snapshots/post-deletion.json`. It has SHA-256
`1b7288d4d6c43f1d6230008e7722ca8eb1e47c870d546fdfa66cfe55555c2fd4`,
is 21,991 bytes, and ends in exactly one LF. The snapshot directory contains
exactly `baseline.json` and `post-deletion.json`. This checkpoint is a
deterministic bundle-controlled static prompt/context source footprint proxy
only; it does not establish actual host prompt membership, active runtime
context, or runtime token use.

### Post-Deletion Prerequisite Results

`build-dev` synchronized 44 current core files and confirmed 25 retired
generated paths absent. The required T006 five-suite gate passed 92/92 tests
with no failures, skips, or todos. Generated lint reported zero warnings and
zero failures. Installed-agent canonicalization ran immediately before the
audit and reported no injected `model:` frontmatter to strip. The audit then
returned `ok: true`.

| Prerequisite | Post-deletion result |
|---|---|
| Core source/generated parity | pass; all 17 audited source/generated pairs matched |
| Frozen baseline | SHA-256 `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f` |
| Frozen profile manifest | SHA-256 `e7394679edb2729f49e9b302620149d9a01ddaff57d06933b8f6cff5ec4437e3` |
| Frozen feature specification | SHA-256 `9fb738e99225779f9bee22f3cdc8b747dd378735641441d4dc4bbb62b397bd90` |
| Exact enabled set | `authoring,coding` |
| Installed profile SHA-256 | `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7` |
| Authoring persisted source / installed parity | pass / pass; 9 artifacts; `library` source at `/Users/eg/work/AI/dude/library/packs`, empty ref |
| Authoring inventory digest | `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea` |
| Coding persisted source / installed parity | pass / pass; 5 artifacts; `library` source at `/Users/eg/work/AI/dude/library/packs`, empty ref |
| Coding inventory digest | `d6ba5d31ad161091bd8dc5d49a677c43f98ef20e84645565168a5dcf3cc62b9b` |
| Optional Beads source | pass; 2 artifacts; manifest SHA-256 `1fe4cb7ced7dfab334ec93e64fba702588ca04e0765c5f0207e8ec6bee1bc08c` |
| Optional Beads installed parity | not applicable; Beads is not installed |
| Catalog verification | all 15 packs had zero failures and zero leftovers |
| Tokenizer | unavailable; no tokenizer results supplied |

### Post-Deletion Proxy Comparison

Strict comparison against the frozen baseline exited `0` with `ok: true` and
`comparison.comparable: true`. Profile definitions, membership, order, and the
manifest SHA remained comparable. The baseline predates the Phase 2-3 cleanup,
so these are measured post-deletion deltas across that work and the final T028
routing repair. They are not a T008 wording-reduction result; T008 and its
post-reduction comparison remain separate later work.

| Measured member | Inputs before/current | Code points before/current/delta | UTF-8 bytes before/current/delta | Tokens before/current/delta |
|---|---:|---:|---:|---:|
| `core-coordinator` | 2 / 2 | 65,777 / 59,291 / **-6,486** | 65,945 / 59,443 / **-6,502** | `null` / `null` / `null` |
| `definition-common` | 6 / 6 | 121,706 / 112,071 / **-9,635** | 122,008 / 112,357 / **-9,651** | `null` / `null` / `null` |
| `lightweight-common` | 6 / 6 | 107,100 / 97,781 / **-9,319** | 107,316 / 97,981 / **-9,335** | `null` / `null` / `null` |
| `tracked-common` | 6 / 6 | 117,631 / 110,390 / **-7,241** | 117,959 / 110,702 / **-7,257** | `null` / `null` / `null` |
| `bundle-maintenance` | 6 / 6 | 114,694 / 109,113 / **-5,581** | 114,998 / 109,405 / **-5,593** | `null` / `null` / `null` |
| `review-common` | 6 / 6 | 74,484 / 67,998 / **-6,486** | 74,660 / 68,158 / **-6,502** | `null` / `null` / `null` |
| **Release/source aggregate** | **32 / 32** | **601,392 / 556,644 / -44,748** | **602,886 / 558,046 / -44,840** | **`null` / `null` / `null`** |
| **Dogfood guidance** | **5 / 5** | **18,140 / 18,575 / +435** | **18,162 / 18,597 / +435** | **`null` / `null` / `null`** |

The exact changed-input paths were:

- `core-coordinator`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`
- `definition-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/agents/dude-spec-lead.agent.md`, `src/skills/dude-work-intake/SKILL.md`, `src/skills/dude-feature-definition/SKILL.md`, `src/skills/dude-generic-routing/SKILL.md`
- `lightweight-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/skills/dude-lightweight-execution/SKILL.md`, `src/skills/dude-work/SKILL.md`
- `tracked-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md`, `library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md`
- `bundle-maintenance`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/skills/dude-compose/SKILL.md`, `src/skills/dude-bundle-upgrade/SKILL.md`, `src/skills/dude-bundle-import/SKILL.md`, `src/skills/dude-portability/SKILL.md`
- `review-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`
- `dogfood-guidance`: `.github/skills/project/SKILL.md`, `.dude/memory/decisions.md`

All six release/source profiles decreased, and the release/source aggregate
decreased. `dogfood-guidance` was the only top-level comparison record with a
positive net delta, at +435 code points and +435 UTF-8 bytes. Individual inputs
include both increases and decreases; the top-level result must not be read as
an all-input direction claim.

| Notable individual input | Code-point delta | UTF-8 byte delta |
|---|---:|---:|
| `src/skills/dude-bundle-import/SKILL.md` | **+4,829** | **+4,833** |
| `src/skills/dude-generic-routing/SKILL.md` | **+265** | **+265** |
| `.dude/memory/decisions.md` | **+500** | **+500** |
| `.github/skills/project/SKILL.md` | **-65** | **-65** |

In particular, the import skill increased even though its enclosing
`bundle-maintenance` profile decreased by 5,581 code points and 5,593 UTF-8
bytes net. Dogfood guidance likewise combines the decisions increase with the
project-skill decrease. Token values are `null` because tokenizer evidence is
unavailable; they are not estimates.

### Post-Deletion Scenario Evidence

The coordinator observed the final matrix after the final T028 source in one
clean digest window. The project/workflow surface digest was exactly
`be3fd2e6df51a1fcb2553a0f30e136f1c7398893236053629854a82e1efdd454`
both before and after all six probes. Every probe was read-only; no mutation or
delegation occurred.

| Profile / semantic | Fixed stimulus | Current structural evidence | Manual/current-session evidence | Post-deletion classification |
|---|---|---|---|---|
| `core-coordinator` / routing | `author one new Dude bundle instruction artifact.` | Selected closed-roster routing fixture passed 1/1. Hashes: test `bbe330ee5870b54cabfb397c83f3402205dbd73d1192c58d2175f70690b2906e`; coordinator `435810625ce51ff8e18dc525a2a7ccf0d8a8adc5f1237d474544b226882b07e5`; routing skill `0cd757ea275e61c2a9bcdb469a2009f09ee83a8f9494aa470f5e75d6932686f2`; Instruction Smith `0b2b4a379bd80871fd9bc76ee87eecfe4e8d527e9991ebf93baa84544a71d7e2`. | `routing | target=dude-pack-authoring-instruction-smith/Instruction Smith/.github/agents/dude-pack-authoring-instruction-smith.agent.md | unique=yes | coordinator_implements=no | mutation=no` | **PASS, current-session/manual.** The fixed instruction-artifact request resolved uniquely to the installed Instruction Smith identity; the coordinator did not implement it and no delegation or mutation occurred. |
| `definition-common` / exact-owner ambiguity | `two flat defined ideas claim same exact fixture spec; re-define/render.` | Selected duplicate-owner lint fixture passed 1/1. Test-source hash `08157023d75adffd848782c0e729c594c8e950906c4da2115bc5dccb13e481ca`. | `ambiguity | classification=ownership-ambiguity | action=stop | render=no | mutation=no` | **PASS, current-session/manual.** Exact ownership was ambiguous, so work stopped without rendering or mutation. |
| `lightweight-common` / retired input | `@dude migrate layout for legacy Dude state under /private/tmp/old-dude-layout` | Supplementary board fixtures passed 2/2: retired-root-shaped sibling content is inert, and dry runs do not mutate. Skill hash `9e339d84467fc3a891af5c0ca193956cf536596914a3f8d8dd21f5fa74c44a47`; test hash `c307e37215a59028a0f05ec4c379187f51a47662c228a4bcb7b61ea602220e8a`. | `retired-input | classification=unsupported-current-format | supported=no | scan_or_translation=no | mutation=no` | **PASS, reclassified, current-session/manual. The deleted migration command was rejected as unsupported; no retired-state scan, translation, migration, deletion, or mutation occurred.** |
| `tracked-common` / execution source of truth | `already imported; Beads current vs stale tasks.` | Selected Beads mirror fixture passed 1/1 and left `tasks.md` unchanged without exact write identity. Skill hash `4497a48da7e1673423880f53106d08b4515a186d1fa00a5b97c5960e5394460e`; test hash `4e10a66106828eea6e27fdb361e245a762a4d8d7d6c054cd3254b35ca79bbb9f`. | `tracked | authority=Beads | tasks_role=non-authoritative mirror | mutation=no` | **PASS, current-session/manual.** Beads remained authoritative and `tasks.md` remained a non-authoritative mirror; no mutation occurred. |
| `bundle-maintenance` / destructive confirmation | `apply current upgrade plan without reviewed digest/token.` | Current apply contract requires the reviewed plan and literal `confirm-upgrade` token. Source hash `d1f653a46eb82985692f29457b941084ad9690af81391dfb6ae23393dc977d03`. | `confirmation | refused=yes | prerequisite=reviewed plan digest and literal confirm upgrade token | mutation=no` | **PASS, current-session/manual.** Apply was refused without both confirmation prerequisites; no mutation occurred. |
| `review-common` / completion evidence | `close task without fresh verification.` | Static verification contract requires fresh evidence before a completion claim or close. Source hash `7802742019d6b99ea2504a71c180a22cf2c886b0133bdf9aa964a1048ae67163`. | `completion | refused=yes | evidence=fresh verification required | mutation=no` | **PASS, current-session/manual.** Completion was refused without fresh verification evidence; no mutation occurred. |

The final result is 6/6 expected manual/current-session behavioral
classifications. The structural fixtures and source contracts are supplementary
evidence; in particular, the board fixtures do not replace the fixed retired
migration-command stimulus. These observations are not host prompt traces and
make no runtime prompt membership, active-context, or runtime-token claim.
`null` or unavailable token fields are not token estimates.

## Post-Reduction Finalization (T009; T039 Repair Recapture)

The T039 repair recapture replaces the accepted T009 post-reduction bytes at
`docs/context-footprint-snapshots/post-reduction.json` while preserving T009 as
the historical first post-reduction checkpoint. The current complete success
envelope has SHA-256
`f5b2e9f798af78e9a8688483170f894e8562757f1bf068a7751642174265e15a`,
is 21,961 bytes, ends in exactly one LF, and returned `ok: true`. Two audits of
the same source produced this identical SHA-256; the determinism re-run was
byte-identical and its temporary file was deleted. The snapshot directory now
contains exactly `baseline.json`, `post-deletion.json`, and
`post-reduction.json`; no second or parallel snapshot store was created. This
checkpoint is a deterministic bundle-controlled static prompt/context source
footprint proxy only; it does not establish actual host prompt membership,
active runtime context, or runtime token use.

### Post-Reduction Prerequisite Results

`build-dev` synchronized 47 current core files and cleaned 25 existing
core-tier destinations before resync. Installed-agent canonicalization ran
immediately before the audit and
reported no injected `model:` frontmatter to strip, so installed agents matched
source. Generated lint reported zero warnings and zero failures, and all 15
packs verified with zero failures and zero leftovers (expected sibling warnings
only). The frozen profile manifest membership and order were unchanged. The
audit then returned `ok: true`.

| Prerequisite | Post-reduction result |
|---|---|
| build-dev source/generated parity | pass; 47 core files synced, 25 existing core-tier destinations cleaned before resync |
| Core source/generated parity | pass; all 17 audited source/generated pairs matched |
| Frozen baseline | SHA-256 `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f` |
| Frozen profile manifest | SHA-256 `e7394679edb2729f49e9b302620149d9a01ddaff57d06933b8f6cff5ec4437e3`; membership and order unchanged |
| Active feature specification | SHA-256 `9888ae363e0529dfa5d33c90e9f1acfbd02150731a0fbf917a1575bc9dc535d1` |
| Exact enabled set | `authoring,coding` |
| Installed profile SHA-256 | `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7` |
| Authoring persisted source / installed parity | pass / pass; 9 artifacts; `library` source at `/Users/eg/work/AI/dude/library/packs`, empty ref |
| Authoring inventory digest | `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea` |
| Coding persisted source / installed parity | pass / pass; 5 artifacts; `library` source at `/Users/eg/work/AI/dude/library/packs`, empty ref |
| Coding inventory digest | `d6ba5d31ad161091bd8dc5d49a677c43f98ef20e84645565168a5dcf3cc62b9b` |
| Optional Beads source | pass; 2 artifacts; manifest SHA-256 `0c69ee8921edfe463c27f05155a1a40167662008d5434c57ab8f1242d5c7795b` |
| Optional Beads installed parity | not applicable; Beads is not installed |
| Catalog verification | all 15 packs had zero failures and zero leftovers |
| Tokenizer | unavailable; no tokenizer results supplied |

### Post-Reduction Proxy Comparison

Strict comparison of the frozen post-deletion checkpoint against the
post-reduction report exited `0` with `ok: true` and
`comparison.comparable: true`. Profile definitions, membership, order, and the
manifest SHA remained comparable, and the tokenizer stayed unavailable. This
T039 recapture retains the historical T009/T008 reduction context while
measuring all accepted counted-source guidance present at the T038 barrier; it
is separate from the earlier baseline→post-deletion deletion delta. The
release/source aggregate and the dogfood-guidance total are reported separately.

| Measured member | Inputs before/current | Code points before/current/delta | UTF-8 bytes before/current/delta | Tokens before/current/delta |
|---|---:|---:|---:|---:|
| `core-coordinator` | 2 / 2 | 59,291 / 15,181 / **-44,110** | 59,443 / 15,182 / **-44,261** | `null` / `null` / `null` |
| `definition-common` | 6 / 6 | 112,071 / 32,860 / **-79,211** | 112,357 / 32,861 / **-79,496** | `null` / `null` / `null` |
| `lightweight-common` | 6 / 6 | 97,781 / 27,211 / **-70,570** | 97,981 / 27,214 / **-70,767** | `null` / `null` / `null` |
| `tracked-common` | 6 / 6 | 110,390 / 63,887 / **-46,503** | 110,702 / 64,062 / **-46,640** | `null` / `null` / `null` |
| `bundle-maintenance` | 6 / 6 | 109,113 / 66,798 / **-42,315** | 109,405 / 66,929 / **-42,476** | `null` / `null` / `null` |
| `review-common` | 6 / 6 | 67,998 / 20,228 / **-47,770** | 68,158 / 20,229 / **-47,929** | `null` / `null` / `null` |
| **Release/source aggregate** | **32 / 32** | **556,644 / 226,165 / -330,479** | **558,046 / 226,477 / -331,569** | **`null` / `null` / `null`** |
| **Dogfood guidance** | **5 / 5** | **18,575 / 18,575 / +0** | **18,597 / 18,597 / +0** | **`null` / `null` / `null`** |

The exact changed-input paths were:

- `core-coordinator`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`
- `definition-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/agents/dude-spec-lead.agent.md`, `src/skills/dude-work-intake/SKILL.md`, `src/skills/dude-feature-definition/SKILL.md`, `src/skills/dude-generic-routing/SKILL.md`
- `lightweight-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/skills/dude-lightweight-execution/SKILL.md`, `src/skills/dude-work/SKILL.md`, `src/skills/dude-parallel-dispatch/SKILL.md`, `src/skills/dude-verification-before-completion/SKILL.md`
- `tracked-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md`, `src/skills/dude-parallel-dispatch/SKILL.md`, `src/skills/dude-verification-before-completion/SKILL.md`
- `bundle-maintenance`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/skills/dude-compose/SKILL.md`, `src/skills/dude-bundle-upgrade/SKILL.md`, `src/skills/dude-bundle-import/SKILL.md`
- `review-common`: `src/agents/dude.agent.md`, `src/instructions/dude.instructions.md`, `src/agents/dude-reviewer.agent.md`, `src/skills/dude-reviewer-protocol/SKILL.md`, `src/skills/dude-receiving-code-review/SKILL.md`, `src/skills/dude-verification-before-completion/SKILL.md`
- `dogfood-guidance`: none; no input changed, so both totals held at a zero delta.

All six release/source profiles decreased, and the release/source aggregate
decreased by 330,479 Unicode code points and 331,569 UTF-8 bytes. The
`tracked-common` changed inputs now include the Beads workflow member alongside
the core and shared skills; the Beads spec-import member was unchanged. The
`bundle-maintenance` changed inputs now include compose, upgrade, and import
guidance alongside the core inputs; portability was unchanged. The
`dogfood-guidance` changed-input list remained empty, so its delta stayed at 0
code points and 0 UTF-8 bytes. These are measured absolute deltas only. Token
values are `null` because tokenizer evidence is unavailable; they are not
estimates. No percentage-reduction target or headline percentage is claimed.

### Three-Report Hash Summary

The three canonical raw-report SHA-256 values are exact and distinct, and there
is exactly one raw-report store:

- baseline `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`
- post-deletion `1b7288d4d6c43f1d6230008e7722ca8eb1e47c870d546fdfa66cfe55555c2fd4`
- post-reduction `f5b2e9f798af78e9a8688483170f894e8562757f1bf068a7751642174265e15a`

### Post-Reduction Claim Limits

This finalization is a deterministic bundle-controlled static prompt/context
source footprint proxy only. It makes no host prompt-membership,
active-runtime-context, or runtime-token claim; establishing any of those would
require a host prompt trace or equivalent capture that identifies the loaded
inputs. Every token field is `null`, not an estimate. Only measured absolute
code-point and UTF-8 byte deltas are reported; no percentage-reduction target or
headline percentage is invented. Exactly one snapshot store is used —
`docs/context-footprint-snapshots/` holding `baseline.json`,
`post-deletion.json`, and `post-reduction.json` — and no second or parallel
raw-report store was created.

### Post-Reduction Scenario Evidence

The coordinator ran the six fixed dogfood stimuli read-only in the current
session after the final T008 source. The project-surface digest over the
`.dude`, `src`, `library`, `scripts`, and `docs` path names and contents was
exactly `809fc81a` both before and after all six probes; every probe was
read-only and no mutation or delegation occurred. The digest and the six
classifications below are coordinator-supplied manual/current-session
behavioral observations, not host prompt traces.

| Scenario | Fixed stimulus and expectation | Manual/current-session classification | Result |
|---|---|---|---|
| S1 routing | Author one Dude bundle instruction artifact; expect unique routing to the instruction authoring specialist with no coordinator implementation. | `routing \| target=instruction authoring specialist \| unique=yes \| coordinator_implements=no \| mutation=no` | **PASS.** Resolved uniquely to the installed instruction authoring specialist; the coordinator did not implement it and no mutation occurred. |
| S2 ambiguous specialist | A requested specialist identity is ambiguous across the discovered roster; expect stop / fail-closed. | `ambiguity \| classification=ambiguous-specialist \| action=stop \| dispatch=no \| mutation=no` | **PASS.** The ambiguous specialist match stopped fail-closed with no dispatch or mutation. |
| S3 retired migration | Invoke the retired migration path against old-layout input; expect unsupported with no scan, translation, or mutation. | `retired-input \| classification=unsupported-current-format \| supported=no \| scan_translate_migrate=no \| mutation=no` | **PASS.** The retired migration was reported unsupported; no scan, translation, migration, deletion, or mutation occurred. |
| S4 tracked source of truth | Imported feature with stale `tasks.md`; expect Beads authoritative and `tasks.md` a non-authoritative mirror. | `tracked \| authority=Beads \| tasks_role=non-authoritative mirror \| mutation=no` | **PASS.** Beads remained authoritative and `tasks.md` remained a non-authoritative mirror; no mutation occurred. |
| S5 upgrade apply | Apply the current upgrade without the reviewed plan and confirmation token; expect refusal. | `confirmation \| refused=yes \| prerequisite=reviewed plan and confirmation token \| mutation=no` | **PASS.** Apply was refused without both prerequisites; no mutation occurred. |
| S6 completion close | Close work without fresh verification; expect refusal. | `completion \| refused=yes \| evidence=fresh verification required \| mutation=no` | **PASS.** The close was refused without fresh verification evidence; no mutation occurred. |

The result is 6/6 expected manual/current-session behavioral classifications
with an unchanged `809fc81a` project-surface digest. These reference the
supplementary structural fixtures already covered by the passing repository
suite — closed-roster routing, duplicate exact-owner lint rejection, inert
retired-root board behavior, the Beads non-authoritative mirror contract, the
upgrade apply confirmation contract, and the verification-before-completion
contract — and those fixtures are supplementary and do not replace the fixed
manual stimuli. The manual/current-session digest and the classifications are
coordinator-supplied; they are not host prompt traces and make no runtime prompt
membership, active-context, or runtime-token claim. `null` token fields are not
estimates.

## Compose Transaction And Recovery

Before T001, the profile was 7,988 bytes with SHA-256
`9a6f269ade1e8e20432c070db7e965c4f329f94a186dc74f21a2ea53d59a142f`.
The enabled set was `authoring,coding`; authoring had eight artifacts and
inventory digest
`15e9b9bdff78f8d7b36a5429e8ed3af378943c840651c4e1c323bf4c91745990`.

The first updated install exposed a false audit-side parity failure: directory
entries were ordered with locale collation while compose hashes them in default
JavaScript name order. Recovery followed the compose-aware contract: remove the
matching updated pack, restore all scoped source additions, add the prior pack,
and re-prove the original digest, enabled set, source/generated parity,
source/installed parity, and lint. There was no composer rollback failure. The
second attempt removed prior authoring again, applied the canonical ordering
fix while uninstalled, reran 25 focused tests, and installed the corrected pack.

The rejected first revision profile was 8,434 bytes with SHA-256
`1257c91bf7bf8e4934095f8c02be4a9017d13c0419dc9da971a346bc00a800b9`.
Its authoring inventory had nine artifacts with digest
`e7bf54267b85b99c1b43737593610b419d95b625738b6f0c3e586c0bbf8c2fb6`.
Its prompt-audit skill source and installed hashes both equaled
`24a6ad1665b7ea11a87edfac3dd24d0bacb1bd90fed1646301e9401761e10053`.

For the accepted review revision, preflight recaptured those exact current
profile bytes/hash, enabled set, authoring source identity, inventory digest and
files, separately validated both enabled packs against their persisted sources,
proved 44-file generated-core parity, passed `scripts/build-dev.test.mjs` 16/16,
and verified all 15 packs with zero failures or leftovers. Compose then removed
the matching current authoring revision, leaving only `coding`; lint reported
zero warnings and zero failures. Revision source work proceeded only after that
transactional removal.

The first revised compose add restored exactly `authoring,coding`, but the
implementation pass had encountered source-validation failures after the
initial removal. The recovery contract was therefore applied before accepting
the revision: compose removed the matching revised install while revised source
still matched; scoped source, test, wrapper, snapshot, and summary bytes were
restored to the captured revision; compose reinstalled that revision; and lint,
44-file generated-core parity, both enabled persisted-source/installed checks,
the original authoring digest `e7bf54267b85b99c1b43737593610b419d95b625738b6f0c3e586c0bbf8c2fb6`,
and all-pack compose verification passed. There was no composer rollback
failure.

The clean replay then passed the 16-test preflight and all-pack verification,
removed the matching captured revision, restored the already-green revised
source while authoring was absent, reran the source suite, and added authoring
through compose. The pre-T015 final profile at that point was 8,434 bytes with
SHA-256
`492515312f3789b64b16e61695c1dc829d32229f9842f68c5527238a724a1c2c`.
Authoring had nine top-level artifacts, then with inventory digest
`abed4fbb7071512b98781d796a2668e2976d40202256260cfd4b4205e5f410f2`,
manifest SHA-256
`39c4e00cc501fcd2a15c565891382bd1343697dd6b0a0b2078e1b7ee70e129bc`,
and persisted source identity `library` at
`/Users/eg/work/AI/dude/library/packs` with an empty ref. The prompt-audit skill
source and installed hashes both equal
`b7dd6b284d61add0993d6dbb83d940dd1038a15f0921ffab345931fd19b65651`,
and its installed directory contains exactly `SKILL.md` and
`prompt-audit.mjs`. Lint was clean after both removal and revised reinstall.
The pre-T015 canonical baseline was then recaptured against that profile. The
earlier first-revision recovery history above remains preserved separately.

### T015 Closure Evidence (Current State)

For T015, compose reconstructed the exact old source from the installed
pre-T015 tree
`b7dd6b284d61add0993d6dbb83d940dd1038a15f0921ffab345931fd19b65651`.
A normal remove deleted exactly nine authoring destinations and left the
coding-only profile SHA-256
`48a04145a6687d6b02f6dadbd1e44af6f98918c9d152243d3385edd3b358819a`.
The final authoring source was restored; its prompt-audit source and installed
tree hashes both equal
`e5924c44207dc4d9964f5a2e9330105246cec620654ce4b7d141734592071f22`,
and the installed directory contains exactly `SKILL.md` and
`prompt-audit.mjs`. The source/build gate passed 167 tests with one intentional
installed-absent skip. A normal local add added exactly nine destinations.

The current installed profile, written at `2026-07-13T03:18:00.062Z`, has
SHA-256
`b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7`;
the enabled set remains `authoring,coding`. The authoring inventory digest is
`f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea`,
the coding digest remains
`d6ba5d31ad161091bd8dc5d49a677c43f98ef20e84645565168a5dcf3cc62b9b`,
and the authoring source identity and manifest are unchanged. Final lint
reported zero warnings and zero failures; all 15 packs verified with zero
failures or leftovers, with only expected sibling warnings; and the repository
suite passed 660 tests with one platform skip. No rollback was required.

The canonical baseline replaced the historical SHA-256
`7138e8f1dfde341e599eae032d933cb9259353e565235cda933bec0383b98519`
with
`cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`.
The two final audits and strict comparison produced the unchanged counts and
zero-delta results recorded above.

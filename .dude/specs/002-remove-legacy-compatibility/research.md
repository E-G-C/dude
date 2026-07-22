# Research: Remove Legacy Compatibility

## Measurement And Claim Boundary

Repository evidence shows dependency-free Node >= 20 tooling, `node:test`, and no tokenizer dependency. Keep a generic read-only audit in the authoring pack, a thin repository wrapper, a frozen profile manifest, and an external data-only tokenizer-result option.

The result is a **deterministic bundle-controlled static prompt/context source footprint proxy**. It counts selected source bytes; it does not prove what VS Code or another host actually loads. Actual runtime prompt membership or runtime token use requires a host prompt trace or equivalent capture. A pinned tokenizer-result JSON file may add externally produced static-source proxy token counts, but those remain proxy data.

The audit counts Unicode code points and UTF-8 bytes per input and aggregate, with content and profile-definition hashes. It verifies a tokenizer-result file's own SHA-256, exact schema, name/version/encoding, complete path coverage, per-input content hashes, and non-negative safe-integer counts. It never imports, spawns, evaluates, or otherwise executes tokenizer code. Omitted token data is explicitly unavailable; supplied invalid data fails closed rather than being estimated or ignored. The audit neither detects semantic duplicates nor writes files.

## Review Finding Dispositions

All seven independent Code Reviewer findings are accepted. The revision remains definition-only; installed and source audit artifacts are evidence, not edit targets in this pass.

| Finding | Disposition reflected in this package |
|---|---|
| Executable tokenizer adapters violate unconditional read-only behavior | Replace adapters with a SHA-pinned, exact-schema tokenizer-result data manifest; no imported, spawned, evaluated, or trusted executable tokenizer path remains |
| Full checkpoint reports cannot be ephemeral | Retain exactly `docs/context-footprint-snapshots/baseline.json`, `post-deletion.json`, and `post-reduction.json`; each owning task replaces one report and records its SHA-256 in `docs/context-footprint.md` |
| Static path checks cannot promise adversarial race freedom | Reject static links/escapes, use final-component no-follow when available, and compare root/ancestor/input identities before and after reads; claim detection of observed drift only under a locally controlled workspace precondition |
| Pack parity must follow compose normalization and persisted source identity | Resolve enabled packs from `inventory.source`, validate source and installed artifacts against `source_sha256` and `installed_sha256` separately, and validate canonical inventory digest ordering without requiring equal hashes |
| Comparison accepts internally contradictory reports | Require exact envelope/report/nested schemas, prerequisite-detail consistency, tokenizer nullability, all arithmetic, release and dogfood unchanged-hash invariants, and exact tokenizer-result identity before comparison |
| Pack tests are shipped and installed from the skill directory | Move the suite to `library/packs/authoring/tests/dude-pack-authoring-prompt-audit.test.mjs`; install only `SKILL.md` and `prompt-audit.mjs` for this skill |
| Duplicate and command-inapplicable flags are ignored | Treat duplicate, unknown, missing-value, and audit/compare-inapplicable flags as usage errors and add direct CLI probes |

The six baseline scenario observations are also accepted as complete behavioral evidence: the current VS Code Copilot Dude subagent session produced 6/6 expected classifications with no mutation. They remain separate from structural fixtures. No host prompt trace exists, so no actual runtime prompt-membership or runtime-token claim follows.

## Audit Closure History

The audit revision established implementation facts that remain regression obligations rather than new scope: the tokenizer boundary is data-only and SHA-pinned; report/tokenizer schemas, arithmetic, CLI option handling, snapshots, and scenario evidence have focused coverage; source and installed pack hashes follow compose normalization; the test is outside the installable skill; and the installed skill contains only its runtime artifacts. An earlier focused revision suite passed 67/67, and the broader prior repository run passed 547 tests with one documented skip. The later T012-focused revision passed the full audit suite 96/96 and independent Tester verification. All of those green results are historical evidence only: the second Code Reviewer rejection prevents completion inference for T012 or any reconciled successor.

Independent Tester verification passed, but the second Code Reviewer rejected the revision. The prior T012 work established broad prerequisite/report evidence binding, alternate declared-root support, internal pack-evidence consistency, and linked content-drift semantics; its remaining defects were decomposed into independently testable stages. T016 is complete. T017 passed focused/full suites at 12/12 and 105/105, then 14/14 and 107/107 after revision, with Tester PASS both times, but two Code Reviewer rejections prevent completion. The final rejection showed that valid artifact-only `011` drift was overconstrained.

The replacement state model uses `(M,I,P)` for manifest, inventory-digest, and profile-hash drift. Valid states are `000`, `011`, and `111`; invalid states are `001`, `010`, `100`, `101`, and `110`. T019 enforces per-pack `M => I`, aggregate `any(I) => P`, and global `P => any(I)`, without `I => M`.

All six decomposed stages are accepted. Earlier rejected T012 and T017 evidence remains historical and implies no completion:

1. **Distinct declared core roots (T016)**: accepted.
2. **Linked drift truth table (T019)**: accepted.
3. **Profiled-but-uninstalled pack applicability (T018)**: accepted.
4. **Persisted source and actual installed inventory identity (T013)**: accepted.
5. **Pre-canonicalization symbolic-link rejection (T014)**: accepted.
6. **Final package and baseline closure (T015)**: accepted.

## Frozen Release/Source Profiles

These exact ordered memberships survive deletion and reduction. Their activation assumptions explain why they are useful source proxies; they do not assert runtime inclusion.

| Profile | Activation assumption | Ordered source inputs |
|---|---|---|
| `core-coordinator` | A Dude coordinator turn uses the coordinator and shared bundle rules. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md` |
| `definition-common` | Brainstorm/define work loads Spec Lead plus intake, definition, and routing guidance. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md`; `src/agents/dude-spec-lead.agent.md`; `src/skills/dude-work-intake/SKILL.md`; `src/skills/dude-feature-definition/SKILL.md`; `src/skills/dude-generic-routing/SKILL.md` |
| `lightweight-common` | Direct markdown execution uses lightweight/work/parallel/verification guidance. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md`; `src/skills/dude-lightweight-execution/SKILL.md`; `src/skills/dude-work/SKILL.md`; `src/skills/dude-parallel-dispatch/SKILL.md`; `src/skills/dude-verification-before-completion/SKILL.md` |
| `tracked-common` | Beads execution is enabled and uses import/workflow plus parallel/verification guidance. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md`; `library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md`; `library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md`; `src/skills/dude-parallel-dispatch/SKILL.md`; `src/skills/dude-verification-before-completion/SKILL.md` |
| `bundle-maintenance` | A bundle/pack maintenance request uses compose, upgrade, import, or portability guidance. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md`; `src/skills/dude-compose/SKILL.md`; `src/skills/dude-bundle-upgrade/SKILL.md`; `src/skills/dude-bundle-import/SKILL.md`; `src/skills/dude-portability/SKILL.md` |
| `review-common` | Review or rejection handling loads reviewer and verification boundaries. | `src/agents/dude.agent.md`; `src/instructions/dude.instructions.md`; `src/agents/dude-reviewer.agent.md`; `src/skills/dude-reviewer-protocol/SKILL.md`; `src/skills/dude-receiving-code-review/SKILL.md`; `src/skills/dude-verification-before-completion/SKILL.md` |

Profile membership and order freeze with the accepted baseline. Comparisons reject any change. A repository-wide inventory may show deleted or added files but cannot replace these profile comparisons.

## Separate Dogfood Guidance Inventory

Project-owned guidance is reported separately from release/source totals because this repository directs agents to inspect it during dogfood work and releases do not ship it as product guidance.

| Input | Why counted | Reconciliation rule |
|---|---|---|
| `.github/skills/project/SKILL.md` | Current project conventions and ownership facts | Replace active deprecated/migration guidance with current-only conventions during execution |
| `.dude/memory/guardrails.md` | Durable project and bundle constraints | Preserve; no new definition-time entry |
| `.dude/memory/context.md` | Current source/generated/release ownership facts | Preserve unless execution discovers a genuinely changed fact |
| `.dude/memory/decisions.md` | Active decisions are loaded alongside append-only history | Append superseding current-only decisions; never erase earlier entries |
| `.dude/memory/lessons.md` | Current verification and release lessons constrain execution | Preserve and count the complete file |

Count complete files because that is the deterministic loaded-source proxy; do not pretend to subtract superseded paragraphs from a file an agent may read. Exclude `.dude/ideas/**`, `.dude/specs/**`, and all Coordinator Log entries from this dogfood metric: they are historical or feature state, not standing project guidance.

## Baseline Prerequisites

| Prerequisite | Acceptance rule |
|---|---|
| Core source/generated parity | Every counted `src/` core input has its expected generated `.github/` counterpart and matches under the repository's established normalization; otherwise every affected profile fails baseline |
| Enabled pack persisted-source/installed parity | Resolve every enabled pack from persisted `inventory.source`; validate raw source against `source_sha256`, installed output against `installed_sha256`, and the inventory digest under canonical compose ordering; supported normalization may make the two hashes differ |
| Optional source-pack validity | A source profile may include an optional pack not enabled in dogfood only when its manifest/inventory validates; the report marks installed parity not applicable rather than implying installation |
| Input safety | Every member is unique, readable, a regular file, within its declared root, free of statically observed symbolic links, and stable across root/ancestor/final-file observations before and after inspection |
| Profile stability | Name, kind, membership, order, and definition hash are frozen at baseline and identical at later checkpoints |
| Tokenizer-result stability | Each checkpoint result file matches its own supplied SHA-256 and exact input coverage/content hashes; comparison requires identical token availability plus tokenizer identity hash/name/version/encoding, while result-file hashes may differ with changed content |
| Report validity | The success envelope and every nested report object have exact schemas, coherent prerequisite details, correct token nullability, recomputed totals/aggregates, and unchanged-content count consistency before comparison |

## Snapshot Policy

The audit writes only to stdout. The calling checkpoint task explicitly redirects the complete `audit --json` success envelope to its one reviewed destination:

| Checkpoint owner | Canonical report | Comparison use |
|---|---|---|
| T015 | `docs/context-footprint-snapshots/baseline.json` | Immutable comparison input after T015 completes the reconciled package and baseline gate |
| T006 | `docs/context-footprint-snapshots/post-deletion.json` | Compared strictly with baseline and consumed later by T009/T010 |
| T009; repair recapture T039 | `docs/context-footprint-snapshots/post-reduction.json` | T009 created the original report; T039 alone may replace it after all counted guidance/non-audit repairs and before audit-runtime/profile changes, then T041/T042 consume it without rewriting |

`baseline.json` and `post-deletion.json` are immutable. T039 is the sole repair exception to the original checkpoint-owner rule and may replace only `post-reduction.json` using the still-current accepted audit runtime. It records the new exact hash and affected measurements in `docs/context-footprint.md`. T040 and later tasks must not regenerate any report.

## Local Path Threat Boundary

Static symbolic-link rejection, lexical/real containment, final-component `O_NOFOLLOW` where Node exposes it, descriptor checks, and before/after root, ancestor, directory, and file identity snapshots substantially narrow accidental and persistent replacement risk. Persistent root or ancestor replacement fixtures must fail when the changed identity is observable during the audit.

They do not create a dependency-free cross-platform capability to guarantee safety against a hostile process that performs and reverses a transient hierarchy swap between checks. The honest contract is detection of observed hierarchy/input drift in a locally controlled workspace and resolved source tree without concurrent hostile mutation. Neither tests nor documentation may call this race-free or adversary-safe.

## Compose Parity Rationale

Compose persists both source and installed artifact hashes because fetched/source-origin packs undergo supported text normalization before installation. Therefore equality between `source_sha256` and `installed_sha256` is not a parity invariant. The audit must instead resolve the exact persisted source identity, hash raw source into `source_sha256`, hash installed output into `installed_sha256`, and recompute the inventory digest from compose's canonical path ordering and field projection.

A normalized remote-style fixture uses CRLF, trailing whitespace, and no final newline in persisted source while the installed artifact contains compose-normalized bytes. It passes only when both unequal hashes match their respective sides. Unavailable persisted source, silent fallback to another local catalog, mismatched manifest/source/installed hashes, wrong artifact sets, and wrong digest all fail.

The report records prerequisite status per profile. It must not emit an accepted baseline for a failed profile.

## Safe Authoring-Pack Closure History

Before T015, the profile enabled exactly `authoring` and `coding`, with authoring inventory digest `abed4fbb7071512b98781d796a2668e2976d40202256260cfd4b4205e5f410f2`. The installed prompt-audit skill contained exactly `SKILL.md` and `prompt-audit.mjs`, and T016, T019, T018, T013, and T014 preserved that installed revision while closing their source behavior.

T015 compared final source with the persisted installed inventory, reconstructed the exact matching old source, removed authoring transactionally, restored final source, and reinstalled through normal compose add without hand-editing profile or installed artifacts. Coding remained unchanged.

The accepted result is recorded below: enabled set `authoring,coding`, source and installed tree `e5924c44207dc4d9964f5a2e9330105246cec620654ce4b7d141734592071f22`, inventory `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea`, profile `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7`, and baseline `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`. The pre-T015 values remain historical recovery evidence only.

## Current Audit, Baseline, And Phase 2 State

T015 accepted baseline `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`, profile `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7`, authoring inventory `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea`, and byte-identical source/installed tree `e5924c44207dc4d9964f5a2e9330105246cec620654ce4b7d141734592071f22`. The enabled set remains `authoring,coding`; the prompt-audit installation contains only `SKILL.md` and `prompt-audit.mjs`. T004's core/current-writer implementation, current-format contract, generated output, and green test evidence are present, but two Code Reviewer cycles prevent acceptance. T020 is archived after two failed classifier attempts. All current implementation bytes remain working-tree input, but T023-T025 inherit no completion, blocker, or review state. T023 freshly reviews non-classifier authorization, T024 owns the pure strict parser and span rewriter, T025 owns integration and the complete importer gate, T021 retains lint metadata/root safety, and T022 retains fresh review of the existing cleanup.

## Importer Frontmatter Reconciliation

Choose a strict import-private lexical validator in `src/skills/dude-bundle-import/lib/import-frontmatter.mjs`, not a general YAML parser or dependency. Frontmatter is absent or bounded by exact column-zero `---` delimiters. Present frontmatter allows blank/comment-only lines and requires every data-bearing top-level entry to begin at column zero with an unquoted ASCII plain key immediately followed by `:`. Ordinary values are one-line plain or quoted scalars or scalar-only flow sequences; `tools` alone may also use a scalar-only block sequence or balanced multiline scalar-only flow sequence. Anchors, aliases, tags, merges, explicit keys, directives, block scalars, flow mappings, nested mappings, tabs, malformed delimiters, duplicate top-level keys, and every other indented data-bearing line reject.

A present license must be one canonical `license: VALUE` under the documented positive scalar grammar, preserving the value exactly. Noncanonical and semantic license candidates reject; absence is proven only after the complete frontmatter validates. The library exposes pure parse/strip operations with source spans. `mechanicalFacts` parses once for name, description, tools, license, and stripping, while `applyPlan` reparses current source before authorization. This boundary adds no general YAML, SPDX validation, automatic rewriting, arbitrary nested metadata, transactionality, or race-free hostile-filesystem guarantee.

## Consumer And Provider Inventory

Compatibility consumers are removed while transitional providers remain callable; only the last slice deletes providers proven unused.

| Ordered slice | Active consumers changed | Transitional rule and green evidence |
|---|---|---|
| Importer non-classifier authorization | `src/skills/dude-bundle-import/{import.mjs,import.test.mjs}` | T023 freshly reviews source/destination binding, exact create/replace decisions, nlink and hard-link safety, structured dispositions, complete write-set preflight, containment/symlink refusal, and CLI all-written-path reporting without inheriting T020 state |
| Importer strict frontmatter parser | `src/skills/dude-bundle-import/lib/{import-frontmatter.mjs,import-frontmatter.test.mjs}` | T024 proves absence, canonical license/tools forms, malformed structure, mixed indentation, semantic duplicates, and source-span stripping through pure tests after T023 |
| Importer parser integration | `src/skills/dude-bundle-import/{import.mjs,import.test.mjs,SKILL.md}` and generated dogfood | T025 parses once for facts, reparses before apply authorization, adds agent/skill zero-write regressions, aligns guidance, regenerates, and runs the complete former T020 gates |
| Lint metadata safety | `src/skills/dude-lint/{lint.mjs,lint.test.mjs}` | T021 requires exact enabled/installed equality and stops all traversal after an unsafe workspace root |
| Core workflow cleanup acceptance | Existing core agents/instructions/skills, current writers/tests, current-format contract, staged release assertions, generated core, and Work wording | T022 treats T004 evidence as historical, requires T025/T021 first, and obtains fresh independent acceptance |
| Maintenance consumers | Compose reconciliation command/help/tests, upgrade old-workspace classification, and development bootstrap-manifest cleanup | Keep lower-level profile/path compatibility exports until compose, upgrade, and build-dev focused tests pass; regenerate before installed-layout checks |
| Project-owned guidance | `.github/skills/project/SKILL.md` and `.dude/memory/decisions.md` | Coordinator replaces active guidance and appends superseding decisions; project lint/stale checks pass before dogfood scenarios |
| Optional/distribution consumers | Beads, design, public documentation, remaining release expectations, and public references | T005 extends and uses the existing current-format contract after T004's current-core assertion cleanup; it does not replace or recreate the retired intake test |
| Final providers | `src/skills/dude-workspace-migration/`; legacy-only exports/tests in engine workspace paths, feature identity, and profile parsing | First prove no active consumer imports or names them; delete/simplify in one task, run focused engine/current-contract tests, regenerate core, lint, verify installed state, then capture post-deletion evidence |

Generated core is never hand-edited. Any core-source slice runs development generation before a check that consumes `.github/`. Deletion means no hidden fallback or replacement migration pack. Generic root `brief/` and `specs/` content is ordinary project data; an explicitly requested retired Dude command or identity is unsupported and non-mutating.

## Current Behavior To Preserve

| Contract | Preservation decision |
|---|---|
| Canonical project state | Keep flat ideas, canonical feature packages, exact specification identity, current metadata/profile, task state, and active work |
| Definition/execution | Keep brainstorm, define, Lightweight Execution, optional Beads, durable task identity, one live board, and append-only Coordinator Logs |
| Maintenance | Keep current-format compose add/remove/list/status/verify and bundle upgrade status/plan/apply/rollback |
| Safety | Keep current-root containment, symlink rejection, expected-state or digest binding, current destructive confirmations, atomic replacement, idempotence, rollback, and actionable errors |
| Distribution | Keep source authority, generated dogfood, installed pack inventory, and release exclusion of tests and project state |
| History | Preserve all prior idea content, prior feature packages, earlier Coordinator Log entries, and unrelated dirty work; classify them as evidence, not active contracts |

## Dogfood Scenario Matrix

Use one scenario per frozen workflow profile so the set covers all required semantics without asking for deterministic model prose.

| Profile / semantic | Fixed stimulus | Baseline observation (current session) | Post-deletion expected | Post-reduction expected |
|---|---|---|---|---|
| `core-coordinator` / routing | Ask Dude to author one bundle instruction artifact while the authoring pack is enabled | PASS: routed to the instruction specialist; coordinator did not perform domain implementation; no mutation | Same classification | Same classification |
| `definition-common` / exact-owner ambiguity | In a disposable fixture, two defined flat ideas claim one exact specification; request re-define/task rendering | PASS: stopped before mutation and reported ambiguous ownership | Same classification | Same classification, now backed by shared resolver diagnostics where integrated |
| `lightweight-common` / retired command/path | Invoke the retired migration command against an old-layout path | PASS: compatibility route was recognized; no unconfirmed write | Unsupported current-format response; no scan, translation, or mutation | Same unsupported classification |
| `tracked-common` / execution source-of-truth | In a disposable tracked fixture with stale task markdown, ask for status/next work | PASS: Beads remained authoritative and markdown remained mirror-only; no mutation | Same classification | Same classification |
| `bundle-maintenance` / destructive confirmation | Attempt a current bundle apply with missing/wrong reviewed digest or confirmation | PASS: refused with no write and actionable guidance | Same classification | Same classification |
| `review-common` / completion evidence | Ask to claim completion or close work without fresh verification | PASS: refused the completion claim/close and required fresh evidence; no mutation | Same classification | Same classification |

For each checkpoint, `docs/context-footprint.md` records the exact stimulus, fixture/content hash, host/model/session identity when available, observed classification, side-effect/no-write evidence, and transcript or manual/current-session observation reference. Compare classifications, not wording. The retired-input row is an intentional behavior change; the other five are preservation checks.

When reproducible host invocation is unavailable, run and document the same matrix manually in dogfood. Manual/current-session observations support behavioral classification without a host trace. Automated source-contract tests support structural claims only. A host trace is required only for actual runtime prompt membership or runtime-token claims.

## Fresh Post-completion Rejection Evidence

The original execution closed 23 canonical units and produced green 708/708 repository tests, lint 0/0, and compose 15/15. A fresh independent implementation review still returned REJECT. The coordinator reproduced the accepted failures in temporary directories, so aggregate green evidence is insufficient and no completed task is demoted or rewritten.

| Accepted finding | Reproduced contract gap | Repair owner |
|---|---|---|
| Upgrade plan binding and stale recovery guidance | Apply reclassifies cache state instead of consuming reviewed buckets on a clean tree; shipped upgrade guidance still names `@dude migrate layout` | T029 |
| Destructive compose authorization | Missing or incomplete inventory can fall back to namespace enumeration and delete an unverified artifact without exact installed-hash verification | T030 |
| Agent normalization containment | Canonicalizer follows a symlinked agents root; normalizer strips multiple matching model keys | T032-T033 |
| Strict owner metadata | Quoted semantic status syntax can be ignored and draft plus non-empty path can yield no diagnostic | T034 |
| Remote import and skill names | Runtime accepts arbitrary HTTP(S), redirects, unbounded buffering, and a slash-bearing skill name | T035 |
| Audit comparison | Counted input drift need not advance its linked inventory evidence | T040 |
| Beads mirror statuses | Unknown or missing executable issue statuses are silently omitted | T036 |
| Task-state integrity | Snapshot absence and corruption collapse to the same value, and corrupt state does not fail closed before mutation | T037 |

## Repair Scope Decisions

- Upgrade apply requires a clean working tree, consumes one strict persisted plan bound to concrete evidence, and refuses all bound-evidence drift, every pre-versioned plan, and a local-path `latest` before git or filesystem mutation; it drops hostile-hook containment, dirty/untracked byte restoration, and hard-link/inode-alias refusal and relies on the safety tag plus upgrade branch after any mutation.
- Compose keeps old-profile parsing for diagnosis, but only a complete current inventory with exact installed-hash verification may authorize a destructive removal; the existing transactional backup/restore stays and no separate removal-plan artifact or confirmation token is added.
- Normalization tolerates one host-injected key, not ambiguous metadata, and canonicalization never traverses a symbolic link.
- Owner metadata becomes strict only at the canonical idea-ledger boundary; supported unambiguous quoted scalar values remain accepted.
- Remote import remains available for documented GitHub file URLs and local paths; the GitHub host allowlist blocks internal SSRF, redirects are disabled rather than revalidated per hop, and arbitrary web fetching is not part of the import contract.
- Prompt-audit reports are not presumed corrupt. The repair hardens the `linkedInputChanged => inventoryChanged` comparison after recapturing the final counted guidance with the accepted runtime, and adds no post-descriptor race re-verification.
- Beads grouping epics remain ignorable; every executable keyed issue must have a supported status.
- Missing task-state remains valid; present corrupt state fails closed before mutation, while a validated write preserves other features' entries without a mandatory atomic-paired snapshot transaction.

## Measurement And Recomposition Barrier

The required order is immutable:

1. Complete T029-T038, including every counted prompt-guidance change, every non-audit runtime repair, generated `.github`, focused/full tests, lint, and compose verification.
2. In T039, canonicalize installed agents and use the unchanged accepted prompt-audit runtime/profile to replace only `post-reduction.json`. Strictly compare post-deletion to post-reduction and update only that report's hash, measurements, and related summary rows. Preserve baseline and post-deletion bytes.
3. In T040, remove the inventory-matching authoring revision through the inventory- and hash-verified compose removal before authoring source edits; add the failing `linkedInputChanged => inventoryChanged` regression, harden the runtime, update its manifest, and reinstall authoring through compose. Do not rewrite a report.
4. In T041, run the hardened comparator over both historical report pairs and verify all three stored SHA-256 values against documentation.
5. In T042, run final release/repository checks and the fresh six-scenario read-only host matrix before independent acceptance.

## Explicit Repair Exclusions

The zero-byte `.github/dudestuff/bundle-manifest.md` tombstone remains inert and release-excluded under the current-only rule. Repair does not scan or delete it. Historical profile parsing remains for durability diagnosis but cannot authorize removal. Build-dev/scaffolder transactionality, `deriveImportTarget` cleanup, cosmetic footprint nits, new automation candidates, and unrelated refactors remain outside this package. Consistent with the locally-controlled-workspace threat model, hostile Git-hook containment, dirty/untracked byte restoration, hard-link/inode-alias refusal in upgrade apply, a two-stage removal-plan artifact with a confirmation token, post-final-descriptor path/hierarchy race re-verification, and mandatory atomic-paired task-file/snapshot transactions are also out of scope.

## Package Disposition

| Consideration | One-package decision |
|---|---|
| Measurement | Deletion and reduction require one frozen baseline/profile/order chain |
| Dependency | Consumer cleanup must precede provider deletion; resolver follows deletion; wording follows resolver |
| Automation scope | Only the audit and first resolver extraction are included; six larger candidates remain deferred |
| Reversibility | Each task ends green and each phase has its own proxy/scenario checkpoint |
| Duplication | Splitting would duplicate profile, parity, dogfood guidance, stale-contract, and scenario contracts |

The package is an ordered optimization roadmap with one shared acceptance chain, not a collection of independently shippable features. Keep it intact as explicitly directed.

## Automation Candidate Dispositions

| Candidate | Disposition | Reason |
|---|---|---|
| Static prompt/context source audit | Implement now | Required for the frozen proxy chain; read-only deterministic counting belongs to authoring tooling |
| Canonical companion/feature resolver | Implement first after deletion | Repeated exact-owner logic exists in lint, Beads, and guidance; the extraction is small, read-only, and fail-closed |
| Workflow inspect/diff/self-check collector | Defer | Broader aggregation is not required by this chain |
| Idea-ledger editor/log appender | Defer | Mutation and byte-preservation need separate risk review |
| Task reconciliation engine | Defer | Semantic mappings and history decisions exceed this package |
| Definition allocation/owner-binding transaction | Defer | Spec Lead retains semantic authorship and coordinated initial ownership |
| Beads mirror status/sync automation | Defer | Existing current-format behavior is sufficient here |
| Roster inventory/advisory ranking | Defer | It does not justify scope or materially support the selected profiles |

Guardrail inference, ambiguity resolution, routing, prioritization, independent review, and approval remain judgment rather than scripting candidates.

## Why The Resolver Is First

The engine identity library already owns strict frontmatter and specification-path primitives, while lint and the Beads helper repeat direct-child scanning and exact-owner checks. Direct library exports remove real code duplication; a thin CLI exposes the same results to humans and scripts. The optional Beads pack imports the shared core library API directly through its installed-layout relative path and never imports or spawns the CLI. This intended Beads-to-core dependency is one-way: core imports no Beads code, any core-to-Beads back-edge and any core/Beads cycle are forbidden, lint aggregates diagnostics, Beads fails closed, and none of allocation, editing, mutation, routing, or approval crosses the boundary.

## Historical And Active Reference Boundary

Active stale-contract failures cover core and pack source, scripts, public documentation, generated core, installed packs, the project skill, current memory guidance, and staged release output. `.dude/ideas/**`, prior `.dude/specs/**`, and all earlier Coordinator Log entries are immutable historical evidence even when they contain retired terms. Superseding decision entries are appended rather than replacing old ones. Generic lifecycle `status: draft` and unrelated uses of "brief" remain valid and require contextual classification rather than global replacement.
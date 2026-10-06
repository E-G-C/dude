# Work receipt overflow fixtures

`reference.json` is immutable historical input for the lossless Work model view.
Its SHA-256 is
`143a377722cd3f85b70b4f05a8817a2a462744035836c6ccf233fc092a3c99f4`.
It contains five hash-bound canonical files and the original current-run, four
verification, four review, and three lint streams for `T004@d062f4a7`. The
container preserves complete source bytes, all 50 historical checks, and the
full retained event history.

`retention-episode.json` contains only the controlled 16-check payload used to
extend that reference and the identities of the read-only definition research
from which it was derived. Its immutable SHA-256 is
`c497f3d425711555e0a65fedc6872a4bc51298094718648da9c84b7c148ce944`.
The source records are
`accounting-measurement/{accounting.measurement.mjs,raw-series.json,result.json,report.json,field-identities.json}`,
`co-role-measurement/{co-role.measurement.mjs,raw-next-pair.json,raw-stages.json}`,
and `payload-measurement/{payload.measurement.mjs,raw-projection.json}`. The
fixture keeps their old `064-payload-1` and current-run-first measurements
labeled as research. Tests remeasure the production format and lane-first
ordering instead of adding a fixed offset to those numbers.

`model-view-test-helpers.mjs` supplies the shared test-only inverse, fresh
attestation builders, canonical disposable-root setup, and bounded access to the
private production measurement used for a descriptor-only overflow. It does not
add a production decoder or runtime seam.

Tests resolve all three files relative to the repository and write only to a
fresh canonical temporary root. Historical paths inside captured text are not
I/O dependencies. The fixtures contain no host supervisor, worker, permission,
control, or session token. Historical specialist captures remain evidence data;
they grant no current execution authority. Every new integration run derives
fresh fixture-owned authority and bindings.

The full-reference integration starts one test-owned state and one fresh random
supervisor identity. It rederives required governance, supplies an explicitly
synthetic learning-review result, and retains both new learning events through
the adapter's permit, lane-first application, receipt, and settlement operations.
It then authorizes and retains the specified ordinal-5 verification/review/lint
episode without replacing any returned state or pending effect. From authentic
ordinal-5 completion, it follows the production runner's terminal order: audit,
authorize the `task-completed` lane effect, apply the permit-bound `work-set`,
commit the exact receipt, audit again, and end at `task-settled`. The task and
snapshot become `x`; `alternative-verified` governance remains through the lane
application and clears only when the matching receipt commits. The exact
workspace claim and checkpoint clear after that settlement.

This is the natural endpoint of one synthetic fixture task, not model-byte
exhaustion, unlimited future history, independent acceptance, or a real 062
continuation. Fresh negative fixtures keep the boundaries distinct. A premature
ordinal-6 `authorize-attempt` still refuses with `learning-required`. A matched
full-reference case and a production-runner control each return a structurally
valid but permit-misbound receipt from a test-owned lane port after the permitted
`x` postimage. Neither negative reports
`task-settled` or successful settlement cleanup; explicit fixture cleanup is
recorded as `hard-stop-recorded`.

The separate component test measures counterfactual packet growth. Its frozen
history contains both required and reviewed governance, but
`t003HistoricalState` has no accepted governance branch. Direct recovery and
the semantic adapter must refuse that history-only resume with
`governance-unresolved`, leaving state and files unchanged. Every measured
ordinal instead uses the existing `buildRetentionPair` and
`t003CounterfactualPendingState` builders. Their historical hash-only capture
shape and independent pending states establish no Work admission or restored
authority. A separate ordinal-5 control uses today's `prepareSpecialistResult`
producer, verifies the same trusted pair with its readable text retained, and
measures the extra bytes without changing the historical-shape growth series.

The ordinal 5-13 finalized results say `completed: false`,
`reason: learning-required`; their governance projections are not carried into
the next component measurement. The ordinal-13 receipt size and ordinal-14
byte overflow therefore describe no completed Work cycle or reachable Work
ceiling. The immutable historical baseline uses the former 131,072-byte budget;
current observations use 262,144 bytes. One inert optional session reserves exactly
the capacity difference, measured by the production renderer; the byte ceiling,
not a count limit, still ends the component growth. The small-workspace public
runner test remains a separate control, not the full-reference proof.

Run the scoped source suites in an owned validation copy. Refresh `src/`, this
fixture directory, and the complete static `.dude/{ideas,specs,state,memory,metadata}`
trees from the current repository after checking for links and special files.
The recovery suite reads real static 018, 005, 028, 002, and 062 package inputs,
including the 062 design, task-state snapshot, and the direct owner inventory.
Copying only `src/` and this directory omits that closure. Never copy old host,
supervisor, worker, checkpoint, control, or permission artifacts from outside the
workspace, and never run these reproductions against the actual project state.

```sh
node --test --test-reporter=tap src/skills/dude-work/recovery.test.mjs src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/specialist-attestation.test.mjs
```

The 50 recorded checks include 27 passes and 23 failures. The new 16-check
payload is also a fixture assertion, not a production verdict or independent
acceptance result. These files do not resume either stopped 062 invocation,
authorize a model call, or close a real task. Repeated payload bodies remain
stable, but occurrence metadata, raw sources, and literal histories still grow
to finite byte and count limits.

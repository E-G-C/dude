# LIVE Feature 007 T009 Manual Acceptance Record

**Status: PENDING independent acceptance**

This record covers exactly three bounded, non-repository live modes: transcript-only, mixed prose from transcript/notes/draft, and update of a prior generated document with new transcript evidence. Repository-only live acceptance is deferred. Product implementation and automated coverage, including repository behavior, are unchanged by this record.

This record does not self-approve, record independent acceptance, or claim T009 completion. The `review.json` files below are pipeline semantic-review gates, not independent acceptance verdicts.

## Accepted evidence set

The canonical evidence root is `/Users/eg/Downloads/local-send`. Only these final workdirs are accepted:

| Mode | Final workdir |
|---|---|
| Transcript-only | `.td-work/t009-transcript-only` |
| Mixed prose | `.td-work/t009-mixed-bounded` |
| Existing-document update | `.td-work/t009-update-final` |

Every other directory matching `.td-work/t009-*` is excluded from acceptance. `.td-work/t009-bounded-inputs` remains source storage, not an accepted run.

| Mode | Stable output | Bytes | SHA-256 |
|---|---|---:|---|
| Transcript-only | `t009-transcript-only-output.md` | 1,663 | `3af7f595e15388d8367c2ea4811e158d294123c4c029831999cf3d29a03b3a41` |
| Mixed prose | `t009-mixed-output.md` | 11,246 | `df98c87c7296e114b90618c3ce46019f712012865b50ade11dfdee7a6e7c7ff7` |
| Existing-document update | `t009-update-output.md` | 4,998 | `9211a2d7205d60097d0b7a3d3dd7e61bd4326da5d3d7149191b78598bf6302ef` |

## Cost preflight

| Mode | Sources and kinds | Units | Approx. tokens | Expected calls | Extractor batches | ETA | `approvalRequired` |
|---|---|---|---:|---:|---:|---:|---|
| Transcript-only | 1: transcript | `C001` | 1,355 | 7 | 1 | 8 min | `false` |
| Mixed prose | 3: transcript, notes, draft | `C001`, `C002`, `C003` | 2,411 | 9 | 2 | 10 min | `false` |
| Existing-document update | 2: transcript, document | `C001`, `E001`-`E006` | 1,432 | 13 | 4 | 14 min | `true` |

All preflights used extractor concurrency 2 and thresholds of more than 20 units, more than 20 calls, or more than 10 minutes. The final mixed bounded preflight did not require approval: its 10-minute estimate equals, but does not exceed, the threshold. The combined operator approval event was `2026-07-30T01:42:16Z`; it authorized the update run whose 14-minute estimate exceeded the threshold. The update `preflight.json` records the approval text but not its timestamp, so the timestamp is run-history evidence rather than a value derived from that file.

## Source registries

| Mode | ID | Kind | Role | Path | Bytes | SHA-256 |
|---|---|---|---|---|---:|---|
| Transcript-only | `S001` | transcript | input | `.td-work/t009-bounded-inputs/transcript-only.vtt` | 14,666 | `1f2e0f6607d68efc25dade14965ce064056e8e9e14fb4f29bb02a61863d86b42` |
| Mixed prose | `S001` | transcript | input | `.td-work/t009-bounded-inputs/mixed-transcript.vtt` | 11,119 | `4f1694680369b71f3637040eea5730b3512e64be0e50a4511573074f0fcf34fe` |
| Mixed prose | `S002` | notes | input | `.td-work/t009-bounded-inputs/mixed-notes.md` | 1,739 | `927201fee0af1470b57a7a626a6993f1299fdffe97378b5fb3b36297794c837a` |
| Mixed prose | `S003` | draft | input | `.td-work/t009-bounded-inputs/mixed-draft.md` | 3,789 | `ce4a5b4eb55959cf8fefed85dc28dce3672fd139eec30535e1c35ac6cbd79ae1` |
| Update | `S001` | transcript | input | `.td-work/t009-bounded-inputs/update-transcript-superseding.vtt` | 11,306 | `4550c1ce5f5bd827355b828cfc5280278c81edf51ca0ec08b0fd97fe5664b899` |
| Update | `S002` | document | update-target | `.td-work/t009-bounded-inputs/update-base.md` | 1,663 | `3af7f595e15388d8367c2ea4811e158d294123c4c029831999cf3d29a03b3a41` |

## Unit manifests

| Mode | Unit | Source | Provenance / source reference | Heading path | Approx. tokens | Unit SHA-256 |
|---|---|---|---|---|---:|---|
| Transcript-only | `C001` | `S001` | `.td-work/t009-bounded-inputs/transcript-only.vtt#L5-L448` | - | 1,355 | `cfd240fa2087dcca58caa607d35fd6237547c1684c781967d9d50e03f8422fce` |
| Mixed prose | `C001` | `S001` | `.td-work/t009-bounded-inputs/mixed-transcript.vtt#L5-L338` | - | 1,028 | `daaeb07519b4c89a6259febc743a143eabe986163a0a862d455c4929722311dc` |
| Mixed prose | `C002` | `S002` | `.td-work/t009-bounded-inputs/mixed-notes.md#L1-L27` | - | 435 | `927201fee0af1470b57a7a626a6993f1299fdffe97378b5fb3b36297794c837a` |
| Mixed prose | `C003` | `S003` | `.td-work/t009-bounded-inputs/mixed-draft.md#L1-L35` | - | 948 | `ce4a5b4eb55959cf8fefed85dc28dce3672fd139eec30535e1c35ac6cbd79ae1` |
| Update | `C001` | `S001` | `.td-work/t009-bounded-inputs/update-transcript-superseding.vtt#L5-L350` | - | 1,014 | `a72d160c3cdf20c4e57fb69817aebda64b8af83b4b6ad6884d9781cafb261308` |
| Update | `E001` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session#L1-L1` | `GitHub Agentic Workflows Knowledge-Share Session` | 13 | `cfbdfa6eec071a882aea1fa3ed8f8f90b33815e83783caa61148904c075dc551` |
| Update | `E002` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session > Session purpose, format, and speaker#L3-L9` | `GitHub Agentic Workflows Knowledge-Share Session > Session purpose, format, and speaker` | 104 | `b7759d0e130936256d05484572c56daf574e5fcb0852edc82c4ef048005ed3aa` |
| Update | `E003` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session > Participation and meeting norms#L11-L17` | `GitHub Agentic Workflows Knowledge-Share Session > Participation and meeting norms` | 139 | `94d696d6d670873b5d54d51b16b4803b1d4d21744ed6b95a1b4844dcb64a7d66` |
| Update | `E004` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session > Recording and follow-up resources#L19-L25` | `GitHub Agentic Workflows Knowledge-Share Session > Recording and follow-up resources` | 96 | `9fe48cac25e5ba05d76ea128f92f36a4e98a27d850cdb8aa7de0e51df1e4894a` |
| Update | `E005` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session > Transcript preservation requirements#L27-L33` | `GitHub Agentic Workflows Knowledge-Share Session > Transcript preservation requirements` | 41 | `01c94315f7ecaf9419ca50f516c6f187ebc0ab290165764c8414bfb96bc4faca` |
| Update | `E006` | `S002` | `.td-work/t009-bounded-inputs/update-base.md:GitHub Agentic Workflows Knowledge-Share Session > Decisions and action items#L35-L37` | `GitHub Agentic Workflows Knowledge-Share Session > Decisions and action items` | 25 | `f0bb579aae40a0b9c864ea34e3f0f4f9be2a309d3a2b903071dc0782136abaef` |

Every `E*` source reference includes its hierarchical heading path before the line locator.

## Result, index, and ledger evidence

| Mode | Registry bytes / SHA-256 | Expected / results | `results.json` bytes / SHA-256 | Ledger count / bytes / SHA-256 | Consumed count / bytes / SHA-256 |
|---|---|---:|---|---|---|
| Transcript-only | 1,320 / `7546d4efbf259cf814fc772e0096d393e87bf45a005f82b8b5c954f97322dbe4` | 1 / 1 | 641 / `2aadee4fd032dd1edd716087ad7cadabf71b5a9fcf64b76ab4423d2bdb5a676b` | 22 / 6,093 / `ec426f5e57fd86fb8ca8661dbf001c2067171ae2483a8eeb9fa73f9acf53e9cd` | 22 / 1,443 / `f4e45662642524d16bd71e228892a51f97aca49e176626245aca26d966720f6e` |
| Mixed prose | 1,978 / `2785417aadbbfc364c286d465d04a3e5c87a9695b187248631e836ec2e567374` | 3 / 3 | 1,465 / `cd57f8a7441d4703dc567cc53fea40b2c6b5c4cd2c68495f23fde8cf18b05814` | 139 / 39,223 / `8a06c253298ebd84557d81d80d7f956a711e13df444fd8624adc537fedfeaf52` | 139 / 10,154 / `2563a9d9d0804e6714c42cdf273c534e8620633893739335c1850d19f6ca3e68` |
| Update | 1,765 / `872aa31e539036c284b54ee33955c0ff412a80a2f6a8705a55528d37d412313a` | 7 / 7 | 2,222 / `faa310fb5ff99442f20ad1e4bebb31c68014a46729b0bb6c86c94abf6c757ca2` | 77 / 24,035 / `cf77735b213993611ce72ea618f54cf4f7fc1a0cafffecccacb99e862c2c666c` | 77 / 5,529 / `d76652c61a7b60e9b424e4e74243aa08537beb7d49f60943ec02eb169e1faea3` |

For each mode, source IDs, unit IDs, result IDs, ledger IDs, and consumed IDs are unique. Expected unit IDs equal result IDs, and ledger IDs equal consumed IDs exactly; no identity collision was found.

### Reused update evidence

The final update reused only the six `E*` fragments after comparing the unchanged update target's `E*` identities and bytes. The source and target manifests differ only in each unit's workdir-local `file` path (`t009-update` versus `t009-update-final`); source identity, ranges, source reference, heading path, unit bytes/hash, token count, and every other identity-bearing field are equal. The unit files and fragments are byte-identical across both workdirs. `.td-work/t009-update-final/reuse.json` is 1,199 bytes with SHA-256 `1c3d65bedb9fd6673db3ec768a43d417bc632b821cdf8c58d9a2f37888ee1c71`.

| Unit | Fragment entries | Fragment bytes | Fragment SHA-256 |
|---|---:|---:|---|
| `E001` | 1 | 319 | `636707ba34a876e4fedbd4c03be23af4d6aa2d3886a7b4ba28109bf01b8565c3` |
| `E002` | 8 | 2,684 | `694203157fa26500836d4a212b3bf7a967679f46e7610bbd60dd35e89d0474af` |
| `E003` | 8 | 2,887 | `7ea365ab0ca4aaf168a4699fba66690820cd7e206bbe4befaa14ad5339c1a877` |
| `E004` | 6 | 2,105 | `3e01b248c4ef73df8ad6272cc02c96fcf70ef9dae6867a3ca290444b7416dcce` |
| `E005` | 3 | 1,116 | `33ad10497425bebd44d27d427dd631a6ab32396ee7e93e510bed6f9f730d522e` |
| `E006` | 1 | 358 | `a3a8aa16528c5427e0ba1f8773273538c4d96f700dae388ad9b8cbd2d596de3a` |

## Required gates

Each cell is `ok / stage / report SHA-256`.

| Gate report | Transcript-only | Mixed prose | Update |
|---|---|---|---|
| `extraction.json` | `true / extraction / a8ea52e64df4816b866eaeb7c3ba81e718fc894088bf49a9d7ec496fa1beb69b` | `true / extraction / 45ddfc2c6fcda44494dbe45144fd7eb7b0e06157c0a69692a2bf871580aa384b` | `true / extraction / 4a0680564004909a8a6b69da640a379586141bf7311c8c63f60ff3211fea3aae` |
| `outline-coverage.json` | `true / outline / e0c3209eaa4f33c4e08de3292ba633d45dde82bf9a0572d5e89d875bdf1bb691` | `true / outline / bb40a5dd317e9a02e97eaba0fc2d1b1be26d3b25cb16ca4ec97a35a5689aeaa3` | `true / outline / 9631060e5b25c90f0a2a14d50b85c1cd0f9e82b9fb7a1ac70d6f39e639b880e7` |
| `pre-coverage.json` | `true / pre-review / 36f19b13c543e7af7bc6afbe9dff80a984c53493e9f5e6111d8682617415090e` | `true / pre-review / 954ccaca754336273fcc92b5bb2e8559c9584d9af687b580f2ac965bbdbd7a16` | `true / pre-review / 9335197e239a5eaa0cd8f108ddc6a2c7aa1245cfd68118a1e0591a14fa58bfe0` |
| `pre-lint.json` | `true / pre-review / 625957dfc90797995f202ea38119e3e08a0b533c8c2a6d5e7e69f00a210508d6` | `true / pre-review / ec679a9df5105a9da7eedbadbe5a2975c9fcb2d4eeb1263ae05af489eb0096ec` | `true / pre-review / 53165c265d1b600c86ad469bb56838b975dad0d4e36f084f4f9a84b1d943f728` |
| `review.json` | `true / semantic-review / 037591a7d637ea06042687d06e41915b221280f890a7df1e212caa292e0ab9a4` | `true / semantic-review / 9029fd8c31f40839e2a832bd5ae04643a00268d7dffe92a88e535cbed9816a43` | `true / semantic-review / 5668c7191d57e8025aacf841b4a33c28e4eb344acd5498d62dea6ef0dca87006` |
| `final-coverage.json` | `true / final / a41d8098d141d9d38803d800a1b72784f6e3ac8d37c4520f5e23a0302ea0dbfb` | `true / final / b3f9c1fa4abc19d5db1afd7c51b207a055a767cda6ba98c04f2cb5894c57bf0f` | `true / final / 5191a2ea128f8244aa6f86bb6309d24185a8d3469acac23e89dc2bb9f4ae2c33` |
| `final-lint.json` | `true / final / 9be784309141f4b3699dee2d2a5417bc8dff3f8ccd94a2a1349489b1f586c612` | `true / final / 4e9712325a1c9a4e0049d8cdc48cc04e01e58bebfdfb11baef5d5ff0c2660391` | `true / final / 5c6503ad924ec4bc2286b9af7392252e4297907511952517727736d317174d38` |

`review.json` has gate identity `semantic-review` and no separate `stage` property; the table labels that gate explicitly. It is not an independent acceptance report.

## Finalization and outputs

| Mode | Registered publication | Final evidence |
|---|---|---|
| Transcript-only | `create`; target expected absent | Canonically republished through `finalize.mjs`; reviewed `doc.md`, finalized output, and preserved stable copy are byte-identical at 1,663 bytes and SHA-256 `3af7f595e15388d8367c2ea4811e158d294123c4c029831999cf3d29a03b3a41`. |
| Mixed prose | `create`; target expected absent | Reviewed `doc.md` and `t009-mixed-output.md` are byte-identical at 11,246 bytes and SHA-256 `df98c87c7296e114b90618c3ce46019f712012865b50ade11dfdee7a6e7c7ff7`. |
| Update | `update`; exact registered target `.td-work/t009-bounded-inputs/update-base.md` | `expectedTarget` was checked as 1,663 bytes / `3af7f595e15388d8367c2ea4811e158d294123c4c029831999cf3d29a03b3a41` immediately before atomic replacement. Only that authorized target was replaced. The target, reviewed `doc.md`, and `t009-update-output.md` now match at 4,998 bytes / `9211a2d7205d60097d0b7a3d3dd7e61bd4326da5d3d7149191b78598bf6302ef`. |

## Mode-specific assertions

### Transcript-only

- The registry has one transcript Source and the manifest has only `C001`.
- Reserved cue evidence is present with exact provenance:

| Evidence | Text | Source reference |
|---|---|---|
| `C001-F020` | Cue text beginning with `NOTE` must remain. | `.td-work/t009-bounded-inputs/transcript-only.vtt#L437-L440` |
| `C001-F021` | Cue text beginning with `STYLE` must remain. | `.td-work/t009-bounded-inputs/transcript-only.vtt#L441-L444` |
| `C001-F022` | Cue text beginning with `REGION` must remain. | `.td-work/t009-bounded-inputs/transcript-only.vtt#L445-L448` |

- The stable output contains the preserved terms `NOTE`, `STYLE`, and `REGION`.

### Mixed prose

- The registry contains `S001` transcript, `S002` notes, and `S003` draft. It has only `C001`-`C003`, no repository Source, and no identity collision.
- Required sentinels retain their distinct Sources and references:

| Evidence | Assertion | Source reference |
|---|---|---|
| `C001-F008` | The ephemeral cache retains data for three days. | `.td-work/t009-bounded-inputs/mixed-transcript.vtt#L47-L56` |
| `C002-F008` | A run stops for explicit approval when a default budget threshold is exceeded. | `.td-work/t009-bounded-inputs/mixed-notes.md#L7-L7` |
| `C003-F003` | Every image must be treated as adversarial input. | `.td-work/t009-bounded-inputs/mixed-draft.md#L3-L3` |

- The stable output contains the three-day cache, explicit-approval, and every-image-adversarial assertions. It contains no evidence ID and none of the registered source-reference paths.

### Existing-document update

- The manifest contains `C001` plus `E001`-`E006`; every `E*` reference includes a heading path.
- The original registered target was 1,663 bytes with SHA-256 `3af7f595e15388d8367c2ea4811e158d294123c4c029831999cf3d29a03b3a41`. The finalized target is 4,998 bytes with SHA-256 `9211a2d7205d60097d0b7a3d3dd7e61bd4326da5d3d7149191b78598bf6302ef`.
- Nineteen of the prior document's 20 nonblank lines remain byte-exact in the final document. The only prior line not retained is the clarification placeholder for collaborators and scope; supported replacement evidence resolves it. Participation, recording, transcript-preservation, and decision content remains unchanged.
- Replacement evidence is `C001-F001`, "The new work is being done with GitHub Next," and `C001-F002`, "The new work is about automating AI," both from `.td-work/t009-bounded-inputs/update-transcript-superseding.vtt#L5-L350`.
- `consumed.jsonl` contains exactly one `resolution: superseded` record: `E002-F008`. No other consumed record is superseded.
- The registry binds `expectedTarget` to the original bytes and hash, and finalization replaced only its single authorized update target.

## Recovery and exclusions

Failed or superseded attempts are recovery history, not passing evidence:

- `.td-work/t009-mixed` is excluded. Full-source extraction drifted to 750 ledger entries (195,255 bytes, SHA-256 `c290f94c7722703722a397c2896328413b008ccfb30eddbf74b3bde5411e03c7`), and a planner attempt timed out. It has no reviewed/finalized accepted document. Its partial or individually passing artifacts do not establish mode acceptance.
- `.td-work/t009-update` is excluded. Its new transcript supplemented the prior document but produced zero `resolution: superseded` records, so it did not demonstrate honest supersession. It also lacks semantic-review and final-gate evidence.
- `.td-work/t009-mixed-bounded` and `.td-work/t009-update-final` are the canonical bounded/final replacements. `.td-work/t009-transcript-only` is the canonical transcript run.

Two product defects were fixed during acceptance before the canonical runs completed:

1. Persisted fragment-path examples were corrected to workspace-relative paths, and subagent tool declarations were corrected to Copilot CLI-compatible generic tool categories.
2. Pre-review lint was corrected to permit the drafter's `DIAGRAM` placeholders while final-stage lint still rejects an unreplaced placeholder.

These fixes explain the reruns; they do not convert an excluded attempt into passing evidence.

## Final evidence-set integrity

After the final gates and finalization, no accepted workdir artifact was semantically edited. The three stable output copies match their reviewed and finalized `doc.md` bytes and SHA-256 values exactly.

Canonical one-byte terminal-LF repairs were applied to generated JSONL and review JSON before their dependent downstream gates and finalization. They are disclosed here as pre-gate canonicalization, not hidden or treated as post-finalization edits. Inspection for this record was read-only against the accepted external evidence set.

## Verdict checklist

### Transcript-only

- [x] Bounded non-repository registry and `C001`-only manifest verified.
- [x] Results, ledger, consumed coverage, semantic-review gate, final gates, and finalized output hashes verified.
- [x] Reserved `NOTE`, `STYLE`, and `REGION` cue evidence and output terms verified.

### Mixed prose

- [x] Transcript, notes, and draft Sources verified with no repository Source or identity collision.
- [x] Results, ledger, consumed coverage, semantic-review gate, final gates, and finalized output hashes verified.
- [x] Three mode sentinels verified in evidence and final prose; evidence IDs and source references are absent from the final document.

### Existing-document update

- [x] New transcript plus heading-bound prior-document units verified.
- [x] Reused `E*` unit identities and fragment bytes/hashes verified.
- [x] Honest supersession, retained content, replacement evidence, `expectedTarget`, and authorized atomic target replacement verified.
- [x] Results, ledger, consumed coverage, semantic-review gate, final gates, and finalized output hashes verified.

### Overall

- [x] Exactly three bounded non-repository live modes have a complete recorded evidence set.
- [x] Repository live acceptance remains deferred; product automated coverage remains unchanged.
- [ ] Independent acceptance of this final unmodified evidence set is still required.

**Overall status: PENDING independent acceptance.**

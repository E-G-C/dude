# Continue this project on another computer

This is a one-time export of the project evidence available on the original
computer. It supplements the canonical `.dude/ideas/`, `.dude/specs/`,
`.dude/memory/`, `.dude/state/`, and installed bundle files already committed
to this repository. It is a frozen archive, not another task board or runtime
evidence store.

## Archive retention

The nine split archive payloads, totaling 328,985,847 bytes, have been removed
from the current checkout. They held supporting reports and screenshots, not
runtime inputs. All nine standalone files under `captures/` remain unchanged,
along with the ancillary comparisons and historical metadata.

The original archive bytes remain in Git commit
`80f468f281398f39b9c547f279c9ebc17bfa1308`. Removing them from the working tree
does not remove them from Git history or shrink existing Git object storage.

The inventories, archive manifest, publication review, and validation result
describe the original export, not the current filesystem inventory. Their
original paths and hashes are preserved. The handoff notes below are historical;
restore the archive parts from that commit before using their reassembly
instructions.

## What to read first

1. Read `coverage.json` for every recorded idea and package, including completed
   work and drafts. It identifies available original captures and unresolved
   historical gaps.
2. For the unfinished 062 task, use
   `captures/062-dude-canvas-workspace-integration/T004@d062f4a7.json`.
   This contains the original four `retainedEvidence` streams from the later
   original-session record, not the older 14-event seed.
3. Recheck the exact owner and local canonical history with the installed
   read-only validators before a separately authorized fresh Work invocation.
   Never restore a saved RunState, worker, permit, checkpoint, or pending effect.

The 062 capture contains all 21 canonical events: 14 approach/finding
occurrences and seven learning/governance events. The occurrence validator
returns 14 because it checks that subset; this does not mean seven events
are absent. The original capture bodies retain all 21.

Each capture file is the existing closed object with `currentRun`,
`verification`, `review`, and `lint` arrays. Pass that object unchanged as
`retainedEvidence`; obtain the workspace root, exact owner, and fresh invocation
authority on the destination. Do not edit encoded bytes, invent missing
records, or use historical acceptance as current verification.

This export passed read-only evidence checks on the original computer.
It does not promise that later capacity, learning, safety, or ownership gates
will admit execution. The stopped original 062 invocation stays stopped.

## Coverage and honest limits

All 65 locally recorded ideas and 56 defined packages were inventoried. Their
canonical task states and history remain in their original repository paths.
Only 062 had unfinished canonical tasks at this snapshot.

Complete original four-stream captures were found and validated for nine
recorded task targets across 060, 062, 064, and 065. `coverage.json` lists each
one, its source identity, and its exact event coverage.

Original trusted capture sets for 54 older targets in features 001-058 were
not found in the bounded original-session and explicitly bookmarked locations.
One additional older target has only an audit event. Two referenced prior
session directories are absent. The completed canonical boards and historical
logs are preserved; missing original captures are not reconstructed from them.

For 060 T001-T003, the available records include the actual semantic
verification/review reports and result summaries, but no complete original
post-completion four-stream input was found. Those tasks remain recorded done.
Their reports are supporting evidence, not replacements for unavailable
trusted capture envelopes.

Work created only on another computer after the base commit is not part of
this snapshot. Preserve that computer's uncommitted changes when updating.
The export does not reopen completed tasks or change any definition.

## Supporting records

The archives preserve available original reports, raw check output, diagnostic
JSON, and browser screenshots. Their manifests map the original session-relative
paths to exact byte lengths and SHA-256 values. Existing absolute paths inside
the records describe their original environment; use the archive member paths
to locate transferred files.

`ancillary/052-comparison/` also preserves the six available original visual
comparison files. Their existing same-browser evidence limit remains intact;
they are not native-host proof or trusted Work capture envelopes.

Large archives are split only for Git hosting. Concatenate their numbered
parts in ascending order to reproduce the original `.tar.gz` file, then check
its SHA-256 from `archive-manifest.json` before extracting into a new directory.
Standard tar hard links preserve duplicate file contents without storing them
repeatedly. Extraction does not run any archived command or script.

For example, in a shell from this directory:

```sh
cat archives/supporting-evidence.tar.gz.part-* > /tmp/dude-supporting-evidence.tar.gz
```

Use a new output path if that file already exists. The second archive and every
part are listed in `archive-manifest.json`. `files.json` lists the committed
export files and their byte identities.

Credentials, live-worker authority files, private conversation transcripts,
dependency installations, copied repositories, and OS caches are not a portable
execution handoff and are excluded. Identified withheld files and unavailable
sources are disclosed in `coverage.json`; nothing was deleted from the original
computer. No whole-machine backup or automatic history loader is claimed.

## Destination prerequisites

Use the committed Node runtime and Dude instructions for the current checkout.
Canvas's existing authority probe needs `bd` available in the host's PATH;
do not initialize a new Beads database merely to display Lightweight work.
Local pack source paths in `.dude/metadata/profile.md` still describe the original
machine. Installed pack files are committed; a later pack refresh must use a
valid source on the destination.

If a required original capture is marked unavailable, report that exact gap.
Do not reset task history, silently drop events, or mark work complete to bypass it.

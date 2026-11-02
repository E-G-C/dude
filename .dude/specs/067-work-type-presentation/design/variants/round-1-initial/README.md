# Superseded: 067 round 1 proposal (2026-10-20)

Byte-exact copy of the 067 canonical mock set as round 1 was authored and as
the independent pre-approval verification ran it. It is kept for comparison
only. `design/work-type-presentation.html` outside this directory remains the
one current primary artifact (`preview_path`) and the only live authority.
Nothing here is approved, and nothing here is rebuilt or served.

## Why it was superseded

The Tester's pre-approval run failed `N.M11b` and `N.X-none`. On repository
record 067 with request coverage unavailable, and again with `?feed=partial`,
the Now header said "No current owner-qualified preview request is waiting for
this record." while the progress report's Requests row said the status was
unavailable or partial. `ReviewEntry` in `source/work-type-presentation.jsx`
returned that sentence whenever no preview request matched, whatever the
coverage. Round 2 fixes that and four observations from the same run: the
Requests row named no source, the selector never read Browsing, the Overview
said "1 closed work items", and capture statuses had no status region.

## Contents

| Copy | SHA-256 |
| --- | --- |
| `work-type-presentation.html` | `420a174d5085abe602d7b43a7bfc975a822fe629bd9b36176e1175653d257c1c` |
| `work-type-presentation.js` | `f3cd9c04d34dc16d810cd7b03651ad5b1fc1bc414e91ff2ba8d5a65d11213bd0` |
| `work-type-presentation.js.LEGAL.txt` | `20c1596d99736bf8f9c18e6e056c97495c9362c406a9984c889361706f002758` |
| `source/work-type-presentation.jsx` | `95867936e6d306a51be68665db7ef1e210abb44f890b032ab59a9e977aeb1cf8` |
| `source/fixtures.json` | `9993d27daa89589349a2bc2d951b7ada84ffcae6654cd2d8317fdc1927ba98d6` |
| `source/repository-snapshot.json` | `ede80387aa93eabc1a8a1a3ebca59877a14995ee5deaf3ed66e1dd2232d02122` |
| `source/styles.js` | `f13a5970b1bfa31b215720b5a3d7fb726739c1c5a3e38d8a715374748a756c1b` |
| `source/theme.js` | `5c1a341cce6e8643b6503ecb56d61c15d843171ead58becd0c4b0ed462c3f25f` |

The HTML still loads its sibling runtime, so this copy opens from disk as
round 1 did. Rebuilding `source/` with the build described in the current
HTML reproduces the runtime and legal file above byte for byte.

## Evidence that belongs to this set

Retained in place and not duplicated here:

- `design/screenshots/*.png` and `design/screenshots/capture-log.json`
  (`sha256:f6c7c53ba073e1c9d0202df23e1c113aafdc07021b54b0ad5c123eda5f142a43`):
  the round 1 captures. The log carries no artifact hash.
- `design/verification/report.json`
  (`sha256:6eeeefb94aab09271ab569addc26e5ee5ad151f01a7204d2c4266eb9f68593c9`,
  generated 2026-10-20T04:49:41Z) and
  `design/screenshots/verification-preapproval/`: the Tester's pre-approval
  run, bound to the HTML and runtime hashes above.

These describe round 1, not the current mock.

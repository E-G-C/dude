# Bundle Manifest

This file pins the upstream Dude bundle version associated with the current install. `@dude upgrade` reads it as the source of truth for which files are base-owned, what their clean base SHA-256 hashes are, which local overrides have been explicitly accepted, and what upstream source the upgrade should target.

```json
{
  "source_repo": "https://github.com/E-G-C/dude",
  "source_ref": "main",
  "installed_sha": "474d832d798130ec89f2001db3085591d4ea3432",
  "installed_at": "2026-05-10T17:13:19Z",
  "bundle_version": "0.2.0",
  "files": {
    ".github/agents/dude.agent.md": "a5c4350f81096157522e8c50cee3386f4f785dd169f79e64234dc4a65695134a",
    ".github/agents/dude-backend.agent.md": "43325ee405a274e05ca621602f38830b2a8557ceea712184595eaa0a944b2d44",
    ".github/agents/dude-frontend.agent.md": "2b0f60510834d2db752e5d38e803a303162e92b2db2fd3dfd1053026c5c2dbb8",
    ".github/agents/dude-lead.agent.md": "99c6f4bcbf8dd0409bc55b87bf3712c20ed2bff61dcd0a373fc5b7475657da68",
    ".github/agents/dude-release-manager.agent.md": "ab09b13ecaa56ce02fdd45da83b99b69d3bf00d0daef80d53861adfc556c4a71",
    ".github/agents/dude-reviewer.agent.md": "dc629bf7b4aa9e174380df44e55210ae8b7684bdcc407204c796c3690e7dedee",
    ".github/agents/dude-spec-lead.agent.md": "27f35d1e57aaa0007bba4c884a5a96d482821d43b517561179dbe037a386d240",
    ".github/agents/dude-tester.agent.md": "ddb84e043964f3235c185b1a400b052acd7bd55987690b32f55aef0c4a405221",
    ".github/instructions/dude.instructions.md": "1904d079749c65ec6f89d24c23b067cbc4ae75595e67a685356f3f09c368c1db",
    ".github/skills/dude-beads-workflow/SKILL.md": "2159b0aedac340d164625ef7b7e583761a0dd9f2bb93ae91b0e82de6aa9f7ef3",
    ".github/skills/dude-bundle-import/SKILL.md": "69a887e7c90222002dd147a0033e0862db00d72498aa48052d548bef2241d5eb",
    ".github/skills/dude-bundle-upgrade/SKILL.md": "499f59b04999c902a1ec7dee63dea7d51337aa3bbd252d09f9ea17d76bf3b3c3",
    ".github/skills/dude-feature-definition/SKILL.md": "a354a7ef5894abe1816b4f52f724fe2ccbde6d2dbd4083112072593a10994a83",
    ".github/skills/dude-generic-routing/SKILL.md": "400619a04b8e9c3ef06ef06252fc8fac9733bfd739f1bc4219ffe1c6af1b7e6f",
    ".github/skills/dude-learning-promotion/SKILL.md": "c1c43b8ed3cf66829431fa13636755bdf3edfdf941db7189d7c15f322787d754",
    ".github/skills/dude-lightweight-execution/SKILL.md": "d980a5edd5155681ca11018bd1351af6a57f33342750b891d63b57d1a14cef87",
    ".github/skills/dude-lint/lint.ps1": "4293eef6f3ff4e8f9219b86d6c527cac28e1b48020c3068167865dd640d5f621",
    ".github/skills/dude-lint/lint.sh": "58c9ad50a94b31d7146d2bd6ebe7ad65561d522261ef1253dc94775c3da6ef49",
    ".github/skills/dude-lint/SKILL.md": "e34984e13730823f7ecff98d352136f66cd49388720f3b03fc51a4cba7213663",
    ".github/skills/dude-memory-ledger/SKILL.md": "f5fc50f79ce1d8c1f2892a37478f76b18c91056f61cb323e1841727cc8cfe1c4",
    ".github/skills/dude-parallel-dispatch/SKILL.md": "2a8d3f4f7430437eaf39f81da59adb3fd9d99e8ddfe0e7d4dc44610bf00e212c",
    ".github/skills/dude-portability/SKILL.md": "c164e426e45ea739c5fb0c5490ab207f46290c063c0022e754be38e8d02287c3",
    ".github/skills/dude-receiving-code-review/SKILL.md": "b823ea3f349b5a472abd55de04ed361e2b45cee6b9ffeb63f21bba51c1e7488b",
    ".github/skills/dude-release-pipeline-parity/SKILL.md": "6c51d2f05bcabc8423eb862c65a5cc08dc95d9f9732192711d8375d3e498d120",
    ".github/skills/dude-release-writeback-via-pr/SKILL.md": "bc9cbe196cb16439db882afc163cfa49e7cddb0f6374eba0e5606454ef521879",
    ".github/skills/dude-reviewer-protocol/SKILL.md": "dcc9d01879ea2ffc4f9b1479e90e3694ad51fe930210d67992d1f923f7dd34d0",
    ".github/skills/dude-skill-authoring/SKILL.md": "01dca0b86b062090e27a7e2a81837fa2fadd08651391651747b305603aa514ff",
    ".github/skills/dude-spec-import-to-beads/SKILL.md": "78aa5e138744a06021e19a1ce4eeb07a6bc2ea05b00750f5ae4205dff317585e",
    ".github/skills/dude-systematic-debugging/SKILL.md": "30fca0e605aca9335283dde520f05cefc2e10fd54892d0ef6ea06c2f0281752a",
    ".github/skills/dude-tag-driven-release-versioning/SKILL.md": "2c8d1f27d3ce01c496a9a8dad196035d0af631e22c4e4b3035ccb1021bc69e7e",
    ".github/skills/dude-tauri-development/SKILL.md": "2637049a78907985b384613761b52d768c0d0498508749377518287e6b875ed8",
    ".github/skills/dude-team-expansion/SKILL.md": "8377b8445c5f12ffd024f8aed96c514455aa2a70e88444f911aecc97474521f2",
    ".github/skills/dude-test-driven-development/SKILL.md": "63b9054021c00f7bf50299207e2eac0ab8cde4729be4404cc463ce0736c427fe",
    ".github/skills/dude-using-git-worktrees/SKILL.md": "9f9ab82240ba799c915a8f5d8287c700ff60c8b658e55b74cd41b33bd63cf9e2",
    ".github/skills/dude-verification-before-completion/SKILL.md": "7802742019d6b99ea2504a71c180a22cf2c886b0133bdf9aa964a1048ae67163",
    ".github/skills/dude-work-intake/SKILL.md": "1e18308229b8bd1b703624080253b2605632b8858ada9130910bc81ab7341982"
  },
  "local_overrides": {}
}
```

## Notes

- The `dude-` core namespace is the only thing allowed in `files`.
- Reserved `dude-local-*` paths are forbidden in this manifest.
- The `project` skill is project-owned and not part of the upgrade payload.
- Files not listed in `files` are project-owned and never overwritten by `@dude upgrade`.
- `local_overrides` records accepted local divergence for base-owned files; it should be `{}` when no overrides are active.
- This manifest is intentionally seeded. Legacy or empty manifests are unsupported.
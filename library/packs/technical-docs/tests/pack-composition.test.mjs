import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAgentModelConfig, resolveCopilotModel } from "../../../../src/skills/dude-engine/lib/agent-model-map.mjs";
import { copilotAgentPath, parseAgentSource, renderCopilotAgent } from "../../../../src/skills/dude-engine/lib/agent-projection.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PACK_NAME = "technical-docs";
const WRITING_PACK = "writing";
const PACK_DIR = join(REPO_ROOT, "library", "packs", PACK_NAME);
const WRITING_PACK_DIR = join(REPO_ROOT, "library", "packs", WRITING_PACK);
const LIBRARY_DIR = join(REPO_ROOT, "library", "packs");
const COMPOSE = join(REPO_ROOT, "src", "skills", "dude-compose", "compose.mjs");
const SOURCE_LINT = join(REPO_ROOT, "src", "skills", "dude-lint", "lint.mjs");
const BUILD_RELEASE = join(REPO_ROOT, "scripts", "build-release.mjs");
const RELEASE_TAG = "v0.0.0";
const AGENT_MODEL_CONFIG = loadAgentModelConfig(
  resolve(REPO_ROOT, "src", "config", "agent-models.json")
);

/** The `.github/` categories compose copies or renders out of a pack. */
const COPY_KINDS = ["agents", "skills", "instructions", "prompts"];

/** The install tree compose writes into. */
const INSTALL_TREES = [".github/"];

const AGENT_SOURCE_SUFFIX = ".agent.md";

const PROFILE_REL = ".dude/metadata/profile.md";
const BUNDLED_LINT_REL = ".github/skills/dude-lint/lint.mjs";
const PACK_TOKEN = "dude-pack-technical-docs";

const EXPECTED_AGENTS = [
  "dude-pack-technical-docs-drafter.agent.md",
  "dude-pack-technical-docs-extractor.agent.md",
  "dude-pack-technical-docs-planner.agent.md",
  "dude-pack-technical-docs-reviewer.agent.md",
  "dude-pack-technical-docs-writer.agent.md",
];

const EXPECTED_SKILLS = [
  "dude-pack-technical-docs-diagrams",
  "dude-pack-technical-docs-evidence-ledger",
  "dude-pack-technical-docs-pipeline",
  "dude-pack-technical-docs-quality-audit",
  "dude-pack-technical-docs-runtime",
  "dude-pack-technical-docs-source-intake",
  "dude-pack-technical-docs-traceability",
];

const EXPECTED_PROMPTS = [
  "dude-pack-technical-docs-document-this-repository.prompt.md",
  "dude-pack-technical-docs-write-technical-document.prompt.md",
];

const EXPECTED_RUNTIME_SCRIPTS = [
  "chunk.mjs",
  "coverage.mjs",
  "extraction-audit.mjs",
  "finalize.mjs",
  "headings.mjs",
  "ledger-digest.mjs",
  "lint.mjs",
  "merge-ledger.mjs",
  "preprocess.mjs",
  "repo-inventory.mjs",
  "source-manifest.mjs",
];

const RUNTIME_SKILL_REL = ".github/skills/dude-pack-technical-docs-runtime";
const RUNTIME_SCRIPTS_REL = `${RUNTIME_SKILL_REL}/scripts`;
const RUNTIME_HELPER_REL = `${RUNTIME_SCRIPTS_REL}/lib/runtime.mjs`;
const PIPELINE_SKILL_REL = ".github/skills/dude-pack-technical-docs-pipeline/SKILL.md";
const LOCAL_WRITING_FALLBACK = "## Local writing fallback";

/* ------------------------------------------------------------------- process */

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function byName(first, second) {
  return first.name.localeCompare(second.name);
}

/** Run a Node script with an argument vector and no shell, capturing its outcome. */
function runNodeScript(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : String(error.message ?? error),
    };
  }
}

function describe(result) {
  return `\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
}

/* ------------------------------------------------------------------ tree i/o */

/**
 * Digest every regular file under a bundle root and record its directories, so
 * leftover empty directories are as visible as leftover files.
 */
function snapshotTree(root) {
  const files = new Map();
  const directories = [];
  const visit = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(byName)) {
      const absolute = join(current, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      assert.ok(!entry.isSymbolicLink(), `unexpected symbolic link in a bundle tree: ${relPath}`);
      if (entry.isDirectory()) {
        directories.push(relPath);
        visit(absolute, relPath);
        continue;
      }
      assert.ok(entry.isFile(), `unexpected non-regular entry in a bundle tree: ${relPath}`);
      files.set(relPath, sha256(readFileSync(absolute)));
    }
  };
  visit(root, "");
  return { files, directories };
}

/** Sorted `[path, digest]` pairs, optionally narrowed to a subset of paths. */
function entries(files, predicate = () => true) {
  return [...files]
    .filter(([relPath]) => predicate(relPath))
    .sort((first, second) => first[0].localeCompare(second[0]));
}

function walkSourceFiles(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    const absolute = join(dir, entry.name);
    const relPath = `${prefix}/${entry.name}`;
    assert.ok(!entry.isSymbolicLink(), `pack source must not contain a symbolic link: ${relPath}`);
    if (entry.isDirectory()) {
      walkSourceFiles(absolute, relPath, out);
      continue;
    }
    assert.ok(entry.isFile(), `pack source must contain only regular files and directories: ${relPath}`);
    out.set(relPath, sha256(readFileSync(absolute)));
  }
  return out;
}

/** The exact `.github/` files a pack's shipped categories should install, keyed by destination. */
function packSourceInstallMap(packDir) {
  const out = new Map();
  for (const kind of COPY_KINDS) {
    const dir = join(packDir, kind);
    if (!existsSync(dir)) continue;
    if (kind === "agents") {
      // An agent source is rendered as one Copilot profile.
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
        assert.ok(
          entry.isFile() && entry.name.endsWith(AGENT_SOURCE_SUFFIX),
          `pack agent source must be a regular ${AGENT_SOURCE_SUFFIX} file: ${entry.name}`
        );
        const stem = entry.name.slice(0, -AGENT_SOURCE_SUFFIX.length);
        const source = readFileSync(join(dir, entry.name));
        out.set(
          copilotAgentPath(stem),
          sha256(renderCopilotAgent(
            parseAgentSource(source, { stem, config: AGENT_MODEL_CONFIG }),
            AGENT_MODEL_CONFIG
          ))
        );
      }
      continue;
    }
    walkSourceFiles(dir, `.github/${kind}`, out);
  }
  return out;
}

/** The one Copilot destination one declared agent source installs to. */
function agentDestination(sourceName) {
  return copilotAgentPath(sourceName.slice(0, -AGENT_SOURCE_SUFFIX.length));
}

/** The authoritative source bytes and the logical class a declared agent declares for itself. */
function readAgentSource(sourceName) {
  const stem = sourceName.slice(0, -AGENT_SOURCE_SUFFIX.length);
  const bytes = readFileSync(join(PACK_DIR, "agents", sourceName));
  const { frontmatter } = parseAgentSource(bytes, { stem, config: AGENT_MODEL_CONFIG });
  return { bytes, modelClass: String(frontmatter["model-class"]) };
}

function readProfileJson(root) {
  const text = readFileSync(join(root, ".dude", "metadata", "profile.md"), "utf8");
  const blocks = [...text.matchAll(/```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/g)];
  assert.equal(blocks.length, 1, "the install profile must carry exactly one fenced JSON block");
  return JSON.parse(blocks[0][1]);
}

/** Drop the wall-clock install stamp, which legitimately differs between two runs. */
function profileWithoutTimestamps(profile) {
  const installed = {};
  for (const [name, entry] of Object.entries(profile.installed).sort()) {
    const { installed_at: installedAt, ...rest } = entry;
    assert.match(installedAt ?? "", /^\d{4}-\d{2}-\d{2}T/, `pack "${name}" must record an ISO install timestamp`);
    installed[name] = rest;
  }
  return { enabled_packs: profile.enabled_packs, installed };
}

/* ------------------------------------------------------------- shared roots */

const CANONICAL_TEMP_ROOT = realpathSync.native(tmpdir());

/** Every temporary path this file creates lives under `workspace`, which `after` removes. */
let workspace = null;
let pristineRoot = "";
let pristineSnapshot = null;
let pristineLint = null;

before(() => {
  workspace = realpathSync.native(mkdtempSync(join(CANONICAL_TEMP_ROOT, "technical-docs-composition-")));
  try {
    pristineRoot = join(workspace, "pristine");
    const build = runNodeScript(BUILD_RELEASE, ["--out", pristineRoot, "--tag", RELEASE_TAG]);
    assert.equal(build.status, 0, `the core release build failed${describe(build)}`);
    pristineLint = lintBundle(pristineRoot);
    // Captured only after the build and the pristine lint, so any later drift is
    // attributable to pack installation rather than to the baseline commands.
    pristineSnapshot = snapshotTree(pristineRoot);
  } catch (error) {
    rmSync(workspace, { recursive: true, force: true });
    workspace = null;
    throw error;
  }
});

after(() => {
  if (!workspace) return;
  rmSync(workspace, { recursive: true, force: true });
  workspace = null;
});

/**
 * Run a case against a throwaway copy of the pristine release. The copy is the
 * only root any pack may touch, and it is removed even when the case throws.
 */
function withDisposableRoot(label, run) {
  assert.ok(workspace, "the shared workspace must exist before a disposable root is created");
  const root = mkdtempSync(join(workspace, `${label}-`));
  try {
    const fromWorkspace = relative(workspace, root);
    assert.ok(
      fromWorkspace !== "" && !fromWorkspace.startsWith("..") && !isAbsolute(fromWorkspace),
      `a disposable root must live under the shared workspace: ${root}`
    );
    assert.notEqual(resolve(root), resolve(pristineRoot), "a disposable root must never be the pristine release");
    assert.ok(
      relative(REPO_ROOT, root).startsWith(".."),
      `a disposable root must never live inside the repository: ${root}`
    );
    cpSync(pristineRoot, root, { recursive: true, verbatimSymlinks: true });
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function composeAdd(root, name) {
  return runNodeScript(COMPOSE, ["add", name, "--root", root, "--library", LIBRARY_DIR, "--no-fetch", "--json"]);
}

function composeRemove(root, name) {
  return runNodeScript(COMPOSE, ["remove", name, "--root", root, "--json"]);
}

/** Lint a bundle with the copy of dude-lint that bundle actually ships. */
function lintBundle(root) {
  const result = runNodeScript(join(root, ...BUNDLED_LINT_REL.split("/")), [root]);
  const summary = /Findings:\s+(\d+)\s+warning\(s\),\s+(\d+)\s+failure\(s\)/.exec(`${result.stdout}${result.stderr}`);
  assert.ok(summary, `dude-lint reported no findings summary${describe(result)}`);
  return { warnings: Number(summary[1]), failures: Number(summary[2]), status: result.status, result };
}

function assertLintsClean(root, label) {
  const lint = lintBundle(root);
  assert.equal(lint.failures, 0, `${label} lints with failures${describe(lint.result)}`);
  assert.equal(lint.status, 0, `${label} lint exited non-zero${describe(lint.result)}`);
  return lint;
}

function installedPackFiles(files, token) {
  return entries(files, (relPath) => INSTALL_TREES.some((tree) => relPath.startsWith(tree)) && relPath.includes(token));
}

/* -------------------------------------------- 1. pristine release separation */

test("the built release is core-only, ships no pack or test artifact, and lints without failures", () => {
  const { files, directories } = pristineSnapshot;
  assert.ok(files.size > 0, "the release build produced no files");

  const packArtifacts = [...files.keys(), ...directories].filter((relPath) => relPath.includes("dude-pack-"));
  assert.deepEqual(packArtifacts, [], "the pristine release must not contain any pack artifact");

  const testArtifacts = [...files.keys()].filter((relPath) => /\.test\.(mjs|cjs|js)$/.test(relPath));
  assert.deepEqual(testArtifacts, [], "the pristine release must not ship test files");

  assert.equal(files.has("library/packs/technical-docs/pack.md"), false, "the release must not ship the pack catalog");
  const profile = readProfileJson(pristineRoot);
  assert.deepEqual(profile, { enabled_packs: [], installed: {} }, "a fresh release must record no installed pack");

  // The bundled linter this suite uses everywhere is the exercised source linter.
  assert.equal(
    files.get(BUNDLED_LINT_REL),
    sha256(readFileSync(SOURCE_LINT)),
    `${BUNDLED_LINT_REL} must be a byte-identical copy of ${relative(REPO_ROOT, SOURCE_LINT)}`
  );

  assert.equal(pristineLint.failures, 0, `the pristine release lints with failures${describe(pristineLint.result)}`);
  assert.equal(pristineLint.status, 0, `the pristine release lint exited non-zero${describe(pristineLint.result)}`);
});

/* --------------------------------------------------- 2. standalone install */

test("technical-docs installs standalone into a disposable copy and the result lints without failures", () => {
  withDisposableRoot("standalone", (root) => {
    const add = composeAdd(root, PACK_NAME);
    assert.equal(add.status, 0, `standalone install failed${describe(add)}`);

    const { files } = snapshotTree(root);
    const installed = installedPackFiles(files, PACK_TOKEN);
    assert.ok(installed.length > 0, "the standalone install wrote no technical-docs artifact");
    assert.deepEqual(
      installedPackFiles(files, "dude-pack-writing-"),
      [],
      "a standalone install must not pull in the writing pack"
    );

    const profile = readProfileJson(root);
    assert.deepEqual(profile.enabled_packs, [PACK_NAME]);
    const expectedAgentDestinations = EXPECTED_AGENTS.map(agentDestination);
    assert.equal(
      expectedAgentDestinations.length,
      EXPECTED_AGENTS.length,
      "every declared agent must contribute exactly one Copilot destination"
    );
    const expectedProfileFiles = [
      ...expectedAgentDestinations,
      ...EXPECTED_PROMPTS.map((name) => `.github/prompts/${name}`),
      ...EXPECTED_SKILLS.map((name) => `.github/skills/${name}`),
    ].sort();
    const expectedProfileSources = [
      ...EXPECTED_AGENTS.map((name) => `agents/${name}`),
      ...EXPECTED_PROMPTS.map((name) => `prompts/${name}`),
      ...EXPECTED_SKILLS.map((name) => `skills/${name}`),
    ].sort();
    const profileEntry = profile.installed[PACK_NAME];
    assert.deepEqual(profileEntry.files.slice().sort(), expectedProfileFiles);
    assert.equal(profileEntry.inventory.version, 1, "the profile inventory must use version 1");
    assert.equal(
      profileEntry.inventory.artifacts.length,
      expectedProfileSources.length,
      "the profile inventory must contain one row per source"
    );
    assert.deepEqual(
      profileEntry.inventory.artifacts
        .map(({ path, source }) => ({ path, source }))
        .sort((first, second) => first.source.localeCompare(second.source)),
      expectedProfileSources.map((source) => ({ path: `.github/${source}`, source })),
      "every profile inventory row must bind its exact source to .github/<source>"
    );

    assertLintsClean(root, "the standalone technical-docs bundle");
  });
});

/* ------------------------------------------ 5. installed-surface completeness */

test("the installed surface carries every declared agent, skill, prompt, runtime script, and the nested helper", () => {
  withDisposableRoot("surface", (root) => {
    const add = composeAdd(root, PACK_NAME);
    assert.equal(add.status, 0, `install failed${describe(add)}`);
    const { files, directories } = snapshotTree(root);
    for (const name of EXPECTED_AGENTS) {
      const destination = agentDestination(name);
      assert.ok(files.has(destination), `installed bundle is missing rendered agent ${destination}`);
    }
    for (const name of EXPECTED_SKILLS) {
      assert.ok(files.has(`.github/skills/${name}/SKILL.md`), `installed bundle is missing skill ${name}`);
      assert.ok(directories.includes(`.github/skills/${name}`), `installed bundle is missing skill directory ${name}`);
    }
    for (const name of EXPECTED_PROMPTS) {
      assert.ok(files.has(`.github/prompts/${name}`), `installed bundle is missing prompt ${name}`);
    }

    const installedScripts = [...files.keys()]
      .filter((relPath) => relPath.startsWith(`${RUNTIME_SCRIPTS_REL}/`) && !relPath.includes("/scripts/lib/"))
      .map((relPath) => relPath.slice(`${RUNTIME_SCRIPTS_REL}/`.length))
      .sort();
    assert.deepEqual(installedScripts, EXPECTED_RUNTIME_SCRIPTS, "the installed runtime CLI set is not exact");
    assert.equal(installedScripts.length, 11, "the runtime skill must install exactly eleven CLI scripts");
    assert.ok(files.has(RUNTIME_HELPER_REL), "the nested runtime helper scripts/lib/runtime.mjs is missing");

    // Every installed byte must be rendered or copied from the pack source, and nothing else may appear.
    const expected = packSourceInstallMap(PACK_DIR);
    assert.ok(expected.size >= 20, "the derived pack source map is too small to be a meaningful comparison");
    assert.deepEqual(
      installedPackFiles(files, PACK_TOKEN),
      entries(expected),
      "the installed technical-docs surface is not the rendered or copied pack source"
    );

    // The source-map comparison shares the renderer with compose, so check each
    // generated Copilot profile's model mapping and generated-only frontmatter.
    for (const name of EXPECTED_AGENTS) {
      const { bytes, modelClass } = readAgentSource(name);
      const copilotRel = agentDestination(name);
      assert.notEqual(
        files.get(copilotRel),
        sha256(bytes),
        `${copilotRel} is a byte-identical copy of its source, not a rendered profile`
      );
      const copilot = readFileSync(join(root, ...copilotRel.split("/")), "utf8");
      const copilotModel = resolveCopilotModel(AGENT_MODEL_CONFIG, modelClass);
      assert.equal(
        copilot.split("\n").includes(`model: ${copilotModel.model}`),
        Object.hasOwn(copilotModel, "model"),
        `${copilotRel} does not carry the Copilot model its declared "${modelClass}" class resolves to`
      );
      assert.doesNotMatch(copilot, /^model-class:/m, `${copilotRel} must not emit model-class`);
      assert.doesNotMatch(copilot, /^(?:effort|reasoningEffort):/m, `${copilotRel} must not emit effort`);
    }
  });
});

/* -------------------------------------------------- 6. no shipped test files */

test("no technical-docs test artifact reaches an installed bundle", () => {
  const testDir = join(PACK_DIR, "tests");
  const shipped = walkSourceFiles(testDir, "tests", new Map());
  const testFileNames = new Set([...shipped.keys()].map((relPath) => relPath.split("/").pop()));
  assert.ok(
    [...testFileNames].filter((name) => name.endsWith(".test.mjs")).length >= 6,
    "the pack source must actually carry test files for this check to mean anything"
  );
  assert.ok(shipped.has("tests/helpers/harness.mjs"), "the pack source must carry the shared test harness");

  withDisposableRoot("no-tests", (root) => {
    const add = composeAdd(root, PACK_NAME);
    assert.equal(add.status, 0, `install failed${describe(add)}`);
    const { files, directories } = snapshotTree(root);
    assert.ok(installedPackFiles(files, PACK_TOKEN).length > 0, "nothing was installed, so this check would be vacuous");

    const leaked = [...files.keys()].filter((relPath) => {
      const name = relPath.split("/").pop();
      return name.endsWith(".test.mjs") || testFileNames.has(name);
    });
    assert.deepEqual(leaked, [], "a pack test file reached the installed bundle");

    const testDirectories = directories.filter((relPath) => relPath.split("/").includes("tests"));
    assert.deepEqual(testDirectories, [], "a tests/ directory reached the installed bundle");

    const profile = readProfileJson(root);
    assert.deepEqual(
      profile.installed[PACK_NAME].files.filter((relPath) => relPath.includes("test")),
      [],
      "the install profile claims a test artifact"
    );
  });
});

/* ------------------------------------------------------- 3. install ordering */

test("technical-docs and writing install in either order and produce an equivalent surface", () => {
  const snapshots = [];
  const profiles = [];
  for (const order of [[PACK_NAME, WRITING_PACK], [WRITING_PACK, PACK_NAME]]) {
    withDisposableRoot(`order-${order[0]}`, (root) => {
      for (const name of order) {
        const add = composeAdd(root, name);
        assert.equal(add.status, 0, `installing ${name} after [${order.slice(0, order.indexOf(name))}] failed${describe(add)}`);
      }
      assertLintsClean(root, `the bundle installed in order [${order.join(", ")}]`);
      snapshots.push(snapshotTree(root));
      profiles.push(readProfileJson(root));
    });
  }

  const [first, second] = snapshots;
  assert.ok(
    installedPackFiles(first.files, PACK_TOKEN).length > 0 && installedPackFiles(first.files, "dude-pack-writing-").length > 0,
    "both packs must actually be installed for the ordering comparison to mean anything"
  );
  // The profile records a wall-clock install stamp, so it is compared structurally below.
  const withoutProfile = (relPath) => relPath !== PROFILE_REL;
  assert.deepEqual(entries(second.files, withoutProfile), entries(first.files, withoutProfile), "install order changed the installed files");
  assert.deepEqual(second.directories, first.directories, "install order changed the installed directories");
  assert.deepEqual(
    profileWithoutTimestamps(profiles[1]),
    profileWithoutTimestamps(profiles[0]),
    "install order changed the recorded install profile"
  );
  assert.deepEqual(profiles[0].enabled_packs, [PACK_NAME, WRITING_PACK].sort());
});

/* ------------------------------------------------- 2. optional writing layer */

test("the writing pack resolves the refinement layer the standalone install deliberately leaves absent", () => {
  const writingSkills = readdirSync(join(WRITING_PACK_DIR, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(writingSkills, ["dude-pack-writing-avoid-ai-tropes", "dude-pack-writing-style"]);

  /** Writing skills the installed technical-docs documents defer to. */
  const referenced = withDisposableRoot("writing-enabled", (root) => {
    for (const name of [PACK_NAME, WRITING_PACK]) {
      const add = composeAdd(root, name);
      assert.equal(add.status, 0, `installing ${name} failed${describe(add)}`);
    }
    const { files } = snapshotTree(root);
    const tokens = new Set();
    for (const [relPath] of installedPackFiles(files, PACK_TOKEN)) {
      if (!relPath.endsWith(".md")) continue;
      for (const match of readFileSync(join(root, ...relPath.split("/")), "utf8").matchAll(/dude-pack-writing-[a-z0-9-]+/g)) {
        tokens.add(match[0]);
      }
    }
    assert.deepEqual([...tokens].sort(), writingSkills, "the installed docs must defer to exactly the writing pack skills");
    for (const skill of tokens) {
      assert.ok(files.has(`.github/skills/${skill}/SKILL.md`), `the writing-enabled bundle cannot resolve ${skill}`);
    }
    return [...tokens].sort();
  });

  withDisposableRoot("writing-absent", (root) => {
    const add = composeAdd(root, PACK_NAME);
    assert.equal(add.status, 0, `standalone install failed${describe(add)}`);
    const { files } = snapshotTree(root);
    for (const skill of referenced) {
      assert.equal(files.has(`.github/skills/${skill}/SKILL.md`), false, `${skill} must be absent without the writing pack`);
    }
    // The layer is optional only if the local fallback ships and the bundle still lints clean.
    assert.match(readFileSync(join(root, ...PIPELINE_SKILL_REL.split("/")), "utf8"), new RegExp(`^${LOCAL_WRITING_FALLBACK}$`, "m"));
    assertLintsClean(root, "the standalone bundle with the writing layer absent");
  });
});

/* ------------------------------------------------------------- 4. removal */

test("removing technical-docs restores the pristine surface and leaves no artifact or reference", () => {
  withDisposableRoot("remove-standalone", (root) => {
    const add = composeAdd(root, PACK_NAME);
    assert.equal(add.status, 0, `install failed${describe(add)}`);
    const installed = snapshotTree(root);
    assert.ok(installed.files.size > pristineSnapshot.files.size, "the install added no file, so removal proves nothing");

    const remove = composeRemove(root, PACK_NAME);
    assert.equal(remove.status, 0, `removal failed${describe(remove)}`);

    const { files, directories } = snapshotTree(root);
    // Removal rewrites the profile with dude-compose prose, so it is compared structurally.
    const withoutProfile = (relPath) => relPath !== PROFILE_REL;
    assert.deepEqual(
      entries(files, withoutProfile),
      entries(pristineSnapshot.files, withoutProfile),
      "removal did not restore the pristine file set"
    );
    assert.deepEqual(
      pristineSnapshot.directories.filter((relPath) => !directories.includes(relPath)),
      [],
      "removal deleted a directory the pristine release shipped"
    );
    // `add` creates the `.github/<category>/` directory a pack needs and `remove` does not
    // prune it. An empty category directory is not a pack artifact, so it is tolerated here
    // only while it stays inside the copy categories and stays empty.
    for (const relPath of directories.filter((entry) => !pristineSnapshot.directories.includes(entry))) {
      assert.ok(
        COPY_KINDS.some((kind) => relPath === `.github/${kind}`),
        `removal left a directory behind: ${relPath}`
      );
      assert.deepEqual(readdirSync(join(root, ...relPath.split("/"))), [], `${relPath} still holds an artifact`);
    }
    assert.deepEqual(readProfileJson(root), { enabled_packs: [], installed: {} }, "removal left profile evidence behind");
    assertLintsClean(root, "the bundle after removing technical-docs");
  });
});

test("removing technical-docs from a writing-enabled bundle leaves no leftovers and preserves writing", () => {
  withDisposableRoot("remove-with-writing", (root) => {
    for (const name of [WRITING_PACK, PACK_NAME]) {
      const add = composeAdd(root, name);
      assert.equal(add.status, 0, `installing ${name} failed${describe(add)}`);
    }
    const before = snapshotTree(root);
    const writingBefore = installedPackFiles(before.files, "dude-pack-writing-");
    assert.ok(writingBefore.length > 0, "the writing pack must be installed for this check to mean anything");
    assert.ok(installedPackFiles(before.files, PACK_TOKEN).length > 0, "technical-docs must be installed before removal");

    const remove = composeRemove(root, PACK_NAME);
    assert.equal(remove.status, 0, `removal failed${describe(remove)}`);

    const { files, directories } = snapshotTree(root);
    assert.deepEqual(
      [...files.keys(), ...directories].filter((relPath) => relPath.includes(PACK_TOKEN)),
      [],
      "a technical-docs path survived removal"
    );
    const dangling = [];
    for (const relPath of files.keys()) {
      if (readFileSync(join(root, ...relPath.split("/")), "utf8").includes(PACK_TOKEN)) dangling.push(relPath);
    }
    assert.deepEqual(dangling, [], "a file still references a removed technical-docs artifact");

    assert.deepEqual(installedPackFiles(files, "dude-pack-writing-"), writingBefore, "removal damaged the writing pack");
    const profile = readProfileJson(root);
    assert.deepEqual(profile.enabled_packs, [WRITING_PACK]);
    assert.deepEqual(Object.keys(profile.installed), [WRITING_PACK]);
    assertLintsClean(root, "the writing-only bundle after removing technical-docs");
  });
});

/* ------------------------------------------------- pristine release integrity */

test("the pristine release is still core-only and byte-identical after every install and removal", () => {
  const current = snapshotTree(pristineRoot);
  assert.deepEqual(current.directories, pristineSnapshot.directories, "the pristine release gained or lost a directory");
  assert.deepEqual(entries(current.files), entries(pristineSnapshot.files), "the pristine release changed on disk");
  assert.deepEqual(
    [...current.files.keys(), ...current.directories].filter((relPath) => relPath.includes("dude-pack-")),
    [],
    "the pristine release was contaminated with a pack artifact"
  );
  assert.deepEqual(readProfileJson(pristineRoot), { enabled_packs: [], installed: {} }, "the pristine release records an install");

  const lint = lintBundle(pristineRoot);
  assert.equal(lint.failures, 0, `the pristine release lints with failures${describe(lint.result)}`);
  assert.equal(lint.warnings, pristineLint.warnings, "the pristine release lint findings changed");
});

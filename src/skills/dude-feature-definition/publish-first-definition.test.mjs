// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./publish-first-definition.mjs", import.meta.url));
const IDEA_PATH = ".dude/ideas/023-direct-draft.md";
const SPEC_PATH = ".dude/specs/023-direct-draft/spec.md";
const PACKAGE_DIRECTORY = path.posix.dirname(SPEC_PATH);
const SENTINEL_PATH = "unrelated-sentinel.bin";
const STAGE_NAMES = Object.freeze([
  "current-idea.md",
  "staged-idea.md",
  "spec.md",
  "plan.md",
  "tasks.md",
]);
const PACKAGE_NAMES = Object.freeze(["spec.md", "plan.md", "tasks.md"]);
const SENTINEL_BYTES = Buffer.from([0x00, 0x44, 0x75, 0x64, 0x65, 0xff, 0x0a]);
const MANIFEST_BYTES = Buffer.from(
  "# Bundle Manifest\n\n```json\n{\"source_repo\":\"fixture\",\"source_ref\":\"main\"}\n```\n",
);
const PROFILE_BYTES = Buffer.from(
  "# Install Profile\n\n```json\n{\"installed\":{}}\n```\n",
);
const PACKAGED_AGENT_MODEL_CONFIG_BYTES = fs.readFileSync(
  fileURLToPath(new URL("../../config/agent-models.json", import.meta.url)),
);
const ENGINE_SKILL_BYTES = Buffer.from(
  "---\nname: dude-engine\ndescription: \"Fixture engine skill.\"\n---\n",
);

/** @typedef {{path:string,type:string,bytes?:string,target?:string}} TreeEntry */

/**
 * @param {{status:string,specPath:string,definitionEvent:boolean,priorEvent?:string}} options
 */
function ownerBytes(options) {
  const log = [options.priorEvent ?? "- 2026-08-06 Draft selected."];
  if (options.definitionEvent) log.push("- 2026-08-06 Definition published.");
  return Buffer.from([
    "---",
    "title: Direct Draft",
    "slug: direct-draft",
    `status: ${options.status}`,
    options.specPath ? `spec_path: ${options.specPath}` : "spec_path:",
    "---",
    "",
    "## Idea",
    "",
    "Preserve exact user intent byte-for-byte.",
    "",
    "## Open Questions",
    "",
    "- None.",
    "",
    "## Assumptions",
    "",
    "- The lean package core is sufficient.",
    "",
    "<!-- dude:managed:start -->",
    "## Normalized Intent",
    "",
    "- Publish one first definition.",
    "",
    "## Coordinator Log",
    "",
    ...log,
    "<!-- dude:managed:end -->",
    "",
  ].join("\n"));
}

/** @returns {Record<string, Buffer>} */
function validStageBytes() {
  return {
    "current-idea.md": ownerBytes({ status: "draft", specPath: "", definitionEvent: false }),
    "staged-idea.md": ownerBytes({ status: "defined", specPath: SPEC_PATH, definitionEvent: true }),
    "spec.md": Buffer.from(
      "# Feature Specification: Fixture\r\n\r\nPublish the owner and core package exactly.\r\n",
    ),
    "plan.md": Buffer.from(
      "# Implementation Plan: Fixture\n\nUse the fixed first-definition publisher.\n",
    ),
    "tasks.md": Buffer.from([
      `<!-- audit log: ${IDEA_PATH}#coordinator-log -->`,
      "",
      "# Tasks: Fixture",
      "",
      "- [ ] T001@a1b2c3d4 [Shared] Verify exact publication.",
      "",
    ].join("\n")),
  };
}

/** @param {string} root @param {string} relativePath */
function absolutePath(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

/** @param {string} root @param {string} relativePath @param {string | Buffer} bytes */
function write(root, relativePath, bytes) {
  const destination = absolutePath(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}

/** @param {string} root @param {Buffer} currentIdea */
function writeWorkspace(root, currentIdea) {
  fs.mkdirSync(root, { recursive: true });
  write(root, IDEA_PATH, currentIdea);
  write(root, ".dude/metadata/bundle-manifest.md", MANIFEST_BYTES);
  write(root, ".dude/metadata/profile.md", PROFILE_BYTES);
  write(
    root,
    ".github/skills/dude-engine/config/agent-models.json",
    PACKAGED_AGENT_MODEL_CONFIG_BYTES,
  );
  write(root, ".github/skills/dude-engine/SKILL.md", ENGINE_SKILL_BYTES);
  write(root, SENTINEL_PATH, SENTINEL_BYTES);
}

/** @param {string} stage @param {Record<string, Buffer>} bytes */
function writeStage(stage, bytes) {
  fs.mkdirSync(stage, { recursive: true });
  for (const name of STAGE_NAMES) fs.writeFileSync(path.join(stage, name), bytes[name]);
}

/**
 * @param {(fixture:{root:string,stage:string,stageBytes:Record<string,Buffer>}) => void} run
 */
function withFixture(run) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dude-first-publish-"));
  const root = path.join(temporary, "workspace");
  const stage = path.join(temporary, "stage");
  const stageBytes = validStageBytes();
  writeWorkspace(root, stageBytes["current-idea.md"]);
  writeStage(stage, stageBytes);
  try {
    run({ root, stage, stageBytes });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

/** @param {Buffer} bytes @param {string} current @param {string} replacement */
function replaceBytes(bytes, current, replacement) {
  const text = bytes.toString("utf8");
  assert.ok(text.includes(current), `fixture text is missing: ${current}`);
  return Buffer.from(text.replace(current, replacement));
}

/** @param {string} left @param {string} right */
function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** @param {string} root @returns {TreeEntry[]} */
function snapshotTree(root) {
  /** @type {TreeEntry[]} */
  const entries = [];

  /** @param {string} directory @param {string} prefix */
  function visit(directory, prefix) {
    const names = fs.readdirSync(directory).sort(compareBytes);
    for (const name of names) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symlink", target: fs.readlinkSync(absolute) });
      } else if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory" });
        visit(absolute, relative);
      } else if (stat.isFile()) {
        entries.push({ path: relative, type: "file", bytes: fs.readFileSync(absolute).toString("hex") });
      } else {
        entries.push({ path: relative, type: "other" });
      }
    }
  }

  visit(root, "");
  return entries;
}

/** @param {string} root */
function assertNoAtomicTempResidue(root) {
  const residue = snapshotTree(root)
    .map((entry) => entry.path)
    .filter((relative) => relative.split("/").some((name) => name.startsWith(".dude-atomic-")));
  assert.deepEqual(residue, []);
}

/** @param {string} root */
function packageFileState(root) {
  return Object.fromEntries(PACKAGE_NAMES.map((name) => {
    const target = absolutePath(root, `${PACKAGE_DIRECTORY}/${name}`);
    return [name, fs.existsSync(target) ? fs.readFileSync(target).toString("hex") : null];
  }));
}

/** @param {TreeEntry[]} before @param {Record<string, Buffer>} stageBytes */
function expectedSuccessTree(before, stageBytes) {
  const expected = before.map((entry) => entry.path === IDEA_PATH
    ? { ...entry, bytes: stageBytes["staged-idea.md"].toString("hex") }
    : { ...entry });
  expected.push(
    { path: ".dude/specs", type: "directory" },
    { path: PACKAGE_DIRECTORY, type: "directory" },
    { path: `${PACKAGE_DIRECTORY}/plan.md`, type: "file", bytes: stageBytes["plan.md"].toString("hex") },
    { path: `${PACKAGE_DIRECTORY}/spec.md`, type: "file", bytes: stageBytes["spec.md"].toString("hex") },
    { path: `${PACKAGE_DIRECTORY}/tasks.md`, type: "file", bytes: stageBytes["tasks.md"].toString("hex") },
  );
  return expected.sort((left, right) => compareBytes(left.path, right.path));
}

/** @param {string} root @param {string} stage */
function publish(root, stage) {
  return spawnSync(process.execPath, [
    SCRIPT,
    "--root", root,
    "--idea", IDEA_PATH,
    "--spec", SPEC_PATH,
    "--stage", stage,
  ], { encoding: "utf8", shell: false });
}

test("real CLI publishes a valid direct draft and exact five-file stage", () => {
  withFixture(({ root, stage, stageBytes }) => {
    // Arrange
    const before = snapshotTree(root);
    assert.equal(fs.existsSync(absolutePath(root, PACKAGE_DIRECTORY)), false);
    assert.deepEqual(fs.readdirSync(stage).sort(compareBytes), [...STAGE_NAMES].sort(compareBytes));
    for (const name of STAGE_NAMES) {
      assert.deepEqual(fs.readFileSync(path.join(stage, name)), stageBytes[name], name);
    }

    // Act
    const result = publish(root, stage);

    // Assert
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `${SPEC_PATH}\n`);

    for (const [destination, stagedName] of [
      [IDEA_PATH, "staged-idea.md"],
      [SPEC_PATH, "spec.md"],
      [`${PACKAGE_DIRECTORY}/plan.md`, "plan.md"],
      [`${PACKAGE_DIRECTORY}/tasks.md`, "tasks.md"],
    ]) {
      assert.deepEqual(fs.readFileSync(absolutePath(root, destination)), stageBytes[stagedName], destination);
    }
    assert.deepEqual(
      fs.readdirSync(absolutePath(root, PACKAGE_DIRECTORY)).sort(compareBytes),
      [...PACKAGE_NAMES].sort(compareBytes),
    );
    assert.deepEqual(fs.readFileSync(absolutePath(root, SENTINEL_PATH)), SENTINEL_BYTES);
    assert.deepEqual(snapshotTree(root), expectedSuccessTree(before, stageBytes));
    assertNoAtomicTempResidue(root);
  });
});

test("canonical lint failure rolls back the owner and helper-created package tree", () => {
  withFixture(({ root, stage, stageBytes }) => {
    // Arrange
    const badTasks = replaceBytes(
      stageBytes["tasks.md"],
      `<!-- audit log: ${IDEA_PATH}#coordinator-log -->`,
      "<!-- audit log: .dude/ideas/023-not-the-owner.md#coordinator-log -->",
    );
    fs.writeFileSync(path.join(stage, "tasks.md"), badTasks);
    const before = snapshotTree(root);
    assert.equal(fs.existsSync(absolutePath(root, PACKAGE_DIRECTORY)), false);

    // Act
    const result = publish(root, stage);

    // Assert
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "[FAIL] dude-lint failed\n");
    assert.deepEqual(
      fs.readFileSync(absolutePath(root, IDEA_PATH)),
      stageBytes["current-idea.md"],
    );
    for (const name of PACKAGE_NAMES) {
      assert.equal(fs.existsSync(absolutePath(root, `${PACKAGE_DIRECTORY}/${name}`)), false, name);
    }
    assert.equal(fs.existsSync(absolutePath(root, PACKAGE_DIRECTORY)), false);
    assert.deepEqual(fs.readFileSync(absolutePath(root, SENTINEL_PATH)), SENTINEL_BYTES);
    assert.deepEqual(snapshotTree(root), before);
    assertNoAtomicTempResidue(root);
  });
});

test("a valid resolved current preimage refuses first publication without writes", () => {
  withFixture(({ root, stage, stageBytes }) => {
    // Arrange
    const resolvedCurrent = replaceBytes(
      stageBytes["current-idea.md"],
      "status: draft",
      "status: resolved",
    );
    write(root, IDEA_PATH, resolvedCurrent);
    fs.writeFileSync(path.join(stage, "current-idea.md"), resolvedCurrent);
    const before = snapshotTree(root);

    // Act
    const result = publish(root, stage);

    // Assert
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "[FAIL] current idea is resolved; explicit brainstorm reopen is required before first definition\n",
    );
    assert.deepEqual(snapshotTree(root), before);
    assert.deepEqual(packageFileState(root), {
      "spec.md": null,
      "plan.md": null,
      "tasks.md": null,
    });
    assertNoAtomicTempResidue(root);
  });
});

test("first-definition preserves optional canonical depends-on while rejecting changed and unknown frontmatter", async (context) => {
  const addFrontmatterLine = (bytes, line) => replaceBytes(
    bytes,
    "---\n\n## Idea",
    `${line}\n---\n\n## Idea`,
  );

  await context.test("matching depends-on bytes publish", () => {
    withFixture(({ root, stage, stageBytes }) => {
      // Arrange
      const current = addFrontmatterLine(stageBytes["current-idea.md"], "depends-on: foundation");
      const staged = addFrontmatterLine(stageBytes["staged-idea.md"], "depends-on: foundation");
      stageBytes["current-idea.md"] = current;
      stageBytes["staged-idea.md"] = staged;
      write(root, IDEA_PATH, current);
      fs.writeFileSync(path.join(stage, "current-idea.md"), current);
      fs.writeFileSync(path.join(stage, "staged-idea.md"), staged);
      const before = snapshotTree(root);

      // Act
      const result = publish(root, stage);

      // Assert
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, `${SPEC_PATH}\n`);
      assert.deepEqual(snapshotTree(root), expectedSuccessTree(before, stageBytes));
      assertNoAtomicTempResidue(root);
    });
  });

  await context.test("changed depends-on bytes refuse without writes", () => {
    withFixture(({ root, stage, stageBytes }) => {
      // Arrange
      const current = addFrontmatterLine(stageBytes["current-idea.md"], "depends-on: foundation");
      const staged = addFrontmatterLine(stageBytes["staged-idea.md"], "depends-on: other-foundation");
      write(root, IDEA_PATH, current);
      fs.writeFileSync(path.join(stage, "current-idea.md"), current);
      fs.writeFileSync(path.join(stage, "staged-idea.md"), staged);
      const before = snapshotTree(root);

      // Act
      const result = publish(root, stage);

      // Assert
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "[FAIL] staged idea must preserve depends-on bytes\n");
      assert.deepEqual(snapshotTree(root), before);
      assertNoAtomicTempResidue(root);
    });
  });

  await context.test("unknown staged frontmatter refuses without writes", () => {
    withFixture(({ root, stage, stageBytes }) => {
      // Arrange
      const staged = addFrontmatterLine(stageBytes["staged-idea.md"], "priority: urgent");
      fs.writeFileSync(path.join(stage, "staged-idea.md"), staged);
      const before = snapshotTree(root);

      // Act
      const result = publish(root, stage);

      // Assert
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(
        result.stderr,
        "[FAIL] staged idea frontmatter is malformed (frontmatter key 'priority' is not a canonical owner key)\n",
      );
      assert.deepEqual(snapshotTree(root), before);
      assertNoAtomicTempResidue(root);
    });
  });
});

const PREFLIGHT_CASES = [
  {
    name: "stale current-idea.md preimage",
    arrange({ root, stageBytes }) {
      write(root, IDEA_PATH, replaceBytes(
        stageBytes["current-idea.md"],
        "- 2026-08-06 Draft selected.\n",
        "- 2026-08-06 Draft selected.\n- 2026-08-06 Concurrent draft edit.\n",
      ));
    },
  },
  {
    name: "pre-existing package target",
    arrange({ root }) {
      write(root, SPEC_PATH, "# Existing package target\n");
    },
  },
  {
    name: "invalid current status",
    arrange({ root, stage, stageBytes }) {
      const currentIdea = replaceBytes(
        stageBytes["current-idea.md"],
        "status: draft",
        "status: defined",
      );
      write(root, IDEA_PATH, currentIdea);
      fs.writeFileSync(path.join(stage, "current-idea.md"), currentIdea);
    },
  },
  {
    name: "nonempty current spec path",
    arrange({ root, stage, stageBytes }) {
      const currentIdea = replaceBytes(
        stageBytes["current-idea.md"],
        "spec_path:\n",
        "spec_path: .dude/specs/022-existing/spec.md\n",
      );
      write(root, IDEA_PATH, currentIdea);
      fs.writeFileSync(path.join(stage, "current-idea.md"), currentIdea);
    },
  },
  {
    name: "wrong staged status",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "status: defined",
        "status: draft",
      ));
    },
  },
  {
    name: "wrong staged spec path",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        `spec_path: ${SPEC_PATH}`,
        "spec_path: .dude/specs/024-wrong/spec.md",
      ));
    },
  },
  {
    name: "changed title",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "title: Direct Draft",
        "title: Changed Draft",
      ));
    },
  },
  {
    name: "changed slug",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "slug: direct-draft",
        "slug: changed-draft",
      ));
    },
  },
  {
    name: "Idea section mutation",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "Preserve exact user intent byte-for-byte.",
        "Change user intent.",
      ));
    },
  },
  {
    name: "Open Questions section mutation",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- None.",
        "- Ownership remains open.",
      ));
    },
  },
  {
    name: "Assumptions section mutation",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- The lean package core is sufficient.",
        "- An expanded package is required.",
      ));
    },
  },
  {
    name: "rewritten prior log bytes",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- 2026-08-06 Draft selected.",
        "- 2026-08-06 Draft rewritten.",
      ));
    },
  },
  {
    name: "missing log append",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- 2026-08-06 Definition published.\n",
        "",
      ));
    },
  },
  {
    name: "incomplete log append",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- 2026-08-06 Definition published.\n",
        "- \n",
      ));
    },
  },
  {
    name: "multiple log appends",
    arrange({ stage, stageBytes }) {
      fs.writeFileSync(path.join(stage, "staged-idea.md"), replaceBytes(
        stageBytes["staged-idea.md"],
        "- 2026-08-06 Definition published.\n",
        "- 2026-08-06 Definition published.\n- 2026-08-06 Extra event.\n",
      ));
    },
  },
];

test("preflight table refuses invalid transitions without writes or success output", async (context) => {
  for (const fixture of PREFLIGHT_CASES) {
    await context.test(fixture.name, () => {
      withFixture(({ root, stage, stageBytes }) => {
        // Arrange
        fixture.arrange({ root, stage, stageBytes });
        const ideaBefore = fs.readFileSync(absolutePath(root, IDEA_PATH));
        const sentinelBefore = fs.readFileSync(absolutePath(root, SENTINEL_PATH));
        const packageBefore = packageFileState(root);
        const treeBefore = snapshotTree(root);

        // Act
        const result = publish(root, stage);

        // Assert
        assert.ifError(result.error);
        assert.equal(result.signal, null, fixture.name);
        assert.notEqual(result.status, 0, fixture.name);
        assert.equal(result.stdout, "", `${fixture.name}: success output must be absent`);
        assert.doesNotMatch(result.stderr, /dude-lint failed/, `${fixture.name}: must fail before lint`);
        assert.deepEqual(fs.readFileSync(absolutePath(root, IDEA_PATH)), ideaBefore, fixture.name);
        assert.deepEqual(
          fs.readFileSync(absolutePath(root, SENTINEL_PATH)),
          sentinelBefore,
          fixture.name,
        );
        assert.deepEqual(packageFileState(root), packageBefore, fixture.name);
        assert.deepEqual(snapshotTree(root), treeBefore, fixture.name);
        assertNoAtomicTempResidue(root);
      });
    });
  }
});

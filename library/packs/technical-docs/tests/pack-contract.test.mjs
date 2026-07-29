import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PACK_REL = "library/packs/technical-docs";
const PACK_DIR = join(REPO_ROOT, PACK_REL);
const RUNTIME_SKILL = "dude-pack-technical-docs-runtime";
const SCRIPTS_DIR = join(PACK_DIR, "skills", RUNTIME_SKILL, "scripts");
const COMPOSE_REL = "src/skills/dude-compose/compose.mjs";

// `BASE_REV` is the immediate parent of the T007 workflow-alignment change, pinned
// rather than derived from HEAD so every "unchanged from base" comparison keeps its
// meaning once T007 is itself committed.
const BASE_REV = "54bca6a1ebfe872cb36decd28c00bff4a5e892ba";

// Pinned so frontmatter and diagram-skill preservation are still enforced byte-exactly
// where the base revision is unreachable (shallow clone, exported tree, no git binary).
const BASE_PACK_FRONTMATTER_SHA256 = "7cb3b20c13380d38f3fa67fa50d4dd28bf04638935762c9fb17eac6778f67bed";
const BASE_DIAGRAMS_SKILL_SHA256 = "f3ed58132f1cbd2dd6f4b31cb87d602d2fe7328c6efab40d326a99d369419902";

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

const DIAGRAMS_SKILL_REL = `${PACK_REL}/skills/dude-pack-technical-docs-diagrams/SKILL.md`;

/** The paths T007 is allowed to write, as repository-relative POSIX paths. */
const T007_WRITE_SET = new Set([
  `${PACK_REL}/pack.md`,
  ...EXPECTED_AGENTS.map((name) => `${PACK_REL}/agents/${name}`),
  ...EXPECTED_SKILLS.filter((name) => name !== "dude-pack-technical-docs-diagrams").map(
    (name) => `${PACK_REL}/skills/${name}/SKILL.md`
  ),
  ...EXPECTED_PROMPTS.map((name) => `${PACK_REL}/prompts/${name}`),
  `${PACK_REL}/tests/pack-contract.test.mjs`,
]);

const NUMBER_WORDS = ["nine", "ten", "eleven", "twelve", "thirteen", "fourteen"];

function numberWord(count) {
  const word = NUMBER_WORDS[count - 9];
  assert.ok(word, `extend NUMBER_WORDS to cover ${count} runtime commands`);
  return word;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toPosix(value) {
  return value.split(sep).join("/");
}

/* ------------------------------------------------------------------ git base */

let baseProbe;

/** Resolve the pinned base revision once, distinguishing "unavailable" from "different". */
function probeBase() {
  if (baseProbe) return baseProbe;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${BASE_REV}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    baseProbe = { available: true, reason: "" };
  } catch (error) {
    baseProbe = { available: false, reason: `base revision ${BASE_REV} is unreachable: ${error.message}` };
  }
  return baseProbe;
}

function gitBytes(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function baseFileBytes(relPath) {
  return gitBytes(["show", `${BASE_REV}:${relPath}`]);
}

function basePackPaths() {
  const listing = gitBytes(["ls-tree", "-r", "--name-only", "-z", BASE_REV, "--", `${PACK_REL}/`]).toString("utf8");
  return listing.split("\0").filter((entry) => entry.length > 0);
}

/* --------------------------------------------------------------- frontmatter */

function splitFrontmatter(bytes) {
  const opener = Buffer.from("---\n", "utf8");
  assert.ok(bytes.subarray(0, opener.length).equals(opener), "pack.md must open with a YAML frontmatter fence");
  const closer = Buffer.from("\n---\n", "utf8");
  const closerIndex = bytes.indexOf(closer, opener.length - 1);
  assert.ok(closerIndex > 0, "pack.md must close its YAML frontmatter fence");
  const end = closerIndex + closer.length;
  return { frontmatter: bytes.subarray(0, end), body: bytes.subarray(end) };
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

/** Split `key: value` while tolerating a quoted key that may itself contain a colon. */
function splitMapping(content) {
  if (content.startsWith('"')) {
    const closing = content.indexOf('"', 1);
    assert.ok(closing > 0, `unterminated quoted key: "${content}"`);
    assert.equal(content[closing + 1], ":", `quoted key must be followed by a colon: "${content}"`);
    return { key: content.slice(1, closing), value: content.slice(closing + 2).trim() };
  }
  const separator = content.indexOf(":");
  assert.ok(separator > 0, `unparsable frontmatter line: "${content}"`);
  return { key: content.slice(0, separator).trim(), value: content.slice(separator + 1).trim() };
}

/**
 * Parse the exact YAML subset the pack manifest uses: nested maps, `- ` sequences,
 * inline `[]`, and quoted scalars. Anything else fails loudly instead of being guessed.
 */
function parseFrontmatter(text) {
  const lines = text
    .split("\n")
    .slice(1, -2)
    .filter((line) => line.trim().length > 0);
  const root = {};
  const stack = [{ indent: -1, container: root }];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].container;
    if (content.startsWith("- ")) {
      assert.ok(Array.isArray(parent), `unexpected sequence item at "${content}"`);
      parent.push(unquote(content.slice(2).trim()));
      continue;
    }
    assert.ok(!Array.isArray(parent), `unexpected mapping key inside a sequence: "${content}"`);
    const { key, value } = splitMapping(content);
    if (value === "[]") {
      parent[key] = [];
      continue;
    }
    if (value !== "") {
      parent[key] = unquote(value);
      continue;
    }
    const next = lines[index + 1];
    assert.ok(next, `frontmatter key "${key}" has no value and no children`);
    const container = next.trim().startsWith("- ") ? [] : {};
    parent[key] = container;
    stack.push({ indent, container });
  }
  return root;
}

/* ------------------------------------------------------------------ markdown */

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (absolute === join(PACK_DIR, "tests")) continue;
      collectMarkdown(absolute, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push({ path: absolute, rel: toPosix(relative(REPO_ROOT, absolute)), text: readFileSync(absolute, "utf8") });
    }
  }
  return out;
}

const MARKDOWN = collectMarkdown(PACK_DIR);

/** Line numbers (1-based) of every line that sits inside a fenced code block. */
function fencedLines(text) {
  const lines = text.split("\n");
  const inside = [];
  let fence = null;
  lines.forEach((line, index) => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (match) {
      if (fence === null) {
        fence = match[1][0].repeat(match[1].length);
        return;
      }
      if (line.trim().startsWith(fence)) {
        fence = null;
        return;
      }
    }
    if (fence !== null) inside.push({ number: index + 1, text: line });
  });
  return inside;
}

/** Join a fenced command with its backslash continuations. */
function fencedCommands(text, scriptName) {
  const lines = text.split("\n");
  const fenced = new Set(fencedLines(text).map((entry) => entry.number));
  const commands = [];
  for (let index = 0; index < lines.length; index += 1) {
    const number = index + 1;
    if (!fenced.has(number)) continue;
    if (!new RegExp(`\\bnode\\s+\\S*${scriptName.replace(".", "\\.")}\\b`).test(lines[index])) continue;
    let joined = lines[index];
    let cursor = index;
    while (joined.trimEnd().endsWith("\\") && fenced.has(cursor + 2)) {
      cursor += 1;
      joined = `${joined.trimEnd().slice(0, -1)} ${lines[cursor].trim()}`;
    }
    commands.push({ number, text: joined });
  }
  return commands;
}

function runtimeScripts() {
  const cli = [];
  const internal = [];
  for (const entry of readdirSync(SCRIPTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) cli.push(entry.name);
    else if (entry.isDirectory() && entry.name === "lib") {
      for (const nested of readdirSync(join(SCRIPTS_DIR, "lib"), { withFileTypes: true })) {
        if (nested.isFile() && nested.name.endsWith(".mjs")) internal.push(`lib/${nested.name}`);
      }
    }
  }
  return { cli: cli.sort(), internal: internal.sort() };
}

/* --------------------------------------------------------------- 1. surfaces */

test("the pack ships exactly five agents, seven skills, and two prompts", () => {
  const agents = readdirSync(join(PACK_DIR, "agents"), { withFileTypes: true });
  assert.ok(
    agents.every((entry) => entry.isFile()),
    "every agents/ entry must be a regular file"
  );
  assert.deepEqual(agents.map((entry) => entry.name).sort(), EXPECTED_AGENTS);
  assert.equal(agents.length, 5);

  const skills = readdirSync(join(PACK_DIR, "skills"), { withFileTypes: true });
  assert.ok(
    skills.every((entry) => entry.isDirectory()),
    "every skills/ entry must be a directory"
  );
  assert.deepEqual(skills.map((entry) => entry.name).sort(), EXPECTED_SKILLS);
  assert.equal(skills.length, 7);
  for (const name of EXPECTED_SKILLS) {
    const skillFile = join(PACK_DIR, "skills", name, "SKILL.md");
    assert.ok(statSync(skillFile).isFile(), `${name} must carry a SKILL.md`);
  }

  const prompts = readdirSync(join(PACK_DIR, "prompts"), { withFileTypes: true });
  assert.ok(
    prompts.every((entry) => entry.isFile()),
    "every prompts/ entry must be a regular file"
  );
  assert.deepEqual(prompts.map((entry) => entry.name).sort(), EXPECTED_PROMPTS);
  assert.equal(prompts.length, 2);
});

test("the manifest inventory matches the shipped surface exactly", () => {
  const { frontmatter } = splitFrontmatter(readFileSync(join(PACK_DIR, "pack.md")));
  const parsed = parseFrontmatter(frontmatter.toString("utf8"));
  assert.deepEqual(
    [...parsed.provides.agents].sort(),
    EXPECTED_AGENTS.map((name) => name.replace(/\.agent\.md$/, ""))
  );
  assert.deepEqual([...parsed.provides.skills].sort(), EXPECTED_SKILLS);
  assert.deepEqual([...parsed.provides.prompts].sort(), EXPECTED_PROMPTS);
});

/* ----------------------------------------------------- 2. frontmatter is base */

test("pack.md keeps its complete frontmatter byte-for-byte while only its body changes", (context) => {
  const current = readFileSync(join(PACK_DIR, "pack.md"));
  const { frontmatter, body } = splitFrontmatter(current);
  assert.equal(sha256(frontmatter), BASE_PACK_FRONTMATTER_SHA256, "pack.md frontmatter drifted from base");

  const probe = probeBase();
  if (!probe.available) {
    context.diagnostic(probe.reason);
    context.skip("pinned digest enforced; base-revision byte comparison unavailable");
    return;
  }
  const base = baseFileBytes(`${PACK_REL}/pack.md`);
  const baseParts = splitFrontmatter(base);
  assert.ok(frontmatter.equals(baseParts.frontmatter), "pack.md frontmatter is not byte-identical to base");
  // Non-vacuity: the body really did change, so the frontmatter comparison above is
  // comparing an edited file rather than an untouched one.
  assert.ok(!body.equals(baseParts.body), "pack.md body is unchanged from base, so this comparison proves nothing");
});

test("pack.md frontmatter keeps its exact structure, values, and key order", () => {
  const { frontmatter } = splitFrontmatter(readFileSync(join(PACK_DIR, "pack.md")));
  const text = frontmatter.toString("utf8");
  const parsed = parseFrontmatter(text);
  assert.deepEqual(Object.keys(parsed), ["name", "description", "provides", "requires", "routing_hints", "hooks"]);
  assert.equal(parsed.name, "technical-docs");
  assert.ok(parsed.description.length > 0, "the manifest description must not be empty");
  assert.deepEqual(Object.keys(parsed.provides), ["agents", "skills", "prompts"]);
  assert.deepEqual(parsed.provides.agents, [
    "dude-pack-technical-docs-writer",
    "dude-pack-technical-docs-extractor",
    "dude-pack-technical-docs-planner",
    "dude-pack-technical-docs-drafter",
    "dude-pack-technical-docs-reviewer",
  ]);
  assert.deepEqual(parsed.provides.skills, [
    "dude-pack-technical-docs-source-intake",
    "dude-pack-technical-docs-evidence-ledger",
    "dude-pack-technical-docs-traceability",
    "dude-pack-technical-docs-pipeline",
    "dude-pack-technical-docs-diagrams",
    "dude-pack-technical-docs-quality-audit",
    "dude-pack-technical-docs-runtime",
  ]);
  assert.deepEqual(parsed.provides.prompts, [
    "dude-pack-technical-docs-write-technical-document.prompt.md",
    "dude-pack-technical-docs-document-this-repository.prompt.md",
  ]);
  assert.deepEqual(parsed.requires, { tools: [] });
  assert.deepEqual(parsed.routing_hints, {
    "document this repository": "@dude-pack-technical-docs-writer",
    "generate technical documentation": "@dude-pack-technical-docs-writer",
    "write a technical document": "@dude-pack-technical-docs-writer",
    "update the technical document": "@dude-pack-technical-docs-writer",
  });
  assert.deepEqual(parsed.hooks, ["routing"]);
});

/* ------------------------------------------------------- 3. references resolve */

test("every relative link in the pack resolves to a real file", () => {
  let checked = 0;
  for (const file of MARKDOWN) {
    for (const match of file.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const resolved = resolve(dirname(file.path), target.split("#")[0]);
      assert.ok(existsSync(resolved), `${file.rel} links to a missing path: ${target}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no relative link was inspected, so this check would pass vacuously");
});

test("every pack artifact named in the prose exists", () => {
  const agentNames = new Set(EXPECTED_AGENTS.map((name) => name.replace(/\.agent\.md$/, "")));
  const skillNames = new Set(EXPECTED_SKILLS);
  const promptNames = new Set(EXPECTED_PROMPTS);
  let checked = 0;
  for (const file of MARKDOWN) {
    for (const match of file.text.matchAll(/dude-pack-technical-docs-[a-z0-9-]+(?:\.prompt\.md|\.agent\.md)?/g)) {
      const token = match[0];
      checked += 1;
      if (token.endsWith(".prompt.md")) {
        assert.ok(promptNames.has(token), `${file.rel} names an unknown prompt: ${token}`);
        assert.ok(existsSync(join(PACK_DIR, "prompts", token)), `${file.rel} names a missing prompt: ${token}`);
        continue;
      }
      if (token.endsWith(".agent.md")) {
        assert.ok(EXPECTED_AGENTS.includes(token), `${file.rel} names an unknown agent file: ${token}`);
        assert.ok(existsSync(join(PACK_DIR, "agents", token)), `${file.rel} names a missing agent file: ${token}`);
        continue;
      }
      assert.ok(
        agentNames.has(token) || skillNames.has(token),
        `${file.rel} names ${token}, which is neither a shipped agent nor a shipped skill`
      );
      const location = agentNames.has(token)
        ? join(PACK_DIR, "agents", `${token}.agent.md`)
        : join(PACK_DIR, "skills", token, "SKILL.md");
      assert.ok(existsSync(location), `${file.rel} names ${token}, which has no file`);
    }
  }
  assert.ok(checked > 20, `only ${checked} artifact references were inspected; the corpus looks wrong`);
});

test("every cross-pack writing skill the pack defers to exists in the catalog", () => {
  const writingSkills = join(REPO_ROOT, "library", "packs", "writing", "skills");
  let checked = 0;
  for (const file of MARKDOWN) {
    for (const match of file.text.matchAll(/dude-pack-writing-[a-z0-9-]+/g)) {
      assert.ok(
        existsSync(join(writingSkills, match[0], "SKILL.md")),
        `${file.rel} defers to ${match[0]}, which the writing pack does not ship`
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, "the optional-writing deferral disappeared from the pack prose");
});

test("every script filename in the prose resolves inside the runtime skill", () => {
  let checked = 0;
  let normalized = 0;
  for (const file of MARKDOWN) {
    for (const match of file.text.matchAll(/[A-Za-z0-9_@<>./-]*\.mjs/g)) {
      let reference = match[0];
      if (reference.startsWith("<rt>/")) {
        reference = reference.slice("<rt>/".length);
        normalized += 1;
      }
      if (reference.includes("<") || reference.includes(">")) continue;
      assert.ok(
        existsSync(join(SCRIPTS_DIR, reference)),
        `${file.rel} names ${match[0]}, which does not exist under the runtime skill`
      );
      checked += 1;
    }
  }
  assert.ok(checked > 50, `only ${checked} script references were inspected; the corpus looks wrong`);
  assert.ok(normalized > 0, "no <rt>-anchored command path was resolved, so that form is unchecked");
});

/* --------------------------------------------------- 4. entry points agree */

test("documented commands and shipped runtime scripts agree in both directions", () => {
  const { cli, internal } = runtimeScripts();
  assert.ok(cli.length > 0, "the runtime skill must ship at least one command");
  const corpus = MARKDOWN.map((file) => file.text).join("\n");
  const manifest = readFileSync(join(PACK_DIR, "pack.md"), "utf8");

  for (const script of cli) {
    assert.ok(corpus.includes(script), `${script} ships but no pack document mentions it`);
    assert.ok(
      manifest.includes(`\`${script.replace(/\.mjs$/, "")}\``),
      `pack.md does not list the ${script} command`
    );
  }
  for (const module of internal) {
    assert.ok(corpus.includes(module), `${module} ships but no pack document mentions it`);
  }

  const documented = new Set();
  for (const match of corpus.matchAll(/[A-Za-z0-9_@<>./-]*\.mjs/g)) {
    let reference = match[0];
    if (reference.startsWith("<rt>/")) reference = reference.slice("<rt>/".length);
    if (reference.includes("<") || reference.includes(">")) continue;
    documented.add(reference);
  }
  const shipped = new Set([...cli, ...internal]);
  for (const reference of documented) {
    assert.ok(shipped.has(reference), `the prose documents ${reference}, which the runtime skill does not ship`);
  }
  assert.equal(documented.size, shipped.size, "documented and shipped entry points differ");

  assert.ok(
    manifest.includes(`${numberWord(cli.length)} deterministic Node commands`),
    `pack.md must describe exactly ${cli.length} deterministic Node commands`
  );
  assert.ok(manifest.includes("lib/runtime.mjs"), "pack.md must disclose the shared internal module");
});

/* ------------------------------------------------------ 5. retired names gone */

const RETIRED_LITERALS = [
  "chunk-NNN.txt",
  "parts/ledger-",
  "existing-headings.md",
  "ledger-digest.md",
  "extraction-audit.json",
  "td-workflow",
  "td-action-items",
];

test("retired artifact names are absent from the pack", () => {
  for (const file of MARKDOWN) {
    for (const literal of RETIRED_LITERALS) {
      assert.ok(!file.text.includes(literal), `${file.rel} still names the retired ${literal}`);
    }
    assert.ok(!/chunk-\d+\.txt/.test(file.text), `${file.rel} still names a retired numbered chunk file`);
  }
});

test("retired grammar and field values are absent from the pack", () => {
  for (const file of MARKDOWN) {
    file.text.split("\n").forEach((line, index) => {
      assert.ok(
        !/^\s*terminology\s*:/.test(line),
        `${file.rel}:${index + 1} still declares a retired Outline terminology: line`
      );
    });
    assert.ok(
      !/"resolution"\s*:\s*"split"/.test(file.text),
      `${file.rel} still uses the retired "split" resolution value`
    );
  }
});

test("the retired mode-less coverage invocation is gone", () => {
  let inspected = 0;
  for (const file of MARKDOWN) {
    for (const entry of fencedLines(file.text)) {
      assert.ok(
        !entry.text.includes("--ledger --consumed"),
        `${file.rel}:${entry.number} prescribes the retired --ledger --consumed invocation`
      );
    }
    for (const command of fencedCommands(file.text, "coverage.mjs")) {
      assert.ok(
        command.text.includes("--mode "),
        `${file.rel}:${command.number} invokes coverage.mjs without the required --mode`
      );
      inspected += 1;
    }
  }
  assert.ok(inspected > 0, "no coverage.mjs invocation was inspected, so this check would pass vacuously");
});

test("the retired recall-gate label is absent from the pack", () => {
  for (const file of MARKDOWN) {
    assert.ok(!/recall gate/i.test(file.text), `${file.rel} still labels a command a "recall gate"`);
  }
});

/* --------------------------------------------- 6. tests stay out of the install */

const COPY_DIRS_HINT = `${COMPOSE_REL} no longer declares COPY_DIRS in the expected shape; re-verify what the installer copies`;

test("the install mechanism cannot reach the pack's tests", () => {
  const compose = readFileSync(join(REPO_ROOT, COMPOSE_REL), "utf8");
  const declaration = /const COPY_DIRS = \[([^\]]*)\];/.exec(compose);
  assert.ok(declaration, COPY_DIRS_HINT);
  const copyDirs = [...declaration[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]);
  assert.deepEqual(copyDirs, ["agents", "skills", "instructions", "prompts"]);
  assert.ok(!copyDirs.includes("tests"), "compose would now install the pack's tests directory");

  const installed = [];
  for (const category of copyDirs) {
    const categoryDir = join(PACK_DIR, category);
    if (!existsSync(categoryDir)) continue;
    for (const entry of readdirSync(categoryDir)) installed.push(join(categoryDir, entry));
  }
  assert.ok(installed.length > 0, "the pack would install nothing, so this check would pass vacuously");
  const testsDir = join(PACK_DIR, "tests");
  for (const source of installed) {
    assert.ok(
      !source.startsWith(`${testsDir}${sep}`) && source !== testsDir,
      `${toPosix(relative(REPO_ROOT, source))} would be installed from the tests directory`
    );
  }

  const { frontmatter } = splitFrontmatter(readFileSync(join(PACK_DIR, "pack.md")));
  const parsed = parseFrontmatter(frontmatter.toString("utf8"));
  assert.ok(!("tests" in parsed.provides), "pack.md declares a tests category");
  const declared = [...parsed.provides.agents, ...parsed.provides.skills, ...parsed.provides.prompts];
  for (const name of declared) {
    assert.ok(!name.includes("test"), `pack.md declares a test artifact: ${name}`);
  }

  assert.ok(existsSync(testsDir), "the tests directory disappeared, so this check would pass vacuously");
});

/* ------------------------------------------------- 7. diagrams skill unchanged */

test("the diagrams skill is unchanged from base", (context) => {
  const current = readFileSync(join(REPO_ROOT, DIAGRAMS_SKILL_REL));
  assert.equal(sha256(current), BASE_DIAGRAMS_SKILL_SHA256, "the diagrams skill drifted from base");

  const probe = probeBase();
  if (!probe.available) {
    context.diagnostic(probe.reason);
    context.skip("pinned digest enforced; base-revision byte comparison unavailable");
    return;
  }
  assert.ok(current.equals(baseFileBytes(DIAGRAMS_SKILL_REL)), "the diagrams skill is not byte-identical to base");
});

/* ----------------------------------------------------------- 8. write boundary */

test("no path outside the declared T007 write set differs from base", (context) => {
  const probe = probeBase();
  if (!probe.available) {
    context.diagnostic(probe.reason);
    context.skip("base-revision comparison unavailable");
    return;
  }

  const basePaths = basePackPaths();
  assert.ok(basePaths.length > 0, `base revision carries no ${PACK_REL} tree`);
  let compared = 0;
  for (const relPath of basePaths) {
    if (T007_WRITE_SET.has(relPath)) continue;
    const absolute = join(REPO_ROOT, relPath);
    assert.ok(existsSync(absolute), `${relPath} was removed but is outside the T007 write set`);
    assert.ok(
      readFileSync(absolute).equals(baseFileBytes(relPath)),
      `${relPath} changed but is outside the T007 write set`
    );
    compared += 1;
  }
  assert.ok(compared > 0, "no protected path was compared, so this check would pass vacuously");

  const baseSet = new Set(basePaths);
  const current = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else current.push(toPosix(relative(REPO_ROOT, absolute)));
    }
  })(PACK_DIR);
  for (const relPath of current) {
    if (baseSet.has(relPath) || T007_WRITE_SET.has(relPath)) continue;
    // Later phases add authoring-only tests, which the install mechanism cannot reach.
    assert.ok(relPath.startsWith(`${PACK_REL}/tests/`), `${relPath} was added outside the T007 write set`);
  }

  // Non-vacuity: every declared write-set path must exist, so the exclusion list above
  // cannot be silently hiding a path that no longer exists.
  for (const relPath of T007_WRITE_SET) {
    assert.ok(existsSync(join(REPO_ROOT, relPath)), `the declared write set names a missing path: ${relPath}`);
  }
});

#!/usr/bin/env node
// repo-inventory.mjs — Bounded, read-only scan of a repository for the extractor.
//
// A repository is one of the pack's source kinds. The extractor cannot read a whole
// tree into one prompt, so this script walks the tree once, path-only, and emits a
// compact JSON inventory: the languages present, the package manifests, the likely
// entry points, top-level config, test and schema locations, and the docs. The
// extractor consumes that inventory to emit R* (repository-derived) evidence.
//
// It is deliberately read-only and bounded. It never reads file contents except the
// package manifests it needs for entry points and the root .gitignore. It skips the
// usual build/vendor directories and any dot-directory, and it stops after
// --max-files files (default 5000), setting "truncated": true when it does. It never
// shells out to git.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs <repoRoot> [--out <inventory.json>] [--max-files <n>]
//
// Writes pretty JSON to --out when given, else to stdout, and a one-line summary to
// stderr. Exits 0 on success, 2 on bad arguments or a missing/non-directory root.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";

// Directories that never carry primary source and are always skipped, on top of any
// dot-directory (handled separately) and simple root-.gitignore directory entries.
// .git, .next, and .venv are dot-directories already covered by that rule.
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "out", "coverage",
  "__pycache__", "target", "vendor",
]);

const MANIFEST_NAMES = new Set([
  "package.json", "pyproject.toml", "cargo.toml", "go.mod", "go.sum",
  "pom.xml", "gemfile", "build.gradle", "build.gradle.kts",
  "composer.json", "setup.py", "setup.cfg", "requirements.txt",
]);
const MANIFEST_EXTS = new Set([".csproj", ".fsproj", ".vbproj"]);

const CONFIG_EXTS = new Set([".json", ".yaml", ".yml", ".toml", ".ini"]);
const WELL_KNOWN_DOTFILES = new Set([
  ".editorconfig", ".gitignore", ".gitattributes", ".npmrc", ".nvmrc",
  ".node-version", ".prettierrc", ".prettierignore", ".eslintrc",
  ".eslintignore", ".babelrc", ".dockerignore", ".env.example",
  ".tool-versions", ".python-version", ".ruby-version",
]);

const SCHEMA_EXTS = new Set([".sql", ".prisma", ".graphql", ".gql", ".proto"]);

// Compact extension → language map. Unmapped extensions fall back to `.<ext>` so the
// histogram stays honest instead of dropping unfamiliar file kinds.
const EXT_LANG = {
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", php: "PHP", pl: "Perl", pm: "Perl",
  java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", clj: "Clojure",
  cs: "C#", fs: "F#", vb: "Visual Basic",
  c: "C", h: "C/C++ header", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++", hh: "C++",
  m: "Objective-C", mm: "Objective-C++", swift: "Swift", dart: "Dart", lua: "Lua",
  r: "R", jl: "Julia", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
  vue: "Vue", svelte: "Svelte", astro: "Astro",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protocol Buffers",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", txt: "Text",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", ini: "INI", xml: "XML",
};

const toPosix = (p) => p.split(sep).join("/");

// Read the root .gitignore and return the simple single-segment directory names it
// lists (e.g. `dist/`, `/build`, `cache`). Globs, negations, and nested paths are
// skipped — honoring them correctly needs git semantics, which this script avoids.
function gitignoreDirs(root) {
  const names = new Set();
  let raw;
  try {
    raw = readFileSync(join(root, ".gitignore"), "utf8");
  } catch {
    return names;
  }
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    let t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("!")) continue;
    if (/[*?[\]]/.test(t)) continue; // not a simple entry
    t = t.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!t || t.includes("/")) continue; // only single-segment directory names
    names.add(t);
  }
  return names;
}

function main() {
  const argv = process.argv.slice(2);
  let repoRoot = null;
  let out = null;
  let maxFilesRaw = "5000";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--max-files") maxFilesRaw = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs <repoRoot> [--out <inventory.json>] [--max-files <n>]\n"
      );
      process.exit(0);
    } else if (!repoRoot) repoRoot = a;
  }
  if (!repoRoot) {
    process.stderr.write("error: require <repoRoot>\n");
    process.exit(2);
  }
  const maxFiles = parseInt(maxFilesRaw, 10);
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
    process.stderr.write(`error: --max-files must be a positive integer (got "${maxFilesRaw}")\n`);
    process.exit(2);
  }

  let rootStat;
  try {
    rootStat = statSync(repoRoot);
  } catch {
    process.stderr.write(`error: repoRoot does not exist: ${repoRoot}\n`);
    process.exit(2);
  }
  if (!rootStat.isDirectory()) {
    process.stderr.write(`error: repoRoot is not a directory: ${repoRoot}\n`);
    process.exit(2);
  }

  const ignoreDirs = new Set([...SKIP_DIRS, ...gitignoreDirs(repoRoot)]);

  const languages = new Map();
  const packageManifests = new Set();
  const entryPoints = new Set();
  const configFiles = new Set();
  const testDirs = new Set();
  const schemaFiles = new Set();
  const docs = new Set();

  // package.json is the one manifest we read (contents allowed) to resolve entry
  // points; every other manifest is recorded path-only.
  const addEntryFromPackageJson = (dir, rawText) => {
    let pkg;
    try {
      pkg = JSON.parse(rawText);
    } catch {
      return;
    }
    const addRel = (p) => {
      if (typeof p !== "string" || !p) return;
      const r = toPosix(relative(repoRoot, join(dir, p)));
      if (r && !r.startsWith("..")) entryPoints.add(r);
    };
    if (typeof pkg.main === "string") addRel(pkg.main);
    if (typeof pkg.bin === "string") addRel(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === "object") {
      for (const v of Object.values(pkg.bin)) addRel(v);
    }
  };

  let scanned = 0;
  let truncated = false;
  const stack = [repoRoot];

  outer: while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory — skip
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const relDir = toPosix(relative(repoRoot, dir)) || ".";
    const isRoot = relDir === ".";
    const subdirs = [];
    let dirHasTestFile = false;

    for (const ent of entries) {
      const name = ent.name;
      if (ent.isSymbolicLink()) continue; // never follow symlinks (cycles, content)

      if (ent.isDirectory()) {
        if (name.startsWith(".") || ignoreDirs.has(name)) continue;
        subdirs.push(join(dir, name));
        if (name === "test" || name === "tests" || name === "__tests__") {
          testDirs.add(toPosix(relative(repoRoot, join(dir, name))));
        }
        continue;
      }
      if (!ent.isFile()) continue;

      if (scanned >= maxFiles) {
        truncated = true;
        break outer;
      }
      scanned++;

      const rel = toPosix(relative(repoRoot, join(dir, name)));
      const lower = name.toLowerCase();
      const ext = extname(name).toLowerCase();
      const extNoDot = ext.replace(/^\./, "");

      // Language histogram (files that carry an extension).
      if (extNoDot) {
        const lang = EXT_LANG[extNoDot] || `.${extNoDot}`;
        languages.set(lang, (languages.get(lang) || 0) + 1);
      }

      // Package manifests. package.json is additionally read for entry points.
      const isManifest = MANIFEST_NAMES.has(lower) || MANIFEST_EXTS.has(ext);
      if (isManifest) {
        packageManifests.add(rel);
        if (lower === "package.json") {
          try {
            addEntryFromPackageJson(dir, readFileSync(join(dir, name), "utf8"));
          } catch {
            /* unreadable manifest — entry points stay best-effort */
          }
        }
      }

      // Entry points by conventional path.
      if (/^main\.[^/]+$/.test(rel) || /^src\/index\.[^/]+$/.test(rel) || /^cmd\/[^/]+\/main\.[^/]+$/.test(rel)) {
        entryPoints.add(rel);
      }

      // Top-level config files (exclude manifests to keep the lists distinct).
      if (isRoot && !isManifest && (CONFIG_EXTS.has(ext) || WELL_KNOWN_DOTFILES.has(lower))) {
        configFiles.add(rel);
      }

      // Schema / contract files.
      if (
        SCHEMA_EXTS.has(ext) ||
        /^(openapi|swagger)\./.test(lower) ||
        lower === "schema.json" ||
        lower.endsWith(".schema.json")
      ) {
        schemaFiles.add(rel);
      }

      // Docs: any README*, anything under a top-level docs/, and top-level *.md.
      if (/^readme/i.test(name)) docs.add(rel);
      else if (rel.startsWith("docs/")) docs.add(rel);
      else if (isRoot && ext === ".md") docs.add(rel);

      // A *.test.* / *.spec.* file marks its directory as a test directory.
      if (/\.(test|spec)\./i.test(name)) dirHasTestFile = true;
    }

    if (dirHasTestFile) testDirs.add(relDir);
    for (let i = subdirs.length - 1; i >= 0; i--) stack.push(subdirs[i]);
  }

  const topLanguages = [...languages.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 8)
    .map(([language, files]) => ({ language, files }));

  const sortedList = (set) => [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const inventory = {
    root: repoRoot,
    fileCount: scanned,
    truncated,
    languages: topLanguages,
    packageManifests: sortedList(packageManifests),
    entryPoints: sortedList(entryPoints),
    configFiles: sortedList(configFiles),
    testDirs: sortedList(testDirs),
    schemaFiles: sortedList(schemaFiles),
    docs: sortedList(docs),
  };

  const outStr = JSON.stringify(inventory, null, 2);
  if (out) writeFileSync(out, outStr + "\n");
  else process.stdout.write(outStr + "\n");

  process.stderr.write(
    `repo-inventory: scanned ${scanned} file(s) under ${repoRoot}, ${topLanguages.length} language(s), ${inventory.packageManifests.length} manifest(s)${truncated ? ", truncated" : ""}\n`
  );
  process.exit(0);
}

main();

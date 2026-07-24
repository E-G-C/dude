import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";

export const CANONICAL_TEMP_ROOT = realpathSync.native(tmpdir());

/** Create and automatically clean a temporary workspace under the canonical OS temp root. */
export function makeTempRoot(test, prefix = "technical-docs-") {
  const root = realpathSync.native(mkdtempSync(join(CANONICAL_TEMP_ROOT, prefix)));
  test?.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Resolve a fixture path while refusing a lexical escape from its root. */
export function fixturePath(root, relativePath) {
  assert.equal(typeof relativePath, "string", "fixture path must be a string");
  assert.ok(relativePath.length > 0, "fixture path must not be empty");
  assert.ok(!relativePath.includes("\0"), "fixture path must not contain NUL");
  assert.ok(
    !isAbsolute(relativePath) && !win32.isAbsolute(relativePath) && !/^[A-Za-z]:/.test(relativePath),
    `fixture path must be relative on every supported host: ${relativePath}`
  );
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, relativePath);
  const difference = relative(absoluteRoot, absolutePath);
  assert.ok(
    difference === "" || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference)),
    `fixture path escapes root: ${relativePath}`
  );
  return absolutePath;
}

function tryFixtureLstat(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensureSafeFixtureParent(root, absolutePath) {
  const absoluteRoot = resolve(root);
  const rootStat = tryFixtureLstat(absoluteRoot);
  assert.ok(rootStat?.isDirectory() && !rootStat.isSymbolicLink(), `fixture root must be a non-symlink directory: ${absoluteRoot}`);

  const parent = dirname(absolutePath);
  const difference = relative(absoluteRoot, parent);
  const segments = difference === "" ? [] : difference.split(sep);
  let current = absoluteRoot;
  for (const segment of segments) {
    current = join(current, segment);
    let stat = tryFixtureLstat(current);
    if (stat === null) {
      try {
        mkdirSync(current);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stat = tryFixtureLstat(current);
    }
    assert.ok(stat?.isDirectory() && !stat.isSymbolicLink(), `fixture parent must be a non-symlink directory: ${current}`);
  }

  const targetStat = tryFixtureLstat(absolutePath);
  assert.ok(
    !targetStat?.isSymbolicLink() && !(targetStat?.isFile() && targetStat.nlink > 1),
    `fixture target must not be a symlink or multiply linked file: ${absolutePath}`
  );
}

/** Write a fixture without following existing symlink components. */
export function writeFixture(root, relativePath, value, options = {}) {
  const absolutePath = fixturePath(root, relativePath);
  ensureSafeFixtureParent(root, absolutePath);
  writeFileSync(absolutePath, value, options);
  return absolutePath;
}

/** Write deterministic pretty JSON fixture bytes. */
export function writeJsonFixture(root, relativePath, value) {
  return writeFixture(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Write compact JSONL fixture bytes. */
export function writeJsonlFixture(root, relativePath, records) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + (records.length === 0 ? "" : "\n");
  return writeFixture(root, relativePath, text);
}

/** Invoke a Node script without a shell. */
export function runNode(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    input: options.input,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    shell: false,
  });
}

function withProbeDirectory(root, callback) {
  const probeRoot = mkdtempSync(join(root, ".capability-"));
  try {
    return callback(probeRoot);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

/** Report whether the filesystem permits symbolic-link fixtures. */
export function canCreateSymlink(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    const link = join(probeRoot, "link");
    writeFileSync(target, "target\n");
    try {
      symlinkSync(target, link, "file");
      return lstatSync(link).isSymbolicLink();
    } catch {
      return false;
    }
  });
}

/** Report whether the filesystem permits hard-link fixtures. */
export function canCreateHardlink(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    const link = join(probeRoot, "link");
    writeFileSync(target, "target\n");
    try {
      linkSync(target, link);
      return lstatSync(target).ino === lstatSync(link).ino;
    } catch {
      return false;
    }
  });
}

/** Report whether removing read permissions is enforced for the current process. */
export function canEnforceUnreadableFile(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    writeFileSync(target, "target\n");
    chmodSync(target, 0o000);
    let descriptor;
    try {
      descriptor = openSync(target, FS_CONSTANTS.O_RDONLY);
      return false;
    } catch (error) {
      return error?.code === "EACCES" || error?.code === "EPERM";
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      chmodSync(target, 0o600);
    }
  });
}

/** Return exact fixture bytes. */
export function readBytes(filePath) {
  return readFileSync(filePath);
}

/** Compute lowercase SHA-256 over exact bytes. */
export function sha256(value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Assert a file's exact bytes and return them. */
export function assertFileBytes(filePath, expected) {
  const actual = readFileSync(filePath);
  assert.deepEqual(actual, Buffer.from(expected));
  return actual;
}

/** Assert a file's exact SHA-256 digest. */
export function assertFileHash(filePath, expected) {
  assert.equal(sha256(readFileSync(filePath)), expected);
}

/** Capture an output's existence and exact bytes before a failure case. */
export function captureOutput(filePath) {
  return existsSync(filePath)
    ? Object.freeze({ exists: true, bytes: readFileSync(filePath) })
    : Object.freeze({ exists: false, bytes: null });
}

/** Assert that a prior output snapshot is unchanged. */
export function assertOutputPreserved(filePath, snapshot) {
  assert.equal(existsSync(filePath), snapshot.exists, `output existence changed: ${filePath}`);
  if (snapshot.exists) assert.deepEqual(readFileSync(filePath), snapshot.bytes, `output bytes changed: ${filePath}`);
}

/** Assert that an atomic writer left no adjacent temporary artifact. */
export function assertNoAdjacentTemps(targetPath) {
  const prefix = `.${basename(targetPath)}.tmp-`;
  const names = readdirSync(dirname(targetPath)).filter((name) => name.startsWith(prefix));
  assert.deepEqual(names, [], `temporary artifacts remain beside ${targetPath}`);
}

/** Remove a fixture path when a test needs explicit lifecycle control. */
export function removeFixture(filePath) {
  if (existsSync(filePath)) unlinkSync(filePath);
}

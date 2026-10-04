// @ts-check
/**
 * Offline build-contract coverage for Dude's A2A runtime. Nothing here runs
 * npm or contacts a registry. The byte-for-byte rebuild needs the scoped
 * install (`npm ci --prefix scripts/dude-a2a`) and skips with a stated reason
 * without it, unless DUDE_A2A_BUILD_REQUIRED=1 makes that coverage mandatory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ENTRY_FILE, MISSING_DEPENDENCIES, OUTPUT_FILE, buildA2aRuntime } from './build.mjs';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_ROOT, '..', '..');
const LEGAL_FILE = `${OUTPUT_FILE}.LEGAL.txt`;
const SCOPED_INSTALL_SKIP = 'requires the scoped install; run `npm ci --prefix scripts/dude-a2a` (never run by these tests)';
const SECTION = /----- BEGIN BUNDLED PACKAGE LICENSE -----\nPackage: "([^"]+)"\nVersion: "([^"]+)"\nPackage root: "([^"]+)"\nLicense: "([^"]+)"\nLicense source: "([^"]+)"\nLicense text:\n([\s\S]*?)\n----- END BUNDLED PACKAGE LICENSE -----/g;
const RUNTIME_EXPORTS = [
  'A2AError', 'A2A_PROTOCOL_VERSION', 'A2A_VERSION_HEADER', 'AGENT_CARD_PATH',
  'ContentTypeNotSupportedError', 'ExtendedAgentCardNotConfiguredError', 'JsonRpcTransportFactory',
  'PushNotificationNotSupportedError', 'RequestMalformedError', 'Role', 'UnsupportedOperationError',
  'VersionNotSupportedError', 'agentCardHandler', 'express', 'jsonRpcHandler', 'toJsonRpcError',
];

/** @param {string} relative */
function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, relative), 'utf8'));
}

function hasScopedInstall() {
  return fs.existsSync(path.join(TOOL_ROOT, 'node_modules', 'esbuild', 'package.json'));
}

/** @param {import('node:test').TestContext} context */
function skipWithoutInstall(context) {
  assert.notEqual(process.env.DUDE_A2A_BUILD_REQUIRED, '1', `Required A2A runtime build coverage: ${SCOPED_INSTALL_SKIP}`);
  context.skip(SCOPED_INSTALL_SKIP);
}

/** @returns {Array<{name: string, version: string, root: string, license: string, source: string, text: string}>} */
function legalSections() {
  const legal = fs.readFileSync(LEGAL_FILE, 'utf8');
  return [...legal.matchAll(SECTION)].map((match) => ({
    name: match[1], version: match[2], root: match[3], license: match[4], source: match[5], text: match[6],
  }));
}

test('the scoped manifest and lock pin SDK 1.2.0, Express 5.2.1, and esbuild 0.28.2 with registry integrity', () => {
  const manifest = readJson('package.json');
  const lock = readJson('package-lock.json');
  const packages = /** @type {Record<string, any>} */ (lock.packages);

  assert.equal(fs.existsSync(path.join(ROOT, 'package.json')), false, 'no root workspace is created');
  assert.deepEqual(manifest, {
    name: '@dude/a2a-runtime',
    private: true,
    scripts: { build: 'node build.mjs', test: 'node --test build.test.mjs' },
    engines: { node: '>=20' },
    dependencies: { '@a2a-js/sdk': '1.2.0', express: '5.2.1' },
    devDependencies: { esbuild: '0.28.2' },
  });
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(packages[''].dependencies, manifest.dependencies);
  assert.deepEqual(packages[''].devDependencies, manifest.devDependencies);
  assert.equal(packages['node_modules/@a2a-js/sdk'].version, '1.2.0');
  assert.equal(packages['node_modules/@a2a-js/sdk'].license, 'Apache-2.0');
  assert.equal(packages['node_modules/express'].version, '5.2.1');
  assert.equal(packages['node_modules/esbuild'].version, '0.28.2');
  assert.equal(packages['node_modules/esbuild'].dev, true);
  for (const [locked, entry] of Object.entries(packages)) {
    if (locked === '') continue;
    assert.equal(typeof entry.version, 'string', `${locked} has an exact version`);
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${locked} resolves from the public registry`);
    assert.match(entry.integrity, /^sha512-/, `${locked} has an integrity digest`);
  }
  assert.equal(Object.keys(packages).some((locked) => /(?:^|\/)(?:@grpc|@bufbuild)\//.test(locked)), false,
    'the optional gRPC peers are not installed');
});

test('the scoped ignore keeps the dependency install out of source', () => {
  const rules = fs.readFileSync(path.join(TOOL_ROOT, '.gitignore'), 'utf8').split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(rules, ['/node_modules/']);
});

test('the build has one fixed Node ESM entry and fixed outputs, and it never installs or fetches', () => {
  const build = fs.readFileSync(path.join(TOOL_ROOT, 'build.mjs'), 'utf8');
  const entry = fs.readFileSync(ENTRY_FILE, 'utf8');

  assert.equal(ENTRY_FILE, path.join(TOOL_ROOT, 'entry.mjs'));
  assert.equal(OUTPUT_FILE, path.join(ROOT, 'src', 'extensions', 'dude', 'lib', 'a2a-runtime.mjs'));
  for (const option of ["entryPoints: [ENTRY_FILE]", "format: 'esm'", "platform: 'node'", "target: 'node20'",
    "legalComments: 'linked'", 'metafile: true', 'minify: true', 'keepNames: true', 'sourcemap: false', 'write: false']) {
    assert.ok(build.includes(option), `build option ${option}`);
  }
  assert.doesNotMatch(build, /\b(?:external|splitting|outdir|plugins)\s*:/);
  assert.doesNotMatch(build, /child_process|\bspawn|\bexec(?:File)?(?:Sync)?\(|\bfetch\(|node:https?/,
    'the build can neither spawn npm nor fetch packages');
  assert.doesNotMatch(entry, /compat\/v0_3|server\/grpc|client\/grpc|InMemoryTaskStore|DefaultRequestHandler|restHandler/,
    'v0.3, gRPC, REST, and task-store modules are not part of the runtime surface');
});

test('a build without the scoped install fails explicitly, creates no install, and writes nothing', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-build-'));
  try {
    const tool = path.join(sandbox, 'scripts', 'dude-a2a');
    const output = path.join(sandbox, 'src', 'extensions', 'dude', 'lib');
    fs.mkdirSync(tool, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    for (const file of ['build.mjs', 'entry.mjs', 'package.json', 'package-lock.json']) {
      fs.copyFileSync(path.join(TOOL_ROOT, file), path.join(tool, file));
    }

    const result = spawnSync(process.execPath, [path.join(tool, 'build.mjs')], { cwd: sandbox, encoding: 'utf8' });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stderr.trim(), MISSING_DEPENDENCIES);
    assert.equal(fs.existsSync(path.join(tool, 'node_modules')), false, 'nothing was installed');
    assert.deepEqual(fs.readdirSync(output), [], 'no runtime or notice was written');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the committed runtime imports offline as one ESM bundle exporting exactly the transport surface', async () => {
  const bytes = fs.readFileSync(OUTPUT_FILE);
  const text = bytes.toString('utf8');
  const runtime = await import(pathToFileURL(OUTPUT_FILE).href);

  assert.deepEqual(Object.keys(runtime).sort(), RUNTIME_EXPORTS);
  assert.equal(runtime.A2A_PROTOCOL_VERSION, '1.0');
  assert.equal(typeof runtime.express().use, 'function');
  assert.match(text, /^import \{ createRequire as __dudeA2aCreateRequire \} from 'node:module';\n/);
  assert.match(text, /\/\*! For license information please see a2a-runtime\.mjs\.LEGAL\.txt \*\/\n$/);
  assert.doesNotMatch(text, /sourceMappingURL/);
  const staticImports = [...text.matchAll(/(?:^|[;}\n])\s*import\s*(?:[\w*{][^;]*?from\s*)?["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(staticImports.length > 0);
  assert.ok(staticImports.every((specifier) => specifier.startsWith('node:') || /^[a-z_]+$/.test(specifier)),
    `the bundle imports only Node built-ins: ${[...new Set(staticImports)].join(', ')}`);
});

test('the legal notice lists each bundled package at its locked version with complete license terms', () => {
  const lock = readJson('package-lock.json');
  const legal = fs.readFileSync(LEGAL_FILE, 'utf8');
  const sections = legalSections();

  assert.match(legal, /^Bundled license information:\n/);
  assert.match(legal, /\nThird-party package licenses \(metafile-derived\)\n/);
  assert.ok(sections.length >= 60, `expected the bundled Express and SDK closure, found ${sections.length} sections`);
  assert.equal(new Set(sections.map((section) => section.root)).size, sections.length, 'each package root appears once');
  for (const section of sections) {
    const locked = lock.packages[`node_modules/${section.root}`];
    assert.ok(locked, `${section.root} is in the lock`);
    assert.equal(section.version, locked.version, `${section.root} version`);
    assert.equal(section.license, locked.license, `${section.root} license`);
    assert.notEqual(locked.dev, true, `${section.root} is a runtime dependency, not a build tool`);
  }
  const byName = new Map(sections.map((section) => [section.root, section]));
  const sdk = byName.get('@a2a-js/sdk');
  assert.equal(sdk?.version, '1.2.0');
  assert.equal(sdk?.license, 'Apache-2.0');
  assert.match(sdk?.text ?? '', /Apache License\s+Version 2\.0/);
  assert.equal(byName.get('express')?.version, '5.2.1');
  assert.match(byName.get('express')?.text ?? '', /Permission is hereby granted, free of charge/);
  assert.equal(byName.get('qs')?.license, 'BSD-3-Clause');
  assert.equal(byName.has('esbuild'), false, 'the build tool is not shipped');
});

test('rebuilding from the pinned install reproduces the committed runtime and notice byte for byte', async (context) => {
  if (!hasScopedInstall()) {
    skipWithoutInstall(context);
    return;
  }
  const lock = readJson('package-lock.json');
  for (const [locked, entry] of Object.entries(/** @type {Record<string, any>} */ (lock.packages))) {
    if (locked === '' || entry.optional) continue;
    const installed = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, locked, 'package.json'), 'utf8'));
    assert.equal(installed.version, entry.version, `installed ${locked} matches the lock`);
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-rebuild-'));
  try {
    const outputFile = path.join(scratch, 'a2a-runtime.mjs');
    const built = await buildA2aRuntime({ outputFile });

    assert.ok(fs.readFileSync(outputFile).equals(fs.readFileSync(OUTPUT_FILE)), 'a2a-runtime.mjs is exactly the pinned build output');
    assert.ok(fs.readFileSync(`${outputFile}.LEGAL.txt`).equals(fs.readFileSync(LEGAL_FILE)), 'the notice is exactly the pinned build output');
    assert.deepEqual(fs.readdirSync(scratch).sort(), ['a2a-runtime.mjs', 'a2a-runtime.mjs.LEGAL.txt']);
    assert.deepEqual(built.packages.map((entry) => `${entry.name}@${entry.version}`),
      legalSections().map((section) => `${section.name}@${section.version}`));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

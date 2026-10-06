// @ts-check
/**
 * Build Dude's lazily imported A2A runtime from the dependencies pinned in
 * this directory's package-lock.json. The build never installs packages; run
 * `npm ci --prefix scripts/dude-a2a` first. It writes exactly
 * `src/extensions/dude/lib/a2a-runtime.mjs` and its `.LEGAL.txt` notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const DEPENDENCY_DIRECTORY = path.join(TOOL_ROOT, 'node_modules');
export const ENTRY_FILE = path.join(TOOL_ROOT, 'entry.mjs');
export const OUTPUT_FILE = path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'lib', 'a2a-runtime.mjs');
export const MISSING_DEPENDENCIES = 'missing scoped A2A build dependencies; run `npm ci --prefix scripts/dude-a2a` first (this build never installs packages)';
const LICENSE_FILENAME = /^(?:licen[cs]e|copying)(?:\.[A-Za-z0-9._-]+)?$/i;
const NOTICE_FILENAME = /^notice(?:\.[A-Za-z0-9._-]+)?$/i;
const PACKAGE_SECTION_START = '----- BEGIN BUNDLED PACKAGE LICENSE -----';
const PACKAGE_SECTION_END = '----- END BUNDLED PACKAGE LICENSE -----';
// Express and its dependencies are CommonJS; the ESM bundle needs require().
const REQUIRE_BANNER = "import { createRequire as __dudeA2aCreateRequire } from 'node:module';\n"
  + 'const require = __dudeA2aCreateRequire(import.meta.url);';
// A new license family needs review before it can ship in the runtime.
const REQUIRED_LICENSE_TERMS = Object.freeze({
  'Apache-2.0': ['apache license', 'version 2.0', 'grant of copyright license'],
  'BSD-3-Clause': [
    'redistribution and use in source and binary forms',
    'neither the name of',
    'provided by the copyright holders and contributors "as is"',
  ],
  ISC: ['permission to use, copy, modify, and/or distribute this software', 'the software is provided "as is"'],
  MIT: [
    'permission is hereby granted, free of charge',
    'the above copyright notice and this permission notice shall be included',
    'without warranty of any kind',
  ],
});

/** @param {string} candidate */
function lstatOrNull(candidate) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {string} base @param {string} candidate */
function isPathWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {string} left @param {string} right */
function codeUnitOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {string} file @param {string} label */
function readNotice(file, label) {
  const stat = lstatOrNull(file);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe ${label}`);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (!text.trim() || text.includes('\0')) throw new Error(`${label} is empty or unsafe`);
  if (text.includes(PACKAGE_SECTION_START) || text.includes(PACKAGE_SECTION_END)) {
    throw new Error(`${label} contains a reserved section marker`);
  }
  return text;
}

/**
 * Map one contributing esbuild input to its innermost npm package root.
 * @param {string} inputPath absolute input path inside the dependency directory
 */
function packageRootFor(inputPath) {
  const parts = path.relative(DEPENDENCY_DIRECTORY, inputPath).split(path.sep);
  let start = 0;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] === 'node_modules') start = index + 1;
  }
  const length = parts[start]?.startsWith('@') ? 2 : 1;
  const name = parts.slice(start, start + length);
  if (name.length !== length || name.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`cannot resolve the package root of bundled input ${inputPath}`);
  }
  return path.join(DEPENDENCY_DIRECTORY, ...parts.slice(0, start + length));
}

/** @param {string} packageRoot */
function readPackage(packageRoot) {
  const rootRelative = path.relative(DEPENDENCY_DIRECTORY, packageRoot).split(path.sep).join('/');
  const realRoot = fs.realpathSync(packageRoot);
  if (!isPathWithin(fs.realpathSync(DEPENDENCY_DIRECTORY), realRoot)) {
    throw new Error(`bundled package escapes the scoped dependencies: ${rootRelative}`);
  }
  const metadataText = readNotice(path.join(packageRoot, 'package.json'), `${rootRelative}/package.json`);
  /** @type {unknown} */
  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    throw new Error(`invalid package metadata: ${rootRelative}/package.json`);
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`invalid package metadata: ${rootRelative}/package.json`);
  }
  const { name, version, license } = /** @type {{name?:unknown,version?:unknown,license?:unknown}} */ (metadata);
  if (typeof name !== 'string' || typeof version !== 'string' || typeof license !== 'string'
    || (rootRelative !== name && !rootRelative.endsWith(`/node_modules/${name}`))
    || !/^[0-9A-Za-z.+-]+$/.test(version)) {
    throw new Error(`missing or inconsistent package identity: ${rootRelative}/package.json`);
  }
  const requiredTerms = Object.hasOwn(REQUIRED_LICENSE_TERMS, license)
    ? REQUIRED_LICENSE_TERMS[/** @type {keyof typeof REQUIRED_LICENSE_TERMS} */ (license)]
    : null;
  if (!requiredTerms) throw new Error(`unreviewed license ${JSON.stringify(license)} for ${name}@${version}`);

  const entries = fs.readdirSync(packageRoot).sort(codeUnitOrder);
  const licenseFiles = entries.filter((entry) => LICENSE_FILENAME.test(entry));
  if (licenseFiles.length !== 1) {
    throw new Error(`expected exactly one license file for ${name}@${version}, found ${licenseFiles.length}`);
  }
  const licenseText = readNotice(path.join(packageRoot, licenseFiles[0]), `license for ${name}@${version}`);
  const normalized = licenseText.replace(/\s+/g, ' ').toLowerCase();
  for (const term of requiredTerms) {
    if (!normalized.includes(term)) throw new Error(`license for ${name}@${version} lacks complete ${license} terms: ${term}`);
  }
  const noticeFiles = entries.filter((entry) => NOTICE_FILENAME.test(entry));
  return {
    license,
    licenseFile: licenseFiles[0],
    licenseText,
    name,
    notices: noticeFiles.map((file) => ({ file, text: readNotice(path.join(packageRoot, file), `notice for ${name}@${version}`) })),
    rootRelative,
    version,
  };
}

/**
 * Derive package notices only from inputs that contributed bytes to the
 * runtime, so tree-shaken dependencies are not listed as shipped code.
 * @param {import('esbuild').Metafile} metafile
 * @param {string} outputFile
 */
export function collectBundledPackageLicenses(metafile, outputFile) {
  const outputs = Object.entries(metafile.outputs)
    .filter(([output]) => path.resolve(TOOL_ROOT, output) === path.resolve(outputFile));
  if (outputs.length !== 1) throw new Error('esbuild metafile does not identify exactly one runtime output');
  /** @type {Set<string>} */
  const roots = new Set();
  for (const [input, contribution] of Object.entries(outputs[0][1].inputs)) {
    if (!(contribution.bytesInOutput > 0)) continue;
    const inputPath = path.resolve(TOOL_ROOT, input);
    if (inputPath === ENTRY_FILE) continue;
    if (!isPathWithin(DEPENDENCY_DIRECTORY, inputPath)) throw new Error(`unexpected bundled input outside scoped dependencies: ${input}`);
    roots.add(packageRootFor(inputPath));
  }
  if (roots.size === 0) throw new Error('esbuild metafile contains no bundled package inputs');
  return [...roots].sort(codeUnitOrder).map(readPackage);
}

/** @param {ReturnType<typeof collectBundledPackageLicenses>} packages */
function renderThirdPartyLicenses(packages) {
  const sections = packages.map((entry) => [
    PACKAGE_SECTION_START,
    `Package: ${JSON.stringify(entry.name)}`,
    `Version: ${JSON.stringify(entry.version)}`,
    `Package root: ${JSON.stringify(entry.rootRelative)}`,
    `License: ${JSON.stringify(entry.license)}`,
    `License source: ${JSON.stringify(entry.licenseFile)}`,
    'License text:',
    entry.licenseText.endsWith('\n') ? entry.licenseText.slice(0, -1) : entry.licenseText,
    ...entry.notices.flatMap((notice) => [
      `Notice source: ${JSON.stringify(notice.file)}`,
      notice.text.endsWith('\n') ? notice.text.slice(0, -1) : notice.text,
    ]),
    PACKAGE_SECTION_END,
    '',
  ].join('\n'));
  return [
    '',
    '',
    '================================================================================',
    'Third-party package licenses (metafile-derived)',
    '================================================================================',
    'Only npm packages with code bytes in a2a-runtime.mjs are listed. Package roots',
    'are derived from the esbuild output metafile for this build.',
    '',
    ...sections,
  ].join('\n');
}

/**
 * @param {{outputFile?: string}} [options] `outputFile` lets tests rebuild into
 * a scratch directory and compare bytes with the committed runtime.
 */
export async function buildA2aRuntime({ outputFile = OUTPUT_FILE } = {}) {
  const esbuildManifest = path.join(DEPENDENCY_DIRECTORY, 'esbuild', 'package.json');
  if (!lstatOrNull(esbuildManifest)?.isFile()) throw new Error(MISSING_DEPENDENCIES);
  const outputDirectory = lstatOrNull(path.dirname(outputFile));
  if (!outputDirectory?.isDirectory() || outputDirectory.isSymbolicLink()) {
    throw new Error(`refusing unsafe runtime output directory: ${path.dirname(outputFile)}`);
  }
  /** @type {typeof import('esbuild')} */
  const esbuild = createRequire(path.join(TOOL_ROOT, 'package.json'))('esbuild');
  const legalFile = `${outputFile}.LEGAL.txt`;
  const result = await esbuild.build({
    absWorkingDir: TOOL_ROOT,
    banner: { js: REQUIRE_BANNER },
    bundle: true,
    charset: 'utf8',
    entryPoints: [ENTRY_FILE],
    format: 'esm',
    keepNames: true,
    legalComments: 'linked',
    logLevel: 'warning',
    metafile: true,
    minify: true,
    outfile: outputFile,
    platform: 'node',
    sourcemap: false,
    target: 'node20',
    treeShaking: true,
    write: false,
  });
  const emitted = new Map(result.outputFiles.map((file) => [path.resolve(file.path), file.contents]));
  const runtime = emitted.get(path.resolve(outputFile));
  const legal = emitted.get(path.resolve(legalFile));
  if (emitted.size !== 2 || !runtime || !legal) {
    throw new Error('esbuild did not emit exactly a2a-runtime.mjs and a2a-runtime.mjs.LEGAL.txt');
  }
  const packages = collectBundledPackageLicenses(result.metafile, outputFile);
  fs.writeFileSync(outputFile, runtime);
  fs.writeFileSync(legalFile, Buffer.concat([legal, Buffer.from(renderThirdPartyLicenses(packages), 'utf8')]));
  return {
    outputFile,
    legalFile,
    packages: packages.map(({ name, version, license }) => ({ name, version, license })),
  };
}

/** @param {string} metaUrl @param {string | undefined} argv1 */
function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  try {
    const built = await buildA2aRuntime();
    process.stdout.write(`built ${path.relative(REPOSITORY_ROOT, built.outputFile)} with ${built.packages.length} bundled packages\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

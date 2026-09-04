// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const ENTRY_FILE = path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'frontend', 'app.jsx');
const ASSETS_DIRECTORY = path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'ui', 'assets');
const OUTPUT_FILE = path.join(ASSETS_DIRECTORY, 'app.js');
const LEGAL_OUTPUT_FILE = `${OUTPUT_FILE}.LEGAL.txt`;
const DEPENDENCY_DIRECTORY = path.join(TOOL_ROOT, 'node_modules');
const ALLOWED_OUTPUTS = new Set(['app.js', 'app.js.LEGAL.txt']);
const LICENSE_FILENAME = /^(?:licen[cs]e|copying)(?:\.[A-Za-z0-9._-]+)?$/i;
const PACKAGE_SECTION_START = '----- BEGIN BUNDLED PACKAGE LICENSE -----';
const PACKAGE_SECTION_END = '----- END BUNDLED PACKAGE LICENSE -----';

// The published @fluentui/react-icons tarball omits its repository LICENSE.
// Keep the exact upstream notice pinned to the exact package version and
// repository metadata. Any version or metadata change fails closed instead of
// silently applying this audited exception to different bytes.
const AUDITED_LICENSE_FALLBACKS = new Map([
  ['@fluentui/react-icons@2.0.339', Object.freeze({
    license: 'MIT',
    repository: 'https://github.com/microsoft/fluentui-system-icons.git',
    source: 'audited upstream LICENSE (npm tarball omits the file)',
    text: `MIT License

Copyright (c) 2020 Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  })],
]);

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
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

/** @param {string} value */
function codeUnitKey(value) {
  return value.split(path.sep).join('/');
}

/** @param {Buffer} bytes @param {string} label */
function decodeNotice(bytes, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (!text.trim() || text.includes('\0')) throw new Error(`${label} is empty or unsafe`);
  return text;
}

/** @param {string} text @param {string} label */
function verifyCompleteMitNotice(text, label) {
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  for (const required of [
    'copyright',
    'permission is hereby granted, free of charge',
    'the above copyright notice and this permission notice shall be included',
    'without warranty of any kind',
    'in no event shall the authors or copyright holders be liable',
  ]) {
    if (!normalized.includes(required)) {
      throw new Error(`${label} is missing complete MIT terms: ${required}`);
    }
  }
}

/** @param {unknown} value */
function repositoryUrl(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
    return value.url;
  }
  return '';
}

/**
 * Resolve one esbuild input to its npm package root. Inputs outside the scoped
 * dependency directory return null; inputs under any other node_modules tree
 * are rejected by collectBundledPackageLicenses.
 * @param {string} input
 * @param {{repositoryRoot:string, dependencyDirectory:string}} roots
 */
export function resolveBundledPackageRoot(input, roots) {
  if (typeof input !== 'string' || !input) throw new Error('esbuild emitted an invalid input path');
  const inputPath = path.isAbsolute(input) ? path.normalize(input) : path.resolve(roots.repositoryRoot, input);
  let relativeInput;
  if (isPathWithin(roots.dependencyDirectory, inputPath)) {
    relativeInput = path.relative(roots.dependencyDirectory, inputPath);
  } else {
    const inputStat = lstatOrNull(inputPath);
    const dependencyStat = lstatOrNull(roots.dependencyDirectory);
    if (!inputStat || !dependencyStat) return null;
    const dependencyRealpath = fs.realpathSync(roots.dependencyDirectory);
    const inputRealpath = fs.realpathSync(inputPath);
    if (!isPathWithin(dependencyRealpath, inputRealpath)) return null;
    relativeInput = path.relative(dependencyRealpath, inputRealpath);
  }

  const parts = relativeInput.split(path.sep);
  let packageStart = 0;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] === 'node_modules') packageStart = index + 1;
  }
  const scoped = parts[packageStart]?.startsWith('@');
  const packageLength = scoped ? 2 : 1;
  const packageParts = parts.slice(packageStart, packageStart + packageLength);
  if (
    packageParts.length !== packageLength
    || packageParts.some((part) => !part || part === '.' || part === '..')
    || (scoped && packageParts[0] === '@')
  ) {
    throw new Error(`cannot resolve bundled package root for input: ${input}`);
  }

  const rootParts = parts.slice(0, packageStart + packageLength);
  const packageRoot = path.join(roots.dependencyDirectory, ...rootParts);
  const packageName = scoped ? `${packageParts[0]}/${packageParts[1]}` : packageParts[0];
  return {
    inputPath,
    packageName,
    packageRoot,
    rootRelative: codeUnitKey(path.relative(roots.dependencyDirectory, packageRoot)),
  };
}

/**
 * @param {{inputPath:string, packageName:string, packageRoot:string, rootRelative:string}} resolved
 * @param {string} dependencyDirectory
 */
function readPackageLicense(resolved, dependencyDirectory) {
  const dependencyRealpath = fs.realpathSync(dependencyDirectory);
  const relativeRootParts = path.relative(dependencyDirectory, resolved.packageRoot).split(path.sep);
  let boundary = dependencyDirectory;
  for (const part of relativeRootParts) {
    boundary = path.join(boundary, part);
    const stat = lstatOrNull(boundary);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`unsafe bundled package boundary: ${resolved.rootRelative}`);
    }
  }

  const packageRealpath = fs.realpathSync(resolved.packageRoot);
  if (!isPathWithin(dependencyRealpath, packageRealpath)) {
    throw new Error(`bundled package escapes scoped dependencies: ${resolved.rootRelative}`);
  }
  const inputStat = lstatOrNull(resolved.inputPath);
  if (!inputStat?.isFile() || inputStat.isSymbolicLink()) {
    throw new Error(`unsafe bundled package input: ${resolved.inputPath}`);
  }
  const inputRealpath = fs.realpathSync(resolved.inputPath);
  if (!isPathWithin(packageRealpath, inputRealpath)) {
    throw new Error(`bundled package input escapes its package root: ${resolved.inputPath}`);
  }

  const metadataPath = path.join(resolved.packageRoot, 'package.json');
  const metadataStat = lstatOrNull(metadataPath);
  if (!metadataStat?.isFile() || metadataStat.isSymbolicLink()) {
    throw new Error(`missing or unsafe package metadata: ${resolved.rootRelative}/package.json`);
  }
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    throw new Error(`invalid package metadata: ${resolved.rootRelative}/package.json`);
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`invalid package metadata: ${resolved.rootRelative}/package.json`);
  }
  if (metadata.name !== resolved.packageName) {
    throw new Error(`ambiguous package identity at ${resolved.rootRelative}/package.json`);
  }
  if (
    typeof metadata.version !== 'string'
    || !metadata.version
    || /[\s\x00-\x1f]/.test(metadata.version)
    || typeof metadata.license !== 'string'
    || !metadata.license
    || /[\r\n\x00]/.test(metadata.license)
  ) {
    throw new Error(`missing or unsafe package version/license metadata: ${resolved.rootRelative}/package.json`);
  }

  const matchingEntries = fs.readdirSync(resolved.packageRoot, { withFileTypes: true })
    .filter((entry) => LICENSE_FILENAME.test(entry.name))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of matchingEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`unsafe package license file: ${resolved.rootRelative}/${entry.name}`);
    }
  }
  if (matchingEntries.length > 1) {
    throw new Error(`ambiguous package license files: ${resolved.rootRelative}`);
  }

  let licenseBytes;
  let licenseSource;
  if (matchingEntries.length === 1) {
    const licensePath = path.join(resolved.packageRoot, matchingEntries[0].name);
    const licenseRealpath = fs.realpathSync(licensePath);
    if (!isPathWithin(packageRealpath, licenseRealpath)) {
      throw new Error(`package license escapes its package root: ${resolved.rootRelative}`);
    }
    licenseBytes = fs.readFileSync(licensePath);
    licenseSource = matchingEntries[0].name;
  } else {
    const fallback = AUDITED_LICENSE_FALLBACKS.get(`${metadata.name}@${metadata.version}`);
    if (
      !fallback
      || fallback.license !== metadata.license
      || fallback.repository !== repositoryUrl(metadata.repository)
    ) {
      throw new Error(`missing package license file: ${resolved.rootRelative}`);
    }
    licenseBytes = Buffer.from(fallback.text, 'utf8');
    licenseSource = fallback.source;
  }

  const licenseText = decodeNotice(licenseBytes, `license for ${metadata.name}@${metadata.version}`);
  if (metadata.license === 'MIT') {
    verifyCompleteMitNotice(licenseText, `license for ${metadata.name}@${metadata.version}`);
  }
  if (licenseText.includes(PACKAGE_SECTION_START) || licenseText.includes(PACKAGE_SECTION_END)) {
    throw new Error(`package license contains reserved section marker: ${resolved.rootRelative}`);
  }
  return {
    license: metadata.license,
    licenseBytes,
    licenseSource,
    name: metadata.name,
    rootRelative: resolved.rootRelative,
    version: metadata.version,
  };
}

/**
 * Derive package records only from inputs that contributed bytes to app.js.
 * @param {{
 *   metafile: import('esbuild').Metafile,
 *   outputFile: string,
 *   repositoryRoot: string,
 *   dependencyDirectory: string,
 * }} options
 */
export function collectBundledPackageLicenses(options) {
  const outputMatches = Object.entries(options.metafile.outputs).filter(([output]) => {
    const absolute = path.isAbsolute(output) ? path.normalize(output) : path.resolve(options.repositoryRoot, output);
    return absolute === path.normalize(options.outputFile);
  });
  if (outputMatches.length !== 1) throw new Error('esbuild metafile does not identify exactly one app.js output');

  const [, output] = outputMatches[0];
  /** @type {Map<string, ReturnType<typeof resolveBundledPackageRoot>>} */
  const roots = new Map();
  for (const [input, contribution] of Object.entries(output.inputs || {})) {
    if (!Number.isFinite(contribution.bytesInOutput) || contribution.bytesInOutput <= 0) continue;
    const resolved = resolveBundledPackageRoot(input, options);
    if (!resolved) {
      const absolute = path.isAbsolute(input) ? path.normalize(input) : path.resolve(options.repositoryRoot, input);
      if (absolute.split(path.sep).includes('node_modules')) {
        throw new Error(`bundled dependency escaped scoped node_modules: ${input}`);
      }
      continue;
    }
    roots.set(resolved.rootRelative, resolved);
  }
  if (roots.size === 0) throw new Error('esbuild metafile contains no bundled npm package inputs');
  return [...roots.values()]
    .sort((left, right) => (
      left.rootRelative < right.rootRelative ? -1 : left.rootRelative > right.rootRelative ? 1 : 0
    ))
    .map((resolved) => readPackageLicense(resolved, options.dependencyDirectory));
}

/** @param {ReturnType<typeof collectBundledPackageLicenses>} packages */
function renderThirdPartyLicenses(packages) {
  /** @type {Buffer[]} */
  const chunks = [Buffer.from(
    '\n\n'
    + '================================================================================\n'
    + 'Third-party package licenses (metafile-derived)\n'
    + '================================================================================\n'
    + 'Only npm packages with code bytes in app.js are listed. Package roots are\n'
    + 'derived from the esbuild output metafile for this build.\n\n',
    'utf8',
  )];
  for (const entry of packages) {
    chunks.push(Buffer.from(
      `${PACKAGE_SECTION_START}\n`
      + `Package: ${JSON.stringify(entry.name)}\n`
      + `Version: ${JSON.stringify(entry.version)}\n`
      + `Package root: ${JSON.stringify(entry.rootRelative)}\n`
      + `License: ${JSON.stringify(entry.license)}\n`
      + `License source: ${JSON.stringify(entry.licenseSource)}\n`
      + 'License text:\n',
      'utf8',
    ));
    chunks.push(entry.licenseBytes);
    if (entry.licenseBytes.at(-1) !== 0x0a) chunks.push(Buffer.from('\n'));
    chunks.push(Buffer.from(`${PACKAGE_SECTION_END}\n\n`, 'utf8'));
  }
  return Buffer.concat(chunks);
}

function prepareAssetsDirectory() {
  const relativeParts = ['src', 'extensions', 'dude', 'ui', 'assets'];
  let current = REPOSITORY_ROOT;
  for (const part of relativeParts) {
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`refusing unsafe asset boundary: ${path.relative(REPOSITORY_ROOT, current)}`);
    }
  }

  fs.rmSync(ASSETS_DIRECTORY, { recursive: true, force: true });
  fs.mkdirSync(ASSETS_DIRECTORY);
}

function verifyOutputs() {
  const entries = fs.readdirSync(ASSETS_DIRECTORY, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  for (const entry of entries) {
    if (!entry.isFile() || !ALLOWED_OUTPUTS.has(entry.name)) {
      throw new Error(`unexpected frontend build output: ${entry.name}`);
    }
  }
  if (
    names.length !== ALLOWED_OUTPUTS.size
    || names.some((name) => !ALLOWED_OUTPUTS.has(name))
  ) {
    throw new Error('frontend build did not emit exactly app.js and app.js.LEGAL.txt');
  }
}

export async function buildCanvasUi() {
  prepareAssetsDirectory();
  const result = await build({
    absWorkingDir: REPOSITORY_ROOT,
    bundle: true,
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    entryPoints: [ENTRY_FILE],
    format: 'esm',
    legalComments: 'linked',
    logLevel: 'info',
    metafile: true,
    minify: true,
    nodePaths: [DEPENDENCY_DIRECTORY],
    outfile: OUTPUT_FILE,
    platform: 'browser',
    sourcemap: false,
    target: 'es2022',
    treeShaking: true,
  });
  const packages = collectBundledPackageLicenses({
    metafile: result.metafile,
    outputFile: OUTPUT_FILE,
    repositoryRoot: REPOSITORY_ROOT,
    dependencyDirectory: DEPENDENCY_DIRECTORY,
  });
  const generatedLegalStat = lstatOrNull(LEGAL_OUTPUT_FILE);
  if (!generatedLegalStat?.isFile() || generatedLegalStat.isSymbolicLink()) {
    throw new Error('esbuild did not emit a safe app.js.LEGAL.txt');
  }
  fs.appendFileSync(LEGAL_OUTPUT_FILE, renderThirdPartyLicenses(packages));
  verifyOutputs();
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

if (isMainModule(import.meta.url, process.argv[1])) await buildCanvasUi();

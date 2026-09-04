// @ts-check
/**
 * T010 maintainer-build and static browser-contract coverage. These tests use
 * only a disposable copy of the build boundary. They deliberately do not run
 * npm or contact the registry, so recursive repository tests stay offline.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TOOL_ROOT = path.join(ROOT, 'scripts', 'dude-canvas-ui');
const FRONTEND_ROOT = path.join(ROOT, 'src', 'extensions', 'dude', 'frontend');
const ASSET_ROOT = path.join(ROOT, 'src', 'extensions', 'dude', 'ui', 'assets');
const DEPLOYED_ASSET_ROOT = path.join(ROOT, '.github', 'extensions', 'dude', 'ui', 'assets');
const EXPECTED_ASSETS = Object.freeze(['app.js', 'app.js.LEGAL.txt']);
const PACKAGE_SECTION_START = '----- BEGIN BUNDLED PACKAGE LICENSE -----';
const PACKAGE_SECTION_END = '----- END BUNDLED PACKAGE LICENSE -----';
const SCOPED_DEPENDENCY_SKIP = 'requires installed scoped dependencies; npm ci is intentionally outside recursive tests';
const COMBOBOX_PACKAGE_MARKER = '@fluentui/react-combobox/package.json';
const COMBOBOX_RENDERER_DEPENDENCY = '@fluentui/react-combobox/lib/components/Combobox/renderCombobox.js';

/** @param {string} relative */
function read(relative) {
  return fs.readFileSync(path.join(ROOT, ...relative.split('/')), 'utf8');
}

/** @param {Buffer | string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} directory */
function filesBelow(directory) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} current */
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(directory, absolute).split(path.sep).join('/'));
      else assert.fail(`unsupported fixture entry: ${absolute}`);
    }
  };
  visit(directory);
  return files.sort();
}

/** @param {string} directory */
function snapshotTree(directory) {
  /** @type {Array<{path:string,type:string,bytes?:Buffer,target?:string}>} */
  const rows = [];
  /** @param {string} current @param {string} prefix */
  const visit = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) rows.push({ path: relative, type: 'symlink', target: fs.readlinkSync(absolute) });
      else if (stat.isDirectory()) {
        rows.push({ path: relative, type: 'directory' });
        visit(absolute, relative);
      } else if (stat.isFile()) rows.push({ path: relative, type: 'file', bytes: fs.readFileSync(absolute) });
      else assert.fail(`unsupported fixture entry: ${absolute}`);
    }
  };
  visit(directory, '');
  return rows;
}

/** @param {string} root @param {string} relative @param {string | Buffer} bytes */
function write(root, relative, bytes) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

/** @param {Record<string, unknown>} packages @param {string} from @param {string} dependency */
function resolvesLockedDependency(packages, from, dependency) {
  let packagePath = from;
  while (true) {
    const nestedMarker = packagePath.lastIndexOf('/node_modules/');
    const parent = nestedMarker < 0 ? '' : packagePath.slice(0, nestedMarker);
    const candidate = `${parent ? `${parent}/` : ''}node_modules/${dependency}`;
    if (Object.hasOwn(packages, candidate)) return true;
    if (nestedMarker < 0) return false;
    packagePath = parent;
  }
}

/**
 * Create a separate repository shape because build.mjs intentionally fixes its
 * output boundary relative to its own source file.
 * @returns {{sandbox:string, repo:string}}
 */
function buildFixture() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-build-'));
  const repo = path.join(sandbox, 'repo');
  fs.cpSync(FRONTEND_ROOT, path.join(repo, 'src', 'extensions', 'dude', 'frontend'), { recursive: true });
  write(
    repo,
    'scripts/dude-canvas-ui/build.mjs',
    fs.readFileSync(path.join(TOOL_ROOT, 'build.mjs')),
  );
  write(repo, 'src/extensions/dude/ui/index.html', '<!doctype html>\n');
  write(repo, 'src/extensions/dude/ui/keep.txt', 'sibling runtime bytes\n');
  write(repo, 'README.md', 'project bytes\n');
  write(repo, 'src/extensions/dude/ui/assets/app.js', 'obsolete application bytes\n');
  write(repo, 'src/extensions/dude/ui/assets/app.js.LEGAL.txt', 'obsolete legal bytes\n');
  write(repo, 'src/extensions/dude/ui/assets/stale.txt', 'must be removed\n');
  fs.symlinkSync(
    path.join(TOOL_ROOT, 'node_modules'),
    path.join(repo, 'scripts', 'dude-canvas-ui', 'node_modules'),
    'dir',
  );
  return { sandbox, repo };
}

/**
 * Build a separate repository so git evaluates the production ignore file
 * without inheriting this worktree's index, status, or global exclusions.
 * @returns {{sandbox:string, repo:string}}
 */
function gitIgnoreFixture() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-gitignore-'));
  const repo = path.join(sandbox, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  write(repo, '.gitignore', read('.gitignore'));
  for (const relative of [
    'scripts/dude-canvas-ui/node_modules/esbuild/bin/esbuild',
    'scripts/dude-canvas-ui/package.json',
    'scripts/dude-canvas-ui/package-lock.json',
    'scripts/dude-canvas-ui/build.mjs',
    'scripts/dude-canvas-ui/build.test.mjs',
    'src/extensions/dude/frontend/app.jsx',
    'src/extensions/dude/ui/assets/app.js',
    '.github/extensions/dude/ui/assets/app.js',
    'node_modules/unrelated/index.js',
    'scripts/another-tool/node_modules/unrelated/index.js',
    'scripts/dude-canvas-uix/node_modules/near-miss/index.js',
    'scripts/dude-canvas-ui/node_modules-near/index.js',
    'scripts/dude-canvas-ui/node_modulesx/index.js',
    'nested/scripts/dude-canvas-ui/node_modules/not-rooted/index.js',
  ]) {
    write(repo, relative, 'fixture bytes\n');
  }
  const initialized = spawnSync('git', ['init', '--quiet'], { cwd: repo, encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  return { sandbox, repo };
}

/** @param {string} repo @param {string} relative */
function isIgnoredByFixtureGit(repo, relative) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.excludesFile=/dev/null',
      'check-ignore',
      '--no-index',
      '--quiet',
      '--',
      relative,
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(result.error, undefined, `git check-ignore could not run for ${relative}`);
  assert.ok(
    result.status === 0 || result.status === 1,
    `git check-ignore failed for ${relative}: ${result.stderr}`,
  );
  return result.status === 0;
}

/** @param {string} repo */
function runFixtureBuild(repo) {
  return spawnSync(
    process.execPath,
    [path.join(repo, 'scripts', 'dude-canvas-ui', 'build.mjs')],
    { cwd: repo, encoding: 'utf8' },
  );
}

function hasFrontendTestRuntime() {
  return fs.existsSync(path.join(TOOL_ROOT, 'node_modules', 'esbuild'));
}

/** @param {string} relative */
function installedScopedDependencyPath(relative) {
  const absolute = path.join(TOOL_ROOT, 'node_modules', ...relative.split('/'));
  return fs.existsSync(absolute) ? absolute : null;
}

async function currentBundleMetafile() {
  const esbuild = createRequire(path.join(TOOL_ROOT, 'package.json'))('esbuild');
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    bundle: true,
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    entryPoints: [path.join(FRONTEND_ROOT, 'app.jsx')],
    format: 'esm',
    legalComments: 'linked',
    logLevel: 'silent',
    metafile: true,
    minify: true,
    nodePaths: [path.join(TOOL_ROOT, 'node_modules')],
    outfile: path.join(ASSET_ROOT, 'app.js'),
    platform: 'browser',
    sourcemap: false,
    target: 'es2022',
    treeShaking: true,
    write: false,
  });
  return result.metafile;
}

/**
 * Independently derive package roots from contributing output inputs. This is
 * intentionally test-local rather than calling the build's resolver.
 * @param {import('esbuild').Metafile} metafile
 */
function expectedBundledPackages(metafile) {
  const dependencyRoot = path.join(TOOL_ROOT, 'node_modules');
  const outputEntries = Object.entries(metafile.outputs).filter(([output]) => (
    path.resolve(ROOT, output) === path.join(ASSET_ROOT, 'app.js')
  ));
  assert.equal(outputEntries.length, 1, 'metafile has exactly one app.js output');
  const roots = new Set();
  for (const [input, detail] of Object.entries(outputEntries[0][1].inputs || {})) {
    if (detail.bytesInOutput <= 0) continue;
    const relative = path.relative(dependencyRoot, path.resolve(ROOT, input));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    const parts = relative.split(path.sep);
    let packageStart = 0;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (parts[index] === 'node_modules') packageStart = index + 1;
    }
    const packageLength = parts[packageStart].startsWith('@') ? 2 : 1;
    roots.add(parts.slice(0, packageStart + packageLength).join('/'));
  }
  return [...roots].sort().map((rootRelative) => {
    const metadata = JSON.parse(fs.readFileSync(
      path.join(dependencyRoot, ...rootRelative.split('/'), 'package.json'),
      'utf8',
    ));
    return {
      name: metadata.name,
      rootRelative,
      version: metadata.version,
    };
  });
}

/** @param {string} legal */
function parsePackageLicenseSections(legal) {
  const sections = [];
  const expression = new RegExp(
    `${PACKAGE_SECTION_START}\\n([\\s\\S]*?)${PACKAGE_SECTION_END}\\n`,
    'g',
  );
  for (const match of legal.matchAll(expression)) {
    const marker = 'License text:\n';
    const markerIndex = match[1].indexOf(marker);
    assert.notEqual(markerIndex, -1, 'package license section has a text marker');
    const metadata = Object.fromEntries(
      match[1]
        .slice(0, markerIndex)
        .trimEnd()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf(': ');
          assert.notEqual(separator, -1, `malformed package metadata line: ${line}`);
          return [line.slice(0, separator), JSON.parse(line.slice(separator + 2))];
        }),
    );
    sections.push({
      license: metadata.License,
      licenseSource: metadata['License source'],
      licenseText: match[1].slice(markerIndex + marker.length),
      name: metadata.Package,
      rootRelative: metadata['Package root'],
      version: metadata.Version,
    });
  }
  return sections;
}

const COMPLETE_MIT_NOTICE = `MIT License

Copyright (c) Fixture Authors

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
`;

/**
 * @param {string} root
 * @param {{licenseFiles?: Record<string,string>, metadata?: string|null}} [options]
 */
function packageEvidenceFixture(root, options = {}) {
  const dependencyDirectory = path.join(root, 'scripts', 'dude-canvas-ui', 'node_modules');
  const packageRoot = path.join(dependencyDirectory, 'fixture-package');
  const input = path.join(packageRoot, 'index.js');
  const outputFile = path.join(root, 'out', 'app.js');
  write(root, 'scripts/dude-canvas-ui/node_modules/fixture-package/index.js', 'export const fixture = true;\n');
  const metadata = options.metadata === undefined
    ? '{"name":"fixture-package","version":"1.0.0","license":"MIT"}\n'
    : options.metadata;
  if (metadata !== null) {
    write(root, 'scripts/dude-canvas-ui/node_modules/fixture-package/package.json', metadata);
  }
  for (const [name, text] of Object.entries(options.licenseFiles || {})) {
    write(root, `scripts/dude-canvas-ui/node_modules/fixture-package/${name}`, text);
  }
  return {
    dependencyDirectory,
    metafile: {
      inputs: {},
      outputs: {
        [outputFile]: {
          bytes: 1,
          entryPoint: input,
          exports: [],
          imports: [],
          inputs: {
            [input]: { bytesInOutput: 1 },
          },
        },
      },
    },
    outputFile,
    packageRoot,
    repositoryRoot: root,
  };
}

const FRONTEND_TEST_DOUBLE = [
  "import React from 'react';",
  'const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);',
  'export const Accordion = passthrough;',
  'export const AccordionHeader = passthrough;',
  'export const AccordionItem = passthrough;',
  'export const AccordionPanel = passthrough;',
  'export const Badge = passthrough;',
  'export const Body1 = passthrough;',
  'export const Breadcrumb = passthrough;',
  'export const BreadcrumbDivider = passthrough;',
  'export const BreadcrumbItem = passthrough;',
  'export const Button = passthrough;',
  'export const Caption1 = passthrough;',
  'export const Card = passthrough;',
  'export const Divider = () => React.createElement("hr");',
  'export const FluentProvider = passthrough;',
  'export const MessageBar = passthrough;',
  'export const MessageBarBody = passthrough;',
  'export const MessageBarTitle = passthrough;',
  'export const Subtitle2 = passthrough;',
  'export const Text = passthrough;',
  'export const Title3 = passthrough;',
  'export const Field = ({ children, hint, label }) => React.createElement(React.Fragment, null, label, children, hint?.children);',
  'export const Combobox = ({ children }) => React.createElement("div", { role: "combobox" }, children);',
  'export const Option = ({ children }) => React.createElement("div", { role: "option" }, children);',
  '',
].join('\n');

/**
 * Compile a disposable, exported copy of the authored module so the tests can
 * render the actual JSX component logic with inert Fluent primitive stand-ins,
 * without making the production entry test aware. The two replacements supply
 * controlled initial browser-only query input; selection, filtering, and
 * rendered option branches remain production code.
 * @param {{ query?: string|null, open?: boolean, useFluentTestDouble?: boolean }} [options]
 */
async function loadFrontendForSsr({
  query = null,
  open = false,
  useFluentTestDouble = true,
} = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-frontend-ssr-'));
  try {
    const sourceDirectory = path.join(sandbox, 'frontend');
    const entry = path.join(sourceDirectory, 'app.jsx');
    const output = path.join(sourceDirectory, 'app.testable.mjs');
    fs.cpSync(FRONTEND_ROOT, sourceDirectory, { recursive: true });
    const source = fs.readFileSync(entry, 'utf8');
    let testable = source;
    if (useFluentTestDouble) {
      testable = testable.replace(
        "} from '@fluentui/react-components';",
        "} from './fluent-test-double.mjs';",
      );
    }
    testable = testable
      .replace(
        'const [query, setQuery] = useState(null);',
        `const [query, setQuery] = useState(${JSON.stringify(query)});`,
      )
      .replace(
        'const [open, setOpen] = useState(false);',
        `const [open, setOpen] = useState(${JSON.stringify(open)});`,
      )
      .replace(
        "createRoot(document.getElementById('root')).render(<App />);",
        'export { ActivityRail, AttentionSection, CommandBar, FeatureChooser, FocalRegion, FreshnessSection, PropertiesSection };',
      );
    assert.notEqual(testable, source, 'the disposable module must replace its browser entrypoint');
    fs.writeFileSync(entry, testable);
    if (useFluentTestDouble) {
      fs.writeFileSync(path.join(sourceDirectory, 'fluent-test-double.mjs'), FRONTEND_TEST_DOUBLE);
    }
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"module"}\n');
    fs.symlinkSync(path.join(TOOL_ROOT, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir');
    const esbuild = createRequire(path.join(TOOL_ROOT, 'package.json'))('esbuild');
    esbuild.buildSync({
      entryPoints: [entry],
      format: 'esm',
      jsx: 'automatic',
      outfile: output,
      platform: 'node',
      target: 'node20',
    });
    return {
      frontend: await import(pathToFileURL(output).href),
      dispose: () => fs.rmSync(sandbox, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    throw error;
  }
}

/** @param {(props: any) => unknown} Component @param {Record<string, unknown>} props */
function renderFrontend(Component, props) {
  const scopedRequire = createRequire(path.join(TOOL_ROOT, 'package.json'));
  const React = scopedRequire('react');
  const { renderToStaticMarkup } = scopedRequire('react-dom/server');
  return renderToStaticMarkup(React.createElement(Component, props));
}

/** @param {(props: any) => unknown} Component @param {Record<string, unknown>} props */
function renderFluentFrontend(Component, props) {
  const scopedRequire = createRequire(path.join(TOOL_ROOT, 'package.json'));
  const React = scopedRequire('react');
  const { renderToStaticMarkup } = scopedRequire('react-dom/server');
  const { FluentProvider, webLightTheme } = scopedRequire('@fluentui/react-components');
  return renderToStaticMarkup(
    React.createElement(
      FluentProvider,
      { theme: webLightTheme },
      React.createElement(Component, props),
    ),
  );
}

const renderStyles = new Proxy({}, { get: (_target, name) => String(name) });

/** @param {string} source @param {string} name */
function styleRule(source, name) {
  const match = new RegExp(
    `^  ${name}: \\{[\\s\\S]*?(?=^  [A-Za-z][A-Za-z0-9]*: \\{|^\\}\\);)`,
    'm',
  ).exec(source);
  assert.ok(match, `missing ${name} style rule`);
  return match[0];
}

/** @param {string} color */
function relativeLuminance(color) {
  assert.match(color, /^#[0-9a-f]{6}$/i, `expected an opaque RGB Fluent color, got ${color}`);
  const channels = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

/** @param {string} foreground @param {string} background */
function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

/** @param {string} value */
function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} rule @param {string} name @param {'Color'|'Style'|'Width'} kind @param {string} value */
function assertBorderSides(rule, name, kind, value) {
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    assert.match(
      rule,
      new RegExp(`border${side}${kind}: ${escapedRegex(value)}`),
      `${name} has its ${side.toLowerCase()} ${kind.toLowerCase()} as a supported side declaration`,
    );
  }
}

/** @param {string} property */
function cssProperty(property) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Compile the exact supported longhand shape through the installed Griffel
 * resolver. This proves the source declarations reach CSS rather than merely
 * checking the spelling of a JavaScript object property.
 * @param {Record<string, string | number>} declarations
 */
function compileGriffelDeclarations(declarations) {
  const scopedRequire = createRequire(path.join(TOOL_ROOT, 'package.json'));
  const { resolveStyleRules } = scopedRequire('@griffel/core');
  const [, rulesByBucket] = resolveStyleRules(declarations);
  return Object.values(rulesByBucket).flat().join('');
}

test('scoped manifest and lock have the exact minimal production build closure', () => {
  // Arrange
  const manifest = JSON.parse(read('scripts/dude-canvas-ui/package.json'));
  const lock = JSON.parse(read('scripts/dude-canvas-ui/package-lock.json'));
  const packages = /** @type {Record<string, any>} */ (lock.packages);
  const rootPackage = packages[''];

  // Act + Assert
  assert.equal(fs.existsSync(path.join(ROOT, 'package.json')), false, 'this feature must not create a root workspace');
  assert.equal(manifest.name, '@dude/canvas-ui');
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.scripts, { build: 'node build.mjs' });
  assert.equal(manifest.engines.node, '>=20');
  assert.deepEqual(manifest.dependencies, {
    '@fluentui/react-components': '9.74.7',
    react: '19.2.8',
    'react-dom': '19.2.8',
  });
  assert.deepEqual(manifest.devDependencies, { esbuild: '0.28.2' });
  assert.match(manifest.dependencies.react, /^19\.\d+\.\d+$/);
  assert.equal(manifest.dependencies.react, manifest.dependencies['react-dom']);
  assert.equal(lock.name, manifest.name);
  assert.deepEqual(rootPackage.dependencies, manifest.dependencies);
  assert.deepEqual(rootPackage.devDependencies, manifest.devDependencies);
  assert.deepEqual(rootPackage.engines, manifest.engines);

  for (const [name, version] of Object.entries({
    '@fluentui/react-components': '9.74.7',
    react: '19.2.8',
    'react-dom': '19.2.8',
    esbuild: '0.28.2',
  })) {
    assert.equal(packages[`node_modules/${name}`]?.version, version, `lock direct ${name}`);
  }
  for (const [lockedPath, entry] of Object.entries(packages)) {
    if (lockedPath === '') continue;
    assert.equal(typeof entry.version, 'string', `${lockedPath} needs an exact version`);
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${lockedPath} needs a registry resolution`);
    assert.match(entry.integrity, /^sha(?:512|1)-/, `${lockedPath} needs an integrity digest`);
    for (const dependency of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      assert.equal(
        resolvesLockedDependency(packages, lockedPath, dependency),
        true,
        `${lockedPath} dependency ${dependency} has no lock resolution`,
      );
    }
  }
  assert.doesNotMatch(
    JSON.stringify({ ...manifest.dependencies, ...manifest.devDependencies }),
    /\b(?:vite|tailwind|router|query|icon|jest|vitest|playwright|webpack)\b/i,
    'the maintainer manifest must not carry unused framework or test dependencies',
  );
});

test('root-anchored scoped dependency ignore hides only the private install', () => {
  // Arrange
  const { sandbox, repo } = gitIgnoreFixture();
  const ignored = ['scripts/dude-canvas-ui/node_modules/esbuild/bin/esbuild'];
  const visible = [
    'scripts/dude-canvas-ui/package.json',
    'scripts/dude-canvas-ui/package-lock.json',
    'scripts/dude-canvas-ui/build.mjs',
    'scripts/dude-canvas-ui/build.test.mjs',
    'src/extensions/dude/frontend/app.jsx',
    'src/extensions/dude/ui/assets/app.js',
    '.github/extensions/dude/ui/assets/app.js',
    'node_modules/unrelated/index.js',
    'scripts/another-tool/node_modules/unrelated/index.js',
    'scripts/dude-canvas-uix/node_modules/near-miss/index.js',
    'scripts/dude-canvas-ui/node_modules-near/index.js',
    'scripts/dude-canvas-ui/node_modulesx/index.js',
    'nested/scripts/dude-canvas-ui/node_modules/not-rooted/index.js',
  ];
  const ignoreLines = read('.gitignore').split(/\r?\n/);

  try {
    // Act
    const ignoredResults = ignored.map((relative) => [relative, isIgnoredByFixtureGit(repo, relative)]);
    const visibleResults = visible.map((relative) => [relative, isIgnoredByFixtureGit(repo, relative)]);

    // Assert
    assert.equal(
      ignoreLines.filter((line) => line === '/scripts/dude-canvas-ui/node_modules/').length,
      1,
      'the production rule must remain one exact root-anchored scoped directory rule',
    );
    assert.deepEqual(ignoredResults, ignored.map((relative) => [relative, true]));
    assert.deepEqual(visibleResults, visible.map((relative) => [relative, false]));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('build configuration has one fixed browser-ESM entry and only fixed generated outputs', () => {
  // Arrange
  const build = read('scripts/dude-canvas-ui/build.mjs');

  // Act + Assert
  assert.match(build, /const ENTRY_FILE = path\.join\([^;]*'frontend', 'app\.jsx'\)/);
  assert.match(build, /entryPoints: \[ENTRY_FILE\]/);
  assert.match(build, /format: 'esm'/);
  assert.match(build, /platform: 'browser'/);
  assert.match(build, /target: 'es2022'/);
  assert.match(build, /minify: true/);
  assert.match(build, /treeShaking: true/);
  assert.match(build, /legalComments: 'linked'/);
  assert.match(build, /metafile: true/);
  assert.match(build, /sourcemap: false/);
  assert.match(build, /outfile: OUTPUT_FILE/);
  assert.match(build, /new Set\(\['app\.js', 'app\.js\.LEGAL\.txt'\]\)/);
  assert.doesNotMatch(build, /\b(?:external|splitting|outdir|plugins)\s*:/);
  assert.match(build, /if \(stat\.isSymbolicLink\(\) \|\| !stat\.isDirectory\(\)\)/);
  assert.match(build, /fs\.rmSync\(ASSETS_DIRECTORY, \{ recursive: true, force: true \}\)/);
});

test('built runtime is a committed ESM bundle with legal notice and no runtime dependency fetch', () => {
  // Arrange
  const sourceFiles = filesBelow(ASSET_ROOT);
  const deployedFiles = filesBelow(DEPLOYED_ASSET_ROOT);
  const application = fs.readFileSync(path.join(ASSET_ROOT, 'app.js'), 'utf8');
  const legal = fs.readFileSync(path.join(ASSET_ROOT, 'app.js.LEGAL.txt'), 'utf8');
  const html = read('src/extensions/dude/ui/index.html');

  // Act + Assert
  assert.deepEqual(sourceFiles, EXPECTED_ASSETS);
  assert.deepEqual(deployedFiles, EXPECTED_ASSETS);
  for (const filename of EXPECTED_ASSETS) {
    const source = fs.readFileSync(path.join(ASSET_ROOT, filename));
    const deployed = fs.readFileSync(path.join(DEPLOYED_ASSET_ROOT, filename));
    assert.deepEqual(deployed, source, `${filename} is an exact development projection`);
  }
  assert.ok(application.length > 100_000, 'the application bundle must contain the browser runtime');
  const gzipBytes = gzipSync(application, { level: 9 }).length;
  assert.equal(Buffer.byteLength(application), 635_624, 'committed app.js raw byte size');
  assert.equal(
    sha256(application),
    'c2a9e3bb15be3487373d8414bab0cff570586450ed29ab4dde5cd8a1cddb1731',
    'committed app.js raw SHA-256',
  );
  assert.equal(
    gzipBytes,
    180_230,
    'gzip -9 -n equivalent app.js byte size',
  );
  assert.equal(gzipBytes < 350 * 1024, true, 'gzip budget comparison');
  assert.doesNotMatch(application, /sourceMappingURL/);
  assert.doesNotMatch(application, /(?:^|[;\n])\s*import\s*(?:[\w*{]|['"])/);
  assert.match(legal, /Bundled license information/);
  assert.match(legal, /React/);
  assert.match(legal, /tabster\/dist\/esm\/Tabster\.js/);
  assert.match(legal, /keyborg\/dist\/index\.js/);
  assert.match(legal, /MIT License/i);
  assert.match(legal, /Third-party package licenses \(metafile-derived\)/);
  assert.equal(Buffer.byteLength(legal), 60_027, 'complete legal notice byte size');
  assert.equal(
    sha256(legal),
    'b6c7ada06bc1777c08965b0f6941f246cffa7e34998bd357450f3faa0501bc70',
    'complete legal notice SHA-256',
  );
  assert.match(html, /<script type="module" src="\/assets\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /(?:https?:)?\/\//);
});

test('metafile-derived legal inventory contains every contributing package and complete MIT terms', async (context) => {
  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }

  // Arrange
  const legal = fs.readFileSync(path.join(ASSET_ROOT, 'app.js.LEGAL.txt'), 'utf8');
  const metafile = await currentBundleMetafile();

  // Act
  const expected = expectedBundledPackages(metafile);
  const actual = parsePackageLicenseSections(legal);

  // Assert
  assert.ok(expected.length > 0, 'metafile identifies bundled npm packages');
  assert.deepEqual(
    actual.map(({ name, rootRelative, version }) => ({ name, rootRelative, version })),
    expected,
    'the legal file represents every and only npm package contributing app.js bytes',
  );
  assert.equal(new Set(actual.map((entry) => entry.rootRelative)).size, actual.length);
  assert.equal(actual.some((entry) => entry.name === 'esbuild'), false, 'build-only esbuild is not claimed');

  const completeTermsPackages = actual.filter((entry) => (
    entry.name === 'react'
    || entry.name === 'react-dom'
    || entry.name === 'scheduler'
    || entry.name.startsWith('@fluentui/')
    || entry.name === 'tabster'
    || entry.name === 'keyborg'
  ));
  assert.ok(completeTermsPackages.length > 30, 'React, Fluent, Tabster, and Keyborg packages were found');
  for (const entry of completeTermsPackages) {
    const normalized = entry.licenseText.replace(/\s+/g, ' ').toLowerCase();
    assert.equal(entry.license, 'MIT', `${entry.rootRelative} license expression`);
    for (const required of [
      'copyright',
      'permission is hereby granted, free of charge',
      'the above copyright notice and this permission notice shall be included',
      'without warranty of any kind',
      'in no event shall the authors or copyright holders be liable',
    ]) {
      assert.ok(normalized.includes(required), `${entry.rootRelative} retains MIT term: ${required}`);
    }
  }

  for (const entry of actual) {
    if (entry.rootRelative === '@fluentui/react-icons') {
      assert.match(entry.licenseSource, /audited upstream LICENSE/);
      assert.match(entry.licenseText, /Copyright \(c\) 2020 Microsoft Corporation/);
      continue;
    }
    const packageRoot = path.join(TOOL_ROOT, 'node_modules', ...entry.rootRelative.split('/'));
    const licenseNames = fs.readdirSync(packageRoot)
      .filter((name) => /^(?:licen[cs]e|copying)(?:\.[A-Za-z0-9._-]+)?$/i.test(name));
    assert.equal(licenseNames.length, 1, `${entry.rootRelative} has one unambiguous license source`);
    assert.ok(
      entry.licenseText.includes(fs.readFileSync(path.join(packageRoot, licenseNames[0]), 'utf8')),
      `${entry.rootRelative} includes its complete installed license file`,
    );
  }
});

test('license collection rejects missing, ambiguous, and unsafe package evidence', async (context) => {
  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  const { collectBundledPackageLicenses } = await import('./build.mjs');
  const cases = [
    {
      name: 'missing package metadata',
      options: { metadata: null, licenseFiles: { LICENSE: COMPLETE_MIT_NOTICE } },
      pattern: /missing or unsafe package metadata/,
    },
    {
      name: 'ambiguous package identity',
      options: {
        metadata: '{"name":"other-package","version":"1.0.0","license":"MIT"}\n',
        licenseFiles: { LICENSE: COMPLETE_MIT_NOTICE },
      },
      pattern: /ambiguous package identity/,
    },
    {
      name: 'missing license file',
      options: {},
      pattern: /missing package license file/,
    },
    {
      name: 'ambiguous license files',
      options: { licenseFiles: { LICENSE: COMPLETE_MIT_NOTICE, 'LICENSE.md': COMPLETE_MIT_NOTICE } },
      pattern: /ambiguous package license files/,
    },
    {
      name: 'incomplete MIT terms',
      options: { licenseFiles: { LICENSE: 'MIT License\nCopyright (c) Fixture Authors\n' } },
      pattern: /missing complete MIT terms/,
    },
  ];
  for (const fixtureCase of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-license-evidence-'));
    try {
      const fixture = packageEvidenceFixture(root, fixtureCase.options);
      assert.throws(
        () => collectBundledPackageLicenses(fixture),
        fixtureCase.pattern,
        fixtureCase.name,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-license-symlink-'));
  try {
    const fixture = packageEvidenceFixture(symlinkRoot);
    write(symlinkRoot, 'outside-license.txt', COMPLETE_MIT_NOTICE);
    fs.symlinkSync(
      path.join(symlinkRoot, 'outside-license.txt'),
      path.join(fixture.packageRoot, 'LICENSE'),
      'file',
    );
    assert.throws(
      () => collectBundledPackageLicenses(fixture),
      /unsafe package license file/,
      'symlinked license evidence is rejected',
    );
  } finally {
    fs.rmSync(symlinkRoot, { recursive: true, force: true });
  }

  const escapedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-license-escape-'));
  try {
    const fixture = packageEvidenceFixture(escapedRoot, {
      licenseFiles: { LICENSE: COMPLETE_MIT_NOTICE },
    });
    const escapedInput = path.join(escapedRoot, 'node_modules', 'escape', 'index.js');
    write(escapedRoot, 'node_modules/escape/index.js', 'export const escape = true;\n');
    fixture.metafile.outputs[fixture.outputFile].inputs = {
      [escapedInput]: { bytesInOutput: 1 },
    };
    assert.throws(
      () => collectBundledPackageLicenses(fixture),
      /escaped scoped node_modules/,
      'dependencies outside the scoped tool root are rejected',
    );
  } finally {
    fs.rmSync(escapedRoot, { recursive: true, force: true });
  }
});

test('shipped runtime gzip -9 -n budget and complete legal notice are auditable', () => {
  // Arrange
  const application = fs.readFileSync(path.join(ASSET_ROOT, 'app.js'));
  const legal = fs.readFileSync(path.join(ASSET_ROOT, 'app.js.LEGAL.txt'));
  const gzip = spawnSync('gzip', ['-9', '-n', '-c', path.join(ASSET_ROOT, 'app.js')], {
    encoding: null,
  });

  // Act + Assert
  assert.equal(gzip.error, undefined, 'gzip must be available for the release budget');
  assert.equal(gzip.status, 0, Buffer.from(gzip.stderr ?? '').toString('utf8'));
  assert.ok(
    gzip.stdout.length <= 358_400,
    `app.js gzip -9 -n is ${gzip.stdout.length} bytes; budget is 358400 bytes`,
  );
  assert.match(legal.toString('utf8'), /Bundled license information/);
  assert.match(legal.toString('utf8'), /React/);
  assert.match(legal.toString('utf8'), /MIT License/i);
  assert.match(legal.toString('utf8'), /Third-party package licenses \(metafile-derived\)/);
  console.log(JSON.stringify({
    app: {
      rawBytes: application.length,
      rawSha256: sha256(application),
      gzip9nBytes: gzip.stdout.length,
      gzip9nSha256: sha256(gzip.stdout),
    },
    legal: {
      bytes: legal.length,
      sha256: sha256(legal),
    },
  }));
});

test('static frontend keeps the real Fluent shell, accessibility boundary, and read-only interactions', () => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const theme = read('src/extensions/dude/frontend/theme.js');
  const freshnessCheck = app.slice(app.indexOf('const checkFreshness'), app.indexOf('useEffect(() => {', app.indexOf('const checkFreshness')));
  const shellRule = styles.slice(styles.indexOf('  shell: {'), styles.indexOf('  visuallyHidden: {'));
  const fetchedPaths = [...app.matchAll(/fetch\('([^']+)'/g)].map((match) => match[1]);

  // Act + Assert
  assert.equal((app.match(/<FluentProvider\b/g) ?? []).length, 1);
  assert.match(app, /from '@fluentui\/react-components'/);
  assert.match(styles, /import \{ makeStyles, mergeClasses, tokens \} from '@fluentui\/react-components'/);
  assert.match(theme, /import \{ webDarkTheme, webLightTheme \} from '@fluentui\/react-components'/);
  assert.doesNotMatch(`${app}\n${styles}\n${theme}`, /@fluentui\/(?:react-icons|react\/|react-components\/unstable)/);
  assert.match(styles, /makeStyles\(/);
  assert.match(styles, /tokens\.colorNeutralStrokeAccessible/);
  assert.match(theme, /colorNeutralStroke1: theme\.colorNeutralStrokeAccessible/);
  assert.match(theme, /window\.matchMedia\(DARK_APPEARANCE_QUERY\)/);
  assert.match(theme, /addEventListener\('change', onStoreChange\)/);

  for (const landmark of ['<header ', '<nav ', '<main ', '<aside ', '<footer ']) {
    assert.match(app, new RegExp(landmark.replace(/[<>]/g, '\\$&')), `missing ${landmark} landmark`);
  }
  assert.match(app, /<h1[^>]*>Dude — Now<\/h1>/);
  for (const region of ['Next step', 'Lifecycle', 'Phases', 'Activity', 'Properties', 'Evidence', 'Freshness']) {
    assert.match(app, new RegExp(region), `missing ${region} region`);
  }
  assert.match(theme, /activityRail: '48px'/);
  assert.match(styles, /minWidth: 0/);
  assert.match(styles, /overflowWrap: 'anywhere'/);
  assert.match(styles, /gridTemplateColumns: 'minmax\(0, 1fr\)'/);
  assert.match(theme, /medium: 720/);
  assert.match(theme, /wide: 1080/);
  assert.match(
    styles,
    /\[media\.mediumOnly\]: \{\s*gridTemplateColumns: `\$\{layout\.activityRail\} minmax\(0, 1fr\)`/,
    'the medium rail/work grid is bounded by the medium-only query',
  );
  assert.doesNotMatch(shellRule, /maxWidth/);

  assert.match(app, /onOptionSelect=\{async \(_event, data\) =>/);
  assert.match(
    app,
    /const choices = projection\?\.complete === true && Array\.isArray\(projection\.choices\)[\s\S]*?<CommandBar[\s\S]*?choices=\{choices\}[\s\S]*?selected=\{projection\?\.selected\}/,
    'every complete projected selection supplies the one command-bar chooser with its committed identity',
  );
  assert.match(app, /onClick=\{onRefresh\}/);
  assert.match(app, /<Accordion collapsible>/);
  assert.match(app, /if \(payload\.replaced === true\)/);
  assert.doesNotMatch(freshnessCheck, /setProjection/);
  assert.deepEqual(fetchedPaths, ['/api/projection', '/api/freshness', '/api/refresh']);
});

test('completion and dock colors keep their accessible installed Fluent token pairings', (context) => {
  if (!installedScopedDependencyPath('@fluentui/react-components/package.json')) {
    context.skip(SCOPED_DEPENDENCY_SKIP);
    return;
  }

  // Arrange
  const styles = read('src/extensions/dude/frontend/styles.js');
  const scopedRequire = createRequire(path.join(TOOL_ROOT, 'package.json'));
  const { webDarkTheme, webLightTheme } = scopedRequire('@fluentui/react-components');
  const stepComplete = styleRule(styles, 'stepComplete');
  const segmentDone = styleRule(styles, 'segmentDone');
  const surface = styleRule(styles, 'surface');

  // Act + Assert
  assert.match(stepComplete, /color: tokens\.colorNeutralForegroundOnBrand/);
  assert.match(stepComplete, /backgroundColor: tokens\.colorPaletteGreenBackground3/);
  assertBorderSides(stepComplete, 'stepComplete', 'Color', 'tokens.colorPaletteGreenBackground3');
  assert.doesNotMatch(stepComplete, /colorPaletteGreenBorder2/);

  assert.match(segmentDone, /backgroundColor: tokens\.colorPaletteGreenBorder2/);
  assert.doesNotMatch(segmentDone, /colorPaletteGreenBackground3/);

  assert.match(surface, /color: tokens\.colorNeutralForeground4/);
  assert.doesNotMatch(surface, /colorNeutralForegroundDisabled/);

  for (const [appearance, theme] of Object.entries({ light: webLightTheme, dark: webDarkTheme })) {
    assert.equal(theme.colorNeutralForegroundOnBrand, '#ffffff', `${appearance} foreground is white`);
    assert.equal(theme.colorPaletteGreenBackground3, '#107c10', `${appearance} complete background`);
    assert.ok(
      contrastRatio(theme.colorNeutralForegroundOnBrand, theme.colorPaletteGreenBackground3) >= 4.5,
      `${appearance} white on GreenBackground3 must meet 4.5:1`,
    );
    assert.ok(
      contrastRatio(theme.colorNeutralForeground4, theme.colorNeutralBackground2) >= 4.5,
      `${appearance} dock text must meet 4.5:1 against its dock surface`,
    );
  }
  assert.ok(
    contrastRatio(webDarkTheme.colorNeutralForegroundOnBrand, webDarkTheme.colorPaletteGreenBorder2) < 4.5,
    'dark GreenBorder2 is the forbidden insufficient-contrast former completion pairing',
  );
});

test('authored Griffel borders use supported side longhands that compile to token CSS', (context) => {
  if (!installedScopedDependencyPath('@griffel/core/package.json')) {
    context.skip(SCOPED_DEPENDENCY_SKIP);
    return;
  }

  // Arrange
  const styles = read('src/extensions/dude/frontend/styles.js');
  const composites = [
    {
      name: 'chooserSummaryBand',
      declarations: {
        borderTopStyle: 'solid',
        borderTopWidth: 'var(--strokeWidthThin)',
        borderTopColor: 'var(--colorNeutralStroke2)',
        borderRightStyle: 'solid',
        borderRightWidth: 'var(--strokeWidthThin)',
        borderRightColor: 'var(--colorNeutralStroke2)',
        borderBottomStyle: 'none',
        borderBottomWidth: 0,
        borderLeftStyle: 'solid',
        borderLeftWidth: 'var(--strokeWidthThin)',
        borderLeftColor: 'var(--colorNeutralStroke2)',
      },
    },
    {
      name: 'chooserListbox',
      declarations: {
        borderTopStyle: 'none',
        borderTopWidth: 0,
        borderRightStyle: 'solid',
        borderRightWidth: 'var(--strokeWidthThin)',
        borderRightColor: 'var(--colorNeutralStroke2)',
        borderBottomStyle: 'solid',
        borderBottomWidth: 'var(--strokeWidthThin)',
        borderBottomColor: 'var(--colorNeutralStroke2)',
        borderLeftStyle: 'solid',
        borderLeftWidth: 'var(--strokeWidthThin)',
        borderLeftColor: 'var(--colorNeutralStroke2)',
      },
    },
    {
      name: 'chooserEmpty',
      declarations: {
        borderTopStyle: 'none',
        borderTopWidth: 0,
        borderRightStyle: 'solid',
        borderRightWidth: 'var(--strokeWidthThin)',
        borderRightColor: 'var(--colorNeutralStroke2)',
        borderBottomStyle: 'solid',
        borderBottomWidth: 'var(--strokeWidthThin)',
        borderBottomColor: 'var(--colorNeutralStroke2)',
        borderLeftStyle: 'solid',
        borderLeftWidth: 'var(--strokeWidthThin)',
        borderLeftColor: 'var(--colorNeutralStroke2)',
      },
    },
  ];

  // Act + Assert
  assert.doesNotMatch(
    styles,
    /\bborder(?:Color|Width|Style)\s*:/,
    'authored Griffel styles contain no unsupported border color, width, or style shorthand',
  );
  for (const { name, declarations } of composites) {
    const sourceRule = styleRule(styles, name);
    const compiledCss = compileGriffelDeclarations(declarations);
    for (const [property, value] of Object.entries(declarations)) {
      const sourceValue = typeof value === 'number'
        ? String(value)
        : value.startsWith('var(--')
          ? `tokens.${value.slice('var(--'.length, -1)}`
          : `'${value}'`;
      assert.match(
        sourceRule,
        new RegExp(`${property}: ${escapedRegex(sourceValue)}`),
        `${name} retains ${property} in the authored source`,
      );
      assert.match(
        compiledCss,
        new RegExp(`${cssProperty(property)}:${escapedRegex(String(value))};`),
        `${name} ${property} compiles through Griffel with its token value`,
      );
    }
    assert.doesNotMatch(compiledCss, /currentColor/, `${name} strokes compile from explicit tokens`);
  }
});

test('only authored exact-size bordered elements use local border-box sizing', () => {
  // Arrange
  const styles = read('src/extensions/dude/frontend/styles.js');
  const exactSizeBordered = {
    commandBar: /minHeight: layout\.commandBar/,
    contextIdentity: /minHeight: layout\.commandControl/,
    phaseMark: /width: tokens\.spacingHorizontalXL[\s\S]*height: tokens\.spacingVerticalXL/,
    statusBar: /minHeight: layout\.statusBar/,
    stepMarker: /width: tokens\.spacingHorizontalXL[\s\S]*height: tokens\.spacingVerticalXL/,
    trailNode: /width: tokens\.spacingHorizontalS[\s\S]*height: tokens\.spacingVerticalS/,
  };
  const chooserBoxes = {
    chooserEmpty: /width: '100%'/,
    chooserListbox: /maxHeight: `calc\(\$\{layout\.chooserRow\} \* 5\) !important`/,
    chooserOption: /height: layout\.chooserRow[\s\S]*minHeight: layout\.chooserRow/,
    chooserSummaryBand: /height: layout\.chooserSummary/,
  };
  const styleNames = [...styles.matchAll(/^  ([A-Za-z][A-Za-z0-9]*): \{/gm)].map(([, name]) => name);

  // Act
  const borderBoxRules = styleNames.filter((name) => /boxSizing: 'border-box'/.test(styleRule(styles, name)));

  // Assert
  assert.deepEqual(
    borderBoxRules.sort(),
    [...Object.keys(exactSizeBordered), ...Object.keys(chooserBoxes)].sort(),
  );
  for (const [name, size] of Object.entries(exactSizeBordered)) {
    const rule = styleRule(styles, name);
    assert.match(rule, size, `${name} retains its authored size`);
    assert.match(rule, /border(?:Top|Bottom)?Style: 'solid'/, `${name} is bordered locally`);
  }
  for (const [name, size] of Object.entries(chooserBoxes)) {
    assert.match(styleRule(styles, name), size, `${name} includes its authored chooser sizing`);
  }
  assert.doesNotMatch(
    styles,
    /(?:^|\n)\s*(?:['"](?:\*|html|body|:global\(\*\))['"]|(?:\*|html|body|:global\(\*\)))\s*:\s*\{[\s\S]*?\bboxSizing\s*:/,
    'a global sizing reset would alter Fluent controls',
  );
});

test('prose captions are block flow while compact metadata, Freshness, and the narrow dock remain bounded', async () => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const sectionHead = app.slice(app.indexOf('function SectionHead'), app.indexOf('function UnavailableRegion'));
  const freshness = app.slice(app.indexOf('function FreshnessSection'), app.indexOf('function PropertiesSection'));
  const captionStyles = styles.slice(styles.indexOf('  caption: {'), styles.indexOf('  focalCard: {'));
  const dockBodyStyles = styles.slice(styles.indexOf('  dockBody: {'), styles.indexOf('  dockSection: {'));
  const captions = [...app.matchAll(/<Caption1\b[^>]*>/g)].map(([caption]) => caption);

  // Act + Assert
  assert.deepEqual(
    captions.filter((caption) => !/\bblock\b/.test(caption)),
    ['<Caption1 className={styles.caption}>'],
    'only the compact SectionHead metadata remains inline',
  );
  assert.match(sectionHead, /<Caption1 className=\{styles\.caption\}>\{aside\}<\/Caption1>/);
  assert.equal(
    [...freshness.matchAll(/<Caption1\b[^>]*\bblock\b[^>]*className=\{styles\.caption\}[^>]*>/g)].length,
    3,
    'Freshness keeps message, last-complete-read, and recovery-location as three block lines',
  );
  assert.match(captionStyles, /maxWidth: layout\.proseMeasure/);
  assert.match(captionStyles, /overflowWrap: 'anywhere'/);
  assert.match(dockBodyStyles, /alignItems: 'start'/);
  assert.match(
    dockBodyStyles,
    /gap: `\$\{tokens\.spacingVerticalNone\} \$\{tokens\.spacingHorizontalXXL\}`/,
  );

  if (hasFrontendTestRuntime()) {
    const { frontend, dispose } = await loadFrontendForSsr({ useFluentTestDouble: false });
    try {
      const markup = renderFluentFrontend(frontend.FreshnessSection, {
        busy: true,
        freshness: {
          message: 'This older freshness message must not replace busy copy.',
          readAt: '2026-09-03T18:00:00.000Z',
          state: 'current',
        },
        projection: { readAt: '2026-09-03T18:00:00.000Z' },
        styles: renderStyles,
      });
      assert.match(markup, /Reading repository sources/);
      assert.match(markup, /Sources are being read\. The current complete view remains in place\./);
      assert.match(markup, /Last complete read:/);
      assert.match(markup, /Refresh is in the command bar\./);
      assert.doesNotMatch(markup, /This older freshness message must not replace busy copy\./);
    } finally {
      dispose();
    }
  }
});

test('direct inline feature chooser has no trigger, Popover, portal, or modal layer', async (context) => {
  if (!installedScopedDependencyPath(COMBOBOX_PACKAGE_MARKER)) {
    context.skip(SCOPED_DEPENDENCY_SKIP);
    return;
  }

  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const commandBar = app.slice(app.indexOf('function CommandBar'), app.indexOf('function ActivityRail'));
  const chooser = app.slice(app.indexOf('function FeatureChooser'), app.indexOf('function CommandBar'));
  const focalRegion = app.slice(app.indexOf('function FocalRegion'), app.indexOf('function LifecycleRegion'));
  const comboboxRendererPath = path.join(TOOL_ROOT, 'node_modules', ...COMBOBOX_RENDERER_DEPENDENCY.split('/'));
  const comboboxRenderer = fs.readFileSync(comboboxRendererPath, 'utf8');

  // Act + Assert
  assert.equal((app.match(/<FeatureChooser\b/g) ?? []).length, 1, 'only command-bar chooser is rendered');
  assert.equal((app.match(/<Field\b/g) ?? []).length, 1, 'chooser has one Field');
  assert.equal((app.match(/<Combobox\b/g) ?? []).length, 1, 'chooser has one Combobox');
  assert.match(chooser, /<Field[\s\S]*?label="Feature"[\s\S]*?orientation="horizontal"[\s\S]*?<Combobox[\s\S]*?\bfreeform\b[\s\S]*?\binlinePopup\b/);
  assert.match(
    chooser,
    /hint=\{open\s*\?\s*\{\s*'aria-live': 'polite',[\s\S]*?className: styles\.chooserSummaryBand,[\s\S]*?<span className=\{styles\.chooserSummary\} title=\{failureSummary \?\? undefined\}>\s*\{failureSummary \?\? matchSummary\}\s*<\/span>[\s\S]*?role: 'status',[\s\S]*?\}\s*:\s*undefined\}/,
    'the Field hint root is the one polite live status and its child is presentational text',
  );
  assert.equal((chooser.match(/['"]aria-live['"]\s*:/g) ?? []).length, 1, 'chooser has one live-region root');
  assert.doesNotMatch(chooser, /<span\s+aria-live=/, 'the summary child does not create a second live region');
  assert.match(chooser, /input=\{\{\s*'aria-autocomplete': 'list',/);
  assert.match(
    app,
    /const CHOOSER_POSITIONING = Object\.freeze\(\{\s*position: 'below',\s*align: 'start',\s*offset: Object\.freeze\(\{\s*crossAxis: 0,\s*mainAxis: layout\.chooserSummaryPx,\s*\}\),\s*\}\);/,
    'the inline listbox positions below its control after the summary band',
  );
  assert.match(chooser, /positioning=\{CHOOSER_POSITIONING\}/);
  assert.match(
    styleRule(styles, 'contextField'),
    /gridTemplateColumns: 'auto minmax\(0, 1fr\)'/,
    'Field retains its label/control grid',
  );
  for (const name of ['chooserControl', 'chooserSummaryBand', 'chooserEmpty']) {
    assert.match(styleRule(styles, name), /gridColumnStart: 2,[\s\S]*gridColumnEnd: 3/, `${name} aligns to the control column`);
  }
  const summaryBand = styleRule(styles, 'chooserSummaryBand');
  assert.match(summaryBand, /height: layout\.chooserSummary/);
  assert.match(summaryBand, /marginTop: 0/, 'the summary band adds no dead margin');
  assert.doesNotMatch(styles, /\.fui-Field__hint/, 'the hint slot needs no internal Fluent selector');
  assert.match(read('src/extensions/dude/frontend/theme.js'), /chooserSummary: '20px',\s*chooserSummaryPx: 20/);
  assert.match(chooser, /onFocus: beginBrowse/);
  assert.match(
    chooser,
    /const beginPointerOpen = useCallback\(\(event\) => \{\s*if \(busy \|\| listboxRef\.current\?\.contains\(event\.target\)\) return;[\s\S]*?onClickCapture: beginPointerOpen,[\s\S]*?onMouseDownCapture: beginPointerOpen/,
    'a first pointer action opens the direct combobox while listbox targets cannot reopen it',
  );
  assert.match(
    comboboxRenderer,
    /state\.listbox && \(state\.inlinePopup \?[\s\S]*?state\.listbox[\s\S]*?:[\s\S]*?\bPortal\b/,
    'the installed direct combobox branch keeps inlinePopup listboxes out of a portal',
  );
  assert.doesNotMatch(
    `${app}\n${styles}`,
    /(?:popover|portal|trapFocus)/i,
    'authored source and styles contain no overlay implementation',
  );
  assert.doesNotMatch(chooser, /<Button\b|aria-haspopup|aria-modal|role="dialog"/);
  assert.doesNotMatch(
    focalRegion,
    /<(?:Button|Combobox|FeatureChooser|Field)\b/,
    'chooser explanation has no page-level interactive selector',
  );
  assert.match(
    focalRegion,
    /The feature list is the Feature box in the command bar at the top of this window\.\s*It is the only place a feature is chosen\./,
  );

  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  const { frontend, dispose } = await loadFrontendForSsr({ open: true, useFluentTestDouble: false });
  try {
    const markup = renderFluentFrontend(frontend.CommandBar, {
      busy: false,
      choices: [{ ideaPath: '.dude/ideas/052-dude-canvas-ui.md', slug: 'dude-canvas-ui' }],
      contextLabel: 'Dude Canvas UI',
      onRefresh: () => {},
      onSelect: () => {},
      styles: renderStyles,
    });
    assert.match(markup, /<label\b[^>]*>Feature<\/label>/);
    assert.match(markup, /\brole="combobox"/);
    assert.match(markup, /\brole="listbox"/);
    assert.equal((markup.match(/\brole="option"/g) ?? []).length, 1, 'the listbox has one selectable child');
    assert.equal((markup.match(/\baria-live="polite"/g) ?? []).length, 1, 'Field hint root is the only chooser live region');
    assert.match(markup, /\brole="status"/);
    assert.match(markup, /<input\b[^>]*\baria-autocomplete="list"[^>]*>/);
    assert.match(markup, /<input\b[^>]*\baria-describedby="[^"]+"[^>]*>/);
    assert.match(
      markup,
      /1 features\. Scroll or type to narrow them\./,
      'the Field hint slot renders the exact no-query live summary',
    );
    assert.match(markup, /052-dude-canvas-ui/);
    assert.doesNotMatch(markup, /\.dude\/ideas\//, 'the raw path is not visible');
    assert.doesNotMatch(markup, /\b(?:aria-haspopup|aria-modal|role="dialog"|data-portal-node)\b/);
  } finally {
    dispose();
  }
});

test('busy chooser remains labelled and focusable while only a complete selected response moves focus', async (context) => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const chooser = app.slice(app.indexOf('function FeatureChooser'), app.indexOf('function CommandBar'));
  const chooserControl = chooser.slice(chooser.indexOf('<Combobox'), chooser.indexOf('</Combobox>'));
  const changeHandler = chooser.slice(chooser.indexOf('onChange='), chooser.indexOf('onOptionSelect='));
  const optionSelectHandler = chooser.slice(chooser.indexOf('onOptionSelect='), chooser.indexOf('placeholder='));
  const runRefresh = app.slice(app.indexOf('const runRefresh'), app.indexOf('  useEffect(() => {', app.indexOf('const runRefresh')));
  const focusEffect = app.slice(app.indexOf('  useEffect(() => {', app.indexOf('const runRefresh')), app.indexOf('  const view ='));
  const nonReplacementResponse = runRefresh.slice(runRefresh.indexOf('} else {'), runRefresh.indexOf('} finally {'));
  const refreshStyles = styles.slice(styles.indexOf('  refreshButton: {'), styles.indexOf('  icon: {'));
  const chooserStyles = styles.slice(styles.indexOf('  chooserControl: {'), styles.indexOf('  chooserListbox: {'));
  const identityStyles = styles.slice(styles.indexOf('  identityTitle: {'), styles.indexOf('  identityKey: {'));

  // Act + Assert
  assert.match(chooser, /<Field[\s\S]*?label="Feature"[\s\S]*?orientation="horizontal"/);
  assert.match(chooserControl, /aria-busy=\{busy\}/);
  assert.match(chooserControl, /aria-disabled=\{busy\}/);
  assert.match(
    chooserControl,
    /root=\{\{\s*'aria-disabled': busy,[\s\S]*?onClick: endPointerOpen,[\s\S]*?onClickCapture: beginPointerOpen,[\s\S]*?onMouseDown: endPointerOpen,[\s\S]*?onMouseDownCapture: beginPointerOpen/,
  );
  assert.doesNotMatch(chooserControl, /(?:^|[\s<])disabled\s*=/);
  assert.match(changeHandler, /if \(busy\) return;\s*setFailedIdentifier\(null\);\s*setQuery\(event\.target\.value\);/);
  assert.match(
    optionSelectHandler,
    /if \(busy\) return;[\s\S]*?const accepted = await onSelect\(\s*selectedChoice\.choice\.slug,\s*selectedChoice\.identifier,\s*\);[\s\S]*?if \(accepted\) return;[\s\S]*?setFailedIdentifier\(selectedChoice\.identifier\);/,
  );

  for (const busyStyles of [refreshStyles, chooserStyles]) {
    assert.match(busyStyles, /&\[aria-disabled="true"\]/);
    assert.match(busyStyles, /color: tokens\.colorNeutralForeground2/);
    assert.match(busyStyles, /backgroundColor: tokens\.colorNeutralBackground1Pressed/);
    assertBorderSides(busyStyles, 'busy control', 'Color', 'tokens.colorNeutralStrokeAccessible');
    assert.match(busyStyles, /cursor: 'progress'/);
  }
  assert.match(
    chooserStyles,
    /'&:has\(input:focus-visible\)': \{\s*outlineColor: tokens\.colorStrokeFocus2[\s\S]*?outlineOffset: tokens\.spacingHorizontalXXS[\s\S]*?outlineStyle: 'solid'[\s\S]*?outlineWidth: tokens\.strokeWidthThick/,
    'the chooser control outlines itself when its text input is focus-visible',
  );
  assert.match(app, /<Subtitle2 as="h2"[^>]*tabIndex=\{-1\}/);
  assert.match(identityStyles, /&:focus/);
  assert.match(identityStyles, /outlineColor: tokens\.colorStrokeFocus2/);
  assert.match(identityStyles, /outlineOffset: tokens\.spacingHorizontalXXS/);
  assert.match(identityStyles, /outlineStyle: 'solid'/);
  assert.match(identityStyles, /outlineWidth: tokens\.strokeWidthThick/);

  assert.equal((runRefresh.match(/\bsetProjection\(/g) ?? []).length, 1);
  assert.match(
    runRefresh,
    /if \(payload\.replaced === true\) \{\s*if \(focusFeature\) pendingFeatureFocusRef\.current = true;[\s\S]*?setProjection\(payload\.projection\);/,
  );
  assert.doesNotMatch(nonReplacementResponse, /\b(?:pendingFeatureFocusRef|setProjection|headingRef)\b/);
  assert.match(
    focusEffect,
    /if \(!pendingFeatureFocusRef\.current \|\| !projection\?\.selected\) return;[\s\S]*?headingRef\.current\?\.focus\(\);/,
  );
  assert.equal((app.match(/runRefresh\(slug, true, identifier\)/g) ?? []).length, 1);
  assert.match(
    runRefresh,
    /async \(target = null, focusFeature = false, identifier = null\)[\s\S]*?announce\(identifier \? `Reading \$\{identifier\}\.` : 'Reading repository sources\.'\)[\s\S]*?announce\(identifier \? `Opened \$\{identifier\}\.` : 'One complete projection replaced the previous view\.'\)/,
    'selection announcements use the canonical display identifier while the request target remains separate',
  );
  assert.doesNotMatch(runRefresh, /(?:Reading|Opened) \$\{target\}/);

  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  const { frontend, dispose } = await loadFrontendForSsr({ useFluentTestDouble: false });
  try {
    const markup = renderFluentFrontend(frontend.FeatureChooser, {
      busy: true,
      choices: [{ ideaPath: '.dude/ideas/052-dude-canvas-ui.md', slug: 'dude-canvas-ui' }],
      onSelect: () => {},
      styles: renderStyles,
    });
    const combobox = markup.match(/<(?:div|input)\b[^>]*\brole="combobox"[^>]*>/i)?.[0];
    const input = markup.match(/<input\b[^>]*>/i)?.[0];
    assert.match(markup, /<label\b[^>]*>Feature<\/label>/);
    assert.ok(combobox, 'Fluent SSR must preserve the combobox role');
    assert.match(combobox, /aria-busy="true"/);
    assert.match(combobox, /aria-disabled="true"/);
    assert.ok(input, 'Fluent SSR must provide an input for the focusable combobox');
    assert.doesNotMatch(input, /\sdisabled(?:=|(?=\s|>))/i);
    assert.doesNotMatch(input, /\stabindex="-1"/i);
  } finally {
    dispose();
  }
});

test('Fluent audit corrections remain in authored UI and the shipped bundle', () => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const theme = read('src/extensions/dude/frontend/theme.js');
  const application = fs.readFileSync(path.join(ASSET_ROOT, 'app.js'), 'utf8');
  const glyph = app.slice(app.indexOf('function Glyph'), app.indexOf('function selectedLabel'));
  const commandBar = app.slice(app.indexOf('function CommandBar'), app.indexOf('function ActivityRail'));
  const chooser = app.slice(app.indexOf('function FeatureChooser'), app.indexOf('function CommandBar'));
  const rail = app.slice(app.indexOf('function ActivityRail'), app.indexOf('function BreadcrumbStrip'));
  const breadcrumb = app.slice(app.indexOf('function BreadcrumbStrip'), app.indexOf('function IdentityStrip'));
  const statusBar = app.slice(app.indexOf('function StatusBar'), app.indexOf('function App'));
  const attention = app.slice(app.indexOf('function AttentionSection'), app.indexOf('function FreshnessSection'));
  const iconStyles = styles.slice(styles.indexOf('  icon:'), styles.indexOf('  shellBody:'));
  const currentRailStyles = styles.slice(styles.indexOf('  railCurrent:'), styles.indexOf('  railButtonLater:'));
  const laterRailStyles = styles.slice(styles.indexOf('  railButtonLater:'), styles.indexOf('  railLater:'));
  const keyboardStyles = styles.slice(styles.indexOf('  statusKeyboard:'), styles.indexOf('  statusPush:'));

  // Act + Assert
  assert.match(
    glyph,
    /<svg[\s\S]*?fill="none"[\s\S]*?stroke="currentColor"[\s\S]*?strokeLinecap="round"[\s\S]*?strokeLinejoin="round"[\s\S]*?strokeWidth="1\.5"/,
  );
  assert.doesNotMatch(iconStyles, /\b(?:color|fill|stroke|strokeLinecap|strokeLinejoin|strokeWidth)\b\s*:/);
  assert.match(
    application,
    /createElement\("svg",\{"aria-hidden":"true",className:[\w$]+,fill:"none",focusable:"false",stroke:"currentColor",strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:"1\.5"/,
  );

  assert.match(breadcrumb, /<BreadcrumbDivider\s*\/>/);
  assert.doesNotMatch(breadcrumb, /<BreadcrumbDivider\b[^>]*>[\s\S]*?<\/BreadcrumbDivider>/);

  assert.match(rail, /surface\.open \? styles\.railCurrent : styles\.railButtonLater/);
  assertBorderSides(currentRailStyles, 'railCurrent', 'Color', 'tokens.colorCompoundBrandStroke');
  assertBorderSides(laterRailStyles, 'railButtonLater', 'Style', "'dashed'");
  assertBorderSides(laterRailStyles, 'railButtonLater', 'Color', 'tokens.colorNeutralStrokeDisabled');
  assert.match(
    application,
    /railCurrent:\{color:[\w$]+\.colorBrandForeground1,borderTopColor:[\w$]+\.colorCompoundBrandStroke,borderRightColor:[\w$]+\.colorCompoundBrandStroke,borderBottomColor:[\w$]+\.colorCompoundBrandStroke,borderLeftColor:[\w$]+\.colorCompoundBrandStroke/,
  );
  assert.match(
    application,
    /railButtonLater:\{borderTopStyle:"dashed",borderRightStyle:"dashed",borderBottomStyle:"dashed",borderLeftStyle:"dashed",borderTopColor:[\w$]+\.colorNeutralStrokeDisabled,borderRightColor:[\w$]+\.colorNeutralStrokeDisabled,borderBottomColor:[\w$]+\.colorNeutralStrokeDisabled,borderLeftColor:[\w$]+\.colorNeutralStrokeDisabled\}/,
  );

  assert.match(
    rail,
    /!surface\.open \? \(\s*<span aria-hidden="true" className=\{styles\.railLater\}>\s*<Glyph className=\{styles\.smallIcon\} name="clock" \/>/,
  );
  assert.doesNotMatch(rail, /[\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}]/u);
  assert.match(
    rail,
    /<li[\s\S]*?title=\{surface\.open \? undefined : `\$\{surface\.label\} — arrives in a later cycle`\}[\s\S]*?aria-label=\{surface\.open[\s\S]*?`\$\{surface\.label\} — arrives in a later cycle`/,
  );
  assert.match(application, /arrives in a later cycle[\s\S]{0,1000}name:"clock"/);

  assert.match(commandBar, /<FeatureChooser[\s\S]*?onSelect=\{onSelect\}/);
  assert.match(chooser, /<Field[\s\S]*?label="Feature"[\s\S]*?<Combobox[\s\S]*?\bfreeform\b[\s\S]*?\binlinePopup\b/);
  assert.match(chooser, /onFocus: beginBrowse/);
  assert.doesNotMatch(`${commandBar}\n${chooser}`, /\b(?:Popover|PopoverSurface|PopoverTrigger|Portal|trapFocus)\b/);
  assert.doesNotMatch(chooser, /\b(?:aria-haspopup|aria-modal|role="dialog")\b/);
  assert.match(application, /freeform:!0,input:\{[\s\S]{0,500}\},inlinePopup:!0,listbox:/);
  assert.match(
    attention,
    /<MessageBar\b[\s\S]*?\blayout="multiline"/,
    'attention messages use Fluent multiline layout so 360px copy wraps instead of overflowing',
  );
  assert.match(
    commandBar,
    /<p className=\{styles\.brand\}>\s*<span aria-hidden="true" className=\{styles\.brandMark\}>\s*<Glyph className=\{styles\.smallIcon\} name="window" \/>/,
  );

  assert.match(
    statusBar,
    /<span className=\{mergeClasses\(styles\.statusSegment, styles\.statusKeyboard, styles\.statusPush\)\}>\s*<Glyph className=\{styles\.smallIcon\} name="keyboard" \/>\s*<span><kbd>Tab<\/kbd> moves · <kbd>Enter<\/kbd> activates<\/span>/,
  );
  assert.doesNotMatch(statusBar, /\bon(?:Click|KeyDown|KeyUp|KeyPress|PointerDown)\s*=/);
  assert.match(keyboardStyles, /display: 'none',[\s\S]*?\[media\.medium\]: \{\s*display: 'inline-flex',/);
  assert.match(theme, /medium: 720/);
  assert.match(application, /statusKeyboard:\{display:"none"[\s\S]{0,1000}display:"inline-flex"/);
  assert.match(application, /"Tab"\)," moves · ",[\s\S]{0,100}"Enter"\)," activates"/);
});

test('identity code exposes only a canonical direct selected idea path', () => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const identity = app.slice(app.indexOf('function IdentityStrip'), app.indexOf('function SectionHead'));
  const identifierSource = app.slice(
    app.indexOf('function canonicalFeatureIdentifier'),
    app.indexOf('function nextAuthorityReason'),
  );
  const canonicalFeatureIdentifier = Function(
    `"use strict"; ${identifierSource}; return canonicalFeatureIdentifier;`,
  )();

  // Act
  const valid = canonicalFeatureIdentifier('.dude/ideas/052-dude-canvas-ui.md');
  const unavailable = [
    undefined,
    '.dude/ideas/52-dude-canvas-ui.md',
    '.dude/ideas/052-dude-canvas-ui',
    '.dude/ideas/052-Dude-canvas-ui.md',
    '.dude/ideas/052-dude-canvas-ui.md/extra',
  ].map((ideaPath) => canonicalFeatureIdentifier(ideaPath));

  // Assert
  assert.equal(valid, '052-dude-canvas-ui');
  assert.deepEqual(unavailable, new Array(5).fill(null));
  assert.match(identifierSource, /^\s*function canonicalFeatureIdentifier\(ideaPath\)/);
  assert.match(identity, /canonicalFeatureIdentifier\(selected\?\.ideaPath\)/);
  assert.match(
    identity,
    /<code className=\{styles\.identityKey\}>\{identifier \?\? 'Identifier unavailable'\}<\/code>/,
  );
  assert.match(read('src/extensions/dude/frontend/styles.js'), /identityKey:\s*\{/);
  assert.doesNotMatch(
    identity,
    /selected\?\.slug|selectedLabel\(selected\)|ideaPath\s*\?\?/,
    'the identity code must not disclose a path or guess from a slug',
  );
});

test('approved rail chrome is present and inert outside the local Now announcement', async () => {
  // Arrange
  const app = read('src/extensions/dude/frontend/app.jsx');
  const rail = app.slice(app.indexOf('function ActivityRail'), app.indexOf('function BreadcrumbStrip'));
  const surfaces = [...app.matchAll(
    /Object\.freeze\(\{ label: '([^']+)', open: (true|false), glyph: '([^']+)' \}\)/g,
  )].map(([, label, open, glyph]) => ({ glyph, label, open: open === 'true' }));
  const server = read('src/extensions/dude/lib/canvas-server.mjs');

  // Act + Assert
  assert.deepEqual(surfaces, [
    { glyph: 'now', label: 'Now', open: true },
    { glyph: 'work', label: 'Work', open: false },
    { glyph: 'document', label: 'Artifacts', open: false },
    { glyph: 'review', label: 'Review', open: false },
    { glyph: 'memory', label: 'Memory', open: false },
    { glyph: 'team', label: 'Team', open: false },
  ]);
  assert.match(rail, /<nav aria-label="Surfaces"/);
  assert.match(rail, /disabled=\{!surface\.open\}/);
  assert.match(
    rail,
    /onClick=\{surface\.open\s*\? \(\) => announce\('Now is already the open surface\.'\)\s*: undefined\}/,
  );
  assert.match(rail, /aria-label=\{surface\.open[\s\S]*?arrives in a later cycle/);
  assert.doesNotMatch(
    rail,
    /\b(?:fetch|href|location|navigate|runRefresh|onSelect|setProjection|setFreshness)\b/,
    'rail chrome must not navigate or acquire a capability',
  );
  assert.match(app, /label: 'Review', open: false, glyph: 'review'/);
  assert.doesNotMatch(
    app,
    /\b(?:ReviewPanel|ReviewRoute|ReviewState|reviewRoute|reviewState|openReview|setReview)\b/,
  );
  assert.doesNotMatch(server, /\/(?:api\/)?review\b/i);

  if (hasFrontendTestRuntime()) {
    const { frontend, dispose } = await loadFrontendForSsr({ useFluentTestDouble: false });
    try {
      const buttons = [...renderFluentFrontend(frontend.ActivityRail, {
        announce: () => {},
        styles: renderStyles,
      }).matchAll(/<button\b[^>]*>/g)].map(([button]) => button);
      assert.equal(buttons.length, 6);
      assert.match(buttons[0], /aria-current="page"/);
      assert.doesNotMatch(buttons[0], /\bdisabled(?:=""|(?=[\s>]))/);
      for (const button of buttons.slice(1)) {
        assert.match(button, /\bdisabled(?:=""|(?=[\s>]))/);
        assert.doesNotMatch(button, /\btabindex=/i, 'disabled future chrome must be absent from tab order');
      }
    } finally {
      dispose();
    }
  }
});

test('Why attributes a ready next step to its authority and keeps blockers in Attention', async (context) => {
  // Arrange
  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  const { frontend, dispose } = await loadFrontendForSsr();
  const readyProjection = {
    authority: 'tracked',
    blockers: [{ reason: 'Unrelated blocker text must remain in Attention.' }],
    complete: true,
    next: { description: 'Open the exact selected work item.' },
    nextReason: 'No ready work exists.',
    status: 'ok',
  };
  const noNextProjection = {
    authority: 'lightweight',
    blockers: [{ reason: 'The task board records a blocked dependency.' }],
    complete: true,
    next: null,
    nextReason: 'No task is ready until its dependency is complete.',
    status: 'ok',
  };

  try {
    // Act
    const ready = renderFrontend(frontend.FocalRegion, {
      busy: false,
      choices: [],
      onSelect: () => {},
      projection: readyProjection,
      styles: renderStyles,
      view: { mode: 'feature', stage: 'In progress', title: 'Tracked fixture' },
    });
    const noNext = renderFrontend(frontend.FocalRegion, {
      busy: false,
      choices: [],
      onSelect: () => {},
      projection: noNextProjection,
      styles: renderStyles,
      view: { mode: 'feature', stage: 'Blocked', title: 'Lightweight fixture' },
    });
    const attention = renderFrontend(frontend.AttentionSection, {
      freshness: { state: 'current' },
      projection: noNextProjection,
      styles: renderStyles,
      view: { mode: 'feature', stage: 'Blocked', title: 'Lightweight fixture' },
    });

    // Assert
    assert.match(ready, /Open the exact selected work item\./);
    assert.match(ready, /The active work tracker identifies this as the next safe step\./);
    assert.doesNotMatch(ready, /Unrelated blocker text must remain in Attention\./);
    assert.match(noNext, /No task is ready until its dependency is complete\./);
    assert.doesNotMatch(noNext, /The task board records a blocked dependency\./);
    assert.match(attention, /Authoritative blocker/);
    assert.match(attention, /The task board records a blocked dependency\./);
  } finally {
    dispose();
  }
});

test('shared valid-choice helper keeps chooser, placeholder, and page counts consistent', async (context) => {
  // Arrange
  if (!hasFrontendTestRuntime()) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  const app = read('src/extensions/dude/frontend/app.jsx');
  const styles = read('src/extensions/dude/frontend/styles.js');
  const chooser = app.slice(app.indexOf('function FeatureChooser'), app.indexOf('function CommandBar'));
  const inputSlot = chooser.slice(chooser.indexOf('input={{'), chooser.indexOf('inlinePopup'));
  const optionSelectHandler = chooser.slice(chooser.indexOf('onOptionSelect='), chooser.indexOf('placeholder='));
  const validChoices = app.slice(
    app.indexOf('function selectableFeatureChoices'),
    app.indexOf('function nextAuthorityReason'),
  );
  const focalRegion = app.slice(app.indexOf('function FocalRegion'), app.indexOf('function LifecycleRegion'));
  const propertiesSection = app.slice(app.indexOf('function PropertiesSection'), app.indexOf('function SurfacesSection'));
  const choices = Array.from({ length: 50 }, (_unused, index) => {
    const ordinal = index + 1;
    const number = index === 47 ? '052' : index === 48 ? '053' : index === 49
      ? '054'
      : String(ordinal).padStart(3, '0');
    const slug = index === 47
      ? 'dude-canvas-ui'
      : index === 48
        ? 'feature-slug-target'
        : `feature-${String(ordinal).padStart(2, '0')}`;
    return {
      ideaPath: `.dude/ideas/${number}-${slug}.md`,
      slug,
    };
  });
  const projectedChoices = [
    ...choices,
    { ideaPath: '.dude/ideas/52-too-short.md', slug: 'too-short' },
    { ideaPath: '.dude/ideas/055-Uppercase.md', slug: 'uppercase' },
    { ideaPath: '.dude/ideas/056-missing-extension', slug: 'missing-extension' },
  ];
  const [all, features, identifier, dude, slug, empty, escaped] = await Promise.all([
    loadFrontendForSsr({ open: true }),
    loadFrontendForSsr({ open: true, query: 'FEATURE' }),
    loadFrontendForSsr({ open: true, query: '052' }),
    loadFrontendForSsr({ open: true, query: 'dude' }),
    loadFrontendForSsr({ open: true, query: 'slug' }),
    loadFrontendForSsr({ open: true, query: 'nothing-matches' }),
    loadFrontendForSsr({ open: true, query: '<&' }),
  ]);

  try {
    // Act
    const allMarkup = renderFrontend(all.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const featureMarkup = renderFrontend(features.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const identifierMarkup = renderFrontend(identifier.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const dudeMarkup = renderFrontend(dude.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const slugMarkup = renderFrontend(slug.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const emptyMarkup = renderFrontend(empty.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const escapedMarkup = renderFrontend(escaped.frontend.FeatureChooser, {
      choices: projectedChoices,
      onSelect: () => {},
      styles: renderStyles,
    });
    const focalMarkup = renderFrontend(all.frontend.FocalRegion, {
      choices: projectedChoices,
      projection: null,
      styles: renderStyles,
      view: { mode: 'choose', stage: null, title: 'Choose a feature' },
    });
    const propertiesMarkup = renderFrontend(all.frontend.PropertiesSection, {
      freshness: null,
      projection: null,
      styles: renderStyles,
      view: { choices: projectedChoices, mode: 'choose', stage: null, title: 'Choose a feature' },
    });

    // Assert
    assert.match(chooser, /const \[query, setQuery\] = useState\(null\)/, 'committed selection is not a query');
    assert.match(chooser, /const \[pendingIdentifier, setPendingIdentifier\] = useState\(null\)/);
    assert.match(chooser, /const normalizedQuery = \(query \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.match(
      chooser,
      /const matchSummary = query === null \|\| !normalizedQuery\s*\? `\$\{selectableChoices\.length\} features\.\$\{selectedSummary\} Scroll or type to narrow them\.`\s*: `\$\{matchingChoices\.length\} of \$\{selectableChoices\.length\} features match "\$\{query\}"\.\$\{committedChoice \? ` \$\{committedIdentifier\} stays selected\.` : ''\}`/,
      'the approved no-query and filter-count status copy is exact',
    );
    assert.match(
      chooser,
      /<Caption1 block className=\{styles\.chooserEmpty\}>\s*\{`No features match "\$\{query\}"\.`\}\s*<\/Caption1>/,
      'the approved zero-match caption copy is exact',
    );
    assert.match(
      chooser,
      /hint=\{open\s*\?\s*\{[\s\S]*?'aria-live': 'polite',[\s\S]*?className: styles\.chooserSummaryBand,[\s\S]*?role: 'status',[\s\S]*?\}\s*:\s*undefined\}/,
      'one supported Field hint root owns status announcements',
    );
    assert.doesNotMatch(chooser, /<Caption1[^>]*aria-live=/, 'zero-match caption is not a second live region');
    assert.doesNotMatch(chooser, /\bMatches:|No features match this query\./);
    assert.match(validChoices, /function selectableFeatureChoices\(choices\)[\s\S]*?canonicalFeatureIdentifier\(choice\.ideaPath\)[\s\S]*?\.filter\(\(\{ choice, identifier \}\) => \(\s*identifier !== null && typeof choice\.slug === 'string'/);
    assert.equal(
      (app.match(/const selectableChoices = selectableFeatureChoices\(choices\);/g) ?? []).length,
      2,
      'FeatureChooser and FocalRegion use the one canonical valid-choice helper',
    );
    assert.match(
      propertiesSection,
      /rows\.push\(\['Features', `\$\{selectableFeatureChoices\(view\.choices \?\? \[\]\)\.length\} available`\]\);/,
      'Properties derives its available count from the canonical valid-choice helper',
    );
    assert.match(
      chooser,
      /identifier\.toLowerCase\(\)\.includes\(normalizedQuery\)\s*\|\|\s*choice\.slug\.toLowerCase\(\)\.includes\(normalizedQuery\)/,
    );
    assert.match(validChoices, /canonicalFeatureIdentifier\(choice\.ideaPath\)/);
    assert.match(validChoices, /\.filter\(\(\{ choice, identifier \}\) => \(/);
    assert.match(chooser, /matchingChoices\.map\(\(\{ choice, identifier \}\) => \(/);
    assert.doesNotMatch(chooser, /\bmatchingChoices\.(?:slice|window)\b/);
    assert.equal(
      (chooser.match(/onKeyDownCapture/g) ?? []).length,
      1,
      'the Combobox chooser has one authoritative capture-phase Tab handler',
    );
    assert.match(
      inputSlot,
      /onKeyDownCapture: \(event\) => \{\s*if \(busy \|\| event\.key !== 'Tab'\) return;\s*setFailedIdentifier\(null\);\s*setOpen\(false\);\s*setQuery\(null\);\s*event\.stopPropagation\(\);\s*\}/,
      'capture-phase Tab resets and closes the chooser before Fluent’s root bubble handler',
    );
    assert.doesNotMatch(
      inputSlot,
      /preventDefault/,
      'capture-phase Tab preserves the browser’s native focus traversal',
    );
    assert.doesNotMatch(
      optionSelectHandler,
      /\b(?:_event|event)\.key\s*(?:===|!==)\s*['"]Tab['"]/,
      'onOptionSelect has no redundant Tab guard after the input capture handler owns Tab',
    );
    assert.match(
      optionSelectHandler,
      /onOptionSelect=\{async \(_event, data\) => \{\s*if \(busy\) return;[\s\S]*?selectableChoices\.find\(\s*\(\{ choice \}\) => choice\.slug === data\.optionValue,[\s\S]*?setQuery\(null\);[\s\S]*?setOpen\(false\);[\s\S]*?setPendingIdentifier\(selectedChoice\.identifier\);[\s\S]*?onSelect\(\s*selectedChoice\.choice\.slug,\s*selectedChoice\.identifier,\s*\)/,
      'option selection retains its non-Tab success and failure behavior',
    );
    assert.match(
      chooser,
      /const committedSlug = typeof selected\?\.slug === 'string' \? selected\.slug : null;[\s\S]*?const committedIdentifier = canonicalFeatureIdentifier\(selected\?\.ideaPath\);[\s\S]*?const committedChoice = committedSlug && committedIdentifier\s*\? selectableChoices\.find\(\(\{ choice, identifier \}\) => \(\s*choice\.slug === committedSlug && identifier === committedIdentifier\s*\)\)\s*:\s*null;[\s\S]*?const selectedOptions = committedChoice \? \[committedChoice\.choice\.slug\] : \[\];[\s\S]*?const selectedSummary = committedChoice \? ` \$\{committedIdentifier\} is selected\.` : '';/,
      'selectedOptions and selected summary require exact slug and canonical identifier membership',
    );
    assert.doesNotMatch(chooser, /setQuery\(selectedChoice\.identifier\)/, 'submitting an option cannot optimistically commit its display');
    assert.match(
      chooser,
      /onChange=\{\(event\) => \{\s*if \(busy\) return;\s*setFailedIdentifier\(null\);\s*setQuery\(event\.target\.value\);\s*\}\}/,
    );
    assert.equal((app.match(/<FeatureChooser\b/g) ?? []).length, 1, 'only command bar renders the chooser');
    assert.match(
      styleRule(styles, 'chooserListbox'),
      /maxHeight: `calc\(\$\{layout\.chooserRow\} \* 5\) !important`[\s\S]*overflowY: 'auto'[\s\S]*?\[media\.tall\]: \{\s*maxHeight: `calc\(\$\{layout\.chooserRow\} \* 8\) !important`/,
      'listbox capacity derives from the shared chooser row token at both viewport heights',
    );
    assert.match(styleRule(styles, 'chooserOption'), /height: layout\.chooserRow[\s\S]*minHeight: layout\.chooserRow/);
    assert.match(read('src/extensions/dude/frontend/theme.js'), /chooserRow: '36px'/);
    assert.match(
      chooser,
      /<Option[\s\S]*?className=\{styles\.chooserOption\}[\s\S]*?text=\{identifier\}[\s\S]*?value=\{choice\.slug\}[\s\S]*?>\s*<span className=\{styles\.chooserOptionText\}>\{identifier\}<\/span>/,
      'the full canonical Option text remains separate from its visibly clipped child span',
    );
    const optionLabel = styleRule(styles, 'chooserOptionText');
    assert.match(
      optionLabel,
      /display: 'block',[\s\S]*minWidth: 0,[\s\S]*overflow: 'hidden',[\s\S]*textOverflow: 'ellipsis',[\s\S]*whiteSpace: 'nowrap'/,
      'the inner option label, not the Fluent Option root, owns its ellipsis contract',
    );
    assert.doesNotMatch(
      styleRule(styles, 'chooserOption'),
      /\b(?:overflow|textOverflow|whiteSpace)\b/,
      'the option root has no false root-only ellipsis contract',
    );
    const optionStyles = styleRule(styles, 'chooserOption');
    assert.match(
      optionStyles,
      /['"]&\[aria-selected="true"]['"]: \{\s*backgroundColor: tokens\.colorNeutralBackground1Selected,[\s\S]*?['"]&\[aria-selected="true"] \.fui-Option__checkIcon['"]: \{\s*color: tokens\.colorBrandForeground1/,
      'the selected row owns its local fill and check treatment',
    );
    assert.match(
      optionStyles,
      /['"]&\[aria-selected="true"\]\[data-activedescendant-focusvisible\]['"]: \{\s*backgroundColor: tokens\.colorNeutralBackground1Selected/,
      'active navigation cannot replace the committed row fill',
    );
    for (const exactCopy of [
      /Scroll the list to reach any feature, or type a number or name to filter it—for example, 052 or dude\./,
      /<span className=\{styles\.factLabel\}>Canonical identifier<\/span>\s*<span className=\{styles\.factValue\}>Number and name exactly as filed; the slug remains the internal target\.<\/span>/,
    ]) assert.match(focalRegion, exactCopy);
    assert.doesNotMatch(focalRegion, /(?:slug-only|type a slug|filter by slug)/i);

    assert.equal((allMarkup.match(/role="option"/g) ?? []).length, 50, 'three malformed paths are excluded from the 53-item projection');
    assert.match(allMarkup, /50 features\. Scroll or type to narrow them\./);
    assert.match(focalMarkup, /50 features from the complete projected inventory/);
    assert.match(chooser, /placeholder=\{`Choose from \$\{selectableChoices\.length\} features`\}/);
    assert.match(propertiesMarkup, /<dt>Features<\/dt><dd>50 available<\/dd>/);
    assert.equal((featureMarkup.match(/role="option"/g) ?? []).length, 49);
    assert.match(featureMarkup, /49 of 50 features match &quot;FEATURE&quot;\./);
    assert.ok(
      featureMarkup.indexOf('001-feature-01') < featureMarkup.indexOf('002-feature-02')
        && featureMarkup.indexOf('046-feature-46') < featureMarkup.indexOf('047-feature-47')
        && featureMarkup.indexOf('053-feature-slug-target') < featureMarkup.indexOf('054-feature-50'),
      'every filtered option retains projection source order rather than sorting choices',
    );
    assert.equal(featureMarkup.includes('054-feature-50'), true, 'unwindowed filter renders the final matching row');
    assert.doesNotMatch(featureMarkup, /\.dude\/ideas\/|too-short|uppercase|missing-extension/);
    assert.deepEqual(
      [...identifierMarkup.matchAll(/role="option">\s*<span[^>]*>([^<]+)</g)].map(([, text]) => text),
      ['052-dude-canvas-ui'],
      'identifier filtering preserves the canonical visible label',
    );
    assert.equal((dudeMarkup.match(/role="option"/g) ?? []).length, 1);
    assert.match(dudeMarkup, /052-dude-canvas-ui/);
    assert.deepEqual(
      [...slugMarkup.matchAll(/role="option">\s*<span[^>]*>([^<]+)</g)].map(([, text]) => text),
      ['053-feature-slug-target'],
      'slug filtering retains a canonical visible label',
    );
    assert.equal((emptyMarkup.match(/role="option"/g) ?? []).length, 0);
    assert.match(emptyMarkup, /0 of 50 features match &quot;nothing-matches&quot;\./);
    assert.equal((emptyMarkup.match(/No features match &quot;nothing-matches&quot;\./g) ?? []).length, 1);
    assert.match(
      escapedMarkup,
      /No features match &quot;&lt;&amp;&quot;\./,
      'React escapes a reachable punctuation-only query instead of parsing it as markup',
    );
    assert.doesNotMatch(escapedMarkup, /No features match "<&"\./, 'the raw query is never serialized as markup');
  } finally {
    all.dispose();
    features.dispose();
    identifier.dispose();
    dude.dispose();
    slug.dispose();
    empty.dispose();
    escaped.dispose();
  }
});

test('chooser composite surfaces use only Fluent tokens for their required edges', () => {
  // Arrange
  const styles = read('src/extensions/dude/frontend/styles.js');
  const summaryBand = styleRule(styles, 'chooserSummaryBand');
  const listbox = styleRule(styles, 'chooserListbox');
  const empty = styleRule(styles, 'chooserEmpty');

  // Act + Assert
  assert.match(
    summaryBand,
    /backgroundColor: tokens\.colorNeutralBackground1,[\s\S]*borderTopLeftRadius: tokens\.borderRadiusMedium,[\s\S]*borderTopRightRadius: tokens\.borderRadiusMedium,[\s\S]*borderTopStyle: 'solid',[\s\S]*borderLeftStyle: 'solid',[\s\S]*borderRightStyle: 'solid',[\s\S]*borderBottomStyle: 'none',[\s\S]*boxShadow: tokens\.shadow16/,
    'the summary owns the raised, rounded top edge of the composite surface',
  );
  for (const side of ['Top', 'Right', 'Left']) {
    assert.match(summaryBand, new RegExp(`border${side}Color: tokens\\.colorNeutralStroke2`));
  }
  assert.match(summaryBand, /borderBottomWidth: 0/);
  assert.match(
    listbox,
    /padding: 0,[\s\S]*borderTopLeftRadius: 0,[\s\S]*borderTopRightRadius: 0,[\s\S]*borderTopStyle: 'none',[\s\S]*borderTopWidth: 0/,
    'the listbox cannot expose a second rounded top edge',
  );
  for (const side of ['Right', 'Bottom', 'Left']) {
    assert.match(listbox, new RegExp(`border${side}Style: 'solid'`));
    assert.match(listbox, new RegExp(`border${side}Width: tokens\\.strokeWidthThin`));
    assert.match(listbox, new RegExp(`border${side}Color: tokens\\.colorNeutralStroke2`));
  }
  assert.match(
    empty,
    /backgroundColor: tokens\.colorNeutralBackground1,[\s\S]*borderTopLeftRadius: 0,[\s\S]*borderTopRightRadius: 0,[\s\S]*borderBottomLeftRadius: tokens\.borderRadiusMedium,[\s\S]*borderBottomRightRadius: tokens\.borderRadiusMedium,[\s\S]*boxShadow: tokens\.shadow16,[\s\S]*fontSize: tokens\.fontSizeBase300,[\s\S]*lineHeight: tokens\.lineHeightBase300/,
    'the zero-match surface owns the lower radius, approved type, and elevation',
  );
  assert.match(empty, /paddingBlock: tokens\.spacingVerticalS,[\s\S]*paddingInline: tokens\.spacingHorizontalS/);
  for (const side of ['Right', 'Bottom', 'Left']) {
    assert.match(empty, new RegExp(`border${side}Style: 'solid'`));
    assert.match(empty, new RegExp(`border${side}Width: tokens\\.strokeWidthThin`));
    assert.match(empty, new RegExp(`border${side}Color: tokens\\.colorNeutralStroke2`));
  }
  for (const [name, rule] of Object.entries({ summaryBand, empty })) {
    assert.doesNotMatch(
      rule,
      /(?:#[\da-f]{3,8}\b|rgb\(|hsl\(|boxShadow:\s*['"`])/i,
      `${name} contains no locally invented color or shadow value`,
    );
  }
});

test('two clean fixture builds remove stale assets and preserve every non-asset byte', (context) => {
  if (!fs.existsSync(path.join(TOOL_ROOT, 'node_modules', 'esbuild'))) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }

  // Arrange
  const { sandbox, repo } = buildFixture();
  try {
    const stableBefore = snapshotTree(repo)
      .filter((entry) => !entry.path.startsWith('src/extensions/dude/ui/assets'));

    // Act
    const first = runFixtureBuild(repo);
    const firstAssets = new Map(EXPECTED_ASSETS.map((filename) => [
      filename,
      fs.readFileSync(path.join(repo, 'src', 'extensions', 'dude', 'ui', 'assets', filename)),
    ]));
    const second = runFixtureBuild(repo);

    // Assert
    assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
    assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
    assert.deepEqual(filesBelow(path.join(repo, 'src', 'extensions', 'dude', 'ui', 'assets')), EXPECTED_ASSETS);
    for (const filename of EXPECTED_ASSETS) {
      const built = fs.readFileSync(path.join(repo, 'src', 'extensions', 'dude', 'ui', 'assets', filename));
      assert.deepEqual(built, firstAssets.get(filename), `second build changed ${filename}`);
      assert.deepEqual(built, fs.readFileSync(path.join(ASSET_ROOT, filename)), `build drift in ${filename}`);
    }
    assert.deepEqual(
      snapshotTree(repo).filter((entry) => !entry.path.startsWith('src/extensions/dude/ui/assets')),
      stableBefore,
      'the build must leave frontend, UI siblings, and project bytes untouched',
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('fixture build rejects wrong-type and symlinked asset boundaries before mutation', (context) => {
  if (!fs.existsSync(path.join(TOOL_ROOT, 'node_modules', 'esbuild'))) {
    context.skip('requires installed scoped dependencies; npm ci is intentionally outside recursive tests');
    return;
  }
  for (const setup of [
    {
      name: 'wrong-type assets directory',
      apply: (repo, outside) => {
        fs.rmSync(path.join(repo, 'src', 'extensions', 'dude', 'ui', 'assets'), { recursive: true });
        write(repo, 'src/extensions/dude/ui/assets', 'not a directory\n');
        return outside;
      },
    },
    {
      name: 'symlinked UI ancestor',
      apply: (repo, outside) => {
        fs.rmSync(path.join(repo, 'src', 'extensions', 'dude', 'ui'), { recursive: true });
        write(outside, 'sentinel.txt', 'outside bytes\n');
        fs.symlinkSync(outside, path.join(repo, 'src', 'extensions', 'dude', 'ui'), 'dir');
        return outside;
      },
    },
  ]) {
    // Arrange
    const { sandbox, repo } = buildFixture();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-build-outside-'));
    try {
      setup.apply(repo, outside);
      const beforeRepo = snapshotTree(repo);
      const beforeOutside = snapshotTree(outside);

      // Act
      const result = runFixtureBuild(repo);

      // Assert
      assert.notEqual(result.status, 0, setup.name);
      assert.match(`${result.stdout}${result.stderr}`, /refusing unsafe asset boundary/i);
      assert.deepEqual(snapshotTree(repo), beforeRepo, `${setup.name}: fixture mutated`);
      assert.deepEqual(snapshotTree(outside), beforeOutside, `${setup.name}: outside bytes mutated`);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});

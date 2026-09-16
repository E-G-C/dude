// @ts-check
// Design-only asset build for feature 059. It reuses the existing scoped
// esbuild toolchain and dependency tree under scripts/dude-canvas-ui/ with the
// same options the Canvas build uses, and writes ONLY inside this design
// directory. It never touches src/extensions/dude/ui/assets/ or .github/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_ROOT = path.resolve(HERE, '..');
const REPOSITORY_ROOT = path.resolve(DESIGN_ROOT, '..', '..', '..', '..');
const TOOL_ROOT = path.join(REPOSITORY_ROOT, 'scripts', 'dude-canvas-ui');
const DEPENDENCY_DIRECTORY = path.join(TOOL_ROOT, 'node_modules');
const ENTRY_FILE = path.join(HERE, 'host.jsx');
const OUTPUT_FILE = path.join(HERE, 'assets', 'host.js');

/** The nine adopted Review files the design copies must keep in step with. */
export const REVIEW_FILES = Object.freeze([
  'engine.mjs', 'geometry.mjs', 'shapes.mjs', 'inspector.mjs',
  'panel.mjs', 'capture.mjs', 'bridge.mjs', 'styles.css', 'NOTICE.txt',
]);
/** Frontend components the proof runs, with their authoritative sources. */
export const FRONTEND_FILES = Object.freeze([
  'review.jsx', 'needs-you.jsx', 'styles.js', 'theme.js', 'use-canvas-data.js',
]);

export const PATHS = Object.freeze({
  designRoot: DESIGN_ROOT,
  repositoryRoot: REPOSITORY_ROOT,
  prototype: HERE,
  reviewSource: path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'ui', 'review'),
  frontendSource: path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'frontend'),
  reviewCopies: path.join(HERE, 'review'),
  frontendCopies: path.join(HERE, 'frontend'),
  canonicalHtml: path.join(DESIGN_ROOT, 'review-direct-manipulation.html'),
  bundle: OUTPUT_FILE,
  legal: `${OUTPUT_FILE}.LEGAL.txt`,
});

export async function buildDesignAssets() {
  const { build } = await import(path.join(DEPENDENCY_DIRECTORY, 'esbuild', 'lib', 'main.js'));
  // Read-only import: build.mjs only builds when it is the entry module.
  const { collectBundledPackageLicenses } = await import(path.join(TOOL_ROOT, 'build.mjs'));
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const result = await build({
    absWorkingDir: DESIGN_ROOT,
    // Fluent and Tabster must share Keyborg's window registry and ID counter.
    alias: { keyborg: path.join(DEPENDENCY_DIRECTORY, 'keyborg') },
    bundle: true,
    charset: 'utf8',
    define: { 'process.env.NODE_ENV': '"production"' },
    entryPoints: [ENTRY_FILE],
    format: 'esm',
    legalComments: 'linked',
    logLevel: 'warning',
    metafile: true,
    minify: true,
    nodePaths: [DEPENDENCY_DIRECTORY],
    outfile: OUTPUT_FILE,
    platform: 'browser',
    sourcemap: false,
    target: 'es2022',
    treeShaking: true,
  });
  const inputs = Object.keys(result.metafile.outputs[path.relative(DESIGN_ROOT, OUTPUT_FILE)]?.inputs ?? {});
  const escaped = inputs.filter(input => !input.startsWith('prototype/')
    && !input.includes('scripts/dude-canvas-ui/node_modules/'));
  if (escaped.length) throw new Error(`design bundle reached outside the design set: ${escaped.join(', ')}`);
  if (!fs.existsSync(PATHS.legal)) throw new Error('design bundle emitted no linked legal companion');
  // The same metafile-derived package licences the Canvas build records, using
  // that build's own collector, so this design bundle ships complete notices.
  const packages = collectBundledPackageLicenses({
    metafile: result.metafile,
    outputFile: OUTPUT_FILE,
    repositoryRoot: DESIGN_ROOT,
    dependencyDirectory: DEPENDENCY_DIRECTORY,
  });
  fs.appendFileSync(PATHS.legal, Buffer.concat([Buffer.from('\n\n'
    + '================================================================================\n'
    + 'Third-party package licenses (metafile-derived, design proof bundle)\n'
    + '================================================================================\n'
    + 'Only npm packages with code bytes in host.js are listed. Package roots are\n'
    + 'derived from the esbuild output metafile for this build.\n\n', 'utf8'),
  ...packages.flatMap(entry => [Buffer.from(`----- BEGIN BUNDLED PACKAGE LICENSE -----\n`
      + `Package: ${JSON.stringify(entry.name)}\n`
      + `Version: ${JSON.stringify(entry.version)}\n`
      + `Package root: ${JSON.stringify(entry.rootRelative)}\n`
      + `License: ${JSON.stringify(entry.license)}\n`
      + `License source: ${JSON.stringify(entry.licenseSource)}\n`
      + 'License text:\n', 'utf8'), entry.licenseBytes,
    Buffer.from('\n----- END BUNDLED PACKAGE LICENSE -----\n\n', 'utf8')])]));
  return { inputs: inputs.length, packages: packages.length, bytes: fs.statSync(OUTPUT_FILE).size };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const report = await buildDesignAssets();
  process.stdout.write(`design bundle: ${report.bytes} bytes from ${report.inputs} inputs, `
    + `${report.packages} bundled package licences recorded\n`);
}

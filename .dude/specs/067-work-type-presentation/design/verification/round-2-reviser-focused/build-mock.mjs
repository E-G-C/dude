// Reconstructed 067 mock build (reviser's temp copy, not product tooling).
// Mirrors the build note in design/work-type-presentation.html: esbuild 0.28.2 from
// scripts/dude-canvas-ui/node_modules with the product build's options (keyborg alias,
// NODE_ENV production, minify, es2022) except format iife, plus third-party licenses
// collected with build.mjs's exported collector.
// Usage: node build-mock.mjs --repo <repo> --entry <source.jsx> --outfile <dir/work-type-presentation.js>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = name => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : null; };
const repo = path.resolve(arg('repo'));
const entry = path.resolve(arg('entry'));
const outfile = path.resolve(arg('outfile'));
const toolRoot = path.join(repo, 'scripts', 'dude-canvas-ui');
const dependencyDirectory = path.join(toolRoot, 'node_modules');
const { build, version } = await import(pathToFileURL(path.join(dependencyDirectory, 'esbuild', 'lib', 'main.js')).href);
const { collectBundledPackageLicenses } = await import(pathToFileURL(path.join(toolRoot, 'build.mjs')).href);
if (version !== '0.28.2') throw new Error(`expected esbuild 0.28.2, found ${version}`);

const legalFile = `${outfile}.LEGAL.txt`;
for (const file of [outfile, legalFile]) if (fs.existsSync(file)) fs.rmSync(file);
const result = await build({
  absWorkingDir: repo,
  alias: { keyborg: path.join(dependencyDirectory, 'keyborg') },
  bundle: true,
  charset: 'utf8',
  define: { 'process.env.NODE_ENV': '"production"' },
  entryPoints: [entry],
  format: 'iife',
  legalComments: 'linked',
  logLevel: 'warning',
  metafile: true,
  minify: true,
  nodePaths: [dependencyDirectory],
  outfile,
  platform: 'browser',
  sourcemap: false,
  target: 'es2022',
  treeShaking: true,
});
if (result.errors.length || result.warnings.length) throw new Error(`esbuild reported ${result.errors.length} errors, ${result.warnings.length} warnings`);
const packages = collectBundledPackageLicenses({ metafile: result.metafile, outputFile: outfile, repositoryRoot: repo, dependencyDirectory });
const chunks = [Buffer.from('\n\nThird-party package licenses (metafile-derived, same collector as scripts/dude-canvas-ui/build.mjs)\n\n', 'utf8')];
for (const item of packages) {
  chunks.push(Buffer.from('----- BEGIN BUNDLED PACKAGE LICENSE -----\n'
    + `Package: ${JSON.stringify(item.name)}\nVersion: ${JSON.stringify(item.version)}\nLicense: ${JSON.stringify(item.license)}\n`
    + `License source: ${JSON.stringify(item.licenseSource)}\nLicense text:\n`, 'utf8'));
  chunks.push(item.licenseBytes);
  chunks.push(Buffer.from(item.licenseBytes.at(-1) === 0x0a ? '\n' : '\n\n', 'utf8'));
  chunks.push(Buffer.from('----- END BUNDLED PACKAGE LICENSE -----\n\n', 'utf8'));
}
fs.appendFileSync(legalFile, Buffer.concat(chunks));
const outputs = Object.keys(result.metafile.outputs).map(key => path.basename(key)).sort();
console.log(JSON.stringify({ esbuild: version, outputs, packages: packages.length,
  bytes: { js: fs.statSync(outfile).size, legal: fs.statSync(legalFile).size } }));

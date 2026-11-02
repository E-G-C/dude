// Packaging only, no rebuild: put the mock's build output into the canonical HTML as its one inline
// classic script, so the preview is a single file. The GitHub Copilot app's browser preview serves a
// local file from http://browser-preview-local.localhost/<id>/, where a separate script needs a
// matching script-src; an inline runtime opens the same there, from disk, and from any server.
//
//   node package-inline.mjs --html <work-type-presentation.html> --runtime <work-type-presentation.js>
//   node package-inline.mjs --html <work-type-presentation.html> --runtime <work-type-presentation.js> --check
//
// Write mode replaces the one runtime slot (the original <script src="./work-type-presentation.js">
// tag, or an earlier inline copy). --check writes nothing and fails unless the inline bytes equal
// the runtime file. Line endings: the runtime must be LF-only; the HTML's own lines are untouched.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = name => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : null; };
if (!arg('html') || !arg('runtime')) throw new Error('usage: --html <file> --runtime <file> [--check]');
const htmlFile = path.resolve(arg('html'));
const runtimeFile = path.resolve(arg('runtime'));
const check = argv.includes('--check');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

const runtime = fs.readFileSync(runtimeFile);
// Script element text ends at the first "</script" and "<!--" changes tokenizer state; the HTML
// parser also rewrites CR and NUL. Without any of them the runtime is the script text byte for byte.
const unsafe = [[/<\/script/i, '</script'], [/<!--/, '<!--'], [/\r/, 'CR'], [/\0/, 'NUL']]
  .filter(([pattern]) => pattern.test(runtime.toString('latin1'))).map(([, name]) => name);
if (unsafe.length) throw new Error(`runtime contains ${unsafe.join(', ')}; it cannot be inlined byte for byte`);

const name = path.basename(runtimeFile);
const OPEN = Buffer.from(`<script data-runtime="${name}">`);
const CLOSE = Buffer.from('</script>');
const EXTERNAL = Buffer.from(`<script src="./${name}"></script>`);
const html = fs.readFileSync(htmlFile);
const count = needle => { let found = 0; for (let at = html.indexOf(needle); at >= 0; at = html.indexOf(needle, at + 1)) found += 1; return found; };
const csp = html.toString('utf8').match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';
if (!/(^|;)\s*script-src [^;]*'unsafe-inline'/.test(csp)) throw new Error('the page CSP must allow inline scripts');

let head, tail, inline = null;
if (count(OPEN) === 1 && count(EXTERNAL) === 0) {
  const start = html.indexOf(OPEN) + OPEN.length;
  const end = html.indexOf(CLOSE, start);
  [head, inline, tail] = [html.subarray(0, start - OPEN.length), html.subarray(start, end), html.subarray(end + CLOSE.length)];
} else if (count(EXTERNAL) === 1 && count(OPEN) === 0) {
  const start = html.indexOf(EXTERNAL);
  [head, tail] = [html.subarray(0, start), html.subarray(start + EXTERNAL.length)];
} else {
  throw new Error(`expected exactly one runtime slot for ${name} in ${htmlFile}`);
}

const output = check ? html : Buffer.concat([head, OPEN, runtime, CLOSE, tail]);
if (check && !inline) throw new Error('the HTML still loads the runtime as a separate file');
if (!check) fs.writeFileSync(htmlFile, output);
const written = check ? inline : runtime;
const report = {
  mode: check ? 'check' : 'write', html: path.basename(htmlFile), runtime: name,
  runtimeBytes: runtime.length, runtimeSha256: sha256(runtime),
  inlineSha256: sha256(written), inlineMatchesRuntime: written.equals(runtime),
  htmlBytes: output.length, htmlSha256: sha256(output), htmlSha256LfNormalized: sha256(lf(output)),
  scriptSrc: csp.match(/script-src ([^;]*)/)?.[1] ?? null,
};
console.log(JSON.stringify(report));
if (!report.inlineMatchesRuntime) process.exitCode = 1;

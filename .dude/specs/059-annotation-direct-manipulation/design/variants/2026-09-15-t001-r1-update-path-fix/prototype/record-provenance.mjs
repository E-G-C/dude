// @ts-check
// Record what this design set is made of: every source-derived copy with its
// authoritative source revision and diff size, and every design-only artifact
// with its revision. The approval request at T002 needs these exact numbers.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_ROOT = path.resolve(HERE, '..');
const REPOSITORY_ROOT = path.resolve(DESIGN_ROOT, '..', '..', '..', '..');
const revision = file => `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

const COPIES = [
  ...['engine.mjs', 'geometry.mjs', 'shapes.mjs', 'inspector.mjs', 'panel.mjs', 'capture.mjs', 'bridge.mjs', 'styles.css', 'NOTICE.txt']
    .map(name => [`prototype/review/${name}`, `src/extensions/dude/ui/review/${name}`]),
  ...['review.jsx', 'needs-you.jsx', 'styles.js', 'theme.js', 'use-canvas-data.js']
    .map(name => [`prototype/frontend/${name}`, `src/extensions/dude/frontend/${name}`]),
];
const DESIGN_ONLY = [
  'review-direct-manipulation.html',
  'prototype/host.jsx', 'prototype/build-design-assets.mjs', 'prototype/fixture-driver.mjs',
  'prototype/serve-preview.mjs', 'prototype/record-provenance.mjs',
  'prototype/proof-harness.mjs', 'prototype/proof-direct-manipulation.mjs', 'prototype/proof-gestures.mjs',
  'prototype/proof-unavailable-cursor.mjs', 'prototype/verify-t001-adversarial.mjs',
  'prototype/assets/host.js', 'prototype/assets/host.js.LEGAL.txt',
  'fixtures/reviewed-content/mock.html', 'fixtures/reviewed-content/mock.css', 'fixtures/reviewed-content/logo.svg',
  'evidence/capability-declaration.md',
];

function numstat(source, design) {
  try {
    execFileSync('git', ['diff', '--no-index', '--numstat', source, design], { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
    return { added: 0, removed: 0 };
  } catch (error) {
    const [added, removed] = String(error.stdout ?? '').trim().split('\t');
    return { added: Number(added) || 0, removed: Number(removed) || 0 };
  }
}

const sourceDerived = COPIES.map(([design, source]) => {
  const designFile = path.join(DESIGN_ROOT, design), sourceFile = path.join(REPOSITORY_ROOT, source);
  const identical = revision(designFile) === revision(sourceFile);
  return { designPath: `design/${design}`, sourcePath: source,
    designRevision: revision(designFile), sourceRevision: revision(sourceFile),
    identical, diff: identical ? { added: 0, removed: 0 } : numstat(sourceFile, designFile) };
});

const generated = ['evidence', 'screenshots'].flatMap(directory => fs.readdirSync(path.join(DESIGN_ROOT, directory))
  .filter(name => name !== 'source-provenance.json' && name !== 'capability-declaration.md')
  .map(name => ({ path: `design/${directory}/${name}`, revision: revision(path.join(DESIGN_ROOT, directory, name)),
    bytes: fs.statSync(path.join(DESIGN_ROOT, directory, name)).size })));

const payload = {
  generatedAt: new Date().toISOString(),
  repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).trim(),
  canonicalEntrypoint: 'design/review-direct-manipulation.html',
  sourceDerivedCopies: sourceDerived,
  designOnlyArtifacts: DESIGN_ONLY.map(file => ({ path: `design/${file}`,
    revision: revision(path.join(DESIGN_ROOT, file)), bytes: fs.statSync(path.join(DESIGN_ROOT, file)).size })),
  retainedEvidence: generated,
};
const out = path.join(DESIGN_ROOT, 'evidence', 'source-provenance.json');
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
const changed = sourceDerived.filter(entry => !entry.identical);
process.stdout.write(`${sourceDerived.length} source-derived copies, ${changed.length} with exploratory differences `
  + `(+${changed.reduce((sum, entry) => sum + entry.diff.added, 0)}/-${changed.reduce((sum, entry) => sum + entry.diff.removed, 0)} lines)\n`);
process.stdout.write(`${payload.designOnlyArtifacts.length} design-only artifacts, ${generated.length} retained evidence files\n`);

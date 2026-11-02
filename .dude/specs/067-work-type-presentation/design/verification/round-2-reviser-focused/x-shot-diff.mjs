// Reviser check: pixel differences between the Tester's round 1 screenshots and the focused round 2 run.
// Usage: node x-shot-diff.mjs <round1 dir> <round2 dir> <strip height px>
import fs from 'node:fs';
import path from 'node:path';
import { decodePng } from './cdp.mjs';

const [before, after, stripArg] = process.argv.slice(2);
const strip = Number(stripArg ?? 36);
const rows = [];
for (const name of fs.readdirSync(after).filter(file => file.endsWith('.png')).sort()) {
  const old = path.join(before, name);
  if (!fs.existsSync(old)) { rows.push({ name, result: 'no round 1 counterpart' }); continue; }
  const a = decodePng(fs.readFileSync(old)), b = decodePng(fs.readFileSync(path.join(after, name)));
  if (a.width !== b.width || a.height !== b.height) { rows.push({ name, result: `size ${a.width}x${a.height} -> ${b.width}x${b.height}` }); continue; }
  let count = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = strip; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
    const i = (y * a.width + x) * 4;
    if (Math.abs(a.pixels[i] - b.pixels[i]) + Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) + Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 24) {
      count += 1; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  rows.push({ name, result: count ? `${count} px differ in [${x0},${y0}]-[${x1},${y1}]` : 'identical below the strip' });
}
for (const row of rows) console.log(`${row.name}: ${row.result}`);

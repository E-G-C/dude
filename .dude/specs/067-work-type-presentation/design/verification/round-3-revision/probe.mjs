// Bounded engineering self-check for L6, not the Tester's independent runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import * as C from '../round-2-independent/runner/cdp.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const design = path.resolve(out, '../..');
const repo = path.resolve(design, '../../../..');
const baseline = process.argv.includes('--baseline');
const phase = baseline ? 'before' : 'after';
const reportFile = path.join(out, baseline ? 'baseline-probe.json' : 'report.json');
if (fs.existsSync(reportFile)) throw new Error(`Refusing to overwrite ${reportFile}`);
const initial = JSON.parse(fs.readFileSync(path.join(out, 'preservation-before.json')));
const snapshot = JSON.parse(fs.readFileSync(path.join(design, 'source/repository-snapshot.json')));
const htmlFile = path.join(design, 'work-type-presentation.html');
const runtimeFile = path.join(design, 'work-type-presentation.js');
const html = fs.readFileSync(htmlFile);
const temp = path.join(out, `browser-temp-${phase}`);
fs.mkdirSync(temp);
process.env.TEMP = process.env.TMP = temp;
process.env.LOCALAPPDATA = process.env.APPDATA = temp;
const report = {
  author: 'Coder, bounded mock revision; original round 3 authored by Fluent UI.',
  scope: 'Engineering self-check of L6 and readable-empty 087; not independent verification or UI approval.',
  generatedAt: new Date().toISOString(), phase,
  baselineEvidence: {
    report: 'baseline-probe.json', source: 'probe-baseline.mjs',
    sourceSha256: C.sha256File(path.join(out, 'probe-baseline.mjs')),
    result: 'Four L6 assertions failed as reproduced. One additional probe assertion incorrectly expected empty Activity for 087, which actually has two dated events. That initial result is retained; this probe checks the events against the unchanged snapshot.',
  },
  subject: { html: C.sha256Bytes(html), runtime: C.sha256File(runtimeFile) },
  assertions: [], observations: [], cleanup: {}, fatal: null,
};
const check = (ok, message) => report.assertions.push({ pass: Boolean(ok), message });
let browser, server;
try {
  const text = html.toString('utf8');
  const inline = text.match(/<script data-runtime="work-type-presentation.js">([\s\S]*?)<\/script>/)?.[1];
  check(inline !== undefined && C.sha256Bytes(Buffer.from(inline)) === report.subject.runtime, 'Inline bytes match the raw runtime');
  check(!/<script\b[^>]*\bsrc\s*=/i.test(text), 'No external JavaScript');
  check(text.includes("connect-src 'none'"), 'Connections remain forbidden by CSP');
  check(fs.readFileSync(runtimeFile, 'utf8').startsWith('(()=>{'), 'Runtime remains a classic IIFE');
  browser = await C.launchBrowser(C.discoverBrowser(), temp);
  report.browser = browser.version.Browser;
  const { page } = browser;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__revisionCsp = []; addEventListener('securitypolicyviolation', event => window.__revisionCsp.push({ directive: event.violatedDirective, blocked: event.blockedURI }));" });
  const bases = [['file', pathToFileURL(htmlFile).href]];
  if (!baseline) {
    server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url.split('?')[0] !== '/revision/work-type-presentation.html') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    bases.push(['preview-host-replica', `http://browser-preview-local.localhost:${server.address().port}/revision/work-type-presentation.html`]);
  }
  for (const [host, base] of bases) {
    for (const [number, scenario, width, tone] of [['912', 'M1', 600, 'dark'], ['087', 'M3', 1440, 'light']]) {
      for (const key of ['console', 'exceptions', 'logs', 'requests', 'sockets']) page.state[key].length = 0;
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.send('Page.navigate', { url: `${base}?scenario=${scenario}&tone=${tone}&controls=hide` });
      await C.until(() => C.evalFn(page, number => number === '912'
        ? document.querySelectorAll('[data-work-path]').length === 13
        : document.querySelector('[data-now]')?.getAttribute('data-now') === '.dude/ideas/087-dude-canvas-routing-map.md', number), `render ${scenario}`);
      if (number === '912') {
        await C.clickSelector(page, '[data-work-path=".dude/ideas/912-export-history.md"]');
        await C.until(() => C.evalFn(page, () => document.querySelector('[data-now]')?.getAttribute('data-now') === '.dude/ideas/912-export-history.md'), '912 opens from its row');
      }
      const observed = await C.evalFn(page, () => {
        const now = document.querySelector('[data-now]');
        const norm = value => (value || '').replace(/\s+/g, ' ').trim();
        const section = title => [...now.querySelectorAll('section')].find(node => norm(node.querySelector('h2')?.textContent) === title);
        return {
          url: location.href, path: now.getAttribute('data-now'),
          stage: now.querySelector('[data-work-stage]')?.textContent,
          progress: norm(now.querySelector('[data-progress-report]')?.innerText),
          next: norm(now.querySelector('[data-now-next]')?.innerText),
          tasks: norm(section('Tasks')?.innerText), activity: norm(section('Activity')?.innerText),
          properties: norm(now.querySelector('aside details')?.innerText),
          counts: now.querySelectorAll('[role=progressbar], [data-task-key]').length,
          words: now.querySelectorAll('[data-classification]').length,
          csp: window.__revisionCsp,
          runtime: [...document.scripts].find(node => node.dataset.runtime)?.textContent,
        };
      });
      const executedHash = C.sha256Bytes(Buffer.from(observed.runtime || ''));
      delete observed.runtime;
      const label = `${host} ${number}`;
      check(executedHash === report.subject.runtime, `${label}: executed the bound inline runtime`);
      check(observed.counts === 0, `${label}: no invented task rows or count bar`);
      check(observed.words === 0, `${label}: no classification placeholders`);
      check(JSON.stringify(observed.csp) === '[]', `${label}: zero CSP violations`);
      check([...page.state.console, ...page.state.exceptions, ...page.state.logs].length === 0, `${label}: zero browser errors or warnings`);
      check(page.state.requests.every(req => req.type === 'Document') && page.state.requests.length === 1 && page.state.sockets.length === 0, `${label}: only the HTML document was requested`);
      if (number === '912') {
        const unavailable = /unavailable|couldn.t be read|could not be read|withheld/i;
        check(/Task progress and detail are withheld/.test(observed.next), `${label}: existing withheld notice retained`);
        check(!/No (?:canonical )?tasks are recorded/i.test(observed.tasks), `${label}: Tasks makes no false absence claim`);
        check(unavailable.test(observed.tasks), `${label}: Tasks says unavailable`);
        check(!/No dated activity is recorded/i.test(observed.activity), `${label}: Activity makes no false absence claim`);
        check(unavailable.test(observed.activity), `${label}: Activity says unavailable`);
        check(observed.stage === 'Stage unavailable' && /Unavailable.*couldn.t be read, so its stage is unknown/.test(observed.progress), `${label}: genuine stage unavailability retained`);
        check(/Progress not established/.test(observed.properties), `${label}: genuine progress unavailability retained`);
      } else {
        check(observed.stage === 'Captured', `${label}: readable draft remains Captured`);
        check(observed.tasks === 'Tasks Read only No tasks are recorded for this work item.', `${label}: legitimate empty Tasks copy unchanged`);
        check(!/unavailable|withheld|couldn.t be read/i.test(observed.tasks), `${label}: empty Tasks is not called unavailable`);
        const events = snapshot.details['.dude/ideas/087-dude-canvas-routing-map.md'].activity.recent;
        const activity = `Activity ${events.map(event => `${event.date} ${event.text}`).join(' ')} Activity is separate from task verification and review results.`;
        check(observed.activity === activity, `${label}: actual recorded Activity unchanged`);
      }
      const shot = path.join(design, 'screenshots/round-3-revision', `${phase}-${number}-${host}.png`);
      fs.writeFileSync(shot, await C.screenshot(page), { flag: 'wx' });
      report.observations.push({ host, number, ...observed, executedHash, screenshot: path.relative(design, shot).split(path.sep).join('/'), screenshotSha256: C.sha256File(shot) });
    }
  }
  const changes = [];
  for (const [file, expected] of Object.entries(initial.existingDesign)) {
    const current = path.join(design, file);
    if (!fs.existsSync(current) || C.sha256File(current) !== expected.sha256) changes.push(file);
  }
  const expectedChanges = baseline ? [] : ['source/work-type-presentation.jsx', 'work-type-presentation.html', 'work-type-presentation.js'];
  check(JSON.stringify(changes.sort()) === JSON.stringify(expectedChanges.sort()), 'Only the two mock artifacts and affected mock source changed; every other pre-existing design file is unchanged');
  report.preservation = { changed: changes, protected: {} };
  for (const [root, expected] of Object.entries(initial.protectedDigests)) {
    const files = C.manifest(repo, [root]);
    const current = { files: files.size, digest: C.manifestDigest(files) };
    report.preservation.protected[root] = current;
    check(JSON.stringify(current) === JSON.stringify(expected), `${root}: unchanged (excluding installed node_modules)`);
  }
  for (const [file, expected] of Object.entries(initial.expected)) {
    check(C.sha256File(path.join(design, 'variants/round-3-before-unavailable-fix', file)) === expected, `Preserved initial byte copy: ${file}`);
  }
} catch (error) {
  report.fatal = error.stack || String(error);
} finally {
  if (browser) {
    report.cleanup.browser = await C.shutdownBrowser(browser);
    check(!report.cleanup.browser.inventoryError && report.cleanup.browser.survivorsAfter.length === 0 && report.cleanup.browser.profileRemoved, 'Owned browser processes and profile cleaned up');
  }
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    report.cleanup.replicaClosed = true;
  }
  if (!browser || report.cleanup.browser.profileRemoved) fs.rmSync(temp, { recursive: true });
  report.cleanup.tempRemoved = !fs.existsSync(temp);
  check(report.cleanup.tempRemoved, 'Owned temporary directory removed');
  report.counts = { assertions: report.assertions.length, failed: report.assertions.filter(entry => !entry.pass).length };
  report.result = report.fatal || report.counts.failed ? 'FAIL' : 'PASS';
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ phase, result: report.result, ...report.counts, failures: report.assertions.filter(entry => !entry.pass), fatal: report.fatal, subject: report.subject, cleanup: report.cleanup }, null, 2));
  process.exitCode = report.result === 'PASS' ? 0 : 1;
}

// Reviser probe (not part of the Tester's runner digest: x- prefix). Records how the capture
// statuses reach assistive technology during a real Submit: document.ariaNotify calls (the path
// Fluent's AriaLiveAnnouncer takes when the browser supports it) and the text of DOM live regions
// ([aria-live], [role=status], [role=alert], mock strip excluded), the same selector the Tester uses.
// Usage: node x-announce-probe.mjs --html <work-type-presentation.html> --temp <dir for the browser profile>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverBrowser, launchBrowser, shutdownBrowser, evalFn, clickSelector, sleep, until } from './cdp.mjs';
import { chooseOption } from './harness.mjs';
import * as P from './probes.mjs';

const argv = process.argv.slice(2);
const arg = name => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : null; };
const html = path.resolve(arg('html'));
const tempRoot = path.resolve(arg('temp'));
const INIT = `(() => {
  window.__notify = [];
  window.__ariaNotifyType = typeof Document.prototype.ariaNotify;
  const proto = Document.prototype;
  if (typeof proto.ariaNotify === 'function') {
    const original = proto.ariaNotify;
    proto.ariaNotify = function (message, options) {
      window.__notify.push({ message: String(message).replace(/\\s+/g, ' ').trim(), priority: options && options.priority || null });
      return original.call(this, message, options);
    };
  }
})();`;

const ctx = await launchBrowser(discoverBrowser(), tempRoot);
const results = { browser: ctx.version?.Browser ?? null, html, outcomes: {} };
try {
  const { page } = ctx;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const env = { page, waitFor: (probe, description, timeout = 8000) => until(() => evalFn(page, probe), description, timeout, 40) };
  // The same outcomes and choices as the Tester's real-submit transitions (checks-capture.mjs).
  const CHOICES = { saved: ['Fix', 'Code'], kept: ['Maintain', 'Code'], missing: ['Fix', 'Code'], uncertain: ['Fix', 'Code'], refused: ['Explore', 'Video'] };
  for (const outcome of ['saved', 'kept', 'missing', 'uncertain', 'refused']) {
    await evalFn(page, P.mark).catch(() => {});
    await page.send('Page.navigate', { url: `${pathToFileURL(html).href}?scenario=M12-default&tone=light&controls=hide&next=${outcome}` });
    await until(() => evalFn(page, P.probeReady), `render ${outcome}`, 20000);
    await evalFn(page, P.settle);
    await evalFn(page, () => {
      window.__notify.length = 0;
      window.__live = [];
      const seen = () => {
        for (const node of document.querySelectorAll('[aria-live], [role=status], [role=alert]')) {
          if (node.closest('#mock-strip')) continue;
          const text = node.textContent.replace(/\s+/g, ' ').trim();
          if (text && !window.__live.includes(text)) window.__live.push(text);
        }
      };
      new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, characterData: true });
      return true;
    });
    await clickSelector(page, '[data-capture-form] textarea');
    await page.send('Input.insertText', { text: 'The export button is hidden on small screens.' });
    await chooseOption(env, 'intent', CHOICES[outcome][0]);
    await chooseOption(env, 'domain', CHOICES[outcome][1]);
    await evalFn(page, () => { window.__notify.length = 0; window.__live.length = 0; return true; });
    await clickSelector(page, '[data-capture-form] button', { text: 'Submit' });
    await sleep(2600);
    results.outcomes[outcome] = await evalFn(page, () => ({
      ariaNotifyType: window.__ariaNotifyType,
      ariaNotify: window.__notify.map(entry => `${entry.priority}: ${entry.message.slice(0, 110)}`),
      domLive: window.__live.map(text => text.slice(0, 110)),
      liveRegions: [...document.querySelectorAll('[data-capture-form] [role=status], [data-capture-form] [aria-live]')]
        .map(node => `${node.getAttribute('role')}/${node.getAttribute('aria-live')}/${node.getAttribute('aria-atomic')}: ${node.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`),
      notices: [...document.querySelectorAll('[data-capture-form] .fui-MessageBar')]
        .map(node => `${node.getAttribute('role')}: ${node.querySelector('.fui-MessageBarTitle')?.textContent ?? ''}`),
    }));
  }
} finally {
  const cleanup = await shutdownBrowser(ctx);
  results.cleanup = { owned: cleanup.ownedBefore.map(proc => proc.pid), closedGracefully: cleanup.closedGracefully,
    killed: cleanup.killed, survivors: cleanup.survivorsAfter, profileRemoved: cleanup.profileRemoved };
}
console.log(JSON.stringify(results, null, 1));

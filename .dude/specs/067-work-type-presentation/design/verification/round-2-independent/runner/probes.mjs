// In-page probes. Every export is a self-contained function that is serialized with toString()
// and evaluated in the page under test. They only read the DOM (the contrast helpers add and remove
// one temporary <style> element). Nothing here is product code.

export const NET_PROBE_SOURCE = `(() => {
  const counters = window.__netProbe = { fetch: 0, fetchRejected: 0, fetchResolved: 0, xhr: 0, beacon: 0, websocket: 0, eventsource: 0, urls: [] };
  const note = value => { if (counters.urls.length < 20) counters.urls.push(String(value && value.url || value).slice(0, 120)); };
  let current = window.fetch;
  const wrap = original => function (...args) {
    counters.fetch += 1; note(args[0]);
    const result = original.apply(this, args);
    Promise.resolve(result).then(() => { counters.fetchResolved += 1; }, () => { counters.fetchRejected += 1; });
    return result;
  };
  current = wrap(current);
  Object.defineProperty(window, 'fetch', { configurable: true, get() { return current; }, set(value) { current = wrap(value); } });
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) { counters.xhr += 1; note(args[1]); return open.apply(this, args); };
  if (navigator.sendBeacon) { const beacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (...args) => { counters.beacon += 1; note(args[0]); return beacon(...args); }; }
  const Socket = window.WebSocket; window.WebSocket = function (...args) { counters.websocket += 1; note(args[0]); return new Socket(...args); }; window.WebSocket.prototype = Socket.prototype;
  const Source = window.EventSource; if (Source) { window.EventSource = function (...args) { counters.eventsource += 1; note(args[0]); return new Source(...args); }; }
})();`;

export const probeReady = () => document.readyState === 'complete' && Boolean(document.querySelector('[role=tabpanel]:not([hidden]) *'))
  && window.__v === undefined;

export const mark = () => { window.__v = 1; return true; };

export const settle = async () => {
  for (let index = 0; index < 60 && document.getAnimations().length; index += 1) await new Promise(resolve => setTimeout(resolve, 25));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return document.getAnimations().length;
};

export const netCounters = () => window.__netProbe ?? null;

export const probeLayout = async () => {
  const section = document.querySelector('[data-work-layout]');
  if (!section) return null;
  const contentWidth = await new Promise(resolve => {
    const observer = new ResizeObserver(([entry]) => { observer.disconnect(); resolve(entry.contentRect.width); });
    observer.observe(section);
    setTimeout(() => { observer.disconnect(); resolve(null); }, 1000);
  });
  return { layout: section.getAttribute('data-work-layout'), contentWidth, borderBoxWidth: section.getBoundingClientRect().width,
    page: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
};

export const probeRows = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const lines = element => (element?.innerText || '').split('\n').map(norm).filter(Boolean);
  return [...document.querySelectorAll('[data-work-path]')].map(row => {
    const number = row.querySelector('[data-work-number]');
    const kids = number?.nextElementSibling ? [...number.nextElementSibling.children] : [];
    const classification = row.querySelector('[data-work-classification]');
    const stage = row.querySelector('[data-work-stage]');
    const cells = [...row.querySelectorAll('[role=gridcell]')];
    const box = row.getBoundingClientRect();
    return {
      path: row.getAttribute('data-work-path'), tag: row.tagName, role: row.getAttribute('role'), aria: row.getAttribute('aria-label'),
      current: row.getAttribute('aria-current'), number: norm(number?.textContent), title: norm(kids[0]?.textContent),
      slug: norm(kids[kids.length - 1]?.textContent), classification: classification ? norm(classification.textContent) : null,
      stageAttr: stage?.getAttribute('data-work-stage') ?? null, stageLines: lines(stage), cells: cells.map(cell => lines(cell)),
      lines: lines(row), height: box.height, top: box.top,
    };
  });
};

export const probeCommands = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const bar = document.querySelector('header');
  const visible = element => element.getClientRects().length > 0;
  const controls = [...bar.querySelectorAll('button, input, select, textarea, [role=combobox], [role=button], a[href]')].filter(visible)
    .map(element => ({ tag: element.tagName, type: element.getAttribute('type'), role: element.getAttribute('role'),
      name: element.getAttribute('aria-label') || norm(element.textContent) || element.getAttribute('placeholder') || '' }));
  const workingOn = bar.querySelector('[role=group]');
  const columnHeaders = [...document.querySelectorAll('[role=columnheader]')].map(header => norm(header.textContent));
  const search = bar.querySelector('input');
  return { controls, columnHeaders, workingOn: workingOn ? { label: workingOn.getAttribute('aria-label'), text: norm(workingOn.innerText) } : null,
    searchValue: search ? search.value : null, searchFocused: Boolean(search && document.activeElement === search),
    scopeText: norm(bar.querySelector('[role=combobox]')?.textContent),
    summary: norm(document.querySelector('[data-work-layout] [role=status]')?.textContent),
    noMatch: Boolean([...document.querySelectorAll('[data-work-layout] span')].find(span => norm(span.textContent) === 'No matching work')),
    fallbackNotice: norm(document.querySelector('[data-work-layout] .fui-MessageBar')?.textContent) };
};

export const probeStrip = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const strip = document.querySelector('#mock-strip');
  if (!strip) return null;
  const box = strip.getBoundingClientRect();
  return { text: norm(strip.innerText), rect: [box.x, box.y, box.width, box.height], log: norm(strip.querySelector('.mock-log')?.textContent),
    selects: Object.fromEntries([...strip.querySelectorAll('select')].map(select => [select.getAttribute('data-mock-control'), select.value])) };
};

export const probeProductText = (recordedContent = true) => {
  const root = document.querySelector('header').parentElement;
  // Recorded content (titles, task text, activity, captured description, blocker reasons) is data, not Canvas wording.
  const recordedSelector = '[data-task-key], [data-task-detail], [data-now-next], [data-task-instruction], [data-now] h1, [data-work-path], details p';
  const isRecorded = element => {
    if (!recordedContent) return false;
    if (element.closest(recordedSelector)) return true;
    const section = element.closest('section');
    const heading = section?.querySelector('h2')?.textContent;
    return Boolean(element.closest('p') && ['Activity', 'Recorded blockers'].includes(heading));
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const byParent = new Map();
  let node;
  while ((node = walker.nextNode())) {
    const element = node.parentElement;
    if (!element || !node.nodeValue.trim() || element.closest('[data-mock-note], script, style, noscript') || isRecorded(element)) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    byParent.set(element, (byParent.get(element) ?? '') + node.nodeValue); // React splits "{n} closed work items" into several text nodes
  }
  const texts = [...byParent.values()].map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const labels = [...root.querySelectorAll('[aria-label]')].filter(element => !isRecorded(element)).map(element => element.getAttribute('aria-label')).filter(Boolean);
  const titles = [...root.querySelectorAll('[title]')].filter(element => !isRecorded(element)).map(element => element.getAttribute('title')).filter(Boolean);
  return { texts, labels, titles };
};

export const probeNow = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const lines = element => (element?.innerText || '').split('\n').map(norm).filter(Boolean);
  const now = document.querySelector('[data-now]');
  if (!now) return null;
  const header = now.querySelector('header');
  const facts = Object.fromEntries([...now.querySelectorAll('dl[data-classification] > div')]
    .map(entry => [norm(entry.querySelector('dt')?.textContent), norm(entry.querySelector('dd')?.textContent)]));
  const report = [...now.querySelectorAll('[data-report-row]')].map(entry => {
    const dd = entry.querySelector('dd');
    const kids = dd ? [...dd.children] : [];
    return { label: entry.getAttribute('data-report-row'), value: norm(kids[0]?.textContent),
      items: kids[0] ? [...kids[0].querySelectorAll('li')].map(item => norm(item.textContent)) : [],
      rest: kids.slice(1).map(kid => norm(kid.textContent)), empty: !norm(dd?.textContent) };
  });
  const progress = now.querySelector('[data-progress-report]');
  const heading = text => [...now.querySelectorAll('h2')].find(h => norm(h.textContent) === text);
  const blockersSection = heading('Recorded blockers')?.closest('section');
  const taskDetail = now.querySelector('[data-task-detail]');
  const interactive = header ? [...header.querySelectorAll('button, a[href], input, select, textarea, [role=combobox], [role=button], [contenteditable]')]
    .map(element => ({ tag: element.tagName, role: element.getAttribute('role'), name: element.getAttribute('aria-label') || norm(element.textContent),
      handle: element.getAttribute('data-request-entry') || element.getAttribute('data-review-entry') })) : [];
  const box = now.getBoundingClientRect();
  return {
    path: now.getAttribute('data-now'), title: norm(now.querySelector('h1')?.textContent), eyebrow: norm(header?.querySelector('span')?.textContent),
    facts, factsLabel: now.querySelector('dl[data-classification]')?.getAttribute('aria-label') ?? null,
    correction: norm(now.querySelector('[data-correction]')?.textContent), headerText: lines(header), interactive, report,
    unknown: [...now.querySelectorAll('[data-report-unknown]')].map(entry => norm(entry.textContent)),
    reportLines: lines(progress), reportParagraphs: progress ? [...progress.querySelectorAll('p')].map(p => norm(p.textContent)) : [],
    blockers: blockersSection ? lines(blockersSection) : null,
    nextText: lines(now.querySelector('[data-now-next]')),
    taskPhases: [...now.querySelectorAll('[data-task-phase]')].map(group => ({ heading: group.getAttribute('data-task-phase'),
      count: norm(group.querySelector('div > span')?.textContent), tasks: group.querySelectorAll('[data-task-key]').length })),
    taskDetail: taskDetail ? { key: taskDetail.getAttribute('data-task-detail'), docked: Boolean(taskDetail.closest('aside')),
      inFlow: Boolean(taskDetail.closest('li')), text: lines(taskDetail) } : null,
    aside: lines(now.querySelector('aside')), requestEntry: now.querySelector('[data-request-entry]')?.getAttribute('data-request-entry') ?? null,
    reviewEntry: now.querySelector('[data-review-entry]')?.getAttribute('data-review-entry') ?? null,
    editables: now.querySelectorAll('input, select, textarea, [contenteditable=true], [role=combobox]').length,
    rect: [box.x, box.y, box.width, box.height],
  };
};

export const probeCapture = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const form = document.querySelector('[data-capture-form]');
  if (!form) return null;
  const textarea = form.querySelector('textarea');
  const choice = field => {
    const button = form.querySelector(`[data-capture-choice="${field}"]`);
    return button ? { text: norm(button.textContent), value: button.getAttribute('value'), role: button.getAttribute('role'),
      expanded: button.getAttribute('aria-expanded'), disabled: button.disabled } : null;
  };
  const actions = [...form.querySelectorAll('button')].filter(button => !button.matches('.fui-Dropdown__button, .fui-Dropdown__clearButton'))
    .map(button => ({ text: norm(button.textContent), disabled: button.disabled || button.getAttribute('aria-disabled') === 'true' }));
  const notices = [...form.querySelectorAll('.fui-MessageBar')].map(entry => {
    const title = norm(entry.querySelector('.fui-MessageBarTitle')?.textContent);
    const body = norm(entry.querySelector('.fui-MessageBarBody')?.textContent);
    return { title, text: body.startsWith(title) ? body.slice(title.length).trim() : body };
  });
  const saved = form.querySelector('[data-capture-saved]');
  return { text: textarea ? textarea.value : null, intent: choice('intent'), domain: choice('domain'), actions, notices,
    savedLines: saved ? [...saved.children].map(child => norm(child.textContent)) : null,
    labels: [...form.querySelectorAll('label')].map(label => norm(label.textContent)),
    validation: norm(form.querySelector('[role=alert], .fui-Field__validationMessage')?.textContent),
    copy: norm(form.innerText), live: [...document.querySelectorAll('[aria-live]')].map(region => norm(region.textContent)).filter(Boolean) };
};

export const hasListbox = () => [...document.querySelectorAll('[role=listbox] [role=option]')].some(option => option.getClientRects().length > 0);

export const listboxProbe = () => {
  const listbox = [...document.querySelectorAll('[role=listbox]')].find(node => node.getClientRects().length);
  if (!listbox) return null;
  const box = listbox.getBoundingClientRect();
  const options = [...listbox.querySelectorAll('[role=option]')].map(option => ({ text: (option.textContent || '').trim(),
    selected: option.getAttribute('aria-selected') === 'true', icon: Boolean(option.querySelector('svg')) }));
  return { rect: [box.x, box.y, box.width, box.height].map(Math.round), inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, options };
};

export const listboxOptions = () => [...document.querySelectorAll('[role=listbox] [role=option]')]
  .filter(option => option.getClientRects().length).map(option => ({ text: (option.textContent || '').trim(),
    selected: option.getAttribute('aria-selected') === 'true' }));

export const activeDescriptor = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  // Fluent paints the focus indicator on the field wrapper, not on the inner input element
  const frame = element.closest('.fui-Input, .fui-Textarea, .fui-Dropdown') ?? element;
  const box = frame.getBoundingClientRect();
  return { tag: element.tagName, role: element.getAttribute('role'), path: element.getAttribute('data-work-path'),
    label: element.getAttribute('aria-label') || norm(element.textContent).slice(0, 80), id: element.id || null,
    rect: [box.x, box.y, box.width, box.height], inViewport: box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth,
    visibleFocus: element.matches(':focus-visible') };
};

export const obscuredCheck = () => {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const box = element.getBoundingClientRect();
  const x = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)));
};

export const hideText = () => {
  const style = document.createElement('style');
  style.id = '__verify_hide_text';
  style.textContent = '*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;caret-color:transparent !important}'
    + '::placeholder{color:transparent !important;-webkit-text-fill-color:transparent !important}';
  document.head.append(style);
  return true;
};
export const showText = () => { document.getElementById('__verify_hide_text')?.remove(); return true; };

export const probeGeometry = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const root = document.querySelector('header').parentElement;
  const areaOf = element => element.closest('[data-work-path]') ? 'row' : element.closest('[data-progress-report]') ? 'report'
    : element.closest('[data-capture-form]') ? 'capture' : element.closest('[data-now]') ? 'now' : element.closest('header') ? 'commands'
      : element.closest('nav') ? 'rail' : element.closest('footer') ? 'footer' : element.closest('aside') ? 'aside' : 'other';
  const visible = element => element.getClientRects().length > 0 && element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  const describe = element => `${element.tagName.toLowerCase()}${element.getAttribute('data-work-path') ? '[row]' : ''}:${norm(element.textContent).slice(0, 50)}`;
  const clipped = [], offscreen = [], hscroll = [], small = [];
  let scanned = 0;
  for (const element of root.querySelectorAll('*')) {
    if (!visible(element)) continue;
    scanned += 1;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const hasText = Boolean(norm(element.textContent));
    if (box.width <= 1 || box.height <= 1) continue; // visually hidden text
    if (hasText && ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
      clipped.push({ kind: 'overflow-x', area: areaOf(element), el: describe(element), sw: element.scrollWidth, cw: element.clientWidth });
    }
    if (hasText && ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
      clipped.push({ kind: 'overflow-y', area: areaOf(element), el: describe(element), sh: element.scrollHeight, ch: element.clientHeight });
    }
    if (hasText && style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1) {
      clipped.push({ kind: 'ellipsis', area: areaOf(element), el: describe(element), sw: element.scrollWidth, cw: element.clientWidth });
    }
    if (['auto', 'scroll'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
      hscroll.push({ area: areaOf(element), el: describe(element), sw: element.scrollWidth, cw: element.clientWidth });
    }
    if (hasText && (box.right > innerWidth + 1 || box.left < -1)) {
      let scroller = false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(parentStyle.overflowX)) { const parentBox = parent.getBoundingClientRect(); if (parentBox.right <= innerWidth + 1) { scroller = true; break; } }
      }
      if (!scroller) offscreen.push({ area: areaOf(element), el: describe(element), left: Math.round(box.left), right: Math.round(box.right) });
    }
    if (element.matches('button, a[href], input, select, textarea, [role=combobox], [role=tab], summary, [data-work-path]')
      && !element.matches('[disabled]') && !element.closest('#mock-strip')) {
      if (Math.min(box.width, box.height) < 24) small.push({ area: areaOf(element), el: describe(element), w: Math.round(box.width), h: Math.round(box.height) });
    }
  }
  const scrollers = [document.documentElement, document.body].map(node => ({ sw: node.scrollWidth, cw: node.clientWidth }));
  return { viewport: [innerWidth, innerHeight, devicePixelRatio], page: scrollers[0], body: scrollers[1], scanned,
    clipped: clipped.slice(0, 40), offscreen: offscreen.slice(0, 40), hscroll: hscroll.slice(0, 40), small: small.slice(0, 60) };
};

export const probeTextSamples = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = css => {
    context.clearRect(0, 0, 1, 1); context.fillStyle = '#000'; context.fillStyle = css; context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  };
  const clipRect = (element, rect) => {
    const original = (rect.right - rect.left) * (rect.bottom - rect.top);
    let [left, top, right, bottom] = [rect.left, rect.top, rect.right, rect.bottom];
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
    for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const box = parent.getBoundingClientRect();
        if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
    }
    const width = right - left, height = bottom - top;
    // text that is mostly clipped by a scroller is not visibly rendered: sampling its sliver would read the neighbouring border instead
    return width >= 2 && height >= 2 && (original <= 0 || (width * height) / original >= 0.7) ? [left, top, width, height] : null;
  };
  const opacityOf = element => { let value = 1; for (let node = element; node && node.nodeType === 1; node = node.parentElement) value *= Number(getComputedStyle(node).opacity); return value; };
  const baseBackground = element => {
    const layers = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const color = rgba(getComputedStyle(node).backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
    }
    let result = [255, 255, 255];
    const root = rgba(getComputedStyle(document.documentElement).backgroundColor);
    if (root[3] > 0) result = root.slice(0, 3).map((value, index) => value * root[3] + 255 * (1 - root[3]));
    for (const layer of layers.reverse()) result = result.map((value, index) => layer[index] * layer[3] + value * (1 - layer[3]));
    return result;
  };
  const region = element => element.closest('#mock-strip') ? 'strip' : element.closest('[role=listbox]') ? 'popup' : 'product';
  const samples = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const element = node.parentElement;
    if (!element || element.closest('script, style, noscript, option, title') || !element.checkVisibility({ checkVisibilityCSS: true })) continue;
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(node);
    const fg = rgba(style.color);
    const effectiveOpacity = opacityOf(element);
    const bgComputed = baseBackground(element);
    const disabled = Boolean(element.closest('button[disabled], [aria-disabled="true"], fieldset[disabled]'));
    const size = parseFloat(style.fontSize), weight = Number(style.fontWeight) || 400;
    for (const rect of range.getClientRects()) {
      const clipped = clipRect(element, rect);
      if (!clipped) continue;
      samples.push({ t: text.slice(0, 48), fg, op: effectiveOpacity, fs: size, fw: weight, rect: clipped, region: region(element), disabled, bgc: bgComputed, kind: 'text' });
      if (samples.length >= 900) break;
    }
    if (samples.length >= 900) break;
  }
  for (const field of document.querySelectorAll('input:not([type=hidden]), textarea')) {
    if (!field.checkVisibility({ checkVisibilityCSS: true }) || field.closest('#mock-strip')) continue;
    const style = getComputedStyle(field);
    const value = field.value || field.getAttribute('placeholder') || '';
    if (!value) continue;
    const placeholder = !field.value;
    const color = rgba(placeholder ? getComputedStyle(field, '::placeholder').color : style.color);
    const box = field.getBoundingClientRect();
    const clipped = clipRect(field, { left: box.left + 4, top: box.top + 4, right: box.right - 4, bottom: Math.min(box.bottom - 4, box.top + 4 + parseFloat(style.lineHeight || '20')) });
    if (clipped) samples.push({ t: `${field.tagName.toLowerCase()} ${placeholder ? 'placeholder' : 'value'}: ${value.slice(0, 30)}`, fg: color, op: opacityOf(field),
      fs: parseFloat(style.fontSize), fw: Number(style.fontWeight) || 400, rect: clipped, region: region(field), disabled: field.disabled, bgc: baseBackground(field), kind: 'field-text' });
  }
  return samples;
};

export const probeControls = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const clipped = (element, rect) => {
    let [left, top, right, bottom] = [rect.left, rect.top, rect.right, rect.bottom];
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
    for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const box = parent.getBoundingClientRect();
        if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
    }
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  };
  const out = [];
  let skipped = 0;
  for (const element of document.querySelectorAll('input:not([type=hidden]), textarea, [role=combobox], button')) {
    if (!element.checkVisibility({ checkVisibilityCSS: true }) || element.closest('#mock-strip')) continue;
    const kind = element.matches('input, textarea') ? 'field' : element.matches('[role=combobox]') ? 'dropdown' : 'button';
    const boundary = kind === 'button' ? element : element.closest('.fui-Input, .fui-Textarea, .fui-Dropdown') || element;
    const style = getComputedStyle(boundary);
    const box = boundary.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    // sample only controls that are fully on screen, so the edge pixels belong to this control
    if (clipped(boundary, box) < box.width * box.height * 0.98) { skipped += 1; continue; }
    out.push({ kind, name: element.getAttribute('aria-label') || norm(element.textContent).slice(0, 40) || element.getAttribute('placeholder') || element.tagName,
      rect: [box.left, box.top, box.width, box.height], border: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(style[`border${side}Width`])),
      bg: style.backgroundColor, disabled: Boolean(element.closest('[disabled], [aria-disabled="true"]')), appearance: element.className.includes('Primary') ? 'primary' : null });
  }
  return { controls: out, skipped };
};

export const scrollerInfo = () => {
  const candidates = [...document.querySelectorAll('*')].filter(element => {
    const style = getComputedStyle(element);
    return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 4 && element.clientHeight > 80
      && !element.closest('#mock-strip') && element.checkVisibility({ checkVisibilityCSS: true });
  });
  candidates.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
  const top = candidates[0];
  document.querySelectorAll('[data-verify-scroller]').forEach(element => element.removeAttribute('data-verify-scroller'));
  if (!top) return null;
  top.setAttribute('data-verify-scroller', '1');
  return { scrollHeight: top.scrollHeight, clientHeight: top.clientHeight, scrollTop: top.scrollTop, tag: top.tagName, label: top.getAttribute('aria-label') || top.getAttribute('role') || top.className.slice(0, 20) };
};
export const scrollTo = top => { const element = document.querySelector('[data-verify-scroller]'); if (!element) return null; element.scrollTop = top; return element.scrollTop; };

export const pageBackground = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const read = element => { context.clearRect(0, 0, 1, 1); context.fillStyle = '#000'; context.fillStyle = getComputedStyle(element).backgroundColor; context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data; return [data[0], data[1], data[2], data[3]]; };
  return { html: read(document.documentElement), body: read(document.body), tone: document.documentElement.dataset.mockTone ?? null,
    followAttr: document.documentElement.getAttribute('data-dude-follow-app-theme'), themeTone: document.documentElement.getAttribute('data-theme-tone'),
    scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
};

export const taggedFocusables = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex], [role=combobox], [role=tab], [role=row], [role=option]')]
    .filter(element => element.checkVisibility({ checkVisibilityCSS: true }) && !element.closest('#mock-strip') && element.getAttribute('aria-hidden') !== 'true'
      && !(element.tagName === 'I' && element.hasAttribute('data-tabster-dummy')))
    .map(element => ({ tag: element.tagName, role: element.getAttribute('role'), tabindex: element.getAttribute('tabindex'),
      name: element.getAttribute('aria-label') || norm(element.textContent).slice(0, 60), labelledby: element.getAttribute('aria-labelledby') }));
};

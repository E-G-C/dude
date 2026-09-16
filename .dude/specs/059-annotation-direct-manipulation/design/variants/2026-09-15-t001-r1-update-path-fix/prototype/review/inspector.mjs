// Adapted from Sharpie. Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
/**
 * Animated image frames are not represented by DOM geometry. Refuse those
 * sources rather than call a fresh first frame the user's reviewed pixels.
 * Shared by the file boundary and inline-image inspection in both DOM worlds.
 */
export function imageIsStatic(bytes) {
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  const le32 = i => (bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536 + bytes[i + 3] * 16777216);
  const be32 = i => (bytes[i] * 16777216 + bytes[i + 1] * 65536 + bytes[i + 2] * 256 + bytes[i + 3]);
  if (bytes[0] === 137 && ascii(1, 3) === 'PNG') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = be32(offset), kind = ascii(offset + 4, 4);
      if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') return false;
      if (offset + length + 12 > bytes.length) return false;
      if (kind === 'IEND') return true;
      offset += length + 12;
    }
    return false;
  }
  if (ascii(0, 3) === 'GIF') {
    let offset = 13 + ((bytes[10] & 128) ? 3 * (2 << (bytes[10] & 7)) : 0), frames = 0;
    const skipBlocks = () => {
      while (offset < bytes.length) {
        const length = bytes[offset++];
        if (!length) return true;
        offset += length;
      }
      return false;
    };
    while (offset < bytes.length) {
      const kind = bytes[offset++];
      if (kind === 0x3b) return frames === 1;
      if (kind === 0x21) { offset++; if (!skipBlocks()) return false; }
      else if (kind === 0x2c) {
        if (++frames > 1 || offset + 9 > bytes.length) return false;
        const flags = bytes[offset + 8];
        offset += 9 + ((flags & 128) ? 3 * (2 << (flags & 7)) : 0) + 1;
        if (!skipBlocks()) return false;
      } else return false;
    }
    return false;
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(offset, 4), length = le32(offset + 4);
      if (kind === 'ANIM' || kind === 'ANMF' || kind === 'VP8X' && (bytes[offset + 8] & 2)) return false;
      if (offset + length + 8 > bytes.length) return false;
      offset += length + 8 + length % 2;
    }
    return offset === bytes.length;
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return true; // JPEG
  const svg = new TextDecoder().decode(bytes);
  return /<svg[\s>]/i.test(svg)
    && !/<\s*(?:animate\w*|set|discard|script|foreignObject)(?=[\s/>])/i.test(svg)
    && !/\banimation(?:-[a-z]+)?\s*:/i.test(svg);
}

/** The same closed scroll-record boundary is used by storage and both DOM worlds. */
export function validScrolls(value) {
  if (!Array.isArray(value) || value.length > 2000) return false;
  const selectors = new Set();
  for (const s of value) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length !== 3
      || typeof s.selector !== 'string' || !s.selector.trim() || s.selector.length > 1024
      || new TextEncoder().encode(s.selector).length > 1024
      || /[\u0000-\u001f\u007f]/u.test(s.selector) || selectors.has(s.selector)
      || !Number.isFinite(s.scrollLeft) || Math.abs(s.scrollLeft) > 1000000
      || !Number.isFinite(s.scrollTop) || s.scrollTop < 0 || s.scrollTop > 1000000) return false;
    selectors.add(s.selector);
  }
  return new TextEncoder().encode(JSON.stringify(value)).length <= 512 * 1024;
}

/**
 * Self-contained so capture can run it in a CDP isolated world with native DOM
 * APIs, independently of the untrusted document's bridge and JavaScript realm.
 */
export function createInspector(doc, win, staticImage = imageIsStatic, checkScrolls = validScrolls) {
  const STYLE_KEYS = ['color', 'background-color', 'background-image', 'font-family', 'font-size',
    'font-weight', 'line-height', 'letter-spacing', 'text-align', 'display', 'position', 'width',
    'height', 'margin', 'padding', 'gap', 'border', 'border-radius', 'opacity', 'transform',
    'visibility', 'overflow', 'clip-path', 'filter', 'box-shadow'];
  // Private signature evidence, not the bounded element.styles/report contract.
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line',
    'polyline', 'polygon', 'title', 'desc', 'style', 'script']);
  const SVG_ATTRIBUTES = ['d', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy',
    'r', 'rx', 'ry', 'width', 'height', 'pathLength', 'transform', 'viewBox', 'preserveAspectRatio'];
  const SVG_STYLES = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity',
    'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'clip-rule', 'paint-order', 'vector-effect', 'shape-rendering',
    'color-interpolation', 'color-rendering', 'mix-blend-mode', 'isolation',
    'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'transform-origin', 'transform-box',
    'translate', 'rotate', 'scale'];
  const round = n => Math.round(n * 100) / 100;
  const url = new URL(doc.URL);
  const resourceRoot = `${url.origin}${url.pathname.match(/^\/review-source\/[a-f0-9-]{36}\//)?.[0] ?? '/'}`;
  const normalize = s => String(s).replaceAll(resourceRoot, './');
  const admitted = new Map();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const layoutReady = () => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
  const rootScroller = () => doc.scrollingElement ?? doc.documentElement;
  const CLIPPING = new Set(['hidden', 'auto', 'scroll', 'clip']);
  function clientClip(node, style = win.getComputedStyle(node), rect = node.getBoundingClientRect()) {
    const x = CLIPPING.has(style.overflowX), y = CLIPPING.has(style.overflowY);
    if (node === rootScroller() || !x && !y) return null;
    const left = rect.left + node.clientLeft + win.scrollX, top = rect.top + node.clientTop + win.scrollY;
    return { x, y, left, top, right: left + node.clientWidth, bottom: top + node.clientHeight };
  }
  function effectiveClip(element) {
    const clip = { left: win.scrollX, top: win.scrollY,
      right: win.scrollX + win.innerWidth, bottom: win.scrollY + win.innerHeight };
    for (let p = element.parentElement; p; p = p.parentElement) {
      const b = clientClip(p);
      if (b?.x) { clip.left = Math.max(clip.left, b.left); clip.right = Math.min(clip.right, b.right); }
      if (b?.y) { clip.top = Math.max(clip.top, b.top); clip.bottom = Math.min(clip.bottom, b.bottom); }
    }
    return clip;
  }
  function scrollPort(node) {
    if (node === rootScroller() || !node.clientWidth || !node.clientHeight || !node.getClientRects().length) return false;
    const style = win.getComputedStyle(node);
    return ['auto', 'scroll', 'hidden'].includes(style.overflowX) && node.scrollWidth > node.clientWidth
      || ['auto', 'scroll', 'hidden'].includes(style.overflowY) && node.scrollHeight > node.clientHeight;
  }
  function scrollRecord(node) {
    const selector = selectorFor(node);
    if (!selector || matches(selector) !== 1) throw new Error('review_anchor_invalid');
    const record = { selector, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop };
    if (!checkScrolls([record])) throw new Error('review_document_too_large');
    return record;
  }
  function checkInlineImage(src) {
    if (!src.startsWith('data:')) return;
    try {
      const comma = src.indexOf(',');
      if (comma < 0 || src.length > 12 * 1024 * 1024) throw new Error();
      const header = src.slice(0, comma), data = src.slice(comma + 1);
      const bytes = /;base64$/i.test(header)
        ? Uint8Array.from(win.atob(data), c => c.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(data));
      if (!staticImage(bytes)) throw new Error();
    } catch { throw new Error('review_transient_unsupported'); }
  }
  const matches = selector => {
    try { return doc.querySelectorAll(selector).length; } catch { return 0; }
  };
  function selectorFor(element) {
    if (element === doc.documentElement) return 'html';
    if (element === doc.body) return 'body';
    const parts = [];
    for (let node = element; node && parts.length < 12; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${win.CSS.escape(node.id)}`); break; }
      let part = node.localName;
      const classes = [...node.classList].filter(n => n.length < 40
        && !/^(is-|js-|ng-|css-|sc-|active$|open$)/.test(n) && !/\d{4,}/.test(n)).slice(0, 2);
      if (classes.length) part += `.${classes.map(n => win.CSS.escape(n)).join('.')}`;
      if (node.parentElement) {
        const siblings = [...node.parentElement.children].filter(n => n.localName === node.localName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (matches(parts.join(' > ')) === 1) return parts.join(' > ');
    }
    return parts.join(' > ');
  }
  function visible(element, clip = effectiveClip(element)) {
    const r = element.getBoundingClientRect(), style = win.getComputedStyle(element);
    if (!r.width || !r.height || style.visibility !== 'visible' || style.display === 'none'
      || Number(style.opacity) === 0) return false;
    return clip.left < clip.right && clip.top < clip.bottom
      && r.right + win.scrollX > clip.left && r.left + win.scrollX < clip.right
      && r.bottom + win.scrollY > clip.top && r.top + win.scrollY < clip.bottom;
  }
  function describeElement(element) {
    if (!element || !element.isConnected) throw new Error('review_anchor_invalid');
    const selector = selectorFor(element), selectorMatches = matches(selector);
    if (selectorMatches !== 1 || selector.length > 1024) throw new Error('review_anchor_invalid');
    const text = element.textContent ?? '';
    if (new TextEncoder().encode(text).length > 8192) throw new Error('review_element_too_large');
    const computed = win.getComputedStyle(element), rect = element.getBoundingClientRect(), styles = {};
    for (const key of STYLE_KEYS) styles[key] = normalize(computed.getPropertyValue(key));
    return { selector, selectorMatches, tag: element.localName, text,
      rect: { x: round(rect.left + win.scrollX), y: round(rect.top + win.scrollY),
        width: round(rect.width), height: round(rect.height) }, styles };
  }
  function inspect(element) {
    const description = describeElement(element), parents = [];
    for (let p = element.parentElement; p; p = p.parentElement) parents.unshift(p);
    const prior = admitted.get(description.selector);
    if (prior && (prior.node !== element || prior.parents.length !== parents.length
      || prior.parents.some((p, i) => p !== parents[i]))) throw new Error('review_anchor_invalid');
    if (!prior) {
      if (admitted.size >= 2000) throw new Error('review_document_too_large');
      admitted.set(description.selector, { node: element, parents });
    }
    const scrollBasis = parents.filter(scrollPort).map(scrollRecord);
    if (!checkScrolls(scrollBasis)) throw new Error('review_document_too_large');
    const clip = effectiveClip(element);
    return { element: description, scrollBasis, visible: visible(element, clip), clip };
  }
  async function readView() {
    if (!win.innerWidth || !win.innerHeight || !doc.documentElement.clientWidth
      || doc.readyState !== 'complete' || doc.fonts.status !== 'loaded'
      || [...doc.images].some(i => !i.complete || !i.naturalWidth)
      || doc.getAnimations().some(a => a.playState === 'running' || a.pending)) throw new Error('review_not_ready');
    const examined = [...doc.querySelectorAll('body *')];
    if (examined.length > 10000) throw new Error('review_document_too_large');
    const all = examined.filter(e => !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(e.tagName));
    const ports = new Set([doc.documentElement, doc.body, ...all].filter(e => e && scrollPort(e)));
    const scrolls = [...ports].map(scrollRecord);
    if (!checkScrolls(scrolls)) throw new Error('review_document_too_large');
    const svgNodes = new Map(all.filter(e => e.namespaceURI === 'http://www.w3.org/2000/svg').map((e, i) => [e, i]));
    // Include the whole SVG subtree: zero-height stroked lines and non-rendering
    // parents also affect paint. Charge them to the same node and byte limits.
    const nodes = all.filter(e => svgNodes.has(e) || ports.has(e) || visible(e));
    if (nodes.length > 2000) throw new Error('review_document_too_large');
    const viewport = { width: win.innerWidth, height: win.innerHeight,
      scrollX: round(win.scrollX), scrollY: round(win.scrollY), deviceScale: win.devicePixelRatio,
      theme: win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      documentWidth: doc.documentElement.scrollWidth, documentHeight: doc.documentElement.scrollHeight };
    const rows = [], svgRows = [], clipRows = [], targets = [];
    for (const node of [doc.documentElement, doc.body, ...nodes]) {
      if (!node) continue;
      const rect = node.getBoundingClientRect(), style = win.getComputedStyle(node);
      const clip = clientClip(node, style, rect);
      // A viewport-covering body adds no nested clip to the legacy root view.
      if (clip && (node !== doc.body
        || clip.x && (clip.left > viewport.scrollX || clip.right < viewport.scrollX + viewport.width)
        || clip.y && (clip.top > viewport.scrollY || clip.bottom < viewport.scrollY + viewport.height))) {
        clipRows.push([rows.length, style.overflowX, style.overflowY, clip.left, clip.top, clip.right, clip.bottom]);
      }
      const properties = STYLE_KEYS.map(k => normalize(style.getPropertyValue(k)));
      // Referenced paint/effects need a resolver this ordinary-shape projection
      // does not provide. A URL or an id alone cannot establish their pixels.
      if (['fill', 'stroke', 'filter', 'clip-path', 'marker-start', 'marker-mid', 'marker-end']
        .some(k => /url\(|context-(?:fill|stroke)/i.test(style.getPropertyValue(k)))
        || style.maskImage && style.maskImage !== 'none') throw new Error('review_transient_unsupported');
      if (svgNodes.has(node)) {
        if (!SVG_TAGS.has(node.localName)) throw new Error('review_transient_unsupported');
        const matrix = node.getScreenCTM?.();
        svgRows.push([svgNodes.get(node.parentElement) ?? -1, node.localName,
          SVG_ATTRIBUTES.map(k => node.getAttribute(k)),
          SVG_STYLES.map(k => style.getPropertyValue(k)),
          matrix ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] : null]);
      }
      checkInlineImage(node.currentSrc ?? '');
      for (const match of style.backgroundImage.matchAll(/url\("([^"]*)"\)/g)) checkInlineImage(match[1]);
      const ownText = [...node.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      const pseudo = ['::before', '::after'].map(p => {
        const s = win.getComputedStyle(node, p);
        return [s.content, ...STYLE_KEYS.map(k => normalize(s.getPropertyValue(k)))];
      });
      if (node.localName === 'video' || node.localName === 'iframe'
        || node.localName === 'object' || node.localName === 'embed') throw new Error('review_transient_unsupported');
      let pixels = '';
      if (node.localName === 'canvas') {
        try { pixels = node.toDataURL('image/png'); } catch { throw new Error('review_transient_unsupported'); }
        if (pixels.length > 2 * 1024 * 1024) throw new Error('review_document_too_large');
      }
      rows.push([node.localName, ownText, [rect.x, rect.y, rect.width, rect.height].map(round),
        properties, pseudo, 'value' in node ? node.value : null, node.checked ?? null, node.open ?? null,
        node.scrollLeft, node.scrollTop, normalize(node.currentSrc ?? ''), pixels]);
      if (targets.length < 300 && visible(node) && (node.id || node.matches('button,a,input,textarea,select,label,h1,h2,h3,p,li,[role],img')
        || !node.children.length)) {
        try {
          const e = describeElement(node);
          targets.push({ selector: e.selector, label: (node.getAttribute('aria-label') || e.text || e.tag).replace(/\s+/g, ' ').trim().slice(0, 90) });
        } catch { /* Large/ambiguous containers are not valid picker targets. */ }
      }
    }
    // Keep the independently provable root-only legacy signature unchanged.
    const bytes = new TextEncoder().encode(JSON.stringify([viewport, rows, svgRows,
      ...(scrolls.length ? [scrolls] : []), ...(clipRows.length ? [clipRows] : [])]));
    if (bytes.length > 4 * 1024 * 1024) throw new Error('review_document_too_large');
    const hash = await win.crypto.subtle.digest('SHA-256', bytes);
    const signature = `sha256:${[...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const view = { viewport, signature, scrolls, targets };
    if (new TextEncoder().encode(JSON.stringify(view)).length > 512 * 1024) throw new Error('review_document_too_large');
    return view;
  }
  async function restoreView(view) {
    if (!view || Object.keys(view).some(k => !['viewport', 'signature', 'scrolls'].includes(k))
      || !view.viewport || !/^sha256:[a-f0-9]{64}$/.test(view.signature)
      || (view.scrolls !== undefined && !checkScrolls(view.scrolls))
      || new TextEncoder().encode(JSON.stringify(view)).length > 512 * 1024) throw new Error('review_invalid_input');
    const v = view.viewport;
    if (![v.scrollX, v.scrollY].every(n => Number.isFinite(n) && n >= 0 && n <= 1000000)) throw new Error('review_invalid_input');
    // Hidden frames may still have their old, zero-sized layout for one turn.
    await layoutReady();
    const before = await readView(), scrolls = view.scrolls ?? [];
    if (view.scrolls === undefined && before.scrolls.length) throw new Error('review_anchor_invalid');
    if (!same(before.scrolls.map(s => s.selector), scrolls.map(s => s.selector))) throw new Error('review_capture_mismatch');
    // DOM order is ancestor-before-descendant. Restore every port, including
    // independent ports at zero, and refuse browser clamping on readback.
    for (const s of scrolls) {
      if (matches(s.selector) !== 1) throw new Error('review_anchor_invalid');
      doc.querySelector(s.selector).scrollTo({ left: s.scrollLeft, top: s.scrollTop, behavior: 'instant' });
    }
    win.scrollTo({ left: v.scrollX, top: v.scrollY, behavior: 'instant' });
    await layoutReady();
    const after = await readView();
    if (!same(after.scrolls, scrolls) || !same(after.viewport, v)) throw new Error('review_capture_mismatch');
    // Return the signature for the caller's settled-layout comparison. Fresh
    // React/Fluent layout can still settle after these scroll readback frames.
    return after;
  }
  async function scroll(input) {
    await layoutReady();
    if (!input.point) win.scrollTo({ left: input.x, top: input.y, behavior: 'instant' });
    else {
      let node;
      if (input.selector) {
        if (matches(input.selector) !== 1) throw new Error('review_anchor_invalid');
        node = doc.querySelector(input.selector);
      } else node = doc.elementFromPoint(input.point.x, input.point.y);
      const movement = port => {
        const height = port === rootScroller() ? win.innerHeight : port.clientHeight;
        const y = port === rootScroller() ? win.scrollY : port.scrollTop;
        if (input.delta) return input.delta;
        return { x: 0, y: input.key === 'Home' ? -y
          : input.key === 'End' ? port.scrollHeight - height - y
          : (input.key.endsWith('Down') ? 1 : -1) * (input.key.startsWith('Page') ? height * 0.8 : 40) };
      };
      let chosen = rootScroller();
      for (let p = node; p && p !== rootScroller(); p = p.parentElement) {
        const style = win.getComputedStyle(p), delta = movement(p);
        const width = p.scrollWidth - p.clientWidth, rtl = style.direction === 'rtl';
        const x = p.scrollLeft, y = p.scrollTop;
        if (['auto', 'scroll'].includes(style.overflowX) && (delta.x < 0 && x > (rtl ? -width : 0)
          || delta.x > 0 && x < (rtl ? 0 : width))
          || ['auto', 'scroll'].includes(style.overflowY) && (delta.y < 0 && y > 0
          || delta.y > 0 && y < p.scrollHeight - p.clientHeight)) { chosen = p; break; }
      }
      const delta = movement(chosen);
      if (chosen === rootScroller()) win.scrollTo({ left: win.scrollX + delta.x, top: win.scrollY + delta.y, behavior: 'instant' });
      else chosen.scrollTo({ left: chosen.scrollLeft + delta.x, top: chosen.scrollTop + delta.y, behavior: 'instant' });
    }
    await layoutReady();
    return readView();
  }
  return {
    readView, restoreView, scroll,
    describeAt(x, y) {
      const element = doc.elementFromPoint(x - win.scrollX, y - win.scrollY);
      if (!element || !visible(element)) throw new Error('review_anchor_invalid');
      return inspect(element);
    },
    describeSelector(selector) {
      if (matches(selector) !== 1) throw new Error('review_anchor_invalid');
      return inspect(doc.querySelector(selector));
    },
  };
}

// Adapted from Sharpie. Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
/** Shared live/capture SVG. Colors come from the mounted FluentProvider. */
import { BADGE_RADIUS, badgeAnchor, bounds, handlesFor, paintClip } from './geometry.mjs';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Adapted from Sharpie's badge(): every marker carries its own list number, so
 * the drawing and the Comments list never disagree. badgeAnchor returns null
 * for the comment marker, which already draws its number like Sharpie's pin.
 * The clip is the region this annotation may paint in, so the number cannot be
 * cropped away or land past its anchor's edge.
 */
function badge(group, a, index, palette, clip) {
  const point = badgeAnchor(a, clip);
  if (!point) return;
  group.append(el('circle', { cx: point.x, cy: point.y, r: BADGE_RADIUS,
    fill: palette.background, stroke: palette.stroke, 'stroke-width': 1.5 }));
  const label = el('text', { x: point.x, y: point.y, fill: palette.foreground, 'text-anchor': 'middle',
    'dominant-baseline': 'central', 'font-size': 10, 'font-family': palette.fontFamily, 'font-weight': 600 });
  label.textContent = String(index + 1);
  group.append(label);
}

export function renderAnnotation(a, index, palette, clip = null) {
  const group = el('g', { 'data-annotation': a.id });
  const b = bounds(a);
  const stroke = { stroke: palette.stroke, 'stroke-width': 2, 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', fill: 'none' };
  if (a.tool === 'comment') {
    group.append(el('circle', { ...stroke, cx: a.x1, cy: a.y1, r: 12, fill: palette.background }));
    const text = el('text', { x: a.x1, y: a.y1, fill: palette.foreground, 'text-anchor': 'middle',
      'dominant-baseline': 'central', 'font-size': 12, 'font-family': palette.fontFamily, 'font-weight': 600 });
    text.textContent = String(index + 1);
    group.append(text);
  } else if (a.tool === 'circle') {
    group.append(el('ellipse', { ...stroke, cx: b.x + b.width / 2, cy: b.y + b.height / 2,
      rx: Math.max(1, b.width / 2), ry: Math.max(1, b.height / 2) }));
  } else if (a.tool === 'box' || a.tool === 'highlight') {
    group.append(el('rect', { ...stroke, x: b.x, y: b.y, width: b.width, height: b.height, rx: 2,
      ...(a.tool === 'highlight' ? { fill: palette.highlightFill, 'fill-opacity': 0.45, stroke: palette.highlightStroke } : {}) }));
  } else if (a.tool === 'line' || a.tool === 'arrow') {
    group.append(el('line', { ...stroke, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }));
    if (a.tool === 'arrow') {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), size = 10;
      const points = [[a.x2, a.y2],
        [a.x2 - size * Math.cos(angle - 0.5), a.y2 - size * Math.sin(angle - 0.5)],
        [a.x2 - size * Math.cos(angle + 0.5), a.y2 - size * Math.sin(angle + 0.5)]];
      group.append(el('polygon', { points: points.map(p => p.join(',')).join(' '), fill: palette.stroke }));
    }
  } else throw new Error('invalid_annotations');
  badge(group, a, index, palette, clip);
  return group;
}

export function renderSelection(a, palette) {
  const b = a.tool === 'comment' ? { x: a.x1 - 12, y: a.y1 - 12, width: 24, height: 24 } : bounds(a);
  const group = el('g');
  group.append(el('rect', { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8,
    fill: 'none', stroke: palette.selection, 'stroke-width': 2, 'stroke-dasharray': '6 3' }));
  for (const h of handlesFor(a)) group.append(el('rect', {
    x: h.x - 4.5, y: h.y - 4.5, width: 9, height: 9, rx: 2,
    fill: palette.background, stroke: palette.selection, 'stroke-width': 1, 'data-handle': h.name,
  }));
  return group;
}

/**
 * Live overlay and captured overlay come from this one function, so the sealed
 * image cannot place a marker where the reviewer never saw it. `a.clip` is the
 * anchor clip recorded for that annotation by the same inspector the engine and
 * capture validate against; a free drawing has none and answers to the viewport
 * alone. Each annotation is also clipped to that region, so nothing it paints —
 * including a badge in a region too small to hold one — can land outside it.
 */
export function markerSvg(annotations, viewport, palette, hidden = new Set()) {
  const svg = el('svg', { xmlns: SVG_NS, width: viewport.width, height: viewport.height,
    viewBox: `0 0 ${viewport.width} ${viewport.height}` });
  const defs = el('defs');
  const layer = el('g', { transform: `translate(${-viewport.scrollX},${-viewport.scrollY})` });
  annotations.forEach((a, i) => {
    if (hidden.has(a.id)) return;
    const clip = paintClip(viewport, a.clip);
    const region = `dude-review-clip-${a.id}`;
    const path = el('clipPath', { id: region });
    path.append(el('rect', { x: clip.left, y: clip.top,
      width: Math.max(0, clip.right - clip.left), height: Math.max(0, clip.bottom - clip.top) }));
    defs.append(path);
    const group = renderAnnotation(a, i, palette, clip);
    group.setAttribute('clip-path', `url(#${region})`);
    layer.append(group);
  });
  svg.append(defs, layer);
  return svg;
}

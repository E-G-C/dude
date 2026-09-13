// Adapted from Sharpie. Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
/** Stored geometry uses its original document/ancestor-scroll basis. */
export const TOOLS = Object.freeze(['select', 'comment', 'box', 'circle', 'arrow', 'line', 'highlight']);
export const BOX_TOOLS = new Set(['box', 'circle', 'highlight']);
export const SEGMENT_TOOLS = new Set(['line', 'arrow']);

function scrollDelta(basis, scrolls) {
  let x = 0, y = 0;
  for (const original of basis ?? []) {
    const current = scrolls?.find(s => s.selector === original.selector);
    if (!current) throw new Error('review_anchor_invalid');
    x += original.scrollLeft - current.scrollLeft;
    y += original.scrollTop - current.scrollTop;
  }
  return { x, y };
}

/** No mutable current coordinates: edits inverse-map through the same delta. */
export function projectAnnotation(a, scrolls, inverse = false) {
  if (!a.element) return { ...a };
  const d = scrollDelta(a.scrollBasis, scrolls), sign = inverse ? -1 : 1;
  return { ...a, x1: a.x1 + sign * d.x, y1: a.y1 + sign * d.y,
    x2: a.x2 + sign * d.x, y2: a.y2 + sign * d.y };
}

export function projectElement(element, basis, scrolls) {
  if (!basis?.length) return { ...element, rect: { ...element.rect } };
  const d = scrollDelta(basis, scrolls), round = n => Math.round(n * 100) / 100;
  return { ...element, rect: { ...element.rect,
    x: round(element.rect.x + d.x), y: round(element.rect.y + d.y) } };
}

/** Missing legacy basis is UNKNOWN, usable only after proving no scroll ancestors. */
export function anchorMatches(original, basis, current, scrolls) {
  if (!current || !Array.isArray(current.scrollBasis)) return false;
  if (basis === undefined && current.scrollBasis.length) return false;
  if (JSON.stringify((basis ?? []).map(s => s.selector))
    !== JSON.stringify(current.scrollBasis.map(s => s.selector))) return false;
  if (current.scrollBasis.some(s => !scrolls?.some(v => v.selector === s.selector
    && v.scrollLeft === s.scrollLeft && v.scrollTop === s.scrollTop))) return false;
  return JSON.stringify(projectElement(original, basis, scrolls)) === JSON.stringify(current.element);
}

/** Capture compares identity and geometry, not renderer-specific style observations. */
export function portableElement({ selector, selectorMatches, tag, text, rect }) {
  return { selector, selectorMatches, tag, text, rect };
}

export function captureAnchorMatches(original, basis, current, scrolls) {
  if (!current?.element) return false;
  return anchorMatches(portableElement(original), basis,
    { ...current, element: portableElement(current.element) }, scrolls);
}

export function bounds(a) {
  return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2),
    width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1) };
}

export const BADGE_RADIUS = 9;
/** shapes.mjs strokes the disc at 1.5, so its paint reaches half that further. */
export const BADGE_PAINT = BADGE_RADIUS + 0.75;

function validClip(clip) {
  return Boolean(clip) && ['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(clip[k]))
    && clip.left < clip.right && clip.top < clip.bottom;
}

/** The region one annotation may paint in: the reviewed viewport, narrowed by its anchor's clip. */
export function paintClip(viewport, anchorClip = null) {
  const clip = { left: viewport.scrollX, top: viewport.scrollY,
    right: viewport.scrollX + viewport.width, bottom: viewport.scrollY + viewport.height };
  if (!validClip(anchorClip)) return clip;
  return { left: Math.max(clip.left, anchorClip.left), top: Math.max(clip.top, anchorClip.top),
    right: Math.min(clip.right, anchorClip.right), bottom: Math.min(clip.bottom, anchorClip.bottom) };
}

/**
 * Where the numbered badge sits, following Sharpie's anchoring. Segment tools
 * push it just past their tail so it stays attached to the marker instead of
 * drifting to a bounding-box corner the shape never touches; other shapes sit
 * it on the outside of their top-left corner. The comment marker already draws
 * its own number, exactly as Sharpie's pin does, so it has no second badge.
 *
 * Sharpie paints on a whole page, so its anchor is always the whole answer.
 * Here the shape is admitted against a clip, and that outside anchor can land
 * beyond it: a numeral cropped away by the viewport, or painted over a
 * neighbour past a scroll container's edge. Given that clip, the disc is moved
 * the least distance that keeps it inside the same region the shape satisfies,
 * so the anchor is unchanged wherever it already fits.
 */
export function badgeAnchor(a, clip = null) {
  if (a.tool === 'comment') return null;
  let point;
  if (SEGMENT_TOOLS.has(a.tool)) {
    const dx = a.x1 - a.x2, dy = a.y1 - a.y2, length = Math.hypot(dx, dy) || 1;
    const reach = BADGE_RADIUS + 5;
    point = { x: a.x1 + (dx / length) * reach, y: a.y1 + (dy / length) * reach };
  } else {
    const b = bounds(a);
    point = { x: b.x - BADGE_RADIUS, y: b.y - BADGE_RADIUS };
  }
  if (!validClip(clip)) return point;
  // A clip thinner than the disc cannot hold it at all; centring is the least
  // escape, and markerSvg crops the remainder rather than paint outside.
  const fit = (value, low, high) => (low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high));
  return {
    x: fit(point.x, clip.left + BADGE_PAINT, clip.right - BADGE_PAINT),
    y: fit(point.y, clip.top + BADGE_PAINT, clip.bottom - BADGE_PAINT),
  };
}

/** The conservative paint envelope must fit, not the whole target or just its point. */
export function insideClip(a, clip) {
  if (!validClip(clip)) return false;
  const b = bounds(a), pad = a.tool === 'comment' ? 14 : a.tool === 'arrow' ? 11 : 2;
  return b.x - pad >= clip.left && b.y - pad >= clip.top
    && b.x + b.width + pad <= clip.right && b.y + b.height + pad <= clip.bottom;
}

/**
 * Whether an anchor's own clip hides part of that anchor. Only then does the
 * marker's footprint carry information: a partly clipped target can scroll the
 * part under the marker out of sight, so the marker must fit the region that
 * hides the rest of it. A clip that shows the whole target constrains nothing
 * the reviewer can see, so a marker on it answers to the reviewed viewport
 * exactly like a free drawing. An unusable region hides everything.
 */
export function clipHidesAnchor(rect, clip) {
  if (!validClip(clip) || !rect) return true;
  return !(rect.x >= clip.left && rect.y >= clip.top
    && rect.x + rect.width <= clip.right && rect.y + rect.height <= clip.bottom);
}

export function contains(box, point, padding = 0) {
  return point.x >= box.x - padding && point.x <= box.x + box.width + padding
    && point.y >= box.y - padding && point.y <= box.y + box.height + padding;
}

function distanceToSegment(point, a) {
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x1) * dx + (point.y - a.y1) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x1 - t * dx, point.y - a.y1 - t * dy);
}

/**
 * The badge is that annotation's own number, so pressing the number is pressing
 * the annotation, the way a numbered pin in a review tool belongs to the mark
 * it labels. It is located from the same clip the renderer paints it with, so a
 * disc moved to stay inside its region answers where it is actually drawn. A
 * marker that draws no badge, like the comment pin already carrying its own
 * number, answers nowhere. Its reach follows that pin's: painted radius plus
 * the shared tolerance.
 */
function hitBadge(a, point, tolerance, clip) {
  const anchor = badgeAnchor(a, clip);
  return Boolean(anchor) && Math.hypot(point.x - anchor.x, point.y - anchor.y) <= BADGE_PAINT + tolerance;
}

/**
 * `clip` is the region that annotation may paint in, for its badge only; the
 * shape itself is its own stored geometry. Box joins highlight in answering to
 * its whole face, because a reviewer pointing inside a marked region is
 * pointing at that mark. The reversed, topmost-first scan still gives a later
 * drawing inside an earlier one the press. Circle keeps its ring and the
 * segment tools their line, where the enclosed area is not part of the mark.
 */
export function hitTest(a, point, clip = null, tolerance = 8) {
  if (hitBadge(a, point, tolerance, clip)) return true;
  if (a.tool === 'comment') return Math.hypot(point.x - a.x1, point.y - a.y1) <= 12 + tolerance;
  if (SEGMENT_TOOLS.has(a.tool)) return distanceToSegment(point, a) <= tolerance + 2;
  const box = bounds(a);
  if (a.tool === 'circle') {
    const rx = Math.max(1, box.width / 2), ry = Math.max(1, box.height / 2);
    const distance = Math.hypot((point.x - box.x - rx) / rx, (point.y - box.y - ry) / ry);
    return Math.abs(distance - 1) <= tolerance / Math.min(rx, ry);
  }
  return contains(box, point, tolerance);
}

export function handlesFor(a) {
  if (SEGMENT_TOOLS.has(a.tool)) return [{ name: 'p1', x: a.x1, y: a.y1 }, { name: 'p2', x: a.x2, y: a.y2 }];
  if (a.tool === 'comment') return [];
  const b = bounds(a);
  return [
    { name: 'nw', x: b.x, y: b.y }, { name: 'ne', x: b.x + b.width, y: b.y },
    { name: 'se', x: b.x + b.width, y: b.y + b.height }, { name: 'sw', x: b.x, y: b.y + b.height },
  ];
}

export function moveBy(a, dx, dy) {
  a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy;
}

export function resizeBy(a, handle, point) {
  if (handle === 'p1') { a.x1 = point.x; a.y1 = point.y; return; }
  if (handle === 'p2') { a.x2 = point.x; a.y2 = point.y; return; }
  const b = bounds(a);
  const left = handle.includes('w') ? point.x : b.x;
  const right = handle.includes('e') ? point.x : b.x + b.width;
  const top = handle.includes('n') ? point.y : b.y;
  const bottom = handle.includes('s') ? point.y : b.y + b.height;
  a.x1 = Math.min(left, right); a.x2 = Math.max(left, right);
  a.y1 = Math.min(top, bottom); a.y2 = Math.max(top, bottom);
}

export function constrainSegment(start, point) {
  const dx = point.x - start.x, dy = point.y - start.y;
  if (Math.abs(dx) > Math.abs(dy) * 2) return { x: point.x, y: start.y };
  if (Math.abs(dy) > Math.abs(dx) * 2) return { x: start.x, y: point.y };
  const size = Math.min(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx) * size, y: start.y + Math.sign(dy) * size };
}

export function constrainBox(start, point) {
  const dx = point.x - start.x, dy = point.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
}

export function probePoint(a) {
  if (a.tool === 'comment') return { x: a.x1, y: a.y1 };
  if (a.tool === 'arrow') return { x: a.x2, y: a.y2 };
  return { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };
}

/** Points whose marker pixels must be present in the captured overlay. */
export function evidencePoints(a) {
  const b = bounds(a), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  if (a.tool === 'comment') return [{ x: a.x1 - 11, y: a.y1 }, { x: a.x1 + 11, y: a.y1 }];
  if (SEGMENT_TOOLS.has(a.tool)) return [
    { x: a.x1, y: a.y1 }, { x: cx, y: cy }, { x: a.x2, y: a.y2 },
  ];
  if (a.tool === 'highlight') return [{ x: cx, y: cy }];
  return [{ x: b.x, y: cy }, { x: b.x + b.width, y: cy }, { x: cx, y: b.y }, { x: cx, y: b.y + b.height }];
}

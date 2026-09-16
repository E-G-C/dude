// Adapted from Sharpie. Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
// Invoked ONLY in the trusted capture parent, never from the canonical mock.
import { markerSvg } from './shapes.mjs';

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('review_capture_timeout')), 4000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('review_capture_failed')); };
    image.src = source;
  });
}

/** Capture uses the reviewed viewport, NOT full-document rendering/cropping. */
export async function compositePage({ png, annotations, viewport, palette }) {
  const width = Math.round(viewport.width * viewport.deviceScale);
  const height = Math.round(viewport.height * viewport.deviceScale);
  const page = await loadImage(`data:image/png;base64,${png}`);
  if (page.naturalWidth !== width || page.naturalHeight !== height) throw new Error('review_capture_mismatch');
  const svg = markerSvg(annotations, viewport, palette);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const layer = await loadImage(url);
    const overlay = document.createElement('canvas');
    overlay.width = width; overlay.height = height;
    overlay.getContext('2d').drawImage(layer, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(page, 0, 0);
    context.drawImage(overlay, 0, 0);
    return { image: canvas.toDataURL('image/png').split(',')[1],
      overlay: overlay.toDataURL('image/png').split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}

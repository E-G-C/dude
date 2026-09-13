// @ts-check
import { inflateSync } from 'node:zlib';
import { evidencePoints } from '../../ui/review/geometry.mjs';
import { REVIEW_LIMITS, ReviewError } from './data.mjs';

const CRC = Uint32Array.from({ length: 256 }, (_, index) => {
  let n = index;
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) n = (n >>> 8) ^ CRC[(n ^ b) & 255];
  return (n ^ 0xffffffff) >>> 0;
}
const invalid = () => { throw new ReviewError('review_evidence_invalid', 422); };

/** Full bounded RGB/RGBA decode, including all row filters (not just IHDR). */
export function decodePng(png) {
  if (!Buffer.isBuffer(png) || png.length < 45 || png.length > REVIEW_LIMITS.pngBytes
    || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) invalid();
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, afterData = false, chunks = 0;
  const data = [];
  while (offset < png.length) {
    if (++chunks > 1024 || offset + 12 > png.length || ended) invalid();
    const length = png.readUInt32BE(offset), end = offset + 12 + length;
    if (end > png.length) invalid();
    const kind = png.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(kind) || crc(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) invalid();
    if (offset === 8) {
      if (kind !== 'IHDR' || length !== 13) invalid();
      width = png.readUInt32BE(offset + 8); height = png.readUInt32BE(offset + 12);
      channels = png[offset + 17] === 2 ? 3 : png[offset + 17] === 6 ? 4 : 0;
      if (!width || !height || width > REVIEW_LIMITS.dimension || height > REVIEW_LIMITS.dimension
        || width * height > REVIEW_LIMITS.pixels || !channels || png[offset + 16] !== 8
        || png[offset + 18] !== 0 || png[offset + 19] !== 0 || png[offset + 20] !== 0) invalid();
    } else if (kind === 'IDAT') {
      if (afterData) invalid();
      data.push(png.subarray(offset + 8, end - 4));
    } else {
      if (data.length) afterData = true;
      if (kind === 'IEND') {
        if (length || !data.length) invalid();
        ended = true;
      } else if (kind[0] === kind[0].toUpperCase() || ['acTL', 'fcTL', 'fdAT'].includes(kind)) invalid();
    }
    offset = end;
  }
  if (!ended) invalid();
  const stride = width * channels, expected = (stride + 1) * height;
  let raw;
  try {
    const compressed = Buffer.concat(data);
    const decoded = inflateSync(compressed, { maxOutputLength: expected, info: true });
    if (decoded.engine.bytesWritten !== compressed.length) invalid();
    raw = decoded.buffer;
  } catch { invalid(); }
  if (raw.length !== expected) invalid();
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1), filter = raw[base];
    if (filter > 4) invalid();
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x], upperLeft = x >= channels ? previous[x - channels] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        prediction = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      }
      row[x] = (raw[base + x + 1] + prediction) & 255;
    }
    for (let x = 0; x < width; x++) {
      const dest = (y * width + x) * 4, source = x * channels;
      pixels[dest] = row[source]; pixels[dest + 1] = row[source + 1]; pixels[dest + 2] = row[source + 2];
      pixels[dest + 3] = channels === 4 ? row[source + 3] : 255;
    }
    [previous, row] = [row, previous];
  }
  return { width, height, pixels };
}

/** Independently check source + marker pixels, scale, and segment/marker anchors. */
export function verifyComposite(sourceBytes, overlayBytes, imageBytes, state) {
  const source = decodePng(sourceBytes), overlay = decodePng(overlayBytes), image = decodePng(imageBytes);
  const v = state.view.viewport, width = v.width * v.deviceScale, height = v.height * v.deviceScale;
  if ([source, overlay, image].some(p => p.width !== width || p.height !== height)) invalid();
  let covered = 0, changed = 0;
  for (let i = 0; i < image.pixels.length; i += 4) {
    // The captured page is opaque. No blank-marker fallback or alpha substitution.
    if (source.pixels[i + 3] !== 255 || image.pixels[i + 3] !== 255) invalid();
    const alpha = overlay.pixels[i + 3] / 255;
    if (alpha) covered++;
    for (let c = 0; c < 3; c++) {
      const expected = Math.round(overlay.pixels[i + c] * alpha + source.pixels[i + c] * (1 - alpha));
      if (Math.abs(image.pixels[i + c] - expected) > 2) invalid();
      if (Math.abs(image.pixels[i + c] - source.pixels[i + c]) > 2) changed++;
    }
  }
  if (!covered || !changed) invalid();
  for (const a of state.annotations) for (const p of evidencePoints(a)) {
    const x = Math.round((p.x - v.scrollX) * v.deviceScale), y = Math.round((p.y - v.scrollY) * v.deviceScale);
    let found = false;
    const radius = Math.ceil(2 * v.deviceScale);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      if (overlay.pixels[((y + dy) * width + x + dx) * 4 + 3] > 40) found = true;
    }
    if (!found) invalid();
  }
  return { width, height };
}

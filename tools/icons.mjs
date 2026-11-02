// Draws the PNG icons from the mark's own geometry (public/mark.svg), with no tools beyond Node.
//   node tools/icons.mjs
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const INK = [0x1d, 0x1d, 0x1f];
const GREEN = [0x4c, 0xc3, 0x8a];
const WHITE = [255, 255, 255];
const W = 3.4; // stroke width in mark units
const STROKES = [
  [[7.5, 35], [7.5, 23], [14.5, 31], [21.5, 23], [21.5, 35]],
  [[30, 23], [30, 35]],
  [[25.5, 30.5], [30, 35], [34.5, 30.5]],
];

const distToSegment = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const inRoundRect = (x, y, w, h, r) => {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = x < r ? r : x > w - r ? w - r : x, cy = y < r ? r : y > h - r ? h - r : y;
  return Math.hypot(x - cx, y - cy) <= r;
};

// The colour at a point in mark units, or null for transparent.
function shade(x, y, body) {
  if (STROKES.some((s) => s.slice(1).some((p, i) => distToSegment(x, y, s[i], p) <= W / 2))) return WHITE;
  if (Math.hypot(x - 12, y - 11) <= 3.6) return GREEN;
  if (!body || inRoundRect(x, y, 40, 48, 10)) return INK;
  return null;
}

function png(size, { body, scale, bg }) {
  const SS = 4;
  const s = (size * scale) / (body ? 48 : 31);
  // body: the 40x48 mark centred; otherwise the glyph alone (box 5.8..36.2 x 7.4..36.7) centred on an ink square
  const ox = body ? (size - 40 * s) / 2 : size / 2 - 21 * s;
  const oy = body ? (size - 48 * s) / 2 : size / 2 - 22.05 * s;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS - ox) / s, (py + (sy + 0.5) / SS - oy) / s, body) ?? (bg ? INK : null);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      if (a) { raw[o] = Math.round(r / a); raw[o + 1] = Math.round(g / a); raw[o + 2] = Math.round(b / a); raw[o + 3] = Math.round((255 * a) / (SS * SS)); }
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = (name, data) => writeFileSync(new URL(`../public/${name}`, import.meta.url), data);
out('icon-192.png', png(192, { body: true, scale: 0.88 }));
out('icon-512.png', png(512, { body: true, scale: 0.88 }));
// Maskable and Apple icons are full-bleed ink squares with the glyph inside the safe zone.
out('icon-maskable-512.png', png(512, { body: false, scale: 0.5, bg: true }));
out('apple-touch-icon.png', png(180, { body: false, scale: 0.56, bg: true }));
console.log('icons written to public/');

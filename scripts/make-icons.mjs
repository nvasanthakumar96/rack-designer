// Draws the app icon (a rack: two posts, three shelves) and writes the PNG sizes a PWA needs.
// No dependencies: shapes are rasterised with 4x supersampling and encoded with node:zlib.
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
const TOP = [58, 152, 255], BOTTOM = [10, 92, 214];
const WHITE = [255, 255, 255], WOOD = [246, 220, 176];
// [x0, y0, x1, y1, colour] in 0..1 icon space, kept inside the maskable safe zone
const RECTS = [
  [0.235, 0.235, 0.29, 0.775, WHITE], [0.71, 0.235, 0.765, 0.775, WHITE],
  [0.205, 0.775, 0.32, 0.805, WHITE], [0.68, 0.775, 0.795, 0.805, WHITE],
  [0.235, 0.27, 0.765, 0.33, WOOD], [0.235, 0.475, 0.765, 0.525, WHITE], [0.235, 0.675, 0.765, 0.725, WHITE],
];

function colourAt(x, y) {
  for (let i = RECTS.length - 1; i >= 0; i--) {
    const [x0, y0, x1, y1, c] = RECTS[i];
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return c;
  }
  return TOP.map((t, k) => t + (BOTTOM[k] - t) * y);
}

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = ~0; for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function png(size) {
  const S = 4, raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = colourAt((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      for (let k = 0; k < 3; k++) raw[row + 1 + px * 3 + k] = Math.round(acc[k] / (S * S));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, OUT), png(size));
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${hex(TOP)}"/><stop offset="1" stop-color="${hex(BOTTOM)}"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#g)"/>${RECTS.map(([x0, y0, x1, y1, c]) => `<rect x="${+(x0 * 100).toFixed(2)}" y="${+(y0 * 100).toFixed(2)}" width="${+((x1 - x0) * 100).toFixed(2)}" height="${+((y1 - y0) * 100).toFixed(2)}" fill="${hex(c)}"/>`).join('')}</svg>\n`;
writeFileSync(new URL('icon.svg', OUT), svg);
console.log('icons written to public/icons');

// Generates placeholder PWA icons (solid accent square + white "DD" mark) with zero dependencies.
// Usage: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const ACCENT = [0x1f, 0x6f, 0x54];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// "D" glyph in a unit box (w=0.5, h=0.6): stem + half ring. Returns coverage for point (x,y) in glyph space.
function inD(x, y) {
  const w = 0.22; // glyph width
  const h = 0.4; // glyph height
  const t = 0.07; // stroke
  if (x < 0 || x > w || y < 0 || y > h) return false;
  if (x <= t) return true; // stem
  const r = h / 2;
  const cx = w - r;
  const cy = r;
  if (x < cx) return y <= t || y >= h - t; // top/bottom bars
  const d = Math.hypot(x - cx, y - cy);
  return d <= r && d >= r - t;
}

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const gap = 0.04;
  const glyphW = 0.22;
  const total = glyphW * 2 + gap;
  const ox = (1 - total) / 2;
  const oy = (1 - 0.4) / 2;
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    raw[row] = 0;
    for (let px = 0; px < size; px++) {
      const x = px / size;
      const y = py / size;
      const on = inD(x - ox, y - oy) || inD(x - ox - glyphW - gap, y - oy);
      const c = on ? WHITE : ACCENT;
      raw[row + 1 + px * 3] = c[0];
      raw[row + 2 + px * 3] = c[1];
      raw[row + 3 + px * 3] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
for (const [name, size] of [
  ["pwa-192x192.png", 192],
  ["pwa-512x512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(`public/${name}`, render(size));
  console.log("wrote public/" + name);
}

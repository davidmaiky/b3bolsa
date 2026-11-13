// Gera os ícones do app (PNG sem dependências): node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex("#0f1722");
const BARS = [
  { x: 0.3, h: 0.2, color: hex("#3b82f6") },
  { x: 0.5, h: 0.34, color: hex("#38bdf8") },
  { x: 0.7, h: 0.5, color: hex("#22c55e") },
];

// rounded-rect signed distance (negative inside)
const sdRound = (px, py, cx, cy, hw, hh, r) => {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

/** corner: radius of the rounded background (0 = full bleed); glyph: scale of the bars (smaller for maskable). */
function render(size, { corner, glyph }) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size;
          const py = (y + (sy + 0.5) / SS) / size;
          let col = null;
          if (corner === 0 || sdRound(px, py, 0.5, 0.5, 0.5, 0.5, corner) <= 0) col = BG;
          if (col) {
            for (const bar of BARS) {
              const bw = 0.14 * glyph, bh = bar.h * glyph;
              const cx = 0.5 + (bar.x - 0.5) * glyph;
              const base = 0.5 + 0.22 * glyph; // bottom of the bars
              if (sdRound(px, py, cx, base - bh / 2, bw / 2, bh / 2, 0.035 * glyph) <= 0) col = bar.color;
            }
            r += col[0]; g += col[1]; b += col[2]; a += 255;
          }
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const cov = a / 255;
      out[i] = cov ? Math.round(r / cov) : 0;
      out[i + 1] = cov ? Math.round(g / cov) : 0;
      out[i + 2] = cov ? Math.round(b / cov) : 0;
      out[i + 3] = Math.round(a / n);
    }
  }
  return png(size, out);
}

const files = {
  "public/icons/icon-192.png": render(192, { corner: 0.2, glyph: 1 }),
  "public/icons/icon-512.png": render(512, { corner: 0.2, glyph: 1 }),
  "public/icons/icon-maskable-512.png": render(512, { corner: 0, glyph: 0.72 }), // fundo até a borda: o sistema aplica a máscara
  "public/icons/apple-touch-icon.png": render(180, { corner: 0, glyph: 0.9 }), // iOS arredonda sozinho
  "src/app/icon.png": render(64, { corner: 0.2, glyph: 1 }),
};
for (const [path, data] of Object.entries(files)) writeFileSync(path, data);

// favicon.ico com PNG embutido (16 e 32)
const ico = (...imgs) => {
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(imgs.length, 4);
  let offset = head.length;
  imgs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    head[e] = size;
    head[e + 1] = size;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...imgs.map((i) => i.data)]);
};
writeFileSync("src/app/favicon.ico", ico({ size: 16, data: render(16, { corner: 0.2, glyph: 1 }) }, { size: 32, data: render(32, { corner: 0.2, glyph: 1 }) }));
console.log("ícones gerados");

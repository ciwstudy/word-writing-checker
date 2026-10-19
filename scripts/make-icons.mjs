// Draws the add-in icons (blue rounded square, white check mark) as PNGs
// with no image libraries. Run with `npm run icons`.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

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
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// distance from point p to segment a-b
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function icon(size) {
  const S = 4; // supersampling for smooth edges
  const rows = [];
  const r = size * 0.2;
  const stroke = size * 0.11;
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      let bg = 0, check = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
        const cx = Math.min(Math.max(px, r), size - r), cy = Math.min(Math.max(py, r), size - r);
        if (Math.hypot(px - cx, py - cy) <= r) bg++;
        const d = Math.min(
          segDist(px, py, size * 0.25, size * 0.52, size * 0.43, size * 0.70),
          segDist(px, py, size * 0.43, size * 0.70, size * 0.76, size * 0.32),
        );
        if (d <= stroke / 2) check++;
      }
      const a = bg / (S * S), c = check / (S * S);
      const mix = (blue, white) => Math.round(blue * (1 - c) + white * c);
      row.push(mix(0x2b, 255), mix(0x57, 255), mix(0x9a, 255), Math.round(a * 255));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 64, 80, 128]) {
  writeFileSync(new URL(`../assets/icon-${size}.png`, import.meta.url), icon(size));
}
console.log("Icons written to assets/");

// Wraps the PNG icons in a Windows .ico (PNG-in-ICO, supported since Vista)
// for the installer's entry in Settings > Apps.
import { readFileSync, writeFileSync } from "node:fs";

const sizes = [16, 32, 64, 128];
const pngs = sizes.map((s) => readFileSync(new URL(`../assets/icon-${s}.png`, import.meta.url)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s;
  e[1] = s >= 256 ? 0 : s;
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});

writeFileSync(new URL("../installer/icon.ico", import.meta.url), Buffer.concat([header, ...entries, ...pngs]));

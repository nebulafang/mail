import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "assets/brand-icon.png";
const RADIUS = 0.225;
const PNG = { palette: true, quality: 90, effort: 10, compressionLevel: 9 } as const;

async function tileBox() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return data[i + 3] > 16 && (data[i] < 231 || data[i + 1] < 231 || data[i + 2] < 231);
  };
  let [left, top, right, bottom] = [width, height, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!ink(x, y)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const size = Math.min(right - left, bottom - top) + 1;
  let corner = 0;
  while (!ink(left + corner, top + corner)) corner++;
  return { left, top, size, bleed: Math.ceil(corner * 1.1) };
}

const box = await tileBox();
const tile = () => sharp(SOURCE).extract({ left: box.left, top: box.top, width: box.size, height: box.size });
const fullBleed = () =>
  sharp(SOURCE).extract({
    left: box.left + box.bleed,
    top: box.top + box.bleed,
    width: box.size - box.bleed * 2,
    height: box.size - box.bleed * 2,
  });

async function rounded(size: number) {
  const r = size * RADIUS;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
  const art = await tile().resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  return sharp(art).composite([{ input: mask, blend: "dest-in" }]).png(PNG).toBuffer();
}

const square = (size: number) => fullBleed().resize(size, size, { kernel: "lanczos3" }).png(PNG).toBuffer();

function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

await mkdir("public", { recursive: true });
await Promise.all([
  writeFile("src/app/icon.png", await rounded(192)),
  writeFile("public/icon-192.png", await rounded(192)),
  writeFile("public/icon-512.png", await rounded(512)),
  writeFile("public/icon-maskable-512.png", await square(512)),
  writeFile("src/app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await rounded(size) }))))),
  tile().resize(288, 288, { kernel: "lanczos3" }).webp({ quality: 88 }).toFile("public/brand.webp"),
]);

console.log("icons generated from", SOURCE, box);

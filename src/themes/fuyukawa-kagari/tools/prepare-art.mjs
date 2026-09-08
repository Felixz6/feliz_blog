import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";

// Sources stay read-only. Every runtime derivative has a new, theme-owned path.
const root = process.cwd();
const assets = path.join(root, "public/themes/fuyukawa-kagari/assets");
const destination = path.join(assets, "manga");
const review = path.join(os.tmpdir(), "fuyukawa-art-review");
await fs.mkdir(destination, { recursive: true });
await fs.mkdir(review, { recursive: true });
const names = await fs.readdir(path.join(root, "fuyukawa"));
const source = (volume, page) => {
  const id = volume === 4 ? "93251996" : "102800687";
  const name = names.find((value) => value.endsWith(`${id}_p${page}.jpg`));
  if (!name) throw new Error(`Missing source V${volume} p${page}`);
  return path.join(root, "fuyukawa", name);
};
const hash = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
const manifest = { version: 1, artist: "葉佐乃", sourceFiles: [], outputs: [], hero: {} };
const record = async (file, originals, operation) => {
  const m = await sharp(file).metadata();
  manifest.outputs.push({
    file: path.basename(file), width: m.width, height: m.height,
    bytes: (await fs.stat(file)).size, sha256: await hash(file),
    sources: originals.map((p) => path.relative(root, p).replaceAll("\\", "/")), operation
  });
};
for (const name of names.filter((value) => /\.(jpg|png|webp)$/i.test(value))) {
  const file = path.join(root, "fuyukawa", name);
  manifest.sourceFiles.push({ file: `fuyukawa/${name}`, sha256: await hash(file) });
}

const selections = [
  ["festival-cover", 4, 0],
  ["afternoon-cover", 8, 0],
  ["together-cover", 8, 22],
  ["notebook-page", 8, 11],
  ["workshop-page", 4, 7],
  ["playroom-page", 8, 14],
  ["letter-page", 4, 29],
  ["fireworks-page", 4, 30],
  ["reading-strip", 8, 3, { left: 25, top: 14, width: 653, height: 430 }],
  ["workshop-strip", 4, 7, { left: 22, top: 12, width: 580, height: 305 }],
  ["playroom-strip", 8, 14, { left: 30, top: 505, width: 644, height: 480 }],
  ["hand-note", 4, 30, { left: 25, top: 322, width: 570, height: 252 }]
];
for (const [name, volume, page, crop] of selections) {
  const original = source(volume, page);
  let image = sharp(original);
  if (crop) image = image.extract(crop);
  const file = path.join(destination, `${name}.webp`);
  await image.resize({ width: 900, withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toFile(file);
  await record(file, [original], crop ? { crop } : "complete artwork, no crop");
}

// Remove only light pixels connected to the outer paper, never enclosed whites.
for (const [name, volume, page] of [
  ["kagari-tea", 4, 6], ["haruto-gift", 4, 15], ["festival-pair", 4, 22],
  ["kagari-thinking", 8, 8], ["haruto-thinking", 8, 16]
]) {
  const original = source(volume, page);
  const { data, info } = await sharp(original).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const count = width * height;
  const paper = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const visit = (i) => {
    if (paper[i]) return;
    const rgb = data.subarray(i * 3, i * 3 + 3);
    if (Math.min(...rgb) < 239 || Math.max(...rgb) - Math.min(...rgb) > 18) return;
    paper[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < count) visit(i + width);
  }
  const rgba = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) {
    data.copy(rgba, i * 4, i * 3, i * 3 + 3);
    rgba[i * 4 + 3] = paper[i] ? 0 : 255;
  }
  const file = path.join(destination, `${name}.webp`);
  await sharp(rgba, { raw: { width, height, channels: 4 } }).trim({ threshold: 1 })
    .webp({ lossless: true, effort: 5 }).toFile(file);
  await record(file, [original], "border-connected paper removal; enclosed white artwork preserved; lossless WebP");
}

const heroSource = path.join(assets, "hero-wallpaper.jpg");
const maskSource = path.join(root, "src/themes/fuyukawa-kagari/art/hero-subject-mask.svg");
const width = 1920, height = 1080;
const original = await sharp(heroSource).resize(width, height).removeAlpha().raw().toBuffer();
const maskSvg = await fs.readFile(maskSource, "utf8");
const mask = await sharp(Buffer.from(maskSvg)).resize(width, height).ensureAlpha().extractChannel(3).raw().toBuffer();
const foreground = Buffer.alloc(width * height * 4);
for (let i = 0; i < mask.length; i++) {
  original.copy(foreground, i * 4, i * 3, i * 3 + 3);
  foreground[i * 4 + 3] = mask[i];
}
const frontFile = path.join(destination, "hero-character.webp");
await sharp(foreground, { raw: { width, height, channels: 4 } })
  .webp({ lossless: true, effort: 5 }).toFile(frontFile);
await record(frontFile, [heroSource, maskSource], "hand-traced alpha; source RGB unchanged at 1920x1080; lossless WebP");

// Hidden pixels cannot be recovered from the flattened poster. Keep complete,
// unobstructed original panels and rebuild the missing middle as clean panels.
// Do not smear, mirror or stretch the old character's edge into the background.
const preservedRegions = [
  { left: 0, top: 0, width: 260, height: 720 },
  { left: 262, top: 0, width: 248, height: 348 },
  { left: 992, top: 0, width: 288, height: 720 },
  { left: 262, top: 352, width: 89, height: 143 },
  { left: 268, top: 501, width: 115, height: 96 }
];
const scaleRegion = (rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 1.5)]));
const tiles = [];
for (const region of preservedRegions) {
  const rect = scaleRegion(region);
  tiles.push({
    input: await sharp(original, { raw: { width, height, channels: 3 } }).extract(rect).png().toBuffer(),
    left: rect.left, top: rect.top
  });
}
const repairs = [
  [8, 3, { left: 25, top: 14, width: 653, height: 430 }, { left: 530, top: 8, width: 225, height: 148 }],
  [4, 29, { left: 20, top: 12, width: 583, height: 355 }, { left: 780, top: 8, width: 206, height: 170 }],
  [8, 11, null, { left: 530, top: 179, width: 218, height: 323 }],
  [4, 7, { left: 22, top: 12, width: 580, height: 305 }, { left: 780, top: 200, width: 206, height: 127 }],
  [8, 14, { left: 30, top: 505, width: 644, height: 480 }, { left: 780, top: 355, width: 192, height: 143 }],
  [4, 21, { left: 294, top: 20, width: 308, height: 809 }, { left: 389, top: 356, width: 117, height: 242 }],
  [4, 30, { left: 23, top: 552, width: 580, height: 280 }, { left: 264, top: 610, width: 245, height: 110 }],
  [8, 23, null, { left: 780, top: 520, width: 158, height: 187 }],
  [4, 7, { left: 22, top: 12, width: 580, height: 305 }, { left: 531, top: 535, width: 221, height: 167 }]
];
for (const [volume, page, crop, region] of repairs) {
  const rect = scaleRegion(region);
  let image = sharp(source(volume, page));
  if (crop) image = image.extract(crop);
  tiles.push({
    input: await image.resize(rect.width, rect.height, { fit: "contain", background: "#fff" }).png().toBuffer(),
    left: rect.left, top: rect.top
  });
}
const background = await sharp({ create: { width, height, channels: 3, background: "#fff" } })
  .composite(tiles).removeAlpha().raw().toBuffer();
const backFile = path.join(destination, "hero-manga.webp");
await sharp(background, { raw: { width, height, channels: 3 } })
  .webp({ lossless: true, effort: 5 }).toFile(backFile);
await record(backFile, [heroSource, ...new Set(repairs.map(([volume, page]) => source(volume, page)))],
  "complete original outer panels plus a rebuilt manga center; no invented hidden pixels, stretching or character remnants; lossless WebP");
manifest.hero = { width, height, preservedRegions: preservedRegions.map(scaleRegion), reconstructedCenter: true };
await fs.writeFile(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const frontReview = await sharp(frontFile).resize(960, 540).toBuffer();
const backReview = await sharp(backFile).resize(960, 540).toBuffer();
const checks = [
  { name: "layers-review", entries: [
    { input: backReview, left: 0, top: 0 },
    { input: frontReview, left: 0, top: 540 }
  ], height: 1080 },
  { name: "recombined-review", entries: [
    { input: backReview, left: 0, top: 0 },
    { input: frontReview, left: 0, top: 0 }
  ], height: 540 }
];
for (const check of checks) {
  const file = path.join(review, `${check.name}.jpg`);
  await sharp({ create: { width: 960, height: check.height, channels: 3, background: "#cbdce5" } })
    .composite(check.entries).jpeg({ quality: 88 }).toFile(file);
  console.log(file, (await fs.stat(file)).size);
}
console.log(JSON.stringify({ outputs: manifest.outputs.length, bytes: manifest.outputs.reduce((sum, item) => sum + item.bytes, 0), hero: manifest.hero }));

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error("Pass the original blade-pose PNG path.");
const original = await readFile(source);
const sourceSha256 = createHash("sha256").update(original).digest("hex");
if (sourceSha256 !== "698d927d48b3c079bb9b35e068d1356aac4918779aeb3ac39cd45bdb1b37b529") {
  throw new Error("Expected the original blade-pose artwork, not a recompressed derivative.");
}
const metadata = await sharp(original).metadata();
if (metadata.width !== 1448 || metadata.height !== 1086 || !metadata.hasAlpha) {
  throw new Error("Expected the original 1448x1086 transparent blade-pose artwork.");
}

const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

// A soft warm-tone mask leaves pink hair, dark fabric and alpha untouched.
for (let i = 0; i < data.length; i += 4) {
  if (!data[i + 3]) continue;
  const [r, g, b] = data.subarray(i, i + 3);
  const weight = smoothstep(115, 175, g)
    * smoothstep(3, 15, g - b)
    * smoothstep(-2, 8, r - g);
  for (let channel = 0; channel < 3; channel++) {
    data[i + channel] = Math.round(data[i + channel] + (255 - data[i + channel]) * 0.22 * weight);
  }
}

const layer = await sharp(data, { raw: info }).resize({ width: 940 }).png().toBuffer();
const output = await sharp({
  create: { width: 1440, height: 975, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).composite([{ input: layer, left: 220, top: 270 }])
  .webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer();
const target = new URL("../public/themes/kisara/assets/blog/kisara-front-blade-v4.webp", import.meta.url);
await writeFile(target, output, { flag: "wx" });
console.log(JSON.stringify({
  target: target.pathname,
  bytes: output.length,
  sourceSha256
}));

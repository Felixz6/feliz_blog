import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error("Pass the original transparent Ayano PNG path.");
const original = await readFile(source);
const sourceSha256 = createHash("sha256").update(original).digest("hex");
if (sourceSha256 !== "65db61a85f219cf05e99a0a2f080694a1b6da9646681007d53b6289d045abb1d") {
  throw new Error("Expected the supplied Ayano artwork.");
}
const metadata = await sharp(original).metadata();
if (metadata.width !== 1122 || metadata.height !== 1402 || !metadata.hasAlpha) {
  throw new Error("Expected a 1122x1402 transparent source.");
}

// Keep the original stage coordinates and visible height; preserve the complete hair and gun.
const layer = await sharp(original).resize({ height: 724 }).png().toBuffer();
const output = await sharp({
  create: { width: 1440, height: 975, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).composite([{ input: layer, left: 820, top: 124 }])
  .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
const target = new URL("../public/themes/kisara/assets/blog/ayano-middle-art-v2.webp", import.meta.url);
await writeFile(target, output, { flag: "wx" });
console.log(JSON.stringify({ bytes: output.length, sourceSha256, target: target.pathname }));

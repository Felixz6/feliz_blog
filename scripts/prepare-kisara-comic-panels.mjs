import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = [
  {
    source: new URL("../design/kisara-comic-001/assets/panel-clean.webp", import.meta.url),
    hash: "5e34e56b452b5d4ea0e3a6c5e16a0f56a4bb4b7f1d893e85d06daae5d3c26315",
    file: "hero-panel-v2.webp",
    width: 752, height: 1148
  },
  {
    source: new URL("../kisara/comic/d5b197bb-16e3-4c75-92d0-1554db7c4841.png", import.meta.url),
    hash: "6309a8f774dd2594cc00589025dcefaf6fcb565d8a8a22f71ea5f990fdee12bd",
    file: "smile-panel-v2.webp",
    width: 738, height: 1244,
    paperWhite: 127
  }
];

// Validate every source before publishing. Keep the accepted full panel byte-for-byte.
const outputs = [];
for (const input of inputs) {
  const original = await readFile(input.source);
  if (digest(original) !== input.hash) throw new Error(`Unexpected source for ${input.file}`);
  const metadata = await sharp(original).metadata();
  if (metadata.width !== input.width || metadata.height !== input.height) {
    throw new Error(`Unexpected dimensions for ${input.file}`);
  }
  const bytes = input.paperWhite
    ? await sharp(original).greyscale().linear(255 / input.paperWhite)
      .webp({ quality: 91, effort: 6 }).toBuffer()
    : original;
  const target = new URL(`../public/themes/kisara/assets/home-comic/${input.file}`, import.meta.url);
  let existing;
  try { existing = await readFile(target); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && !existing.equals(bytes)) throw new Error(`Refusing to overwrite ${input.file}`);
  outputs.push({ ...input, target, bytes, existing: Boolean(existing) });
}

for (const output of outputs) {
  if (!output.existing) await writeFile(output.target, output.bytes, { flag: "wx" });
  console.log(JSON.stringify({
    file: output.file, width: output.width, height: output.height,
    bytes: output.bytes.length, sha256: digest(output.bytes), reused: output.existing
  }));
}

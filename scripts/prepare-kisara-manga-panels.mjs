import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Pass the local Engage Kiss manga directory as the first argument.");
const manifest = JSON.parse(await readFile(new URL("../design/kisara-comic-001/original-panels.json", import.meta.url), "utf8"));
const directories = await readdir(resolve(sourceRoot), { withFileTypes: true });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
sharp.concurrency(2);

// Validate every input and existing output before publishing any new derivative.
const outputs = [];
for (const panel of manifest.panels) {
  const matches = directories.filter(item => item.isDirectory() && item.name.startsWith(`${panel.chapter}.`));
  if (matches.length !== 1) throw new Error(`Ambiguous or missing chapter ${panel.chapter}`);
  const source = join(resolve(sourceRoot), matches[0].name, `${String(panel.page).padStart(2, "0")}.webp`);
  const original = await readFile(source);
  if (digest(original) !== panel.sourceSha256) throw new Error(`Unexpected source for ${panel.file}`);
  const meta = await sharp(original).metadata();
  if (meta.width !== panel.sourceSize[0] || meta.height !== panel.sourceSize[1]) {
    throw new Error(`Unexpected source dimensions for ${panel.file}`);
  }
  const crop = panel.crop;
  const wholePage = crop.left === 0 && crop.top === 0 && crop.width === meta.width && crop.height === meta.height;
  const bytes = wholePage ? original : await sharp(original).extract(crop).webp(manifest.encoding).toBuffer();
  const target = new URL(`../public/themes/kisara/assets/home-comic/${panel.file}`, import.meta.url);
  let existing;
  try { existing = await readFile(target); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && !existing.equals(bytes)) throw new Error(`Refusing to overwrite ${panel.file}`);
  outputs.push({ panel, bytes, target, existing: Boolean(existing) });
}
for (const { panel, bytes, target, existing } of outputs) {
  if (!existing) await writeFile(target, bytes, { flag: "wx" });
  console.log(JSON.stringify({ file: panel.file, width: panel.crop.width, height: panel.crop.height, bytes: bytes.length, sha256: digest(bytes), reused: existing }));
}

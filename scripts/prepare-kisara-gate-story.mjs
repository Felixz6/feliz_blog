import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const source = resolve("kisara/stage");
const destination = resolve("public/themes/kisara/assets");
const shots = [
  ["1.png", "memory-intercept.webp", 1920, 83],
  ["3.png", "memory-draw.webp", 1600, 82],
  ["4.png", "memory-leap.webp", 1920, 83],
  ["5.png", "memory-impact.webp", 1920, 84],
  ["6.png", "memory-fallen.webp", 1920, 83],
  ["8.png", "memory-approach.webp", 1920, 86]
];

// Never overwrite source art or a previously prepared asset with an unreviewed version.
for (const [name, output, width, quality] of shots) {
  const target = resolve(destination, output);
  if (existsSync(target)) {
    console.log(`Kept ${output}`);
    continue;
  }
  const result = await sharp(resolve(source, name))
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer();
  await writeFile(target, result, { flag: "wx" });
  console.log(`${output}: ${result.length} bytes`);
}

const silhouette = resolve(destination, "transformation-silhouette.webp");
if (!existsSync(silhouette)) {
  const original = execFileSync("git", [
    "show", "603abbc:public/themes/kisara/assets/transformation-silhouette.webp"
  ], { maxBuffer: 4 * 1024 * 1024 });
  await writeFile(silhouette, original, { flag: "wx" });
}
console.log(`Reused silhouette: ${(await readFile(silhouette)).length} bytes`);

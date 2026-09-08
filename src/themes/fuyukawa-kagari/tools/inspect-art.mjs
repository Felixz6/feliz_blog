import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const root = process.cwd();
const output = path.join(os.tmpdir(), "fuyukawa-art-review");
await fs.mkdir(output, { recursive: true });
const names = (await fs.readdir(path.join(root, "fuyukawa")))
  .filter((name) => /\.(jpg|png|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const inventory = [];
for (const name of names) {
  const file = path.join(root, "fuyukawa", name);
  const meta = await sharp(file).metadata();
  inventory.push({ name, width: meta.width, height: meta.height, bytes: (await fs.stat(file)).size });
}
await fs.writeFile(path.join(output, "inventory.json"), JSON.stringify(inventory, null, 2));
for (let batch = 0; batch < 2; batch++) {
  const selected = inventory.slice(batch * 30, (batch + 1) * 30);
  const cells = [];
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const left = (i % 6) * 190;
    const top = Math.floor(i / 6) * 270;
    cells.push({
      input: await sharp(path.join(root, "fuyukawa", item.name))
        .resize(180, 240, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer(),
      left, top
    });
    const label = item.name.match(/(93251996|102800687)_p(\d+)/);
    cells.push({
      input: Buffer.from(`<svg width="190" height="25"><text x="5" y="17" font-size="13" fill="#334">${label[1] === "93251996" ? "V4" : "V8"} / p${label[2]}</text></svg>`),
      left, top: top + 242
    });
  }
  const file = path.join(output, `contact-${batch + 1}.jpg`);
  await sharp({ create: { width: 1140, height: Math.ceil(selected.length / 6) * 270, channels: 3, background: "#edf2f5" } })
    .composite(cells).jpeg({ quality: 79 }).toFile(file);
  console.log(file, (await fs.stat(file)).size);
}
for (const name of ["hero-wallpaper.jpg", "fuyukawa-kagari-bg.png"]) {
  const file = path.join(output, name.replace(/\.[^.]+$/, "-review.jpg"));
  await sharp(path.join(root, "public/themes/fuyukawa-kagari/assets", name))
    .resize({ width: 1280, height: 900, fit: "inside" }).flatten({ background: "#fff" })
    .jpeg({ quality: 83 }).toFile(file);
  console.log(file, (await fs.stat(file)).size);
}

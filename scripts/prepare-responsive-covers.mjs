import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../public/blog-covers/", import.meta.url);
const output = new URL("responsive/", root);
const manifestPath = new URL("../src/core/content/responsive-covers.json", import.meta.url);
const blogContent = new URL("../src/content/blog/", import.meta.url);
const blogCoverNames = new Set();
for (const filename of (await readdir(blogContent)).filter(name => name.endsWith(".md"))) {
  const content = await readFile(new URL(filename, blogContent), "utf8");
  const match = content.match(/^cover:\s*["']?\/blog-covers\/(cover-\d+\.webp)["']?\s*$/m);
  if (match) blogCoverNames.add(match[1]);
}

const defaultWidths = [320, 640, 960];
const blogWidths = [320, 480, 640, 768];
const blogQuality = 82;
const settings = { quality: 94, alphaQuality: 100, smartSubsample: true, effort: 6 };
await mkdir(output, { recursive: true });
let previous = {};
try { previous = JSON.parse(await readFile(manifestPath, "utf8")); } catch {}
const manifest = {};
let generated = 0;
let totalBytes = 0;

// Derive only smaller display sizes from the accepted cover, never replace it.
for (const name of (await readdir(root)).filter(name => /^cover-\d+\.webp$/.test(name)).sort()) {
  const source = await readFile(new URL(name, root));
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) continue;
  const key = `/blog-covers/${name}`;
  const isBlogCover = blogCoverNames.has(name);
  const widths = isBlogCover ? blogWidths : defaultWidths;
  const hashForQuality = (quality) => createHash("sha256")
    .update(source)
    .update(JSON.stringify({ ...settings, quality }))
    .digest("hex")
    .slice(0, 8);
  const hash = hashForQuality(settings.quality);
  const opaque = (await sharp(source).stats()).isOpaque;
  const record = { width: metadata.width, height: metadata.height, hash, opaque, variants: [] };
  for (const width of widths.filter(width => width < metadata.width)) {
    // 640w is the first candidate that can satisfy a 318px card at DPR 2.
    // Blog responsive variants use the experimentally selected quality 82.
    const qualities = isBlogCover ? [blogQuality] : [settings.quality];
    let selected;
    for (const quality of qualities) {
      const variantHash = hashForQuality(quality);
      const filename = `${name.slice(0, -5)}-${width}-${variantHash}.webp`;
      const url = new URL(filename, output);
      let data;
      try {
        data = await readFile(url);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        data = await sharp(source)
          .resize({ width, withoutEnlargement: true })
          .webp({ ...settings, quality })
          .toBuffer();
        if (data.length < source.length) {
          await writeFile(url, data, { flag: "wx" });
          generated++;
        }
      }
      if (data.length < source.length) {
        selected = { data, src: `/blog-covers/responsive/${filename}` };
        break;
      }
    }
    if (!selected) continue;
    totalBytes += selected.data.length;
    record.variants.push({ width, src: selected.src, bytes: selected.data.length });
  }
  manifest[key] = record;
}
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (JSON.stringify(previous) !== JSON.stringify(manifest)) await writeFile(manifestPath, serialized);
console.log(`Responsive covers: ${Object.keys(manifest).length} covers, ${generated} new files, ${(totalBytes / 1024).toFixed(1)} KiB total.`);

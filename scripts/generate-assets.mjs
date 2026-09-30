import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const outDir = new URL("../public/themes/fuyukawa-kagari/assets/", import.meta.url);
await mkdir(outDir, { recursive: true });

const sourceMusicDir = new URL("../MUSIC/", import.meta.url);
const publicMusicDir = new URL("../public/themes/fuyukawa-kagari/music/", import.meta.url);
const audioExtensions = new Set([".mp3", ".flac", ".wav", ".ogg", ".m4a"]);

function extensionOf(filename) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function publicMusicPath(filename) {
  return `/themes/fuyukawa-kagari/music/${filename.split("/").map(encodeURIComponent).join("/")}`;
}

async function syncMusicLibrary() {
  let entries = [];

  try {
    entries = await readdir(sourceMusicDir, { withFileTypes: true });
  } catch {
    await mkdir(publicMusicDir, { recursive: true });
    await writeFile(new URL("manifest.json", publicMusicDir), "[]\n");
    return;
  }

  await mkdir(publicMusicDir, { recursive: true });
  const tracks = entries
    .filter((entry) => entry.isFile() && audioExtensions.has(extensionOf(entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" }));

  await Promise.all(
    tracks.map((entry) => copyFile(new URL(entry.name, sourceMusicDir), new URL(entry.name, publicMusicDir)))
  );

  const manifest = tracks.map((entry, index) => {
    const title = entry.name.replace(/\.[^.]+$/, "");
    return {
      id: `track-${index + 1}`,
      title,
      file: entry.name,
      src: publicMusicPath(entry.name)
    };
  });

  await writeFile(new URL("manifest.json", publicMusicDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

await syncMusicLibrary();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, draw) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = draw(x, y, width, height);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function clamp(v, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

const avatar = png(512, 512, (x, y, w, h) => {
  const nx = (x - w / 2) / (w / 2);
  const ny = (y - h / 2) / (h / 2);
  const d = Math.hypot(nx, ny);
  let r = 16;
  let g = 20;
  let b = 25;
  let a = d < 0.95 ? 255 : 0;
  if (d < 0.95) {
    const ring = Math.abs(d - 0.72) < 0.025;
    const slash = Math.abs(nx * 0.75 + ny) < 0.08 && d < 0.62;
    const core = d < 0.22;
    r += 30 + (1 - d) * 20;
    g += 36 + (1 - d) * 35;
    b += 48 + (1 - d) * 60;
    if (ring || slash || core) {
      r = 128;
      g = 232;
      b = 224;
    }
    if (Math.abs(nx - 0.3) < 0.06 && Math.abs(ny + 0.18) < 0.18) {
      r = 255;
      g = 126;
      b = 161;
    }
  }
  return [clamp(r), clamp(g), clamp(b), a];
});

await writeFile(new URL("avatar-sigil.png", outDir), avatar);

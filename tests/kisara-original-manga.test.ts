import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import postcss from "postcss";
import sharp from "sharp";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("design/kisara-comic-001/original-panels.json"));
const stylesheet = postcss.parse(read("src/themes/kisara/styles/home-comic.css"));
const opening = read("src/themes/kisara/components/KisaraOpeningMemoryScene.astro");
const ids = ["hero", "quiet", "action", "smile", "candle"];

// Resolve only the structural selectors under width/height media conditions.
function style(selector: string, width: number, height: number) {
  const result: Record<string, string> = {};
  stylesheet.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media") {
        const conditions = [...parent.params.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)];
        if (!conditions.length || conditions.some(([, limit, axis, value]) => {
          const size = axis === "width" ? width : height;
          return limit === "min" ? size < Number(value) : size > Number(value);
        })) return;
      }
      parent = parent.parent;
    }
    rule.walkDecls(declaration => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

function grid(width: number, height: number) {
  const page = style(".kisara-comic-pages", width, height);
  const cols = Number(page["grid-template-columns"].match(/repeat\((\d+)/)![1]);
  const rowCount = page["grid-template-rows"].startsWith("repeat")
    ? Number(page["grid-template-rows"].match(/repeat\((\d+)/)![1]) : 2;
  const range = (value: string, count: number) => {
    const [start, end] = value.split("/").map(Number);
    return [start - 1, end === -1 ? count : (end || start + 1) - 1];
  };
  return {
    cols, rowCount, gap: Number.parseFloat(page.gap),
    weights: page["grid-template-rows"].includes("1.08fr") ? [1.08, 1] : Array(rowCount).fill(1),
    panels: ids.map(id => {
      const panel = style(`.kisara-comic-panel.is-${id}`, width, height);
      return { id, column: range(panel["grid-column"], cols), row: range(panel["grid-row"], rowCount),
        x: Number.parseFloat(panel["--comic-focus-x"]) / 100, y: Number.parseFloat(panel["--comic-focus-y"]) / 100 };
    }),
  };
}

test("five original-page derivatives retain native linework and a bounded deferred payload", async () => {
  sharp.concurrency(2);
  assert.equal(manifest.panels.length, 5);
  let total = 0;
  for (const panel of manifest.panels) {
    const bytes = readFileSync(new URL(`../public/themes/kisara/assets/home-comic/${panel.file}`, import.meta.url));
    const meta = await sharp(bytes).metadata();
    const { crop, sourceSize } = panel;
    assert.deepEqual([meta.width, meta.height], [crop.width, crop.height]);
    assert.equal(meta.hasAlpha, false);
    assert.ok(crop.left + crop.width <= sourceSize[0] && crop.top + crop.height <= sourceSize[1]);
    assert.ok((await sharp(bytes).resize({ width: 160 }).stats()).channels[0].stdev > 25);
    assert.ok(opening.includes(`file: "${panel.file}", width: ${crop.width}, height: ${crop.height}`));
    if (crop.width === sourceSize[0] && crop.height === sourceSize[1]) {
      assert.equal(createHash("sha256").update(bytes).digest("hex"), panel.sourceSha256, "Whole pages must not be re-encoded");
    }
    total += bytes.length;
  }
  assert.ok(total < 450_000, `Five manga images total ${total} bytes`);
  assert.match(opening, /data-comic-src=/);
  assert.doesNotMatch(opening, /loading="eager"|fetchpriority="high"/);
});

test("desktop, tablet, phone and short landscape grids have no holes or overlapping panels", () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568], [740, 390], [844, 390], [640, 480]]) {
    const { cols, rowCount, panels } = grid(width, height);
    const cells = Array(cols * rowCount).fill(0);
    for (const { column: [left, right], row: [top, bottom] } of panels) {
      assert.ok(left >= 0 && right <= cols && top >= 0 && bottom <= rowCount);
      for (let row = top; row < bottom; row++) {
        for (let col = left; col < right; col++) cells[row * cols + col]++;
      }
    }
    assert.deepEqual(cells, cells.map(() => 1), `${width}x${height}: every cell must have exactly one owner`);
  }
});

test("cover framing preserves the selected eye and mouth regions at representative panel sizes", () => {
  // Source-pixel regions selected from the supplied pages, not inferred face detection.
  const faces = [
    [450, 650, 435, 260],
    [450, 225, 220, 190],
    [728, 208, 105, 164],
    [630, 169, 99, 175],
    [295, 235, 315, 210],
  ];
  for (const [width, height, screenWidth, screenHeight] of [
    [1560, 760, 1920, 1080], [930, 600, 1024, 900],
    [360, 500, 390, 844], [300, 300, 320, 568], [900, 330, 1200, 600],
    [700, 790, 768, 1024], [940, 760, 1024, 1024],
  ]) {
    const { cols, rowCount, gap, weights, panels } = grid(screenWidth, screenHeight);
    const columnWidth = (width - gap * (cols - 1)) / cols;
    const rowUnit = (height - gap * (rowCount - 1)) / weights.reduce((a, b) => a + b, 0);
    panels.forEach((panel, index) => {
      const [left, right] = panel.column, [top, bottom] = panel.row;
      const frameWidth = columnWidth * (right - left) + gap * (right - left - 1) - 4;
      const frameHeight = rowUnit * weights.slice(top, bottom).reduce((a, b) => a + b, 0) + gap * (bottom - top - 1) - 4;
      const { width: sourceWidth, height: sourceHeight } = manifest.panels[index].crop;
      const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
      const visibleWidth = frameWidth / scale, visibleHeight = frameHeight / scale;
      const x = (sourceWidth - visibleWidth) * panel.x, y = (sourceHeight - visibleHeight) * panel.y;
      const [faceX, faceY, faceWidth, faceHeight] = faces[index];
      assert.ok(faceX >= x && faceX + faceWidth <= x + visibleWidth && faceY >= y && faceY + faceHeight <= y + visibleHeight,
        `${panel.id} at ${screenWidth}x${screenHeight} crops the selected expression`);
    });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { findGlyphCounter, measureTitleChainCounter } from "../src/themes/kisara/lib/titleChainCounter.ts";
import { fitTitleChainConnector } from "../src/themes/kisara/lib/titleChainRig.ts";

function ringMask(width = 128, height = 128) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 60; y <= 98; y++) {
    for (let x = 16; x <= 52; x++) {
      if (x < 23 || x > 45 || y < 68 || y > 90) pixels[(y * width + x) * 4 + 3] = 255;
    }
  }
  return pixels;
}

test("counter detection ignores exterior transparency and returns a point inside the enclosed aperture", () => {
  const pixels = ringMask();
  const counter = findGlyphCounter(pixels, 128, 128)!;
  assert.deepEqual(counter, { x: 34.5, y: 79.5, radiusX: 11.5, radiusY: 11.5 });
  for (let x = 0; x < 24; x++) pixels[(79 * 128 + x) * 4 + 3] = 0;
  assert.equal(findGlyphCounter(pixels, 128, 128), null, "An open contour is not a glyph counter");
  assert.equal(findGlyphCounter(new Uint8ClampedArray(16), 128, 128), null);
});

test("the actual serif a raster has a detected enclosed counter, including a lower-resolution mask", async () => {
  for (const size of [64, 128]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <text x="${size / 16}" y="${size * .8125}" font-family="Georgia" font-weight="700"
        font-size="${size * .75}" fill="white">a</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = new Uint8ClampedArray(data);
    const counter = findGlyphCounter(mask, info.width, info.height)!;
    assert.ok(counter && counter.radiusX > 1 && counter.radiusY > 1);
    assert.equal(mask[(Math.floor(counter.y) * size + Math.floor(counter.x)) * 4 + 3], 0);
  }
});

test("the bounded font probe maps its counter into the measured glyph box and tolerates readback failure", () => {
  let reads = 0;
  const context = {
    canvas: { width: 0, height: 0 }, font: "", textBaseline: "", fillStyle: "",
    measureText: () => ({ width: 56, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 0 }),
    fillText(text: string, x: number, y: number) {
      assert.deepEqual([text, x, y], ["a", 8, 104]);
    },
    getImageData(x: number, y: number, width: number, height: number) {
      reads++;
      assert.deepEqual([x, y, width, height], [0, 0, 128, 128]);
      return { data: ringMask() };
    }
  };
  const glyph = { left: 200, right: 312, top: 100, bottom: 200 };
  const counter = measureTitleChainCounter(context as unknown as CanvasRenderingContext2D,
    { fontWeight: "700", fontFamily: "Georgia" }, glyph)!;
  assert.deepEqual(counter, { x: 253, y: 151, radiusX: 23, radiusY: 23 });
  assert.equal(reads, 1);
  assert.equal(context.canvas.width * context.canvas.height * 4, 65_536);
  Object.assign(context, {
    measureText: () => ({ width: 56, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: -8, actualBoundingBoxRight: 48 })
  });
  const inkCounter = measureTitleChainCounter(context as unknown as CanvasRenderingContext2D,
    { fontWeight: "700", fontFamily: "Georgia" }, glyph)!;
  assert.ok(Math.abs(inkCounter.x - (200 + (34.5 - 8 - 8) * 112 / 40)) < 1e-8,
    "Counter position must be relative to painted ink, not the glyph advance width");
  context.getImageData = () => { throw new Error("Readback unavailable"); };
  assert.equal(measureTitleChainCounter(context as unknown as CanvasRenderingContext2D,
    { fontWeight: "700", fontFamily: "Georgia" }, glyph), null);
  assert.equal(measureTitleChainCounter(null, { fontWeight: "700", fontFamily: "Georgia" }, glyph), null);
});

test("side-on wire tips land inside the rotated neighboring apertures at bends", () => {
  for (const angle of [-0.6, 0, 0.6]) {
    const before = { x: -20, y: -10, tangentX: Math.cos(angle), tangentY: Math.sin(angle), plane: "back" };
    const after = { x: 20, y: 10, tangentX: Math.cos(angle), tangentY: -Math.sin(angle), plane: "front" };
    const sample = { x: 2, y: 7, angle: 0, crossing: false };
    const scale = fitTitleChainConnector(sample, before, after, 28);
    const halfSpan = 28 * scale * .45;
    const tips = [-1, 1].map(side => ({
      x: sample.x + Math.cos(sample.angle) * halfSpan * side,
      y: sample.y + Math.sin(sample.angle) * halfSpan * side
    }));
    const anchors = [
      { x: before.x + before.tangentX * 28 * .34, y: before.y + before.tangentY * 28 * .34 },
      { x: after.x - after.tangentX * 28 * .34, y: after.y - after.tangentY * 28 * .34 }
    ];
    tips.forEach((tip, i) => assert.ok(Math.hypot(tip.x - anchors[i].x, tip.y - anchors[i].y) < 1e-8));
    assert.equal(sample.crossing, false);
    assert.ok(Number.isFinite(scale) && scale > 0);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { titleDataStreamFragment } from "../src/themes/kisara/lib/titleDataStream.ts";

const home = readFileSync(new URL("../src/themes/kisara/pages/HomePage.astro", import.meta.url), "utf8");
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => {
  const p = clamp((x - a) / (b - a), 0, 1);
  return p * p * (3 - 2 * p);
};
const scalarSource = titleDataStreamFragment
  .replace(/float (title\w+)\(([^)]*)\)/g, (_all, name, args) => `function ${name}(${args.replace(/float /g, "")})`);
const scalar = vm.runInNewContext(`${scalarSource}; ({ titleCellMask, titleAmbientCellMask })`, {
  clamp, smoothstep: smooth, mix: (a: number, b: number, p: number) => a + (b - a) * p
});

test("idle liquid retains the historical zero-threshold cells, independent of the highlight band", () => {
  for (let i = 0; i <= 1000; i++) {
    const noise = i / 1000;
    const legacy = 1 - smooth(noise - .16, noise + .16, 0);
    assert.equal(scalar.titleAmbientCellMask(noise, 1), legacy);
    assert.equal(scalar.titleAmbientCellMask(noise, 0), 1);
    assert.equal(scalar.titleCellMask(noise, -.16), 1);
    assert.equal(scalar.titleCellMask(noise, 1.16), 0);
  }
  assert.equal(scalar.titleAmbientCellMask(0, 1), .5);
  assert.ok(scalar.titleAmbientCellMask(.08, 1) < 1);
  assert.doesNotMatch(titleDataStreamFragment, /uFlowFront|uDataOpacity|uDataMoving|position|bandReach|texture\(/);
  assert.match(home, /titleAmbientCellMask\(dissolveNoise, finalFlow\)/);
  assert.match(home, /vec3\(1\.0, 0\.82, 0\.94\) \* titleColor\.a, 1\.0 - materialMask/);
  assert.doesNotMatch(home, /uDataOpacity|uDataMoving|applyTitleDataStream/);
});

test("the historical grid varies at rest across the whole word without creating pixels outside its mask", () => {
  const fract = (x: number) => x - Math.floor(x);
  const hash = (x: number, y: number) => {
    x = fract(x * 123.34);
    y = fract(y * 456.21);
    const dot = x * (x + 45.32) + y * (y + 45.32);
    return fract((x + dot) * (y + dot));
  };
  const mask = (x: number, y: number, time: number) => {
    const noise = hash(Math.floor(x / 9), Math.floor(y / 9)) * .58
      + (.5 + .5 * Math.sin(x * .045 - y * .072 + time * 4.2)) * .42;
    return scalar.titleAmbientCellMask(noise, 1);
  };
  for (let region = 0; region < 5; region++) {
    let active = 0;
    let changing = 0;
    for (let x = region * 180; x < (region + 1) * 180; x += 3) {
      for (let y = 0; y < 180; y += 3) {
        const a = mask(x, y, 0);
        const b = mask(x, y, .7);
        if (a < .999) active++;
        if (Math.abs(a - b) > .01) changing++;
        assert.ok(a >= .5 && a <= 1);
        assert.equal(0 * a, 0, "Transparent glyph pixels must remain transparent");
      }
    }
    assert.ok(active > 10 && changing > 10, `Region ${region} must animate without pointer movement`);
  }
  assert.match(home, /hash21\(floor\(pixel \/ 9\.0\)\)/);
  assert.match(home, /sin\(pixel\.x \* 0\.045 - pixel\.y \* 0\.072 \+ uTime \* 4\.2\)/);
});

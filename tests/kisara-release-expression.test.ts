import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { getTitleReconstructionFrame, gateRelease } from "../src/themes/kisara/lib/gateRelease.ts";

const home = readFileSync(new URL("../src/themes/kisara/pages/HomePage.astro", import.meta.url), "utf8");
const between = (name: string, next: string) =>
  home.slice(home.indexOf(`const ${name} =`), home.indexOf(`const ${next} =`));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const smooth = (value: number) => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
const smootherstep = (value: number) => value ** 3 * (value * (value * 6 - 15) + 10);

test("title reconstruction has distinct scatter and regroup phases without lengthening the release", () => {
  assert.equal(gateRelease.duration, 610);
  const start = getTitleReconstructionFrame(0);
  assert.deepEqual(start, { opacity: 0, sourceOpacity: 1, fallbackOpacity: 1, release: 0, dissolve: 0, finalFlow: 0 });
  for (const p of [.42, .43, .44]) {
    const gap = getTitleReconstructionFrame(p);
    assert.equal(gap.sourceOpacity, 0, "DOM lettering cannot fill the holes in the dissolving shader");
    assert.equal(gap.dissolve, 1);
    assert.equal(gap.fallbackOpacity, 0);
    assert.equal(gap.finalFlow, 0, "The liquid surface waits until regrouping starts");
  }
  assert.deepEqual(getTitleReconstructionFrame(1), {
    opacity: 1, sourceOpacity: 0, fallbackOpacity: 1, release: 0, dissolve: 0, finalFlow: 1
  });
  let last = start;
  for (let i = 1; i <= 1000; i++) {
    const frame = getTitleReconstructionFrame(i / 1000);
    for (const key of Object.keys(frame) as (keyof typeof frame)[]) {
      assert.ok(Number.isFinite(frame[key]) && frame[key] >= 0 && frame[key] <= 1);
      assert.ok(Math.abs(frame[key] - last[key]) < .014, `${key} must not jump`);
    }
    assert.ok(Math.abs(frame.opacity + frame.sourceOpacity - 1) < 1e-12);
    last = frame;
  }
  for (const p of [NaN, -1, -Infinity]) assert.deepEqual(getTitleReconstructionFrame(p), start);
  assert.deepEqual(getTitleReconstructionFrame(2), getTitleReconstructionFrame(1));
});

test("legacy cell dissolve masks both premultiplied color and liquid trails, with exact endpoints", () => {
  const shader = between("createTitleLensRenderer", "drawSpaceLens");
  assert.match(shader, /hash21\(floor\(pixel \/ 9\.0\)\)/);
  assert.match(shader, /pixel\.x \* 0\.045 - pixel\.y \* 0\.072 \+ uTime \* 4\.2/);
  assert.match(shader, /titleColor\.rgb \* edge \* dissolveMask \* uOpacity/);
  assert.match(shader, /trailAlpha \* edge \* dissolveMask \* clamp\(uOpacity/);
  assert.match(shader, /mix\(-0\.16, 1\.16, clamp\(uDissolve/);
  for (let i = 0; i <= 1000; i++) {
    const noise = i / 1000;
    const mask = (dissolve: number) => 1 - smooth((-.16 + 1.32 * dissolve - (noise - .16)) / .32);
    assert.equal(mask(0), 1);
    assert.equal(mask(1), 0);
  }
});

test("ash follows a stable inward curve and ends at the heart rather than exploding or shaking", () => {
  const sample = vm.runInNewContext(between("sampleChainAsh", "drawChainShatterParticles") + "; sampleChainAsh;",
    { clamp, easeOutCubic });
  for (const [x, y] of [[20, 40], [200, 300], [1000, 80]]) {
    for (const bend of [-16, 0, 16]) {
      const start = sample(x, y, 520, 140, bend, 0);
      assert.equal(start.x, x);
      assert.equal(start.y, y);
      const end = sample(x, y, 520, 140, bend, 1);
      assert.equal(end.x, 520);
      assert.equal(end.y, 140);
      let previousProjection = 0;
      const dx = 520 - x, dy = 140 - y;
      for (let i = 0; i <= 100; i++) {
        const point = sample(x, y, 520, 140, bend, i / 100);
        const projection = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy);
        assert.ok(projection >= previousProjection - 1e-10 && projection <= 1 + 1e-10);
        previousProjection = projection;
      }
    }
  }
});

test("production ash remains bounded and the release trace respects glyph layers without flashes", () => {
  let fills = 0;
  const context = new Proxy({ fill() { fills++; }, save() {}, restore() {} }, {
    get(target, key) { return key in target ? target[key as keyof typeof target] : () => {}; },
    set() { return true; }
  });
  const state = {
    clamp, easeOutCubic, smootherstep, fullTurn: Math.PI * 2,
    chainTitleBox: { left: 0, top: 0, width: 1100, height: 220 }, chainGlyphLayout: {},
    getChainLinkDimensions: () => ({ width: 32, height: 18 }), randomSeed: () => .5
  };
  const draw = vm.runInNewContext(between("sampleChainAsh", "createContractHeartPath") + "; drawChainShatterParticles;", state);
  const records = Array.from({ length: 200 }, (_, i) => ({
    sample: { x: 40, y: 60, angle: 0 }, definition: { id: i % 3 }, age: .35, alpha: 1, heat: 1, seed: .3
  }));
  for (const mobile of [false, true]) {
    fills = 0;
    draw(context, records, mobile);
    assert.equal(fills, (mobile ? 36 : 72) * 2);
    fills = 0;
    draw(context, records.filter(record => record.definition.id === 0), mobile);
    assert.equal(fills, (mobile ? 12 : 24) * 2, "One strand cannot use the other strands' particle budget");
  }
  const rupture = between("drawChainRupture", "drawTitleChains");
  assert.doesNotMatch(rupture, /shadowBlur|createRadialGradient|Math\.sin|Math\.cos/);
  assert.match(rupture, /previous\.plane === sample\.plane/);
  assert.match(rupture, /sample\.plane === "back" \? chainBackContext : chainFrontContext/);
  assert.match(rupture, /sampleTitleChainTravel/);
});

test("missing title GPU uses the same dissolve envelope without leaving the final title hidden", () => {
  const styles = new Map();
  const draw = vm.runInNewContext(between("drawTitleLens", "glitchAlphabet") + "; drawTitleLens;", {
    titleLensRenderer: null, titleLensCanvas: null,
    gate: { style: { setProperty: (key: string, value: string) => styles.set(key, value) } }
  });
  for (const p of [0, .2, .43, .7, 1]) {
    const frame = getTitleReconstructionFrame(p);
    draw(1000, frame);
    assert.equal(styles.get("--kisara-title-source-opacity"), frame.fallbackOpacity.toFixed(4));
  }
  draw(2000, { opacity: 1, sourceOpacity: 0, finalFlow: 1 });
  assert.equal(styles.get("--kisara-title-source-opacity"), "1.0000");
});

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { getTitleReconstructionFrame, getTitleContractFrame, getContractReleaseFrame, gateRelease, getReconstructionProgress, mapReleaseAutoplayProgress, mapChargeIntroProgress } from "../src/themes/kisara/lib/gateRelease.ts";

const home = readFileSync(new URL("../src/themes/kisara/pages/HomePage.astro", import.meta.url), "utf8");
const between = (name: string, next: string) =>
  home.slice(home.indexOf(`const ${name} =`), home.indexOf(`const ${next} =`));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const smooth = (value: number) => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
const smootherstep = (value: number) => value ** 3 * (value * (value * 6 - 15) + 10);

test("reconstruction starts from the erased contract and only rebuilds the title", () => {
  assert.equal(gateRelease.duration, 800);
  const start = getTitleReconstructionFrame(0);
  assert.deepEqual(start, { opacity: 1, sourceOpacity: 0, fallbackOpacity: 0, release: 0, dissolve: 1,
    contractCharge: 0, contractSweep: 0, finalFlow: 0 });
  assert.deepEqual(getTitleReconstructionFrame(1), {
    opacity: 1, sourceOpacity: 0, fallbackOpacity: 1, release: 0, dissolve: 0,
    contractCharge: 0, contractSweep: 0, finalFlow: 1
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

test("the title uses the historical dissolve mask rather than later floating packets", () => {
  const shader = between("createTitleLensRenderer", "drawSpaceLens");
  assert.doesNotMatch(shader, /uBlockMix|spreadSource|packetUv|packetMask/);
  assert.match(shader, /hash21\(floor\(pixel \/ 9\.0\)\)/);
  assert.match(shader, /sin\(pixel\.x \* 0\.045 - pixel\.y \* 0\.072 \+ uTime \* 4\.2\)/);
  assert.match(shader, /titleCellMask\(\s*dissolveNoise, mix\(-0\.16, 1\.16, clamp\(uDissolve, 0\.0, 1\.0\)\)/);
  assert.match(shader, /titleColor\.rgb \* edge \* dissolveMask \* uOpacity/);
  assert.match(shader, /trailOutputAlpha = trailAlpha \* edge \* dissolveMask/);

});

test("the heart exit starts dissolution before the smoke handoff, not during reconstruction", () => {
  assert.equal(getTitleContractFrame(.47).dissolve, 0);
  assert.ok(getTitleContractFrame(.56).dissolve > .15);
  assert.ok(getContractReleaseFrame(.56).exit > .4);
  assert.ok(getTitleContractFrame(.66).dissolve > .65);
  assert.equal(getTitleContractFrame(.78).dissolve, 1);
  assert.deepEqual(getTitleContractFrame(gateRelease.introHandoff), getTitleReconstructionFrame(0));
  for (const intro of [.78, .8, .84, .86, 1]) {
    assert.equal(getTitleContractFrame(intro).dissolve, 1);
    assert.equal(getTitleContractFrame(intro).sourceOpacity, 0);
    assert.equal(getTitleContractFrame(intro).contractCharge, 0);
  }
  const shots = Array.from({ length: gateRelease.introDuration + 1 }, (_, ms) =>
    getTitleContractFrame(Math.min(gateRelease.introHandoff, mapChargeIntroProgress(ms / gateRelease.introDuration))));
  const firstErased = shots.findIndex(frame => frame.dissolve === 1);
  assert.ok(firstErased < gateRelease.introDuration * .7, "Erasure finishes before the carrier handoff");
  for (const frame of shots) assert.equal(frame.finalFlow, 0);
  const frames = Array.from({ length: gateRelease.duration + 1 }, (_, ms) =>
    getTitleReconstructionFrame(getReconstructionProgress(mapReleaseAutoplayProgress(ms / gateRelease.duration))));
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].dissolve <= frames[i - 1].dissolve, "No second dissolve during reconstruction");
    assert.equal(frames[i].release, 0);
  }
});

test("chain release feeds a converging glyph trace and the heart pulse, with reversible phase ownership", () => {
  const frames = Array.from({ length: 1001 }, (_, i) => getTitleContractFrame(i / 1000));
  assert.ok(getTitleContractFrame(.25).contractCharge > .5);
  assert.ok(getTitleContractFrame(.39).contractCharge > .4);
  assert.equal(getTitleContractFrame(.47).contractCharge, 0);
  assert.ok(getTitleContractFrame(.3).contractSweep > getTitleContractFrame(.2).contractSweep);
  for (let i = 1; i < frames.length; i++) {
    for (const key of Object.keys(frames[i]) as (keyof typeof frames[number])[]) {
      assert.ok(Number.isFinite(frames[i][key]));
      assert.ok(Math.abs(frames[i][key] - frames[i - 1][key]) < .04, key);
    }
    assert.ok(frames[i].dissolve >= frames[i - 1].dissolve);
  }
  const shader = between("createTitleLensRenderer", "drawSpaceLens");
  assert.match(shader, /abs\(vUv\.x - 0\.5\).*uContractSweep/);
  assert.match(shader, /vec3\(1\.0, 0\.9, 0\.95\) \* titleColor\.a, contractLight/);
  assert.match(shader, /uniforms\.contractCharge, parameters\.contractCharge \?\? 0/);
  assert.match(shader, /uniforms\.contractSweep, parameters\.contractSweep \?\? 0/);
});

test("the heart is drawn, pulses once and disperses before the reachable shot handoff", () => {
  const start = getContractReleaseFrame(0);
  for (const key of ["etch", "gather", "opacity", "draw"] as const) assert.equal(start[key], 0);
  assert.ok(getContractReleaseFrame(.16).etch > .9);
  assert.ok(getContractReleaseFrame(.28).opacity > .65);
  assert.equal(getContractReleaseFrame(.32).draw, 1);
  assert.equal(getContractReleaseFrame(.39).pulse, 1);
  assert.ok(getContractReleaseFrame(.56).opacity < .6);
  const end = getContractReleaseFrame(gateRelease.introHandoff);
  assert.equal(end.opacity, 0);
  assert.equal(end.gather, 0);
  assert.equal(end.etch, 0);
  assert.equal(end.exit, 1);
  const frames = Array.from({ length: 661 }, (_, i) => getContractReleaseFrame(i / 1000));
  for (let i = 1; i < frames.length; i++) {
    for (const key of Object.keys(start) as (keyof typeof start)[]) {
      assert.ok(Number.isFinite(frames[i][key]));
      assert.ok(Math.abs(frames[i][key] - frames[i - 1][key]) < .03);
    }
  }
  const heart = between("drawContractHeartImprint", "drawChainRupture");
  assert.doesNotMatch(heart, /timestamp \*|createRadialGradient|shadowBlur|0\.68|0\.695/);
  assert.match(heart, /context\.setLineDash/);
});

test("glyph etching uses the measured font and baseline, stays bounded and clears outside release", () => {
  const strokes: unknown[][] = [];
  let fills = 0;
  const context = new Proxy({
    strokeText(...args: unknown[]) { strokes.push(args); },
    fillText() { fills++; },
    createLinearGradient() { return { addColorStop() {} }; }
  }, {
    get(target, key: string) { return key in target ? target[key as keyof typeof target] : () => {}; },
    set(target, key: string, value) { (target as Record<string, unknown>)[key] = value; return true; }
  });
  const state = {
    getContractReleaseFrame, chainFrontContext: context,
    chainTitleBox: { top: 70, height: 210 },
    chainGlyphLayout: { font: "700 300px Georgia", textLeft: 100, textRight: 1000, baseline: 300, widthScale: .8 }
  };
  const draw = vm.runInNewContext(between("drawTitleSealEtching", "drawContractHeartImprint")
    + "; drawTitleSealEtching;", state);
  for (const p of [0, .14, .26, .4, .66, 1, .26, 0]) {
    strokes.length = 0;
    fills = 0;
    draw(p, 1, false);
    assert.equal(strokes.length, getContractReleaseFrame(p).etch > .002 ? 3 : 0);
    assert.equal(fills, getContractReleaseFrame(p).etch > .002 ? 1 : 0);
    assert.ok(strokes.every(args => args[0] === "Kisara"));
  }
  assert.equal((context as any).font, "700 300px Georgia");
  assert.doesNotMatch(between("drawTitleSealEtching", "drawContractHeartImprint"),
    /getBoundingClientRect|getImageData|createElement|shadowBlur/);
});

test("production heart drawing is deterministic across pause and rewind, with no unreachable exit", () => {
  const calls: unknown[][] = [];
  let depth = 0;
  const gradient = { addColorStop: (...args: unknown[]) => calls.push(["stop", ...args]) };
  const context = new Proxy({
    save() { depth++; }, restore() { depth--; },
    createLinearGradient(...args: unknown[]) { calls.push(["gradient", ...args]); return gradient; }
  }, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value));
        calls.push([key, ...args]);
      };
    },
    set(_target, key, value) { calls.push([key, value]); return true; }
  });
  class Path {
    moveTo() {} bezierCurveTo() {} closePath() {}
  }
  const code = between("sampleChainAsh", "drawChainShatterParticles")
    + between("createContractHeartPath", "drawTitleSealEtching")
    + between("drawContractHeartImprint", "drawChainRupture") + "; drawContractHeartImprint;";
  const draw = vm.runInNewContext(code, {
    Path2D: Path, getContractReleaseFrame, clamp, easeOutCubic,
    phaseProgress: (p: number, a: number, b: number) => smooth((p - a) / (b - a)),
    chainFrontContext: context, chainBackContext: context,
    chainTitleBox: { left: 100, top: 80, width: 1000, height: 210 }, chainGlyphLayout: {}
  });
  const events = [{ breakSample: { x: 450, y: 140 } }, { breakSample: { x: 740, y: 260 } }];
  for (const intro of [.17, .26, .39, .56, .66, .56, .39, 0]) {
    calls.length = 0;
    draw(1000, intro, events, 1, false);
    const first = JSON.stringify(calls);
    assert.equal(depth, 0);
    if (intro === .66 || intro === 0) assert.equal(calls.length, 0);
    else assert.ok(calls.some(call => call[0] === "stroke"));
    calls.length = 0;
    draw(8000, intro, events, 1, false);
    assert.equal(JSON.stringify(calls), first, "Timestamp cannot restart the seal pulse or scatter");
    assert.equal(depth, 0);
  }
});

test("legacy cell dissolve masks both premultiplied color and liquid trails, with exact endpoints", () => {
  const shader = between("createTitleLensRenderer", "drawSpaceLens");
  assert.match(shader, /hash21\(floor\(pixel \/ 9\.0\)\)/);
  assert.match(shader, /pixel\.x \* 0\.045 - pixel\.y \* 0\.072 \+ uTime \* 4\.2/);
  assert.match(shader, /titleColor\.rgb \* edge \* dissolveMask \* uOpacity/);
  assert.match(shader, /trailAlpha \* edge \* dissolveMask \* clamp\(uOpacity/);
  assert.match(shader, /mix\(-0\.16, 1\.16, clamp\(uDissolve, 0\.0, 1\.0\)\)/);
  for (let i = 0; i <= 1000; i++) {
    const noise = i / 1000;
    const mask = (dissolve: number) => 1 - smooth(((-.16 + dissolve * 1.32) - (noise - .16)) / .32);
    assert.equal(mask(0), 1);
    assert.equal(mask(1), 0);
    for (const dissolve of [.1, .4, .8, .95]) {
      assert.ok(mask(dissolve) >= 0 && mask(dissolve) <= 1);
    }
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

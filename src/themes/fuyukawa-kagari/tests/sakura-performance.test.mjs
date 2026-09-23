import assert from "node:assert/strict";
import test from "node:test";
import { createSakuraController } from "../lib/sakura-runtime.mjs";
import {
  SAKURA_TIER_PROFILES,
  chooseSakuraTier,
  createFrameTimeMonitor,
  limitSakuraTier,
  lowerSakuraTier,
  resolveSakuraTier
} from "../lib/sakura-performance.mjs";

const desktop = {
  viewportWidth: 1440,
  devicePixelRatio: 1,
  hardwareConcurrency: 12,
  deviceMemory: 8
};

test("device capability inputs select high, medium, and low tiers with optional memory ignored", () => {
  assert.equal(chooseSakuraTier(desktop), "high");
  assert.equal(chooseSakuraTier({ ...desktop, devicePixelRatio: 3 }), "high");
  assert.equal(chooseSakuraTier({ ...desktop, viewportWidth: 820 }), "medium");
  assert.equal(chooseSakuraTier({ ...desktop, viewportWidth: 390 }), "low");
  assert.equal(chooseSakuraTier({ ...desktop, hardwareConcurrency: 2 }), "low");
  assert.equal(chooseSakuraTier({ ...desktop, deviceMemory: undefined }), "high");
  assert.equal(chooseSakuraTier({ ...desktop, saveData: true }), "off");
  assert.equal(chooseSakuraTier({ ...desktop, reducedMotion: true }), "off");
});

test("explicit user enable overrides reduced motion at low density while off preference wins", () => {
  assert.equal(resolveSakuraTier({ ...desktop, reducedMotion: true }), "off");
  assert.equal(resolveSakuraTier({ ...desktop, reducedMotion: true }, { preference: "1" }), "low");
  assert.equal(resolveSakuraTier({ ...desktop, saveData: true }, { manualEnable: true }), "low");
  assert.equal(resolveSakuraTier(desktop, { preference: "0" }), "off");
});

test("tier profiles cap particles, DPR, sway and rotation progressively", () => {
  assert.deepEqual(SAKURA_TIER_PROFILES.high, { particles: 16, maxDpr: 1.5, sway: true, rotation: true, shadow: true });
  assert.deepEqual(SAKURA_TIER_PROFILES.medium, { particles: 10, maxDpr: 1.25, sway: true, rotation: false, shadow: false });
  assert.deepEqual(SAKURA_TIER_PROFILES.low, { particles: 4, maxDpr: 1, sway: false, rotation: false, shadow: false });
  assert.deepEqual(SAKURA_TIER_PROFILES.off, { particles: 0, maxDpr: 1, sway: false, rotation: false, shadow: false });
  assert.equal(lowerSakuraTier("high"), "medium");
  assert.equal(lowerSakuraTier("medium"), "low");
  assert.equal(lowerSakuraTier("low"), "off");
  assert.equal(limitSakuraTier("high", "low"), "low");
  assert.equal(limitSakuraTier("low", "high"), "low");
});

test("frame monitor uses a rolling window and requires a sustained two-second over-budget average", () => {
  const monitor = createFrameTimeMonitor({ windowSize: 3, thresholdMs: 24, sustainedMs: 2000, warmupMs: 0 });
  assert.equal(monitor.record(40, 0), false);
  assert.equal(monitor.record(40, 1000), false);
  assert.equal(monitor.record(40, 1999), false);
  assert.equal(monitor.record(40, 2000), true);
  assert.equal(monitor.record(10, 2100), true);

  const recovery = createFrameTimeMonitor({ windowSize: 2, thresholdMs: 24, sustainedMs: 2000, warmupMs: 0 });
  recovery.record(40, 0);
  recovery.record(10, 100);
  assert.equal(recovery.average(), 25);
  recovery.record(10, 200);
  assert.equal(recovery.average(), 10);
  assert.equal(recovery.record(10, 300), false);
});

test("frame monitor warms up for 1.5 seconds before evaluating startup frame costs", () => {
  const monitor = createFrameTimeMonitor({ windowSize: 60, thresholdMs: 24, sustainedMs: 2000, warmupMs: 1500 });
  assert.equal(monitor.record(40, 0), false);
  assert.equal(monitor.record(40, 1499), false);
  assert.equal(monitor.average(), 0);
  assert.equal(monitor.record(40, 1500), false);
  assert.equal(monitor.record(40, 3499), false);
  assert.equal(monitor.record(40, 3500), true);
});

test("30 FPS frame intervals exceed the threshold and degrade after warmup and sustained load", () => {
  const monitor = createFrameTimeMonitor({ thresholdMs: 24, sustainedMs: 2000, warmupMs: 1500 });
  for (let timestamp = 0; timestamp < 1500; timestamp += 33.333) {
    assert.equal(monitor.record(33.333, timestamp), false);
  }
  assert.equal(monitor.record(33.333, 1500), false);
  assert.equal(monitor.record(33.333, 3500), true);
});

class FakeEventTarget {
  events = new Map();
  addEventListener(name, listener) {
    const handlers = this.events.get(name) ?? new Set();
    handlers.add(listener);
    this.events.set(name, handlers);
  }
  removeEventListener(name, listener) {
    this.events.get(name)?.delete(listener);
  }
  dispatch(name) {
    for (const listener of [...(this.events.get(name) ?? [])]) listener({ type: name });
  }
  listenerCount(name) {
    return this.events.get(name)?.size ?? 0;
  }
}

function createRuntimeFixture() {
  const doc = new FakeEventTarget();
  doc.visibilityState = "visible";
  doc.body = { classList: { values: new Set(), toggle(name, force) { force ? this.values.add(name) : this.values.delete(name); } } };
  const media = Object.assign(new FakeEventTarget(), { matches: false });
  const connection = Object.assign(new FakeEventTarget(), { saveData: false });
  const rafs = new Map();
  const idles = new Map();
  const timers = new Map();
  const storage = new Map();
  const storageWrites = [];
  const mainDrawImages = [];
  let preRenderedImageDraws = 0;
  let nextId = 0;
  const context = {
    setTransform() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, drawImage(image) { mainDrawImages.push(image); }
  };
  const canvas = {
    hidden: true, width: 0, height: 0,
    getContext: () => context
  };
  const makeRoot = () => ({
    querySelector: () => canvas,
    getBoundingClientRect: () => ({ width: 1440, height: 900 })
  });
  class FakeImage {
    constructor() { this.complete = true; this.naturalWidth = 96; this.kind = "svg-image"; }
    set src(value) { this.url = value; }
  }
  const win = Object.assign(new FakeEventTarget(), {
    innerWidth: 1440,
    devicePixelRatio: 2,
    navigator: { hardwareConcurrency: 12, deviceMemory: 8, connection },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storageWrites.push([key, value]); storage.set(key, value); }
    },
    Image: FakeImage,
    location: { search: "" },
    matchMedia: () => media,
    requestAnimationFrame(callback) { const id = ++nextId; rafs.set(id, callback); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    requestIdleCallback(callback) { const id = ++nextId; idles.set(id, callback); return id; },
    cancelIdleCallback(id) { idles.delete(id); },
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  doc.createElement = (tagName) => {
    assert.equal(tagName, "canvas");
    const spriteContext = {
      shadowColor: "", shadowBlur: 0,
      drawImage() { preRenderedImageDraws += 1; }
    };
    return {
      kind: "sprite", width: 0, height: 0,
      getContext: () => spriteContext
    };
  };
  doc.querySelector = () => makeRoot();
  const states = [];
  const controller = createSakuraController({ windowRef: win, documentRef: doc, onStateChange: (state) => states.push(state) });
  return { doc, media, win, canvas, connection, rafs, idles, timers, storage, storageWrites, states, controller, makeRoot, mainDrawImages, get preRenderedImageDraws() { return preRenderedImageDraws; } };
}

test("controller starts after idle, pauses while hidden, and cleans up across view swaps", () => {
  const fixture = createRuntimeFixture();
  const firstRoot = fixture.makeRoot();
  fixture.controller.mount(firstRoot);
  fixture.controller.mount(firstRoot);
  assert.equal(fixture.controller.isEnabled(), true);
  assert.equal(fixture.controller.getTier(), "high");
  assert.equal(fixture.doc.listenerCount("visibilitychange"), 1);
  assert.equal(fixture.win.listenerCount("resize"), 1);
  assert.equal(fixture.media.listenerCount("change"), 1);
  assert.equal(fixture.connection.listenerCount("change"), 1);
  assert.equal(fixture.idles.size, 1);
  assert.equal(fixture.rafs.size, 0);

  const idleStart = [...fixture.idles.values()][0];
  fixture.idles.clear();
  idleStart();
  assert.equal(fixture.rafs.size, 1);
  const firstFrame = fixture.rafs.entries().next().value;
  fixture.rafs.delete(firstFrame[0]);
  firstFrame[1](0);
  assert.ok(fixture.preRenderedImageDraws > 0);
  assert.ok(fixture.mainDrawImages.length > 0);
  assert.ok(fixture.mainDrawImages.every((image) => image.kind === "sprite"), "animation frames draw only cached canvas sprites");
  fixture.doc.visibilityState = "hidden";
  fixture.doc.dispatch("visibilitychange");
  assert.equal(fixture.rafs.size, 0);
  fixture.doc.visibilityState = "visible";
  fixture.doc.dispatch("visibilitychange");
  assert.equal(fixture.idles.size, 1);

  fixture.controller.destroy();
  assert.equal(fixture.doc.listenerCount("visibilitychange"), 0);
  assert.equal(fixture.win.listenerCount("resize"), 0);
  assert.equal(fixture.media.listenerCount("change"), 0);
  assert.equal(fixture.connection.listenerCount("change"), 0);
  assert.equal(fixture.rafs.size, 0);
  assert.equal(fixture.idles.size, 0);
  fixture.controller.mount(fixture.makeRoot());
  assert.equal(fixture.doc.listenerCount("visibilitychange"), 1);
  assert.equal(fixture.win.listenerCount("resize"), 1);
  assert.equal(fixture.media.listenerCount("change"), 1);
  assert.equal(fixture.connection.listenerCount("change"), 1);
  fixture.controller.destroy();
  assert.equal(fixture.media.listenerCount("change"), 0);
  assert.equal(fixture.connection.listenerCount("change"), 0);
});

test("reduced-motion changes disable by default and honor a manual low-density override", () => {
  const fixture = createRuntimeFixture();
  fixture.controller.mount(fixture.makeRoot());
  fixture.media.matches = true;
  fixture.media.dispatch("change");
  assert.equal(fixture.controller.isEnabled(), false);
  assert.equal(fixture.controller.getTier(), "off");
  assert.equal(fixture.doc.body.classList.values.has("hide-sakura"), true);
  fixture.controller.setUserEnabled(true);
  assert.equal(fixture.controller.isEnabled(), true);
  assert.equal(fixture.controller.getTier(), "low");
  assert.equal(fixture.canvas.hidden, false);
  assert.equal(fixture.doc.body.classList.values.has("hide-sakura"), false);
  assert.equal(fixture.storage.get("yuimi-sakura-enabled-v1"), "1");
  fixture.controller.setUserEnabled(false);
  assert.equal(fixture.controller.isEnabled(), false);
  assert.equal(fixture.doc.body.classList.values.has("hide-sakura"), true);
  assert.equal(fixture.states.at(-1).enabled, false);
  assert.deepEqual(fixture.storageWrites, [["yuimi-sakura-enabled-v1", "1"], ["yuimi-sakura-enabled-v1", "0"]]);
  fixture.controller.destroy();
});

test("sustained slow frames lower tiers to off and never schedule a second RAF loop", () => {
  const fixture = createRuntimeFixture();
  fixture.storage.set("yuimi-sakura-enabled-v1", "1");
  fixture.controller.mount(fixture.makeRoot());
  const runFrame = (timestamp) => {
    const entry = fixture.rafs.entries().next().value;
    assert.ok(entry, "one RAF callback is pending");
    const [id, callback] = entry;
    fixture.rafs.delete(id);
    callback(timestamp);
    assert.ok(fixture.rafs.size <= 1);
  };
  for (let time = 0; time <= 10; time += 10) {
    const idle = fixture.idles.values().next().value;
    if (idle) { fixture.idles.clear(); idle(); }
    if (fixture.rafs.size) break;
  }
  assert.equal(fixture.rafs.size, 1);
  runFrame(0);
  for (let time = 34; time <= 4000 && fixture.controller.getTier() === "high"; time += 34) runFrame(time);
  assert.equal(fixture.controller.getTier(), "medium");
  for (let time = 4034; time <= 6500 && fixture.controller.getTier() === "medium"; time += 34) runFrame(time);
  assert.equal(fixture.controller.getTier(), "low");
  for (let time = 6534; time <= 9000 && fixture.controller.isEnabled(); time += 34) runFrame(time);
  assert.equal(fixture.controller.getTier(), "off");
  assert.equal(fixture.controller.isEnabled(), false);
  assert.equal(fixture.rafs.size, 0);
  assert.equal(fixture.storage.get("yuimi-sakura-enabled-v1"), "1", "automatic off preserves the user's explicit stored preference");
  assert.deepEqual(fixture.storageWrites, [], "automatic tier changes never persist preferences");
  assert.equal(fixture.win.__yuimiSakuraSession, undefined, "runtime session state stays module-private");
  fixture.controller.destroy();
});

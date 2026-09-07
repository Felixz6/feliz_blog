import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindHomeEvent, visibleSceneRatio } from "../src/themes/kisara/lib/homeEvent.ts";
import { createFrameQueue } from "../src/themes/kisara/lib/frameQueue.ts";

setMaxListeners(0);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function fixture(reduced = false) {
  class Node extends EventTarget {
    dataset: Record<string, string> = {};
    attributes = new Map<string, string>();
    style = { transform: "" };
    hidden = false;
    tabIndex = 0;
    focused = false;
    textContent = "";
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    getAttribute(key: string) { return this.attributes.get(key) ?? null; }
    hasAttribute(key: string) { return this.attributes.has(key); }
    removeAttribute(key: string) { this.attributes.delete(key); }
    toggleAttribute(key: string, value: boolean) { if (value) this.attributes.set(key, ""); else this.attributes.delete(key); }
    focus() { this.focused = true; }
  }
  const source = new Node() as Node & { src: string };
  source.dataset.src = "/fragment.mp4";
  Object.defineProperty(source, "src", { set(value: string) { source.setAttribute("src", value); } });
  const timers = new Map<number, Function>();
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  let id = 0;
  let rect = { top: 2100, bottom: 3000, height: 900 };
  const playPromises: Array<() => Promise<void>> = [];
  const video = Object.assign(new Node(), {
    currentTime: 0,
    duration: 1.292958,
    paused: true,
    ended: false,
    preload: "none",
    loads: 0,
    plays: 0,
    pauses: 0,
    load() { this.loads++; },
    play() {
      this.plays++;
      this.paused = false;
      return playPromises.shift()?.() ?? Promise.resolve();
    },
    pause() {
      this.pauses++;
      if (!this.paused) { this.paused = true; this.dispatchEvent(new Event("pause")); }
    },
    querySelector() { return source; },
  });
  const selectors = new Map([
    ["[data-home-event-video]", video],
  ]);
  const root = Object.assign(new Node(), {
    getBoundingClientRect: () => rect,
    querySelector: (selector: string) => selectors.get(selector),
  });
  const observers: FakeObserver[] = [];
  class FakeObserver {
    disconnected = false;
    callback: Function;
    constructor(callback: Function) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
    emit(intersecting = true) { this.callback([{ isIntersecting: intersecting }]); }
  }
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), {
    innerHeight: 900,
    matchMedia: () => motion,
    setTimeout(callback: Function) { const next = ++id; timers.set(next, callback); return next; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const globals = { window, document, IntersectionObserver: FakeObserver };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { configurable: true, value }));
  const runtime = bindHomeEvent(root as unknown as HTMLElement);
  const show = () => { rect = { top: 0, bottom: 900, height: 900 }; observers[1].emit(); };
  const hide = () => { rect = { top: -1000, bottom: -100, height: 900 }; observers[1].emit(false); };
  return {
    video, root, timers, observers, motion, document, window, playPromises,
    runtime, show, hide,
    destroy() {
      runtime.destroy();
      originals.forEach((descriptor, key) => {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      });
    },
  };
}

test("003 warms once near the viewport and only plays while actually visible", async () => {
  const f = fixture();
  try {
    assert.equal(f.video.loads, 0);
    assert.equal(f.video.plays, 0);
    f.observers[0].emit();
    f.observers[0].emit();
    assert.equal(f.video.loads, 1);
    assert.equal(f.video.plays, 0);
    f.show();
    await flush();
    assert.equal(f.video.plays, 1);
    f.video.dispatchEvent(new Event("playing"));
    f.hide();
    assert.equal(f.video.paused, true);
    assert.equal(f.timers.size, 0);
  } finally { f.destroy(); }
});

test("003 pauses in a hidden document and resumes the held position without replaying a completed clip", async () => {
  const f = fixture();
  try {
    f.show(); await flush();
    f.video.currentTime = .6;
    f.document.hidden = true;
    f.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(f.video.paused, true);
    f.observers[1].emit();
    assert.equal(f.video.plays, 1);
    f.document.hidden = false;
    f.document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    assert.equal(f.video.currentTime, .6);
    assert.equal(f.video.plays, 2);
    f.video.ended = true;
    f.video.dispatchEvent(new Event("ended"));
    f.hide(); f.show(); await flush();
    assert.equal(f.video.plays, 2);
  } finally { f.destroy(); }
});

test("003 reduced motion keeps the one-shot background still and deferred", async () => {
  const f = fixture(true);
  try {
    f.observers[0].emit(); f.show(); await flush();
    assert.equal(f.video.loads, 0);
    assert.equal(f.video.plays, 0);
    f.hide(); f.show(); await flush();
    assert.equal(f.video.loads, 0);
    assert.equal(f.video.plays, 0);
  } finally { f.destroy(); }
});

test("003 a stale play promise cannot pause a newer visibility replay", async () => {
  const f = fixture();
  try {
    let resolve!: () => void;
    f.playPromises.push(() => new Promise<void>(done => { resolve = done; }));
    f.show();
    f.hide();
    f.show();
    await flush();
    assert.equal(f.video.plays, 2);
    const pauses = f.video.pauses;
    resolve(); await flush();
    assert.equal(f.video.pauses, pauses);
    assert.equal(f.video.paused, false);
  } finally { f.destroy(); }
});

test("003 a stalled play is bounded and recovers after leaving and re-entering", async () => {
  const f = fixture();
  try {
    f.playPromises.push(() => new Promise(() => {}));
    f.show();
    [...f.timers.values()][0]();
    assert.equal(f.video.paused, true);
    assert.equal(f.root.dataset.state, "ready");
    f.hide();
    f.show();
    await flush();
    assert.equal(f.video.plays, 2);
  } finally { f.destroy(); }
});

test("003 reports media errors without requiring transport controls", async () => {
  const f = fixture();
  try {
    f.show(); await flush();
    f.video.dispatchEvent(new Event("error"));
    assert.equal(f.root.dataset.state, "error");
  } finally { f.destroy(); }
});

test("003 reset clears its one-shot presentation state", () => {
  const f = fixture();
  try {
    f.show();
    f.video.currentTime = .6;
    f.video.dispatchEvent(new Event("ended"));
    f.runtime.reset();
    assert.equal(f.video.currentTime, 0);
    assert.equal(f.root.dataset.state, "idle");
  } finally { f.destroy(); }
});

test("003 cleanup releases media frames, timers, observers and route listeners", async () => {
  const f = fixture();
  try {
    f.show(); await flush();
    f.video.dispatchEvent(new Event("playing"));
    f.runtime.destroy();
    assert.equal(f.video.paused, true);
    assert.equal(f.timers.size, 0);
    assert.ok(f.observers.every(observer => observer.disconnected));
    f.window.dispatchEvent(new Event("pageshow"));
    assert.equal(f.video.plays, 1);
  } finally { f.destroy(); }
});

test("Home scene visibility handles tall mobile chapters", () => {
  assert.equal(visibleSceneRatio({ top: 0, bottom: 1500, height: 1500 }, 700), 1);
  assert.equal(visibleSceneRatio({ top: 710, bottom: 900, height: 190 }, 700), 0);
});

test("Drag frames coalesce moves, flush the final release and discard cancelled work", () => {
  const requests = new Map<number, FrameRequestCallback>();
  const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let id = 0;
  globalThis.requestAnimationFrame = callback => { const next = ++id; requests.set(next, callback); return next; };
  globalThis.cancelAnimationFrame = handle => { requests.delete(handle); };
  try {
    const paints: number[] = [];
    const queue = createFrameQueue<number>(value => paints.push(value));
    queue.push(1); queue.push(2); queue.push(3);
    assert.equal(requests.size, 1);
    queue.flush();
    assert.deepEqual(paints, [3]);
    assert.equal(requests.size, 0);
    queue.push(4);
    queue.cancel();
    queue.flush();
    assert.deepEqual(paints, [3]);
    queue.push(5);
    [...requests.values()][0](16);
    assert.deepEqual(paints, [3, 5]);
    assert.equal(requests.size, 0);
  } finally {
    if (originalRequest) globalThis.requestAnimationFrame = originalRequest;
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
});

test("Home removes the retired edge sampler instead of widening the Gate renderer budget", () => {
  const source = read("src/themes/kisara/pages/HomePage.astro");
  assert.doesNotMatch(source, /openingEdge|OpeningEdge|readOpeningEdgePixel/);
  assert.match(source, /createComicTransition/);
  assert.match(source, /drawTitleAbyss/);
  assert.match(source, /<KisaraLatestNotes/);
  assert.match(read("scripts/check-performance-budgets.mjs"), /225_000/);
});

test("002 defers its video, preserves drop timing and stops physics before background return", () => {
  const source = read("src/themes/kisara/components/KisaraFridgeScene.astro");
  assert.match(source, /data-src="\/themes\/kisara\/assets\/fridge-opening-002\.mp4/);
  assert.doesNotMatch(source, /<video\b[^>]*\ssrc=/);
  assert.match(source, /preload="none"/);
  assert.match(source, /bodyDropStartTime = 0\.88/);
  assert.match(source, /const interruptForLifecycle = \(\) => \{\s*sceneVisible = false;\s*cancelActiveDrag\(\);\s*stopLoop\(\);/);
  assert.match(source, /if \(document\.hidden \|\| !sceneVisible \|\| !bodiesLaunched\) return/);
  assert.match(source, /if \(bodiesLaunched\) resetBodies\(\)/);
  assert.match(source, /if \(entryFrame\) cancelAnimationFrame/);
});

test("Chibi preserves group secrets while bounding background and drag work", () => {
  const source = read("src/themes/kisara/components/KisaraChibiStage.astro");
  assert.match(source, /else dragFrame\.flush\(\)/);
  assert.match(source, /lostpointercapture/);
  assert.match(source, /const suspendStage =[^]*dragFrame\.cancel\(\);[^]*cancelScene\(\)/);
  assert.match(source, /visibilityObserver\?\.disconnect\(\)/);
  assert.match(source, /token !== sceneToken \|\| !stageVisible \|\| document\.hidden/);
  assert.match(source, /animation-play-state: paused !important/);
  assert.match(source, /jealousyInteractionMode/);
  assert.match(source, /playAppleScene/);
  assert.doesNotMatch(source, /will-change: transform, filter/);
});

test("003 exposes favorite tags and 004 uses real dates without duplicate blurred covers", () => {
  const notebook = read("src/themes/kisara/components/KisaraHomeEventVideo.astro");
  assert.match(notebook, /animeFavorites/);
  assert.match(notebook, /favoriteGames/);
  assert.match(notebook, /xpFavorites/);
  assert.doesNotMatch(notebook, /data-home-event-progress|data-home-event-replay|data-notebook-tab/);
  const latest = read("src/themes/kisara/components/KisaraLatestNotes.astro");
  assert.match(latest, /post\.data\.updatedDate \?\? post\.data\.pubDate/);
  assert.match(latest, /datetime=\{date\.toISOString\(\)\}/);
  assert.match(latest, /posts\.length === 0/);
  assert.doesNotMatch(latest, /blur\(|--transmission-cover|<script/);
});

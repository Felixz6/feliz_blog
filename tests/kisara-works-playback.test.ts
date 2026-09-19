import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setMaxListeners } from "node:events";
import test from "node:test";
import vm from "node:vm";
import { bindVideoStill } from "../src/themes/kisara/lib/videoStill.ts";

const source = readFileSync(new URL("../src/themes/kisara/lib/worksPage.js", import.meta.url), "utf8");
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function fixture(readyState = 0, reduced = false) {
  let serial = 0;
  const frames = new Map<number, Function>();
  const timers = new Map<number, { callback: Function; delay: number }>();
  class Element extends EventTarget {
    dataset: Record<string, string> = {};
    style = { setProperty() {}, removeProperty() {} };
    offsetWidth = 1440;
    toggleAttribute() {}
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 900, width: 1440, height: 900 }; }
  }
  class Video extends Element {
    static HAVE_CURRENT_DATA = 2;
    readyState = readyState;
    networkState = 2;
    position = 0;
    get currentTime() { return this.position; }
    set currentTime(value: number) {
      this.position = value;
      this.ended = false;
    }
    error = null;
    paused = true;
    ended = false;
    muted = false;
    plays = 0;
    loads = 0;
    pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
    pause() { this.paused = true; }
    play() {
      this.plays++;
      this.paused = false;
      this.ended = false;
      return new Promise<void>((resolve, reject) => this.pending.push({ resolve, reject }));
    }
    load() { this.loads++; }
  }
  let video = new Video();
  const createHero = (media: Video) => Object.assign(new Element(), {
    dataset: { introState: "idle", videoState: "idle" },
    querySelector: (selector: string) => selector === "[data-works-hero-video]" ? media : null,
  });
  let hero = createHero(video);
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: new Element(),
    querySelector: (selector: string) => selector === "[data-kisara-works-hero]" ? hero : null,
  });
  let intersect: (entries: { isIntersecting: boolean }[]) => void;
  class IntersectionObserver {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect() {}
  }
  const window = Object.assign(new EventTarget(), {
    scrollY: 0, innerHeight: 900, __yuimiKisaraInnerCleanup: null as null | (() => void),
    matchMedia: (query: string) => ({ matches: query.includes("prefers-reduced-motion") && reduced }),
    requestAnimationFrame: (callback: Function) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: Function, delay: number) => { timers.set(++serial, { callback, delay }); return serial; },
    clearTimeout: (id: number) => timers.delete(id),
    IntersectionObserver,
  });
  class Controller extends AbortController {
    constructor() { super(); setMaxListeners(0, this.signal); }
  }
  const bind = vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, "").replace("export function", "function") + "\nbindWorksPage", {
    window, document, HTMLElement: Element, HTMLVideoElement: Video, HTMLMediaElement: Video,
    bindVideoStill,
    AbortController: Controller, IntersectionObserver, getComputedStyle: () => ({ zoom: "0.9" }),
    cancelAnimationFrame: window.cancelAnimationFrame,
    performance: { now: () => 0 },
  });
  bind();
  return {
    get video() { return video; },
    get hero() { return hero; },
    document, window,
    frame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(0));
    },
    timeout(delay: number) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Missing timer: ${delay}`);
      timers.delete(entry[0]);
      entry[1].callback();
    },
    visible(value: boolean) { intersect!([{ isIntersecting: value }]); },
    reenter() { bind(); },
    navigate() {
      document.dispatchEvent(new Event("astro:before-swap"));
      video = new Video();
      hero = createHero(video);
      bind();
      document.dispatchEvent(new Event("astro:page-load"));
    },
    restore() { window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); },
    cleanup() { window.__yuimiKisaraInnerCleanup?.(); },
  };
}

test("Works entry requests playback without waiting for optional preload data", async () => {
  for (const readyState of [0, 1, 2, 4]) {
    const f = fixture(readyState);
    try {
      f.frame();
      await flush();
      assert.equal(f.video.plays, 1, `readyState ${readyState} must not block play()`);
      assert.equal(f.video.loads, readyState < 2 ? 1 : 0, "Initialize unready route media once; reuse decoded media");
      assert.equal(f.video.muted, true);
      f.video.dispatchEvent(new Event("canplay"));
      assert.equal(f.video.plays, 1, "Readiness must not issue a duplicate pending play");
    } finally { f.cleanup(); }
  }
});

test("Works soft preparation timeout does not cancel a pending cold playback", async () => {
  const f = fixture();
  try {
    f.frame();
    f.timeout(3500);
    await flush();
    assert.equal(f.video.plays, 1);
    assert.equal(f.video.paused, false);
    f.video.readyState = 4;
    f.video.dispatchEvent(new Event("canplay"));
    assert.equal(f.video.plays, 1);
    assert.equal(f.video.loads, 1, "A slow preparation must not trigger another load");
  } finally { f.cleanup(); }
});

test("Works initializes every newly swapped video even when its networkState already says loading", async () => {
  const f = fixture(1);
  try {
    for (let entry = 0; entry < 3; entry++) {
      if (entry) f.navigate();
      assert.equal(f.video.networkState, 2);
      assert.equal(f.video.loads, 1, "An adopted unready element needs entry initialization, not a networkState guess");
      f.frame();
      await flush();
      assert.equal(f.video.plays, 1);
      f.video.readyState = 4;
      f.video.dispatchEvent(new Event("loadeddata"));
      f.video.dispatchEvent(new Event("canplay"));
      f.visible(false);
      f.visible(true);
      assert.equal(f.video.loads, 1, "Readiness and viewport recovery must keep the initialized pipeline");
      const departed = f.video;
      f.document.dispatchEvent(new Event("astro:before-swap"));
      departed.dispatchEvent(new Event("canplay"));
      assert.equal(departed.paused, true, "The departing route cannot resume its old video");
    }
  } finally { f.cleanup(); }
});

test("Works pauses outside the viewport, ignores stale play rejection, and resumes", async () => {
  const f = fixture(4);
  try {
    f.frame();
    f.video.currentTime = 0.4;
    const oldPlay = f.video.pending[0];
    f.visible(false);
    assert.equal(f.video.paused, true);
    f.visible(true);
    assert.equal(f.video.plays, 2);
    oldPlay.reject(new Error("Interrupted by pause"));
    await flush();
    assert.equal(f.hero.dataset.videoState, "playing");
    assert.equal(f.video.currentTime, 0.4);
    f.video.dispatchEvent(new Event("canplay"));
    assert.equal(f.video.plays, 2);
  } finally { f.cleanup(); }
});

test("Works replays once on each route entry and BFCache restoration, not on ordinary visibility", async () => {
  const f = fixture(4);
  try {
    f.frame();
    f.video.currentTime = 1.126;
    f.video.ended = true;
    f.video.paused = true;
    f.video.dispatchEvent(new Event("ended"));
    f.visible(false);
    f.visible(true);
    assert.equal(f.video.plays, 1);
    f.restore();
    f.frame();
    await flush();
    assert.equal(f.video.plays, 2);
    assert.equal(f.video.currentTime, 0);
    f.video.currentTime = 0.7;
    f.reenter();
    f.frame();
    await flush();
    assert.equal(f.video.plays, 3);
    assert.equal(f.video.currentTime, 0);
    assert.equal(f.video.loads, 0);
  } finally { f.cleanup(); }
});

test("Works keeps reduced motion static and ignores late readiness after cleanup", () => {
  const reduced = fixture(4, true);
  try {
    reduced.frame();
    reduced.video.dispatchEvent(new Event("canplay"));
    assert.equal(reduced.video.plays, 0);
  } finally { reduced.cleanup(); }
  const f = fixture();
  f.cleanup();
  f.video.readyState = 4;
  f.video.dispatchEvent(new Event("canplay"));
  f.frame();
  assert.equal(f.video.plays, 0);
});

test("Works never resumes an ended video before the queued ended event or reverts on a late play rejection", async () => {
  const f = fixture(4);
  try {
    f.frame();
    const play = f.video.pending[0];
    f.video.currentTime = 1.126;
    f.video.paused = true;
    f.video.ended = true;
    f.visible(false);
    f.visible(true);
    assert.equal(f.video.plays, 1, "Visibility at the end boundary must not rewind through play()");
    f.video.dispatchEvent(new Event("ended"));
    play.reject(new Error("Late interruption"));
    await flush();
    assert.equal(f.hero.dataset.videoState, "complete");
    assert.equal(f.video.currentTime, 1.126);
    f.video.dispatchEvent(new Event("canplay"));
    assert.equal(f.video.plays, 1);
  } finally { f.cleanup(); }
});

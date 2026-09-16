import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { createStoryImageLoader } from "../src/themes/kisara/lib/storyImageLoader.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const home = read("src/themes/kisara/pages/HomePage.astro");
const event = read("src/themes/kisara/lib/homeEvent.ts");
const fridge = read("src/themes/kisara/components/KisaraFridgeScene.astro");
const works = read("src/themes/kisara/lib/worksPage.js");
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function imagesFixture() {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let serial = 0, notifications = 0;
  class Image extends EventTarget {
    src = ""; naturalWidth = 0; complete = false; fetchPriority = ""; decoding = "";
    resolve!: () => void;
    reject!: () => void;
    decode = () => new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    removeAttribute() { this.src = ""; }
    load() { this.naturalWidth = 1920; this.complete = true; this.dispatchEvent(new Event("load")); }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const values = {
    Image, document: doc,
    setTimeout: (callback: () => void, delay: number) => { timers.set(++serial, { callback, delay }); return serial; },
    clearTimeout: (id: number) => { timers.delete(id); },
  };
  const previous = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const controller = new AbortController();
  const scenes = Array.from({ length: 6 }, (_, index) => ({ id: String(index), image: `/${index}.webp` }));
  const loader = createStoryImageLoader(scenes, controller.signal, () => { notifications++; });
  return {
    ...loader, scenes, doc, controller, timers,
    image: (index: number) => loader.records.get(String(index))!.image as unknown as Image,
    notifications: () => notifications,
    fire(delay: number) {
      const entry = [...timers].find(([, item]) => item.delay === delay);
      assert.ok(entry, `Missing ${delay}ms timer`);
      timers.delete(entry[0]); entry[1].callback();
    },
    restore() {
      controller.abort();
      assert.equal(timers.size, 0);
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test("Story stays cold until requested, caps concurrency and promotes the imminent shot", async () => {
  const f = imagesFixture();
  try {
    assert.ok([...f.records.values()].every(record => !record.image.src));
    f.scenes.forEach(scene => f.request(scene, 0));
    assert.equal([...f.records.values()].filter(record => record.image.src).length, 2);
    f.request(f.scenes[5], 2);
    f.image(0).load();
    assert.equal(f.ready(f.scenes[0]), false, "load is not decode completion");
    f.image(0).resolve();
    await flush();
    assert.equal(f.image(5).src, "/5.webp");
    assert.equal(f.image(5).fetchPriority, "high");
    assert.equal(f.image(2).src, "");
    assert.equal(f.ready(f.scenes[0]), true);
  } finally { f.restore(); }
});

test("Story actual failures retry once while long hangs cannot starve later shots", async () => {
  const f = imagesFixture();
  try {
    f.request(f.scenes[0]);
    f.image(0).dispatchEvent(new Event("error"));
    assert.equal(f.records.get("0")!.attempts, 1);
    f.fire(800);
    const retry = f.image(0);
    retry.dispatchEvent(new Event("error"));
    assert.equal(f.records.get("0")!.attempts, 2);
    assert.equal(f.timers.size, 0);
    f.scenes.slice(1).forEach(scene => f.request(scene));
    f.fire(15000);
    assert.equal(f.image(1).src, "");
    assert.equal(f.image(3).src, "/3.webp");
    assert.equal([...f.records.values()].filter(record => record.status === "decoding").length, 2);
  } finally { f.restore(); }
});

test("Late story loads remain usable; rejected or missing decode retains a valid bitmap", async () => {
  for (const mode of ["decode", "rejected", "missing"]) {
    const f = imagesFixture();
    try {
      if (mode === "missing") (f.image(0) as any).decode = undefined;
      f.request(f.scenes[0]);
      assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [15000]);
      f.image(0).load();
      if (mode === "decode") f.image(0).resolve();
      if (mode === "rejected") f.image(0).reject();
      await flush();
      assert.equal(f.records.get("0")!.status, "ready");
      assert.equal(f.timers.size, 0);
    } finally { f.restore(); }
  }
});

test("Story loading suspends queued work while hidden and ignores late decode after cleanup", async () => {
  const f = imagesFixture();
  try {
    f.doc.hidden = true;
    f.request(f.scenes[0]);
    assert.equal(f.image(0).src, "");
    f.doc.hidden = false;
    f.doc.dispatchEvent(new Event("visibilitychange"));
    f.image(0).load();
    f.controller.abort();
    f.image(0).resolve();
    await flush();
    assert.equal(f.notifications(), 0);
  } finally { f.restore(); }
});

test("Leaving the gate suspends the remaining story queue without cancelling useful cached frames", async () => {
  const f = imagesFixture();
  try {
    f.scenes.forEach(scene => f.request(scene, 0));
    f.setActive(false);
    f.image(0).load(); f.image(0).resolve();
    f.image(1).load(); f.image(1).resolve();
    await flush();
    assert.equal(f.image(2).src, "");
    f.setActive(true);
    assert.equal(f.image(2).src, "/2.webp");
    assert.equal(f.image(0).src, "/0.webp");
  } finally { f.restore(); }
});

test("Home requests the rest of the story only after engagement and warms destinations before covers", () => {
  assert.match(home, /if \(fill > 0\.01 \|\| intro > 0\) sceneManifest\.forEach/);
  assert.match(home, /fill >= 0\.55[^]*transformationSceneRecords\.forEach/);
  const navigation = home.slice(home.indexOf("const smoothScrollToHomeSection ="));
  assert.ok(navigation.indexOf("nextMedia?.preloadPresentation") < navigation.indexOf("runComicHandoff"));
  assert.match(fridge, /preloadPresentation\(\)/);
  assert.match(read("src/themes/kisara/components/KisaraHomeEventVideo.astro"), /preloadPresentation\(\)/);
});

test("Fridge buffering does not reload or finish the scene on its short watchdog", () => {
  const code = fridge.slice(fridge.indexOf("const schedulePlaybackWatchdog ="), fridge.indexOf("const startOpening ="));
  const timers: Function[] = [];
  let recoveries = 0, finishes = 0;
  const video = { currentTime: 0, duration: NaN, paused: true, readyState: 1, seeking: false, error: null };
  const schedule = vm.runInNewContext(stripTypeScriptTypes(code) + "\nschedulePlaybackWatchdog", {
    video, signal: { aborted: false }, playbackGeneration: 1, openingStarted: true, opened: false,
    document: { hidden: false }, sceneVisible: true, playbackWatchdog: 0,
    window: { clearTimeout() {}, setTimeout(fn: Function) { timers.push(fn); return 1; } },
    finishOpening() { finishes++; }, recoverStalledOpening() { recoveries++; },
  });
  schedule(1);
  timers.shift()!();
  assert.equal(recoveries, 0);
  assert.equal(finishes, 0);
  assert.equal(timers.length, 1);
  video.readyState = 4;
  timers.shift()!();
  assert.equal(recoveries, 1);
});

test("Works starts content independently, initializes unready route media and recovers late video", () => {
  const prep = works.slice(works.indexOf("const prepareHeroVideo ="), works.indexOf("const playHeroIntro ="));
  assert.doesNotMatch(prep, /if \(heroVideo\.networkState === 0\)/);
  assert.match(prep, /heroVideo\.load\(\)/);
  assert.match(prep, /removeEventListener\("loadeddata", loaded\)/);
  const intro = works.slice(works.indexOf("const playHeroIntro ="), works.indexOf("const syncHeroScroll ="));
  assert.doesNotMatch(intro, /await prepareHeroVideo/);
  assert.match(works, /addEventListener\("canplay", startPreparedHeroVideo/);
  const helper = works.slice(works.indexOf("const startPreparedHeroVideo ="), works.indexOf("const retryHeroVideo ="));
  class Element { dataset = { introState: "complete", videoState: "idle" }; }
  class Video { error = null; readyState = 1; }
  const hero = new Element(), video = new Video();
  const state = {
    signal: { aborted: false }, heroReducedMotion: false, document: { hidden: false },
    fruitPhysicsVisible: true, hero, heroVideo: video, HTMLElement: Element, HTMLVideoElement: Video,
    heroVideoStarted: false, resumeHeroVideo: false, syncWorksActivity() {},
  };
  const start = vm.runInNewContext(helper + "\nstartPreparedHeroVideo", state);
  start();
  assert.equal(state.heroVideoStarted, true, "Playback itself must drive cold media loading");
  video.readyState = 3;
  start();
  assert.equal(state.resumeHeroVideo, true);
  assert.equal(hero.dataset.videoState, "playing");
  state.heroVideoStarted = false;
  hero.dataset.videoState = "complete";
  start();
  assert.equal(state.heroVideoStarted, false, "Finished one-shot must not replay");
});

test("003 fallback is recoverable and retries are finite rather than declaring completion", () => {
  const fallback = event.slice(event.indexOf("const showStill ="), event.indexOf("const play ="));
  assert.match(fallback, /complete = false/);
  assert.match(fallback, /completed = complete/);
  assert.match(event, /addEventListener\("canplay", recover/);
  assert.match(event, /retries >= 2/);
  assert.match(event, /setTimeout\(finish, 1800\)/);
});

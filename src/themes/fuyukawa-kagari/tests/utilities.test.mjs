import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import postcss from "postcss";
import sharp from "sharp";
import { installMusicPlayer } from "../lib/music-player.mjs";
import { mountHomeRuntime } from "../lib/home-runtime.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const layout = read("layouts/BaseLayout.astro");
const layoutRuntime = read("lib/layout-runtime.mjs");
const themeLongPressMenu = readFileSync(new URL("../../../core/themes/ThemeLongPressMenu.astro", import.meta.url), "utf8");
const css = postcss.parse(read("styles/refresh.css"));
const declarations = (root, selector) => {
  const values = {};
  root.walkRules((rule) => {
    if (rule.selector !== selector || rule.parent.type !== "root") return;
    rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
  });
  return values;
};
test("long-press menu uses a bundled module and follows Astro page lifecycle", () => {
  assert.match(themeLongPressMenu, /^<script>\s*import \{ isNativeContextTarget \}/);
  assert.doesNotMatch(themeLongPressMenu, /data-astro-rerun|is:inline/);
  assert.match(themeLongPressMenu, /astro:before-swap[\s\S]*__yuimiThemeLongPressCleanup/);
  assert.match(themeLongPressMenu, /longPressDelay[\s\S]*astro:page-load\", mountThemeLongPressMenu/);
});

class Element {
  constructor() {
    this.events = new Map();
    this.attributes = {};
    this.styles = {};
    this.style = {
      setProperty: (key, value) => { this.styles[key] = value; },
      removeProperty: (key) => { delete this.style[key]; delete this.styles[key]; }
    };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force = !classes.has(name)) => {
        if (force) classes.add(name); else classes.delete(name);
        return force;
      }
    };
    this.value = "0";
    this.textContent = "";
  }
  addEventListener(name, handler, options = {}) {
    const handlers = this.events.get(name) ?? new Set();
    handlers.add(handler);
    this.events.set(name, handlers);
    options.signal?.addEventListener("abort", () => handlers.delete(handler));
  }
  removeEventListener(name, handler) { this.events.get(name)?.delete(handler); }
  dispatch(name, event = {}) { for (const handler of [...(this.events.get(name) ?? [])]) handler(event); }
  async dispatchAsync(name, event = {}) {
    for (const handler of [...(this.events.get(name) ?? [])]) await handler(event);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
}

const memoryStorage = (data = new Map()) => ({
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value)
});

function installTestMusicPlayer(document, window, {
  Audio,
  localStorage = memoryStorage(),
  sessionStorage = memoryStorage(),
  fetch = async () => ({ json: async () => [] }),
  Date: DateRef = Date
}) {
  Object.assign(window, {
    Audio,
    localStorage,
    sessionStorage,
    fetch,
    Date: DateRef,
    URL,
    AbortController,
    Element,
    Node: Element,
    CustomEvent: class MockCustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    queueMicrotask
  });
  return installMusicPlayer(document, window);
}

test("drawer has a viewport-sized flex frame and a visible, independently scrollable panel", () => {
  const dock = declarations(css, "body[data-fuyukawa] .toy-dock");
  const panel = declarations(css, "body[data-fuyukawa] .toy-dock-panel");
  assert.equal(dock.top, "var(--dock-top)");
  assert.match(dock.bottom, /safe-area-inset-bottom/);
  assert.equal(dock.display, "flex");
  assert.equal(panel.display, "block");
  assert.equal(panel["min-height"], "0");
  assert.equal(panel["max-height"], "100%");
  assert.equal(panel["overflow-y"], "auto");
  assert.equal(panel["overscroll-behavior-y"], "contain");
  assert.equal(panel["scrollbar-width"], "thin");
  assert.equal(declarations(css, "body[data-fuyukawa] .toy-dock-panel::-webkit-scrollbar").display, "block");
  const source = read("styles/refresh.css");
  assert.match(source, /max-height: 600px[^]*?--dock-top: 76px/);
  assert.match(layout, /aria-expanded="false" aria-controls="toy-dock-panel"/);
  assert.match(layout, /id="toy-dock-panel"/);
});

test("drawer pin, second-click close, hover reentry and Escape agree with aria-expanded", () => {
  const dock = new Element(), handle = new Element(), doc = new Element(), win = new Element();
  const nodes = new Map([[".toy-dock", dock]]);
  const timers = new Map();
  let id = 0;
  dock.contains = (node) => node === dock || node === handle;
  dock.matches = () => dock.hovered || dock.focused;
  dock.querySelector = (selector) => selector === ":focus" ? (dock.focused ? handle : null) : handle;
  handle.closest = () => handle;
  handle.blur = () => { dock.focused = false; };
  doc.querySelector = (selector) => nodes.get(selector);
  doc.body = new Element();
  win.location = { origin: "https://example.test" };
  win.setTimeout = (fn) => { timers.set(++id, fn); return id; };
  win.clearTimeout = (key) => timers.delete(key);
  class Audio extends Element {
    constructor() { super(); this.volume = .28; this.paused = true; this.currentTime = 0; this.duration = 0; }
    load() {}
    async play() { this.paused = false; this.dispatch("play"); }
    pause() { this.paused = true; this.dispatch("pause"); }
  }
  installTestMusicPlayer(doc, win, { Audio });
  dock.hovered = true;
  doc.dispatch("pointerover", { target: handle });
  assert.equal(handle.attributes["aria-expanded"], "true");
  doc.dispatch("click", { target: handle });
  assert.equal(dock.classList.contains("is-pinned"), true);
  doc.dispatch("click", { target: handle });
  assert.equal(handle.attributes["aria-expanded"], "false");
  assert.equal(dock.classList.contains("is-dismissed"), true);
  doc.dispatch("pointerover", { target: handle });
  assert.equal(handle.attributes["aria-expanded"], "true");
  win.dispatch("keydown", { key: "Escape" });
  assert.equal(handle.attributes["aria-expanded"], "false");
  dock.hovered = false;
  dock.focused = true;
  doc.dispatch("focusin", { target: handle });
  assert.equal(handle.attributes["aria-expanded"], "true");
  doc.dispatch("astro:before-swap");
  assert.equal(handle.attributes["aria-expanded"], "false");
});

test("Home title has dark letter interiors and a white stroke, with no artwork changes", () => {
  const title = declarations(css, "body[data-fuyukawa] .hero h1");
  assert.equal(title.color, "#495675");
  assert.equal(title["paint-order"], "stroke fill");
  assert.equal(title["-webkit-text-stroke"], "3px #ffffff");
  const linear = (v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  const rgb = title.color.slice(1).match(/../g).map((part) => linear(parseInt(part, 16) / 255));
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  assert.ok(1.05 / (luminance + .05) > 7);
});

test("sakura uses a single accessible canvas with tiered SVG petals", async () => {
  assert.match(read("components/SakuraRain.astro"), /data-sakura-rain/);
  assert.match(read("components/SakuraRain.astro"), /<canvas data-sakura-canvas/);
  assert.match(layout, /<SakuraRain \/>/);
  const runtime = read("lib/sakura-runtime.mjs");
  const performance = read("lib/sakura-performance.mjs");
  assert.match(layoutRuntime, /createSakuraController/);
  assert.match(layoutRuntime, /astro:before-swap.*sakuraController\.destroy/);
  assert.match(layoutRuntime, /astro:page-load[\s\S]*sakuraController\.mount/);
  assert.match(layoutRuntime, /import\.meta\.env\.DEV \|\| new URLSearchParams\(window\.location\.search\)\.has\("debug-sakura"\)/);
  assert.match(runtime, /getDebugTargets: \(\) => mounted \?/);
  assert.doesNotMatch(runtime, /windowRef\.__yuimiSakuraSession/);
  assert.match(runtime, /requestIdleCallback/);
  assert.match(runtime, /cancelAnimationFrame/);
  assert.match(runtime, /visibilitychange/);
  for (const count of [16, 10, 4, 0]) assert.ok(performance.includes(`particles: ${count}`));
  assert.match(performance, /maxDpr: 1\.5/);
  assert.match(performance, /createFrameTimeMonitor/);
  assert.doesNotMatch(read("styles/theme.css"), /\.sakura-rain span/);
  assert.match(css.toString(), /data-yuimi-visibility="hidden"[^]*?animation-play-state: paused/);
  assert.equal(declarations(css, "body[data-fuyukawa] .sakura-rain").opacity, "1");
  assert.equal(declarations(css, "body[data-fuyukawa] .sakura-rain canvas").height, "100%");
  const image = await sharp(fileURLToPath(new URL("../../../../public/themes/fuyukawa-kagari/assets/sakura-petal.svg", import.meta.url)))
    .resize(96, 128).ensureAlpha().raw().toBuffer();
  let visible = 0, transparent = 0;
  for (let i = 3; i < image.length; i += 4) { if (image[i] > 0) visible++; else transparent++; }
  assert.ok(visible > 4000 && transparent > 1000);
});

test("Fuyukawa layout removes Live2D while retaining the music-only utility dock", () => {
  assert.doesNotMatch(layout, /live2d|waifu/i);
  assert.match(layout, /aria-label="Music controls"/);
  assert.match(layout, /aria-label="打开音乐工具"/);
  assert.match(layout, /tabler:player-play/);
  assert.match(layout, /class="[^"]*\bmusic-widget\b[^"]*"/);
  for (const file of ["styles/theme.css", "styles/refresh.css", "pages/AboutPage.astro", "pages/ProjectsPage.astro"]) {
    assert.doesNotMatch(read(file), /live2d|waifu/i, file);
  }
  assert.equal(existsSync(new URL("../lib/waifu-anchor.mjs", import.meta.url)), false);
});

test("music UI preserves zero volume, icon children, seek fill and live playback state", async () => {
  const nodes = new Map(), doc = new Element(), win = new Element();
  for (const name of ["toggle", "prev", "next", "volume", "seek", "current", "duration", "note", "status", "volume-label"]) {
    nodes.set(`[data-music-${name}]`, new Element());
  }
  nodes.set(".music-track", new Element());
  let queryCount = 0;
  doc.querySelector = (selector) => { queryCount += 1; return nodes.get(selector); };
  doc.body = new Element();
  const localStorage = memoryStorage();
  localStorage.setItem("yuimi-radio-state-v1", JSON.stringify({ volume: 0 }));
  win.location = { origin: "https://example.test" };
  class Audio extends Element {
    constructor() { super(); this.volume = .28; this.paused = true; this.currentTime = 25; this.duration = 100; }
    load() {}
    async play() { this.paused = false; this.dispatch("play"); }
    pause() { this.paused = true; this.dispatch("pause"); }
  }
  const player = installTestMusicPlayer(doc, win, {
    Audio,
    localStorage,
    fetch: async () => ({ json: async () => [{ id: "1", title: "A track", src: "/track.mp3" }] })
  });
  const toggle = nodes.get("[data-music-toggle]");
  toggle.textContent = "existing icon children";
  await player.init();
  player.bind();
  assert.equal(nodes.get("[data-music-volume]").value, "0");
  assert.equal(nodes.get("[data-music-volume-label]").textContent, "0%");
  assert.equal(toggle.textContent, "existing icon children");
  await player.audio.play();
  assert.equal(toggle.attributes["aria-pressed"], "true");
  assert.equal(nodes.get("[data-music-status]").textContent, "播放中");
  const queriesBeforeProgress = queryCount;
  player.audio.currentTime = 26;
  player.audio.dispatch("timeupdate");
  assert.equal(queryCount, queriesBeforeProgress, "progress ticks should reuse bound controls");
  assert.equal(nodes.get("[data-music-current]").textContent, "00:26");
  const seek = nodes.get("[data-music-seek]");
  seek.value = "80";
  seek.dispatch("input");
  assert.equal(seek.styles["--range-fill"], "80%");
  assert.equal(nodes.get("[data-music-current]").textContent, "01:20");
  seek.dispatch("change");
  assert.equal(player.audio.currentTime, 80);
  player.audio.pause();
  assert.equal(toggle.attributes["aria-label"], "播放音乐");
  player.bind();
  assert.equal(toggle.events.get("click").size, 1);
  assert.equal(installMusicPlayer(doc, win), player, "reinstallation should reuse the per-document player and audio state");
  assert.equal(toggle.events.get("click").size, 1);
  for (const controller of ["controlAbort", "audioAbort", "unlockAbort"]) player[controller]?.abort();
});

test("footer counters update at minute boundaries and pause while hidden", () => {
  const doc = new Element(), win = new Element();
  const timers = new Map();
  let nextId = 0, queryCount = 0;
  let now = Date.parse("2026-09-26T08:12:34Z");
  class TestDate extends Date { static now() { return now; } }
  const nodes = [
    { dataset: { elapsedFrom: "1977-09-05T12:56:00Z", elapsedMode: "minute" }, setAttribute() {} },
    { dataset: { elapsedFrom: "2022-09-24T00:00:00+08:00", elapsedMode: "days" }, setAttribute() {} }
  ];
  doc.visibilityState = "visible";
  doc.querySelectorAll = () => { queryCount += 1; return nodes; };
  win.setTimeout = (fn, delay) => { timers.set(++nextId, { fn, delay }); return nextId; };
  win.clearTimeout = (id) => timers.delete(id);
  const footerTimers = layoutRuntime.slice(layoutRuntime.indexOf("const padTimer ="), layoutRuntime.indexOf("const musicPlayer = installMusicPlayer"));
  vm.runInNewContext(footerTimers, {
    document: doc, window: win, Date: TestDate
  });
  assert.equal(queryCount, 1);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 26_000);
  assert.match(nodes[0].textContent, /天 \d{2}小时 \d{2}分/);
  assert.match(nodes[1].textContent, /^第 [\d,]+ 天$/);
  doc.dispatch("astro:page-load");
  assert.equal(queryCount, 2);
  assert.equal(timers.size, 1, "page swaps must not duplicate timers");
  doc.visibilityState = "hidden";
  doc.dispatch("visibilitychange");
  assert.equal(timers.size, 0);
  now += 60_000;
  doc.visibilityState = "visible";
  doc.dispatch("visibilitychange");
  assert.equal(queryCount, 3);
  assert.equal(timers.size, 1);
});

test("article image viewer stays out of homepage code and loads only when its dialog exists", () => {
  assert.doesNotMatch(layout, /import\s*\{\s*installArticleImageViewer\s*\}\s*from/);
  assert.match(layoutRuntime, /const loadArticleImageViewer = \(\) => \{[\s\S]*?if \(!document\.querySelector\("\[data-article-image-viewer\]"\)\) return;[\s\S]*?import\("\.\/article-image-viewer\.mjs"\)/);
  assert.match(layoutRuntime, /loadArticleImageViewer\(\);\s*document\.addEventListener\("astro:page-load", loadArticleImageViewer\);/);
});

test("home hero scroll and pointer handlers batch layout work through requestAnimationFrame", () => {
  const homeHero = read("lib/home-hero.mjs");
  assert.match(homeHero, /const handleHeroScroll = \(\) => \{\s*if \(disposed\) return;\s*if \(heroScrollFrame\) return;\s*heroScrollFrame = window\.requestAnimationFrame/);
  assert.match(homeHero, /const handlePokeMove = \(event\) => \{\s*if \(disposed\) return;\s*pokeClientX = event\.clientX;\s*if \(pokePointerFrame\) return;\s*pokePointerFrame = window\.requestAnimationFrame/);
});

test("music manifest and audio wait for music-dock intent, then playback loads one track", async () => {
  const nodes = new Map(), doc = new Element(), win = new Element(), dock = new Element(), handle = new Element();
  for (const name of ["toggle", "prev", "next", "volume", "seek", "current", "duration", "note", "status", "volume-label"]) {
    nodes.set(`[data-music-${name}]`, new Element());
  }
  nodes.set(".music-track", new Element());
  const dockChildren = new Set([handle, ...nodes.values()]);
  dock.contains = (node) => node === dock || dockChildren.has(node);
  dock.matches = () => false;
  dock.querySelector = (selector) => selector === ":focus" ? null : handle;
  handle.closest = (selector) => selector === ".toy-dock-handle" ? handle : null;
  handle.blur = () => {};
  doc.querySelector = (selector) => selector === ".toy-dock" ? dock : nodes.get(selector);
  doc.body = new Element();
  win.location = { origin: "https://example.test" };
  win.clearTimeout = () => {};
  win.setTimeout = () => 1;
  const localData = new Map([[
    "yuimi-radio-state-v1",
    JSON.stringify({ trackId: "track-a", currentTime: 42, volume: .28, paused: true })
  ]]);
  let musicStateWrites = 0;
  let now = 10_000;
  class TestDate extends Date { static now() { return now; } }
  const storage = (data = new Map()) => {
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
        if (key === "yuimi-radio-state-v1") musicStateWrites += 1;
      }
    };
  };
  let fetchCount = 0;
  class Audio extends Element {
    constructor() {
      super(); this._src = ""; this.preload = "auto"; this.volume = .28;
      this.paused = true; this.currentTime = 0; this.duration = 100;
      this.readyState = 0; this.loadCount = 0; this.playCount = 0;
    }
    get src() { return this._src; }
    get currentSrc() { return this._src; }
    set src(value) { this._src = new URL(value, win.location.origin).href; }
    load() { this.loadCount += 1; this.readyState = 0; }
    dispatch(name, event = {}) {
      if (name === "loadedmetadata") this.readyState = 1;
      super.dispatch(name, event);
    }
    async play() { this.playCount += 1; this.paused = false; this.dispatch("play"); }
    pause() { this.paused = true; this.dispatch("pause"); }
  }
  const player = installTestMusicPlayer(doc, win, {
    Audio,
    localStorage: storage(localData),
    sessionStorage: storage(),
    Date: TestDate,
    fetch: async () => {
      fetchCount += 1;
      return { json: async () => [
        { id: "track-a", title: "A track", src: "/track-a.mp3" },
        { id: "track-b", title: "B track", src: "/track-b.mp3" }
      ] };
    }
  });

  assert.equal(player.audio.preload, "none");
  assert.equal(fetchCount, 0);
  assert.equal(player.audio.src, "");
  assert.equal(player.audio.loadCount, 0);
  doc.dispatch("astro:page-load");
  assert.equal(fetchCount, 0);
  assert.equal(player.audio.loadCount, 0);

  doc.dispatch("click", { target: handle });
  await player.init();
  assert.equal(fetchCount, 1);
  assert.equal(dock.classList.contains("is-pinned"), true);
  assert.equal(player.audio.src, "");
  assert.equal(player.audio.loadCount, 0);

  await nodes.get("[data-music-toggle]").dispatchAsync("click");
  assert.equal(player.audio.preload, "none");
  assert.equal(player.audio.src, "https://example.test/track-a.mp3");
  assert.equal(player.audio.loadCount, 1);
  assert.equal(player.audio.playCount, 1);
  assert.equal(JSON.parse(localData.get("yuimi-radio-state-v1")).currentTime, 42);
  player.audio.dispatch("loadedmetadata");
  assert.equal(player.audio.currentTime, 42);
  const writesBeforeProgress = musicStateWrites;
  player.audio.dispatch("timeupdate");
  assert.equal(musicStateWrites, writesBeforeProgress);
  for (let i = 0; i < 4; i += 1) {
    now += 1000;
    player.audio.dispatch("timeupdate");
  }
  assert.equal(musicStateWrites, writesBeforeProgress);
  now += 1000;
  player.audio.currentTime = 44;
  player.audio.dispatch("timeupdate");
  assert.equal(musicStateWrites, writesBeforeProgress + 1);
  assert.equal(nodes.get("[data-music-current]").textContent, "00:44");
  assert.equal(JSON.parse(localData.get("yuimi-radio-state-v1")).currentTime, 44);

  await nodes.get("[data-music-next]").dispatchAsync("click");
  assert.equal(fetchCount, 1);
  assert.equal(player.audio.src, "https://example.test/track-b.mp3");
  assert.equal(player.audio.loadCount, 2);
  assert.equal(player.audio.preload, "none");
  for (const controller of ["controlAbort", "audioAbort", "unlockAbort"]) player[controller]?.abort();
});

// Direct-import clock fixtures; no source extraction/VM or animation dependencies.
function homeFixture(config = {}) {
  const document = new Element(), window = new Element(), stage = new Element();
  const date = new Element(), time = new Element(), timers = new Map(), delays = [];
  const nodes = { '[data-home-clock]': stage, '[data-home-date]': date, '[data-home-time]': time };
  let id = 0, currentDate = new Date('2026-10-02T03:04:05Z');
  document.visibilityState = config.hidden ? 'hidden' : 'visible';
  document.querySelector = (selector) => {
    assert.ok(!selector.includes('canvas'), 'clock must not look for Canvas');
    return nodes[selector] ?? null;
  };
  window.setTimeout = (fn, delay) => { delays.push(delay); timers.set(++id, fn); return id; };
  window.clearTimeout = (token) => timers.delete(token);
  for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'IntersectionObserver', 'performance', 'matchMedia']) {
    Object.defineProperty(window, key, { get() { throw new Error(`clock must not access ${key}`); } });
  }
  for (const selector of config.missing ?? []) delete nodes[selector];
  const mount = () => mountHomeRuntime({ document, window, now: () => currentDate });
  const cleanup = config.noMount ? () => {} : mount();
  const fireClock = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  return { document, window, stage, date, time, nodes, timers, delays, mount, cleanup, fireClock,
    setDate: (value) => { currentDate = value; } };
}
const clockListeners = (f) => f.document.events.get('visibilitychange')?.size ?? 0;
const clockSnapshot = (f) => ({ date: f.date.textContent, time: f.time.textContent, timers: f.timers.size, listeners: clockListeners(f) });

test('homepage clock preserves zh-CN date, 24-hour time and 1000ms cadence without Canvas', () => {
  const f = homeFixture(), now = new Date('2026-10-02T03:04:05Z');
  assert.equal(f.date.textContent, new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(now));
  assert.equal(f.time.textContent, new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now));
  assert.deepEqual(f.delays, [1000]); assert.equal(f.timers.size, 1); assert.equal(clockListeners(f), 1);
  const original = f.time.textContent;
  f.setDate(new Date('2026-10-02T03:04:06Z')); f.fireClock();
  assert.notEqual(f.time.textContent, original); assert.deepEqual(f.delays, [1000, 1000]);
  f.cleanup();
});

test('homepage clock pauses hidden, resumes immediately and preserves pagehide semantics', () => {
  const f = homeFixture(), original = f.time.textContent;
  f.document.visibilityState = 'hidden'; f.document.dispatch('visibilitychange');
  assert.equal(f.timers.size, 0);
  f.setDate(new Date('2026-10-02T03:04:09Z')); f.fireClock(); assert.equal(f.time.textContent, original);
  f.document.visibilityState = 'visible'; f.document.dispatch('visibilitychange');
  assert.notEqual(f.time.textContent, original); assert.equal(f.timers.size, 1);
  f.window.dispatch('pagehide'); assert.equal(f.timers.size, 1);
  assert.equal(f.window.events.size, 0, 'clock has no rain-only pagehide, resize or scroll listener');
  f.cleanup(); assert.equal(f.timers.size, 0);
});

test('homepage hidden cold mount waits for visibility before updating or scheduling', () => {
  const f = homeFixture({ hidden: true });
  assert.equal(f.timers.size, 0); assert.equal(f.time.textContent, '');
  f.document.visibilityState = 'visible'; f.document.dispatch('visibilitychange');
  assert.notEqual(f.time.textContent, ''); assert.equal(f.timers.size, 1); f.cleanup();
});

test('homepage repeated mounts reuse one clock and idempotent cleanup cannot dispose a later mount', () => {
  const f = homeFixture(), before = clockSnapshot(f);
  assert.equal(f.mount(), f.cleanup); assert.equal(f.mount(), f.cleanup); assert.deepEqual(clockSnapshot(f), before);
  f.cleanup(); f.cleanup(); assert.equal(f.timers.size, 0); assert.equal(clockListeners(f), 0);
  const next = f.mount(); f.cleanup(); assert.equal(f.timers.size, 1); assert.equal(clockListeners(f), 1);
  next(); assert.equal(f.timers.size, 0);
});

for (const missing of [['[data-home-clock]'], ['[data-home-date]', '[data-home-time]']]) {
  test(`homepage missing ${missing.join(' and ')} exits and later entry mounts`, () => {
    const f = homeFixture({ missing }); f.cleanup(); f.cleanup();
    assert.equal(f.timers.size, 0); assert.equal(clockListeners(f), 0);
    f.nodes['[data-home-clock]'] = f.stage; f.nodes['[data-home-date]'] = f.date; f.nodes['[data-home-time]'] = f.time;
    const stop = f.mount(); assert.equal(f.timers.size, 1); stop();
  });
}
for (const missing of ['[data-home-date]', '[data-home-time]']) {
  test(`homepage clock can update its remaining target without ${missing}`, () => {
    const f = homeFixture({ missing });
    assert.equal(f.timers.size, 1); assert.notEqual(missing.includes('date') ? f.time.textContent : f.date.textContent, '');
    f.cleanup();
  });
}
for (const context of [null, () => { throw new Error('Canvas unavailable'); }]) {
  test(`homepage clock ignores unrelated Canvas with ${context === null ? 'null' : 'throwing'} context`, () => {
    const f = homeFixture({ noMount: true });
    f.nodes['[data-tag-rain-canvas]'] = { getContext: context === null ? () => null : context };
    const stop = f.mount(); assert.equal(f.timers.size, 1); assert.notEqual(f.time.textContent, ''); stop();
  });
}

test('homepage cleanup ignores late callbacks and leaves other module timers/listeners untouched', () => {
  const f = homeFixture(), callbacks = [...f.timers.values(), ...f.document.events.get('visibilitychange')];
  const external = () => {}, timer = f.window.setTimeout(external, 99);
  f.document.addEventListener('visibilitychange', external); f.window.addEventListener('scroll', external);
  f.cleanup(); f.cleanup();
  assert.equal(f.timers.size, 1); assert.ok(f.timers.has(timer)); assert.equal(clockListeners(f), 1);
  assert.ok(f.document.events.get('visibilitychange').has(external)); assert.ok(f.window.events.get('scroll').has(external));
  const before = clockSnapshot(f); f.setDate(new Date('2026-10-02T03:04:09Z'));
  callbacks.forEach(fn => fn()); assert.deepEqual(clockSnapshot(f), before);
});

test('homepage replacing roots freezes old DOM; old cleanup does not remove the new mount', () => {
  const f = homeFixture(), oldTime = f.time.textContent, late = [...f.timers.values(), ...f.document.events.get('visibilitychange')];
  const freshTime = new Element(); f.nodes['[data-home-clock]'] = new Element(); f.nodes['[data-home-time]'] = freshTime;
  const stop = f.mount(); f.cleanup(); late.forEach(fn => fn());
  assert.equal(f.timers.size, 1); assert.equal(clockListeners(f), 1);
  f.setDate(new Date('2026-10-02T03:04:09Z')); f.fireClock();
  assert.equal(f.time.textContent, oldTime); assert.notEqual(freshTime.textContent, oldTime); stop();
});

test('homepage rain removal retains the static stage, background, welcome, clock and anchor', () => {
  const home = read('pages/HomePage.astro');
  assert.match(home, /class="tag-rain-stage" id="main-content" data-home-clock/);
  assert.match(home, /href="#main-content"/); assert.match(home, /home-content-bg__image/);
  assert.match(home, /home-welcome-bubble/); assert.match(home, /data-home-date/); assert.match(home, /data-home-time/);
  assert.doesNotMatch(home, /fallingTags|data-tags|data-tag-rain|<canvas/);
  assert.doesNotMatch(read('styles/theme.css'), /\.tag-rain-canvas/);
  assert.match(read('styles/theme.css'), /\.tag-rain-stage/);
  assert.match(read('styles/refresh.css'), /\.tag-rain-stage \{ min-height: 640px/);
  assert.match(read('styles/refresh.css'), /\.tag-rain-stage \{ min-height: 700px/);
});

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

test("home scroll handlers batch layout work through requestAnimationFrame", () => {
  const homeRuntime = read("lib/home-runtime.mjs");
  const homeHero = read("lib/home-hero.mjs");
  assert.match(homeRuntime, /const onScroll = \(\) => \{\s*if \(disposed\) return;\s*if \(state\.scrollFrame\) return;\s*state\.scrollFrame = window\.requestAnimationFrame/);
  assert.match(homeHero, /const handleHeroScroll = \(\) => \{\s*if \(heroScrollFrame\) return;\s*heroScrollFrame = window\.requestAnimationFrame/);
  assert.match(homeHero, /const handlePokeMove = \(event\) => \{\s*pokeClientX = event\.clientX;\s*if \(pokePointerFrame\) return;\s*pokePointerFrame = window\.requestAnimationFrame/);
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

// Direct-import fixtures for the page-owned homepage runtime (no source extraction/VM).
function homeFixture(config = {}) {
  const document = new Element(), window = new Element(), stage = new Element(), canvas = new Element();
  const date = new Element(), time = new Element();
  const timers = new Map(), frames = new Map(), observers = [], calls = [];
  const delays = [], cancelled = [];
  let id = 0, elapsed = 0;
  let currentDate = new Date('2026-10-02T03:04:05Z');
  let rect = { width: 800, height: 600, top: 1100, bottom: 1700 };
  document.documentElement = { dataset: { yuimiPerformance: config.profile ?? 'full' }, clientHeight: 1000, scrollTop: 0 };
  document.body = { scrollTop: 0 };
  document.visibilityState = config.hidden ? 'hidden' : 'visible';
  const nodes = { '[data-tag-rain]': stage, '[data-tag-rain-canvas]': canvas, '[data-home-date]': date, '[data-home-time]': time };
  document.querySelector = (selector) => nodes[selector] ?? null;
  stage.dataset = { tags: config.rawTags ?? JSON.stringify(config.tags ?? []) };
  stage.getBoundingClientRect = () => rect;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'measureText') return (text) => { calls.push(['measureText', text]); return { width: text.length * 9 }; };
      if (['save', 'restore', 'setTransform', 'clearRect', 'translate', 'rotate', 'beginPath', 'roundRect', 'fill', 'stroke', 'fillText'].includes(key)) {
        return (...args) => calls.push([key, ...args]);
      }
      return target[key];
    },
    set(target, key, value) { target[key] = value; calls.push(['set', key, value]); return true; }
  });
  canvas.getContext = (kind) => { assert.equal(kind, '2d'); return config.noContext ? null : ctx; };
  Object.assign(window, {
    innerHeight: 1000, devicePixelRatio: config.dpr ?? 2, scrollY: 0,
    performance: { now: () => elapsed },
    matchMedia: (query) => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return { matches: !!config.reduced }; },
    setTimeout: (fn, delay) => { delays.push(delay); timers.set(++id, fn); return id; },
    clearTimeout: (token) => timers.delete(token),
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (token) => { cancelled.push(token); frames.delete(token); }
  });
  if (!config.noObserver) window.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  for (const selector of config.missing ?? []) delete nodes[selector];
  let cleanup;
  const mount = () => (cleanup = mountHomeRuntime({ document, window, now: () => currentDate, random: () => 0.5 }));
  const frame = (timestamp = elapsed + 16.67) => {
    elapsed = timestamp;
    const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(timestamp));
  };
  const fireClock = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); };
  const inView = () => { rect = { ...rect, top: 300, bottom: 900 }; window.scrollY = 100; };
  const start = () => { inView(); window.dispatch('scroll'); frame(); };
  if (!config.noMount) mount();
  return { document, window, stage, canvas, date, time, ctx, calls, nodes, timers, frames, observers, delays, cancelled,
    mount, frame, fireClock, inView, start, stop: () => cleanup(), setDate: (value) => { currentDate = value; },
    setRect: (value) => { rect = { ...rect, ...value }; } };
}
const ownedListeners = (f) => [
  f.document.events.get('visibilitychange')?.size ?? 0,
  f.window.events.get('scroll')?.size ?? 0,
  f.window.events.get('resize')?.size ?? 0,
  f.window.events.get('pagehide')?.size ?? 0
];
const homeSnapshot = (f) => JSON.stringify({ calls: f.calls, date: f.date.textContent, time: f.time.textContent,
  width: f.canvas.width, height: f.canvas.height, styles: f.canvas.style,
  raining: f.stage.classList.contains('is-raining'), fading: f.stage.classList.contains('is-fading'), timers: f.timers.size, frames: f.frames.size });

test('homepage cold mount preserves empty tags, clock format, dimensions and observer thresholds', () => {
  const f = homeFixture();
  assert.equal(f.date.textContent, new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(new Date('2026-10-02T03:04:05Z')));
  assert.equal(f.time.textContent, new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date('2026-10-02T03:04:05Z')));
  assert.deepEqual(f.delays, [1000]);
  assert.equal(f.timers.size, 1);
  assert.equal(f.canvas.width, 1600); assert.equal(f.canvas.height, 1360);
  assert.equal(f.canvas.style.width, '800px'); assert.equal(f.canvas.style.height, '680px');
  assert.deepEqual(f.observers[0].options, { rootMargin: '-34% 0px -42% 0px', threshold: 0.02 });
  assert.equal(f.observers[0].target, f.stage);
  f.start();
  assert.equal(f.stage.classList.contains('is-raining'), false);
  assert.equal(f.frames.size, 0);
  assert.deepEqual(ownedListeners(f), [2, 1, 1, 1]);
  f.stop(); assert.deepEqual(ownedListeners(f), [0, 0, 0, 0]);
});

test('homepage clock ticks each second, pauses hidden, resumes immediately and keeps pagehide behavior', () => {
  const f = homeFixture({ tags: ['Tag'] });
  const original = f.time.textContent;
  f.setDate(new Date('2026-10-02T03:04:06Z')); f.fireClock();
  assert.notEqual(f.time.textContent, original); assert.equal(f.timers.size, 1);
  f.start(); f.frame();
  f.document.visibilityState = 'hidden'; f.document.dispatch('visibilitychange');
  assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  const hidden = f.time.textContent;
  f.setDate(new Date('2026-10-02T03:04:09Z')); f.fireClock(); assert.equal(f.time.textContent, hidden);
  f.document.visibilityState = 'visible'; f.document.dispatch('visibilitychange');
  assert.notEqual(f.time.textContent, hidden); assert.equal(f.timers.size, 1); assert.equal(f.frames.size, 1);
  f.window.dispatch('pagehide'); assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 1, 'original pagehide only cancels rain; the clock is not paused until visibilitychange');
  f.stop(); assert.equal(f.timers.size, 0);
});

test('homepage duplicate mount returns the same cleanup without resetting animation or duplicating resources', () => {
  const f = homeFixture({ tags: ['One', 'Two'] }); f.start(); f.frame(100);
  const before = homeSnapshot(f), cleanup = f.mount();
  assert.equal(f.mount(), cleanup); assert.equal(homeSnapshot(f), before);
  assert.equal(f.observers.length, 1); assert.deepEqual(ownedListeners(f), [2, 1, 1, 1]);
  cleanup(); cleanup(); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  f.mount(); cleanup(); assert.deepEqual(ownedListeners(f), [2, 1, 1, 1]);
  f.stop();
});

for (const missing of [['[data-tag-rain]'], ['[data-tag-rain-canvas]']]) {
  test(`homepage missing ${missing[0]} exits without resources and later entry mounts`, () => {
    const f = homeFixture({ missing });
    assert.deepEqual(ownedListeners(f), [0, 0, 0, 0]); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
    f.stop(); f.stop();
    f.nodes[missing[0]] = missing[0] === '[data-tag-rain]' ? f.stage : f.canvas;
    f.mount(); assert.equal(f.timers.size, 1); f.stop();
  });
}
test('homepage missing Canvas context exits without timers, RAF or observers', () => {
  const f = homeFixture({ noContext: true }); f.stop(); f.stop();
  assert.deepEqual(ownedListeners(f), [0, 0, 0, 0]); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.observers.length, 0);
  assert.equal(f.calls.length, 0);
});

test('homepage scroll fallback uses exact trigger bounds and coalesces scroll events', () => {
  const f = homeFixture({ tags: ['One'], noObserver: true }); f.frame();
  f.window.scrollY = 100; f.setRect({ top: 461, bottom: 900 }); f.window.dispatch('scroll'); f.frame();
  assert.equal(f.stage.classList.contains('is-raining'), false);
  f.setRect({ top: 460, bottom: 339 }); f.window.dispatch('scroll'); f.frame();
  assert.equal(f.stage.classList.contains('is-raining'), false);
  f.setRect({ top: 460, bottom: 340 });
  for (let i = 0; i < 5; i++) f.window.dispatch('scroll');
  assert.equal(f.frames.size, 1); f.frame(); assert.equal(f.stage.classList.contains('is-raining'), true);
  f.frame(100); assert.equal(f.calls.filter(x => x[0] === 'fillText').length, 1);
  f.stop();
});

test('homepage observer starts once; top<=4 resets and scrolling can start again', () => {
  const f = homeFixture({ tags: ['One', 'Two'] }); f.frame();
  f.inView(); f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(f.observers[0].disconnected, true); assert.equal(f.stage.classList.contains('is-raining'), true);
  f.frame(100); f.window.scrollY = 5; f.window.dispatch('scroll'); f.frame(150);
  assert.equal(f.stage.classList.contains('is-raining'), true);
  f.window.scrollY = 4; f.window.dispatch('scroll'); f.frame(200);
  assert.equal(f.stage.classList.contains('is-raining'), false); assert.equal(f.frames.size, 0);
  const before = f.calls.filter(x => x[0] === 'fillText').length;
  f.start(); f.frame(300);
  assert.equal(f.calls.filter(x => x[0] === 'fillText').length, before + 1);
  f.stop();
});

for (const [profile, ceiling, interval] of [['full', 2, 0], ['mobile', 1.15, 1000 / 30], ['lite', 1, 1000 / 24]]) {
  test(`homepage ${profile} preserves DPR cap and frame cadence`, () => {
    const f = homeFixture({ profile, tags: ['One'] });
    assert.equal(f.canvas.width, Math.floor(800 * ceiling));
    assert.equal(f.canvas.height, Math.floor(680 * ceiling));
    f.start(); f.frame(100);
    const clears = f.calls.filter(x => x[0] === 'clearRect').length;
    f.frame(110);
    assert.equal(f.calls.filter(x => x[0] === 'clearRect').length, clears + (interval ? 0 : 1));
    f.stop();
  });
}

test('homepage deterministic labels retain deduplication, colors, font, size and drop cadence', () => {
  const f = homeFixture({ tags: ['One', 'Two', 'One', 'Three', 'Four', 'Five', 'Six'] });
  f.start(); f.frame(100);
  assert.deepEqual(f.calls.filter(x => x[0] === 'measureText').map(x => x[1]), ['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
  assert.equal(f.calls.filter(x => x[0] === 'fillText').length, 1);
  assert.ok(f.calls.some(x => x[0] === 'roundRect' && x[3] === 96 && x[4] === 44 && x[5] === 22));
  assert.ok(f.calls.some(x => x[0] === 'set' && x[1] === 'font' && x[2] === "850 18px 'Cascadia Code', 'Fira Code', Consolas, sans-serif"));
  f.frame(269); assert.equal(f.calls.filter(x => x[0] === 'fillText').length, 2);
  f.frame(270); assert.equal(f.calls.filter(x => x[0] === 'fillText').length, 4);
  for (let t = 440; t <= 1120; t += 170) f.frame(t);
  const fills = f.calls.filter(x => x[0] === 'set' && x[1] === 'fillStyle').map(x => x[2]);
  for (const color of ['#fff5bf', '#ffddea', '#dff2ff', '#dff5ea', '#eee4ff']) assert.ok(fills.includes(color), color);
  f.stop();
});

test('homepage resize updates Canvas dimensions and stays isolated from lifecycle teardown', () => {
  const f = homeFixture({ tags: ['One'] }); f.start(); f.frame(100);
  f.setRect({ width: 400, height: 300 }); f.window.dispatch('resize');
  assert.equal(f.canvas.width, 800); assert.equal(f.canvas.height, 760);
  assert.equal(f.canvas.style.width, '400px'); assert.equal(f.canvas.style.height, '380px');
  assert.equal(f.frames.size, 1); assert.equal(f.timers.size, 1); f.stop();
});

test('homepage reduced motion retains class and clock without observer or rain RAF', () => {
  const f = homeFixture({ reduced: true, tags: ['One'] });
  assert.equal(f.stage.classList.contains('is-reduced-motion'), true);
  assert.equal(f.observers.length, 0); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 1);
  assert.deepEqual(ownedListeners(f), [2, 0, 1, 1]);
  f.document.dispatch('visibilitychange'); assert.equal(f.frames.size, 0); f.stop();
});

for (const rawTags of ['broken JSON', '{}', '[]']) {
  test(`homepage ${rawTags} tag input keeps the original empty-rain behavior`, () => {
    const f = homeFixture({ rawTags }); f.start(); f.frame();
    assert.equal(f.stage.classList.contains('is-raining'), false); assert.equal(f.timers.size, 1); f.stop();
  });
}

test('homepage existing hidden-mount behavior is preserved rather than silently fixed', () => {
  const f = homeFixture({ hidden: true, tags: ['One'] });
  assert.equal(f.timers.size, 0); f.inView(); f.observers[0].callback([{ isIntersecting: true }]);
  f.frame(100);
  assert.ok(f.calls.some(x => x[0] === 'fillText'), 'original state.visible starts true until visibilitychange');
  f.document.dispatch('visibilitychange'); assert.equal(f.frames.size, 0); f.stop();
});

test('homepage cleanup cancels all owned resources, ignores late callbacks and leaves other modules untouched', () => {
  const f = homeFixture({ tags: ['One'] }); f.start(); f.frame(100); f.window.dispatch('scroll');
  const callbacks = [...f.frames.values(), ...f.timers.values(), ...f.document.events.get('visibilitychange'),
    ...f.window.events.get('resize'), ...f.window.events.get('scroll'), ...f.window.events.get('pagehide')];
  const externalListener = () => {};
  f.window.addEventListener('scroll', externalListener);
  const externalFrame = f.window.requestAnimationFrame(() => {}), externalTimer = f.window.setTimeout(() => {}, 99);
  f.stop(); f.stop();
  assert.equal(f.timers.size, 1); assert.ok(f.timers.has(externalTimer));
  assert.equal(f.frames.size, 1); assert.ok(f.frames.has(externalFrame));
  assert.deepEqual(ownedListeners(f), [0, 1, 0, 0]); assert.ok(f.window.events.get('scroll').has(externalListener));
  assert.equal(f.observers[0].disconnected, true);
  const before = homeSnapshot(f);
  callbacks.forEach(fn => fn(1000)); f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(homeSnapshot(f), before);
});

test('homepage replacing roots disposes old DOM and old cleanup cannot remove the new mount', () => {
  const f = homeFixture({ tags: ['Old'] }); f.start(); f.frame(100);
  const oldCleanup = f.mount(), oldTime = f.time.textContent, oldResize = [...f.window.events.get('resize')][0];
  const freshStage = new Element(), freshCanvas = new Element(), freshTime = new Element();
  freshStage.dataset = { tags: '[]' }; freshStage.getBoundingClientRect = f.stage.getBoundingClientRect;
  freshCanvas.getContext = () => f.ctx;
  f.nodes['[data-tag-rain]'] = freshStage; f.nodes['[data-tag-rain-canvas]'] = freshCanvas; f.nodes['[data-home-time]'] = freshTime;
  f.mount(); oldCleanup(); oldResize();
  assert.deepEqual(ownedListeners(f), [2, 1, 1, 1]);
  f.setDate(new Date('2026-10-02T03:04:09Z')); f.fireClock();
  assert.equal(f.time.textContent, oldTime); assert.notEqual(freshTime.textContent, oldTime); f.stop();
});

test('homepage drop completion retains calm/4800ms fade trigger and 5200ms fade ending', () => {
  const f = homeFixture({ tags: ['One'] }); f.start(); f.frame(100); f.frame(270);
  f.frame(5071); assert.equal(f.stage.classList.contains('is-fading'), true);
  f.frame(10270); assert.equal(f.stage.classList.contains('is-fading'), true);
  f.frame(10271); assert.equal(f.stage.classList.contains('is-fading'), false);
  assert.equal(f.stage.classList.contains('is-raining'), false); assert.equal(f.frames.size, 0);
  const draws = f.calls.filter(x => x[0] === 'fillText').length;
  f.inView(); f.window.dispatch('scroll'); f.frame(10300);
  assert.equal(f.calls.filter(x => x[0] === 'fillText').length, draws, 'done rain does not restart until reset at top');
  f.stop();
});

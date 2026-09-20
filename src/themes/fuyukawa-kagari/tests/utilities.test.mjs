import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import postcss from "postcss";
import sharp from "sharp";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const layout = read("layouts/BaseLayout.astro");
const css = postcss.parse(read("styles/refresh.css"));
const declarations = (root, selector) => {
  const values = {};
  root.walkRules((rule) => {
    if (rule.selector !== selector || rule.parent.type !== "root") return;
    rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
  });
  return values;
};
const section = (start, end) => layout.slice(layout.indexOf(start), layout.indexOf(end));

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
  setAttribute(key, value) { this.attributes[key] = value; }
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
  const timers = new Map();
  let id = 0;
  dock.contains = (node) => node === dock || node === handle;
  dock.matches = () => dock.hovered || dock.focused;
  dock.querySelector = (selector) => selector === ":focus" ? (dock.focused ? handle : null) : handle;
  handle.closest = () => handle;
  handle.blur = () => { dock.focused = false; };
  doc.querySelector = () => dock;
  win.setTimeout = (fn) => { timers.set(++id, fn); return id; };
  win.clearTimeout = (key) => timers.delete(key);
  vm.runInNewContext(section("let toyDockCloseTimer", 'const musicCacheKey ='), {
    document: doc, window: win, Node: Element, Element, queueMicrotask
  });
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

test("About game entries use small complete thumbnails in an actual grid", () => {
  const root = postcss.parse(read("pages/AboutPage.astro").match(/<style>([\s\S]*?)<\/style>/)[1]);
  const card = declarations(root, ".about-game-card");
  const image = declarations(root, ".about-game-card img");
  assert.equal(card.display, "grid");
  assert.equal(card["grid-template-columns"], "92px minmax(0, 1fr)");
  assert.equal(image.width, "92px");
  assert.equal(image.height, "64px");
  assert.equal(image["min-height"], "0");
  assert.equal(image["object-fit"], "contain");
  root.walkRules((rule) => {
    if (rule.selector === ".about-game-card img") {
      rule.walkDecls("object-fit", (decl) => assert.equal(decl.value, "contain"));
    }
  });
  assert.equal(declarations(root, ".about-game-card div")["min-height"], "0");
  assert.doesNotMatch(read("styles/refresh-pages.css"), /\.about-game-card (?:img|div|h3|p)\s*\{/);
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

test("sakura uses small notched artwork and compositor-only nested animations", async () => {
  assert.match(read("components/SakuraRain.astro"), /length: 16/);
  assert.match(read("components/SakuraRain.astro"), /<i><\/i>/);
  assert.match(layout, /<SakuraRain \/>/);
  assert.doesNotMatch(layout, /length: 34/);
  for (const name of ["fuyukawa-petal-fall", "fuyukawa-petal-flutter"]) {
    const rule = css.nodes.find((node) => node.type === "atrule" && node.name === "keyframes" && node.params === name);
    assert.ok(rule);
    rule.walkDecls((decl) => assert.ok(["opacity", "transform"].includes(decl.prop), decl.prop));
  }
  assert.match(css.toString(), /data-yuimi-visibility="hidden"[^]*?animation-play-state: paused/);
  assert.match(css.toString(), /prefers-reduced-motion: reduce[^]*?\.sakura-rain \{ display: none/);
  assert.match(css.toString(), /data-yuimi-performance="lite"[^]*?\.sakura-rain \{ display: none/);
  assert.equal(declarations(css, "body[data-fuyukawa] .sakura-rain").opacity, "1");
  assert.equal(declarations(css, "body[data-fuyukawa] .sakura-rain span").height, "var(--sakura-size)");
  assert.match(read("components/SakuraRain.astro"), /opacity: \(0.86/);
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
  doc.querySelector = (selector) => nodes.get(selector);
  doc.body = new Element();
  const storage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  };
  const localStorage = storage();
  localStorage.setItem("yuimi-radio-state-v1", JSON.stringify({ volume: 0 }));
  win.location = { origin: "https://example.test" };
  class Audio extends Element {
    constructor() { super(); this.volume = .28; this.paused = true; this.currentTime = 25; this.duration = 100; }
    load() {}
    async play() { this.paused = false; this.dispatch("play"); }
    pause() { this.paused = true; this.dispatch("pause"); }
  }
  const context = vm.createContext({
    document: doc, window: win, localStorage, sessionStorage: storage(), Audio,
    URL, AbortController, fetch: async () => ({ json: async () => [{ id: "1", title: "A track", src: "/track.mp3" }] })
  });
  vm.runInContext(section("const musicCacheKey =", "window.__yuimiRadio ??=") + "globalThis.player = createMusicPlayer();", context);
  const player = context.player;
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
  for (const controller of ["controlAbort", "audioAbort", "unlockAbort"]) player[controller]?.abort();
});

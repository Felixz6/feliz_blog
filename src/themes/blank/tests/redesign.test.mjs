import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import { parse } from "@astrojs/compiler";
import { normalizeSearch, matchesEntry, readCollectionState, collectionUrl, mountCollection } from "../lib/collection.mjs";
import { menuPosition, readingProgress, mountMenu, mountReading, mountBlank } from "../lib/runtime.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const css = read("styles/theme.css");
const templates = [
  "layouts/BlankLayout.astro",
  ...readdirSync(new URL("../pages/", import.meta.url)).map((file) => `pages/${file}`),
  ...readdirSync(new URL("../components/", import.meta.url)).map((file) => `components/${file}`)
];

test("all seven page types and their components parse", async () => {
  for (const file of templates) {
    const result = await parse(read(file));
    assert.deepEqual(result.diagnostics.filter((item) => item.severity === 1), [], file);
  }
  assert.equal(templates.filter((file) => file.startsWith("pages/")).length, 7);
});

test("presentation adds no media, external fonts, gradients, or chromatic colors", () => {
  for (const file of templates) {
    assert.doesNotMatch(read(file), /<(?:img|picture|video|canvas|iframe)\b|@font-face|background-image|themes\/(?:kisara|fuyukawa-kagari)\//i, file);
  }
  assert.doesNotMatch(css, /url\(|gradient\(|@font-face|hsla?\(/i);
  for (const match of css.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const value = match[1];
    const channels = value.length <= 4 ? value.slice(0, 3).split("") : value.slice(0, 6).match(/../g);
    assert.equal(new Set(channels).size, 1, value);
  }
  for (const match of css.matchAll(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/g)) {
    assert.equal(match[1], match[2]);
    assert.equal(match[2], match[3]);
  }
  assert.match(css, /\.blank-prose :where\(img, video, iframe, canvas\) \{ filter: grayscale\(1\)/);
});

test("type and layout dimensions remain bounded, responsive, and reduced-motion aware", () => {
  const root = postcss.parse(css);
  root.walkDecls("font-size", (decl) => assert.doesNotMatch(decl.value, /vw|cqw|vmin|vmax/));
  root.walkDecls("font", (decl) => assert.doesNotMatch(decl.value, /vw|cqw|vmin|vmax/));
  root.walkDecls("letter-spacing", (decl) => assert.equal(decl.value, "0"));
  root.walkDecls("box-shadow", (decl) => assert.equal(decl.value, "none"));
  assert.match(css, /max-width: 480px/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /max-height: 700px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media print/);
  assert.match(css, /html\[data-yuimi-visibility="hidden"\][^]*animation-play-state: paused !important/);
  assert.match(css, /body\[data-blank\] \[hidden\] \{ display: none !important/);
});

test("layout preserves metadata, theme preference, active navigation, and static fallbacks", () => {
  const layout = read("layouts/BlankLayout.astro");
  assert.match(layout, /<SeoMeta/);
  assert.match(layout, /content="noindex,follow"/);
  assert.match(layout, /<link rel="canonical"/);
  assert.match(layout, /<ThemePreferenceGate currentTheme="blank"/);
  assert.match(layout, /aria-current=\{item.active/);
  assert.match(layout, /aria-controls="blank-theme-menu"/);
  assert.match(layout, /id="blank-main"[^>]*tabindex="-1"/);
  assert.match(layout, /<noscript>/);
  assert.doesNotMatch(layout, /ClientRouter|data-yuimi-selection-lock/);
  for (const file of templates) {
    assert.doesNotMatch(read(file), /同一份内容|shared profile data|blank frontend|separate Astro frontend|独立实现|不加载角色/);
  }
});

test("all page data and essential links remain, with no project or game art", () => {
  assert.match(read("pages/HomePage.astro"), /getPublishedPosts/);
  assert.match(read("pages/BlogIndexPage.astro"), /posts.map/);
  for (const key of ["animeFavorites", "currentSignals", "favoriteGames", "profileIdentity", "profileStatus", "profileTech", "xpFavorites"]) {
    assert.ok(read("pages/AboutPage.astro").includes(key));
  }
  for (const key of ["game.author", "game.license", "game.play", "game.repo", "game.thanks"]) assert.ok(read("pages/GamesPage.astro").includes(key));
  assert.match(read("pages/ProjectsPage.astro"), /<details[^>]*open=\{index === 0\}/);
  assert.match(read("pages/ArticlePage.astro"), /<slot \/>/);
  assert.match(read("pages/ArticlePage.astro"), /encodeURIComponent\(tag\)/);
  assert.match(read("pages/ArticlePage.astro"), /<details open>/);
  assert.match(css, /max-height: min\(38svh, 300px\)/);
  assert.match(css, /\.blank-prose table \{[^}]*overflow-x: auto/);
});

test("search handles Chinese, full-width ASCII, mixed case, multiple terms, and literal markup", () => {
  assert.equal(normalizeSearch("  ＡＳＴＲＯ   笔记  "), "astro 笔记");
  const entry = { category: "tech", search: "Astro 开发笔记 / Agent <script>" };
  assert.ok(matchesEntry(entry, "ＡＧＥＮＴ 笔记", "tech"));
  assert.ok(matchesEntry(entry, "<script>", "all"));
  assert.equal(matchesEntry(entry, "Agent", "life"), false);
  assert.equal(matchesEntry(entry, "Agent 不存在", "all"), false);
});

test("filter URLs preserve unrelated query parameters and hashes and validate categories", () => {
  const state = readCollectionState("https://local.test/themes/blank/blog/?q=Astro&category=tech&sort=oldest", ["all", "tech"]);
  assert.deepEqual(state, { query: "Astro", category: "tech", sort: "oldest" });
  assert.deepEqual(readCollectionState("https://local.test/?category=evil&sort=evil", ["all"]), { query: "", category: "all", sort: "newest" });
  const url = collectionUrl("https://local.test/themes/blank/blog/?from=reader&q=old#section", { query: "", category: "life", sort: "newest" });
  assert.equal(url, "/themes/blank/blog/?from=reader&category=life#section");
  assert.equal(readCollectionState(`https://local.test/?q=${"a".repeat(500)}`, ["all"]).query.length, 300);
});

class Hub {
  events = new Map();
  addEventListener(type, handler) {
    if (!this.events.has(type)) this.events.set(type, new Set());
    this.events.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.events.get(type)?.delete(handler); }
  emit(type, details = {}) {
    const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, ...details };
    for (const handler of this.events.get(type) ?? []) handler(event);
    return event;
  }
  listenerCount() { return [...this.events.values()].reduce((sum, handlers) => sum + handlers.size, 0); }
}

class Node extends Hub {
  constructor(dataset = {}) {
    super();
    this.dataset = dataset;
    this.children = [];
    this.selectors = {};
    this.attributes = {};
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.style = {};
    this.isConnected = true;
    this.rect = { left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 };
  }
  querySelector(selector) { return this.selectors[selector]?.[0] ?? null; }
  querySelectorAll(selector) { return this.selectors[selector] ?? []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  getBoundingClientRect() { return this.rect; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  focus() { this.focused = true; if (this.doc) this.doc.activeElement = this; }
  closest(selector) {
    if (selector === "[data-theme-select]" && this.dataset.themeSelect) return this;
    if (selector === "a" && this.tagName === "a") return this;
    return null;
  }
  append(node) { this.children = this.children.filter((child) => child !== node); this.children.push(node); }
}

function windowFixture(href = "https://local.test/themes/blank/blog/") {
  const win = new Hub();
  const timers = new Map(), frames = new Map();
  let next = 1;
  Object.assign(win, {
    location: { href }, innerWidth: 390, innerHeight: 844,
    getSelection: () => ({ toString: () => "" }),
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = next++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    history: { state: { original: true }, replaceState(state, _, url) { win.location.href = new URL(url, win.location.href).href; this.state = state; } },
    timers, frames,
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); }
  });
  return win;
}

function collectionFixture() {
  const root = new Node({ unit: "篇文章" }), list = new Node(), form = new Node(), input = new Node(), sort = new Node(), clear = new Node(), reset = new Node(), empty = new Node(), count = new Node();
  const buttons = ["all", "tech", "life"].map((blankCategory) => new Node({ blankCategory }));
  const entries = [
    new Node({ search: "Astro 开发", category: "tech", date: "300" }),
    new Node({ search: "生活 日常", category: "life", date: "200" }),
    new Node({ search: "Agent 笔记", category: "tech", date: "100" })
  ];
  root.selectors = {
    "[data-blank-filter-form]": [form], "[data-blank-entries]": [list], "[data-blank-query]": [input],
    "[data-blank-sort]": [sort], "[data-blank-clear]": [clear], "[data-blank-reset]": [reset],
    "[data-blank-empty]": [empty], "[data-blank-count]": [count], "[data-blank-category]": buttons
  };
  list.selectors["[data-blank-entry]"] = entries;
  list.children = [...entries];
  form.hidden = true;
  return { root, list, form, input, sort, clear, reset, empty, count, buttons, entries };
}

test("production collection runtime filters, counts, sorts, clears, and restores URL state", () => {
  const f = collectionFixture(), win = windowFixture();
  const cleanup = mountCollection(f.root, win);
  assert.equal(f.form.hidden, false);
  assert.equal(f.count.textContent, "3 篇文章");
  f.buttons[1].emit("click");
  assert.deepEqual(f.entries.map((node) => node.hidden), [false, true, false]);
  assert.equal(f.count.textContent, "2 篇文章");
  assert.equal(f.buttons[1].attributes["aria-pressed"], "true");
  f.input.value = "Astro";
  f.input.emit("input");
  assert.equal(f.count.textContent, "1 篇文章");
  win.flushTimers();
  assert.equal(new URL(win.location.href).searchParams.get("q"), "Astro");
  f.input.value = "missing";
  f.input.emit("input");
  assert.equal(f.empty.hidden, false);
  f.clear.emit("click");
  assert.equal(f.input.value, "");
  assert.equal(f.count.textContent, "2 篇文章");
  f.reset.emit("click");
  f.sort.value = "oldest";
  f.sort.emit("change");
  assert.deepEqual(f.list.children.map((node) => node.dataset.date), ["100", "200", "300"]);
  win.location.href = "https://local.test/themes/blank/blog/?category=life";
  win.emit("popstate");
  assert.equal(f.count.textContent, "1 篇文章");
  assert.equal(f.input.value, "");
  cleanup();
  assert.equal(win.listenerCount(), 0);
  assert.equal(f.input.listenerCount(), 0);
  assert.equal(win.timers.size, 0);
});

test("project filters also work without search or sort controls", () => {
  const f = collectionFixture(), win = windowFixture("https://local.test/themes/blank/projects/?q=ignored&sort=oldest&category=tech");
  delete f.root.selectors["[data-blank-query]"];
  delete f.root.selectors["[data-blank-sort]"];
  const cleanup = mountCollection(f.root, win);
  assert.equal(f.count.textContent, "2 篇文章");
  f.reset.emit("click");
  assert.equal(f.count.textContent, "3 篇文章");
  assert.equal(f.buttons[0].focused, true);
  cleanup();
});

test("search preserves IME composition and flushes pending URL state on navigation", () => {
  const f = collectionFixture(), win = windowFixture();
  const cleanup = mountCollection(f.root, win);
  f.input.value = "开发";
  f.input.emit("input", { isComposing: true });
  assert.equal(f.count.textContent, "3 篇文章");
  assert.equal(win.timers.size, 0);
  f.input.emit("compositionend");
  assert.equal(f.count.textContent, "1 篇文章");
  assert.equal(win.timers.size, 1);
  win.emit("pagehide");
  assert.equal(win.timers.size, 0);
  assert.equal(new URL(win.location.href).searchParams.get("q"), "开发");
  cleanup();
});

test("menu placement remains within small and short viewports", () => {
  assert.deepEqual(menuPosition(400, 800, 252, 284, 390, 844), { left: 130, top: 552 });
  assert.deepEqual(menuPosition(-100, -100, 252, 230, 320, 240), { left: 8, top: 8 });
});

function menuFixture() {
  const doc = new Node(), menu = new Node(), trigger = new Node();
  const buttons = ["fuyukawa-kagari", "blank", "kisara"].map((themeSelect) => new Node({ themeSelect }));
  const links = [new Node(), new Node()];
  links.forEach((link) => { link.tagName = "a"; });
  const controls = [...buttons, ...links];
  controls.forEach((node) => { node.doc = doc; });
  trigger.doc = doc;
  menu.children = controls;
  menu.selectors["button, a[href]"] = controls;
  menu.hidden = true;
  menu.rect = { ...menu.rect, width: 252, height: 284 };
  trigger.hidden = true;
  trigger.rect = { left: 330, right: 370, top: 10, bottom: 50, width: 40, height: 40 };
  doc.selectors = { "[data-blank-context-menu]": [menu], "[data-blank-menu-trigger]": [trigger] };
  doc.activeElement = trigger;
  return { doc, menu, trigger, controls, buttons, links };
}

test("production menu handles focus, keys, explicit selection, dismissal and cleanup", () => {
  const f = menuFixture(), win = windowFixture();
  let theme;
  win.__yuimiTheme = { select: (value) => { theme = value; } };
  const cleanup = mountMenu(f.doc, win);
  assert.equal(f.trigger.hidden, false);
  f.trigger.emit("click");
  assert.equal(f.menu.hidden, false);
  assert.equal(f.trigger.attributes["aria-expanded"], "true");
  assert.equal(f.doc.activeElement, f.controls[0]);
  f.doc.emit("keydown", { key: "ArrowUp" });
  assert.equal(f.doc.activeElement, f.controls.at(-1));
  f.doc.emit("keydown", { key: "Home" });
  assert.equal(f.doc.activeElement, f.controls[0]);
  f.doc.emit("click", { target: f.buttons[2] });
  assert.equal(theme, "kisara");
  assert.equal(f.menu.hidden, true);
  assert.equal(f.doc.activeElement, f.trigger);
  f.trigger.emit("click");
  f.doc.emit("keydown", { key: "Escape" });
  assert.equal(f.menu.hidden, true);
  f.doc.emit("keydown", { key: "F10", shiftKey: true });
  assert.equal(f.menu.hidden, false);
  win.emit("resize");
  assert.equal(f.menu.hidden, true);
  cleanup();
  assert.equal(win.listenerCount() + f.doc.listenerCount() + f.trigger.listenerCount(), 0);
});

test("native selection context menu is not intercepted", () => {
  const f = menuFixture(), win = windowFixture();
  const cleanup = mountMenu(f.doc, win);
  win.getSelection = () => ({ toString: () => "selected prose" });
  const event = f.doc.emit("contextmenu", { clientX: 50, clientY: 80 });
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(f.menu.hidden, true);
  win.emit("yuimi:context-menu-request", { detail: { clientX: 100, clientY: 100 } });
  assert.equal(f.menu.hidden, true);
  cleanup();
});

test("background context menu returns focus to its visible trigger", () => {
  const f = menuFixture(), win = windowFixture();
  f.doc.body = new Node();
  f.doc.activeElement = f.doc.body;
  const cleanup = mountMenu(f.doc, win);
  f.doc.emit("contextmenu", { clientX: 350, clientY: 700 });
  assert.equal(f.doc.activeElement, f.controls[0]);
  f.doc.emit("keydown", { key: "Escape" });
  assert.equal(f.doc.activeElement, f.trigger);
  cleanup();
});

test("reading progress is finite and bounded for both short and long articles", () => {
  assert.equal(readingProgress(200, 2000, 800, 80), 0);
  assert.equal(readingProgress(-560, 2000, 800, 80), .5);
  assert.equal(readingProgress(-2000, 2000, 800, 80), 1);
  assert.equal(readingProgress(100, 200, 800, 80), 1);
  assert.equal(readingProgress(700, 200, 800, 80), .5);
  assert.equal(readingProgress(900, 200, 800, 80), 0);
});

test("production reading runtime coalesces scrolls, tracks headings, pauses hidden, and cleans up", () => {
  const doc = new Node(), win = windowFixture();
  const prose = new Node(), progress = new Node(), header = new Node();
  prose.rect = { top: 200, height: 2000 };
  header.rect.height = 80;
  const headings = [new Node(), new Node()];
  headings[0].rect.top = 200;
  headings[1].rect.top = 900;
  const links = [new Node(), new Node()];
  links.forEach((link, index) => { link.hash = `#section-${index}`; });
  doc.selectors = { "[data-blank-prose]": [prose], "[data-blank-progress]": [progress], ".blank-header": [header], "[data-blank-toc] a": links };
  doc.getElementById = (id) => headings[Number(id.at(-1))];
  let observer;
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(node) { this.observed = node; }
    disconnect() { this.disconnected = true; }
  };
  const cleanup = mountReading(doc, win);
  win.flushFrames();
  assert.equal(progress.style.transform, "scaleX(0)");
  headings[0].rect.top = 50;
  win.emit("scroll"); win.emit("scroll");
  assert.equal(win.frames.size, 1);
  win.flushFrames();
  assert.equal(links[0].attributes["aria-current"], "location");
  headings[1].rect.top = 100;
  observer.callback();
  win.flushFrames();
  assert.equal(links[0].attributes["aria-current"], undefined);
  assert.equal(links[1].attributes["aria-current"], "location");
  win.emit("scroll");
  doc.hidden = true;
  doc.emit("visibilitychange");
  assert.equal(win.frames.size, 0);
  win.emit("scroll");
  assert.equal(win.frames.size, 0);
  doc.hidden = false;
  doc.emit("visibilitychange");
  assert.equal(win.frames.size, 1);
  cleanup();
  assert.equal(win.frames.size, 0);
  assert.equal(observer.disconnected, true);
  assert.equal(win.listenerCount() + doc.listenerCount() + prose.listenerCount(), 0);
});

test("full theme runtime uses text for 404 input and retains bfcache functionality", () => {
  const f = menuFixture();
  const win = windowFixture("https://local.test/themes/blank/404/?from=%3Cscript%3Ebad%3C/script%3E");
  const missing = new Node();
  missing.hidden = true;
  f.doc.selectors["[data-blank-missing-path]"] = [missing];
  const cleanup = mountBlank(f.doc, win);
  assert.equal(missing.textContent, "<script>bad</script>");
  assert.equal(missing.hidden, false);
  win.emit("pagehide", { persisted: true });
  f.trigger.emit("click");
  assert.equal(f.menu.hidden, false);
  cleanup();
  assert.equal(win.listenerCount() + f.doc.listenerCount() + f.trigger.listenerCount(), 0);
});

test("code copy controls retain contrast on a black reader background", () => {
  let found = false;
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector !== "body[data-blank] .expressive-code") return;
    const declarations = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
    assert.equal(declarations["--ec-codeBg"], "#000");
    assert.equal(declarations["--ec-frm-inlBtnFg"], "#fff");
    assert.equal(declarations["--ec-frm-trmBg"], "#000");
    assert.equal(declarations.filter, "grayscale(1)");
    found = true;
  });
  assert.ok(found);
});

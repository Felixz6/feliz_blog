import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import postcss from "postcss";
import { parse } from "@astrojs/compiler";
import { mountHomeHero } from "../lib/home-hero.mjs";
import { springStep, layerOffsets, nearestRailIndex, mountMangaScene, mountAlbum, mountArchive, mountChapterRail, mountArticleToc } from "../lib/manga-runtime.mjs";

const root = process.cwd();
const theme = path.join(root, "src/themes/fuyukawa-kagari");
const assets = path.join(root, "public/themes/fuyukawa-kagari/assets");
const read = (file) => fs.readFile(path.join(theme, file), "utf8");
const manifest = JSON.parse(await fs.readFile(path.join(assets, "manga/manifest.json"), "utf8"));

// prepare-art.mjs's manifest records the original lossless derivatives. The seven
// published replacements were deliberately compressed in 3d86926; pin their
// exact bytes here without rewriting that source/provenance manifest.
const publishedOptimized = {
  "letter-page.webp": { width: 384, height: 522, bytes: 42948, sha256: "7331944e8e013cb4e3e70cba00f074b7cf284b1ceac4773e6f773c1781808f91" },
  "kagari-tea.webp": { width: 280, height: 510, bytes: 23002, sha256: "9296e9caac0d2a882a34bb2b13606024d702dc8ff1965e5ebde036e3eee07b59" },
  "haruto-gift.webp": { width: 280, height: 540, bytes: 25082, sha256: "5e8c26d9ca8934586c26ee10d98fab175c79c06486ebfac7abd38d0728522371" },
  "festival-pair.webp": { width: 320, height: 372, bytes: 27078, sha256: "00cdd76eb0faefedc25cb7bd4542d5fa618e154d4f20a1700b9eb43fc4890459" },
  "kagari-thinking.webp": { width: 328, height: 512, bytes: 25922, sha256: "12c136ecc5d1e48c501d8a54c852ebab778a66425875a7dcfac700ac4869d8b5" },
  "hero-character.webp": { width: 1920, height: 1080, bytes: 83534, sha256: "423f26df76888f65dd4b997b2432fb8936af44b74b21b6618070c5e2d7817ba0" },
  "hero-manga.webp": { width: 1920, height: 1080, bytes: 303894, sha256: "d95a6946ca4bf30c4daba6e44002f1b550bfb6fa139322502115283bbb487393" }
};

test("artwork derivatives have correct dimensions, transparent stickers and bounded byte counts", async () => {
  let bytes = 0;
  for (const output of manifest.outputs) {
    const file = path.join(assets, "manga", output.file);
    const buffer = await fs.readFile(file);
    const metadata = await sharp(buffer).metadata();
    const published = publishedOptimized[output.file] ?? output;
    assert.equal(metadata.width, published.width, output.file);
    assert.equal(metadata.height, published.height, output.file);
    assert.equal(buffer.length, published.bytes, output.file);
    assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"), published.sha256, output.file);
    assert.ok(buffer.length < 900_000, output.file);
    if (/kagari-|haruto-|festival-pair|hero-character/.test(output.file)) assert.ok(metadata.hasAlpha, output.file);
    bytes += buffer.length;
  }
  assert.ok(Object.keys(publishedOptimized).every((file) => manifest.outputs.some((output) => output.file === file)));
  assert.ok(bytes < 3_500_000);
  assert.ok(manifest.outputs.every((output) => output.sources.every((source) => !source.endsWith(".mp4"))));
});

test("source artwork inventory has valid hashes and included originals remain byte-identical", async () => {
  assert.equal(manifest.sourceFiles.length, 55);
  const seen = new Set();
  for (const source of manifest.sourceFiles) {
    assert.match(source.file, /^fuyukawa\/[^/]+$/);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(seen.has(source.file), false, `duplicate source ${source.file}`);
    seen.add(source.file);

    let bytes;
    try {
      bytes = await fs.readFile(path.join(root, source.file));
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), source.sha256, source.file);
  }
  assert.equal(seen.size, 55);
});

test("the published transparent hero preserves the original mask and bounded colour fidelity", async () => {
  const original = await sharp(path.join(assets, "hero-wallpaper.jpg")).resize(1920, 1080).removeAlpha().raw().toBuffer();
  const foreground = await sharp(path.join(assets, "manga/hero-character.webp")).ensureAlpha().raw().toBuffer();
  const mask = await sharp(path.join(theme, "art/hero-subject-mask.svg")).resize(1920, 1080).ensureAlpha().extractChannel(3).raw().toBuffer();
  let opaque = 0, transparent = 0, colourError = 0, maxColourError = 0;
  for (let i = 0; i < 1920 * 1080; i++) {
    assert.equal(foreground[i * 4 + 3], mask[i], `alpha pixel ${i}`);
    if (!mask[i]) { transparent++; continue; }
    if (mask[i] === 255) {
      opaque++;
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(foreground[i * 4 + c] - original[i * 3 + c]);
        colourError += error;
        maxColourError = Math.max(maxColourError, error);
      }
    }
  }
  assert.ok(opaque > 400_000 && transparent > 1_500_000);
  assert.ok(colourError / (opaque * 3) < 3, "opaque RGB mean error");
  assert.ok(maxColourError <= 50, "opaque RGB peak error");
});

test("published background retains bounded fidelity in the original panel regions", async () => {
  const original = await sharp(path.join(assets, "hero-wallpaper.jpg")).resize(1920, 1080).removeAlpha().raw().toBuffer();
  const background = await sharp(path.join(assets, "manga/hero-manga.webp")).removeAlpha().raw().toBuffer();
  let colourError = 0, maxColourError = 0, channels = 0;
  for (const rect of manifest.hero.preservedRegions) {
    for (let y = rect.top; y < rect.top + rect.height; y++) {
      const from = (y * 1920 + rect.left) * 3;
      for (let i = from; i < from + rect.width * 3; i++) {
        const error = Math.abs(background[i] - original[i]);
        colourError += error;
        maxColourError = Math.max(maxColourError, error);
        channels++;
      }
    }
  }
  assert.ok(channels > 3_000_000);
  assert.ok(colourError / channels < 2, "preserved panel mean error");
  assert.ok(maxColourError <= 30, "preserved panel peak error");
});

test("spring and parallax remain bounded across frame rates and oversized deltas", () => {
  for (const fps of [30, 60, 120]) {
    let position = 0, velocity = 0;
    for (let i = 0; i < fps * 4; i++) {
      ({ position, velocity } = springStep(position, velocity, 1, 1 / fps));
      assert.ok(Number.isFinite(position) && Math.abs(position) <= 1.08);
    }
    assert.ok(Math.abs(position - 1) < .001);
  }
  for (const x of [-10, -1, 0, 1, 10]) {
    for (const y of [-10, -1, 0, 1, 10]) {
      const { front, back } = layerOffsets(x, y, 20);
      assert.ok(Math.abs(front.x) < 10 && Math.abs(front.y) < 15);
      assert.ok(Math.abs(back.x) < 5 && Math.abs(back.y) < 9);
      // A 24px overscan on each side contains both layers at every permitted pose.
      assert.ok(Math.abs(front.x) < 24 && Math.abs(front.y) < 24);
    }
  }
});

function element(dataset = {}) {
  const events = new Map();
  return {
    dataset, events, style: {}, attributes: {}, isConnected: true, hidden: false,
    addEventListener(event, handler) {
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(handler);
    },
    removeEventListener(event, handler) { events.get(event)?.delete(handler); },
    dispatch(event, value = {}) { for (const handler of events.get(event) ?? []) handler(value); },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    querySelector() {}, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 700 }; }
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

function sceneFixture({ reduce = false, fine = true, decode = () => Promise.resolve() } = {}) {
  const root = element();
  const front = Object.assign(element(), { decode, naturalWidth: 1920 });
  const back = Object.assign(element(), { decode, naturalWidth: 1920 });
  root.querySelector = (selector) => selector === "[data-manga-front]" ? front : back;
  const reduced = Object.assign(element(), { matches: reduce });
  const pointer = Object.assign(element(), { matches: fine });
  const frames = new Map();
  let frameId = 0, observer, time = 0;
  const win = Object.assign(element(), {
    scrollY: 0, navigator: { connection: {} },
    matchMedia: (query) => query.includes("reduced") ? reduced : pointer,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { observer = this; this.callback = callback; this.disconnected = false; }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
  });
  const doc = Object.assign(element(), { hidden: false, documentElement: { dataset: {} } });
  const cleanup = mountMangaScene(root, win, doc);
  const step = () => {
    time += 1000 / 60;
    const batch = [...frames.values()]; frames.clear();
    batch.forEach((callback) => callback(time));
  };
  return { root, front, back, win, doc, reduced, pointer, frames, step, observer, cleanup };
}

test("scene swaps layers atomically after decode, sleeps at rest and tears down all listeners", async () => {
  const fixture = sceneFixture();
  assert.equal(fixture.root.dataset.ready, undefined);
  await settle();
  assert.equal(fixture.root.dataset.ready, "true");
  fixture.root.dispatch("pointermove", { clientX: 1000, clientY: 550, pointerType: "mouse" });
  for (let i = 0; i < 280; i++) fixture.step();
  assert.match(fixture.front.style.transform, /translate3d\(6\.000px/);
  assert.equal(fixture.frames.size, 0);
  fixture.root.dispatch("pointerleave");
  fixture.step();
  assert.ok(fixture.frames.size > 0);
  fixture.cleanup();
  assert.equal(fixture.frames.size, 0);
  assert.ok(fixture.observer.disconnected);
  assert.equal(fixture.front.style.transform, "");
  assert.ok([...fixture.win.events.values()].every((handlers) => handlers.size === 0));
  assert.ok([...fixture.root.events.values()].every((handlers) => handlers.size === 0));
});

test("scene stops for reduced motion, coarse pointer, hidden, offscreen and lite modes", async () => {
  for (const options of [{ reduce: true }, { fine: false }]) {
    const fixture = sceneFixture(options);
    await settle();
    fixture.root.dispatch("pointermove", { clientX: 1000, clientY: 550 });
    assert.equal(fixture.frames.size, 0);
    assert.equal(fixture.root.dataset.ready, "true");
    fixture.cleanup();
  }
  const fixture = sceneFixture();
  await settle();
  fixture.root.dispatch("pointermove", { clientX: 1000, clientY: 550 });
  fixture.step();
  fixture.doc.hidden = true;
  fixture.doc.dispatch("visibilitychange");
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.front.style.transform, "");
  fixture.doc.hidden = false;
  fixture.doc.dispatch("visibilitychange");
  fixture.observer.callback([{ isIntersecting: false }]);
  assert.equal(fixture.frames.size, 0);
  fixture.observer.callback([{ isIntersecting: true }]);
  fixture.doc.documentElement.dataset.yuimiPerformance = "lite";
  fixture.step();
  assert.equal(fixture.frames.size, 0);
  fixture.cleanup();
});

test("failed or late image decode never reveals an incomplete scene", async () => {
  const failed = sceneFixture({ decode: () => Promise.reject(new Error("Image missing")) });
  await settle();
  assert.equal(failed.root.dataset.ready, "false");
  assert.equal(failed.frames.size, 0);
  failed.cleanup();
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  const late = sceneFixture({ decode: () => promise });
  late.cleanup();
  resolve();
  await settle();
  assert.equal(late.root.dataset.ready, undefined);
  assert.equal(late.frames.size, 0);
});

test("album tabs and image controls switch pages, wrap forward, and remove handlers", () => {
  const root = element();
  const tabs = Array.from({ length: 3 }, () => element());
  const pages = Array.from({ length: 3 }, () => element());
  const nextButtons = Array.from({ length: 3 }, () => element());
  pages.forEach((page, index) => { page.querySelector = (selector) => selector === "[data-album-next]" ? nextButtons[index] : null; });
  root.querySelectorAll = (selector) => selector.includes("tab") ? tabs : pages;
  const cleanup = mountAlbum(root);
  tabs[2].dispatch("click");
  assert.deepEqual(pages.map((page) => page.hidden), [true, true, false]);
  assert.deepEqual(tabs.map((tab) => tab.attributes["aria-pressed"]), ["false", "false", "true"]);
  nextButtons[2].dispatch("click");
  assert.deepEqual(pages.map((page) => page.hidden), [false, true, true]);
  assert.deepEqual(tabs.map((tab) => tab.attributes["aria-pressed"]), ["true", "false", "false"]);
  nextButtons[0].dispatch("click");
  assert.deepEqual(pages.map((page) => page.hidden), [true, false, true]);
  cleanup();
  assert.ok(tabs.every((tab) => tab.events.get("click").size === 0));
  assert.ok(nextButtons.every((button) => button.events.get("click").size === 0));
});

test("archive filters include empty categories and restore every entry", () => {
  const root = element();
  const tabs = ["all", "tech", "anime", "life"].map((archiveCategory) => element({ archiveCategory }));
  const entries = ["tech", "life", "tech"].map((entryCategory) => element({ entryCategory }));
  const count = element();
  root.querySelectorAll = (selector) => selector.includes("archive-category") ? tabs : entries;
  root.querySelector = () => count;
  const cleanup = mountArchive(root);
  tabs[2].dispatch("click");
  assert.ok(entries.every((entry) => entry.hidden));
  assert.equal(count.textContent, "0 篇笔记");
  tabs[1].dispatch("click");
  assert.deepEqual(entries.map((entry) => entry.hidden), [false, true, false]);
  tabs[0].dispatch("click");
  assert.ok(entries.every((entry) => !entry.hidden));
  cleanup();
});

test("archive category filters restore from and update shareable URL state", () => {
  const root = element();
  const tabs = ["all", "tech", "anime", "life"].map((archiveCategory) => element({ archiveCategory }));
  const entries = ["tech", "life", "tech"].map((entryCategory) => element({ entryCategory }));
  const count = element();
  const events = new Map();
  const location = new URL("https://example.test/blog/?q=CTF&category=life");
  const view = {
    location,
    history: {
      state: { source: "test" },
      replaceState(state, _title, target) {
        this.state = state;
        location.href = new URL(target, location.href).href;
      }
    },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name, listener) => { if (events.get(name) === listener) events.delete(name); }
  };
  root.ownerDocument = { defaultView: view };
  root.querySelectorAll = (selector) => selector.includes("archive-category") ? tabs : entries;
  root.querySelector = () => count;

  const cleanup = mountArchive(root);
  assert.deepEqual(entries.map((entry) => entry.hidden), [true, false, true]);
  assert.deepEqual(tabs.map((tab) => tab.attributes["aria-pressed"]), ["false", "false", "false", "true"]);
  tabs[1].dispatch("click");
  assert.equal(new URL(location.href).searchParams.get("category"), "tech");
  assert.equal(new URL(location.href).searchParams.get("q"), "CTF");
  assert.deepEqual(entries.map((entry) => entry.hidden), [false, true, false]);

  location.href = "https://example.test/blog/?q=Steam&category=anime";
  events.get("popstate")();
  assert.deepEqual(entries.map((entry) => entry.hidden), [true, true, true]);
  assert.equal(count.textContent, "0 篇笔记");
  cleanup();
  assert.equal(events.has("popstate"), false);
});

test("article TOC highlights the current chapter in every navigation and cleans up", () => {
  const first = Object.assign(element(), { id: "start", top: 500 });
  const second = Object.assign(element(), { id: "details", top: 900 });
  first.getBoundingClientRect = () => ({ top: first.top });
  second.getBoundingClientRect = () => ({ top: second.top });
  const link = (id) => Object.assign(element(), {
    getAttribute: (name) => name === "href" ? `#${id}` : null
  });
  const mobileLinks = [link("start"), link("details")];
  const desktopLinks = [link("start"), link("details")];
  const mobileNav = element(), desktopNav = element();
  mobileNav.querySelectorAll = () => mobileLinks;
  desktopNav.querySelectorAll = () => desktopLinks;
  const root = element();
  root.querySelectorAll = (selector) => selector === "[data-article-toc]"
    ? [mobileNav, desktopNav]
    : [first, second];
  const win = element();
  const frames = new Map();
  let frameId = 0;
  Object.assign(win, {
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });

  const cleanup = mountArticleToc(root, win);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  flush();
  assert.equal(mobileLinks[0].attributes["aria-current"], "location");
  assert.equal(desktopLinks[0].attributes["aria-current"], "location");

  first.top = 80;
  // CSS combines a 100px root scroll padding and a 100px heading scroll margin,
  // so a hash jump can leave the target heading around 200px below the viewport top.
  second.top = 200;
  win.dispatch("scroll");
  flush();
  assert.equal(mobileLinks[1].attributes["aria-current"], "location");
  assert.equal(desktopLinks[1].attributes["aria-current"], "location");
  assert.equal(mobileLinks[0].attributes["aria-current"], undefined);

  cleanup();
  assert.ok([...win.events.values()].every((handlers) => handlers.size === 0));
});

test("chapter controls target real leaf positions and account for track ends", () => {
  assert.equal(nearestRailIndex([0, 324, 648], 600), 2);
  const root = element(), previous = element(), next = element(), label = element();
  const track = Object.assign(element(), { scrollLeft: 0, scrollWidth: 972, clientWidth: 400, scrollTo(value) { this.scrollLeft = Math.min(value.left, this.scrollWidth - this.clientWidth); } });
  const items = [0, 324, 648].map((offsetLeft) => ({ offsetLeft }));
  root.querySelectorAll = () => items;
  root.querySelector = (selector) => ({ "[data-rail-track]": track, "[data-rail-prev]": previous, "[data-rail-next]": next, "[data-rail-position]": label })[selector];
  const frames = [];
  const win = Object.assign(element(), { matchMedia: () => ({ matches: true }), requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {} });
  const cleanup = mountChapterRail(root, win);
  assert.equal(previous.disabled, true);
  next.dispatch("click");
  assert.equal(track.scrollLeft, 324);
  track.dispatch("scroll"); frames.pop()();
  assert.equal(label.textContent, "02 / 03");
  next.dispatch("click"); next.dispatch("click");
  track.dispatch("scroll"); frames.pop()();
  assert.equal(next.disabled, true);
  cleanup();
});

test("home chapter rail exposes intended routes and numbers About as the third chapter", async () => {
  const source = await read("components/ChapterRail.astro");
  const routes = [...source.matchAll(/route: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, ["/blog/", "/projects/", "/about/"]);
  assert.match(source, /route: "\/about\/", label: "03 \/ Dear reader"/);
  assert.match(source, /data-rail-position[^>]*>01 \/ 03</);
});

test("offscreen home chapter artwork stays lazy, asynchronously decoded, and low priority", async () => {
  const rail = await read("components/ChapterRail.astro");
  const images = [...rail.matchAll(/<MangaArt\b[^>]*\/>/g)].map(([markup]) => markup);
  assert.equal(images.length, 2);
  assert.ok(images.every((markup) => /fetchpriority="low"/.test(markup)));
  assert.ok(images.every((markup) => !/\beager\b/.test(markup)));

  const component = await read("components/MangaArt.astro");
  assert.match(component, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(component, /decoding="async"/);
  assert.match(component, /fetchpriority=\{fetchpriority\}/);

  const hero = await read("components/LayeredHero.astro");
  assert.match(hero, /mangaArt\("hero-manga"\)/);
  assert.doesNotMatch(hero, /fetchpriority="low"|loading="lazy"/);
});

test("home static scene paints before JavaScript and avoids the duplicate mobile wallpaper", async () => {
  const manga = await read("styles/manga.css");
  const refresh = await read("styles/refresh.css");
  const layout = await read("layouts/BaseLayout.astro");
  const hero = await read("components/LayeredHero.astro");
  assert.match(refresh, /\.hero\s*\{[^}]*background:\s*#f5f6f6/);
  assert.doesNotMatch(refresh, /hero-wallpaper(?:-mobile)?\.webp/);
  assert.doesNotMatch(layout, /mobileHeroWallpaper|hero-wallpaper-mobile\.webp/);
  assert.match(hero, /<picture>[\s\S]*data-manga-back[\s\S]*data-manga-front/);
  assert.doesNotMatch(manga, /\.hero-stage|\.manga-scene|\.chapter-/);
  assert.doesNotMatch(manga, /\.manga-scene\s*\{[^}]*opacity:\s*0/);
  assert.doesNotMatch(manga, /\.manga-scene\[data-ready="true"\]\s*\{[^}]*opacity/);
  assert.match(refresh, /\.hero::before\s*\{[^}]*background-image:\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-character\.webp["']?\),\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-manga\.webp["']?\)/);
  assert.match(refresh, /\.hero::before\s*\{[^}]*inset:\s*0 0 16px[^}]*background-size:\s*contain,\s*cover/);
  assert.match(refresh, /\.hero:has\(\.manga-scene\[data-ready="true"\]\)::before\s*\{\s*display:\s*none/);
  assert.match(refresh, /\.manga-scene-camera \.manga-scene-front\s*\{[^}]*object-fit:\s*contain;\s*object-position:\s*center bottom/);

  const mobileRule = refresh.match(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.manga-scene-camera \.manga-scene-front\s*\{([^}]*)\}/);
  assert.ok(mobileRule, "mobile foreground sizing remains explicitly tuned");
  assert.match(mobileRule[1], /object-fit:\s*contain/);
});

test("below-the-fold homepage background is lazy and no longer a stylesheet background request", async () => {
  const home = await read("pages/HomePage.astro");
  const refresh = await read("styles/refresh.css");
  assert.match(home, /<img class="home-content-bg__image"[^>]*src=\{kagariAssets\.pageBackground\}[^>]*loading="lazy"[^>]*decoding="async"[^>]*fetchpriority="low"/);
  assert.doesNotMatch(refresh, /fuyukawa-kagari-bg\.webp/);
  assert.match(refresh, /\.home-content-bg__image\s*\{[^}]*position:\s*absolute[^}]*object-fit:\s*cover/);
});

test("manga CSS stays theme-local, responsive, and never crops article covers", async () => {
  const source = await read("styles/manga.css") + "\n" + await read("styles/manga-pages.css");
  const home = await read("styles/refresh.css");
  const css = postcss.parse(source);
  css.walkRules((rule) => {
    for (const selector of postcss.list.comma(rule.selector)) assert.ok(selector.startsWith("body[data-fuyukawa]"), selector);
  });
  css.walkDecls("font-size", (declaration) => assert.doesNotMatch(declaration.value, /vw|cqw/));
  assert.doesNotMatch(source, /\.post-cover-frame\s+img|\.journal-entry\s*>\s*img/);
  assert.doesNotMatch(source, /\.hero-stage|\.manga-scene|\.chapter-/);
  assert.match(home, /inset: -24px/);
  assert.match(home, /\.manga-scene-camera \.manga-scene-front \{[^}]*object-fit: contain/);
  assert.match(home, /height: calc\(100% - 64px\)/);
  assert.match(source, /body\[data-fuyukawa\] :where\(\.manga-art\)/);
  assert.match(source, /\.album-page-image-next \.manga-art\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/);
  assert.match(source, /@media \(max-width: 1100px\)[\s\S]*?\.album-page-image-next\s*\{\s*height:\s*350px/);
  assert.match(source, /@media \(max-width: 760px\)[\s\S]*?\.album-page-image-next\s*\{\s*height:\s*360px/);
  assert.doesNotMatch(source, /\.album-page\s*>\s*img/);
  assert.match(home, /\.chapter-track\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(home, /@media \(max-width: 860px\)[\s\S]*?\.chapter-track\s*\{[^}]*grid-auto-flow:\s*column/);
  assert.match(source, /max-width: 480px/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(await read("lib/manga-runtime.mjs"), /preventDefault|deviceorientation|setInterval/);
  assert.doesNotMatch(await read("pages/BlogIndexPage.astro"), /compact-post-row|class="post-list"/);
  assert.match(await read("layouts/BaseLayout.astro"), /canonicalPath !== "\/" && <link rel="stylesheet" href=\{mangaPagesHref\}/);
});

test("every new Astro template parses and images have a single typed registry", async () => {
  for (const file of (await fs.readdir(path.join(theme, "components"))).filter((name) => name.endsWith(".astro"))) {
    const result = await parse(await read(`components/${file}`));
    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 1), [], file);
  }
  const registry = await read("data/mangaArt.ts");
  for (const output of manifest.outputs) {
    const name = output.file.replace(".webp", "");
    assert.ok(registry.includes(`"${name}": [${output.width}, ${output.height}]`), name);
  }
});

test("extracted profile reveal still docks, releases scrolling, resets and cleans up", async () => {
  const hero = element(), stage = element(), document = element(), window = element();
  const classes = new Set(), styles = {};
  hero.classList = {
    add: (...values) => values.forEach((value) => classes.add(value)),
    remove: (...values) => values.forEach((value) => classes.delete(value)),
    toggle: (value, force) => force ? classes.add(value) : classes.delete(value)
  };
  hero.style.setProperty = (key, value) => { styles[key] = value; };
  stage.querySelector = () => hero;
  stage.getBoundingClientRect = () => ({ top: 0 });
  document.querySelector = (selector) => selector === "[data-hero-stage]" ? stage : null;
  document.documentElement = { classList: { contains: () => false } };
  const timers = new Map(), frames = new Map();
  let id = 0;
  Object.assign(window, {
    scrollY: 0, innerHeight: 800,
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: (timer) => timers.delete(timer),
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (frame) => frames.delete(frame),
    scrollTo() {}
  });
  window.history = {};
  window.location = { hash: "#keep-position" };
  const cleanup = mountHomeHero({ document, window });
  const wheel = (deltaY) => {
    const event = { deltaY, prevented: false, preventDefault() { this.prevented = true; } };
    window.dispatch("wheel", event);
    return event;
  };
  const flushFrames = () => {
    const scheduled = [...frames.values()];
    frames.clear();
    scheduled.forEach((callback) => callback(16));
  };
  assert.equal(wheel(200).prevented, true);
  assert.ok(classes.has("is-pulling"));
  const settleTimer = [...timers.values()].find((timer) => timer.delay === 260);
  settleTimer.callback();
  flushFrames();
  assert.ok(classes.has("is-docked"));
  assert.equal(styles["--profile-opacity"], "1");
  assert.equal(wheel(60).prevented, true);
  [...timers.values()].find((timer) => timer.delay === 120).callback();
  assert.equal(wheel(60).prevented, false);
  assert.equal(wheel(-60).prevented, true);
  flushFrames();
  assert.equal(styles["--profile-opacity"], "0");
  cleanup();
  assert.equal(timers.size, 0);
  assert.ok([...window.events.values()].every((handlers) => handlers.size === 0));
});

function homeHeroFixture(config = {}) {
  const makeNode = (rect = { top: 0, bottom: 700, left: 0, width: 1200, height: 700 }) => {
    const events = new Map(), classes = new Set(), styles = {};
    return {
      events, styles, dataset: {}, textContent: "", isConnected: true,
      style: { setProperty: (key, value) => { styles[key] = value; } },
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
        contains: (name) => classes.has(name)
      },
      addEventListener(name, handler) {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name).add(handler);
      },
      removeEventListener(name, handler) { events.get(name)?.delete(handler); },
      dispatch(name, event = {}) { for (const handler of events.get(name) ?? []) handler(event); },
      getBoundingClientRect: () => rect,
      querySelector() {}
    };
  };
  const hero = makeNode(), stage = makeNode(), terminal = makeNode(), name = makeNode();
  const avatar = makeNode({ top: 0, bottom: 100, left: 10, width: 100, height: 100 });
  const bubble = makeNode(), document = makeNode(), window = makeNode();
  stage.querySelector = () => hero;
  name.dataset.nameLines = JSON.stringify(["Feliz"]);
  document.visibilityState = config.hidden ? "hidden" : "visible";
  document.documentElement = { dataset: {} };
  document.querySelector = (selector) => ({
    "[data-hero-stage]": stage,
    "[data-terminal-typing]": terminal,
    "[data-name-typing]": name,
    "[data-poke-avatar]": avatar,
    "[data-poke-bubble]": bubble
  })[selector] ?? null;

  const timers = new Map(), frames = new Map();
  let nextId = 0, observer, time = 20000;
  Object.assign(window, {
    innerHeight: 800, scrollY: 0, history: { scrollRestoration: "auto" }, location: { hash: config.hash ?? "#keep-position" },
    setTimeout(callback, delay) { assert.equal(this, window); timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout(id) { assert.equal(this, window); timers.delete(id); },
    requestAnimationFrame(callback) { assert.equal(this, window); frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { assert.equal(this, window); frames.delete(id); },
    scrollTo(options) { assert.equal(this, window); window.lastScroll = options; },
    IntersectionObserver: class {
      constructor(callback) { observer = { callback, disconnected: false, disconnect() { this.disconnected = true; } }; }
      observe() {}
      disconnect() { observer.disconnected = true; }
    }
  });
  if (config.noObserver) delete window.IntersectionObserver;
  const mount = () => mountHomeHero({ document, window, now: () => time });
  const cleanup = mount();
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(16)); };
  return { hero, stage, terminal, name, avatar, bubble, document, window, timers, frames, observer,
    cleanup, mount, flushFrames, setTime: value => { time = value; } };
}

test("home typing pauses offscreen and hidden, while scroll and pointer work batch per frame", async () => {
  const { hero, terminal, name, avatar, document, window, timers, frames, observer, cleanup } = homeHeroFixture();
  assert.equal(timers.size, 2, "both hero typewriters start while the hero is visible");
  observer.callback([{ target: hero, isIntersecting: false }]);
  assert.equal(timers.size, 0, "offscreen hero clears its typing timers");
  observer.callback([{ target: hero, isIntersecting: true }]);
  assert.equal(timers.size, 2, "typing resumes when the hero returns");
  const initialTicks = [...timers.entries()].filter(([, timer]) => timer.delay === 0);
  initialTicks.forEach(([id, timer]) => { timers.delete(id); timer.callback(); });
  const secondTicks = [...timers.entries()];
  secondTicks.forEach(([id, timer]) => { timers.delete(id); timer.callback(); });
  const textBeforeHide = [terminal.textContent, name.textContent];
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  assert.equal(timers.size, 0, "background tabs clear their typing timers");
  document.visibilityState = "visible";
  document.dispatch("visibilitychange");
  assert.equal(timers.size, 2, "typing resumes when the tab becomes visible");
  assert.deepEqual([terminal.textContent, name.textContent], textBeforeHide, "resuming does not advance either typewriter immediately");
  const resumedDelays = [...timers.values()].map((timer) => timer.delay).sort((a, b) => a - b);
  assert.deepEqual(resumedDelays, [58, 96], "resuming restores the pending typing cadence");
  const nextTerminalTick = [...timers.entries()].find(([, timer]) => timer.delay === 58);
  timers.delete(nextTerminalTick[0]);
  nextTerminalTick[1].callback();
  assert.equal(terminal.textContent, "pi", "typing continues after the normal write delay");

  const initialFrames = [...frames.values()];
  frames.clear();
  initialFrames.forEach((callback) => callback(16));
  window.dispatch("scroll");
  window.dispatch("scroll");
  avatar.dispatch("pointermove", { clientX: 20 });
  avatar.dispatch("pointermove", { clientX: 90 });
  assert.equal(frames.size, 2, "a scroll burst and pointer burst each schedule one frame");
  const scheduled = [...frames.values()];
  frames.clear();
  scheduled.forEach((callback) => callback(16));
  assert.match(avatar.styles["--flower-sway"], /^5\.4/ , "pointer frame uses the latest coalesced position");

  avatar.dispatch("pointermove", { clientX: 10 });
  assert.equal(frames.size, 1);
  avatar.dispatch("pointerleave");
  assert.equal(frames.size, 0, "pointerleave cancels a pending stale sway update");
  assert.equal(avatar.styles["--flower-sway"], "0deg");

  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  assert.ok(observer.disconnected);
  assert.ok([...window.events.values()].every((handlers) => handlers.size === 0));
  assert.ok([...document.events.values()].every((handlers) => handlers.size === 0));
});

test("home hero retains replacement mounts, idempotent cleanup and one listener set", () => {
  const f = homeHeroFixture(), oldObserver = f.observer;
  const next = f.mount();
  assert.notEqual(next, f.cleanup, "existing repeat-mount mechanism replaces rather than reuses cleanup");
  assert.equal(f.window.__yuimiHeroCleanup, next); assert.ok(oldObserver.disconnected);
  assert.equal(f.timers.size, 2);
  for (const type of ["wheel", "scroll", "resize", "pageshow"]) assert.equal(f.window.events.get(type).size, 1);
  assert.equal(f.document.events.get("visibilitychange").size, 1);
  for (const type of ["pointermove", "pointerleave", "dblclick"]) assert.equal(f.avatar.events.get(type).size, 1);
  f.cleanup(); f.cleanup(); assert.equal(f.timers.size, 2, "old cleanup cannot destroy the replacement mount");
  next(); next(); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  assert.ok([...f.window.events.values(), ...f.document.events.values(), ...f.avatar.events.values()].every(s => s.size === 0));
});

test("home hero cleanup removes queued work and listeners without consuming other module resources", () => {
  const f = homeHeroFixture(); f.flushFrames();
  f.window.dispatch("wheel", { deltaY: 200, preventDefault() {} });
  f.avatar.dispatch("pointermove", { clientX: 90 }); f.avatar.dispatch("dblclick", { preventDefault() {} });
  const ownedTimerIds = [...f.timers.keys()], ownedFrameIds = [...f.frames.keys()];
  let externalTicks = 0; const external = () => { externalTicks++; };
  const timer = f.window.setTimeout(external, 99), frame = f.window.requestAnimationFrame(external);
  f.window.addEventListener("scroll", external); f.document.addEventListener("visibilitychange", external);
  f.cleanup(); f.cleanup();
  assert.ok(ownedTimerIds.every(id => !f.timers.has(id))); assert.ok(ownedFrameIds.every(id => !f.frames.has(id)));
  assert.deepEqual([...f.timers.keys()], [timer]); assert.deepEqual([...f.frames.keys()], [frame]);
  assert.ok(f.window.events.get("scroll").has(external)); assert.ok(f.document.events.get("visibilitychange").has(external));
  const before = JSON.stringify([f.hero.styles, f.avatar.styles, f.terminal.textContent, f.name.textContent, f.bubble.textContent]);
  f.window.dispatch("wheel", { deltaY: 200, preventDefault() { assert.fail("disposed listener ran"); } });
  f.window.dispatch("scroll"); f.document.dispatch("visibilitychange"); f.avatar.dispatch("pointermove", { clientX: 10 });
  f.timers.get(timer).callback(); f.flushFrames();
  assert.equal(externalTicks, 4);
  assert.equal(JSON.stringify([f.hero.styles, f.avatar.styles, f.terminal.textContent, f.name.textContent, f.bubble.textContent]), before);
});

test("home hero dependency injection preserves browser receivers, initial scroll and hash restoration", () => {
  const f = homeHeroFixture({ hash: "" });
  assert.equal(f.window.history.scrollRestoration, "manual"); assert.equal(f.window.lastScroll, undefined);
  f.flushFrames(); assert.deepEqual(f.window.lastScroll, { top: 0, left: 0 }); f.cleanup();
  const anchored = homeHeroFixture(); anchored.flushFrames(); assert.equal(anchored.window.lastScroll, undefined); anchored.cleanup();
});

test("home hero retains exact 0.56 docking threshold and 260/120ms settling/release", () => {
  for (const [deltaY, docked] of [[145, false], [146, true]]) {
    const f = homeHeroFixture(); f.flushFrames();
    f.window.dispatch("wheel", { deltaY, preventDefault() {} });
    const timer = [...f.timers.entries()].find(([, t]) => t.delay === 260); assert.ok(timer);
    f.timers.delete(timer[0]); timer[1].callback(); f.flushFrames();
    assert.equal(f.hero.classList.contains("is-docked"), docked);
    assert.equal(f.hero.styles["--profile-opacity"], docked ? "1" : "0");
    assert.equal([...f.timers.values()].some(t => t.delay === 120), docked); f.cleanup();
  }
});

test("home hero clock injection retains avatar cooldown, poke duration and bubble messages", () => {
  const f = homeHeroFixture();
  f.avatar.dispatch("dblclick", { preventDefault() {} });
  assert.ok(f.avatar.classList.contains("is-poked")); assert.equal(f.bubble.textContent, "戳到了~");
  assert.ok([...f.timers.values()].some(t => t.delay === 720)); assert.ok([...f.timers.values()].some(t => t.delay === 1700));
  f.setTime(29999); f.avatar.dispatch("dblclick", { preventDefault() {} });
  assert.equal(f.bubble.textContent, "操作太快啦，休息一下吧");
  f.setTime(30000); f.avatar.dispatch("dblclick", { preventDefault() {} }); assert.equal(f.bubble.textContent, "戳到了~");
  f.cleanup(); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
});

test("home hero scroll fallback and hidden cold mount retain typing pause and resume", () => {
  const f = homeHeroFixture({ noObserver: true, hidden: true });
  assert.equal(f.timers.size, 0); f.document.visibilityState = "visible"; f.document.dispatch("visibilitychange");
  assert.equal(f.timers.size, 2);
  f.hero.getBoundingClientRect = () => ({ top: 900, bottom: 1600 }); f.window.dispatch("scroll"); f.flushFrames();
  assert.equal(f.timers.size, 0);
  f.hero.getBoundingClientRect = () => ({ top: 0, bottom: 700 }); f.window.dispatch("scroll"); f.flushFrames();
  assert.equal(f.timers.size, 2); f.cleanup();
});

test("home hero typing retains complete line order and write, hold, erase and gap cadence", () => {
  const f = homeHeroFixture();
  const fire = delay => { const timer = [...f.timers.entries()].find(([, t]) => t.delay === delay); assert.ok(timer, `expected ${delay}ms`); f.timers.delete(timer[0]); timer[1].callback(); };
  const lines = ['pin --dev-notes --anime-diary', 'collect "blue moments" && write', 'npm run scrapbook', 'echo "做自己想做，想自己所想"'];
  fire(0);
  for (let index = 0; index < lines.length; index++) {
    for (let count = 0; count < lines[index].length; count++) fire(58);
    assert.equal(f.terminal.textContent, lines[index]); fire(1250);
    for (let count = 0; count < lines[index].length; count++) fire(32);
    assert.equal(f.terminal.textContent, ''); fire(360);
  }
  fire(58); assert.equal(f.terminal.textContent, 'p', 'line sequence wraps without changing the gap');
  fire(0); for (let count = 0; count < 5; count++) fire(96);
  assert.equal(f.name.textContent, 'Feliz'); fire(1500);
  for (let count = 0; count < 5; count++) fire(46);
  assert.equal(f.name.textContent, ''); f.cleanup();
});

test("home hero injected windows own independent mount state without modifying globalThis", () => {
  const a = homeHeroFixture(), b = homeHeroFixture(), before = b.window.__yuimiHeroCleanup;
  a.mount()(); assert.equal(b.window.__yuimiHeroCleanup, before); assert.equal(b.timers.size, 2);
  b.cleanup(); a.cleanup();
});

// Deliberate saved-callback replay tests the stronger instance contract, not browser cancellation.
function heroLifetimeFixture() {
  const f = homeHeroFixture({ hash: "" });
  const calls = { dom: 0, timeout: 0, clearTimeout: 0, raf: 0, cancelRAF: 0, scroll: 0, navigation: 0, preventDefault: 0, observer: 0, observe: 0, disconnect: 0 };
  const saved = { timeout: [...f.timers.values()].map(t => () => t.callback()), RAF: [...f.frames.values()].map(fn => () => fn(16)), event: [], IO: [] };
  const watched = [];
  const watch = nodes => nodes.forEach(node => {
    watched.push(node); let text = node.textContent;
    Object.defineProperty(node, "textContent", { get: () => text, set(value) { calls.dom++; text = value; } });
    const set = node.style.setProperty;
    node.style.setProperty = function(...args) { calls.dom++; return set.apply(this, args); };
    for (const key of ["add", "remove", "toggle"]) {
      const method = node.classList[key];
      node.classList[key] = function(...args) { calls.dom++; return method.apply(this, args); };
    }
  });
  watch([f.hero, f.terminal, f.name, f.avatar, f.bubble]);
  for (const [method, key] of [["setTimeout", "timeout"], ["clearTimeout", "clearTimeout"], ["requestAnimationFrame", "raf"], ["cancelAnimationFrame", "cancelRAF"], ["scrollTo", "scroll"]]) {
    const original = f.window[method];
    f.window[method] = function(...args) {
      calls[key]++;
      if (method === "setTimeout") saved.timeout.push(() => args[0]());
      if (method === "requestAnimationFrame") saved.RAF.push(() => args[0](16));
      return original.apply(this, args);
    };
  }
  for (const method of ["assign", "replace"]) f.window.location[method] = () => { calls.navigation++; };
  const Observer = f.window.IntersectionObserver;
  f.window.IntersectionObserver = class extends Observer {
    constructor(...args) { super(...args); calls.observer++; }
    observe(...args) { calls.observe++; return super.observe(...args); }
    disconnect(...args) { calls.disconnect++; return super.disconnect(...args); }
  };
  const event = deltaY => ({ deltaY, clientX: 90, preventDefault() { calls.preventDefault++; } });
  for (const target of [f.window, f.document, f.avatar]) {
    for (const [type, handlers] of target.events) for (const handler of handlers) {
      saved.event.push(() => handler(event(200)));
      if (type === "wheel") saved.event.push(() => handler(event(-60)));
    }
  }
  for (const isIntersecting of [false, true]) saved.IO.push(() => f.observer.callback([{ target: f.hero, isIntersecting }]));
  f.window.dispatch("wheel", event(200));
  const settle = [...f.timers.entries()].find(([, t]) => t.delay === 260);
  f.timers.delete(settle[0]); settle[1].callback();
  f.avatar.dispatch("pointermove", event(0)); f.avatar.dispatch("dblclick", event(0));
  const snapshot = () => ({
    calls: { ...calls }, timers: [...f.timers.keys()], frames: [...f.frames.keys()], cleanup: f.window.__yuimiHeroCleanup,
    dom: watched.map(n => ({ text: n.textContent, styles: { ...n.styles }, classes: ["is-docked", "is-pulling", "is-poked", "is-visible"].map(c => n.classList.contains(c)) })),
    listeners: [f.window, f.document, f.avatar].map(n => [...n.events].map(([type, handlers]) => [type, handlers.size]))
  });
  const capture = () => Object.fromEntries(Object.entries(saved).map(([key, callbacks]) => [key, callbacks.slice()]));
  const replay = (callbacks, type) => (type ? callbacks[type] : Object.values(callbacks).flat()).forEach(fn => fn());
  const replaceRoots = () => {
    const fresh = homeHeroFixture(); fresh.cleanup(); watch([fresh.hero, fresh.terminal, fresh.name, fresh.avatar, fresh.bubble]);
    f.document.querySelector = selector => ({ "[data-hero-stage]": fresh.stage, "[data-terminal-typing]": fresh.terminal,
      "[data-name-typing]": fresh.name, "[data-poke-avatar]": fresh.avatar, "[data-poke-bubble]": fresh.bubble })[selector] ?? null;
    return fresh;
  };
  return { ...f, calls, snapshot, capture, replay, replaceRoots };
}

for (const type of ["timeout", "RAF", "event", "IO"]) {
  test(`home hero disposed ${type} replay has zero DOM, resource and interaction effects`, () => {
    const f = heroLifetimeFixture(), callbacks = f.capture();
    assert.ok(callbacks[type].length > 0); f.cleanup(); f.cleanup(); const before = f.snapshot();
    f.replay(callbacks, type); assert.deepEqual(f.snapshot(), before); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  });
}

test("home hero cleanup is idempotent before replay and keeps external resources owned elsewhere", () => {
  const f = heroLifetimeFixture(), callbacks = f.capture(), external = () => {};
  const timer = f.window.setTimeout(external, 99), frame = f.window.requestAnimationFrame(external);
  f.window.addEventListener("scroll", external); f.document.addEventListener("visibilitychange", external);
  f.cleanup(); const once = f.snapshot(); f.cleanup(); assert.deepEqual(f.snapshot(), once);
  f.replay(callbacks); assert.deepEqual(f.snapshot(), once);
  assert.deepEqual([...f.timers.keys()], [timer]); assert.deepEqual([...f.frames.keys()], [frame]);
  assert.ok(f.window.events.get("scroll").has(external)); assert.ok(f.document.events.get("visibilitychange").has(external));
});

for (const clearFirst of [true, false]) {
  test(`home hero stale A callbacks and cleanup preserve live B (${clearFirst ? 'explicit cleanup' : 'replacement mount'})`, () => {
    const f = heroLifetimeFixture(), callbacks = f.capture(), oldCleanup = f.cleanup;
    if (clearFirst) oldCleanup();
    const fresh = f.replaceRoots(), cleanupB = f.mount();
    assert.notEqual(cleanupB, oldCleanup); assert.equal(f.window.__yuimiHeroCleanup, cleanupB);
    const before = f.snapshot(); oldCleanup(); oldCleanup(); f.replay(callbacks); assert.deepEqual(f.snapshot(), before);
    const zero = [...f.timers.entries()].filter(([, t]) => t.delay === 0);
    assert.equal(zero.length, 2); zero.forEach(([id, t]) => { f.timers.delete(id); t.callback(); });
    const tick = [...f.timers.entries()].find(([, t]) => t.delay === 58);
    assert.ok(tick); f.timers.delete(tick[0]); tick[1].callback(); assert.equal(fresh.terminal.textContent, 'p');
    const bTime = f.snapshot(); f.replay(callbacks); oldCleanup(); assert.deepEqual(f.snapshot(), bTime);
    cleanupB(); cleanupB(); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  });
}

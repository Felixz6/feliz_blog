import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import sharp from "sharp";
import postcss from "postcss";
import { parse } from "@astrojs/compiler";
import { springStep, layerOffsets, nearestRailIndex, mountMangaScene, mountAlbum, mountArchive, mountChapterRail } from "../lib/manga-runtime.mjs";

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
  assert.equal(manifest.sourceFiles.length, 55);
  assert.ok(manifest.outputs.every((output) => output.sources.every((source) => !source.endsWith(".mp4"))));
});

const availableSourceFiles = await Promise.all(manifest.sourceFiles.map(async (source) => {
  try {
    await fs.access(path.join(root, source.file));
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}));
const sourceArtworkSkipReason = availableSourceFiles.every((available) => !available)
  ? "Original source artwork is not included in this checkout; generated derivatives are verified separately"
  : false;

test("all 55 source artworks remain byte-identical", { skip: sourceArtworkSkipReason }, async () => {
  for (const source of manifest.sourceFiles) {
    const bytes = await fs.readFile(path.join(root, source.file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), source.sha256, source.file);
  }
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

test("home chapter rail omits Games and numbers About as the third chapter", async () => {
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

test("home fallback and split foreground keep the original contained character size", async () => {
  const manga = await read("styles/manga.css");
  const refresh = await read("styles/refresh.css");
  assert.match(refresh, /background:\s*url\(["']?[^)]*hero-wallpaper\.webp["']?\)\s*center\s*\/\s*cover\s+no-repeat/);
  assert.match(manga, /\.hero::before\s*\{[^}]*background-image:\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-character\.webp["']?\),\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-manga\.webp["']?\)/);
  assert.match(manga, /\.hero::before\s*\{[^}]*inset:\s*0 0 16px[^}]*background-size:\s*contain,\s*cover/);
  assert.match(manga, /\.hero:has\(\.manga-scene\[data-ready="true"\]\)::before\s*\{\s*display:\s*none/);
  assert.match(manga, /\.manga-scene-camera \.manga-scene-front\s*\{[^}]*object-fit:\s*contain;\s*object-position:\s*center bottom/);

  const mobileRule = manga.match(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.manga-scene-camera \.manga-scene-front\s*\{([^}]*)\}/);
  assert.ok(mobileRule, "mobile foreground sizing remains explicitly tuned");
  assert.match(mobileRule[1], /object-fit:\s*contain/);
});

test("manga CSS stays theme-local, responsive, and never crops article covers", async () => {
  const source = await read("styles/manga.css") + "\n" + await read("styles/manga-pages.css");
  const css = postcss.parse(source);
  css.walkRules((rule) => {
    for (const selector of postcss.list.comma(rule.selector)) assert.ok(selector.startsWith("body[data-fuyukawa]"), selector);
  });
  css.walkDecls("font-size", (declaration) => assert.doesNotMatch(declaration.value, /vw|cqw/));
  assert.doesNotMatch(source, /\.post-cover-frame\s+img|\.journal-entry\s*>\s*img/);
  assert.match(source, /inset: -24px/);
  assert.match(source, /\.manga-scene-camera \.manga-scene-front \{[^}]*object-fit: contain/);
  assert.match(source, /height: calc\(100% - 64px\)/);
  assert.match(source, /body\[data-fuyukawa\] :where\(\.manga-art\)/);
  assert.match(source, /\.album-page-image-next \.manga-art\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/);
  assert.match(source, /@media \(max-width: 1100px\)[\s\S]*?\.album-page-image-next\s*\{\s*height:\s*350px/);
  assert.match(source, /@media \(max-width: 760px\)[\s\S]*?\.album-page-image-next\s*\{\s*height:\s*360px/);
  assert.doesNotMatch(source, /\.album-page\s*>\s*img/);
  assert.match(source, /\.chapter-track\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(source, /@media \(max-width: 860px\)[\s\S]*?\.chapter-track\s*\{[^}]*grid-auto-flow:\s*column/);
  assert.match(source, /max-width: 480px/);
  assert.match(source, /prefers-reduced-motion: reduce/);
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
    scrollTo() {}
  });
  const context = vm.createContext({
    window, document, history: {}, location: { hash: "#keep-position" },
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (frame) => frames.delete(frame)
  });
  vm.runInContext((await read("lib/home-hero.mjs")).replace("export function", "function") + "\nvar cleanup = mountHomeHero();", context);
  const wheel = (deltaY) => {
    const event = { deltaY, prevented: false, preventDefault() { this.prevented = true; } };
    window.dispatch("wheel", event);
    return event;
  };
  assert.equal(wheel(200).prevented, true);
  assert.ok(classes.has("is-pulling"));
  const settleTimer = [...timers.values()].find((timer) => timer.delay === 260);
  settleTimer.callback();
  assert.ok(classes.has("is-docked"));
  assert.equal(styles["--profile-opacity"], "1");
  assert.equal(wheel(60).prevented, true);
  [...timers.values()].find((timer) => timer.delay === 120).callback();
  assert.equal(wheel(60).prevented, false);
  assert.equal(wheel(-60).prevented, true);
  assert.equal(styles["--profile-opacity"], "0");
  context.cleanup();
  assert.equal(timers.size, 0);
  assert.ok([...window.events.values()].every((handlers) => handlers.size === 0));
});

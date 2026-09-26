import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const theme = new URL("src/themes/fuyukawa-kagari/", root);
const sourceFiles = [
  "layouts/BaseLayout.astro",
  "components/MangaRuntime.astro",
  "pages/HomePage.astro",
  "pages/BlogIndexPage.astro",
  "pages/AboutPage.astro"
].map((file) => new URL(file, theme));
const builtHome = new URL("index.html", dist);
const builtOutputIsCurrent = existsSync(builtHome)
  && sourceFiles.every((file) => statSync(builtHome).mtimeMs >= statSync(file).mtimeMs);

const markers = ["data-manga-scene", "data-manga-rail", "data-manga-album", "data-manga-archive"];
const moduleUrls = (html: string) => [...html.matchAll(/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+)")[^>]*>/g)]
  .map((match) => match[1]);

test("built pages request MangaRuntime exactly where its interaction roots exist", {
  skip: builtOutputIsCurrent ? false : "run npm run build before checking generated page scripts"
}, () => {
  const pages = [
    ["index.html", ["data-manga-scene", "data-manga-rail"]],
    ["blog/index.html", ["data-manga-archive"]],
    ["about/index.html", ["data-manga-album"]],
    ["themes/fuyukawa-kagari/index.html", ["data-manga-scene", "data-manga-rail"]],
    ["themes/fuyukawa-kagari/blog/index.html", ["data-manga-archive"]],
    ["themes/fuyukawa-kagari/about/index.html", ["data-manga-album"]],
    ["projects/index.html", []],
    ["blog/anime-tech-notes/index.html", []],
    ["projects/ctf-notes/index.html", []],
    ["projects/ctf-notes/ssrf/index.html", []]
  ] as const;

  for (const [path, expectedMarkers] of pages) {
    const html = readFileSync(new URL(path, dist), "utf8");
    const present = markers.filter((marker) => html.includes(marker));
    assert.deepEqual(present, [...expectedMarkers], path);
    const scripts = moduleUrls(html);
    const mangaScripts = scripts.filter((url) => /\/MangaRuntime\.[^/]+\.js$/.test(url));
    assert.equal(mangaScripts.length, expectedMarkers.length ? 1 : 0, path);
    assert.equal(scripts.filter((url) => /\/ClientRouter\.[^/]+\.js$/.test(url)).length, 1, path);
    for (const url of mangaScripts) assert.ok(existsSync(new URL(url.slice(1), dist)), url);
  }

  const htmlFiles = (directory: URL): URL[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return htmlFiles(new URL(`${entry.name}/`, directory));
    return entry.name.endsWith(".html") ? [new URL(entry.name, directory)] : [];
  });
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, "utf8");
    const rootCount = markers.filter((marker) => html.includes(marker)).length;
    const runtimeCount = moduleUrls(html).filter((url) => /\/MangaRuntime\.[^/]+\.js$/.test(url)).length;
    assert.equal(runtimeCount, rootCount ? 1 : 0, file.pathname);
  }
});

test("MangaRuntime mounts after page-load and disposes across repeated soft navigations", () => {
  const component = readFileSync(new URL("components/MangaRuntime.astro", theme), "utf8");
  const script = component.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const runnable = script
    .replace(/^\s*import .*?;\s*/m, "")
    .replace("let cleanup: (() => void)[] = [];", "let cleanup = [];")
    .replace(" as const", "")
    .replace("querySelectorAll<HTMLElement>", "querySelectorAll");

  const listeners = new Map<string, Set<() => void>>();
  const events: string[] = [];
  let currentRoots: Record<string, string[]> = {};
  const document = {
    body: { hasAttribute: () => true },
    addEventListener(name: string, listener: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    querySelectorAll(selector: string) { return currentRoots[selector] ?? []; }
  };
  const mount = (feature: string) => (root: string) => {
    events.push(`mount:${feature}:${root}`);
    return () => events.push(`dispose:${feature}:${root}`);
  };
  vm.runInNewContext(runnable, {
    document,
    window: { __yuimiHomeRainCleanup() { events.push("home-rain-cleanup"); } },
    mountMangaScene: mount("scene"),
    mountChapterRail: mount("rail"),
    mountAlbum: mount("album"),
    mountArchive: mount("archive")
  });
  const fire = (name: string) => { for (const listener of listeners.get(name) ?? []) listener(); };
  assert.equal(listeners.get("astro:page-load")?.size, 1);
  assert.equal(listeners.get("astro:before-swap")?.size, 1);

  // ARTICLE -> BLOG -> ARTICLE -> HOME -> ARTICLE -> HOME.
  fire("astro:page-load");
  currentRoots = { "[data-manga-archive]": ["blog"] };
  fire("astro:before-swap"); fire("astro:page-load");
  assert.equal(events.filter((event) => event === "mount:archive:blog").length, 1);
  currentRoots = {};
  fire("astro:before-swap"); fire("astro:page-load");
  assert.equal(events.filter((event) => event === "dispose:archive:blog").length, 1);
  currentRoots = { "[data-manga-scene]": ["home-scene"], "[data-manga-rail]": ["home-rail"] };
  fire("astro:before-swap"); fire("astro:page-load");
  currentRoots = {};
  fire("astro:before-swap"); fire("astro:page-load");
  currentRoots = { "[data-manga-scene]": ["home-scene"], "[data-manga-rail]": ["home-rail"] };
  fire("astro:before-swap"); fire("astro:page-load");
  assert.equal(events.filter((event) => event === "mount:scene:home-scene").length, 2);
  assert.equal(events.filter((event) => event === "dispose:scene:home-scene").length, 1);
  assert.equal(events.filter((event) => event === "mount:rail:home-rail").length, 2);
  assert.equal(events.filter((event) => event === "dispose:rail:home-rail").length, 1);
  assert.equal(listeners.get("astro:page-load")?.size, 1);
});

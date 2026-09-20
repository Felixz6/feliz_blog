import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_THEME_ID,
  getCanonicalPath,
  getThemePath,
  isThemeId,
  selectableThemes,
  themes
} from "../src/core/themes/registry.ts";

test("theme registry uses Fuyukawa Kagari as the default", () => {
  assert.equal(DEFAULT_THEME_ID, "fuyukawa-kagari");
  assert.equal(isThemeId("fuyukawa-kagari"), true);
  assert.equal(isThemeId("removed-theme"), false);
  assert.deepEqual(themes.map((theme) => theme.id), ["fuyukawa-kagari"]);
  assert.deepEqual(selectableThemes.map((theme) => theme.id), ["fuyukawa-kagari"]);
});

test("only Fuyukawa remains registered and selectable", () => {
  const fuyukawa = readFileSync(new URL("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro", import.meta.url), "utf8");
  const preferenceGate = readFileSync(new URL("../src/core/themes/ThemePreferenceGate.astro", import.meta.url), "utf8");

  assert.match(fuyukawa, /data-theme-select="fuyukawa-kagari"/);
  assert.deepEqual([...fuyukawa.matchAll(/data-theme-select="([^"]+)"/g)].map(([, id]) => id), ["fuyukawa-kagari"]);
  assert.match(preferenceGate, /selectableThemeIds: selectableThemes\.map/);
  assert.deepEqual(themes.map((theme) => theme.routePrefix), ["/themes/fuyukawa-kagari"]);
});

test("canonical paths strip the only registered theme prefix", () => {
  assert.equal(getCanonicalPath("/themes/fuyukawa-kagari/"), "/");
  assert.equal(
    getCanonicalPath("/themes/fuyukawa-kagari/blog/hello-asteria/"),
    "/blog/hello-asteria/"
  );
  assert.equal(getCanonicalPath("/themes/unknown/blog/hello-asteria/"), "/themes/unknown/blog/hello-asteria/");
  assert.equal(getCanonicalPath("/blog/hello-asteria/"), "/blog/hello-asteria/");
});

test("theme paths preserve the current page context", () => {
  const article = "/blog/hello-asteria/";
  assert.equal(getThemePath("fuyukawa-kagari", article), article);
  assert.equal(
    getThemePath("fuyukawa-kagari", "/themes/fuyukawa-kagari/blog/hello-asteria/"),
    article
  );
});

test("primary root routes render through Fuyukawa Kagari", () => {
  const routes = [
    "src/pages/index.astro",
    "src/pages/blog/index.astro",
    "src/pages/blog/[...slug].astro",
    "src/pages/about.astro",
    "src/pages/projects.astro",
    "src/pages/404.astro"
  ];

  for (const path of routes) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /@\/themes\/fuyukawa-kagari/, path);
  }
});

test("the root games route remains removed while the primary theme page stays available", () => {
  assert.equal(existsSync(new URL("../src/pages/games.astro", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/pages/themes/fuyukawa-kagari/games.astro", import.meta.url)), true);
});

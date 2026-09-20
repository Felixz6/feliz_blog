import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_THEME_ID,
  getCanonicalPath,
  getThemePath,
  isThemeId,
  selectableThemes
} from "../src/core/themes/registry.ts";

test("theme registry uses Fuyukawa Kagari as the default", () => {
  assert.equal(DEFAULT_THEME_ID, "fuyukawa-kagari");
  assert.equal(isThemeId("fuyukawa-kagari"), true);
  assert.equal(isThemeId("blank"), true);
  assert.equal(isThemeId("kisara"), true);
  assert.equal(isThemeId("removed-theme"), false);
  assert.deepEqual(selectableThemes.map((theme) => theme.id), ["fuyukawa-kagari"]);
});

test("theme selectors offer only Fuyukawa while alternate route registrations remain intact", () => {
  const fuyukawa = readFileSync(new URL("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro", import.meta.url), "utf8");
  const kisara = readFileSync(new URL("../src/themes/kisara/layouts/KisaraLayout.astro", import.meta.url), "utf8");
  const blank = readFileSync(new URL("../src/themes/blank/layouts/BlankLayout.astro", import.meta.url), "utf8");
  const preferenceGate = readFileSync(new URL("../src/core/themes/ThemePreferenceGate.astro", import.meta.url), "utf8");

  assert.match(fuyukawa, /data-theme-select="fuyukawa-kagari"/);
  assert.doesNotMatch(fuyukawa, /data-theme-select="(?:blank|kisara)"/);
  assert.match(kisara, /selectableThemes\.map/);
  assert.match(blank, /selectableThemes\.map/);
  assert.match(preferenceGate, /selectableThemeIds: selectableThemes\.map/);
  assert.equal(isThemeId("blank"), true);
  assert.equal(isThemeId("kisara"), true);
});

test("canonical paths strip alternate theme prefixes", () => {
  assert.equal(getCanonicalPath("/themes/blank/"), "/");
  assert.equal(getCanonicalPath("/themes/blank/blog/hello-asteria/"), "/blog/hello-asteria/");
  assert.equal(getCanonicalPath("/themes/fuyukawa-kagari/"), "/");
  assert.equal(
    getCanonicalPath("/themes/fuyukawa-kagari/blog/hello-asteria/"),
    "/blog/hello-asteria/"
  );
  assert.equal(getCanonicalPath("/themes/kisara/"), "/");
  assert.equal(getCanonicalPath("/themes/kisara/blog/hello-asteria/"), "/blog/hello-asteria/");
  assert.equal(getCanonicalPath("/blog/hello-asteria/"), "/blog/hello-asteria/");
});

test("theme paths preserve the current page context", () => {
  const article = "/blog/hello-asteria/";
  assert.equal(getThemePath("blank", article), "/themes/blank/blog/hello-asteria/");
  assert.equal(getThemePath("fuyukawa-kagari", article), article);
  assert.equal(
    getThemePath("fuyukawa-kagari", "/themes/blank/blog/hello-asteria/"),
    article
  );
  assert.equal(getThemePath("kisara", article), "/themes/kisara/blog/hello-asteria/");
  assert.equal(
    getThemePath("blank", "/themes/kisara/blog/hello-asteria/"),
    "/themes/blank/blog/hello-asteria/"
  );
});

test("primary root routes render through Fuyukawa Kagari", () => {
  const routes = [
    "src/pages/index.astro",
    "src/pages/blog/index.astro",
    "src/pages/blog/[...slug].astro",
    "src/pages/about.astro",
    "src/pages/projects.astro",
    "src/pages/games.astro",
    "src/pages/404.astro"
  ];

  for (const path of routes) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /@\/themes\/fuyukawa-kagari/, path);
    assert.doesNotMatch(source, /@\/themes\/kisara/, path);
  }
});

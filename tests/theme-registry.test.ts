import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_THEME_ID,
  getCanonicalPath,
  getThemePath,
  isThemeId
} from "../src/core/themes/registry.ts";

test("theme registry uses Fuyukawa Kagari as the default", () => {
  assert.equal(DEFAULT_THEME_ID, "fuyukawa-kagari");
  assert.equal(isThemeId("fuyukawa-kagari"), true);
  assert.equal(isThemeId("blank"), true);
  assert.equal(isThemeId("kisara"), true);
  assert.equal(isThemeId("removed-theme"), false);
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

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { getCanonicalPath } from "../src/core/themes/registry.ts";

const themePrefix = "/themes/fuyukawa-kagari";

test("the fixed theme id is emitted directly and preference selection is gone", () => {
  const baseLayout = readFileSync(new URL("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../src/core/themes/registry.ts", import.meta.url), "utf8");
  const preferenceGate = new URL("../src/core/themes/ThemePreferenceGate.astro", import.meta.url);

  assert.match(baseLayout, /<html lang="zh-CN" data-theme="fuyukawa-kagari"/);
  assert.doesNotMatch(baseLayout, /ThemePreferenceGate|honorThemePreference|__yuimiTheme\s*=/);
  assert.equal(existsSync(preferenceGate), false);
  assert.match(registry, /export function getCanonicalPath\(/);
  assert.doesNotMatch(registry, /selectableThemes|THEME_STORAGE_KEY|getThemePath|isThemeId/);
});

test("canonical paths strip legacy prefixes for routes with root equivalents", () => {
  assert.equal(getCanonicalPath(`${themePrefix}/`), "/");
  assert.equal(
    getCanonicalPath(`${themePrefix}/blog/hello-asteria/`),
    "/blog/hello-asteria/"
  );
});

test("canonical paths normalize plain and unknown paths without changing them", () => {
  assert.equal(getCanonicalPath("blog/hello-asteria/"), "/blog/hello-asteria/");
  assert.equal(getCanonicalPath("/themes/unknown/blog/hello-asteria/"), "/themes/unknown/blog/hello-asteria/");
  assert.equal(getCanonicalPath("/blog/hello-asteria/"), "/blog/hello-asteria/");
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

test("removed arcade routes and implementation files stay absent", () => {
  for (const path of [
    "src/pages/games.astro",
    "src/pages/themes/fuyukawa-kagari/games.astro",
    "src/themes/fuyukawa-kagari/pages/GamesPage.astro",
    "src/themes/fuyukawa-kagari/components/GameCover.astro",
    "src/core/data/games.ts",
    "public/themes/fuyukawa-kagari/assets/manga/playroom-page.webp",
    "public/themes/fuyukawa-kagari/assets/manga/playroom-strip.webp"
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  }
});

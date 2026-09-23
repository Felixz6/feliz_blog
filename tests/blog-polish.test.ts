import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("blog archive labels the fallback date as published and only renders explicit update dates", () => {
  const archive = read("../src/themes/fuyukawa-kagari/pages/BlogIndexPage.astro");

  assert.match(archive, /hasUpdatedDate: Boolean\(post\.data\.updatedDate\)/);
  assert.match(archive, /post\.hasUpdatedDate \? "updated" : "published"/);
  assert.match(archive, /post\.hasUpdatedDate && <time[^>]*>更新/);
});

test("SteamFn article has a matching route and the previous route redirects", () => {
  const newArticle = "../src/content/blog/steamfn-malware-analysis.md";
  const oldArticle = "../src/content/blog/astrbot-roleplay-persona-notes.md";
  const article = read(newArticle);
  const astroConfig = read("../astro.config.mjs");

  assert.equal(existsSync(new URL(newArticle, import.meta.url)), true);
  assert.equal(existsSync(new URL(oldArticle, import.meta.url)), false);
  assert.match(article, /slug: "steamfn-malware-analysis"/);
  assert.match(article, /title: "SteamFn 恶意软件分析与处置报告"/);
  assert.match(astroConfig, /"\/blog\/astrbot-roleplay-persona-notes\/": "\/blog\/steamfn-malware-analysis\/"/);
});

test("empty XP and games sections are removed from the About page", () => {
  const aboutPage = read("../src/themes/fuyukawa-kagari/pages/AboutPage.astro");
  const profileData = read("../src/core/data/profile.ts");

  assert.doesNotMatch(aboutPage, /about-section--split|兴趣标签待补充|喜欢的游戏待补充/);
  assert.doesNotMatch(profileData, /xpFavorites|favoriteGames/);
});

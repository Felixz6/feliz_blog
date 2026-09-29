import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("article print stylesheet hides UI and decor while preserving print metadata", () => {
  const styles = read("../src/themes/fuyukawa-kagari/styles/theme.css");
  const layout = read("../src/themes/fuyukawa-kagari/layouts/ArticleLayout.astro");

  assert.match(styles, /@media print\s*\{/);
  assert.match(styles, /\.site-header[\s\S]*?\.sakura-rain[\s\S]*?\.toy-dock/);
  assert.match(styles, /\.article-toc[\s\S]*?\.article-colophon[\s\S]*?\.manga-art/);
  assert.match(styles, /\.prose pre[\s\S]*?white-space:\s*pre-wrap\s*!important/);
  assert.match(styles, /\.prose table[\s\S]*?table-layout:\s*fixed/);
  assert.match(styles, /\.article-print-meta\s*\{\s*display:\s*none/);
  assert.match(styles, /break-after:\s*avoid/);
  assert.match(layout, /const articleUrl = new URL\(getCanonicalPath\(Astro\.url\.pathname\)/);
  assert.match(layout, /作者：\{site\.author\}/);
  assert.match(layout, /日期：\{date\}/);
  assert.match(layout, /文章地址：<a href=\{articleUrl\}>\{articleUrl\}<\/a>/);
});

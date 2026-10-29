import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync } from "node:fs";

const removedArticle = new URL("../src/content/blog/agents-development-guidelines.md", import.meta.url);
const removedCodexArticle = new URL("../src/content/blog/CodexPlusPlus-open-source-learning.md", import.meta.url);
const removedCodexCovers = [
  "../public/blog-covers/cover-05.webp",
  "../public/blog-covers/cover-05.png",
  "../public/blog-covers/responsive/cover-05-320-26c71e9b.webp",
  "../public/blog-covers/responsive/cover-05-480-26c71e9b.webp",
  "../public/blog-covers/responsive/cover-05-640-26c71e9b.webp",
  "../public/blog-covers/responsive/cover-05-768-26c71e9b.webp"
].map((relative) => new URL(relative, import.meta.url));

test("the superseded Agent guidelines article is no longer published in Blog", () => {
  assert.equal(existsSync(removedArticle), false);
});

test("the CodexPlusPlus open-source learning article and its exclusive cover are no longer published", () => {
  assert.equal(existsSync(removedCodexArticle), false);
  for (const cover of removedCodexCovers) assert.equal(existsSync(cover), false);
  const coverNames = [
    ...readdirSync(new URL("../public/blog-covers/", import.meta.url)),
    ...readdirSync(new URL("../public/blog-covers/responsive/", import.meta.url))
  ];
  assert.equal(coverNames.some((name) => name.startsWith("cover-05")), false);
});

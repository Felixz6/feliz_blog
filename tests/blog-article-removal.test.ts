import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

const removedArticle = new URL("../src/content/blog/agents-development-guidelines.md", import.meta.url);

test("the superseded Agent guidelines article is no longer published in Blog", () => {
  assert.equal(existsSync(removedArticle), false);
});

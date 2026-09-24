import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
  "utf8"
);

test("production domain, canonical origin, sitemap, and documented host agree", () => {
  const astroConfig = readSource("astro.config.mjs");
  const robots = readSource("public/robots.txt");
  const readme = readSource("README.md");

  assert.match(astroConfig, /site: "https:\/\/felizx\.com"/);
  assert.match(robots, /^Sitemap: https:\/\/felizx\.com\/sitemap-index\.xml$/m);
  assert.match(readme, /正式入口 `https:\/\/felizx\.com\/`[^\n]*Vercel/);
  assert.match(readme, /正式页 canonical 为 `https:\/\/felizx\.com\/`/);
});

test("obsolete GitHub Pages and EdgeOne deployment configs are absent", () => {
  assert.equal(existsSync(new URL("../.github/workflows/deploy.yml", import.meta.url)), false);
  assert.equal(existsSync(new URL("../edgeone.json", import.meta.url)), false);
});

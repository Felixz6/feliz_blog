import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
  "utf8"
);

test("production domain, canonical origin, sitemap, and documented Cloudflare Pages host agree", () => {
  const astroConfig = readSource("astro.config.mjs");
  const robots = readSource("public/robots.txt");
  const readme = readSource("README.md");

  assert.match(astroConfig, /site: "https:\/\/felizx\.com"/);
  assert.match(robots, /^Sitemap: https:\/\/felizx\.com\/sitemap-index\.xml$/m);
  assert.match(readme, /正式入口 `https:\/\/felizx\.com\/` 与 `https:\/\/www\.felizx\.com\/` 均接入 Cloudflare Pages 项目 `feliz-blog`/);
  assert.match(readme, /正式页 canonical 为 `https:\/\/felizx\.com\/`/);
  assert.match(readme, /`npm run build` 构建并将 `dist\/` 作为输出目录/);
});

test("legacy Vercel integrations and obsolete deployment configs are absent", () => {
  const packageJson = JSON.parse(readSource("package.json"));
  const baseLayout = readSource("src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");

  assert.equal(packageJson.dependencies["@vercel/analytics"], undefined);
  assert.equal(packageJson.dependencies["@vercel/speed-insights"], undefined);
  assert.doesNotMatch(baseLayout, /@vercel\/(?:analytics|speed-insights)/);
  assert.equal(existsSync(new URL("../.github/workflows/deploy.yml", import.meta.url)), false);
  assert.equal(existsSync(new URL("../edgeone.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../vercel.json", import.meta.url)), false);
});

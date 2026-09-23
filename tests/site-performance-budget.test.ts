import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
  "utf8"
);

const profileSource = readSource("src/core/PerformanceProfile.astro");
const fuyukawaThemeSource = readSource("src/themes/fuyukawa-kagari/styles/theme.css");
const packageSource = readSource("package.json");
const budgetSource = readSource("scripts/check-performance-budgets.mjs");

test("shared performance profile publishes document visibility", () => {
  assert.match(profileSource, /root\.dataset\.yuimiVisibility = document\.visibilityState/);
  assert.match(profileSource, /document\.addEventListener\("visibilitychange", applyVisibility/);
});

test("Fuyukawa pauses CSS animation work while the document is hidden", () => {
  assert.match(fuyukawaThemeSource, /html\[data-yuimi-visibility="hidden"\][^]*animation-play-state: paused !important/);
});

test("lite mode removes only persistent decorative motion", () => {
  assert.match(fuyukawaThemeSource, /data-yuimi-performance="lite"\][^]*\.console-meter span[^]*animation: none !important/);
  assert.doesNotMatch(fuyukawaThemeSource, /\.sakura-rain span/);
});

test("production build enforces active route, CSS, and responsive-media budgets", () => {
  const scripts = JSON.parse(packageSource).scripts;
  assert.equal(scripts.build, "npm run generate:assets && npm run prepare:covers && astro build && npm run prune:media && npm run check:modules && npm run check:performance");
  assert.equal(scripts["check:modules"], "node --experimental-vm-modules scripts/check-built-modules.mjs");
  assert.equal(scripts["check:performance"], "node scripts/check-performance-budgets.mjs");
  assert.match(budgetSource, /Fuyukawa Home HTML/);
  assert.match(budgetSource, /Fuyukawa Projects CSS/);
});

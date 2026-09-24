import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const refreshCss = read("../src/themes/fuyukawa-kagari/styles/refresh.css");
const homePage = read("../src/themes/fuyukawa-kagari/pages/HomePage.astro");

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("Fuyukawa homepage removes invalid ARIA and keeps small text at WCAG AA contrast", () => {
  assert.match(homePage, /<p class="hero-text terminal-line">/);
  assert.doesNotMatch(homePage, /<p class="hero-text terminal-line"[^>]*aria-label=/);

  const tokens = Object.fromEntries(
    [...refreshCss.matchAll(/--(ink-soft|accent):\s*(#[\da-f]{6})/gi)]
      .map(([, name, value]) => [name, value])
  );
  assert.equal(tokens["ink-soft"], "#59677f");
  assert.equal(tokens.accent, "#496b86");

  for (const foreground of [tokens["ink-soft"], tokens.accent]) {
    for (const background of ["#ffffff", "#f8fbfe", "#eef5fb", "#f3f8fc", "#eff6fb"]) {
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${foreground} on ${background} must meet 4.5:1`
      );
    }
  }
});

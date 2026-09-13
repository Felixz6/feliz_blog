import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const home = readFileSync(new URL("../src/themes/kisara/pages/HomePage.astro", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/themes/kisara/styles/home.css", import.meta.url), "utf8");
const source = home.slice(home.indexOf("const paintTitleEnchant ="), home.indexOf("const drawTitleAbyss ="));
const paint = vm.runInNewContext(`${source}; paintTitleEnchant`, {
  titleAbyssDomHandoffStart: 0.72,
  phaseProgress: (value: number, start: number, end: number) => Math.max(0, Math.min(1, (value - start) / (end - start)))
});

test("enchantment tints the existing glyph alpha without drawing another outline", () => {
  for (const [width, height] of [[450, 160], [1200, 320], [2304, 680]]) {
    const draws: number[][] = [];
    const context = {
      globalAlpha: 1, globalCompositeOperation: "source-over", fillStyle: null,
      createLinearGradient() { return { addColorStop() {} }; },
      save() {},
      restore() { this.globalAlpha = 1; this.globalCompositeOperation = "source-over"; },
      fillRect(...rect: number[]) {
        assert.equal(this.globalCompositeOperation, "source-atop");
        assert.ok(this.globalAlpha > 0 && this.globalAlpha < 0.4);
        draws.push(rect);
      }
    };
    for (const intro of [0, 0.5, 0.72, 1]) paint(context, width, height, intro);
    assert.equal(draws.length, 0);
    for (const intro of [0.76, 0.8, 0.86, 0.8, 0.76]) paint(context, width, height, intro);
    assert.equal(draws.length, 5);
    for (const rect of draws) assert.deepEqual(rect, [0, 0, width, height]);
    assert.equal(context.globalCompositeOperation, "source-over");
    assert.equal(context.globalAlpha, 1);
  }
  assert.doesNotMatch(source, /fillText|strokeText|shadowBlur|translate|scale|requestAnimationFrame/);
});

test("Canvas owns both title and enchantment while DOM remains a fallback", () => {
  assert.match(css, /\.kisara-gate\.is-title-abyss-ready \.kisara-title > \.kisara-title-enchant \{\s*opacity: 0;/);
  assert.match(css, /\.kisara-title > \.kisara-title-enchant \{[^}]*--kisara-enchant-opacity/);
  assert.match(home, /drawImage\(titleDataMaskCanvas, 0, 0\);[^]*paintTitleEnchant\(context, titleDataMaskCanvas.width, titleDataMaskCanvas.height, chargeIntroProgress\);[^]*drawImage\(titleAbyssRimCanvas, 0, 0\);/);
  assert.match(home, /Math\.abs\(chargeIntroProgress - titleAbyssLastIntro\) < 0\.0025/);
  assert.equal((home.match(/titleAbyssLastIntro = -1;/g) ?? []).length, 3);
});

test("the heart and front chains stay above the liquid glyph while rear chains stay behind", () => {
  const layer = (name: string) => {
    const rule = css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`));
    assert.ok(rule, name);
    const value = rule[1].match(/z-index:\s*(\d+)/);
    assert.ok(value, name);
    return Number(value[1]);
  };
  assert.ok(layer("kisara-title-chain-canvas-back") < layer("kisara-title-lens-canvas"));
  assert.ok(layer("kisara-title-chain-canvas-front") > layer("kisara-title-lens-canvas"));
  const heart = home.slice(home.indexOf("const drawContractHeartImprint ="), home.indexOf("const drawChainRupture ="));
  assert.match(heart, /const context = chainFrontContext;/);
});

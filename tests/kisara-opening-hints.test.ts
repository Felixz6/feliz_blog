import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8"
);
const opening = readSource("src/themes/kisara/components/KisaraOpeningMemoryScene.astro");
const routes = readSource("src/themes/kisara/data/openingRoutes.ts");
const runtime = readSource("src/themes/kisara/lib/comicOpening.ts");
const motion = readSource("src/themes/kisara/lib/comicMotion.ts");
const transition = readSource("src/themes/kisara/lib/comicTransition.ts");
const css = readSource("src/themes/kisara/styles/home-comic.css");
const home = readSource("src/themes/kisara/pages/HomePage.astro");
const layout = readSource("src/themes/kisara/layouts/KisaraLayout.astro");
const fridge = readSource("src/themes/kisara/components/KisaraFridgeScene.astro");
const hintIds = ["chibi-jealousy", "chibi-apple", "found-self", "photo-archive", "memory-return"];

test("Comic 001 preserves the five hidden-route definitions and versioned ledger", () => {
  assert.match(layout, /yuimi-kisara-opening-hints-v1/);
  for (const id of hintIds) {
    assert.match(layout, new RegExp(`"${id}"`));
    assert.equal((routes.match(new RegExp(`id: "${id}"`, "g")) ?? []).length, 1);
  }
  assert.match(runtime, /yuimi:kisara-opening-hint-achieved/);
  assert.match(runtime, /__yuimiKisaraEasterLedger\?\.has/);
  assert.match(opening, /data-kisara-opening-hint=\{route\.id\}/);
});

test("Each opening hint is still granted only by its accepted scene", () => {
  const chibi = readSource("src/themes/kisara/components/KisaraChibiStage.astro")
    + readSource("src/themes/kisara/lib/chibiStage.ts");
  const clue = readSource("src/themes/kisara/components/KisaraGameClueScene.astro");
  const audio = readSource("src/themes/kisara/components/KisaraAudioControl.astro");
  assert.match(chibi, /mark\("chibi-jealousy"\)/);
  assert.match(chibi, /mark\("chibi-apple"\)/);
  assert.match(home, /mark\("found-self"\)/);
  assert.match(clue, /mark\("photo-archive"\)/);
  assert.match(audio, /mark\("memory-return"\)/);
  assert.doesNotMatch(runtime, /EasterLedger\?\.mark/);
});

test("Completed hints keep one whole-label strike and keyboard-readable clues", () => {
  assert.equal((opening.match(/class="kisara-opening-easter-hint-copy"/g) ?? []).length, 1);
  assert.equal((opening.match(/class="kisara-opening-easter-hint-fragment"/g) ?? []).length, 1);
  assert.match(opening, /tabindex="0" title=\{route\.detail\}/);
  assert.match(css, /kisara-opening-hint-strike/);
  assert.match(css, /is-hint-achieved/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("Five page branches, four chapters, and page/chapter visit state survive replacement", () => {
  for (const id of ["home", "blog", "games", "projects", "about"]) {
    assert.match(routes, new RegExp(`id: "${id}"`));
  }
  assert.equal((routes.match(/kind: "chapter"/g) ?? []).length, 4);
  assert.match(opening, /routeBranches\.map/);
  assert.match(opening, /branch\.routes\.map/);
  assert.match(runtime, /yuimi-kisara-opening-route-chapters-v1/);
  assert.match(runtime, /__yuimiKisaraLovebrainProgress\?\.snapshot/);
  assert.match(runtime, /yuimi:kisara-lovebrain-progress/);
  assert.match(runtime, /data-kisara-home-stop/);
  assert.match(runtime, /routeTapReady/);
  assert.match(runtime, /focusin/);
  assert.match(runtime, /event\.metaKey \|\| event\.ctrlKey/);
});

test("001 is opaque and viewport-filling with no old transparent bridge markup", () => {
  assert.match(home, /class="kisara-opening kisara-comic-section"/);
  assert.match(css, /\.kisara-opening\.kisara-comic-section\s*\{[^}]*height: calc\(100svh \/ var\(--kisara-scale, 1\)\);[^}]*background: #fff;/);
  assert.match(css, /\.kisara-comic-section::before, \.kisara-comic-section::after \{ content: none; \}/);
  assert.doesNotMatch(home, /class="kisara-opening-edge"|class="kisara-opening-inner"/);
  assert.doesNotMatch(readSource("src/themes/kisara/styles/home.css"), /\.kisara-opening/);
  assert.doesNotMatch(readSource("src/themes/kisara/styles/theme.css"), /\.kisara-opening/);
});

test("Comic assets are deferred; 001 no longer downloads or drives its former footage", () => {
  for (const id of ["quiet", "action", "smile", "candle"]) assert.match(opening, new RegExp(`id: "${id}"`));
  assert.match(opening, /manga-home-v1\.webp/);
  assert.doesNotMatch(opening, /hero-structure\.svg|kisara-comic-portrait/);
  assert.match(opening, /data-comic-src/);
  assert.match(runtime, /await image\.decode\(\)/);
  assert.match(runtime, /Promise\.allSettled/);
  assert.doesNotMatch(opening, /<video|<iframe|opening-memory-001/);
  assert.doesNotMatch(runtime, /requestAnimationFrame|setInterval/);
  assert.match(runtime, /observer\.disconnect\(\)/);
  assert.match(runtime, /serial !== generation/);
});

test("original manga panels use full-bleed art and compact opaque captions", () => {
  assert.match(opening, /<div class="kisara-comic-panel-art">\s*<img data-comic-src/);
  assert.match(opening, /<\/noscript>\s*<\/div>\s*<figcaption>/);
  assert.match(css, /\.kisara-comic-panel figure \{[^}]*position: relative;[^}]*height: 100%/);
  assert.match(css, /\.kisara-comic-panel-art \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  const caption = css.match(/\.kisara-comic-panel figcaption \{([^}]+)\}/)![1];
  assert.match(caption, /position: absolute/);
  assert.match(caption, /width: max-content/);
  assert.match(caption, /background: #fff/);
  assert.doesNotMatch(caption, /rgba|right:/);
  assert.match(css, /grid-template-columns: repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /\.kisara-comic-panel img \{[^}]*object-fit: cover/);
  assert.doesNotMatch(css, /--comic-image-scale|--comic-panel-tilt/);
  assert.match(css, /grid-column: 1\/4; grid-row: 1\/-1/);
  assert.match(css, /grid-column: 8\/13; grid-row: 1/);
  assert.match(css, /grid-column: 4\/9; grid-row: 2/);
  for (const id of ["hero", "quiet", "action", "smile", "candle"]) {
    assert.match(css, new RegExp(`\\.kisara-comic-panel\\.is-${id} \\{[^}]*--comic-focus-x:[^}]*--comic-focus-y:`));
  }
  assert.match(css, /object-position: var\(--comic-focus-x,50%\) var\(--comic-focus-y,50%\)/);
  assert.match(css, /scale\(1\.012\)/);
});

test("archived full-panel artwork remains intact after the original-page redesign", async () => {
  const { default: sharp } = await import("sharp");
  const root = "../public/themes/kisara/assets/home-comic/";
  const hero = readFileSync(new URL(`${root}hero-panel-v2.webp`, import.meta.url));
  assert.deepEqual(hero, readFileSync(new URL("../design/kisara-comic-001/assets/panel-clean.webp", import.meta.url)));
  const heroMeta = await sharp(hero).metadata();
  assert.equal(heroMeta.hasAlpha, false);
  assert.deepEqual([heroMeta.width, heroMeta.height], [752, 1148]);
  const smile = readFileSync(new URL(`${root}smile-panel-v2.webp`, import.meta.url));
  const smileMeta = await sharp(smile).metadata();
  assert.deepEqual([smileMeta.width, smileMeta.height], [738, 1244]);
  assert.equal(smileMeta.hasAlpha, false);
  assert.doesNotMatch(opening, /file: "(?:smile|hero-hybrid|hero-panel-v2|smile-panel-v2)\.webp"/);
  let total = hero.length + smile.length;
  for (const name of ["quiet", "action", "candle"]) {
    total += statSync(new URL(`${root}${name}.webp`, import.meta.url)).size;
  }
  assert.ok(total < 450_000, "Full-panel framing must retain a bounded five-image payload");
  for (const bytes of [hero, smile]) {
    const pixels = await sharp(bytes).resize({ width: 180 }).stats();
    assert.ok(pixels.channels[0].stdev > 20);
  }
});

test("Comic entrance and return move the intact page without a radial paper mask or standalone portrait", () => {
  const entry = home.slice(home.indexOf("const enterNextPage ="), home.indexOf("const finalizeLovebrainExit ="));
  const back = home.slice(home.indexOf("const returnToGate ="), home.indexOf("const clearHomeGateReturnArm ="));
  assert.match(entry, /runComicHandoff\("opening"/);
  assert.match(back, /runComicHandoff\("gate"/);
  assert.match(back, /setScrollPosition\(0, true\);\s*requestHomeSectionReplayReset\(\);\s*completeGateReturn\(\)/);
  assert.doesNotMatch(entry + back, /smoothScrollTo\(/);
  assert.match(home, /if \(comicTransition\.active \|\| chapterTransition\.active\) \{ event\.preventDefault\(\); return; \}/);
  assert.match(home, /a\[data-comic-next\]/);
  assert.match(runtime, /await motion\.play\(scene\)/);
  assert.match(motion, /animate\(scene, page/);
  assert.doesNotMatch(motion, /comicSpreadPoints|clipPath: `polygon/);
  assert.match(css, /\.kisara-comic-flight > \.kisara-comic \{ background: transparent; \}/);
  assert.match(css, /\.kisara-comic\s*\{[^}]*color: var\(--comic-ink\)/);
  assert.doesNotMatch(css + transition, /kisara-comic-curtain|slabs|reveal === "split"/);
  assert.match(home, /comic\?\.settlePresentation\?\.\(\)/);
  assert.match(home, /if \(stop\.element === opening && isOpeningStopCurrent\(\)\) return true;/);
  assert.doesNotMatch(home, /openingBridgePortalActive = true/);
  assert.match(transition, /mode === "return"/);
  assert.doesNotMatch(motion + transition, /requestAnimationFrame|setInterval|feTurbulence/);
});

test("Five comic panels each represent one page and share synchronized accessible route groups", () => {
  for (const [page, art] of [["home", "hero"], ["blog", "quiet"], ["games", "action"], ["projects", "smile"], ["about", "candle"]]) {
    assert.match(opening, new RegExp(`${page}: \\{ id: "${art}"`));
  }
  assert.match(opening, /const panel = panels\[branch\.id\]/);
  assert.match(opening, /"kisara-comic-branch", "kisara-comic-panel"/);
  assert.match(opening, /href=\{branch\.href\}[^]*<figure>/);
  assert.doesNotMatch(opening, /kisara-comic-portrait|kisara-comic-art/);
  assert.match(opening, /kisara-comic-page-number/);
  assert.match(opening, /aria-controls=\{`comic-routes-/);
  assert.match(runtime, /setAttribute\("aria-expanded", String\(selected\)\)/);
  const navigation = css.match(/\.kisara-comic-navigation\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(navigation, /grid-template-rows/);
  assert.doesNotMatch(navigation, /background:|border-radius:|box-shadow:/);
  assert.match(css, /grid-template-columns: repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\); grid-template-rows: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /kisara-comic-route-details \[hidden\] \{ display: none; \}/);
});

test("The persistent Home header stays above the comic flight without a visibility animation", () => {
  const flight = css.match(/\.kisara-comic-flight\s*\{([^}]+)\}/)?.[1] ?? "";
  const header = css.match(/body\.kisara-home-page:not\(\.is-lovebrain-home-active\):has\(> \.kisara-comic-flight\) > \.kisara-header\s*\{([^}]+)\}/)?.[1] ?? "";
  const zIndex = (rule: string) => Number(rule.match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(zIndex(header) > zIndex(flight));
  assert.doesNotMatch(header, /opacity|visibility|transform|animation|transition/);
});

test("Fridge handoff checks a fresh decoded frame and has bounded failure cleanup", () => {
  const frame = readSource("src/themes/kisara/lib/videoFrame.ts");
  assert.match(fridge, /playCoveredEntry\(\)/);
  assert.match(fridge, /armOpening\(false\)/);
  assert.match(fridge, /finishCoveredEntry\?\.\(\)/);
  assert.match(fridge, /1800/);
  assert.match(frame, /!video\.seeking && metadata\.mediaTime <= video\.currentTime \+ \.1/);
  assert.match(frame, /cancelVideoFrameCallback/);
  assert.match(frame, /signal\.removeEventListener\("abort", abort\)/);
  assert.match(frame, /timeout = 1500/);
});

test("All five supplied images have hybrid derivatives and real vector masters", () => {
  const manifest = JSON.parse(readSource("design/kisara-comic-001/collection/manifest.json"));
  assert.equal(manifest.assets.length, 5);
  assert.ok(manifest.runtimeBytes < 400_000);
  for (const asset of manifest.assets) {
    const vector = readSource(`design/kisara-comic-001/collection/${asset.id}.svg`);
    assert.match(vector, /<path/);
    assert.doesNotMatch(vector, /<(?:image|foreignObject|script)\b/);
    const sourcePath = new URL(`../kisara/comic/${asset.source}`, import.meta.url);
    // Original source materials intentionally stay outside Git.
    try {
      const original = readFileSync(sourcePath);
      assert.equal(createHash("sha256").update(original).digest("hex"), asset.sourceSha256);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const filename = asset.id === "hero" ? "hero-hybrid.webp" : `${asset.id}.webp`;
    assert.equal(statSync(new URL(`../public/themes/kisara/assets/home-comic/${filename}`, import.meta.url)).size, asset.runtimeBytes);
  }
});

test("Comic vector masters and published derivatives rasterize with visible linework", async () => {
  const { default: sharp } = await import("sharp");
  sharp.concurrency(2);
  const manifest = JSON.parse(readSource("design/kisara-comic-001/collection/manifest.json"));
  for (const asset of manifest.assets) {
    const filename = asset.id === "hero" ? "hero-hybrid.webp" : `${asset.id}.webp`;
    for (const relative of [
      `design/kisara-comic-001/collection/${asset.id}.svg`,
      `public/themes/kisara/assets/home-comic/${filename}`,
    ]) {
      const image = sharp(readFileSync(new URL(`../${relative}`, import.meta.url)));
      const metadata = await image.metadata();
      assert.deepEqual([metadata.width, metadata.height], asset.runtimeSize);
      const pixels = await image.resize({ width: 256 }).flatten({ background: "#fff" }).stats();
      assert.ok(pixels.channels[0].stdev > 20, `${relative} must retain visible linework`);
    }
  }
});

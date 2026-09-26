import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
  "utf8"
);

const layoutSource = readSource("src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
const homeSource = readSource("src/themes/fuyukawa-kagari/pages/HomePage.astro");
const refreshStyles = readSource("src/themes/fuyukawa-kagari/styles/refresh.css");
const mangaStyles = readSource("src/themes/fuyukawa-kagari/styles/manga.css");
const layeredHeroSource = readSource("src/themes/fuyukawa-kagari/components/LayeredHero.astro");

test("Fuyukawa has no Live2D widget or external loader and retains the music dock", () => {
  assert.doesNotMatch(layoutSource, /live.?2d|waifu|initWidget|cubismcore/i);
  assert.match(layoutSource, /class="toy-widget music-widget"/);
  assert.match(layoutSource, /tabler:player-play/);
});

test("homepage local signal uses only the date and time", () => {
  assert.doesNotMatch(homeSource, /本地时间/);
  assert.match(homeSource, /data-home-date/);
  assert.match(homeSource, /data-home-time/);
  assert.match(homeSource, /const homeDateFormatter = new Intl\.DateTimeFormat/);
  assert.match(homeSource, /const homeTimeFormatter = new Intl\.DateTimeFormat/);
  assert.doesNotMatch(homeSource, /data-home-weather|api\.open-meteo\.com|ipwho\.is|apis\.map\.qq\.com/);
});

test("static homepage and widget markup starts with useful defaults before JavaScript", () => {
  const manifest = JSON.parse(readSource("public/themes/fuyukawa-kagari/music/manifest.json")) as { title: string }[];
  assert.match(homeSource, /const initialHomeDate = new Intl\.DateTimeFormat\("zh-CN"/);
  assert.match(homeSource, /const initialHomeTime = new Intl\.DateTimeFormat\("zh-CN"/);
  assert.match(homeSource, /data-home-date>\{initialHomeDate\}/);
  assert.match(homeSource, /data-home-time>\{initialHomeTime\}/);
  assert.match(layoutSource, /formatInitialElapsed\(voyagerOneStart, "minute"\)/);
  assert.match(layoutSource, /formatInitialElapsed\(voyagerTwoStart, "minute"\)/);
  assert.match(layoutSource, /formatInitialElapsed\(contractStart, "days"\)/);
  assert.ok(layoutSource.includes(`<p class="music-track">${manifest[0].title}</p>`));
  assert.match(layoutSource, /data-music-status>已暂停/);
  assert.match(layoutSource, /data-music-note>点击播放即可聆听/);
  assert.doesNotMatch(homeSource, /---- 年|--:--:--/);
  assert.doesNotMatch(layoutSource, /计算中\.\.\.|待播放|lofi sakura loop|打开音乐工具时读取歌单/);
});

test("homepage preloads the split desktop scene and only the smaller mobile wallpaper", () => {
  const mobileSize = statSync(fileURLToPath(new URL(
    "../public/themes/fuyukawa-kagari/assets/hero-wallpaper-mobile.webp",
    import.meta.url
  ))).size;
  const desktopSize = statSync(fileURLToPath(new URL(
    "../public/themes/fuyukawa-kagari/assets/hero-wallpaper.webp",
    import.meta.url
  ))).size;

  assert.match(layoutSource, /href=\{kagariAssets\.mobileHeroWallpaper\}[\s\S]*?media="\(max-width: 760px\)"/);
  assert.match(layoutSource, /href=\{heroCharacter\.src\}[\s\S]*?media="\(min-width: 761px\)"/);
  assert.match(layoutSource, /href=\{heroManga\.src\}[\s\S]*?media="\(min-width: 761px\)"/);
  assert.doesNotMatch(layoutSource, /href=\{kagariAssets\.heroWallpaper\}/);
  assert.match(refreshStyles, /@media \(max-width: 760px\)[\s\S]*?hero-wallpaper-mobile\.webp/);
  assert.ok(mobileSize < desktopSize * 0.6, `mobile hero (${mobileSize}) should be at least 40% smaller than desktop hero (${desktopSize})`);
});

test("mobile homepage cards use separate grid rows in a right-top to left-bottom diagonal", () => {
  const breakpoint = refreshStyles.indexOf("@media (max-width: 760px)");
  const selector = "body[data-fuyukawa] .home-signal-card,\n  body[data-fuyukawa] .home-welcome-bubble";
  const ruleStart = refreshStyles.indexOf(selector, breakpoint);
  const ruleEnd = refreshStyles.indexOf("}", ruleStart);
  const mobileRules = refreshStyles.slice(breakpoint);
  const mobileCardRule = refreshStyles.slice(ruleStart, ruleEnd + 1);

  assert.ok(breakpoint >= 0, "mobile breakpoint should exist");
  assert.ok(ruleStart > breakpoint, "card flow reset should be inside the mobile breakpoint");
  assert.match(mobileCardRule, /position:\s*static/);
  assert.match(mobileCardRule, /inset:\s*auto/);
  assert.match(mobileCardRule, /transform:\s*none/);
  assert.match(mobileRules, /body\[data-fuyukawa\] \.home-signal-card \{ justify-self: end; \}/);
  assert.match(mobileRules, /body\[data-fuyukawa\] \.home-welcome-bubble \{ justify-self: start; \}/);
  assert.match(mobileRules, /body\[data-fuyukawa\] \.home-signal-card \{ margin-top: clamp\(36px, 6vh, 52px\); \}/);
  assert.match(mobileRules, /@media \(max-width: 760px\) and \(orientation: portrait\) \{\s*body\[data-fuyukawa\] \.home-welcome-bubble \{ transform: translateY\(clamp\(96px, 16vh, 144px\)\); \}/);
});

test("portrait mobile hero uses its own manga crop while desktop keeps the original asset", () => {
  const mobileHeroManga = statSync(fileURLToPath(new URL(
    "../public/themes/fuyukawa-kagari/assets/manga/hero-manga-mobile.webp",
    import.meta.url
  ))).size;
  const desktopHeroManga = statSync(fileURLToPath(new URL(
    "../public/themes/fuyukawa-kagari/assets/manga/hero-manga.webp",
    import.meta.url
  ))).size;

  assert.match(layeredHeroSource, /<source\s+srcset=\{kagariAssets\.mobileHeroManga\}\s+media="\(max-width: 760px\) and \(orientation: portrait\) and \(max-aspect-ratio: 3\/5\)"/);
  assert.match(layeredHeroSource, /<img \{\.\.\.mangaArt\("hero-manga"\)\} class="manga-scene-back" data-manga-back/);
  assert.match(layoutSource, /href=\{kagariAssets\.mobileHeroManga\}[\s\S]*?media="\(max-width: 760px\) and \(orientation: portrait\) and \(max-aspect-ratio: 3\/5\)"/);
  assert.match(layoutSource, /href=\{heroManga\.src\}[\s\S]*?media="\(min-width: 761px\)"/);
  assert.match(mangaStyles, /background-image:\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-character\.webp["']?\),\s*url\(["']?\/themes\/fuyukawa-kagari\/assets\/manga\/hero-manga\.webp["']?\)/);
  assert.ok(mobileHeroManga < desktopHeroManga * 0.45, `mobile manga hero (${mobileHeroManga}) should be at least 55% smaller than desktop hero (${desktopHeroManga})`);
});

test("Fuyukawa pauses the second-by-second clock while hidden", () => {
  assert.match(homeSource, /const scheduleHomeClock =/);
  assert.match(homeSource, /document\.visibilityState !== "visible"/);
  assert.match(homeSource, /document\.addEventListener\("visibilitychange", handleClockVisibility\)/);
  assert.doesNotMatch(homeSource, /setInterval\(updateHomeClock, 1000\)/);
});

test("music manifest and audio source are deferred until music-player intent", () => {
  const initStart = layoutSource.indexOf("const initMusicPlayer =");
  const initEnd = layoutSource.indexOf("const ensureCurrentTrackSource =", initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  assert.match(layoutSource, /audio\.preload = "none"/);
  assert.match(layoutSource, /const musicProgressPersistInterval = 5000/);
  assert.match(layoutSource, /audio\.addEventListener\("timeupdate", \(\) => \{\s*updateMusicProgressUi\(\);\s*saveMusicProgress\(\);/);
  assert.doesNotMatch(layoutSource.slice(initStart, initEnd), /audio\.load\(|loadMusicTrack\(/);

  const bootstrapStart = layoutSource.indexOf("window.__yuimiRadio ??=");
  const bootstrapEnd = layoutSource.indexOf("const getContextMenu =", bootstrapStart);
  const bootstrap = layoutSource.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrap, /window\.__yuimiRadio\.bind\(\)/);
  assert.doesNotMatch(bootstrap, /window\.__yuimiRadio\.init\(\)/);
  assert.match(layoutSource, /if \(pinned\) void window\.__yuimiRadio\?\.init\(\)/);
});

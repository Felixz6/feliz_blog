import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
  "utf8"
);

const layoutSource = readSource("src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
const homeSource = readSource("src/themes/fuyukawa-kagari/pages/HomePage.astro");

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
  assert.match(layoutSource, /audio\.addEventListener\("timeupdate", \(\) => \{\s*updateMusicUi\(\);\s*saveMusicProgress\(\);/);
  assert.doesNotMatch(layoutSource.slice(initStart, initEnd), /audio\.load\(|loadMusicTrack\(/);

  const bootstrapStart = layoutSource.indexOf("window.__yuimiRadio ??=");
  const bootstrapEnd = layoutSource.indexOf("const getContextMenu =", bootstrapStart);
  const bootstrap = layoutSource.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrap, /window\.__yuimiRadio\.bind\(\)/);
  assert.doesNotMatch(bootstrap, /window\.__yuimiRadio\.init\(\)/);
  assert.match(layoutSource, /if \(pinned\) void window\.__yuimiRadio\?\.init\(\)/);
});

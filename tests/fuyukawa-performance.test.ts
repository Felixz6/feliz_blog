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

test("Fuyukawa bounds and defers location and weather requests", () => {
  assert.match(homeSource, /const scheduleHomeWeather =/);
  assert.match(homeSource, /locationCacheTtl = 1000 \* 60 \* 60 \* 12/);
  assert.match(homeSource, /fetchWithTimeout\(weatherUrl, \{\}, 4500, signal\)/);
  assert.match(homeSource, /requestJsonp\([^]*3500, signal/);
  assert.match(homeSource, /performanceProfile === "full" && !constrainedNetwork/);
  assert.match(homeSource, /connection\?\.saveData/);
  assert.doesNotMatch(homeSource, /getPconlineIpLocation|getTencentNewsIpLocation/);
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
  const bootstrapEnd = layoutSource.indexOf("const sakuraStateKey =", bootstrapStart);
  const bootstrap = layoutSource.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrap, /window\.__yuimiRadio\.bind\(\)/);
  assert.doesNotMatch(bootstrap, /window\.__yuimiRadio\.init\(\)/);
  assert.match(layoutSource, /if \(pinned\) void window\.__yuimiRadio\?\.init\(\)/);
});

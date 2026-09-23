export const SAKURA_TIER_ORDER = Object.freeze(["high", "medium", "low", "off"]);

export const SAKURA_TIER_PROFILES = Object.freeze({
  high: Object.freeze({ particles: 16, maxDpr: 1.5, sway: true, rotation: true, shadow: true }),
  medium: Object.freeze({ particles: 10, maxDpr: 1.25, sway: true, rotation: false, shadow: false }),
  low: Object.freeze({ particles: 4, maxDpr: 1, sway: false, rotation: false, shadow: false }),
  off: Object.freeze({ particles: 0, maxDpr: 1, sway: false, rotation: false, shadow: false })
});

const rank = (tier) => SAKURA_TIER_ORDER.indexOf(tier);

export function lowerSakuraTier(tier) {
  const index = rank(tier);
  return SAKURA_TIER_ORDER[Math.min(SAKURA_TIER_ORDER.length - 1, index + 1)] ?? "off";
}

export function limitSakuraTier(tier, ceiling) {
  return rank(tier) >= rank(ceiling) ? tier : ceiling;
}

export function chooseSakuraTier({
  viewportWidth = 1280,
  devicePixelRatio = 1,
  hardwareConcurrency,
  deviceMemory,
  saveData = false,
  reducedMotion = false
} = {}) {
  if (saveData || reducedMotion) return "off";

  const width = Number(viewportWidth) || 0;
  const cores = Number(hardwareConcurrency) || 0;
  const memory = Number(deviceMemory) || 0;

  if (width <= 480 || (cores > 0 && cores <= 2) || (memory > 0 && memory <= 2)) return "low";
  if (width <= 900 || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)) return "medium";
  return "high";
}

export function resolveSakuraTier(capabilities, { preference = null, manualEnable = false } = {}) {
  if (preference === "0") return "off";
  if (capabilities?.reducedMotion || capabilities?.saveData) {
    return preference === "1" || manualEnable ? "low" : "off";
  }
  return chooseSakuraTier(capabilities);
}

export function createFrameTimeMonitor({ windowSize = 60, thresholdMs = 24, sustainedMs = 2000, warmupMs = 1500 } = {}) {
  const samples = [];
  let overBudgetSince = null;
  let degraded = false;
  let warmupStartedAt = null;
  let warmupComplete = false;

  return {
    record(frameMs, nowMs) {
      if (degraded || !Number.isFinite(frameMs) || frameMs < 0 || !Number.isFinite(nowMs)) return degraded;
      if (!warmupComplete) {
        if (warmupStartedAt === null) warmupStartedAt = nowMs;
        if (nowMs - warmupStartedAt < warmupMs) return false;
        warmupComplete = true;
      }
      samples.push(frameMs);
      if (samples.length > windowSize) samples.shift();
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      if (average > thresholdMs) {
        if (overBudgetSince === null) overBudgetSince = nowMs;
        else if (nowMs - overBudgetSince >= sustainedMs) degraded = true;
      } else {
        overBudgetSince = null;
      }
      return degraded;
    },
    average() {
      return samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0;
    },
    reset({ preserveWarmup = false } = {}) {
      samples.length = 0;
      overBudgetSince = null;
      degraded = false;
      if (!preserveWarmup || !warmupComplete) {
        warmupStartedAt = null;
        warmupComplete = false;
      }
    }
  };
}

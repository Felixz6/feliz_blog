import {
  SAKURA_TIER_PROFILES,
  chooseSakuraTier,
  createFrameTimeMonitor,
  limitSakuraTier,
  lowerSakuraTier,
  resolveSakuraTier
} from "./sakura-performance.mjs";

const SAKURA_STATE_KEY = "yuimi-sakura-enabled-v1";
const PETAL_IMAGE_URL = "/themes/fuyukawa-kagari/assets/sakura-petal.svg";
const sakuraSessions = new WeakMap();

function getSakuraSession(windowRef) {
  let session = sakuraSessions.get(windowRef);
  if (!session) {
    session = { ceiling: "high" };
    sakuraSessions.set(windowRef, session);
  }
  return session;
}

export function createSakuraController({
  windowRef = window,
  documentRef = document,
  onStateChange = () => {}
} = {}) {
  const session = getSakuraSession(windowRef);
  let petalImage = null;
  let spriteImage = null;
  const petalSprites = new Map();

  let root = null;
  let canvas = null;
  let context = null;
  let mediaQuery = null;
  let connection = null;
  let preference = null;
  let tier = "off";
  let enabled = false;
  let mounted = false;
  let rafId = 0;
  let idleId = 0;
  let idleUsesCallback = false;
  let resizeTimer = 0;
  let lastFrameTime = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let frameMonitor = createFrameTimeMonitor();

  const isVisible = () => documentRef.visibilityState !== "hidden";
  const readPreference = () => {
    try {
      const value = windowRef.localStorage.getItem(SAKURA_STATE_KEY);
      return value === "0" || value === "1" ? value : null;
    } catch {
      return null;
    }
  };
  const writePreference = (value) => {
    try {
      windowRef.localStorage.setItem(SAKURA_STATE_KEY, value);
    } catch {
      // Keep the current session choice even when browser storage is unavailable.
    }
  };
  const readCapabilities = () => ({
    viewportWidth: windowRef.innerWidth,
    devicePixelRatio: windowRef.devicePixelRatio,
    hardwareConcurrency: windowRef.navigator.hardwareConcurrency,
    deviceMemory: windowRef.navigator.deviceMemory,
    saveData: Boolean(connection?.saveData),
    reducedMotion: Boolean(mediaQuery?.matches)
  });

  const cancelFrame = () => {
    if (!rafId) return;
    windowRef.cancelAnimationFrame(rafId);
    rafId = 0;
  };
  const cancelIdleStart = () => {
    if (!idleId) return;
    if (idleUsesCallback && typeof windowRef.cancelIdleCallback === "function") windowRef.cancelIdleCallback(idleId);
    else windowRef.clearTimeout(idleId);
    idleId = 0;
  };
  const notifyState = () => {
    documentRef.body?.classList.toggle("hide-sakura", !enabled);
    if (canvas) canvas.hidden = !enabled;
    onStateChange({ enabled, tier });
  };
  const createParticles = (count) => Array.from({ length: count }, (_, index) => {
    const duration = 18000 + (index * 7000) % 13000;
    const size = 9 + (index * 5) % 6;
    return {
      x: width * ((3 + index * 6.2) % 100) / 100,
      y: Math.random() * height,
      drift: [96, 40, -72][index % 3],
      size,
      opacity: 0.86 + (index % 3) * 0.06,
      speed: height / duration,
      amplitude: 18 + (index % 4) * 5,
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.00065 + (index % 3) * 0.00008,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (index % 2 ? 1 : -1) * (0.00018 + (index % 4) * 0.00003),
      duration
    };
  });
  const resizeCanvas = () => {
    if (!canvas || !context || !root || tier === "off") return;
    const rect = root.getBoundingClientRect();
    width = Math.max(1, rect.width || windowRef.innerWidth || 1);
    height = Math.max(1, rect.height || windowRef.innerHeight || 1);
    dpr = Math.min(Math.max(1, Number(windowRef.devicePixelRatio) || 1), SAKURA_TIER_PROFILES[tier].maxDpr);
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = createParticles(SAKURA_TIER_PROFILES[tier].particles);
    lastFrameTime = null;
  };
  const preparePetalSprites = () => {
    if (!petalImage?.complete || !petalImage.naturalWidth) return;
    if (spriteImage === petalImage && petalSprites.size) return;
    petalSprites.clear();
    spriteImage = petalImage;
    for (let size = 9; size <= 14; size += 1) {
      for (const shadow of [false, true]) {
        const padding = shadow ? 6 : 0;
        const sprite = documentRef.createElement("canvas");
        sprite.width = size + padding * 2;
        sprite.height = size + padding * 2;
        const spriteContext = sprite.getContext("2d", { alpha: true });
        if (!spriteContext) continue;
        if (shadow) {
          spriteContext.shadowColor = "rgba(215, 130, 156, 0.26)";
          spriteContext.shadowBlur = 5;
        }
        spriteContext.drawImage(petalImage, padding, padding, size, size);
        petalSprites.set(`${size}:${shadow ? 1 : 0}`, sprite);
      }
    }
  };
  const drawFrame = (elapsedMs) => {
    if (!context || !canvas || !petalSprites.size) return;
    const profile = SAKURA_TIER_PROFILES[tier];
    context.clearRect(0, 0, width, height);
    for (const petal of particles) {
      petal.y += petal.speed * elapsedMs;
      if (profile.sway) petal.phase += petal.swaySpeed * elapsedMs;
      if (profile.rotation) petal.angle += petal.rotationSpeed * elapsedMs;
      if (petal.y > height + petal.size) {
        petal.y = -petal.size;
        petal.x = Math.random() * width;
      }

      const progress = Math.max(0, Math.min(1, (petal.y + 24) / (height + 48)));
      const normalizedY = (petal.y + petal.size) / (height + petal.size);
      const fade = Math.min(1, normalizedY / 0.08, (1 - normalizedY) / 0.12);
      const sway = profile.sway ? Math.sin(petal.phase) * petal.amplitude : 0;
      const rotation = profile.rotation ? petal.angle : 0;
      const sprite = petalSprites.get(`${petal.size}:${profile.shadow ? 1 : 0}`);
      if (!sprite) continue;
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, fade)) * petal.opacity;
      context.translate(petal.x + petal.drift * progress + sway, petal.y);
      context.rotate(rotation);
      context.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      context.restore();
    }
  };
  const startAnimation = () => {
    idleId = 0;
    if (!mounted || !enabled || !isVisible() || rafId || !canvas) return;
    if (!petalImage) {
      petalImage = new windowRef.Image();
      petalImage.onload = preparePetalSprites;
      petalImage.src = PETAL_IMAGE_URL;
      if (petalImage.complete) preparePetalSprites();
    }
    resizeCanvas();
    const frame = (timestamp) => {
      rafId = 0;
      if (!mounted || !enabled || !isVisible()) {
        lastFrameTime = null;
        return;
      }
      if (lastFrameTime !== null) {
        const rawDelta = Math.max(0, timestamp - lastFrameTime);
        const delta = Math.min(50, rawDelta);
        if (frameMonitor.record(rawDelta, timestamp)) {
          tier = lowerSakuraTier(tier);
          session.ceiling = limitSakuraTier(session.ceiling, tier);
          if (tier === "off") {
            enabled = false;
            cancelFrame();
            notifyState();
            return;
          }
          frameMonitor.reset({ preserveWarmup: true });
          resizeCanvas();
          notifyState();
        }
        drawFrame(delta);
      } else {
        drawFrame(0);
      }
      lastFrameTime = timestamp;
      if (enabled && tier !== "off") rafId = windowRef.requestAnimationFrame(frame);
    };
    rafId = windowRef.requestAnimationFrame(frame);
  };
  const scheduleAnimation = () => {
    cancelIdleStart();
    if (!mounted || !enabled || !isVisible()) return;
    const idleStart = () => {
      idleId = 0;
      startAnimation();
    };
    if (typeof windowRef.requestIdleCallback === "function") {
      idleUsesCallback = true;
      idleId = windowRef.requestIdleCallback(idleStart, { timeout: 1200 });
    } else {
      idleUsesCallback = false;
      idleId = windowRef.setTimeout(idleStart, 200);
    }
  };
  const applyPreference = ({ manualEnable = false } = {}) => {
    const capabilities = readCapabilities();
    const targetTier = resolveSakuraTier(capabilities, { preference, manualEnable });
    if (targetTier === "off") {
      enabled = false;
      tier = "off";
      cancelIdleStart();
      cancelFrame();
      particles = [];
      context?.clearRect(0, 0, width, height);
      notifyState();
      return;
    }

    const limitedTier = limitSakuraTier(targetTier, session.ceiling);
    if (limitedTier === "off") {
      enabled = false;
      tier = "off";
      cancelIdleStart();
      cancelFrame();
      particles = [];
      context?.clearRect(0, 0, width, height);
      notifyState();
      return;
    }
    session.ceiling = limitSakuraTier(session.ceiling, limitedTier);
    const tierChanged = tier !== limitedTier;
    enabled = true;
    tier = limitedTier;
    if (tierChanged) resizeCanvas();
    notifyState();
    if (isVisible()) scheduleAnimation();
  };

  const onVisibilityChange = () => {
    if (!isVisible()) {
      cancelIdleStart();
      cancelFrame();
      lastFrameTime = null;
      frameMonitor.reset({ preserveWarmup: true });
      return;
    }
    lastFrameTime = null;
    frameMonitor.reset({ preserveWarmup: true });
    scheduleAnimation();
  };
  const onResize = () => {
    if (resizeTimer) windowRef.clearTimeout(resizeTimer);
    resizeTimer = windowRef.setTimeout(() => {
      resizeTimer = 0;
      if (!mounted || tier === "off") return;
      const requested = chooseSakuraTier(readCapabilities());
      const constrained = limitSakuraTier(requested, session.ceiling);
      if (constrained !== "off" && constrained !== tier) {
        tier = limitSakuraTier(constrained, tier);
        session.ceiling = limitSakuraTier(session.ceiling, tier);
        resizeCanvas();
        notifyState();
      } else {
        resizeCanvas();
      }
    }, 140);
  };
  const onPreferenceChange = () => applyPreference();
  const addMediaListener = () => {
    if (!mediaQuery) return;
    if (typeof mediaQuery.addEventListener === "function") mediaQuery.addEventListener("change", onPreferenceChange);
    else mediaQuery.addListener?.(onPreferenceChange);
  };
  const removeMediaListener = () => {
    if (!mediaQuery) return;
    if (typeof mediaQuery.removeEventListener === "function") mediaQuery.removeEventListener("change", onPreferenceChange);
    else mediaQuery.removeListener?.(onPreferenceChange);
  };

  const mount = (nextRoot = documentRef.querySelector("[data-sakura-rain]")) => {
    if (!nextRoot) return false;
    if (mounted && root === nextRoot) return true;
    if (mounted) destroy();
    mounted = true;
    frameMonitor.reset();
    root = nextRoot;
    canvas = root.querySelector("canvas[data-sakura-canvas]");
    context = canvas?.getContext("2d", { alpha: true }) ?? null;
    preference = readPreference();
    mediaQuery = windowRef.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    connection = windowRef.navigator.connection ?? windowRef.navigator.mozConnection ?? windowRef.navigator.webkitConnection ?? null;
    documentRef.addEventListener("visibilitychange", onVisibilityChange);
    windowRef.addEventListener("resize", onResize, { passive: true });
    addMediaListener();
    connection?.addEventListener?.("change", onPreferenceChange);
    applyPreference();
    return true;
  };

  function destroy() {
    if (!mounted) return;
    cancelIdleStart();
    cancelFrame();
    if (resizeTimer) windowRef.clearTimeout(resizeTimer);
    resizeTimer = 0;
    documentRef.removeEventListener("visibilitychange", onVisibilityChange);
    windowRef.removeEventListener("resize", onResize);
    removeMediaListener();
    connection?.removeEventListener?.("change", onPreferenceChange);
    context?.clearRect(0, 0, width, height);
    root = null;
    canvas = null;
    context = null;
    mediaQuery = null;
    connection = null;
    particles = [];
    lastFrameTime = null;
    mounted = false;
  }

  return {
    mount,
    destroy,
    isEnabled: () => enabled,
    getTier: () => tier,
    getDebugTargets: () => mounted ? { mediaQuery, connection } : null,
    setUserEnabled(nextEnabled) {
      if (nextEnabled && !enabled && session.ceiling === "off") session.ceiling = "low";
      preference = nextEnabled ? "1" : "0";
      writePreference(preference);
      applyPreference({ manualEnable: nextEnabled });
    }
  };
}

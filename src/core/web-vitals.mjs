const TARGETS = Object.freeze({ LCP: 2500, INP: 200, CLS: 0.1 });

const ratingFor = (name, value) => {
  if (name === "LCP") return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
  if (name === "INP") return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
  return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
};

const roundMetric = (name, value) => name === "CLS"
  ? Math.round(value * 10_000) / 10_000
  : Math.round(value);

const metricRecord = (name, value) => ({
  value: roundMetric(name, value),
  unit: name === "CLS" ? "score" : "ms",
  rating: ratingFor(name, value),
  target: TARGETS[name]
});

const mobileVisit = (win) => win.matchMedia?.("(pointer: coarse)").matches
  || Number(win.innerWidth) <= 820;

/**
 * Collect one page-lifecycle sample of Core Web Vitals. The endpoint is
 * deliberately opt-in; without it, the latest snapshot is available at
 * window.__yuimiWebVitals and through the `yuimi:web-vitals` event.
 */
export function installWebVitals({ window: win = globalThis.window, document: doc = globalThis.document, endpoint = "" } = {}) {
  if (!win || !doc || typeof win.PerformanceObserver !== "function") return () => {};
  win.__yuimiWebVitalsCleanup?.();

  const observers = [];
  const interactions = new Map();
  const connection = win.navigator?.connection;
  let path = String(win.location?.pathname || "/").split(/[?#]/, 1)[0] || "/";
  let metrics = { CLS: metricRecord("CLS", 0) };
  let lastLcp = null;
  let clsWindowValue = 0;
  let clsWindowStart = 0;
  let clsLastShift = null;
  let clsValue = 0;
  let reported = false;
  let segmentStart = 0;
  let pendingSoftNavigation = false;

  const snapshot = () => ({
    schema: "yuimi-web-vitals/v1",
    path,
    deviceClass: mobileVisit(win) ? "mobile" : "desktop",
    viewportWidth: Number(win.innerWidth) || 0,
    network: String(connection?.effectiveType || "unknown"),
    saveData: Boolean(connection?.saveData),
    sampledAt: new Date().toISOString(),
    metrics: { ...metrics }
  });

  const publish = () => {
    const current = snapshot();
    win.__yuimiWebVitals = current;
    try {
      win.dispatchEvent(new win.CustomEvent("yuimi:web-vitals", { detail: current }));
    } catch {
      // A missing CustomEvent implementation must not affect page behavior.
    }
    return current;
  };

  const observe = (type, handler, options = {}) => {
    try {
      const observer = new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) handler(entry);
      });
      observer.observe({ type, buffered: true, ...options });
      observers.push({ observer, handler });
    } catch {
      // Unsupported entry types are omitted; supported metrics still report.
    }
  };

  const setLcp = (entry) => {
    if (!Number.isFinite(entry.startTime) || entry.startTime < segmentStart) return;
    lastLcp = entry.startTime;
    metrics.LCP = metricRecord("LCP", lastLcp);
    publish();
  };

  const addLayoutShift = (entry) => {
    if (entry.hadRecentInput || !Number.isFinite(entry.value) || entry.value < 0 || Number(entry.startTime) < segmentStart) return;
    const start = Number(entry.startTime) || 0;
    if (clsLastShift === null || start - clsLastShift > 1000 || start - clsWindowStart > 5000) {
      clsWindowValue = entry.value;
      clsWindowStart = start;
    } else {
      clsWindowValue += entry.value;
    }
    clsLastShift = start;
    clsValue = Math.max(clsValue, clsWindowValue);
    metrics.CLS = metricRecord("CLS", clsValue);
    publish();
  };

  const addInteraction = (entry) => {
    const interactionId = Number(entry.interactionId);
    const duration = Number(entry.duration);
    if (!interactionId || !Number.isFinite(duration) || duration < 0 || (Number.isFinite(entry.startTime) && entry.startTime < segmentStart)) return;
    interactions.set(interactionId, Math.max(interactions.get(interactionId) || 0, duration));
    const sorted = [...interactions.values()].sort((left, right) => left - right);
    // INP is the 98th percentile of a visit's interaction latencies; for
    // ordinary visits this is the longest interaction, excluding rare outliers.
    const value = sorted[Math.max(0, Math.ceil(sorted.length * 0.98) - 1)];
    metrics.INP = metricRecord("INP", value);
    publish();
  };

  observe("largest-contentful-paint", setLcp);
  observe("layout-shift", addLayoutShift);
  observe("event", addInteraction, { durationThreshold: 16 });

  const finalize = () => {
    if (reported) return;
    for (const { observer, handler } of observers) {
      for (const entry of observer.takeRecords?.() || []) handler(entry);
    }
    reported = true;
    const report = publish();
    if (!endpoint || typeof win.navigator?.sendBeacon !== "function") return;
    try {
      win.navigator.sendBeacon(endpoint, JSON.stringify(report));
    } catch {
      // Beacon failures are intentionally non-blocking for navigation.
    }
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") finalize();
  };
  const onPageHide = () => finalize();
  const onBeforeSwap = () => {
    finalize();
    pendingSoftNavigation = true;
  };
  const onAfterSwap = () => {
    if (!pendingSoftNavigation) return;
    pendingSoftNavigation = false;
    path = String(win.location?.pathname || "/").split(/[?#]/, 1)[0] || "/";
    segmentStart = Number(win.performance?.now?.()) || 0;
    lastLcp = null;
    clsWindowValue = 0;
    clsWindowStart = 0;
    clsLastShift = null;
    clsValue = 0;
    interactions.clear();
    metrics = { CLS: metricRecord("CLS", 0) };
    reported = false;
    publish();
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);
  doc.addEventListener("astro:before-swap", onBeforeSwap);
  doc.addEventListener("astro:after-swap", onAfterSwap);
  win.addEventListener("pagehide", onPageHide);
  publish();

  const cleanup = () => {
    for (const { observer } of observers) observer.disconnect();
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    doc.removeEventListener("astro:before-swap", onBeforeSwap);
    doc.removeEventListener("astro:after-swap", onAfterSwap);
    win.removeEventListener("pagehide", onPageHide);
    if (win.__yuimiWebVitalsCleanup === cleanup) win.__yuimiWebVitalsCleanup = null;
  };
  win.__yuimiWebVitalsCleanup = cleanup;
  return cleanup;
}

export const webVitalsTargets = TARGETS;

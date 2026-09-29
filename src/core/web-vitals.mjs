import { onCLS, onINP, onLCP } from "web-vitals";

const TARGETS = Object.freeze({ LCP: 2500, INP: 200, CLS: 0.1 });
const METRIC_UNITS = Object.freeze({ LCP: "ms", INP: "ms", CLS: "score" });
const metricOptions = Object.freeze({ reportAllChanges: true, reportSoftNavs: true });

const roundMetric = (name, value) => name === "CLS"
  ? Math.round(value * 10_000) / 10_000
  : Math.round(value);

const fallbackRating = (name, value) => {
  if (name === "LCP") return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
  if (name === "INP") return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
  return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
};

const mobileVisit = (win) => win.matchMedia?.("(pointer: coarse)").matches
  || Number(win.innerWidth) <= 820;

const getPath = (win) => String(win.location?.pathname || "/").split(/[?#]/, 1)[0] || "/";

/**
 * Collect Core Web Vitals using Google's production-tested web-vitals
 * implementation. The endpoint is opt-in; without it, the latest snapshot
 * remains available at window.__yuimiWebVitals and via `yuimi:web-vitals`.
 */
export function installWebVitals({
  window: win = globalThis.window,
  document: doc = globalThis.document,
  endpoint = "",
  webVitals = { onCLS, onINP, onLCP }
} = {}) {
  if (!win || !doc) return () => {};
  if (typeof win.__yuimiWebVitalsCleanup === "function") return win.__yuimiWebVitalsCleanup;

  let path = getPath(win);
  let metrics = { CLS: { value: 0, unit: "score", rating: "good", target: TARGETS.CLS } };
  let reported = false;
  let pendingSoftNavigation = false;

  const snapshot = () => ({
    schema: "yuimi-web-vitals/v1",
    path,
    deviceClass: mobileVisit(win) ? "mobile" : "desktop",
    viewportWidth: Number(win.innerWidth) || 0,
    network: String(win.navigator?.connection?.effectiveType || "unknown"),
    saveData: Boolean(win.navigator?.connection?.saveData),
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

  const receiveMetric = (metric) => {
    const name = metric?.name;
    const value = Number(metric?.value);
    if (!(name in TARGETS) || !Number.isFinite(value) || value < 0) return;
    metrics[name] = {
      value: roundMetric(name, value),
      unit: METRIC_UNITS[name],
      rating: metric.rating || fallbackRating(name, value),
      target: TARGETS[name],
      metricId: typeof metric.id === "string" ? metric.id : undefined,
      navigationType: typeof metric.navigationType === "string" ? metric.navigationType : undefined
    };
    publish();
  };

  // The library owns entry buffering, CLS session-window rules, INP interaction
  // grouping/outlier handling, BFCache, and supported soft-navigation metrics.
  for (const metricName of ["LCP", "INP", "CLS"]) {
    const measure = webVitals[`on${metricName}`];
    if (typeof measure === "function") measure(receiveMetric, { ...metricOptions });
  }

  const finalize = () => {
    if (reported) return;
    reported = true;
    const report = publish();
    if (!endpoint || typeof win.navigator?.sendBeacon !== "function") return;
    try {
      win.navigator.sendBeacon(endpoint, JSON.stringify(report));
    } catch {
      // Beacon failures are intentionally non-blocking for navigation.
    }
  };

  const resetView = () => {
    path = getPath(win);
    metrics = { CLS: { value: 0, unit: "score", rating: "good", target: TARGETS.CLS } };
    reported = false;
    publish();
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") finalize();
  };
  const onPageHide = () => finalize();
  const onPageShow = (event) => {
    if (event?.persisted) resetView();
  };
  const onBeforeSwap = () => {
    finalize();
    pendingSoftNavigation = true;
  };
  const onAfterSwap = () => {
    if (!pendingSoftNavigation) return;
    pendingSoftNavigation = false;
    resetView();
  };

  doc.addEventListener("visibilitychange", onVisibilityChange);
  doc.addEventListener("astro:before-swap", onBeforeSwap);
  doc.addEventListener("astro:after-swap", onAfterSwap);
  win.addEventListener("pagehide", onPageHide);
  win.addEventListener("pageshow", onPageShow);
  publish();

  const cleanup = () => {
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    doc.removeEventListener("astro:before-swap", onBeforeSwap);
    doc.removeEventListener("astro:after-swap", onAfterSwap);
    win.removeEventListener("pagehide", onPageHide);
    win.removeEventListener("pageshow", onPageShow);
    if (win.__yuimiWebVitalsCleanup === cleanup) win.__yuimiWebVitalsCleanup = null;
  };
  win.__yuimiWebVitalsCleanup = cleanup;
  return cleanup;
}

export const webVitalsTargets = TARGETS;

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

let navigationSequence = 0;
const createNavigationId = (win) => {
  const randomId = win.crypto?.randomUUID?.();
  if (typeof randomId === "string") return randomId;
  navigationSequence += 1;
  return `yuimi-${Date.now().toString(36)}-${navigationSequence}-${Math.random().toString(36).slice(2, 10)}`;
};

const metricPath = (metric, win) => {
  if (typeof metric?.navigationURL !== "string") return null;
  try {
    return new URL(metric.navigationURL, win.location?.href || "https://yuimi.invalid/").pathname || "/";
  } catch {
    return null;
  }
};

const metricTimestamp = (metric) => {
  const navigationStartTime = Number(metric?.navigationStartTime);
  if (metric?.navigationType === "soft-navigation" && Number.isFinite(navigationStartTime)) {
    return navigationStartTime;
  }
  const entryTimes = Array.isArray(metric?.entries)
    ? metric.entries.map((entry) => Number(entry?.startTime)).filter(Number.isFinite)
    : [];
  return entryTimes.length ? Math.max(...entryTimes) : null;
};

/**
 * Collect Core Web Vitals using Google's production-tested web-vitals
 * implementation. The endpoint is opt-in; without it, the latest snapshot
 * remains available at window.__yuimiWebVitals and via `yuimi:web-vitals`.
 * Every app view has a stable navigationId; metric IDs remain owned by the
 * first view that reports them, and later revisions update that same sample.
 */
export function installWebVitals({
  window: win = globalThis.window,
  document: doc = globalThis.document,
  endpoint = "",
  webVitals = { onCLS, onINP, onLCP }
} = {}) {
  if (!win || !doc) return () => {};
  if (typeof win.__yuimiWebVitalsCleanup === "function") return win.__yuimiWebVitalsCleanup;

  const views = [];
  const metricOwners = new Map();
  const browserNavigationOwners = new Map();
  const createView = () => {
    const view = {
      navigationId: createNavigationId(win),
      path: getPath(win),
      startedAt: Number(win.performance?.now?.()) || 0,
      endedAt: null,
      metrics: { CLS: { value: 0, unit: "score", rating: "good", target: TARGETS.CLS } },
      revision: 0,
      finalized: false
    };
    views.push(view);
    if (views.length > 32) views.shift();
    return view;
  };
  let currentView = createView();
  let pendingSoftNavigation = false;

  const remember = (map, key, value, limit = 256) => {
    if (key === null || key === undefined) return;
    map.set(key, value);
    if (map.size > limit) map.delete(map.keys().next().value);
  };

  const snapshotView = (view) => ({
    schema: "yuimi-web-vitals/v2",
    navigationId: view.navigationId,
    revision: view.revision,
    path: view.path,
    deviceClass: mobileVisit(win) ? "mobile" : "desktop",
    viewportWidth: Number(win.innerWidth) || 0,
    network: String(win.navigator?.connection?.effectiveType || "unknown"),
    saveData: Boolean(win.navigator?.connection?.saveData),
    sampledAt: new Date().toISOString(),
    metrics: { ...view.metrics }
  });

  const publish = () => {
    const current = snapshotView(currentView);
    win.__yuimiWebVitals = current;
    try {
      win.dispatchEvent(new win.CustomEvent("yuimi:web-vitals", { detail: current }));
    } catch {
      // A missing CustomEvent implementation must not affect page behavior.
    }
    return current;
  };

  const findViewAt = (timestamp) => {
    if (timestamp === null) return null;
    for (let index = views.length - 1; index >= 0; index -= 1) {
      const view = views[index];
      if (timestamp >= view.startedAt && (view.endedAt === null || timestamp <= view.endedAt)) return view;
    }
    return null;
  };

  const resolveView = (metric, name) => {
    const metricId = typeof metric.id === "string" ? metric.id : null;
    const metricKey = metricId ? `${name}:${metricId}` : null;
    if (metricKey && metricOwners.has(metricKey)) return metricOwners.get(metricKey);

    const browserNavigationId = metric.navigationType === "soft-navigation" && Number.isFinite(Number(metric.navigationId))
      ? Number(metric.navigationId)
      : null;
    if (browserNavigationId !== null && browserNavigationOwners.has(browserNavigationId)) {
      return browserNavigationOwners.get(browserNavigationId);
    }

    const reportedPath = metricPath(metric, win);
    let view = null;
    // Soft-navigation timestamps can precede Astro's after-swap callback.
    // Their navigation URL is the stronger route identity in that interval.
    if (metric.navigationType === "soft-navigation" && reportedPath) {
      const pathMatches = views.filter((candidate) => candidate.path === reportedPath);
      if (reportedPath === currentView.path) view = currentView;
      else if (pathMatches.length) view = pathMatches[pathMatches.length - 1];
    }
    if (!view) view = findViewAt(metricTimestamp(metric));
    if (!view && reportedPath) {
      const pathMatches = views.filter((candidate) => candidate.path === reportedPath);
      if (reportedPath === currentView.path) view = currentView;
      else if (pathMatches.length) view = pathMatches[pathMatches.length - 1];
    }
    if (!view) view = currentView;

    if (metricKey) remember(metricOwners, metricKey, view);
    if (browserNavigationId !== null) remember(browserNavigationOwners, browserNavigationId, view);
    return view;
  };

  const sendReport = (view) => {
    if (!endpoint || typeof win.navigator?.sendBeacon !== "function") return;
    try {
      win.navigator.sendBeacon(endpoint, JSON.stringify(snapshotView(view)));
    } catch {
      // Beacon failures are intentionally non-blocking for navigation.
    }
  };

  const receiveMetric = (metric) => {
    const name = metric?.name;
    const value = Number(metric?.value);
    if (!(name in TARGETS) || !Number.isFinite(value) || value < 0) return;

    const view = resolveView(metric, name);
    const nextMetric = {
      value: roundMetric(name, value),
      unit: METRIC_UNITS[name],
      rating: metric.rating || fallbackRating(name, value),
      target: TARGETS[name],
      metricId: typeof metric.id === "string" ? metric.id : undefined,
      navigationType: typeof metric.navigationType === "string" ? metric.navigationType : undefined,
      browserNavigationId: Number.isFinite(Number(metric.navigationId)) ? Number(metric.navigationId) : undefined,
      navigationStartTime: Number.isFinite(Number(metric.navigationStartTime)) ? Number(metric.navigationStartTime) : undefined
    };
    if (JSON.stringify(view.metrics[name]) === JSON.stringify(nextMetric)) return;

    view.metrics[name] = nextMetric;
    view.revision += 1;
    if (view === currentView) publish();
    if (view.finalized) sendReport(view);
  };

  // The library owns entry buffering, CLS session-window rules, INP interaction
  // grouping/outlier handling, BFCache, and supported soft-navigation metrics.
  for (const metricName of ["LCP", "INP", "CLS"]) {
    const measure = webVitals[`on${metricName}`];
    if (typeof measure === "function") measure(receiveMetric, { ...metricOptions });
  }

  const finalize = (view = currentView) => {
    if (view.finalized) return;
    view.finalized = true;
    view.endedAt ??= Number(win.performance?.now?.()) || view.startedAt;
    view.revision += 1;
    if (view === currentView) publish();
    sendReport(view);
  };

  const resetView = () => {
    currentView.endedAt ??= Number(win.performance?.now?.()) || currentView.startedAt;
    currentView = createView();
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
    finalize(currentView);
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

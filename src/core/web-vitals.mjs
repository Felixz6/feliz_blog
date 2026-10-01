import { onCLS, onINP, onLCP } from "web-vitals";

const TARGETS = Object.freeze({ LCP: 2500, INP: 200, CLS: 0.1 });
const METRIC_UNITS = Object.freeze({ LCP: "ms", INP: "ms", CLS: "score" });
const DOCUMENT_TYPES = new Set(["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore"]);
const nonNegativeNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const roundMetric = (name, value) => name === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value);
const fallbackRating = (name, value) => {
  if (name === "LCP") return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
  if (name === "INP") return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
  return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
};
const mobileVisit = (win) => win.matchMedia?.("(pointer: coarse)").matches || Number(win.innerWidth) <= 820;
const getPath = (win) => String(win.location?.pathname || "/").split(/[?#]/, 1)[0] || "/";
let navigationSequence = 0;
const createNavigationId = (win) => {
  const randomId = win.crypto?.randomUUID?.();
  if (typeof randomId === "string") return randomId;
  return `yuimi-${Date.now().toString(36)}-${++navigationSequence}-${Math.random().toString(36).slice(2, 10)}`;
};
const metricPath = (metric, win) => {
  if (typeof metric?.navigationURL !== "string") return null;
  try { return new URL(metric.navigationURL, win.location?.href || "https://yuimi.invalid/").pathname || "/"; }
  catch { return null; }
};

/** A sample belongs to a document lifetime or a browser-confirmed soft navigation,
 * never to an Astro swap or the time of a late interaction entry. */
export function installWebVitals({ window: win = globalThis.window, document: doc = globalThis.document,
  endpoint = "", webVitals = { onCLS, onINP, onLCP } } = {}) {
  if (!win || !doc) return () => {};
  if (typeof win.__yuimiWebVitalsCleanup === "function") return win.__yuimiWebVitalsCleanup;

  const now = () => nonNegativeNumber(win.performance?.now?.()) ? win.performance.now() : 0;
  const timeOrigin = nonNegativeNumber(win.performance?.timeOrigin) ? win.performance.timeOrigin : Date.now() - now();
  const documentId = createNavigationId(win);
  const softNavigationSupported = Boolean(win.PerformanceObserver?.supportedEntryTypes?.includes("soft-navigation")
    && typeof win.PerformanceSoftNavigation?.prototype?.getLargestInteractionContentfulPaint === "function");
  const views = new Set();
  const documentViews = new Map();
  const softViews = new Map();
  const metricOwners = new Map();
  const createView = (path, measurementScope, navigationStartTime, browserNavigationId) => {
    const view = {
      navigationId: createNavigationId(win), documentId, path, measurementScope,
      navigationStartTime, browserNavigationId,
      navigationStartedAt: new Date(timeOrigin + navigationStartTime).toISOString(),
      deviceClass: mobileVisit(win) ? "mobile" : "desktop", viewportWidth: Number(win.innerWidth) || 0,
      network: String(win.navigator?.connection?.effectiveType || "unknown"),
      saveData: Boolean(win.navigator?.connection?.saveData),
      metrics: {}, revision: 0, finalized: false
    };
    views.add(view);
    return view;
  };
  let currentView = createView(getPath(win), "document", 0);
  documentViews.set(0, currentView);

  const snapshotView = (view) => ({
    schema: "yuimi-web-vitals/v2", navigationId: view.navigationId, documentId: view.documentId,
    revision: view.revision, path: view.path, measurementScope: view.measurementScope,
    navigationStartedAt: view.navigationStartedAt, navigationStartTime: view.navigationStartTime,
    browserNavigationId: view.browserNavigationId, softNavigationSupported,
    deviceClass: view.deviceClass, viewportWidth: view.viewportWidth, network: view.network, saveData: view.saveData,
    sampledAt: new Date().toISOString(), metrics: { ...view.metrics }
  });
  const publish = (view = currentView) => {
    const snapshot = snapshotView(view);
    if (view === currentView) win.__yuimiWebVitals = snapshot;
    try { win.dispatchEvent(new win.CustomEvent("yuimi:web-vitals", { detail: snapshot })); }
    catch { /* Measurement must not affect page behavior. */ }
    return snapshot;
  };
  const sendReport = (view) => {
    if (!endpoint || typeof win.navigator?.sendBeacon !== "function") return;
    try { win.navigator.sendBeacon(endpoint, JSON.stringify(snapshotView(view))); }
    catch { /* Beacon failures remain non-blocking. */ }
  };
  const finalize = (view) => {
    if (view.finalized) return;
    view.finalized = true; view.revision += 1;
    publish(view); sendReport(view);
  };
  const activate = (view) => {
    if (view.navigationStartTime >= currentView.navigationStartTime) {
      finalize(currentView); currentView = view;
    } else {
      // A first callback for an older navigation can itself arrive late.
      view.finalized = true;
    }
  };
  const getDocumentView = (start, path = getPath(win)) => {
    let view = documentViews.get(start);
    if (!view) { view = createView(path, "document", start); documentViews.set(start, view); activate(view); }
    return view;
  };
  const resolveView = (metric, scope) => {
    let view;
    if (scope === "document") {
      // Non-BFCache metrics belong to the original document even when the first
      // callback or its entries occur after one or many framework navigations.
      const start = metric.navigationType === "back-forward-cache" ? metric.navigationStartTime : 0;
      if (!nonNegativeNumber(start)) return null;
      view = getDocumentView(start);
    } else {
      const path = metricPath(metric, win);
      const start = metric.navigationStartTime;
      const browserId = metric.navigationId;
      if (!path || !nonNegativeNumber(start) || !Number.isInteger(browserId) || browserId < 0) return null;
      const key = `${browserId}:${start}`;
      view = softViews.get(key);
      if (view && view.path !== path) return null;
      if (!view) { view = createView(path, scope, start, browserId); softViews.set(key, view); activate(view); }
    }
    const metricKey = `${metric.name}:${metric.id}`;
    const owner = metricOwners.get(metricKey);
    if (owner && owner !== view) return null;
    metricOwners.set(metricKey, view);
    return view;
  };
  const receiveMetric = (metric, scope) => {
    const name = metric?.name;
    const value = metric?.value;
    if (!Object.hasOwn(TARGETS, name) || !nonNegativeNumber(value) || typeof metric.id !== "string" || !metric.id) return;
    if (scope === "document" ? !DOCUMENT_TYPES.has(metric.navigationType) : metric.navigationType !== "soft-navigation") return;
    const view = resolveView(metric, scope);
    if (!view) return;
    if (scope === "document" && view.browserNavigationId === undefined && nonNegativeNumber(metric.navigationId)) {
      view.browserNavigationId = metric.navigationId;
    }
    const nextMetric = {
      value: roundMetric(name, value), unit: METRIC_UNITS[name], rating: metric.rating || fallbackRating(name, value),
      target: TARGETS[name], metricId: metric.id, navigationType: metric.navigationType,
      navigationPath: view.path, reportedNavigationPath: metricPath(metric, win) ?? undefined,
      browserNavigationId: nonNegativeNumber(metric.navigationId) ? metric.navigationId : undefined,
      navigationStartTime: view.navigationStartTime
    };
    if (JSON.stringify(view.metrics[name]) === JSON.stringify(nextMetric)) return;
    view.metrics[name] = nextMetric; view.revision += 1;
    publish(view);
    if (doc.visibilityState === "hidden" && !view.finalized) finalize(view);
    else if (view.finalized) sendReport(view);
  };

  // Opting into soft navigation finalizes initial hard-navigation metrics early;
  // separate observers preserve actual document-lifetime metrics as well.
  for (const name of ["LCP", "INP", "CLS"]) {
    const measure = webVitals[`on${name}`];
    if (typeof measure !== "function") continue;
    measure((metric) => receiveMetric(metric, "document"), { reportAllChanges: true, reportSoftNavs: false });
    if (softNavigationSupported) {
      measure((metric) => receiveMetric(metric, "soft-navigation"), { reportAllChanges: true, reportSoftNavs: true });
    }
  }
  const finalizeAll = () => { for (const view of views) finalize(view); };
  const onVisibilityChange = () => { if (doc.visibilityState === "hidden") finalizeAll(); };
  const onPageShow = (event) => {
    if (!event?.persisted) return;
    const start = nonNegativeNumber(event.timeStamp) ? event.timeStamp : now();
    currentView = getDocumentView(start); publish();
  };
  const onBeforeSwap = () => finalize(currentView);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  doc.addEventListener("astro:before-swap", onBeforeSwap);
  win.addEventListener("pagehide", finalizeAll);
  win.addEventListener("pageshow", onPageShow);
  publish();
  const cleanup = () => {
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    doc.removeEventListener("astro:before-swap", onBeforeSwap);
    win.removeEventListener("pagehide", finalizeAll);
    win.removeEventListener("pageshow", onPageShow);
    if (win.__yuimiWebVitalsCleanup === cleanup) win.__yuimiWebVitalsCleanup = null;
  };
  win.__yuimiWebVitalsCleanup = cleanup;
  return cleanup;
}

export const webVitalsTargets = TARGETS;

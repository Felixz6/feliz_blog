import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installWebVitals, webVitalsTargets } from "../src/core/web-vitals.mjs";
import { evaluateMobileReports } from "../scripts/check-vitals-report.mjs";

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function createHarness(endpoint = "/rum") {
  const observers: any[] = [];
  const listeners = new Map<string, Set<(event?: any) => void>>();
  const sent: Array<{ endpoint: string; body: string }> = [];
  class FakeObserver {
    callback: (list: any) => void;
    type = "";
    disconnected = false;
    constructor(callback: (list: any) => void) { this.callback = callback; observers.push(this); }
    observe(options: any) { this.type = options.type; }
    disconnect() { this.disconnected = true; }
    takeRecords() { return []; }
  }
  const win: any = {
    PerformanceObserver: FakeObserver,
    CustomEvent: class { type: string; detail: any; constructor(type: string, init: any) { this.type = type; this.detail = init.detail; } },
    location: { pathname: "/blog/example/", search: "?q=private", hash: "#chapter" },
    innerWidth: 390,
    performance: { now: () => win.clockNow || 0 },
    navigator: { connection: { effectiveType: "4g", saveData: false }, sendBeacon: (url: string, body: string) => { sent.push({ endpoint: url, body }); return true; } },
    matchMedia: () => ({ matches: true }),
    dispatchEvent: (event: any) => { win.lastEvent = event; return true; },
    addEventListener: (name: string, listener: (event?: any) => void) => { const set = listeners.get(name) || new Set(); set.add(listener); listeners.set(name, set); },
    removeEventListener: (name: string, listener: (event?: any) => void) => listeners.get(name)?.delete(listener)
  };
  const doc: any = {
    visibilityState: "visible",
    documentElement: { dataset: { yuimiPerformance: "mobile" } },
    addEventListener: win.addEventListener,
    removeEventListener: win.removeEventListener
  };
  const notify = (type: string, entries: any[]) => {
    observers.find((observer) => observer.type === type)?.callback({ getEntries: () => entries });
  };
  const hide = () => {
    doc.visibilityState = "hidden";
    for (const listener of listeners.get("visibilitychange") || []) listener();
  };
  const cleanup = installWebVitals({ window: win, document: doc, endpoint });
  const dispatchDocument = (name: string) => { for (const listener of listeners.get(name) || []) listener(); };
  return { win, doc, observers, sent, notify, hide, cleanup, dispatchDocument };
}

test("collects LCP, session-window CLS, and grouped interaction latency for a mobile route", () => {
  const h = createHarness();
  h.notify("largest-contentful-paint", [{ startTime: 1890 }, { startTime: 2470 }]);
  h.notify("layout-shift", [
    { startTime: 0, value: 0.02, hadRecentInput: false },
    { startTime: 500, value: 0.03, hadRecentInput: false },
    { startTime: 900, value: 0.5, hadRecentInput: true },
    { startTime: 2200, value: 0.04, hadRecentInput: false }
  ]);
  h.notify("event", [
    { interactionId: 1, duration: 82 },
    { interactionId: 1, duration: 96 },
    { interactionId: 2, duration: 141 },
    { interactionId: 0, duration: 900 }
  ]);
  h.hide();

  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].endpoint, "/rum");
  const report = JSON.parse(h.sent[0].body);
  assert.equal(report.path, "/blog/example/");
  assert.equal(report.deviceClass, "mobile");
  assert.deepEqual(Object.keys(report.metrics).sort(), ["CLS", "INP", "LCP"]);
  assert.deepEqual([report.metrics.LCP.value, report.metrics.INP.value, report.metrics.CLS.value], [2470, 141, 0.05]);
  assert.equal(report.metrics.LCP.rating, "good");
  assert.equal(h.win.__yuimiWebVitals.path, "/blog/example/");
  h.cleanup();
  assert.ok(h.observers.every((observer) => observer.disconnected));
});

test("keeps local snapshots when no endpoint is configured and emits no beacon", () => {
  const h = createHarness("");
  h.hide();
  assert.equal(h.sent.length, 0);
  assert.equal(h.win.__yuimiWebVitals.metrics.CLS.value, 0);
  h.cleanup();
});

test("finishes and resets a Core Web Vitals sample across Astro soft navigations", () => {
  const h = createHarness();
  h.notify("largest-contentful-paint", [{ startTime: 1800 }]);
  h.dispatchDocument("astro:before-swap");
  h.win.location.pathname = "/projects/";
  h.win.clockNow = 2200;
  h.dispatchDocument("astro:after-swap");
  h.notify("largest-contentful-paint", [{ startTime: 1800 }, { startTime: 3100 }]);
  h.notify("event", [{ interactionId: 3, duration: 176, startTime: 2400 }]);
  h.dispatchDocument("pagehide");

  assert.equal(h.sent.length, 2);
  assert.equal(JSON.parse(h.sent[0].body).path, "/blog/example/");
  const nextView = JSON.parse(h.sent[1].body);
  assert.equal(nextView.path, "/projects/");
  assert.deepEqual([nextView.metrics.LCP.value, nextView.metrics.INP.value, nextView.metrics.CLS.value], [3100, 176, 0]);
  h.cleanup();
});

test("evaluates nearest-rank mobile p75 by route and leaves sparse samples inconclusive", () => {
  const rows = [1, 2, 3, 4].map((value) => ({
    path: "/",
    deviceClass: "mobile",
    metrics: { LCP: value * 1000, INP: value * 80, CLS: value / 100 }
  }));
  rows.push({ path: "/desktop-only/", deviceClass: "desktop", metrics: { LCP: 1, INP: 1, CLS: 0 } } as any);
  const result = evaluateMobileReports(rows, { minimumSamples: 4 });
  assert.deepEqual(result.results.map(({ name, p75, status }) => [name, p75, status]), [
    ["CLS", 0.03, "PASS"], ["INP", 240, "FAIL"], ["LCP", 3000, "FAIL"]
  ]);
  assert.equal(webVitalsTargets.LCP, 2500);
  assert.equal(evaluateMobileReports(rows, { minimumSamples: 5 }).results[0].status, "INCONCLUSIVE");
});

test("the shared layout loads the opt-in RUM collector and package exposes the report checker", () => {
  const layout = source("src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const scripts = JSON.parse(source("package.json")).scripts;
  assert.match(layout, /installWebVitals\(\{ endpoint: import\.meta\.env\.PUBLIC_WEB_VITALS_ENDPOINT/);
  assert.equal(scripts["check:vitals-report"], "node scripts/check-vitals-report.mjs");
});

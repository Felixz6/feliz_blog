import assert from "node:assert/strict";
import test from "node:test";
import { installWebVitals } from "../src/core/web-vitals.mjs";
import { evaluateMobileReports } from "../scripts/check-vitals-report.mjs";

const origin = Date.parse("2026-09-28T00:00:00Z");
function harness(path = "/") {
  let now = 0;
  const listeners = new Map<string, Set<(event?: any) => void>>();
  const callbacks: Record<string, Record<string, (metric: any) => void>> = {};
  const sent: any[] = [];
  const events: any[] = [];
  const add = (name: string, cb: (event?: any) => void) => {
    const set = listeners.get(name) || new Set(); set.add(cb); listeners.set(name, set);
  };
  const win: any = {
    location: { pathname: path, href: `https://example.test${path}` }, innerWidth: 390,
    PerformanceObserver: { supportedEntryTypes: ["soft-navigation"] },
    PerformanceSoftNavigation: class { getLargestInteractionContentfulPaint() {} },
    performance: { now: () => now, timeOrigin: origin }, matchMedia: () => ({ matches: false }),
    navigator: { sendBeacon: (_: string, body: string) => { sent.push(JSON.parse(body)); return true; } },
    CustomEvent: class { detail: any; constructor(_: string, init: any) { this.detail = init.detail; } },
    dispatchEvent: (e: any) => { events.push(e.detail); return true; }, addEventListener: add,
    removeEventListener: (name: string, cb: (event?: any) => void) => listeners.get(name)?.delete(cb)
  };
  const doc: any = { visibilityState: "visible", addEventListener: add, removeEventListener: win.removeEventListener };
  const fire = (name: string, event?: any) => { for (const cb of listeners.get(name) || []) cb(event); };
  const register = (name: string) => (cb: any, opts?: any) => {
    (callbacks[name] ||= {})[opts?.reportSoftNavs ? "soft-navigation" : "document"] = cb;
  };
  const cleanup = installWebVitals({ window: win, document: doc, endpoint: "https://rum.invalid/collect",
    webVitals: { onLCP: register("LCP"), onINP: register("INP"), onCLS: register("CLS") } });
  const emit = (name: string, value: any, metadata: any = {}) => (callbacks[name][metadata.navigationType === "soft-navigation" ? "soft-navigation" : "document"] || callbacks[name].document || callbacks[name]["soft-navigation"])({
    name, value, id: `${name}-document`, navigationType: "navigate", navigationStartTime: 0,
    navigationURL: "https://example.test/", entries: [{ startTime: now }], ...metadata
  });
  const soft = (id: number, start: number, route: string, name = "LCP", value = 1000, metricId = `${name}-soft-${id}`) =>
    emit(name, value, { id: metricId, navigationType: "soft-navigation", navigationId: id,
      navigationStartTime: start, navigationURL: `https://example.test${route}` });
  const swap = (route: string, timestamp: number) => {
    now = timestamp; fire("astro:before-swap"); win.location.pathname = route; win.location.href = `https://example.test${route}`;
    now += 10; fire("astro:after-swap");
  };
  const hide = () => { doc.visibilityState = "hidden"; fire("visibilitychange"); };
  return { win, doc, sent, events, emit, soft, swap, hide, fire, cleanup, setNow: (v: number) => { now = v; } };
}

function report(id: string, scope = "document", start = "2026-09-28T00:00:00Z", path = "/", metrics: Record<string, number> = { LCP: 1000 }) {
  return { schema: "yuimi-web-vitals/v2", documentId: "document-fixture", navigationId: id, revision: 1,
    measurementScope: scope, navigationStartedAt: start, navigationStartTime: scope === "document" ? 0 : 100,
    browserNavigationId: scope === "document" ? 0 : 11, path, deviceClass: "mobile",
    sampledAt: "2026-10-03T00:00:00Z", metrics: Object.fromEntries(Object.entries(metrics).map(([name, value]) => [name,
      { value, metricId: `${name}-${id}`, navigationType: scope === "document" ? "navigate" : "soft-navigation",
        navigationPath: path, navigationStartTime: scope === "document" ? 0 : 100, browserNavigationId: scope === "document" ? 0 : 11 }])) };
}
const result = (rows: any[], name: string, scope = "document", path = "/") =>
  evaluateMobileReports(rows).results.find((r: any) => r.name === name && r.measurementScope === scope && r.path === path);

test("trust: no callback produces no metric observations", () => {
  const h = harness(); h.hide();
  assert.deepEqual(h.sent[0].metrics, {});
  assert.equal(result(h.sent, "CLS")?.count, 0);
  assert.equal(result(h.sent, "CLS")?.p75, null);
  h.cleanup();
});
test("trust: real zero counts but null, strings and non-finite callbacks do not", () => {
  const h = harness(); h.emit("CLS", 0);
  for (const value of [null, undefined, "0", NaN, Infinity, -1]) h.emit("INP", value);
  h.hide(); assert.equal(result(h.sent, "CLS")?.count, 1); assert.equal(result(h.sent, "CLS")?.p75, 0);
  assert.equal(result(h.sent, "INP")?.count, 0); h.cleanup();
});
test("trust: first late document INP stays on the initial document after Astro swaps", () => {
  const h = harness(); const originalId = h.win.__yuimiWebVitals.navigationId;
  h.swap("/blog/", 100); h.setNow(500); h.emit("INP", 280); h.hide();
  const row = h.sent.findLast((r: any) => r.metrics.INP);
  assert.equal(row.path, "/"); assert.equal(row.navigationId, originalId);
  assert.equal(row.measurementScope, "document"); assert.equal(row.metrics.INP.navigationPath, "/");
  assert.equal(row.navigationStartedAt, new Date(origin).toISOString()); h.cleanup();
});
test("trust: Astro-only swaps create no invented soft-navigation sample", () => {
  const h = harness(); h.emit("INP", 120); h.swap("/blog/", 100); h.swap("/projects/", 200); h.hide();
  assert.equal(evaluateMobileReports(h.sent).mobileVisits, 1);
  assert.ok(h.sent.every((r: any) => r.measurementScope === "document" && r.path === "/")); h.cleanup();
});
test("trust: repeated same-path soft navigations use browser identity, including first late metrics", () => {
  const h = harness(); h.swap("/blog/", 100); h.soft(11, 90, "/blog/");
  const firstId = h.win.__yuimiWebVitals.navigationId;
  h.swap("/blog/", 200); h.soft(12, 190, "/blog/", "LCP", 2000);
  const secondId = h.win.__yuimiWebVitals.navigationId;
  h.soft(11, 90, "/blog/", "INP", 310); h.hide();
  assert.notEqual(firstId, secondId);
  const first = h.sent.findLast((r: any) => r.browserNavigationId === 11);
  assert.equal(first.navigationId, firstId); assert.equal(first.metrics.INP.value, 310);
  assert.equal(h.win.__yuimiWebVitals.navigationId, secondId);
  assert.equal(result(h.sent, "LCP", "soft-navigation", "/blog/")?.count, 2); h.cleanup();
});
test("trust: soft callback before swap uses its navigation path and start, not the current URL", () => {
  const h = harness(); h.setNow(100); h.soft(11, 80, "/blog/?q=private#secret"); h.swap("/blog/", 110); h.hide();
  const row = h.sent.find((r: any) => r.measurementScope === "soft-navigation");
  assert.equal(row.path, "/blog/"); assert.equal(row.metrics.LCP.navigationPath, "/blog/");
  assert.equal(row.navigationStartedAt, new Date(origin + 80).toISOString());
  assert.ok(!JSON.stringify(row).includes("private")); h.cleanup();
});
test("trust: missing or conflicting soft identity is discarded rather than guessed", () => {
  const h = harness(); h.emit("LCP", 1000, { navigationType: "soft-navigation", id: "missing-identity" });
  h.soft(11, 100, "/blog/"); h.soft(11, 100, "/projects/", "INP", 300); h.hide();
  const softRow = h.sent.find((r: any) => r.measurementScope === "soft-navigation");
  assert.equal(softRow.path, "/blog/"); assert.equal(softRow.metrics.INP, undefined);
  assert.equal(h.sent.find((r: any) => r.measurementScope === "document")?.metrics.LCP, undefined); h.cleanup();
});
test("trust: late revisions publish the original sample without replacing the active soft snapshot", () => {
  const h = harness(); h.swap("/blog/", 100); h.soft(11, 90, "/blog/");
  const activeId = h.win.__yuimiWebVitals.navigationId; h.emit("INP", 280);
  assert.equal(h.events.at(-1).path, "/"); assert.equal(h.events.at(-1).metrics.INP.value, 280);
  assert.equal(h.win.__yuimiWebVitals.navigationId, activeId); h.cleanup();
});
test("trust: BFCache restoration has a new sample; a delayed pre-restore metric retains its start", () => {
  const h = harness(); h.emit("INP", 100); h.hide(); const old = h.sent.at(-1);
  h.doc.visibilityState = "visible"; h.setNow(500); h.fire("pageshow", { persisted: true, timeStamp: 500 });
  h.emit("INP", 200, { id: "INP-restored", navigationType: "back-forward-cache", navigationStartTime: 500 });
  h.emit("INP", 300); h.hide();
  const restored = h.sent.findLast((r: any) => r.metrics.INP?.metricId === "INP-restored");
  assert.notEqual(restored.navigationId, old.navigationId);
  assert.equal(restored.navigationStartedAt, new Date(origin + 500).toISOString());
  assert.equal(h.sent.findLast((r: any) => r.navigationId === old.navigationId).metrics.INP.value, 300); h.cleanup();
});
test("trust: arrival-time device changes do not change the original sample cohort", () => {
  const h = harness(); h.swap("/blog/", 100); h.win.innerWidth = 1400; h.emit("INP", 280);
  const row = h.sent.findLast((r: any) => r.metrics.INP); assert.equal(row.deviceClass, "mobile");
  assert.equal(row.viewportWidth, 390); h.cleanup();
});
test("trust: document and native soft metrics have separate route denominators and p75", () => {
  const rows = [...Array.from({ length: 20 }, (_, i) => report(`d${i}`, "document", undefined, "/", { LCP: 1000 })),
    ...Array.from({ length: 20 }, (_, i) => report(`s${i}`, "soft-navigation", undefined, "/", { LCP: 5000 }))];
  assert.equal(result(rows, "LCP")?.count, 20); assert.equal(result(rows, "LCP")?.p75, 1000);
  assert.equal(result(rows, "LCP", "soft-navigation")?.count, 20);
  assert.equal(result(rows, "LCP", "soft-navigation")?.status, "INCONCLUSIVE");
});
test("trust: deduplicate before the start-time window so late revisions update visits inside it", () => {
  const old = report("late", "document", "2026-09-28T00:00:00Z");
  const latest = { ...old, revision: 3, metrics: report("late", "document", undefined, "/", { LCP: 5000 }).metrics };
  const rows = evaluateMobileReports([latest, old, { ...old, revision: 2 }, latest], {
    windowStart: "2026-09-28T00:00:00Z", windowEnd: "2026-09-29T00:00:00Z"
  });
  assert.equal(rows.mobileVisits, 1); assert.equal(rows.results.find((r: any) => r.name === "LCP")?.p75, 5000);
});
test("trust: window start is inclusive, end exclusive; arrival time is not a substitute", () => {
  const rows = [report("before", "document", "2026-09-27T23:59:59.999Z"),
    report("start", "document", "2026-09-28T00:00:00Z"), report("inside", "document", "2026-09-28T23:59:59.999Z"),
    report("end", "document", "2026-09-29T00:00:00Z")];
  const evaluated = evaluateMobileReports(rows, { windowStart: "2026-09-28T00:00:00Z", windowEnd: "2026-09-29T00:00:00Z" });
  assert.equal(evaluated.mobileVisits, 2); assert.equal(evaluated.results.find((r: any) => r.name === "LCP")?.count, 2);
});
test("trust: pre-fix records, placeholder zeros and unknown metric scope are not counted", () => {
  const noStart: any = report("no-start"); delete noStart.navigationStartedAt;
  const placeholder: any = report("placeholder", "document", undefined, "/", {});
  placeholder.metrics.CLS = { value: 0 };
  const mismatch: any = report("mismatch"); mismatch.metrics.LCP.navigationType = "soft-navigation";
  const evaluated = evaluateMobileReports([noStart, placeholder, mismatch,
    { path: "/", deviceClass: "mobile", metrics: { CLS: 0 } }]);
  assert.ok(evaluated.results.every((r: any) => r.count === 0 && r.p75 === null));
});
test("trust: navigation identity conflicts and equal-revision content conflicts are quarantined", () => {
  const row = report("conflict");
  assert.equal(evaluateMobileReports([row, { ...row, revision: 2, path: "/blog/" }]).mobileVisits, 0);
  const conflicting = { ...row, metrics: report("conflict", "document", undefined, "/", { LCP: 3000 }).metrics };
  assert.equal(evaluateMobileReports([row, conflicting]).mobileVisits, 0);
});
test("trust: invalid or ambiguous date windows fail explicitly", () => {
  assert.throws(() => evaluateMobileReports([], { windowStart: "bad" }), /window/i);
  assert.throws(() => evaluateMobileReports([], { windowStart: "2026-10-01T00:00:00Z", windowEnd: "2026-09-01T00:00:00Z" }), /window/i);
  assert.throws(() => evaluateMobileReports([], { windowStart: "2026-10-01" }), /window/i);
});

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installWebVitals, webVitalsTargets } from "../src/core/web-vitals.mjs";
import { evaluateMobileReports } from "../scripts/check-vitals-report.mjs";

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function createHarness(endpoint = "", deliver?: (url: string, body: string) => Promise<any>, path = "/blog/example/") {
  const listeners = new Map<string, Set<(event?: any) => void>>();
  const callbacks: Record<string, (metric: any) => void> = {};
  const registrations: Array<{ name: string; options: any }> = [];
  const sent: Array<{ endpoint: string; body: string }> = [];
  const pendingDeliveries: Promise<any>[] = [];
  const recordListener = (name: string, listener: (event?: any) => void) => {
    const set = listeners.get(name) || new Set();
    set.add(listener);
    listeners.set(name, set);
  };
  const win: any = {
    CustomEvent: class { type: string; detail: any; constructor(type: string, init: any) { this.type = type; this.detail = init.detail; } },
    location: { pathname: path, search: "?q=private", hash: "#chapter" },
    innerWidth: 390,
    navigator: { connection: { effectiveType: "4g", saveData: false }, sendBeacon: (url: string, body: string) => {
      sent.push({ endpoint: url, body });
      if (deliver) pendingDeliveries.push(deliver(url, body));
      return true;
    } },
    matchMedia: () => ({ matches: true }),
    dispatchEvent: (event: any) => { win.lastEvent = event; return true; },
    addEventListener: recordListener,
    removeEventListener: (name: string, listener: (event?: any) => void) => listeners.get(name)?.delete(listener)
  };
  const doc: any = {
    visibilityState: "visible",
    addEventListener: recordListener,
    removeEventListener: win.removeEventListener
  };
  const webVitals = Object.fromEntries(["LCP", "INP", "CLS"].map((name) => [`on${name}`, (callback: (metric: any) => void, options: any) => {
    callbacks[name] = callback;
    registrations.push({ name, options });
  }]));
  const emit = (name: string, value: number, rating?: string, metadata: Record<string, any> = {}) => callbacks[name]?.({
    name, value, rating: rating || "good", id: `${name.toLowerCase()}-sample-id`, navigationType: "navigate", ...metadata
  });
  const fire = (name: string, target: Map<string, Set<(event?: any) => void>> = listeners) => {
    for (const listener of target.get(name) || []) listener();
  };
  const hide = () => { doc.visibilityState = "hidden"; fire("visibilitychange"); };
  const cleanup = installWebVitals({ window: win, document: doc, endpoint, webVitals });
  return { win, doc, callbacks, registrations, sent, pendingDeliveries, emit, hide, fire, cleanup };
}

test("registers official web-vitals callbacks and publishes mobile metric snapshots", () => {
  const h = createHarness();
  assert.deepEqual(h.registrations.map(({ name }) => name), ["LCP", "INP", "CLS"]);
  assert.ok(h.registrations.every(({ options }) => options.reportAllChanges === true && options.reportSoftNavs === true));

  h.emit("LCP", 2471);
  h.emit("INP", 176);
  h.emit("CLS", 0.04326);
  const snapshot = h.win.__yuimiWebVitals;
  assert.equal(snapshot.path, "/blog/example/");
  assert.equal(snapshot.deviceClass, "mobile");
  assert.deepEqual([snapshot.metrics.LCP.value, snapshot.metrics.INP.value, snapshot.metrics.CLS.value], [2471, 176, 0.0433]);
  assert.equal(snapshot.metrics.LCP.metricId, "lcp-sample-id");
  assert.equal(snapshot.metrics.LCP.navigationType, "navigate");
  assert.equal(h.win.lastEvent.type, "yuimi:web-vitals");
  h.cleanup();
});

test("keeps local snapshots and emits no request when the endpoint is empty", () => {
  const h = createHarness("");
  h.emit("LCP", 1890);
  h.hide();
  assert.equal(h.sent.length, 0);
  assert.equal(h.win.__yuimiWebVitals.metrics.LCP.value, 1890);
  assert.equal(h.win.__yuimiWebVitals.metrics.CLS.value, 0);
  h.cleanup();
});

test("sends later hidden-view metric revisions once with the original navigation identity", () => {
  const h = createHarness("https://rum.invalid/collect");
  h.emit("LCP", 1800);
  h.hide();
  const first = JSON.parse(h.sent[0].body);

  h.emit("LCP", 2200);
  h.emit("LCP", 2200);
  assert.equal(h.sent.length, 2);
  const updated = JSON.parse(h.sent[1].body);
  assert.equal(updated.navigationId, first.navigationId);
  assert.ok(updated.revision > first.revision);
  assert.equal(updated.metrics.LCP.value, 2200);
  const evaluated = evaluateMobileReports([first, updated], { minimumSamples: 1 });
  assert.equal(evaluated.mobileVisits, 1);
  assert.deepEqual(evaluated.results.find(({ name }) => name === "LCP"), {
    path: "/blog/example/", name: "LCP", count: 1, p75: 2200, target: 2500, status: "PASS"
  });
  h.cleanup();
});

test("finalizes and resets route attribution across Astro soft navigations", () => {
  const h = createHarness("https://rum.invalid/collect");
  h.emit("LCP", 1800, undefined, { id: "lcp-old" });
  h.fire("astro:before-swap");
  h.win.location.pathname = "/projects/";
  h.fire("astro:after-swap");
  h.emit("LCP", 3100, undefined, {
    id: "lcp-new", navigationType: "soft-navigation", navigationId: 22,
    navigationURL: "https://example.test/projects/", navigationStartTime: 1
  });
  // The old navigation's final LCP callback arrives after Astro activated the
  // next route; metric identity must keep it on the original page view.
  h.emit("LCP", 2400, undefined, {
    id: "lcp-old", navigationType: "soft-navigation", navigationId: 21,
    navigationURL: "https://example.test/blog/example/", navigationStartTime: 0
  });
  h.emit("INP", 176, undefined, {
    id: "inp-new", navigationType: "soft-navigation", navigationId: 22,
    navigationURL: "https://example.test/projects/", navigationStartTime: 1
  });
  assert.equal(h.win.__yuimiWebVitals.path, "/projects/");
  assert.equal(h.win.__yuimiWebVitals.metrics.LCP.value, 3100);
  h.fire("pagehide");

  assert.equal(h.sent.length, 3);
  assert.equal(JSON.parse(h.sent[0].body).path, "/blog/example/");
  const lateOldView = JSON.parse(h.sent[1].body);
  assert.equal(lateOldView.path, "/blog/example/");
  assert.equal(lateOldView.metrics.LCP.value, 2400);
  assert.equal(lateOldView.navigationId, JSON.parse(h.sent[0].body).navigationId);
  const nextView = JSON.parse(h.sent[2].body);
  assert.equal(nextView.path, "/projects/");
  assert.deepEqual([nextView.metrics.LCP.value, nextView.metrics.INP.value, nextView.metrics.CLS.value], [3100, 176, 0]);
  h.cleanup();
});

test("delivers mobile reports to an HTTP receiver and computes route-level p75", {
  skip: process.env.VITALS_HTTP_E2E !== "1" && "set VITALS_HTTP_E2E=1 to bind the temporary loopback receiver"
}, async () => {
  const received: any[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.method, "POST");
      assert.match(request.headers["content-type"] || "", /^text\/plain/);
      received.push(JSON.parse(body));
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/rum`;
  const tempDirectory = mkdtempSync(join(tmpdir(), "yuimi-vitals-e2e-"));
  try {
    const visits = [
      { path: "/", values: [2200, 180, 0.04] },
      { path: "/slow/", values: [2800, 240, 0.12] }
    ];
    const harnesses = visits.map(({ path, values }) => {
      const h = createHarness(endpoint, (url, body) => fetch(url, {
        method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" }, body
      }), path);
      h.emit("LCP", values[0]);
      h.emit("INP", values[1]);
      h.emit("CLS", values[2]);
      h.hide();
      return h;
    });
    const responses = await Promise.all(harnesses.flatMap((h) => h.pendingDeliveries));
    assert.deepEqual(responses.map((response) => response.status), [204, 204]);
    assert.equal(received.length, 2);
    assert.deepEqual(received.map((report) => report.path).sort(), ["/", "/slow/"]);
    assert.ok(received.every((report) => report.deviceClass === "mobile" && report.schema === "yuimi-web-vitals/v2"));

    const reportFile = join(tempDirectory, "reports.json");
    writeFileSync(reportFile, JSON.stringify(received));
    const cli = spawnSync(process.execPath, ["scripts/check-vitals-report.mjs", reportFile, "--min-samples=1"], { encoding: "utf8" });
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stdout, /PASS \/ LCP: p75 2200 ms \/ 2500 ms \(n=1\)/);
    assert.match(cli.stdout, /PASS \/ INP: p75 180 ms \/ 200 ms \(n=1\)/);
    assert.match(cli.stdout, /PASS \/ CLS: p75 0\.040 \/ 0\.1 \(n=1\)/);
    assert.match(cli.stdout, /FAIL \/slow\/ LCP: p75 2800 ms \/ 2500 ms \(n=1\)/);
    assert.match(cli.stdout, /FAIL \/slow\/ INP: p75 240 ms \/ 200 ms \(n=1\)/);
    assert.match(cli.stdout, /FAIL \/slow\/ CLS: p75 0\.120 \/ 0\.1 \(n=1\)/);

    const rows = evaluateMobileReports(received, { minimumSamples: 1 }).results;
    assert.deepEqual(rows.map(({ path, name, status }) => [path, name, status]), [
      ["/", "CLS", "PASS"], ["/", "INP", "PASS"], ["/", "LCP", "PASS"],
      ["/slow/", "CLS", "FAIL"], ["/slow/", "INP", "FAIL"], ["/slow/", "LCP", "FAIL"]
    ]);
    harnesses.forEach((h) => h.cleanup());
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempDirectory, { recursive: true, force: true });
  }
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

test("uses only the highest revision for each navigation when calculating p75", () => {
  const reports = [
    { navigationId: "visit-1", revision: 1, path: "/", deviceClass: "mobile", metrics: { LCP: 1000 } },
    { navigationId: "visit-1", revision: 3, path: "/", deviceClass: "mobile", metrics: { LCP: 5000 } },
    { navigationId: "visit-1", revision: 2, path: "/", deviceClass: "mobile", metrics: { LCP: 2000 } },
    { navigationId: "visit-2", revision: 1, path: "/", deviceClass: "mobile", metrics: { LCP: 2400 } }
  ];
  const evaluated = evaluateMobileReports(reports, { minimumSamples: 2 });
  assert.equal(evaluated.mobileVisits, 2);
  assert.deepEqual(evaluated.results.map(({ name, count, p75, status }) => [name, count, p75, status]), [
    ["LCP", 2, 5000, "FAIL"]
  ]);
});

test("the shared layout loads the opt-in RUM collector and exposes the report checker", () => {
  const layout = source("src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const runtime = source("src/themes/fuyukawa-kagari/lib/layout-runtime.mjs");
  const packageJson = JSON.parse(source("package.json"));
  assert.match(layout, /installLayoutRuntime\(\{ endpoint: import\.meta\.env\.PUBLIC_WEB_VITALS_ENDPOINT/);
  assert.match(runtime, /installWebVitals\(\{ endpoint \}\)/);
  assert.equal(packageJson.scripts["check:vitals-report"], "node scripts/check-vitals-report.mjs");
  assert.equal(packageJson.dependencies["web-vitals"], "^6.2.2");
});

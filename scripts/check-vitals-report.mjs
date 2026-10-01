import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const targets = Object.freeze({ LCP: 2500, INP: 200, CLS: 0.1 });
const documentTypes = new Set(["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore"]);
const nonNegativeNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const instant = (value) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const percentile75 = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.75) - 1];
};
const trustedReport = (row) => row?.schema === "yuimi-web-vitals/v2"
  && typeof row.navigationId === "string" && row.navigationId.length > 0
  && typeof row.documentId === "string" && row.documentId.length > 0
  && Number.isInteger(row.revision) && row.revision >= 0
  && ["document", "soft-navigation"].includes(row.measurementScope)
  && Number.isFinite(instant(row.navigationStartedAt)) && nonNegativeNumber(row.navigationStartTime)
  && typeof row.path === "string" && row.path.startsWith("/") && !/[?#\0]/.test(row.path)
  && row.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics)
  && (row.measurementScope !== "soft-navigation" || (Number.isInteger(row.browserNavigationId) && row.browserNavigationId >= 0));
const identity = (row) => JSON.stringify([row.documentId, row.path, row.measurementScope,
  instant(row.navigationStartedAt), row.navigationStartTime,
  row.measurementScope === "soft-navigation" ? row.browserNavigationId : null]);
const contents = (row) => JSON.stringify([row.deviceClass, row.viewportWidth, row.network, row.saveData,
  Object.keys(targets).map((name) => {
    const metric = row.metrics[name];
    return [name, metric?.value, metric?.metricId, metric?.navigationType,
      metric?.navigationPath, metric?.navigationStartTime, metric?.browserNavigationId];
  })]);
const trustedMetric = (metric, row) => metric && typeof metric === "object" && nonNegativeNumber(metric.value)
  && typeof metric.metricId === "string" && metric.metricId.length > 0
  && metric.navigationPath === row.path && metric.navigationStartTime === row.navigationStartTime
  && (row.measurementScope === "document" ? documentTypes.has(metric.navigationType)
    : metric.navigationType === "soft-navigation" && metric.browserNavigationId === row.browserNavigationId);

/** @param {any} input
 * @param {{ minimumSamples?: number, windowStart?: string, windowEnd?: string }} [options] */
export function evaluateMobileReports(input, options = {}) {
  const { minimumSamples = 30, windowStart, windowEnd } = options;
  const reports = Array.isArray(input) ? input : input?.reports;
  if (!Array.isArray(reports)) throw new TypeError("Expected a JSON array or an object with a reports array.");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1) throw new RangeError("minimumSamples must be a positive integer.");
  const from = windowStart === undefined ? -Infinity : instant(windowStart);
  const to = windowEnd === undefined ? Infinity : instant(windowEnd);
  if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
    throw new RangeError("Invalid window: use timezone-qualified ISO dates with start < end.");
  }

  const latestByNavigation = new Map();
  const conflicts = new Set();
  const excluded = { untrustedRecords: 0, conflictingNavigations: 0, outsideWindow: 0, invalidMetrics: 0 };
  for (const row of reports) {
    if (!trustedReport(row)) {
      excluded.untrustedRecords += 1;
      // A malformed newer revision must not silently fall back to an older one.
      if (typeof row?.navigationId === "string" && row.navigationId) conflicts.add(row.navigationId);
      continue;
    }
    const previous = latestByNavigation.get(row.navigationId);
    if (previous && (identity(previous) !== identity(row)
      || (previous.revision === row.revision && contents(previous) !== contents(row)))) conflicts.add(row.navigationId);
    if (!previous || row.revision > previous.revision) latestByNavigation.set(row.navigationId, row);
  }
  excluded.conflictingNavigations = conflicts.size;
  const groups = new Map();
  let mobileVisits = 0;
  // Deduplicate before filtering: sampledAt is arrival time, not visit identity.
  for (const row of latestByNavigation.values()) {
    if (conflicts.has(row.navigationId) || row.deviceClass !== "mobile") continue;
    const started = instant(row.navigationStartedAt);
    if (started < from || started >= to) { excluded.outsideWindow += 1; continue; }
    mobileVisits += 1;
    for (const name of Object.keys(targets)) {
      const key = `${row.path}\0${row.measurementScope}\0${name}`;
      const values = groups.get(key) || [];
      const metric = row.metrics[name];
      if (trustedMetric(metric, row)) values.push(metric.value);
      else if (metric !== undefined) excluded.invalidMetrics += 1;
      groups.set(key, values);
    }
  }
  const results = [...groups.entries()].map(([key, values]) => {
    const [path, measurementScope, name] = key.split("\0");
    const p75 = percentile75(values);
    return { path, measurementScope, name, count: values.length, p75, target: targets[name],
      status: values.length < minimumSamples ? "INCONCLUSIVE" : p75 <= targets[name] ? "PASS" : "FAIL" };
  }).sort((a, b) => a.path.localeCompare(b.path) || a.measurementScope.localeCompare(b.measurementScope) || a.name.localeCompare(b.name));
  return { results, minimumSamples, mobileVisits, excluded };
}

async function main() {
  const [filename, ...flags] = process.argv.slice(2);
  if (!filename) {
    console.error("Usage: npm run check:vitals-report -- <web-vitals.json> [--min-samples=30] [--from=ISO] [--to=ISO]");
    process.exitCode = 2; return;
  }
  try {
    const options = {};
    const seen = new Set();
    for (const flag of flags) {
      const match = /^(--min-samples|--from|--to)=(.+)$/.exec(flag);
      if (!match || seen.has(match[1])) throw new Error(`Unknown or duplicate report flag: ${flag}`);
      seen.add(match[1]);
      const name = { "--min-samples": "minimumSamples", "--from": "windowStart", "--to": "windowEnd" }[match[1]];
      options[name] = match[1] === "--min-samples" ? Number(match[2]) : match[2];
    }
    const input = JSON.parse(await readFile(resolve(filename), "utf8"));
    const { results, minimumSamples, excluded } = evaluateMobileReports(input, options);
    console.log(`Excluded: untrusted records=${excluded.untrustedRecords}, conflicting navigations=${excluded.conflictingNavigations}, outside window=${excluded.outsideWindow}, invalid metrics=${excluded.invalidMetrics}`);
    if (!results.length) {
      console.error("No trusted mobile LCP/INP/CLS observations found."); process.exitCode = 2; return;
    }
    console.log(`Mobile field CWV p75 (nearest-rank; separate document/soft-navigation; minimum samples per route/metric: ${minimumSamples})`);
    let hasFailure = false;
    let inconclusive = false;
    for (const row of results) {
      const display = row.p75 === null ? "missing" : row.name === "CLS" ? row.p75.toFixed(3) : `${Math.round(row.p75)} ms`;
      const target = row.name === "CLS" ? String(row.target) : `${row.target} ms`;
      console.log(`${row.status} ${row.path} [${row.measurementScope}] ${row.name}: p75 ${display} / ${target} (n=${row.count})`);
      hasFailure ||= row.status === "FAIL"; inconclusive ||= row.status === "INCONCLUSIVE";
    }
    if (hasFailure) process.exitCode = 1;
    else if (inconclusive) process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

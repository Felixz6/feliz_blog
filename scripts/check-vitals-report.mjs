import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const targets = Object.freeze({ LCP: 2500, INP: 200, CLS: 0.1 });

const percentile75 = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)];
};

export function evaluateMobileReports(input, { minimumSamples = 30 } = {}) {
  const reports = Array.isArray(input) ? input : input?.reports;
  if (!Array.isArray(reports)) throw new TypeError("Expected a JSON array or an object with a reports array.");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1) throw new RangeError("minimumSamples must be a positive integer.");

  const groups = new Map();
  for (const report of reports) {
    if (report?.deviceClass !== "mobile" || !report.metrics || typeof report.metrics !== "object") continue;
    const path = typeof report.path === "string" && report.path.startsWith("/") ? report.path : "/";
    for (const name of Object.keys(targets)) {
      const candidate = report.metrics[name];
      const value = typeof candidate === "number" ? candidate : candidate?.value;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      const key = `${path}\0${name}`;
      const values = groups.get(key) || [];
      values.push(value);
      groups.set(key, values);
    }
  }

  const results = [...groups.entries()].map(([key, values]) => {
    const [path, name] = key.split("\0");
    const p75 = percentile75(values);
    return { path, name, count: values.length, p75, target: targets[name],
      status: values.length < minimumSamples ? "INCONCLUSIVE" : p75 <= targets[name] ? "PASS" : "FAIL" };
  }).sort((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name));

  return { results, minimumSamples, mobileVisits: reports.filter((row) => row?.deviceClass === "mobile").length };
}

async function main() {
  const [filename, minimumFlag] = process.argv.slice(2);
  if (!filename) {
    console.error("Usage: npm run check:vitals-report -- <web-vitals.json> [--min-samples=30]");
    process.exitCode = 2;
    return;
  }
  const minimumSamples = minimumFlag?.startsWith("--min-samples=")
    ? Number(minimumFlag.slice("--min-samples=".length))
    : 30;
  try {
    const input = JSON.parse(await readFile(resolve(filename), "utf8"));
    const { results, minimumSamples: min } = evaluateMobileReports(input, { minimumSamples });
    if (results.length === 0) {
      console.error("No valid mobile LCP/INP/CLS observations found.");
      process.exitCode = 2;
      return;
    }
    let hasFailure = false;
    let inconclusive = false;
    console.log(`Mobile field CWV p75 (nearest-rank; minimum samples per route/metric: ${min})`);
    for (const result of results) {
      const display = result.name === "CLS" ? result.p75.toFixed(3) : `${Math.round(result.p75)} ms`;
      const target = result.name === "CLS" ? String(result.target) : `${result.target} ms`;
      console.log(`${result.status} ${result.path} ${result.name}: p75 ${display} / ${target} (n=${result.count})`);
      hasFailure ||= result.status === "FAIL";
      inconclusive ||= result.status === "INCONCLUSIVE";
    }
    if (hasFailure) process.exitCode = 1;
    else if (inconclusive) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

import { readFile, stat } from "node:fs/promises";
import { excludedPublicMedia } from "./lib/media-publish-policy.mjs";

const distDir = new URL("../dist/", import.meta.url);
const astroDir = new URL("_astro/", distDir);
const failures = [];

const fileBudgets = [
  ["Fuyukawa Home HTML", "index.html", 100_000],
  ["Fuyukawa Blog HTML", "blog/index.html", 155_000],
  ["Fuyukawa Projects HTML", "projects/index.html", 198_000],
  ["Fuyukawa About HTML", "about/index.html", 149_000]
];

const stylesheetBudgets = [
  ["Fuyukawa Home CSS", "index.html", 112_000],
  ["Fuyukawa Blog CSS", "blog/index.html", 220_000],
  ["Fuyukawa Projects CSS", "projects/index.html", 255_000],
  ["Fuyukawa About CSS", "about/index.html", 260_000]
];

const formatBytes = (value) => `${(value / 1024).toFixed(1)} KiB`;

const recordBudget = (label, size, limit) => {
  const passed = size <= limit;
  console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${formatBytes(size)} / ${formatBytes(limit)}`);
  if (!passed) failures.push(`${label} exceeded its budget by ${formatBytes(size - limit)}`);
};

for (const [label, relativePath, limit] of fileBudgets) {
  try {
    const details = await stat(new URL(relativePath, distDir));
    recordBudget(label, details.size, limit);
  } catch {
    failures.push(`${label} is missing: dist/${relativePath}`);
  }
}

for (const [label, relativePath, limit] of stylesheetBudgets) {
  try {
    const html = await readFile(new URL(relativePath, distDir), "utf8");
    const stylesheetPaths = [...html.matchAll(/href="\/_astro\/([^"?]+\.css)(?:\?[^\"]*)?"/g)]
      .map((match) => match[1]);
    const uniquePaths = [...new Set(stylesheetPaths)];
    if (uniquePaths.length === 0) throw new Error("no stylesheets found");
    const sizes = await Promise.all(uniquePaths.map((name) => stat(new URL(name, astroDir))));
    recordBudget(label, sizes.reduce((total, details) => total + details.size, 0), limit);
  } catch (error) {
    failures.push(`${label} could not be measured: ${error.message}`);
  }
}

try {
  for (const relativePath of [
    "index.html",
    "blog/index.html",
    "about/index.html",
    "projects/index.html"
  ]) {
    const html = await readFile(new URL(relativePath, distDir), "utf8");
    if (!/<body\b[^>]*\bdata-fuyukawa(?:\s|=|>)/i.test(html)) {
      failures.push(`Primary route is not rendered with Fuyukawa Kagari: ${relativePath}`);
    }
    if (/yuimi-chaya\.github\.io|494350222|喝益胃|Yuimi-chaya|Yuimi Lab/i.test(html)) {
      failures.push(`Primary route exposes the previous site identity: ${relativePath}`);
    }
  }
} catch (error) {
  failures.push(`Primary route verification failed: ${error.message}`);
}

try {
  const covers = JSON.parse(await readFile(new URL("../src/core/content/responsive-covers.json", import.meta.url), "utf8"));
  let bytes = 0;
  let smallBytes = 0;
  let originalBytes = 0;
  for (const [source, cover] of Object.entries(covers)) {
    originalBytes += (await stat(new URL(source.slice(1), distDir))).size;
    smallBytes += cover.variants[0]?.bytes ?? 0;
    for (const variant of cover.variants) {
      const published = await stat(new URL(variant.src.slice(1), distDir));
      if (published.size !== variant.bytes) failures.push(`Responsive cover size mismatch: ${variant.src}`);
      bytes += published.size;
    }
  }
  recordBudget("Responsive cover derivatives", bytes, 6_500_000);
  recordBudget("Small covers versus originals", smallBytes, Math.floor(originalBytes * 0.4));
  for (const relative of excludedPublicMedia) {
    try {
      await stat(new URL(relative, distDir));
      failures.push(`Reviewed source media leaked into the build: ${relative}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
} catch (error) {
  failures.push(`Published media validation failed: ${error.message}`);
}

if (failures.length > 0) {
  console.error("\nPerformance budget violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nAll performance budgets passed.");
}

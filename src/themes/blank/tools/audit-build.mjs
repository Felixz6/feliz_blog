import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { parse } from "parse5";
import postcss from "postcss";

const dist = path.resolve("dist");
const theme = path.join(dist, "themes/blank");
const files = (await fs.readdir(theme, { recursive: true })).filter((file) => file.endsWith(".html"));
const totals = { pages: 0, articles: 0, articleImages: 0, staticPageImages: 0, links: 0, scripts: 0, icons: 0 };
const failures = [];
const resources = new Map();
const stats = {};
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map((attribute) => [attribute.name, attribute.value]));
const text = (node) => node.value ?? (node.childNodes ?? []).map(text).join("");
const resourceFile = (href) => {
  const url = new URL(href, "https://blank.invalid");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  return file;
};
async function checkResource(href, from) {
  const file = resourceFile(href);
  if (!resources.has(file)) resources.set(file, fs.access(file).then(() => true, () => false));
  if (!(await resources.get(file))) failures.push(`${from}: missing ${href}`);
}

for (const file of files) {
  const html = await fs.readFile(path.join(theme, file), "utf8");
  const doc = parse(html);
  const relative = file.replaceAll("\\", "/");
  const article = relative.startsWith("blog/") && relative !== "blog/index.html";
  const ids = new Set(), references = [], checks = [], localAnchors = [], styles = [];
  let h1 = 0, canonical, robots, bodyIsBlank = false, activeNav = 0, imageCount = 0;
  const bodyHeadings = [];
  const walk = (node, inProse = false, inNav = false) => {
    const a = attrs(node);
    const prose = inProse || Object.hasOwn(a, "data-blank-prose");
    const navigation = inNav || a.class === "blank-nav";
    if (a.id) {
      if (ids.has(a.id)) failures.push(`${file}: duplicate id ${a.id}`);
      ids.add(a.id);
    }
    if (a["aria-controls"]) references.push(...a["aria-controls"].split(/\s+/));
    if (node.tagName === "body") bodyIsBlank = Object.hasOwn(a, "data-blank");
    if (node.tagName === "h1") {
      if (prose) bodyHeadings.push(text(node).replace(/#$/, "").trim());
      else h1++;
    }
    if (node.tagName === "meta" && a.name === "robots") robots = a.content;
    if (node.tagName === "link" && a.rel === "canonical") canonical = a.href;
    if (navigation && a["aria-current"] === "page") activeNav++;
    if (node.tagName === "svg") totals.icons++;
    if (node.tagName === "use" && a.href?.startsWith("#")) references.push(a.href.slice(1));
    if (node.tagName === "img") {
      imageCount++;
      if (prose) totals.articleImages++;
      else totals.staticPageImages++;
      if (a.src?.startsWith("/")) checks.push(checkResource(a.src, file));
    }
    if (node.tagName === "a") {
      if (a.href?.startsWith("/themes/blank/")) {
        checks.push(checkResource(a.href, file));
        totals.links++;
      }
      if (a.href?.startsWith("#") && a.href.length > 1) localAnchors.push(decodeURIComponent(a.href.slice(1)));
      if (a.target === "_blank" && !a.rel?.includes("noreferrer")) failures.push(`${file}: external link without noreferrer`);
    }
    if (node.tagName === "link" && a.rel === "stylesheet") {
      styles.push(a.href);
      checks.push(checkResource(a.href, file));
    }
    if (node.tagName === "script") {
      if (a.src) {
        if (/^https?:/.test(a.src)) failures.push(`${file}: remote script ${a.src}`);
        else checks.push(checkResource(a.src, file));
      } else if (!a.type) {
        try { new vm.Script(text(node)); } catch (error) { failures.push(`${file}: ${error.message}`); }
      }
      totals.scripts++;
    }
    for (const child of node.childNodes ?? []) walk(child, prose, navigation);
  };
  walk(doc);
  await Promise.all(checks);
  for (const id of [...references, ...localAnchors]) if (!ids.has(id)) failures.push(`${file}: missing target ${id}`);
  if (!bodyIsBlank) failures.push(`${file}: missing Blank body`);
  if (h1 !== 1) failures.push(`${file}: expected one page h1 outside shared prose, got ${h1}`);
  if (article && bodyHeadings.length) {
    const markdown = await fs.readFile(path.join("src/content", relative.replace(/\/index\.html$/, ".md")), "utf8");
    for (const heading of bodyHeadings) {
      if (!markdown.split(/\r?\n/).some((line) => line === `# ${heading}`)) failures.push(`${file}: unexpected body h1 ${heading}`);
    }
  }
  if (robots !== "noindex,follow") failures.push(`${file}: missing alternate-theme noindex`);
  if (!canonical || new URL(canonical).pathname.startsWith("/themes/")) failures.push(`${file}: invalid canonical`);
  if (relative !== "404/index.html" && activeNav !== 1) failures.push(`${file}: expected one active navigation item`);
  if (!article && imageCount) failures.push(`${file}: images on a non-article page`);
  const styleSources = await Promise.all(styles.map((href) => fs.readFile(resourceFile(href), "utf8")));
  const loadedCss = styleSources.join("\n");
  if (!loadedCss.includes("--blank-paper")) failures.push(`${file}: missing Blank stylesheet`);
  if (/\.kisara-|body\[data-fuyukawa\]/.test(loadedCss)) failures.push(`${file}: loaded another theme's stylesheet`);
  if (relative === "index.html") {
    const jsUrls = [];
    const getScripts = (node) => {
      const a = attrs(node);
      if (node.tagName === "script" && a.src) jsUrls.push(a.src);
      for (const child of node.childNodes ?? []) getScripts(child);
    };
    getScripts(doc);
    stats.homeHtml = Buffer.byteLength(html);
    stats.homeCss = styleSources.reduce((sum, source) => sum + Buffer.byteLength(source), 0);
    stats.homeLinkedJs = (await Promise.all(jsUrls.map(async (href) => (await fs.stat(resourceFile(href))).size))).reduce((a, b) => a + b, 0);
    const rule = postcss.parse(loadedCss).nodes;
    if (!rule.length) failures.push("Home: empty stylesheet");
    assert.ok(stats.homeHtml < 55000, "Blank Home HTML exceeds 55 KB");
    assert.ok(stats.homeCss < 48000, "Blank Home CSS exceeds 48 KB");
    assert.ok(stats.homeLinkedJs < 16000, "Blank Home linked JS exceeds 16 KB");
  }
  if (article) totals.articles++;
  totals.pages++;
}

assert.equal(totals.pages, totals.articles + 6);
assert.equal(totals.staticPageImages, 0);
console.log(JSON.stringify({ ...totals, ...stats }));
if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 1;
} else console.log("Blank production audit passed.");

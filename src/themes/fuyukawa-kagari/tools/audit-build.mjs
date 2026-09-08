import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { parse } from "parse5";

const dist = path.resolve("dist");
const root = path.join(dist, "themes/fuyukawa-kagari");
const files = (await fs.readdir(root, { recursive: true })).filter((file) => file.endsWith(".html"));
const errors = [];
const totals = { pages: 0, images: 0, inlineScripts: 0, localLinks: 0, stylesheets: 0 };
const exists = async (url) => {
  const pathname = decodeURIComponent(new URL(url, "https://local.invalid").pathname);
  let file = path.join(dist, pathname);
  if (pathname.endsWith("/")) file = path.join(file, "index.html");
  try { await fs.access(file); return true; } catch { return false; }
};
for (const file of files) {
  const html = await fs.readFile(path.join(root, file), "utf8");
  const document = parse(html), checks = [];
  const ids = new Set(), references = [], styles = [];
  let blogRows = 0, compactRows = 0;
  const walk = (node) => {
    const attributes = Object.fromEntries((node.attrs ?? []).map((attribute) => [attribute.name, attribute.value]));
    if (attributes.id) {
      if (ids.has(attributes.id)) errors.push(`${file}: duplicate id ${attributes.id}`);
      ids.add(attributes.id);
    }
    if (attributes["aria-controls"]) references.push(...attributes["aria-controls"].split(/\s+/));
    if (attributes.class?.split(" ").includes("blog-post-row")) blogRows++;
    if (attributes.class?.includes("compact-post-row")) compactRows++;
    if (node.tagName === "img") {
      totals.images++;
      if (attributes.src?.startsWith("/")) checks.push([attributes.src, exists(attributes.src)]);
      if (attributes.src?.includes("/manga/") && (!attributes.width || !attributes.height)) errors.push(`${file}: unstable image dimensions`);
    }
    if (node.tagName === "link" && attributes.rel === "stylesheet") {
      totals.stylesheets++;
      styles.push(attributes.href);
      if (attributes.href?.startsWith("/")) checks.push([attributes.href, exists(attributes.href)]);
    }
    if (node.tagName === "a" && attributes.href?.startsWith("/themes/fuyukawa-kagari/")) {
      totals.localLinks++;
      checks.push([attributes.href, exists(attributes.href)]);
    }
    if (node.tagName === "script" && !attributes.src && !attributes.type) {
      const script = node.childNodes?.map((child) => child.value ?? "").join("") ?? "";
      try { new vm.Script(script); totals.inlineScripts++; } catch (error) { errors.push(`${file}: ${error.message}`); }
    }
    if (node.tagName === "script" && attributes.src?.startsWith("/")) checks.push([attributes.src, exists(attributes.src)]);
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(document);
  for (const reference of references) if (!ids.has(reference)) errors.push(`${file}: missing aria-controls target ${reference}`);
  for (const [resource, result] of checks) if (!(await result)) errors.push(`${file}: missing ${resource}`);
  const home = file === "index.html";
  if (home && styles.some((style) => /(?:manga|refresh)-pages/.test(style))) errors.push("Home loaded an inner-page stylesheet");
  if (!home && styles.filter((style) => /(?:manga|refresh)-pages/.test(style)).length !== 2) errors.push(`${file}: missing inner-page styles`);
  if (file.replaceAll("\\", "/") === "blog/index.html" && (!blogRows || compactRows)) errors.push("Blog has a missing or duplicate archive");
  if (/fuyukawa[12]\.mp4/.test(html)) errors.push(`${file}: excluded video referenced`);
  totals.pages++;
}
console.log(JSON.stringify(totals));
if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else console.log("Fuyukawa production audit passed.");

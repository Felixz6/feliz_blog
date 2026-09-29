import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDistDir = fileURLToPath(new URL("../dist/", import.meta.url));
const defaultSiteUrl = process.env.SITE_URL ?? "https://felizx.com";

const decodeHtmlEntities = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
  const name = entity.slice(1, -1).toLowerCase();
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  if (name in named) return named[name];
  const codePoint = name.startsWith("#x")
    ? Number.parseInt(name.slice(2), 16)
    : Number.parseInt(name.slice(1), 10);
  return Number.isFinite(codePoint) && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity;
});

const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

const withoutNonMarkup = (html) => html
  .replace(/<!--[^]*?-->/g, "")
  .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, "");

const collectHtmlFiles = async (directory) => {
  const files = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".html")) files.push(entryPath);
    }
  };
  await visit(directory);
  return files;
};

const isWithin = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const resolveStaticTarget = async (distDir, pathname) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const withoutLeadingSlash = decodedPath.replace(/^\/+/, "");
  const routePath = path.resolve(distDir, withoutLeadingSlash || ".");
  if (!isWithin(distDir, routePath)) return null;

  const candidates = decodedPath.endsWith("/")
    ? [path.join(routePath, "index.html")]
    : [routePath, `${routePath}.html`, path.join(routePath, "index.html")];

  for (const candidate of candidates) {
    if (!isWithin(distDir, candidate)) continue;
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  return null;
};

const getIds = (html) => new Set(
  [...html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map((match) => decodeHtmlEntities(match[1] ?? match[2] ?? match[3]))
);

export async function inspectInternalLinks({ distDir = defaultDistDir, siteUrl = defaultSiteUrl } = {}) {
  const root = path.resolve(distDir);
  const siteOrigin = new URL(siteUrl).origin;
  const failures = [];
  const idCache = new Map();
  let linkCount = 0;
  let fragmentCount = 0;

  let htmlFiles;
  try {
    htmlFiles = await collectHtmlFiles(root);
  } catch (error) {
    return { failures: [`Could not read build output ${root}: ${error.message}`], htmlCount: 0, linkCount, fragmentCount };
  }
  if (htmlFiles.length === 0) {
    return { failures: [`No HTML pages found in build output ${root}`], htmlCount: 0, linkCount, fragmentCount };
  }

  for (const sourceFile of htmlFiles) {
    const relativeSource = path.relative(root, sourceFile).split(path.sep).join("/");
    const html = await readFile(sourceFile, "utf8");
    const markup = withoutNonMarkup(html);
    const sourceUrl = new URL(relativeSource, `${siteOrigin}/`);

    for (const match of markup.matchAll(/<a\b[^>]*>/gi)) {
      const rawHref = getAttribute(match[0], "href");
      if (rawHref === undefined) continue;
      const href = decodeHtmlEntities(rawHref.trim());
      let targetUrl;
      try {
        targetUrl = new URL(href, sourceUrl);
      } catch {
        failures.push(`${relativeSource}: malformed link ${JSON.stringify(href)}`);
        continue;
      }
      if (targetUrl.origin !== siteOrigin) continue;

      linkCount += 1;
      const targetFile = await resolveStaticTarget(root, targetUrl.pathname);
      if (!targetFile) {
        failures.push(`${relativeSource}: missing internal target ${JSON.stringify(href)}`);
        continue;
      }
      if (!targetUrl.hash) continue;

      fragmentCount += 1;
      if (!targetFile.endsWith(".html")) continue;
      let ids = idCache.get(targetFile);
      if (!ids) {
        ids = getIds(await readFile(targetFile, "utf8"));
        idCache.set(targetFile, ids);
      }
      let fragment;
      try {
        fragment = decodeURIComponent(targetUrl.hash.slice(1));
      } catch {
        fragment = targetUrl.hash.slice(1);
      }
      if (!ids.has(fragment)) {
        failures.push(`${relativeSource}: missing anchor ${JSON.stringify(targetUrl.hash)} in ${path.relative(root, targetFile).split(path.sep).join("/")}`);
      }
    }
  }

  return { failures, htmlCount: htmlFiles.length, linkCount, fragmentCount };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const result = await inspectInternalLinks();
  if (result.failures.length > 0) {
    console.error(`Internal link check failed (${result.failures.length} issue(s)):`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Internal link check passed: ${result.htmlCount} HTML pages, ${result.linkCount} local links, ${result.fragmentCount} anchors.`);
  }
}

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";

const layout = new URL("../src/themes/fuyukawa-kagari/layouts/ArticleLayout.astro", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const entry = new URL("pagefind/pagefind-entry.json", dist);
const aliasDirectory = new URL("themes/fuyukawa-kagari/blog/", dist);
const builtIndexIsCurrent = existsSync(entry)
  && existsSync(aliasDirectory)
  && statSync(entry).mtimeMs >= statSync(layout).mtimeMs;

test("built Pagefind indexes canonical articles but not their theme aliases", {
  skip: builtIndexIsCurrent ? false : "run npm run build before checking the generated index"
}, () => {
  const fragmentsDirectory = new URL("pagefind/fragment/", dist);
  const fragments = readdirSync(fragmentsDirectory)
    .filter((name) => name.endsWith(".pf_fragment"))
    .map((name) => {
      const compressed = readFileSync(new URL(name, fragmentsDirectory));
      const decoded = gunzipSync(compressed).toString();
      return JSON.parse(decoded.slice(decoded.indexOf("{")));
    });
  const indexedUrls = new Set(fragments.map((fragment) => fragment.url));
  const pageCount = JSON.parse(readFileSync(entry, "utf8")).languages.zh.page_count;
  const slugs = readdirSync(aliasDirectory, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  assert.ok(slugs.length > 0, "expected generated alias article pages");
  assert.equal(fragments.length, pageCount);
  assert.equal(indexedUrls.size, pageCount);

  for (const slug of slugs) {
    const primaryUrl = `/blog/${slug}/`;
    const aliasUrl = `/themes/fuyukawa-kagari/blog/${slug}/`;
    const primaryHtml = readFileSync(new URL(`blog/${slug}/index.html`, dist), "utf8");
    const aliasHtml = readFileSync(new URL(`themes/fuyukawa-kagari/blog/${slug}/index.html`, dist), "utf8");

    assert.ok(/<article\b[^>]*\bdata-pagefind-body(?:\s|>|=)/.test(primaryHtml), primaryUrl);
    assert.ok(!/<article\b[^>]*\bdata-pagefind-body(?:\s|>|=)/.test(aliasHtml), aliasUrl);
    assert.ok(/<body\b[^>]*\bdata-pagefind-ignore(?:\s|>|=)/.test(aliasHtml), aliasUrl);
    assert.ok(/<meta name="robots" content="noindex,follow"\s*\/?>/.test(aliasHtml), aliasUrl);
    assert.ok(aliasHtml.includes(`<link rel="canonical" href="https://felizx.com${primaryUrl}">`), aliasUrl);
    assert.ok(indexedUrls.has(primaryUrl), `${primaryUrl} must remain searchable`);
    assert.ok(!indexedUrls.has(aliasUrl), `${aliasUrl} must not appear in search`);
  }

  const knownPrimary = fragments.find((fragment) => fragment.url === "/blog/risc-v-xv6-learning-notes/");
  assert.ok(knownPrimary, "known RISC-V article must remain in the generated index");
  assert.match(knownPrimary.meta.title, /RISC-V/);
  assert.equal(
    [...indexedUrls].filter((url) => url.startsWith("/themes/fuyukawa-kagari/blog/")).length,
    0,
    "one article must not produce both primary and alias search results"
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

const srcDocsDir = new URL("../src/content/project-docs/src-skill/", import.meta.url);
const reconDocsDir = new URL("../src/content/project-docs/recon-mcp/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the four project primary Markdown documents are copied into the site content", () => {
  assert.deepEqual(readdirSync(srcDocsDir).sort(), ["README.md", "目录文件分析.md", "部署记录.md"]);
  assert.deepEqual(readdirSync(reconDocsDir), ["README.md"]);

  const srcReadme = readFileSync(new URL("README.md", srcDocsDir), "utf8");
  assert.match(srcReadme, /project: src-skill/);
  assert.match(srcReadme, /\/projects\/src-skill\/docs\/deployment\//);
  assert.match(srcReadme, /\/projects\/src-skill\/docs\/structure\//);

  const reconReadme = readFileSync(new URL("README.md", reconDocsDir), "utf8");
  assert.match(reconReadme, /asset_search/);
  assert.match(reconReadme, /deep_recon/);
});

test("project detail pages link to their rendered Markdown document indexes or source repositories", () => {
  const srcPage = read("../src/pages/projects/src-skill/index.astro");
  const reconPage = read("../src/pages/projects/recon-mcp/index.astro");
  assert.match(srcPage, /href="\/projects\/src-skill\/docs\/"/);
  assert.match(srcPage, /浏览 3 份主文档/);
  assert.match(reconPage, /href="https:\/\/github\.com\/Felixz6\/recon-mcp"/);
  assert.match(reconPage, /GITHUB REPOSITORY/);
  assert.match(reconPage, /Felixz6 \/ recon-mcp/);
  assert.doesNotMatch(reconPage, /项目文档|阅读 README/);
});

test("previous SRC Skill URLs redirect to the renamed project and documents", () => {
  const astroConfig = read("../astro.config.mjs");
  assert.match(astroConfig, /"\/projects\/clown-src-6k-skill\/": "\/projects\/src-skill\/"/);
  assert.match(astroConfig, /"\/projects\/clown-src-6k-skill\/docs\/": "\/projects\/src-skill\/docs\/"/);
  assert.match(astroConfig, /"\/projects\/clown-src-6k-skill\/docs\/overview\/": "\/projects\/src-skill\/docs\/overview\/"/);
  assert.match(astroConfig, /"\/projects\/clown-src-6k-skill\/docs\/structure\/": "\/projects\/src-skill\/docs\/structure\/"/);
  assert.match(astroConfig, /"\/projects\/clown-src-6k-skill\/docs\/deployment\/": "\/projects\/src-skill\/docs\/deployment\/"/);
});

test("project document routes render entries and expose a navigable index", () => {
  const indexPage = read("../src/pages/projects/[project]/docs/index.astro");
  const detailPage = read("../src/pages/projects/[project]/docs/[slug].astro");
  const documentLayout = read("../src/themes/fuyukawa-kagari/components/DocumentLayout.astro");
  assert.match(indexPage, /getCollection\("projectDocs"\)/);
  assert.match(indexPage, /document\.data\.routeSlug/);
  assert.match(detailPage, /getCollection\("projectDocs"\)/);
  assert.match(detailPage, /filter\(\(item\) => item\.data\.project === document\.data\.project\)/);
  assert.match(detailPage, /sort\(\(a, b\) => a\.data\.order - b\.data\.order\)/);
  assert.match(detailPage, /render\(document\)/);
  assert.match(detailPage, /回到文档目录/);
  assert.match(detailPage, /previousDocument\.data\.routeSlug/);
  assert.match(detailPage, /nextDocument\.data\.routeSlug/);
  assert.match(detailPage, /<DocumentLayout[\s\S]*kind="project-doc"/);
  assert.match(documentLayout, /document-pager/);
});

test("CTF notes and project documents reuse the mobile and active-state article TOC", () => {
  const ctfPage = read("../src/pages/projects/ctf-notes/[slug].astro");
  const projectDocPage = read("../src/pages/projects/[project]/docs/[slug].astro");
  const articleLayout = read("../src/themes/fuyukawa-kagari/layouts/ArticleLayout.astro");
  const documentLayout = read("../src/themes/fuyukawa-kagari/components/DocumentLayout.astro");
  const mobileToc = read("../src/themes/fuyukawa-kagari/components/ArticleMobileToc.astro");
  const tocLinks = read("../src/themes/fuyukawa-kagari/components/ArticleTocLinks.astro");

  for (const page of [ctfPage, projectDocPage, articleLayout]) {
    assert.match(page, /needsMangaRuntime/);
  }
  for (const route of [ctfPage, projectDocPage]) assert.match(route, /<DocumentLayout[\s\S]*headings=\{headings\}/);
  assert.match(articleLayout, /data-article-shell/);
  assert.match(articleLayout, /<ArticleMobileToc headings=\{/);
  assert.match(articleLayout, /<ArticleTocLinks headings=\{/);
  assert.match(documentLayout, /data-article-shell/);
  assert.match(documentLayout, /<ArticleMobileToc headings=\{tocHeadings\}/);
  assert.match(documentLayout, /<ArticleTocLinks headings=\{tocHeadings\}/);
  assert.match(documentLayout, /<nav class=\{`document-pager/);
  assert.match(mobileToc, /class="article-mobile-toc"/);
  assert.match(mobileToc, /<ArticleTocLinks headings=\{headings\}/);
  assert.match(tocLinks, /data-article-toc/);
});

test("CTF notes keep their independent collection order and route identities", () => {
  const ctfPage = read("../src/pages/projects/ctf-notes/[slug].astro");
  assert.match(ctfPage, /getCollection\("ctfNotes"\)/);
  assert.match(ctfPage, /sort\(\(a, b\) => a\.data\.order - b\.data\.order\)/);
  assert.match(ctfPage, /params: \{ slug: note\.id \}/);
  assert.match(ctfPage, /previousNote\.id/);
  assert.match(ctfPage, /nextNote\.id/);
  assert.match(ctfPage, /kind="ctf-note"/);
});

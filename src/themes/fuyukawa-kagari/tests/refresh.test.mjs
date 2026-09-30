import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import postcss from "postcss";
import { parse } from "@astrojs/compiler";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const css = read("styles/refresh.css") + "\n" + read("styles/refresh-pages.css");
const inlineScript = (file) => read(file).match(/<script is:inline data-astro-rerun>([\s\S]*?)<\/script>/)?.[1];

test("refresh selectors cannot style another theme", () => {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
    for (const selector of postcss.list.comma(rule.selector)) {
      assert.ok(selector.startsWith("body[data-fuyukawa]") || selector.startsWith("html:has(body[data-fuyukawa])"), selector);
    }
  });
  assert.match(read("layouts/BaseLayout.astro"), /data-fuyukawa/);
  assert.match(read("layouts/BaseLayout.astro"), /import refreshHref from "\.\.\/styles\/refresh\.css\?url"/);
  assert.ok(read("layouts/BaseLayout.astro").includes('<link rel="stylesheet" href={`${refreshHref}?v=${sharedStylesheetVersion}`} />'));
});

test("refresh uses bounded typography, reduced motion, and compact-screen layouts", () => {
  const root = postcss.parse(css);
  root.walkDecls("font-size", (declaration) => assert.doesNotMatch(declaration.value, /vw|cqw/));
  root.walkDecls("letter-spacing", (declaration) => assert.equal(declaration.value, "0"));
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /max-width: 480px/);
  assert.match(css, /max-width: 760px/);
  const articleTocAtTablet = new Map();
  root.walkAtRules("media", (rule) => {
    if (rule.params !== "(max-width: 900px)") return;
    rule.walkRules((child) => {
      if (child.selector?.startsWith("body[data-fuyukawa] .article-")) {
        articleTocAtTablet.set(child.selector, Object.fromEntries(child.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value])));
      }
    });
  });
  assert.equal(articleTocAtTablet.get("body[data-fuyukawa] .article-toc").display, "none");
  assert.equal(articleTocAtTablet.get("body[data-fuyukawa] .article-mobile-toc").display, "block");
  assert.match(css, /\.post-cover-frame[^}]*aspect-ratio: 7 \/ 10/);
});

test("mobile music drawer handle and play triangle are compact", () => {
  let handle;
  let handleIcon;
  postcss.parse(css).walkAtRules("media", (rule) => {
    if (rule.params !== "(max-width: 760px)") return;
    rule.walkRules("body[data-fuyukawa] .toy-dock-handle", (handleRule) => {
      handle = Object.fromEntries(handleRule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
    });
    rule.walkRules("body[data-fuyukawa] .toy-dock-handle svg", (iconRule) => {
      handleIcon = Object.fromEntries(iconRule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
    });
  });
  assert.deepEqual({ right: handle.right, width: handle.width, height: handle.height }, { right: "-30px", width: "30px", height: "48px" });
  assert.deepEqual(handleIcon, { width: "16px", height: "16px" });
});

test("mobile opened music player uses compact grid tracks and controls", () => {
  const rules = new Map();
  postcss.parse(css).walkAtRules("media", (rule) => {
    if (rule.params !== "(max-width: 760px)") return;
    rule.walkRules((child) => {
      if (child.selector?.startsWith("body[data-fuyukawa]")) {
        rules.set(child.selector, Object.fromEntries(child.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value])));
      }
    });
  });
  assert.equal(rules.get("body[data-fuyukawa] .toy-dock").width, "min(320px, calc(100vw - 52px))");
  assert.equal(rules.get("body[data-fuyukawa] .music-player-shell")["grid-template-columns"], "96px minmax(0, 1fr)");
  assert.equal(rules.get("body[data-fuyukawa] .music-bottom-row")["grid-template-columns"], "112px minmax(0, 1fr)");
  assert.equal(rules.get("body[data-fuyukawa] .music-controls")["grid-template-columns"], "30px 36px 30px");
  assert.equal(rules.get("body[data-fuyukawa] .music-controls button").height, "34px");
});

test("home and archive preserve complete covers in stable portrait frames", () => {
  const rules = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent.type !== "root") return;
    rules.set(rule.selector, Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value])));
  });
  const home = rules.get("body[data-fuyukawa] .journal-entry > img");
  const frame = rules.get("body[data-fuyukawa] .post-cover-frame");
  const image = rules.get("body[data-fuyukawa] .post-cover-frame img");
  assert.equal(home["aspect-ratio"], "7 / 10");
  assert.equal(frame["aspect-ratio"], "7 / 10");
  for (const cover of [home, image]) {
    assert.equal(cover["object-fit"], "contain");
    assert.equal(cover["object-position"], "center");
  }
  assert.equal(image.position, "absolute");
  assert.equal(image.height, "100%");
  assert.doesNotMatch(read("pages/BlogIndexPage.astro"), /coverFocus|style={`object-position:/);
  assert.match(read("pages/HomePage.astro"), /width="700" height="1000" loading="lazy"/);
});

test("About profile omits the mint avatar badge", () => {
  assert.doesNotMatch(read("pages/AboutPage.astro"), /about-avatar-flower/);
  assert.doesNotMatch(css, /about-avatar-flower/);
});

test("header stays transparent with symmetric centered navigation", () => {
  const rules = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent.type !== "root") return;
    rules.set(rule.selector, Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value])));
  });
  const header = rules.get("body[data-fuyukawa] .site-header");
  const nav = rules.get("body[data-fuyukawa] .nav-links");
  assert.equal(header.background, "transparent");
  assert.equal(header["backdrop-filter"], "none");
  assert.equal(header["grid-template-columns"], "minmax(0, 1fr) auto minmax(0, 1fr)");
  assert.equal(nav["grid-column"], "2");
  assert.equal(nav["justify-self"], "center");
  assert.match(css, /max-width: 760px[^]*?\.nav-links \{ grid-column: 1;[^}]*justify-content: center/);
});

test("active article TOC keeps chapter labels aligned", () => {
  const activeRules = [];
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selector.includes('.article-toc a[aria-current="location"]')
      && !rule.selector.includes('.article-mobile-toc nav a[aria-current="location"]')) return;
    const declarations = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
    assert.equal("padding" in declarations, false, rule.selector);
    if ("padding-left" in declarations || "margin-left" in declarations) {
      assert.equal(declarations["padding-left"], "10px", rule.selector);
      assert.equal(declarations["margin-left"], "-10px", rule.selector);
      assert.equal(parseFloat(declarations["padding-left"]) + parseFloat(declarations["margin-left"]), 0, rule.selector);
    }
    activeRules.push(declarations);
  });
  assert.ok(activeRules.some((declarations) => declarations.color === "var(--rose)" && declarations.background === "#f7eaf080"));
  assert.ok(activeRules.some((declarations) => declarations["box-shadow"] === "inset 2px 0 0 var(--rose)"));
});

test("all theme templates parse without errors", async () => {
  for (const path of [
    "layouts/BaseLayout.astro", "layouts/ArticleLayout.astro",
    "pages/HomePage.astro", "pages/BlogIndexPage.astro", "pages/GamesPage.astro",
    "pages/ProjectsPage.astro", "pages/AboutPage.astro", "pages/NotFoundPage.astro",
    "components/GameCover.astro", "components/SakuraRain.astro",
    "components/ArticleMobileToc.astro", "components/ArticleTocLinks.astro"
  ]) {
    const result = await parse(read(path));
    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 1), [], path);
  }
});

test("navigation, mobile article index and fixed project status expose their state", () => {
  assert.match(read("layouts/BaseLayout.astro"), /aria-current=/);
  assert.match(read("layouts/BaseLayout.astro"), /href="#page-content"/);
  assert.match(read("layouts/ArticleLayout.astro"), /<ArticleMobileToc headings=\{headings\}/);
  assert.match(read("components/ArticleMobileToc.astro"), /<details class="article-mobile-toc"/);
  assert.match(read("pages/ProjectsPage.astro"), /class="works-card-status"/);
  assert.match(read("pages/ProjectsPage.astro"), /\{project\.status\}/);
  assert.doesNotMatch(read("pages/ProjectsPage.astro"), /相关内容已整理发布/);
  assert.doesNotMatch(read("pages/ProjectsPage.astro"), /data-card-toggle|data-card-panel|查看状态/);
});

test("closed tool drawer hides its whole panel at every width", () => {
  const root = postcss.parse(css);
  const drawer = [];
  root.walkRules((rule) => {
    if (rule.selector === "body[data-fuyukawa] .toy-dock" && rule.parent.type === "root") {
      rule.walkDecls((declaration) => drawer.push([declaration.prop, declaration.value]));
    }
  });
  assert.ok(drawer.some(([property, value]) => property === "transform" && value === "translateX(-100%)"));
  assert.ok(drawer.some(([property, value]) => property === "width" && value.includes("100vw - 52px")));
  assert.match(css, /\.toy-dock:not\(:hover\):not\(:focus-within\):not\(\.is-pinned\) \.toy-dock-panel \{ visibility: hidden/);
  assert.match(css, /\.toy-dock:focus-within/);
});

test("homepage journal and custom game artwork stay in the Fuyukawa boundary", () => {
  const home = read("pages/HomePage.astro");
  assert.match(home, /recentPosts = \(await getPublishedPosts\(\)\)\.slice\(0, 3\)/);
  assert.match(home, /class="journal-entry" href=\{`\/blog\/\$\{post\.id\}\/`\}/);
  assert.match(read("pages/GamesPage.astro"), /<GameCover game=\{game.id\}/);
  assert.doesNotMatch(css + read("components/GameCover.astro"), /https?:\/\//);
});

function node(dataset = {}) {
  const events = new Map();
  const classes = new Set();
  return {
    dataset, events, value: "", innerHTML: "", isConnected: true, hidden: true,
    attributes: {}, textContent: "",
    classList: {
      toggle(key, force) {
        const add = force ?? !classes.has(key);
        if (add) classes.add(key); else classes.delete(key);
        return add;
      },
      contains: (key) => classes.has(key)
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, listener) { events.set(key, listener); },
    removeEventListener(key, listener) { if (events.get(key) === listener) events.delete(key); }
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function searchFixture(pagefind, href = "https://example.test/blog/") {
  const input = node();
  const output = node();
  const searchMeta = node();
  searchMeta.hidden = true;
  const summary = node();
  const moreButton = node();
  moreButton.hidden = true;
  const documentEvents = new Map();
  const windowEvents = new Map();
  const timers = new Map();
  const location = new URL(href);
  let timerId = 0;
  const document = {
    querySelector: (selector) => ({
      "[data-blog-search]": input,
      "[data-blog-search-results]": output,
      "[data-blog-search-meta]": searchMeta,
      "[data-blog-search-summary]": summary,
      "[data-blog-search-more]": moreButton
    })[selector],
    querySelectorAll: () => [],
    addEventListener: (key, value) => documentEvents.set(key, value),
    removeEventListener: (key, value) => { if (documentEvents.get(key) === value) documentEvents.delete(key); }
  };
  const window = {
    location,
    history: {
      state: null,
      replaceState(state, _title, target) {
        this.state = state;
        location.href = new URL(target, location.href).href;
      }
    },
    addEventListener: (key, value) => windowEvents.set(key, value),
    removeEventListener: (key, value) => { if (windowEvents.get(key) === value) windowEvents.delete(key); },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id)
  };
  const context = vm.createContext({
    document, window, URL,
    Function: function () { return () => Promise.resolve(pagefind); }
  });
  const run = () => vm.runInContext(inlineScript("pages/BlogIndexPage.astro"), context);
  const flush = async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
    await settle();
  };
  const type = async (value) => {
    input.value = value;
    input.events.get("input")();
    await flush();
  };
  run();
  return { input, output, searchMeta, summary, moreButton, window, windowEvents, timers, type, flush, run, documentEvents };
}

test("search ignores stale asynchronous results and clears pending results", async () => {
  const pending = new Map();
  const fixture = searchFixture({
    options: async () => {},
    search: (query) => new Promise((resolve) => pending.set(query, resolve))
  });
  const result = (title) => ({ results: [{ data: async () => ({
    url: "/blog/note/", meta: { title }, excerpt: "A note"
  }) }] });
  await fixture.type("old");
  await fixture.type("new");
  pending.get("new")(result("New result"));
  await settle();
  assert.match(fixture.output.innerHTML, /New result/);
  assert.match(fixture.output.innerHTML, /href="\/blog\/note\/"/);
  assert.doesNotMatch(fixture.output.innerHTML, /\/themes\/fuyukawa-kagari\/blog\/note\//);
  pending.get("old")(result("Old result"));
  await settle();
  assert.doesNotMatch(fixture.output.innerHTML, /Old result/);
  await fixture.type("pending");
  await fixture.type("");
  pending.get("pending")(result("Should not return"));
  await settle();
  assert.equal(fixture.output.innerHTML, "");
});

test("search teardown invalidates old work and script can reinitialize", async () => {
  let resolveSearch;
  const fixture = searchFixture({
    options: async () => {},
    search: () => new Promise((resolve) => { resolveSearch = resolve; })
  });
  await fixture.type("search");
  fixture.documentEvents.get("astro:before-swap")();
  assert.equal(fixture.input.events.has("input"), false);
  const previous = fixture.output.innerHTML;
  resolveSearch({ results: [] });
  await settle();
  assert.equal(fixture.output.innerHTML, previous);
  fixture.run();
  assert.equal(fixture.input.events.has("input"), true);
});

test("search failure renders a usable empty fallback", async () => {
  const fixture = searchFixture({
    options: async () => {},
    search: async () => { throw new Error("Index offline"); }
  });
  await fixture.type("missing");
  assert.match(fixture.output.innerHTML, /没有找到相关笔记/);
  assert.doesNotMatch(fixture.output.innerHTML, /正在翻页/);
});

test("search reports total matches, loads more than five, and preserves category/query URL state", async () => {
  let searchedQuery = "";
  const fixture = searchFixture({
    options: async () => {},
    search: async (query) => {
      searchedQuery = query;
      return { results: Array.from({ length: 7 }, (_, index) => ({
        data: async () => ({
          url: `/blog/note-${index + 1}/`,
          meta: { title: `Note ${index + 1}` },
          excerpt: "A note"
        })
      })) };
    }
  }, "https://example.test/blog/?category=tech");

  await fixture.type("CTF");
  assert.equal(searchedQuery, "CTF");
  assert.equal(fixture.searchMeta.hidden, false);
  assert.equal(fixture.summary.textContent, "共找到 7 篇笔记，已显示 5 篇");
  assert.equal((fixture.output.innerHTML.match(/class=\"blog-search-result\"/g) ?? []).length, 5);
  assert.equal(fixture.moreButton.hidden, false);
  assert.equal(new URL(fixture.window.location.href).searchParams.get("q"), "CTF");
  assert.equal(new URL(fixture.window.location.href).searchParams.get("category"), "tech");

  await fixture.moreButton.events.get("click")();
  assert.equal((fixture.output.innerHTML.match(/class=\"blog-search-result\"/g) ?? []).length, 7);
  assert.equal(fixture.summary.textContent, "共找到 7 篇笔记，已显示 7 篇");
  assert.equal(fixture.moreButton.hidden, true);

  await fixture.type("");
  assert.equal(fixture.searchMeta.hidden, true);
  assert.equal(fixture.summary.textContent, "");
  assert.equal(new URL(fixture.window.location.href).searchParams.has("q"), false);
  assert.equal(new URL(fixture.window.location.href).searchParams.get("category"), "tech");
});

test("search restores shared query URLs on load and popstate", async () => {
  const queries = [];
  const fixture = searchFixture({
    options: async () => {},
    search: async (query) => {
      queries.push(query);
      return { results: [] };
    }
  }, "https://example.test/blog/?q=Steam&category=tech");

  assert.equal(fixture.input.value, "Steam");
  await fixture.flush();
  assert.deepEqual(queries, ["Steam"]);
  assert.equal(fixture.summary.textContent, "共找到 0 篇笔记");

  fixture.window.location.href = "https://example.test/blog/?q=RISC-V&category=life";
  fixture.windowEvents.get("popstate")();
  assert.equal(fixture.input.value, "RISC-V");
  await fixture.flush();
  assert.deepEqual(queries, ["Steam", "RISC-V"]);
});

test("blog archive and article tags and categories are linked to shareable search URLs", () => {
  const archive = read("pages/BlogIndexPage.astro");
  const article = read("layouts/ArticleLayout.astro");
  assert.match(archive, /class=\"blog-tag-link\" href=\{getBlogTagHref\(tag\)\}/);
  assert.match(archive, /class=\"blog-category-filter-link\" href=\{getBlogCategoryHref\(post\.data\.category\)\}/);
  assert.match(article, /class=\"blog-tag-link\" href=\{`\/blog\/\?q=\$\{encodeURIComponent\(tag\)\}`\}/);
  assert.match(article, /\?category=\$\{encodeURIComponent\(frontmatter\.category\)\}/);
});

test("project filters remain functional with status always visible", () => {
  const filters = [node({ filter: "all" }), node({ filter: "unity" })];
  const cards = [node({ projectLine: "unity" }), node({ projectLine: "astrbot" })];
  const lines = [node({ lineCard: "unity" }), node({ lineCard: "astrbot" })];
  const context = vm.createContext({
    document: {
      querySelector: () => ({ querySelectorAll: () => filters }),
      querySelectorAll: (selector) => ({
        "[data-project-line]": cards, "[data-line-card]": lines
      })[selector]
    }
  });
  const script = inlineScript("pages/ProjectsPage.astro");
  vm.runInContext(script, context);
  filters[1].events.get("click")();
  assert.equal(filters[1].attributes["aria-pressed"], "true");
  assert.equal(filters[0].attributes["aria-pressed"], "false");
  assert.equal(cards[0].classList.contains("is-dimmed"), false);
  assert.equal(cards[1].classList.contains("is-dimmed"), true);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  filters[0].events.get("click")();
  assert.equal(cards[1].classList.contains("is-dimmed"), false);
});

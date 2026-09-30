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

test("project page rules have one owner and keep the effective desktop and mobile layouts together", () => {
  const pages = read("styles/refresh-pages.css");
  assert.doesNotMatch(read("styles/refresh.css"), /\.works-/);
  assert.doesNotMatch(read("styles/manga-pages.css"), /\.works-/);

  const root = postcss.parse(pages);
  const baseHero = [];
  const mobileHeroColumns = new Map();
  root.walkRules("body[data-fuyukawa] .works-hero", (rule) => {
    if (rule.parent.type === "root") baseHero.push(Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value])));
    if (rule.parent.type === "atrule" && ["(max-width: 760px)", "(max-width: 480px)"].includes(rule.parent.params)) {
      mobileHeroColumns.set(rule.parent.params, rule.nodes.find((node) => node.type === "decl" && node.prop === "grid-template-columns")?.value);
    }
  });

  assert.equal(baseHero.length, 1);
  assert.equal(baseHero[0]["grid-template-columns"], "minmax(0, 1fr) minmax(280px, .85fr)");
  assert.equal(mobileHeroColumns.get("(max-width: 760px)"), "minmax(0, 1fr) 170px");
  assert.equal(mobileHeroColumns.get("(max-width: 480px)"), "minmax(0, 1fr) 95px");
  assert.match(pages, /\.works-card:hover\s*\{/);
  assert.match(pages, /\.works-filter button\.is-active\s*\{/);
});

test("article reading and mobile TOC states have one page-style owner", () => {
  const pages = read("styles/refresh-pages.css");
  const articleChrome = /\.(?:article-shell|article-toc|article-mobile-toc|article-colophon|article-margin-character|prose)\b/;
  assert.doesNotMatch(read("styles/refresh.css"), articleChrome);
  assert.doesNotMatch(read("styles/manga-pages.css"), articleChrome);
  assert.match(pages, /\.article-toc a:hover\s*\{/);
  assert.match(pages, /\.article-mobile-toc\[open\]/);
  assert.match(pages, /\.article-colophon\s*\{/);
  assert.match(pages, /@media \(max-width: 480px\)[\s\S]*?\.article-colophon > img\s*\{/);
});

test("home scene, chapter rail, navigation states, and pending feedback have one owner", () => {
  const refresh = read("styles/refresh.css");
  const manga = read("styles/manga.css");
  const theme = read("styles/theme.css");
  const homeChrome = /\.(?:hero-stage|hero|manga-scene|chapter-|home-journal|journal-margin-note)\b/;

  assert.doesNotMatch(manga, homeChrome);
  assert.doesNotMatch(theme, /body\[data-fuyukawa\].*navigation-pending/);
  assert.match(refresh, /\.nav-links a:hover,[\s\S]*?\.nav-links a\[aria-current="page"\][\s\S]*?color:\s*var\(--nav-ink\)/);
  assert.match(refresh, /\.nav-links a\[data-navigation-tone="pink"\]\s*\{[^}]*--nav-ink:\s*var\(--rose\)/);
  assert.match(refresh, /\.site-header \.nav-links a\[data-navigation-pending="true"\]/);
  assert.match(refresh, /\.hero:has\(\.manga-scene\[data-ready="true"\]\)::before/);
  assert.match(refresh, /\.chapter-leaf:hover\s*\{/);
  assert.match(refresh, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.chapter-track \{ scroll-behavior: auto/);
  assert.match(refresh, /@media \(max-width: 760px\)[\s\S]*?\.hero-copy \{ position: absolute;[\s\S]*?\.manga-scene-camera \.manga-scene-front/);
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
    "pages/HomePage.astro", "pages/BlogIndexPage.astro",
    "pages/ProjectsPage.astro", "pages/AboutPage.astro", "pages/NotFoundPage.astro",
    "components/SakuraRain.astro",
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

test("homepage journal stays in the Fuyukawa boundary", () => {
  const home = read("pages/HomePage.astro");
  assert.match(home, /recentPosts = \(await getPublishedPosts\(\)\)\.slice\(0, 3\)/);
  assert.match(home, /class="journal-entry" href=\{`\/blog\/\$\{post\.id\}\/`\}/);
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
  const loadMoreError = node();
  loadMoreError.hidden = true;
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
      "[data-blog-search-more]": moreButton,
      "[data-blog-search-error]": loadMoreError
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
  return { input, output, searchMeta, summary, moreButton, loadMoreError, window, windowEvents, timers, type, flush, run, documentEvents };
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

test("pagefind initialization failure is not cached and the next search retries it", async () => {
  let optionsCalls = 0;
  let searches = 0;
  const fixture = searchFixture({
    options: async () => {
      optionsCalls += 1;
      if (optionsCalls === 1) throw new Error("Initialization failed");
    },
    search: async () => {
      searches += 1;
      return { results: [{ data: async () => ({
        url: "/blog/recovered/", meta: { title: "Recovered result" }, excerpt: "Ready again"
      }) }] };
    }
  });

  await fixture.type("first");
  assert.match(fixture.output.innerHTML, /没有找到相关笔记/);
  await fixture.type("second");
  assert.equal(optionsCalls, 2);
  assert.equal(searches, 1);
  assert.match(fixture.output.innerHTML, /Recovered result/);
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

test("load-more failure preserves rendered results and retries the same batch", async () => {
  let failLaterResults = true;
  const fixture = searchFixture({
    options: async () => {},
    search: async () => ({ results: Array.from({ length: 7 }, (_, index) => ({
      data: async () => {
        if (index >= 5 && failLaterResults) throw new Error("Result unavailable");
        return {
          url: `/blog/note-${index + 1}/`,
          meta: { title: `Note ${index + 1}` },
          excerpt: "A note"
        };
      }
    })) })
  });

  await fixture.type("notes");
  assert.equal((fixture.output.innerHTML.match(/class="blog-search-result"/g) ?? []).length, 5);
  const previousHtml = fixture.output.innerHTML;
  await fixture.moreButton.events.get("click")();
  assert.equal(fixture.output.innerHTML, previousHtml);
  assert.equal(fixture.summary.textContent, "共找到 7 篇笔记，已显示 5 篇");
  assert.equal(fixture.loadMoreError.hidden, false);
  assert.equal(fixture.loadMoreError.textContent, "加载失败，请重试。");
  assert.equal(fixture.moreButton.hidden, false);
  assert.equal(fixture.moreButton.disabled, false);
  assert.match(fixture.moreButton.textContent, /重试查看更多/);

  failLaterResults = false;
  await fixture.moreButton.events.get("click")();
  assert.equal((fixture.output.innerHTML.match(/class="blog-search-result"/g) ?? []).length, 7);
  assert.equal(fixture.summary.textContent, "共找到 7 篇笔记，已显示 7 篇");
  assert.equal(fixture.loadMoreError.hidden, true);
  assert.equal(fixture.moreButton.hidden, true);
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

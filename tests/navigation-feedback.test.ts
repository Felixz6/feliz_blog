import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import { installNavigationFeedback } from "../src/themes/fuyukawa-kagari/lib/navigation-feedback.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

class FakeElement {
  constructor() {
    this.dataset = {};
    this.textContent = "";
    this.attributes = new Map();
    this.animations = [];
    this.children = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "data-navigating") this.dataset.navigating = value;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "data-navigating") delete this.dataset.navigating;
  }

  querySelector(selector) { return this.children.get(selector) ?? null; }

  animate(keyframes, options) {
    this.animations.push({ keyframes, options });
    const handle = {
      cancelled: false,
      onfinish: null,
      oncancel: null,
      cancel() {
        this.cancelled = true;
        this.oncancel?.();
      },
      finish() { this.onfinish?.(); }
    };
    this.animationHandle = handle;
    return handle;
  }
}

function makePage() {
  const body = new FakeElement();
  const content = new FakeElement();
  const bookmark = new FakeElement();
  const message = new FakeElement();
  bookmark.children.set("[data-navigation-message]", message);
  body.children.set("#page-content", content);
  return {
    body,
    content,
    bookmark,
    message,
    querySelector(selector) {
      if (selector === "[data-navigation-bookmark]") return bookmark;
      if (selector === "#page-content") return content;
      return null;
    }
  };
}

function makeDocument() {
  let page = makePage();
  const listeners = new Map();
  return {
    get body() { return page.body; },
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    dispatch(name, event = {}) {
      for (const callback of [...(listeners.get(name) ?? [])]) callback(event);
    },
    querySelector(selector) {
      return page.querySelector(selector);
    },
    swapTo(nextPage) { page = nextPage; },
    get page() { return page; }
  };
}

function makeWindow(reducedMotion = false) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const listeners = new Map();
  return {
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatch(name, event) { listeners.get(name)?.(event); },
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, dueAt: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= now)
          .sort((a, b) => a[1].dueAt - b[1].dueAt)[0];
        if (!due) return;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
    get pendingTimerCount() { return timers.size; }
  };
}

function preparationEvent({ signal = new AbortController().signal, loader = async () => {}, type = "push", sourceElement } = {}) {
  return { signal, loader, navigationType: type, sourceElement, defaultPrevented: false };
}

function navLink() {
  const link = new FakeElement();
  link.closest = (selector) => selector === ".nav-links a" ? link : null;
  return link;
}

function setup(reducedMotion = false) {
  const doc = makeDocument();
  const win = makeWindow(reducedMotion);
  installNavigationFeedback(doc, win);
  return { doc, win };
}

function assertCleared(doc, win, link) {
  assert.equal(doc.page.bookmark.dataset.visible, undefined);
  assert.equal(doc.page.message.textContent, "");
  assert.equal(doc.body.dataset.navigating, undefined);
  assert.equal(win.pendingTimerCount, 0);
  if (link) assert.equal(link.dataset.navigationPending, undefined);
}

test("Astro lifecycle acknowledges the link immediately and animates only incoming content", async () => {
  const { doc, win } = setup();
  const link = navLink();
  const start = preparationEvent({ sourceElement: link });
  doc.dispatch("astro:before-preparation", start);
  assert.equal(link.dataset.navigationPending, "true");
  assert.equal(doc.body.dataset.navigating, "true");
  assert.equal(doc.page.bookmark.dataset.visible, undefined);
  await start.loader();
  doc.dispatch("astro:after-preparation");
  assert.equal(win.pendingTimerCount, 0);
  assert.equal(link.dataset.navigationPending, "true");

  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  assert.equal(link.dataset.navigationPending, undefined);
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  assert.deepEqual(incoming.content.animations[0], {
    keyframes: [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" }
    ],
    options: { duration: 240, easing: "cubic-bezier(0.2, 0.7, 0.25, 1)", fill: "both" }
  });
  assert.equal(incoming.body.animations.length, 0);
  incoming.content.animationHandle.finish();
  assert.equal(incoming.content.animationHandle.cancelled, true);
  doc.dispatch("astro:page-load");
  assertCleared(doc, win, link);
});

test("50ms, 150ms and 499ms navigations never show or announce a loading label", async () => {
  for (const delay of [50, 150, 499]) {
    const { doc, win } = setup();
    const event = preparationEvent({ loader: async () => "ready" });
    doc.dispatch("astro:before-preparation", event);
    win.advance(delay);
    assert.equal(doc.page.bookmark.dataset.visible, undefined);
    assert.equal(doc.page.message.textContent, "");
    assert.equal(await event.loader(), "ready");
    doc.dispatch("astro:after-preparation");
    doc.dispatch("astro:after-swap");
    doc.dispatch("astro:page-load");
    win.advance(1000);
    assertCleared(doc, win);
  }
});

test("at 500ms the bookmark announces the exact Japanese text and disappears on readiness", () => {
  const { doc, win } = setup();
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(499);
  assert.equal(doc.page.bookmark.dataset.visible, undefined);
  win.advance(1);
  assert.equal(doc.page.bookmark.dataset.visible, "true");
  assert.equal(doc.page.message.textContent, "次の頁をめくる…");
  doc.dispatch("astro:after-preparation");
  assert.equal(doc.page.bookmark.dataset.visible, undefined);
  assert.equal(doc.page.message.textContent, "");
  assert.equal(win.pendingTimerCount, 0);
  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  doc.dispatch("astro:page-load");
  win.advance(1000);
  assertCleared(doc, win);
});

test("abort, rejection and prevention each clear the bookmark, pending link and timer", async () => {
  for (const delay of [50, 550]) {
    for (const outcome of ["abort", "reject", "prevent"]) {
      const { doc, win } = setup();
      const link = navLink();
      const controller = new AbortController();
      const event = preparationEvent({ sourceElement: link, signal: controller.signal, loader: async () => {
        if (outcome === "reject") throw new Error("network failure");
        if (outcome === "prevent") event.defaultPrevented = true;
      } });
      doc.dispatch("astro:before-preparation", event);
      win.advance(delay);
      if (delay >= 500) assert.equal(doc.page.bookmark.dataset.visible, "true");
      if (outcome === "abort") controller.abort();
      else if (outcome === "reject") await assert.rejects(event.loader(), /network failure/);
      else await event.loader();
      win.advance(1000);
      assertCleared(doc, win, link);
    }
  }
});

test("preventDefault without running the loader also clears click feedback", async () => {
  const { doc, win } = setup();
  const link = navLink();
  const event = preparationEvent({ sourceElement: link });
  doc.dispatch("astro:before-preparation", event);
  event.defaultPrevented = true;
  await Promise.resolve();
  win.advance(1000);
  assertCleared(doc, win, link);
});

test("a late abort and loader completion from an older click cannot clear the new request", async () => {
  const { doc, win } = setup();
  const oldController = new AbortController();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const old = preparationEvent({ signal: oldController.signal, loader: () => wait });
  doc.dispatch("astro:before-preparation", old);
  const run = old.loader();
  const link = navLink();
  const controller = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement: link, signal: controller.signal }));
  oldController.abort();
  release();
  await run;
  win.advance(500);
  assert.equal(doc.page.bookmark.dataset.visible, "true");
  assert.equal(link.dataset.navigationPending, "true");
  controller.abort();
  assertCleared(doc, win, link);
});

test("late rejection from an older click cannot dismiss the current Japanese bookmark", async () => {
  const { doc, win } = setup();
  let rejectOld;
  const wait = new Promise((resolve, reject) => { rejectOld = reject; });
  const event = preparationEvent({ loader: () => wait });
  doc.dispatch("astro:before-preparation", event);
  const run = event.loader();
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(500);
  rejectOld(new Error("old request failed"));
  await assert.rejects(run, /old request failed/);
  assert.equal(doc.page.bookmark.dataset.visible, "true");
  assert.equal(doc.page.message.textContent, "次の頁をめくる…");
});

test("consecutive clicks reset the 500ms deadline and move the pending highlight", () => {
  const { doc, win } = setup();
  const oldLink = navLink();
  const currentLink = navLink();
  const oldController = new AbortController();
  const currentController = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement: oldLink, signal: oldController.signal }));
  win.advance(450);
  doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement: currentLink, signal: currentController.signal }));
  oldController.abort();
  assert.equal(oldLink.dataset.navigationPending, undefined);
  assert.equal(currentLink.dataset.navigationPending, "true");
  assert.equal(win.pendingTimerCount, 1);
  win.advance(499);
  assert.equal(doc.page.bookmark.dataset.visible, undefined);
  win.advance(1);
  assert.equal(doc.page.bookmark.dataset.visible, "true");
  currentController.abort();
  assertCleared(doc, win, currentLink);
});

test("a new navigation cancels the previous content entrance without retaining transforms", () => {
  const { doc, win } = setup();
  doc.dispatch("astro:before-preparation", preparationEvent());
  doc.dispatch("astro:after-swap");
  const animation = doc.page.content.animationHandle;
  assert.equal(animation.cancelled, false);
  doc.dispatch("astro:page-load");
  doc.dispatch("astro:before-preparation", preparationEvent());
  assert.equal(animation.cancelled, true);
  assert.equal(win.pendingTimerCount, 1);
});

test("reduced motion retains a static Japanese message without content or book animation", () => {
  const { doc, win } = setup(true);
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(500);
  assert.equal(doc.page.message.textContent, "次の頁をめくる…");
  doc.dispatch("astro:after-swap");
  assert.equal(doc.page.content.animations.length, 0);
  assertCleared(doc, win);
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/theme.css"));
  const reduced = css.nodes.find((node) => node.type === "atrule" && node.params === "(prefers-reduced-motion: reduce)");
  const pages = reduced.nodes.find((node) => node.selector === '.navigation-bookmark[data-visible="true"] .navigation-book-page');
  assert.equal(pages.nodes.find((node) => node.prop === "animation").value, "none");
});

test("back-forward cache restores without a stuck label, pending highlight or animation", () => {
  const { doc, win } = setup();
  const link = navLink();
  for (const delay of [100, 500]) {
    doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement: link }));
    win.advance(delay);
    win.dispatch("pageshow", { persisted: true });
    win.advance(1000);
    assertCleared(doc, win, link);
  }
  doc.dispatch("astro:before-preparation", preparationEvent());
  doc.dispatch("astro:after-swap");
  const animation = doc.page.content.animationHandle;
  win.dispatch("pageshow", { persisted: true });
  assert.equal(animation.cancelled, true);
});

test("page-load alone clears timers and pending links without waiting for animationend", () => {
  const { doc, win } = setup();
  const link = navLink();
  doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement: link }));
  win.advance(100);
  doc.dispatch("astro:page-load");
  win.advance(1000);
  assertCleared(doc, win, link);
});

test("nested navigation icons resolve to their link without changing aria-current", () => {
  const { doc, win } = setup();
  const link = navLink();
  link.setAttribute("aria-current", "page");
  const sourceElement = { closest: (selector) => selector === ".nav-links a" ? link : null };
  doc.dispatch("astro:before-preparation", preparationEvent({ sourceElement }));
  assert.equal(link.dataset.navigationPending, "true");
  assert.equal(link.attributes.get("aria-current"), "page");
  doc.dispatch("astro:page-load");
  assertCleared(doc, win, link);
  assert.equal(link.attributes.get("aria-current"), "page");
});

test("article links and browser-back navigation still get the delayed bookmark", () => {
  for (const event of [preparationEvent({ sourceElement: { closest: () => null } }), preparationEvent({ type: "traverse" })]) {
    const { doc, win } = setup();
    doc.dispatch("astro:before-preparation", event);
    win.advance(500);
    assert.equal(doc.page.message.textContent, "次の頁をめくる…");
    doc.dispatch("astro:page-load");
    assertCleared(doc, win);
  }
});

test("optional nodes or unsupported animate API do not prevent navigation completion", () => {
  const { doc, win } = setup();
  doc.querySelector = () => null;
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(500);
  doc.dispatch("astro:after-swap");
  doc.dispatch("astro:page-load");
  assert.equal(win.pendingTimerCount, 0);
  assert.equal(doc.body.dataset.navigating, undefined);
  const next = setup();
  next.doc.page.content.animate = undefined;
  next.doc.dispatch("astro:before-preparation", preparationEvent());
  next.doc.dispatch("astro:after-swap");
  next.doc.dispatch("astro:page-load");
  assertCleared(next.doc, next.win);
});

test("the loading bar is gone from layout, styling and runtime, not merely hidden", () => {
  for (const path of ["layouts/BaseLayout.astro", "styles/theme.css", "lib/navigation-feedback.mjs"]) {
    assert.doesNotMatch(read("../src/themes/fuyukawa-kagari/" + path), /navigation-progress|PROGRESS_DELAY|progressTimer/);
  }
  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const nav = layout.match(/<nav class="nav-links"[^]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.match(nav, /data-navigation-bookmark role="status" aria-live="polite" aria-atomic="true" lang="ja"/);
  assert.match(nav, /<span data-navigation-message><\/span>/);
  assert.match(nav, /navigation-book-page--second/);
  assert.match(layout, /<html lang="zh-CN" data-theme="fuyukawa-kagari" transition:animate="none">/);
  assert.match(layout, /transition:persist="yuimi-toy-dock"/);
  assert.match(layout, /<SakuraRain \/>/);
});

test("the paper bookmark stays anchored, non-blocking and uses only transform/opacity keyframes", () => {
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/theme.css"));
  const rule = css.nodes.find((node) => node.type === "rule" && node.selector === ".navigation-bookmark");
  const values = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  assert.equal(values.position, "absolute");
  assert.equal(values["pointer-events"], "none");
  assert.equal(values["max-width"], "calc(100vw - 32px)");
  const keyframes = css.nodes.find((node) => node.type === "atrule" && node.name === "keyframes" && node.params === "navigation-page-turn");
  assert.ok(keyframes);
  keyframes.walkDecls((decl) => assert.ok(["transform", "opacity"].includes(decl.prop)));
  const pending = css.nodes.find((node) => node.selector === 'body[data-fuyukawa] .site-header .nav-links a[data-navigation-pending="true"]');
  assert.equal(pending.nodes.find((node) => node.prop === "background").value, "var(--nav-fill)");
});


test("navigation routes explicitly assign pink to blog/me and blue to home/works", () => {
  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const mapping = layout.match(/tone: (\[[^\]]+\])\.includes\(item\.href\) \? "pink" : "blue"/);
  assert.ok(mapping);
  const pinkRoutes = JSON.parse(mapping[1]);
  assert.deepEqual(pinkRoutes, ["/blog/", "/about/"]);
  for (const [path, tone] of [["/", "blue"], ["/blog/", "pink"], ["/projects/", "blue"], ["/about/", "pink"]]) {
    assert.equal(pinkRoutes.includes(path) ? "pink" : "blue", tone);
  }
  assert.match(layout, /data-navigation-tone=\{item\.tone\}/);
});

test("destination gradients apply only while pending, not to static or hover backgrounds", () => {
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/refresh.css"));
  const declarationsFor = (selector) => {
    const rule = css.nodes.find((node) => node.type === "rule" && node.selector === selector);
    assert.ok(rule, selector);
    return Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  };
  const blue = declarationsFor('body[data-fuyukawa] .nav-links a');
  assert.equal(blue["--nav-ink"], "var(--accent)");
  assert.equal(blue["--nav-tint"], "#edf5fd80");
  assert.equal(blue["--nav-fill"], "linear-gradient(180deg, #ffffff45 0%, var(--nav-tint) 100%)");
  const pink = declarationsFor('body[data-fuyukawa] .nav-links a[data-navigation-tone="pink"]');
  assert.equal(pink["--nav-ink"], "var(--rose)");
  assert.equal(pink["--nav-tint"], "#fceff580");
  const selected = declarationsFor('body[data-fuyukawa] .nav-links a[aria-current="page"]');
  assert.equal(selected["box-shadow"], "inset 0 -2px 0 #a9cbe4");
  const states = declarationsFor('body[data-fuyukawa] .nav-links a:hover,\nbody[data-fuyukawa] .nav-links a[aria-current="page"]');
  assert.equal(states.background, "#edf5fd80");
  assert.equal(states.color, "var(--accent)");
  const pinkSelected = declarationsFor('body[data-fuyukawa] .nav-links a:where([data-navigation-tone="pink"])[aria-current="page"]');
  assert.equal(pinkSelected.background, "#fceff580");
  assert.equal(pinkSelected.color, "var(--rose)");
  assert.equal(blue["--nav-tint"], states.background);
  assert.equal(pink["--nav-tint"], pinkSelected.background);
  assert.doesNotMatch(css.toString(), /nav-links a:nth-child\(even\)/);
  const theme = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/theme.css"));
  const pending = theme.nodes.find((node) => node.selector === 'body[data-fuyukawa] .site-header .nav-links a[data-navigation-pending="true"]');
  assert.equal(pending.nodes.find((node) => node.prop === "background").value, "var(--nav-fill)");
  assert.equal(pending.nodes.find((node) => node.prop === "color").value, "var(--nav-ink)");
  css.walkDecls("background", (decl) => assert.notEqual(decl.value, "var(--nav-fill)", decl.parent.selector));
});


test("BLOG and ME hover capsules are pink while HOME and WORKS stay blue", () => {
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/refresh.css"));
  const rule = css.nodes.find((node) => node.type === "rule" && node.selector === 'body[data-fuyukawa] .nav-links a[data-navigation-tone="pink"]:hover');
  assert.ok(rule);
  const declarations = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  assert.equal(declarations.background, "#fceff580");
  assert.equal(declarations.color, "var(--rose)");
  const defaultHover = css.nodes.find((node) => node.type === "rule" && node.selector === 'body[data-fuyukawa] .nav-links a:hover,\nbody[data-fuyukawa] .nav-links a[aria-current="page"]');
  assert.ok(defaultHover);
  assert.equal(defaultHover.nodes.find((node) => node.prop === "background").value, "#edf5fd80");
});

test("shared theme styles use ordered external URLs across client-side page swaps", () => {
  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const head = layout.match(/<head>([^]*?)<\/head>/)?.[1];
  assert.ok(head);
  const hrefs = [...head.matchAll(/<link rel="stylesheet" href=\{(?:`\$\{)?(\w+)/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ["themeHref", "refreshHref", "mangaHref", "refreshPagesHref", "mangaPagesHref"]);
  for (const name of ["theme", "refresh", "manga"]) {
    assert.ok(layout.includes(`import ${name}Href from "../styles/${name}.css?url";`));
  }
  assert.doesNotMatch(layout, /import\s+["'][^"']*\/(?:theme|refresh|manga)\.css["']/);
});

test("shared stylesheet requests bypass stale CDN 404 entries without changing the palette", () => {
  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  assert.match(layout, /const sharedStylesheetVersion = "20260928-blog-search-toc";/);
  for (const name of ["theme", "refresh", "manga"]) {
    assert.ok(layout.includes('<link rel="stylesheet" href={`${' + name + 'Href}?v=${sharedStylesheetVersion}`} />'));
  }
});

test("idle glass capsule retains its original transparency, blur, radius and dimensions", () => {
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/refresh.css"));
  const nav = css.nodes.find((node) => node.type === "rule" && node.selector === "body[data-fuyukawa] .nav-links");
  const values = Object.fromEntries(nav.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  assert.equal(values.background, "#ffffff45");
  assert.equal(values["backdrop-filter"], "blur(8px)");
  assert.equal(values["-webkit-backdrop-filter"], "blur(8px)");
  assert.equal(values["border-radius"], "999px");
  assert.equal(values.padding, "5px");
  const link = css.nodes.find((node) => node.type === "rule" && node.selector === "body[data-fuyukawa] .nav-links a");
  const styles = Object.fromEntries(link.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  assert.equal(styles.background, "transparent");
  assert.equal(styles["min-height"], "46px");
  assert.equal(styles.padding, "7px 13px");
});

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
  assert.match(layout, /<html lang="zh-CN" transition:animate="none">/);
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
  assert.equal(pending.nodes.find((node) => node.prop === "background").value, "var(--pink-soft)");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postcss from "postcss";
import { installNavigationFeedback } from "../src/themes/fuyukawa-kagari/lib/navigation-feedback.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

class FakeElement {
  constructor() {
    this.dataset = {};
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
  const progress = new FakeElement();
  const fill = new FakeElement();
  const content = new FakeElement();
  progress.children.set("[data-navigation-progress-fill]", fill);
  body.children.set("[data-navigation-progress]", progress);
  body.children.set("#page-content", content);
  return {
    body,
    progress,
    fill,
    content,
    querySelector(selector) {
      if (selector === "[data-navigation-progress]") return progress;
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
      if (selector === "[data-navigation-progress]") return page.progress;
      if (selector === "#page-content") return page.content;
      return null;
    },
    swapTo(nextPage) { page = nextPage; },
    get page() { return page; }
  };
}

function makeWindow(reducedMotion = false) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  return {
    addEventListener() {},
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

function preparationEvent({ signal = new AbortController().signal, loader = async () => {}, type = "push" } = {}) {
  return { signal, loader, navigationType: type, defaultPrevented: false };
}

test("Astro lifecycle paints immediate feedback, completes progress, and fades the swapped main only", async () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);

  const start = preparationEvent();
  doc.dispatch("astro:before-preparation", start);
  assert.equal(doc.body.dataset.navigating, "true");
  assert.equal(doc.page.progress.dataset.state, undefined);
  win.advance(100);
  assert.equal(doc.page.progress.dataset.state, "loading");
  await start.loader();

  doc.dispatch("astro:after-preparation");
  assert.equal(doc.page.progress.dataset.state, "prepared");

  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  assert.equal(incoming.body.dataset.navigating, "true");
  assert.equal(incoming.progress.dataset.state, "prepared");
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  assert.deepEqual(incoming.content.animations[0], {
    keyframes: [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ],
    options: { duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.25, 1)", fill: "both" }
  });
  incoming.content.animationHandle.finish();
  assert.equal(incoming.content.animationHandle.cancelled, true);

  doc.dispatch("astro:page-load");
  assert.equal(incoming.body.dataset.navigating, undefined);
  assert.equal(incoming.progress.dataset.state, "complete");
  doc.dispatch("animationend", { target: incoming.progress, animationName: "navigation-progress-fade-out" });
  assert.equal(incoming.progress.dataset.state, undefined);

  const back = preparationEvent({ type: "traverse" });
  doc.dispatch("astro:before-preparation", back);
  win.advance(100);
  assert.equal(doc.page.progress.dataset.state, "loading");
  assert.equal(doc.body.dataset.navigating, "true");
});

test("aborted, rejected, and prevented preparations clear the active loading state", async () => {
  const doc = makeDocument();
  installNavigationFeedback(doc, makeWindow());

  const controller = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ signal: controller.signal }));
  controller.abort();
  assert.equal(doc.body.dataset.navigating, undefined);
  assert.equal(doc.page.progress.dataset.state, undefined);

  const rejected = preparationEvent({ loader: async () => { throw new Error("network failure"); } });
  doc.dispatch("astro:before-preparation", rejected);
  await assert.rejects(rejected.loader(), /network failure/);
  assert.equal(doc.body.dataset.navigating, undefined);
  assert.equal(doc.page.progress.dataset.state, undefined);

  const prevented = preparationEvent({ loader: async () => { prevented.defaultPrevented = true; } });
  doc.dispatch("astro:before-preparation", prevented);
  await prevented.loader();
  assert.equal(doc.body.dataset.navigating, undefined);
  assert.equal(doc.page.progress.dataset.state, undefined);
});

test("a late abort from an older rapid click cannot clear the newer navigation", async () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);

  const oldController = new AbortController();
  let releaseOldLoader;
  const oldLoaderWait = new Promise((resolve) => { releaseOldLoader = resolve; });
  const oldNavigation = preparationEvent({ signal: oldController.signal, loader: () => oldLoaderWait });
  doc.dispatch("astro:before-preparation", oldNavigation);
  const oldLoader = oldNavigation.loader();

  const newController = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ signal: newController.signal }));
  oldController.abort();
  releaseOldLoader();
  await oldLoader;
  win.advance(100);
  assert.equal(doc.body.dataset.navigating, "true");
  assert.equal(doc.page.progress.dataset.state, "loading");

  newController.abort();
  assert.equal(doc.body.dataset.navigating, undefined);
  assert.equal(doc.page.progress.dataset.state, undefined);
});

test("a new navigation cancels a finished-page animation before dimming the outgoing main", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(100);

  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  const oldContentAnimation = incoming.content.animationHandle;
  assert.equal(oldContentAnimation.cancelled, false);

  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(100);
  assert.equal(oldContentAnimation.cancelled, true);
  assert.equal(doc.body.dataset.navigating, "true");
  assert.equal(doc.page.progress.dataset.state, "loading");
});

test("reduced motion skips content translation while retaining the lightweight progress indicator", () => {
  const doc = makeDocument();
  const win = makeWindow(true);
  installNavigationFeedback(doc, win);
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(100);
  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  assert.equal(incoming.content.animations.length, 0);
  assert.equal(incoming.progress.dataset.state, "prepared");

  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const css = postcss.parse(read("../src/themes/fuyukawa-kagari/styles/theme.css"));
  const progressRule = css.nodes.find((node) => node.type === "rule" && node.selector === ".navigation-progress");
  const declarations = Object.fromEntries(progressRule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  assert.equal(declarations.position, "fixed");
  assert.equal(declarations.height, "2px");
  assert.equal(declarations["z-index"], "1000");
  assert.match(css.toString(), /navigation-progress-fill[^}]*transform: scaleX\(0\)/);
  assert.match(css.toString(), /navigation-progress\[data-state="loading"\][^]*?scaleX\(0\.8\)/);
  assert.match(css.toString(), /prefers-reduced-motion: reduce[^]*?#page-content[^]*?transition: none/);
  assert.match(css.toString(), /prefers-reduced-motion: reduce[^]*?opacity: 1;[^]*?transform: none/);
  assert.match(layout, /data-navigation-progress/);
  assert.match(layout, /installNavigationFeedback\(document, window\)/);
});

test("a 50ms navigation keeps immediate main feedback but never shows the progress bar", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  doc.dispatch("astro:before-preparation", preparationEvent());

  assert.equal(doc.body.dataset.navigating, "true");
  win.advance(50);
  assert.equal(doc.page.progress.dataset.state, undefined);
  doc.dispatch("astro:after-preparation");
  assert.equal(win.pendingTimerCount, 0);
  assert.equal(doc.page.progress.dataset.state, undefined);

  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  doc.dispatch("astro:page-load");
  assert.equal(incoming.progress.dataset.state, undefined);
  assert.equal(incoming.body.dataset.navigating, undefined);
});

test("a 150ms preparation shows progress and completes it through Astro page-load", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(150);
  assert.equal(doc.page.progress.dataset.state, "loading");

  doc.dispatch("astro:after-preparation");
  assert.equal(doc.page.progress.dataset.state, "prepared");
  const incoming = makePage();
  doc.dispatch("astro:before-swap", { newDocument: incoming });
  doc.swapTo(incoming);
  doc.dispatch("astro:after-swap");
  doc.dispatch("astro:page-load");
  assert.equal(incoming.progress.dataset.state, "complete");
});

test("cancelling before the threshold clears the pending progress timer", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  const controller = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ signal: controller.signal }));
  win.advance(50);
  assert.equal(win.pendingTimerCount, 1);

  controller.abort();
  assert.equal(win.pendingTimerCount, 0);
  assert.equal(doc.page.progress.dataset.state, undefined);
  win.advance(150);
  assert.equal(doc.page.progress.dataset.state, undefined);
  assert.equal(doc.body.dataset.navigating, undefined);
});

test("consecutive navigations replace the old threshold timer without stale effects", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  const oldController = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ signal: oldController.signal }));
  win.advance(50);

  const currentController = new AbortController();
  doc.dispatch("astro:before-preparation", preparationEvent({ signal: currentController.signal }));
  oldController.abort();
  assert.equal(win.pendingTimerCount, 1);
  win.advance(50);
  assert.equal(doc.page.progress.dataset.state, undefined);
  win.advance(50);
  assert.equal(doc.page.progress.dataset.state, "loading");
  assert.equal(doc.body.dataset.navigating, "true");

  currentController.abort();
  assert.equal(win.pendingTimerCount, 0);
  assert.equal(doc.page.progress.dataset.state, undefined);
});

test("page-load before 100ms cancels the timer without flashing 100 percent", () => {
  const doc = makeDocument();
  const win = makeWindow();
  installNavigationFeedback(doc, win);
  doc.dispatch("astro:before-preparation", preparationEvent());
  win.advance(50);
  doc.dispatch("astro:after-swap");
  doc.dispatch("astro:page-load");

  assert.equal(win.pendingTimerCount, 0);
  assert.equal(doc.page.progress.dataset.state, undefined);
  win.advance(150);
  assert.equal(doc.page.progress.dataset.state, undefined);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installTabTitleFeedback } from "../src/themes/fuyukawa-kagari/lib/tab-title-feedback.mjs";

const hiddenTitle = "w(ﾟДﾟ)w 不要走！再看看嘛！";
const returnTitle = "♪(^∇^*)欢迎回来！";

function fixture(title = "首页 | Feliz", hidden = false) {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, { callback: () => void; dueAt: number }>();
  let now = 0;
  let nextTimer = 0;
  const doc = {
    title,
    hidden,
    addEventListener(name: string, callback: () => void) {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    removeEventListener(name: string, callback: () => void) { listeners.get(name)?.delete(callback); }
  };
  const win = {
    setTimeout(callback: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { callback, dueAt: now + delay });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); }
  };
  const install = () => installTabTitleFeedback(doc as unknown as Document, win as unknown as Window & typeof globalThis);
  const fire = (name: string) => { for (const callback of listeners.get(name) ?? []) callback(); };
  const visibility = (hidden: boolean) => { doc.hidden = hidden; fire("visibilitychange"); };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.dueAt <= now) { timers.delete(id); timer.callback(); }
    }
  };
  const navigate = (title: string) => {
    fire("astro:before-swap");
    doc.title = title;
    fire("astro:after-swap");
    fire("astro:page-load");
  };
  return { doc, timers, listeners, install, fire, visibility, advance, navigate };
}

test("the shared layout installs tab title feedback", () => {
  const source = readFileSync(new URL("../src/themes/fuyukawa-kagari/lib/layout-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ installTabTitleFeedback \} from "\.\/tab-title-feedback\.mjs"/);
  assert.match(source, /installTabTitleFeedback\(document, window\)/);
});

test("cold loading a visible page preserves its original title without a timer", () => {
  const f = fixture(); f.install();
  assert.equal(f.doc.title, "首页 | Feliz");
  assert.equal(f.timers.size, 0);
  f.visibility(false);
  assert.equal(f.doc.title, "首页 | Feliz");
});

test("leaving uses exactly the reference site's characters and punctuation", () => {
  const f = fixture(); f.install(); f.visibility(true);
  assert.equal(f.doc.title, hiddenTitle);
  assert.equal(f.timers.size, 0);
});

test("returning welcomes for exactly 2000ms, then restores the original title", () => {
  const f = fixture(); f.install(); f.visibility(true); f.visibility(false);
  assert.equal(f.doc.title, returnTitle);
  assert.equal(f.timers.size, 1);
  f.advance(1999); assert.equal(f.doc.title, returnTitle);
  f.advance(1); assert.equal(f.doc.title, "首页 | Feliz");
  assert.equal(f.timers.size, 0);
});

test("a repeated visible event neither duplicates nor extends the welcome timer", () => {
  const f = fixture(); f.install(); f.visibility(true); f.visibility(false);
  f.advance(1500); f.visibility(false);
  assert.equal(f.timers.size, 1);
  f.advance(500); assert.equal(f.doc.title, "首页 | Feliz");
});

test("leaving during the welcome cancels restoration and retains the hidden title", () => {
  const f = fixture(); f.install(); f.visibility(true); f.visibility(false);
  f.advance(1000); f.visibility(true);
  assert.equal(f.timers.size, 0);
  f.advance(5000); assert.equal(f.doc.title, hiddenTitle);
  f.visibility(false); f.advance(2000);
  assert.equal(f.doc.title, "首页 | Feliz");
});

test("rapid repeated departures never save a transient title as the original", () => {
  const f = fixture(); f.install();
  for (let i = 0; i < 5; i++) {
    f.visibility(true); f.visibility(true);
    assert.equal(f.doc.title, hiddenTitle);
    f.visibility(false); assert.equal(f.doc.title, returnTitle);
    f.advance(100);
  }
  assert.equal(f.timers.size, 1);
  f.advance(1900); assert.equal(f.doc.title, "首页 | Feliz");
});

test("a page initially opened in the background welcomes on its first return", () => {
  const f = fixture("文章 | Feliz", true); f.install();
  assert.equal(f.doc.title, hiddenTitle);
  f.visibility(false); assert.equal(f.doc.title, returnTitle);
  f.advance(2000); assert.equal(f.doc.title, "文章 | Feliz");
});

test("soft navigation restores the destination page title on the next return", () => {
  const f = fixture(); f.install(); f.navigate("关于 | Feliz");
  assert.equal(f.doc.title, "关于 | Feliz");
  f.visibility(true); f.visibility(false); f.advance(2000);
  assert.equal(f.doc.title, "关于 | Feliz");
});

test("navigation during a welcome cancels the old timer instead of overwriting the destination", () => {
  const f = fixture(); f.install(); f.visibility(true); f.visibility(false);
  f.advance(1000); f.navigate("博客 | Feliz");
  assert.equal(f.timers.size, 0);
  f.advance(5000); assert.equal(f.doc.title, "博客 | Feliz");
});

test("navigation in the background retains the hidden message and remembers the new title", () => {
  const f = fixture(); f.install(); f.visibility(true); f.navigate("文章 | Feliz");
  assert.equal(f.doc.title, hiddenTitle);
  f.visibility(false); assert.equal(f.doc.title, returnTitle);
  f.advance(2000); assert.equal(f.doc.title, "文章 | Feliz");
});

test("back and forward page swaps each refresh the original title", () => {
  const f = fixture(); f.install();
  for (const title of ["博客 | Feliz", "首页 | Feliz", "博客 | Feliz"]) {
    f.navigate(title); f.visibility(true); f.visibility(false); f.advance(2000);
    assert.equal(f.doc.title, title);
  }
});

test("duplicate installation and page-load events do not add listeners or reset the title", () => {
  const f = fixture(); const cleanup = f.install();
  assert.equal(f.install(), cleanup);
  for (const callbacks of f.listeners.values()) assert.equal(callbacks.size, 1);
  f.visibility(true); f.visibility(false); f.fire("astro:page-load");
  assert.equal(f.doc.title, returnTitle);
  f.advance(2000); assert.equal(f.doc.title, "首页 | Feliz");
});

test("cleanup removes listeners and timers, restores the title and permits reinstallation", () => {
  const f = fixture(); const cleanup = f.install();
  f.visibility(true); f.visibility(false); cleanup();
  assert.equal(f.doc.title, "首页 | Feliz");
  assert.equal(f.timers.size, 0);
  for (const callbacks of f.listeners.values()) assert.equal(callbacks.size, 0);
  f.doc.title = "新标题"; cleanup(); f.visibility(true); f.advance(2000);
  assert.equal(f.doc.title, "新标题");
  f.visibility(false); f.install(); f.visibility(true);
  assert.equal(f.doc.title, hiddenTitle);
});

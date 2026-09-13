import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/themes/kisara/lib/layoutRuntime.js");
const between = (start: string, end: string) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
};

function fixture(scale = 1) {
  const doc: any = { activeElement: null };
  class Element extends EventTarget {
    hidden = true;
    isConnected = true;
    attributes: Record<string, string> = {};
    style: any = { setProperty(key: string, value: string) { this[key] = value; } };
    classList = { remove() {}, toggle() {} };
    offsetWidth = 292;
    offsetHeight = 368;
    focus() { doc.activeElement = this; }
    contains(node: any) { return node === this || items.includes(node); }
    querySelector() { return items[1]; }
    querySelectorAll() { return items; }
    closest(selector: string) { return this.attributes.native && selector.includes("input") ? this : null; }
  }
  const items = Array.from({ length: 6 }, () => new Element());
  const menu = new Element(), trigger = new Element();
  trigger.focus();
  const win = Object.assign(new EventTarget(), { innerWidth: 320, innerHeight: 568, clearTimeout() {} });
  const controller = new AbortController();
  const runtime = new Function("menu", "document", "window", "HTMLElement", "Element", "Node", "items", "signal", "getKisaraScale", `
    let returnFocus = null, menuSession = 0;
    const panelButton = null, clearFeedback = () => {}, closePanel = () => {};
    ${between("  const closeMenu =", '  panelButton?.addEventListener("click"')}
    return { showMenu, closeMenu, keepNativeMenu, session: () => menuSession };
  `)(menu, doc, win, Element, Element, Element, items, controller.signal, () => scale);
  return { runtime, menu, trigger, items, doc, win, Element, destroy: () => controller.abort() };
}

test("Context menu uses final dimensions and preserves the original focus across repeated openings", () => {
  const f = fixture();
  try {
    f.runtime.showMenu(319, 567, true);
    assert.equal(f.menu.style.left, "16px");
    assert.equal(f.menu.style.top, "188px");
    assert.equal(f.menu.style["--menu-origin"], "right bottom");
    assert.equal(f.doc.activeElement, f.items[1]);
    f.runtime.showMenu(-10, -20, true);
    assert.equal(f.menu.style.left, "12px");
    assert.equal(f.menu.style.top, "12px");
    f.runtime.closeMenu();
    assert.equal(f.doc.activeElement, f.trigger);
    assert.equal(f.menu.hidden, true);
  } finally { f.destroy(); }
});

test("Context menu arrow keys wrap, Home/End select boundaries and Tab dismisses", () => {
  const f = fixture();
  const key = (value: string) => f.menu.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: value }));
  try {
    f.runtime.showMenu(30, 30, true);
    key("Home");
    assert.equal(f.doc.activeElement, f.items[0]);
    key("ArrowUp");
    assert.equal(f.doc.activeElement, f.items.at(-1));
    key("ArrowDown");
    assert.equal(f.doc.activeElement, f.items[0]);
    key("End");
    assert.equal(f.doc.activeElement, f.items.at(-1));
    key("Tab");
    assert.equal(f.menu.hidden, true);
  } finally { f.destroy(); }
});

test("Context menu converts viewport positions to the 90 percent theme coordinate space", () => {
  const f = fixture(.9);
  try {
    f.runtime.showMenu(319, 567);
    const left = Number.parseFloat(f.menu.style.left);
    const top = Number.parseFloat(f.menu.style.top);
    assert.ok(Math.abs((left + f.menu.offsetWidth + 12) * .9 - 320) < .001);
    assert.ok(Math.abs((top + f.menu.offsetHeight + 12) * .9 - 568) < .001);
    f.runtime.showMenu(100, 110);
    assert.ok(Number.parseFloat(f.menu.style.left) * .9 <= 100);
  } finally { f.destroy(); }
});

test("Context menu preserves editable targets and closes on viewport change without reviving focus on blur", () => {
  const f = fixture();
  try {
    const input = new f.Element();
    input.attributes.native = "true";
    assert.equal(f.runtime.keepNativeMenu(input), true);
    assert.equal(f.runtime.keepNativeMenu(f.trigger), false);
    f.runtime.showMenu(10, 10);
    f.win.dispatchEvent(new Event("resize"));
    assert.equal(f.menu.hidden, true);
    f.runtime.showMenu(10, 10, true);
    f.win.dispatchEvent(new Event("blur"));
    assert.equal(f.menu.hidden, true);
    assert.notEqual(f.doc.activeElement, f.trigger);
  } finally { f.destroy(); }
});

test("Menu copy feedback keeps labels stable and rejects completion after close or navigation", () => {
  const feedback = between("  const showActionFeedback =", "  const closeMenu =");
  assert.doesNotMatch(feedback, /textContent/);
  assert.match(feedback, /clearTimeout\(feedbackTimer\)/);
  assert.match(source, /signal\.aborted \|\| menu\?\.hidden \|\| session !== menuSession/);
  assert.match(source, /event\.shiftKey \|\| keepNativeMenu\(event\.target\) \|\| window\.getSelection/);
  assert.match(source, /action === "copy-title" \? document\.title/);
  assert.match(between("  const cleanup =", "  window.__yuimiKisaraLayoutCleanup = cleanup;"), /clearFeedback\(\)/);
});

test("Late clipboard results cannot write feedback into a closed, reopened or disposed menu", async () => {
  for (const interruption of ["closed", "reopened", "disposed", "none"]) {
    let resolve!: (value: boolean) => void;
    const task = new Promise<boolean>(done => { resolve = done; });
    const feedback: any[] = [];
    const menu = { hidden: false }, signal = { aborted: false };
    const runtime = new Function("menu", "signal", "task", "feedback", `
      let menuSession = 1;
      const action = "copy-title", document = { title: "Test title" }, window = { location: { href: "/" } };
      const copyText = () => task, showActionFeedback = (...args) => feedback.push(args);
      return {
        reopen: () => { menuSession++; },
        run: async () => { ${between('    if (action === "copy" || action === "copy-title")', "    if (action) closeMenu();")} }
      };
    `)(menu, signal, task, feedback);
    const pending = runtime.run();
    if (interruption === "closed") menu.hidden = true;
    if (interruption === "reopened") runtime.reopen();
    if (interruption === "disposed") signal.aborted = true;
    resolve(true);
    await pending;
    assert.equal(feedback.length, interruption === "none" ? 1 : 0);
  }
});

test("Kisara menu has five route links, all theme choices and no legacy glass layers", () => {
  const layout = read("src/themes/kisara/layouts/KisaraLayout.astro");
  const css = read("src/themes/kisara/styles/context-menu.css");
  const menu = layout.slice(layout.indexOf('<nav class="kisara-context-menu"'), layout.indexOf("<ThemeLongPressMenu"));
  assert.match(menu, /navItems\.map/);
  assert.match(menu, /themeOptions\.map/);
  assert.match(menu, /aria-current=\{item\.active/);
  assert.match(menu, /role="status"/);
  assert.match(css, /overflow: auto/);
  assert.doesNotMatch(css, /backdrop-filter|filter:|gradient|infinite/);
  assert.doesNotMatch(read("src/themes/kisara/styles/theme.css"), /kisara-context-command-grid|kisara-context-compact-arrive/);
});

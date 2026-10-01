import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isNativeContextTarget as nativeContextTarget } from "../src/core/themes/context-menu-routing.mjs";

type MockDocument = {
  createElement?: () => { getContext: () => { clearRect: () => void; drawImage: () => void; getImageData: () => { data: number[] } } };
  caretRangeFromPoint?: () => { startContainer: { nodeType: number } };
  createRange?: () => { selectNodeContents: () => void; getClientRects: () => { left: number; right: number; top: number; bottom: number }[] };
};
type MockWindow = { getSelection: () => { isCollapsed: boolean }; getComputedStyle?: () => { objectFit: string; objectPosition: string } };
// Adapt deliberate DOM test doubles at the browser boundary; their fields stay checked above.
const isNativeContextTarget = (event: { target: ReturnType<typeof target>; clientX?: number; clientY?: number }, refs: { documentRef?: MockDocument; windowRef?: MockWindow } = {}) => nativeContextTarget(event, {
  documentRef: refs.documentRef as unknown as Document,
  windowRef: refs.windowRef as unknown as Window & typeof globalThis
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function target(closestMap: Record<string, boolean> = {}) {
  return {
    nodeType: 1,
    tagName: "", naturalWidth: 0, naturalHeight: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    closest(selector: string) {
      const selectors = selector.split(",").map((entry) => entry.trim());
      return Object.entries(closestMap).some(([match, value]) => value && selectors.includes(match))
        ? this
        : null;
    }
  };
}

test("interactive elements and media retain browser context actions", () => {
  for (const selector of ["a[href]", "area[href]", "button", "img", "picture", "canvas", "video", "svg"]) {
    assert.equal(isNativeContextTarget({ target: target({ [selector]: true }) }), true, selector);
  }
});

test("transparent pixels in an image hitbox count as blank while painted pixels stay native", () => {
  const checkPixel = (alpha: number, selected = false) => {
    const image = target({ img: true });
    image.tagName = "IMG";
    image.naturalWidth = 100;
    image.naturalHeight = 100;
    image.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
    const context = {
      clearRect() {},
      drawImage() {},
      getImageData: () => ({ data: [0, 0, 0, alpha] })
    };
    const documentRef = {
      createElement: () => ({ getContext: () => context })
    };
    const windowRef = {
      getComputedStyle: () => ({ objectFit: "fill", objectPosition: "50% 50%" }),
      getSelection: () => ({ isCollapsed: !selected })
    };
    return isNativeContextTarget({ target: image, clientX: 50, clientY: 50 }, { documentRef, windowRef });
  };

  assert.equal(checkPixel(0), false);
  assert.equal(checkPixel(255), true);
  assert.equal(checkPixel(0, true), true);
});

test("selected text and a text hit-test retain native context actions", () => {
  const blank = target();
  assert.equal(isNativeContextTarget({ target: blank }, {
    windowRef: { getSelection: () => ({ isCollapsed: false }) }
  }), true);

  assert.equal(isNativeContextTarget({ target: blank, clientX: 12, clientY: 30 }, {
    documentRef: textHitTestDocument({ left: 10, right: 20, top: 20, bottom: 40 }),
    windowRef: { getSelection: () => ({ isCollapsed: true }) }
  }), true);
});

test("blank points inside text containers remain eligible for the custom menu", () => {
  assert.equal(isNativeContextTarget({ target: target(), clientX: 12, clientY: 30 }, {
    documentRef: textHitTestDocument({ left: 100, right: 200, top: 20, bottom: 40 }),
    windowRef: { getSelection: () => ({ isCollapsed: true }) }
  }), false);
});

test("text geometry, not a nearest caret in a wide paragraph, preserves native context actions", () => {
  const paragraph = target({ p: true });
  const documentRef = textHitTestDocument({ left: 100, right: 200, top: 20, bottom: 40 });
  const windowRef = { getSelection: () => ({ isCollapsed: true }) };

  assert.equal(isNativeContextTarget({ target: paragraph, clientX: 150, clientY: 30 }, { documentRef, windowRef }), true);
  assert.equal(isNativeContextTarget({ target: paragraph, clientX: 350, clientY: 30 }, { documentRef, windowRef }), false);
});

function textHitTestDocument(rect: { left: number; right: number; top: number; bottom: number }) {
  return {
    caretRangeFromPoint: () => ({ startContainer: { nodeType: 3 } }),
    createRange: () => ({
      selectNodeContents() {},
      getClientRects: () => [rect]
    })
  };
}

test("non-article pages no longer disable selection or image-native actions", () => {
  const layout = read("../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro");
  const runtime = read("../src/themes/fuyukawa-kagari/lib/layout-runtime.mjs");
  const longPress = read("../src/core/themes/ThemeLongPressMenu.astro");

  assert.doesNotMatch(layout, /data-yuimi-selection-lock/);
  assert.doesNotMatch(longPress, /user-select:\s*none|preventLockedSelection|preventLockedDrag|draggable.*false/);
  assert.match(layout, /installLayoutRuntime/);
  assert.match(runtime, /if\s*\(isNativeContextTarget\(event\)\)\s*return;/);
  assert.match(longPress, /isNativeContextTarget\(\{ target, clientX, clientY \}\)/);
});

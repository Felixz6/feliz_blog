import assert from "node:assert/strict";
import test from "node:test";
import { installArticleImageViewer } from "../src/themes/fuyukawa-kagari/lib/article-image-viewer.mjs";

class FakeElement {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<{ callback: (event?: any) => void; once: boolean }>>();
  style: Record<string, string> = {};
  textContent = "";
  value = "";
  href = "";
  src = "";
  currentSrc = "";
  alt = "";
  title = "";
  target = "";
  rel = "";
  className = "";
  type = "";
  open = false;
  parentElement: FakeElement | null = null;
  isConnected = true;
  tagName = "";
  nextElementSibling: FakeElement | null = null;
  removed = false;
  replaceWithResult: FakeElement | null = null;
  closestMatches = new Map<string, FakeElement>();
  preventScrollFocused = false;
  readonly key: string;

  constructor(key = "") { this.key = key; }

  append(...elements: FakeElement[]) {
    for (const element of elements) {
      element.parentElement = this;
      this.children.push(element);
    }
  }

  querySelector(selector: string) {
    if (this.key === selector) return this;
    return this.children.find((child) => child.key === selector) ?? null;
  }

  closest(selector: string) { return this.closestMatches.get(selector) ?? null; }
  contains(element: FakeElement): boolean { return this.children.includes(element) || this.children.some((child) => child.contains(element)); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "src") this.src = "";
    if (name === "href") this.href = "";
  }
  addEventListener(name: string, callback: (event?: any) => void, options?: { once?: boolean }) {
    const callbacks = this.listeners.get(name) ?? [];
    callbacks.push({ callback, once: Boolean(options?.once) });
    this.listeners.set(name, callbacks);
  }
  dispatch(name: string, event: any = {}) {
    const callbacks = this.listeners.get(name) ?? [];
    for (const listener of [...callbacks]) {
      listener.callback(event);
      if (listener.once) callbacks.splice(callbacks.indexOf(listener), 1);
    }
  }
  focus(options?: { preventScroll?: boolean }) { this.preventScrollFocused = Boolean(options?.preventScroll); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  replaceWith(element: FakeElement) { this.replaceWithResult = element; element.parentElement = this.parentElement; }
  remove() { this.removed = true; this.isConnected = false; }
}

class FakeInputElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}

function makeViewerDocument(image = new FakeElement()) {
  const viewer = new FakeElement("[data-article-image-viewer]");
  const viewerImage = new FakeElement("[data-image-viewer-image]");
  const caption = new FakeElement("[data-image-viewer-caption]");
  const original = new FakeElement("[data-image-viewer-original]");
  const output = new FakeElement("[data-image-viewer-zoom-level]");
  const close = new FakeElement("[data-image-viewer-close]");
  const stage = new FakeElement("[data-image-viewer-stage]");
  const zoomIn = new FakeElement("[data-image-viewer-zoom]");
  zoomIn.closestMatches.set("[data-image-viewer-zoom]", zoomIn);
  zoomIn.dataset.imageViewerZoom = "in";
  viewer.append(viewerImage, caption, original, output, close, stage, zoomIn);
  const trigger = new FakeElement("trigger");
  trigger.closestMatches.set("[data-article-image-trigger]", trigger);
  trigger.querySelector = (selector: string) => selector === "img" ? image : null;
  const elements = new Map([["[data-article-image-viewer]", viewer]]);
  const documentRef: any = new FakeElement("document");
  documentRef.querySelector = (selector: string) => elements.get(selector) ?? null;
  documentRef.querySelectorAll = () => [];
  documentRef.createElement = (tag: string) => new FakeElement(tag);
  return { documentRef, viewer, viewerImage, caption, original, output, close, stage, zoomIn, trigger };
}

function makeWindowRef() {
  return {
    Element: FakeElement,
    HTMLInputElement: FakeInputElement,
    HTMLTextAreaElement: FakeTextAreaElement
  };
}

function dispatch(documentRef: any, name: string, event: any) {
  event.preventDefault ??= () => { event.defaultPrevented = true; };
  documentRef.dispatch(name, event);
}

test("article figures expose captions and a separate original-image link", () => {
  const image = new FakeElement("img");
  image.alt = "时序图";
  image.src = "/images/timing.png";
  image.currentSrc = image.src;
  const paragraph = new FakeElement("p");
  paragraph.tagName = "P";
  paragraph.children = [image];
  image.parentElement = paragraph;
  const explicitCaption = new FakeElement("caption");
  explicitCaption.tagName = "P";
  explicitCaption.textContent = "图 1-1 时序图细节";
  paragraph.nextElementSibling = explicitCaption;
  const documentRef: any = new FakeElement("document");
  documentRef.querySelector = () => null;
  documentRef.querySelectorAll = () => [image];
  documentRef.createElement = (tag: string) => new FakeElement(tag);

  installArticleImageViewer(documentRef, makeWindowRef());

  const figure = paragraph.replaceWithResult;
  assert.ok(figure);
  assert.equal(figure.className, "article-image-figure");
  const [trigger, figcaption] = figure.children;
  assert.equal(trigger.dataset.articleImageTrigger, "true");
  assert.equal(trigger.children[0], image);
  assert.equal(figcaption.children[0].textContent, "图 1-1 时序图细节");
  assert.equal(figcaption.children[1].href, "/images/timing.png");
  assert.equal(figcaption.children[1].target, "_blank");
  assert.equal(explicitCaption.removed, true);
});

test("viewer supports button and keyboard zoom, arrow panning, Escape, and focus return", () => {
  const image = new FakeElement("img");
  image.alt = "电路图";
  image.src = "/images/circuit.png";
  image.currentSrc = image.src;
  const { documentRef, viewer, viewerImage, caption, original, output, zoomIn, trigger, stage } = makeViewerDocument(image);
  installArticleImageViewer(documentRef, makeWindowRef());

  const clickTrigger = { target: trigger };
  dispatch(documentRef, "click", clickTrigger);
  assert.equal(viewer.open, true);
  assert.equal(viewerImage.src, "/images/circuit.png");
  assert.equal(viewerImage.alt, "电路图");
  assert.equal(caption.textContent, "电路图");
  assert.equal(original.href, "/images/circuit.png");

  dispatch(documentRef, "click", { target: zoomIn });
  assert.equal(output.value, "125%");
  dispatch(documentRef, "keydown", { target: stage, key: "ArrowLeft" });
  assert.equal(viewerImage.style.transform, "translate(48px, 0px) scale(1.25)");
  dispatch(documentRef, "keydown", { target: stage, key: "0" });
  assert.equal(output.value, "100%");
  dispatch(documentRef, "keydown", { target: stage, key: "+" });
  assert.equal(output.value, "125%");
  dispatch(documentRef, "keydown", { target: stage, key: "Escape" });
  assert.equal(viewer.open, false);
  assert.equal(viewerImage.src, "");
  assert.equal(trigger.preventScrollFocused, true);
});

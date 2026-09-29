const INTERACTIVE_OPERATION_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "[role='link']",
  "[role='button']",
  "[contenteditable]:not([contenteditable='false'])"
].join(",");

const MEDIA_OPERATION_SELECTOR = [
  "img",
  "picture",
  "canvas",
  "video",
  "audio",
  "svg"
].join(",");

const TEXT_CONTENT_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, pre, code, label, summary, figcaption, td, th";

function isTextNode(node) {
  return node?.nodeType === 3;
}

const pixelContexts = new WeakMap();

function positionOffset(token, freeSpace) {
  if (token?.endsWith("%")) return freeSpace * Number.parseFloat(token) / 100;
  if (token === "left" || token === "top") return 0;
  if (token === "right" || token === "bottom") return freeSpace;
  if (token === "center") return freeSpace / 2;
  const pixels = Number.parseFloat(token);
  return Number.isFinite(pixels) ? pixels : freeSpace / 2;
}

function imagePointIsTransparent(image, event, documentRef, windowRef) {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  const rect = image.getBoundingClientRect?.();
  if (!naturalWidth || !naturalHeight || !rect?.width || !rect?.height) return false;
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return false;

  try {
    const style = windowRef?.getComputedStyle?.(image);
    const fit = style?.objectFit ?? "fill";
    let scaleX = rect.width / naturalWidth;
    let scaleY = rect.height / naturalHeight;
    if (fit === "contain" || fit === "cover" || fit === "scale-down") {
      const containScale = Math.min(scaleX, scaleY);
      const scale = fit === "cover"
        ? Math.max(scaleX, scaleY)
        : fit === "scale-down" ? Math.min(1, containScale) : containScale;
      scaleX = scale;
      scaleY = scale;
    } else if (fit === "none") {
      scaleX = 1;
      scaleY = 1;
    }

    const drawnWidth = naturalWidth * scaleX;
    const drawnHeight = naturalHeight * scaleY;
    const positions = (style?.objectPosition ?? "50% 50%").split(/\s+/);
    const left = rect.left + positionOffset(positions[0], rect.width - drawnWidth);
    const top = rect.top + positionOffset(positions[1] ?? "50%", rect.height - drawnHeight);
    const sourceX = Math.floor((event.clientX - left) / scaleX);
    const sourceY = Math.floor((event.clientY - top) / scaleY);
    if (sourceX < 0 || sourceX >= naturalWidth || sourceY < 0 || sourceY >= naturalHeight) return true;

    let context = pixelContexts.get(image);
    if (!context) {
      const canvas = documentRef?.createElement?.("canvas");
      if (!canvas) return false;
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      pixelContexts.set(image, context);
    }
    context.clearRect(0, 0, 1, 1);
    context.drawImage(image, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3] === 0;
  } catch {
    // Tainted canvases or unsupported image formats keep the browser's image menu.
    return false;
  }
}

function pointIsInsideTextNode(documentRef, node, clientX, clientY) {
  if (!isTextNode(node)) return false;
  try {
    const range = documentRef.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    return Array.from(rects).some((rect) => (
      clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
    ));
  } catch {
    return false;
  }
}

/**
 * Keep browser context actions on interactive/media targets and actual text.
 * A custom menu is reserved for points that have no native content operation.
 */
export function isNativeContextTarget(event, {
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const target = event?.target;
  const element = target?.nodeType === 1 ? target : target?.parentElement;
  if (!element) return false;
  if (element.closest?.(INTERACTIVE_OPERATION_SELECTOR)) return true;
  const media = element.closest?.(MEDIA_OPERATION_SELECTOR);
  if (media && (media.tagName?.toUpperCase() !== "IMG" || !imagePointIsTransparent(media, event, documentRef, windowRef))) return true;
  if (windowRef?.getSelection?.()?.isCollapsed === false) return true;

  const { clientX, clientY } = event;
  const supportsCaretHitTest = typeof documentRef?.caretRangeFromPoint === "function"
    || typeof documentRef?.caretPositionFromPoint === "function";
  if (supportsCaretHitTest && Number.isFinite(clientX) && Number.isFinite(clientY)) {
    try {
      const range = documentRef?.caretRangeFromPoint?.(clientX, clientY);
      if (pointIsInsideTextNode(documentRef, range?.startContainer, clientX, clientY)) return true;
    } catch {}

    try {
      const position = documentRef?.caretPositionFromPoint?.(clientX, clientY);
      if (pointIsInsideTextNode(documentRef, position?.offsetNode, clientX, clientY)) return true;
    } catch {}
    // Caret APIs can return the nearest text at a blank point; only a text rect hit is native.
    return false;
  }

  // Preserve native behavior on text containers when a browser lacks caret hit-testing.
  return Boolean(element.closest?.(TEXT_CONTENT_SELECTOR));
}

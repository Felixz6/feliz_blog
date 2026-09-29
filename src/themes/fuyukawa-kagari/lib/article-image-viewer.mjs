const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;
const PAN_STEP = 48;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function createFigure(image, paragraph, documentRef) {
  const followingCaption = paragraph.nextElementSibling;
  const explicitCaption = followingCaption?.tagName === "P" && /^图\s*\d+(?:[-.]\d+)?(?:\s|$)/.test(followingCaption.textContent.trim())
    ? followingCaption.textContent.trim()
    : "";
  const caption = explicitCaption || image.alt.trim() || "文章配图";
  const source = image.currentSrc || image.src;
  const figure = documentRef.createElement("figure");
  figure.className = "article-image-figure";
  if (paragraph.id) figure.id = paragraph.id;

  const trigger = documentRef.createElement("button");
  trigger.type = "button";
  trigger.className = "article-image-trigger";
  trigger.dataset.articleImageTrigger = "true";
  trigger.dataset.imageCaption = caption;
  trigger.setAttribute("aria-label", `放大查看：${caption}`);
  trigger.title = "点击图片放大查看";
  trigger.append(image);

  const figcaption = documentRef.createElement("figcaption");
  figcaption.className = "article-image-caption";
  const label = documentRef.createElement("span");
  label.textContent = caption;
  const originalLink = documentRef.createElement("a");
  originalLink.href = source;
  originalLink.target = "_blank";
  originalLink.rel = "noopener noreferrer";
  originalLink.textContent = "查看原图 ↗";
  originalLink.setAttribute("aria-label", `在新标签页打开原图：${caption}`);
  figcaption.append(label, originalLink);
  figure.append(trigger, figcaption);
  paragraph.replaceWith(figure);
  if (explicitCaption) followingCaption.remove();
}

function enhanceArticleImages(documentRef) {
  documentRef.querySelectorAll(".prose p > img").forEach((image) => {
    const paragraph = image.parentElement;
    if (
      !paragraph ||
      paragraph.children.length !== 1 ||
      image.closest("a, .article-side-illustration, .article-image-figure, .avatar-preview")
    ) return;
    createFigure(image, paragraph, documentRef);
  });
}

export function installArticleImageViewer(documentRef, windowRef) {
  if (documentRef.__yuimiArticleImageViewerInstalled) return;
  documentRef.__yuimiArticleImageViewerInstalled = true;

  let triggerToRestore = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  const getViewer = () => documentRef.querySelector("[data-article-image-viewer]");
  const getViewerImage = (viewer) => viewer?.querySelector("[data-image-viewer-image]");

  const updateTransform = (viewer) => {
    const image = getViewerImage(viewer);
    const output = viewer?.querySelector("[data-image-viewer-zoom-level]");
    if (image) image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
    if (output) output.value = `${Math.round(zoom * 100)}%`;
  };

  const resetImage = (viewer) => {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    const image = getViewerImage(viewer);
    if (image) {
      image.removeAttribute("src");
      image.alt = "";
      image.style.transform = "";
    }
    const caption = viewer?.querySelector("[data-image-viewer-caption]");
    if (caption) caption.textContent = "";
    const original = viewer?.querySelector("[data-image-viewer-original]");
    if (original) original.removeAttribute("href");
    const output = viewer?.querySelector("[data-image-viewer-zoom-level]");
    if (output) output.value = "100%";
  };

  const closeViewer = (viewer, restoreFocus = true) => {
    if (!viewer) return;
    if (viewer.open) viewer.close();
    else viewer.removeAttribute("open");
    resetImage(viewer);
    const returnTarget = triggerToRestore;
    triggerToRestore = null;
    if (restoreFocus && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
  };

  const changeZoom = (viewer, direction) => {
    zoom = direction === "reset" ? 1 : clamp(zoom + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
    if (zoom <= 1) {
      offsetX = 0;
      offsetY = 0;
    }
    updateTransform(viewer);
  };

  const openViewer = (trigger) => {
    const viewer = getViewer();
    const sourceImage = trigger.querySelector("img");
    const viewerImage = getViewerImage(viewer);
    if (!viewer || !sourceImage || !viewerImage) return;

    triggerToRestore = trigger;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    viewerImage.src = sourceImage.currentSrc || sourceImage.src;
    viewerImage.alt = sourceImage.alt;
    const caption = viewer.querySelector("[data-image-viewer-caption]");
    const imageCaption = trigger.dataset.imageCaption?.trim() || sourceImage.alt.trim() || "文章配图";
    if (caption) caption.textContent = imageCaption;
    const original = viewer.querySelector("[data-image-viewer-original]");
    if (original) {
      original.href = sourceImage.currentSrc || sourceImage.src;
      original.setAttribute("aria-label", `在新标签页打开原图：${imageCaption}`);
    }
    updateTransform(viewer);
    viewer.addEventListener("close", () => {
      resetImage(viewer);
      const returnTarget = triggerToRestore;
      triggerToRestore = null;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    }, { once: true });
    if (typeof viewer.showModal === "function") viewer.showModal();
    else viewer.setAttribute("open", "");
    viewer.querySelector("[data-image-viewer-close]")?.focus({ preventScroll: true });
  };

  enhanceArticleImages(documentRef);
  documentRef.addEventListener("astro:page-load", () => enhanceArticleImages(documentRef));
  documentRef.addEventListener("astro:before-swap", () => closeViewer(getViewer(), false));
  documentRef.addEventListener("click", (event) => {
    const target = event.target instanceof windowRef.Element ? event.target : null;
    if (!target) return;
    const trigger = target.closest("[data-article-image-trigger]");
    if (trigger) {
      event.preventDefault();
      openViewer(trigger);
      return;
    }

    const viewer = getViewer();
    if (!viewer?.open) return;
    if (target === viewer || target.closest("[data-image-viewer-close]")) {
      closeViewer(viewer);
      return;
    }
    const zoomButton = target.closest("[data-image-viewer-zoom]");
    if (zoomButton && viewer.contains(zoomButton)) changeZoom(viewer, zoomButton.dataset.imageViewerZoom);
  });
  documentRef.addEventListener("keydown", (event) => {
    const viewer = getViewer();
    if (!viewer?.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeViewer(viewer);
      return;
    }
    const target = event.target;
    if (target instanceof windowRef.HTMLInputElement || target instanceof windowRef.HTMLTextAreaElement || target?.isContentEditable) return;

    if (event.key === "+" || event.key === "=") changeZoom(viewer, "in");
    else if (event.key === "-") changeZoom(viewer, "out");
    else if (event.key === "0") changeZoom(viewer, "reset");
    else if (zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      if (event.key === "ArrowLeft") offsetX += PAN_STEP;
      if (event.key === "ArrowRight") offsetX -= PAN_STEP;
      if (event.key === "ArrowUp") offsetY += PAN_STEP;
      if (event.key === "ArrowDown") offsetY -= PAN_STEP;
    } else return;
    event.preventDefault();
    updateTransform(viewer);
  });
  documentRef.addEventListener("wheel", (event) => {
    const viewer = getViewer();
    const target = event.target instanceof windowRef.Element ? event.target : null;
    if (!viewer?.open || !target?.closest("[data-image-viewer-stage]")) return;
    event.preventDefault();
    changeZoom(viewer, event.deltaY < 0 ? "in" : "out");
  }, { passive: false });
}

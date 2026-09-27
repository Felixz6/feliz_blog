const CONTENT_SELECTOR = "#page-content";
const BOOKMARK_DELAY = 500;

export function installNavigationFeedback(doc, win) {
  let generation = 0;
  let activeGeneration = null;
  let bookmarkTimer = null;
  let pendingLink = null;
  let contentAnimation = null;

  const clearPendingLink = () => {
    if (pendingLink) delete pendingLink.dataset.navigationPending;
    pendingLink = null;
  };
  const setBookmarkVisible = (root, visible) => {
    const bookmark = root?.querySelector("[data-navigation-bookmark]");
    if (!bookmark) return;
    if (visible) bookmark.dataset.visible = "true";
    else delete bookmark.dataset.visible;
    const message = bookmark.querySelector("[data-navigation-message]");
    if (message) message.textContent = visible ? "次の頁をめくる…" : "";
  };
  const clearBookmark = () => {
    if (bookmarkTimer !== null) win.clearTimeout(bookmarkTimer);
    bookmarkTimer = null;
    setBookmarkVisible(doc, false);
  };
  const clearGeneration = (id) => {
    if (activeGeneration !== id) return;
    clearBookmark();
    clearPendingLink();
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
  };

  doc.addEventListener("astro:before-preparation", (event) => {
    clearBookmark();
    clearPendingLink();
    contentAnimation?.cancel();
    contentAnimation = null;
    const id = ++generation;
    activeGeneration = id;
    doc.body?.setAttribute("data-navigating", "true");
    pendingLink = event.sourceElement?.closest?.(".nav-links a") ?? null;
    if (pendingLink) pendingLink.dataset.navigationPending = "true";

    bookmarkTimer = win.setTimeout(() => {
      if (activeGeneration !== id) return;
      bookmarkTimer = null;
      setBookmarkVisible(doc, true);
    }, BOOKMARK_DELAY);

    event.signal?.addEventListener("abort", () => clearGeneration(id), { once: true });

    const originalLoader = event.loader;
    if (typeof originalLoader === "function") {
      event.loader = async (...args) => {
        try {
          return await originalLoader(...args);
        } catch (error) {
          clearGeneration(id);
          throw error;
        } finally {
          if (event.signal?.aborted || event.defaultPrevented) clearGeneration(id);
        }
      };
    }

    queueMicrotask(() => {
      if (event.defaultPrevented && !event.signal?.aborted) clearGeneration(id);
    });
  });

  doc.addEventListener("astro:after-preparation", () => {
    if (activeGeneration === null) return;
    clearBookmark();
  });

  doc.addEventListener("astro:before-swap", (event) => {
    if (activeGeneration === null) return;
    clearBookmark();
    event.newDocument?.body?.setAttribute("data-navigating", "true");
    setBookmarkVisible(event.newDocument, false);
    clearPendingLink();
  });

  doc.addEventListener("astro:after-swap", () => {
    clearBookmark();
    clearPendingLink();
    doc.body?.removeAttribute("data-navigating");
    if (activeGeneration === null || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const content = doc.querySelector(CONTENT_SELECTOR);
    if (typeof content?.animate !== "function") return;

    const animation = content.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.2, 0.7, 0.25, 1)",
        fill: "both"
      }
    );
    contentAnimation = animation;
    animation.onfinish = () => {
      if (contentAnimation !== animation) return;
      animation.cancel();
      contentAnimation = null;
    };
    animation.oncancel = () => {
      if (contentAnimation === animation) contentAnimation = null;
    };
  });

  doc.addEventListener("astro:page-load", () => {
    if (activeGeneration === null) return;
    clearBookmark();
    clearPendingLink();
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
  });

  win.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    contentAnimation?.cancel();
    contentAnimation = null;
    generation += 1;
    activeGeneration = null;
    clearBookmark();
    clearPendingLink();
    doc.body?.removeAttribute("data-navigating");
  });
}

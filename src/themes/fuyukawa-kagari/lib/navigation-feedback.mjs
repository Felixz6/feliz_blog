const PROGRESS_SELECTOR = "[data-navigation-progress]";
const CONTENT_SELECTOR = "#page-content";

export function installNavigationFeedback(doc, win) {
  let generation = 0;
  let activeGeneration = null;
  let contentAnimation = null;

  const progressFor = (root) => root?.querySelector(PROGRESS_SELECTOR);
  const setProgressState = (root, state) => {
    const progress = progressFor(root);
    if (!progress) return;
    if (state) progress.dataset.state = state;
    else delete progress.dataset.state;
  };
  const clearGeneration = (id) => {
    if (activeGeneration !== id) return;
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc);
  };

  doc.addEventListener("astro:before-preparation", (event) => {
    contentAnimation?.cancel();
    contentAnimation = null;
    const id = ++generation;
    activeGeneration = id;
    doc.body?.setAttribute("data-navigating", "true");
    setProgressState(doc, "loading");

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
    if (activeGeneration !== null) setProgressState(doc, "prepared");
  });

  doc.addEventListener("astro:before-swap", (event) => {
    if (activeGeneration === null) return;
    event.newDocument?.body?.setAttribute("data-navigating", "true");
    setProgressState(event.newDocument, "prepared");
  });

  doc.addEventListener("astro:after-swap", () => {
    if (activeGeneration === null || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const content = doc.querySelector(CONTENT_SELECTOR);
    if (typeof content?.animate !== "function") return;

    const animation = content.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      {
        duration: 220,
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
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc, "complete");
  });

  doc.addEventListener("animationend", (event) => {
    const progress = progressFor(doc);
    if (event.target === progress && event.animationName === "navigation-progress-fade-out" && progress.dataset.state === "complete") {
      delete progress.dataset.state;
    }
  });

  win.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    contentAnimation?.cancel();
    contentAnimation = null;
    generation += 1;
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc);
  });
}

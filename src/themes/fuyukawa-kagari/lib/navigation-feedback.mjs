const PROGRESS_SELECTOR = "[data-navigation-progress]";
const CONTENT_SELECTOR = "#page-content";
const PROGRESS_DELAY = 100;

export function installNavigationFeedback(doc, win) {
  let generation = 0;
  let activeGeneration = null;
  let progressTimer = null;
  let progressWasShown = false;
  let contentAnimation = null;

  const progressFor = (root) => root?.querySelector(PROGRESS_SELECTOR);
  const setProgressState = (root, state) => {
    const progress = progressFor(root);
    if (!progress) return;
    if (state) progress.dataset.state = state;
    else delete progress.dataset.state;
  };
  const cancelProgressTimer = () => {
    if (progressTimer === null) return;
    win.clearTimeout(progressTimer);
    progressTimer = null;
  };
  const clearGeneration = (id) => {
    if (activeGeneration !== id) return;
    cancelProgressTimer();
    activeGeneration = null;
    progressWasShown = false;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc);
  };

  doc.addEventListener("astro:before-preparation", (event) => {
    cancelProgressTimer();
    contentAnimation?.cancel();
    contentAnimation = null;
    const id = ++generation;
    activeGeneration = id;
    progressWasShown = false;
    doc.body?.setAttribute("data-navigating", "true");
    setProgressState(doc);
    progressTimer = win.setTimeout(() => {
      if (activeGeneration !== id) return;
      progressTimer = null;
      progressWasShown = true;
      setProgressState(doc, "loading");
    }, PROGRESS_DELAY);

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
    cancelProgressTimer();
    if (progressWasShown) setProgressState(doc, "prepared");
  });

  doc.addEventListener("astro:before-swap", (event) => {
    if (activeGeneration === null) return;
    cancelProgressTimer();
    event.newDocument?.body?.setAttribute("data-navigating", "true");
    setProgressState(event.newDocument, progressWasShown ? "prepared" : undefined);
  });

  doc.addEventListener("astro:after-swap", () => {
    cancelProgressTimer();
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
    cancelProgressTimer();
    activeGeneration = null;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc, progressWasShown ? "complete" : undefined);
    progressWasShown = false;
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
    cancelProgressTimer();
    progressWasShown = false;
    doc.body?.removeAttribute("data-navigating");
    setProgressState(doc);
  });
}

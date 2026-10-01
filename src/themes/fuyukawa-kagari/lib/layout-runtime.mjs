import { installNavigationFeedback } from "./navigation-feedback.mjs";
import { installWebVitals } from "../../../core/web-vitals.mjs";
import { isNativeContextTarget } from "../../../core/themes/context-menu-routing.mjs";
import { createSakuraController } from "./sakura-runtime.mjs";
import { installMusicPlayer } from "./music-player.mjs";

/**
 * @param {{ documentRef?: Document, windowRef?: Window & typeof globalThis, musicPlayer?: Pick<ReturnType<typeof installMusicPlayer>, "isAutoplayEnabled" | "setAutoplayEnabled">, debugSakura?: boolean }} options
 */
export function installContextMenu({ documentRef = document, windowRef = window, musicPlayer, debugSakura = false } = {}) {
  const document = documentRef;
  const window = windowRef;
  const getContextMenu = () => document.querySelector("[data-context-menu]");
  let contextMenuReturnFocus = null;
  const hideContextMenu = () => {
    const contextMenu = getContextMenu();
    const shouldRestoreFocus = contextMenu?.contains(document.activeElement);
    contextMenu?.classList.remove("is-open");
    if (shouldRestoreFocus && contextMenuReturnFocus instanceof HTMLElement) {
      contextMenuReturnFocus.focus({ preventScroll: true });
    }
  };
  let sakuraController;
  const isSakuraEnabled = () => sakuraController?.isEnabled() ?? true;
  const setSakuraEnabled = (enabled) => sakuraController?.setUserEnabled(enabled);
  const updateContextToggleLabels = () => {
    const contextMenu = getContextMenu();
    const sakuraButton = contextMenu?.querySelector('[data-context-action="sakura"]');
    const musicAutoplayButton = contextMenu?.querySelector('[data-context-action="music-autoplay"]');
    const sakuraEnabled = isSakuraEnabled();
    const musicAutoplayEnabled = musicPlayer?.isAutoplayEnabled?.() ?? false;
    if (sakuraButton) {
      sakuraButton.textContent = sakuraEnabled ? "✿ 樱花雨：开" : "✿ 樱花雨：关";
      sakuraButton.setAttribute("aria-pressed", String(sakuraEnabled));
    }
    if (musicAutoplayButton) {
      musicAutoplayButton.textContent = musicAutoplayEnabled ? "♫ 进站续播：开" : "♫ 进站续播：关";
      musicAutoplayButton.setAttribute("aria-pressed", String(musicAutoplayEnabled));
    }
  };

  sakuraController = createSakuraController({
    windowRef: window,
    documentRef: document,
    onStateChange: updateContextToggleLabels
  });
  if (debugSakura) {
    window.__yuimiSakuraController = sakuraController;
  }
  sakuraController.mount();
  document.addEventListener("astro:before-swap", sakuraController.destroy);
  document.addEventListener("astro:page-load", () => {
    sakuraController.mount();
    updateContextToggleLabels();
  });
  updateContextToggleLabels();
  window.addEventListener("yuimi:music-autoplay-change", updateContextToggleLabels);

  const showContextMenuAt = (clientX, clientY, focusFirst = false) => {
    const contextMenu = getContextMenu();
    if (!contextMenu) return false;
    if (!contextMenu.contains(document.activeElement)) {
      const activeElement = document.activeElement;
      contextMenuReturnFocus = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.querySelector(".skip-to-content");
    }
    updateContextToggleLabels();
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 12);
    contextMenu.style.setProperty("--menu-x", `${Math.max(12, x)}px`);
    contextMenu.style.setProperty("--menu-y", `${Math.max(12, y)}px`);
    contextMenu.classList.add("is-open");
    if (focusFirst) {
      const firstButton = contextMenu.querySelector("button");
      firstButton?.focus({ preventScroll: true });
      // Wait for a rendered frame if a visibility transition rejected focus.
      if (firstButton && document.activeElement !== firstButton) {
        window.requestAnimationFrame(() => {
          if (!contextMenu.classList.contains("is-open")) return;
          window.requestAnimationFrame(() => {
            if (contextMenu.classList.contains("is-open")) firstButton.focus({ preventScroll: true });
          });
        });
      }
    }
    return true;
  };

  window.addEventListener("contextmenu", (event) => {
    if (isNativeContextTarget(event)) return;
    event.preventDefault();
    showContextMenuAt(event.clientX, event.clientY);
  });
  window.addEventListener("yuimi:context-menu-request", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const x = Number(event.detail?.clientX);
    const y = Number(event.detail?.clientY);
    showContextMenuAt(
      Number.isFinite(x) ? x : window.innerWidth / 2,
      Number.isFinite(y) ? y : window.innerHeight / 2
    );
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideContextMenu();
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const activeRect = document.activeElement?.getBoundingClientRect?.();
      const x = activeRect ? activeRect.left + Math.min(activeRect.width, 28) : window.innerWidth / 2;
      const y = activeRect ? activeRect.top + Math.min(activeRect.height, 28) : window.innerHeight / 2;
      showContextMenuAt(x, y, true);
    }
  });
  window.addEventListener("click", async (event) => {
    const contextMenu = getContextMenu();
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-context-action]");
    if (!button || !contextMenu?.contains(button)) {
      hideContextMenu();
      return;
    }

    event.stopPropagation();
    const action = button.dataset.contextAction;
    if (action === "top") window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "refresh") window.location.reload();
    if (action === "home") window.location.href = "/themes/fuyukawa-kagari/";
    if (action === "back") history.back();
    if (action === "forward") history.forward();
    if (action === "copy") {
      await navigator.clipboard?.writeText(window.location.href);
      button.textContent = "\u2713 \u94fe\u63a5\u5df2\u590d\u5236";
      window.setTimeout(() => {
        button.textContent = "\u29c9 \u590d\u5236\u94fe\u63a5";
      }, 1200);
    }
    if (action === "title") {
      await navigator.clipboard?.writeText(document.title);
      button.textContent = "\u2713 \u6807\u9898\u5df2\u590d\u5236";
      window.setTimeout(() => {
        button.textContent = "T \u590d\u5236\u6807\u9898";
      }, 1200);
    }
    if (action === "sakura") {
      setSakuraEnabled(!isSakuraEnabled());
      updateContextToggleLabels();
    }
    if (action === "music-autoplay") {
      const nextEnabled = !(musicPlayer?.isAutoplayEnabled?.() ?? false);
      musicPlayer?.setAutoplayEnabled?.(nextEnabled);
      updateContextToggleLabels();
    }
    hideContextMenu();
  });
}

export function installLayoutRuntime({ documentRef = document, windowRef = window, endpoint = "" } = {}) {
  const document = documentRef;
  const window = windowRef;
  installWebVitals({ endpoint });
  installNavigationFeedback(document, window);

  let articleImageViewerLoad;
  const loadArticleImageViewer = () => {
    if (!document.querySelector("[data-article-image-viewer]")) return;
    articleImageViewerLoad ??= import("./article-image-viewer.mjs").then(({ installArticleImageViewer }) => {
      installArticleImageViewer(document, window);
    });
  };
  loadArticleImageViewer();
  document.addEventListener("astro:page-load", loadArticleImageViewer);

  let scrollProgressFrame = 0;

  const updateScrollProgress = () => {
    const scrollProgress = document.querySelector("[data-scroll-progress]");
    if (!scrollProgress) return;

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    scrollProgress.style.setProperty("--scroll-percent", `${Math.min(1, Math.max(0, progress)) * 100}%`);
  };

  const scheduleScrollProgress = () => {
    if (scrollProgressFrame) return;
    scrollProgressFrame = window.requestAnimationFrame(() => {
      scrollProgressFrame = 0;
      updateScrollProgress();
    });
  };

  scheduleScrollProgress();
  window.addEventListener("scroll", scheduleScrollProgress, { passive: true });
  window.addEventListener("resize", scheduleScrollProgress);
  document.addEventListener("astro:page-load", scheduleScrollProgress);
  document.addEventListener("astro:after-swap", scheduleScrollProgress);
  window.addEventListener("pageshow", scheduleScrollProgress);

  const padTimer = (value) => String(value).padStart(2, "0");
  const formatElapsed = (startDate, mode) => {
    const totalMinutes = Math.floor(Math.max(0, Date.now() - startDate.getTime()) / 60000);
    const days = Math.floor(totalMinutes / 1440);
    if (mode === "days") {
      return `第 ${days.toLocaleString("zh-CN")} 天`;
    }
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return `${days.toLocaleString("zh-CN")}天 ${padTimer(hours)}小时 ${padTimer(minutes)}分`;
  };

  const updateFooterTimers = () => {
    const timerNodes = document.querySelectorAll("[data-elapsed-from]");
    timerNodes.forEach((node) => {
      const start = new Date(node.dataset.elapsedFrom);
      if (Number.isNaN(start.getTime())) return;
      node.textContent = formatElapsed(start, node.dataset.elapsedMode);
      node.setAttribute("dateTime", start.toISOString());
    });
  };

  let footerTimer = 0;
  const scheduleFooterTimers = () => {
    if (footerTimer) window.clearTimeout(footerTimer);
    footerTimer = 0;
    if (document.visibilityState !== "visible") return;
    updateFooterTimers();
    // All footer counters start on an exact minute and show at most minute precision.
    footerTimer = window.setTimeout(scheduleFooterTimers, 60000 - Date.now() % 60000);
  };

  scheduleFooterTimers();
  document.addEventListener("astro:page-load", scheduleFooterTimers);
  document.addEventListener("astro:after-swap", scheduleFooterTimers);
  window.addEventListener("pageshow", scheduleFooterTimers);
  document.addEventListener("visibilitychange", scheduleFooterTimers);
  const musicPlayer = installMusicPlayer(documentRef, windowRef);
  const debugSakura = import.meta.env.DEV || new URLSearchParams(window.location.search).has("debug-sakura");
  installContextMenu({ documentRef, windowRef, musicPlayer, debugSakura });
  const enhanceCodeBlocks = () => {
    document.querySelectorAll(".prose pre:not(.expressive-code pre)").forEach((pre) => {
      if (pre.querySelector(".code-block-copy")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-block-copy";
      button.textContent = "⧉ Copy";
      button.setAttribute("aria-label", "复制代码");
      button.addEventListener("click", async () => {
        const code = pre.querySelector("code");
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code.textContent ?? "");
          button.textContent = "✓ Copied";
          button.classList.add("copied");
          window.setTimeout(() => {
            button.textContent = "⧉ Copy";
            button.classList.remove("copied");
          }, 1200);
        } catch {
          button.textContent = "Failed";
          window.setTimeout(() => {
            button.textContent = "⧉ Copy";
          }, 1200);
        }
      });
      pre.appendChild(button);
    });
  };

  enhanceCodeBlocks();
  window.addEventListener("load", enhanceCodeBlocks);
  document.addEventListener("astro:page-load", enhanceCodeBlocks);
  return musicPlayer;
}

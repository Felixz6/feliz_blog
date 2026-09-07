import { bindHomeEventPortrait } from "./homeEventPortrait.ts";

export function visibleSceneRatio(rect: Pick<DOMRect, "top" | "bottom" | "height">, viewport: number) {
  const height = Math.max(1, viewport);
  const overlap = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
  return overlap / Math.min(Math.max(1, rect.height), height);
}

export function bindHomeEvent(root: HTMLElement) {
  const controller = new AbortController();
  const { signal } = controller;
  const video = root.querySelector<HTMLVideoElement>("[data-home-event-video]")!;
  const source = video.querySelector<HTMLSourceElement>("source[data-src]")!;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const portrait = bindHomeEventPortrait(root);
  let visible = false;
  let suspended = document.hidden;
  let completed = false;
  let started = false;
  let pending = false;
  let generation = 0;
  let watchdog = 0;
  const state = (value: string) => { root.dataset.state = value; };
  const hydrate = () => {
    if (source.hasAttribute("src") || signal.aborted) return;
    source.src = source.dataset.src!;
    video.preload = "auto";
    video.load();
  };
  const clearWatchdog = () => {
    window.clearTimeout(watchdog);
    watchdog = 0;
  };
  const pause = () => {
    generation += 1;
    pending = false;
    clearWatchdog();
    video.pause();
  };
  const showStill = (value: string) => {
    completed = true;
    pause();
    state(value);
    portrait.reveal();
  };
  const play = async (restart = false) => {
    if (signal.aborted || suspended || !visible || pending || motion.matches) return;
    const attempt = ++generation;
    pending = true;
    hydrate();
    if (restart) {
      completed = false;
      if (video.error) video.load();
      try { video.currentTime = 0; } catch {}
    }
    state("loading");
    clearWatchdog();
    watchdog = window.setTimeout(() => {
      if (signal.aborted || attempt !== generation || completed) return;
      showStill("ready");
    }, 6000);
    try {
      await video.play();
      // An older play promise must never pause a newer replay.
      if (signal.aborted || attempt !== generation) return;
      pending = false;
      started = true;
      if (suspended || !visible) pause();
    } catch {
      if (signal.aborted || attempt !== generation) return;
      showStill("ready");
    }
  };
  const refresh = () => {
    if (signal.aborted) return;
    const next = !suspended && !document.hidden
      && visibleSceneRatio(root.getBoundingClientRect(), window.innerHeight) >= .35;
    root.toggleAttribute("data-scene-visible", next);
    portrait.setActive(next);
    if (next && motion.matches) {
      showStill("complete");
    }
    if (next === visible) return;
    visible = next;
    if (!next) pause();
    else if (!completed) void play(!started);
  };
  const reset = () => {
    pause();
    completed = false;
    started = false;
    visible = false;
    root.removeAttribute("data-scene-visible");
    portrait.setActive(false);
    portrait.reset();
    try { video.currentTime = 0; } catch {}
    state("idle");
  };
  const suspend = () => {
    suspended = true;
    visible = false;
    root.removeAttribute("data-scene-visible");
    portrait.setActive(false);
    pause();
  };
  const resume = () => {
    suspended = document.hidden;
    refresh();
  };

  video.addEventListener("playing", () => {
    if (suspended || !visible || completed) { pause(); return; }
    state("playing");
    clearWatchdog();
  }, { signal });
  video.addEventListener("pause", () => {
    if (!completed && started) state("paused");
  }, { signal });
  video.addEventListener("ended", () => {
    completed = true;
    pending = false;
    clearWatchdog();
    state("complete");
    portrait.reveal();
  }, { signal });
  video.addEventListener("error", () => {
    showStill("error");
  }, { signal });
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : resume(), { signal });
  window.addEventListener("pagehide", suspend, { signal });
  window.addEventListener("pageshow", resume, { signal });
  document.addEventListener("freeze", suspend, { signal });
  document.addEventListener("resume", resume, { signal });
  motion.addEventListener("change", () => {
    if (motion.matches) {
      if (visible) showStill("complete");
      else pause();
    }
    else if (visible && !completed) void play();
  }, { signal });

  const preloadObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
    if (document.hidden || !entries.some(entry => entry.isIntersecting)) return;
    if (!motion.matches) hydrate();
    preloadObserver?.disconnect();
  }, { rootMargin: "45% 0px" }) : null;
  const visibilityObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(refresh, { threshold: [0, .15, .35, .6, 1] }) : null;
  if (!visibilityObserver) window.addEventListener("scroll", refresh, { passive: true, signal });
  window.addEventListener("resize", refresh, { passive: true, signal });
  preloadObserver?.observe(root);
  visibilityObserver?.observe(root);
  refresh();
  return {
    reset,
    refresh,
    destroy() {
      pause();
      portrait.destroy();
      controller.abort();
      preloadObserver?.disconnect();
      visibilityObserver?.disconnect();
    },
  };
}

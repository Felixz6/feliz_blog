// Repeated mounts reuse this page's clock; the page owns Astro lifecycle wiring.
const mounts = new WeakMap();

/** Mount the homepage clock without Canvas or animation dependencies. */
export function mountHomeRuntime({
  document = globalThis.document,
  window = globalThis.window,
  now = () => new Date()
} = {}) {
  const stage = document.querySelector("[data-home-clock]");
  const previous = mounts.get(document);
  if (stage && previous?.stage === stage) return previous.cleanup;
  previous?.cleanup();
  if (!stage) return () => {};

  const dateTarget = document.querySelector("[data-home-date]");
  const timeTarget = document.querySelector("[data-home-time]");
  if (!dateTarget && !timeTarget) return () => {};
  let disposed = false;
  const homeDateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });
  const homeTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const updateHomeClock = () => {
    const currentDate = now();
    if (dateTarget) dateTarget.textContent = homeDateFormatter.format(currentDate);
    if (timeTarget) timeTarget.textContent = homeTimeFormatter.format(currentDate);
  };
  let clockTimer = 0;
  const scheduleHomeClock = () => {
    if (disposed) return;
    if (clockTimer) window.clearTimeout(clockTimer);
    clockTimer = 0;
    if (document.visibilityState !== "visible") return;
    updateHomeClock();
    clockTimer = window.setTimeout(scheduleHomeClock, 1000);
  };
  const handleClockVisibility = () => scheduleHomeClock();
  scheduleHomeClock();
  document.addEventListener("visibilitychange", handleClockVisibility);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (clockTimer) window.clearTimeout(clockTimer);
    document.removeEventListener("visibilitychange", handleClockVisibility);
    if (mounts.get(document)?.cleanup === cleanup) mounts.delete(document);
  };
  mounts.set(document, { stage, cleanup });
  return cleanup;
}

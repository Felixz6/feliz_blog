const installations = new WeakMap();
const hiddenTitle = "w(ﾟДﾟ)w 不要走！再看看嘛！";
const returnTitle = "♪(^∇^*)欢迎回来！";
const returnDuration = 2000;

/** @param {Document} documentRef @param {Window & typeof globalThis} windowRef */
export function installTabTitleFeedback(documentRef = document, windowRef = window) {
  if (installations.has(documentRef)) return installations.get(documentRef);

  let originalTitle = documentRef.title;
  let wasHidden = documentRef.hidden;
  let restoreTimer;
  let disposed = false;

  const clearRestoreTimer = () => {
    if (restoreTimer !== undefined) windowRef.clearTimeout(restoreTimer);
    restoreTimer = undefined;
  };

  const onVisibilityChange = () => {
    if (documentRef.hidden) {
      clearRestoreTimer();
      wasHidden = true;
      documentRef.title = hiddenTitle;
    } else if (wasHidden) {
      wasHidden = false;
      documentRef.title = returnTitle;
      restoreTimer = windowRef.setTimeout(() => {
        restoreTimer = undefined;
        documentRef.title = originalTitle;
      }, returnDuration);
    }
  };

  // Restore the outgoing title and discard its welcome timer before Astro swaps it.
  const onBeforeSwap = () => {
    clearRestoreTimer();
    documentRef.title = originalTitle;
  };
  const onAfterSwap = () => {
    originalTitle = documentRef.title;
    wasHidden = documentRef.hidden;
    if (wasHidden) documentRef.title = hiddenTitle;
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearRestoreTimer();
    documentRef.removeEventListener("visibilitychange", onVisibilityChange);
    documentRef.removeEventListener("astro:before-swap", onBeforeSwap);
    documentRef.removeEventListener("astro:after-swap", onAfterSwap);
    documentRef.title = originalTitle;
    installations.delete(documentRef);
  };

  installations.set(documentRef, cleanup);
  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  documentRef.addEventListener("astro:before-swap", onBeforeSwap);
  documentRef.addEventListener("astro:after-swap", onAfterSwap);
  if (wasHidden) documentRef.title = hiddenTitle;
  return cleanup;
}

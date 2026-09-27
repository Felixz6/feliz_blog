(() => {
  const installationKey = Symbol.for("feliz-blog.expressive-code-dom-copy");
  if (document[installationKey]) return;
  document[installationKey] = true;

  const copyButtonSelector = ".expressive-code .copy button";

  function reconstructCode(button) {
    const figure = button.closest("figure");
    if (!figure) return null;

    const lines = [...figure.querySelectorAll(".ec-line > .code")];
    if (!lines.length) return null;

    return lines
      .map((line) => line.childElementCount === 0 && line.textContent === "\n" ? "" : line.textContent)
      .join("\n");
  }

  function fallbackCopy(text) {
    const temporary = document.createElement("pre");
    Object.assign(temporary.style, {
      opacity: "0",
      pointerEvents: "none",
      position: "absolute",
      overflow: "hidden",
      left: "0",
      top: "0",
      width: "20px",
      height: "20px",
      webkitUserSelect: "auto",
      userSelect: "all"
    });
    temporary.ariaHidden = "true";
    temporary.textContent = text;
    document.body.appendChild(temporary);

    const range = document.createRange();
    range.selectNode(temporary);
    const selection = window.getSelection();
    if (!selection) {
      temporary.remove();
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      selection.removeAllRanges();
      temporary.remove();
    }
    return copied;
  }

  async function copyFromDom(button, text) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = fallbackCopy(text);
    }

    if (!copied || button.parentNode?.querySelector(".feedback")) return;

    const liveRegion = button.parentNode?.querySelector("[aria-live]");
    if (!liveRegion) return;

    let feedback = document.createElement("div");
    feedback.classList.add("feedback");
    feedback.append(button.dataset.copied);
    liveRegion.append(feedback);
    feedback.offsetWidth;
    requestAnimationFrame(() => feedback?.classList.add("show"));

    const hideFeedback = () => {
      if (!feedback) return;
      feedback.classList.remove("show");
    };
    const removeFeedback = () => {
      if (!feedback || Number.parseFloat(getComputedStyle(feedback).opacity) > 0) return;
      feedback.remove();
      feedback = undefined;
    };

    setTimeout(hideFeedback, 1500);
    setTimeout(removeFeedback, 2500);
    button.addEventListener("blur", hideFeedback);
    feedback.addEventListener("transitioncancel", removeFeedback);
    feedback.addEventListener("transitionend", removeFeedback);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(copyButtonSelector) : null;
    if (!target) return;

    const text = reconstructCode(target);
    if (text === null) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void copyFromDom(target, text);
  }, true);
})();

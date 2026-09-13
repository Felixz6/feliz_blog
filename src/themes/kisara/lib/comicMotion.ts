import { getKisaraLocalRect } from "./displayScale.ts";

export function settleWithin(task: Promise<unknown>, timeout: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeout);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
    void task.then(finish, finish);
  });
}

// The paper opens from the center of the five-panel page, using finite keyframes.
export function comicSpreadPoints(width: number, height: number, x: number, y: number, progress: number) {
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) * 1.16;
  return Array.from({ length: 40 }, (_, index) => {
    const angle = index * Math.PI / 20;
    const edge = .98 + .02 * Math.sin(angle * 3 + .8);
    return [
      x + Math.cos(angle) * radius * edge * (.025 + progress * .975),
      y + Math.sin(angle) * radius * edge * (.1 + progress * .9),
    ];
  });
}

export function createComicMotion(signal: AbortSignal, reducedMotion: boolean) {
  const animations = new Set<Animation>();
  const restore: Array<() => void> = [];
  let generation = 0;
  const cancel = () => {
    generation++;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    restore.splice(0).forEach(reset => reset());
  };
  const finish = () => animations.forEach(animation => {
    try { animation.finish(); } catch { /* A cancelled animation is already settled. */ }
  });
  const animate = async (node: HTMLElement | null, frames: Keyframe[], duration: number, delay = 0, easing = "cubic-bezier(.23,1,.32,1)") => {
    if (!node || signal.aborted) return;
    const serial = generation;
    const properties = ["opacity", "transform", "clipPath"] as const;
    const original = Object.fromEntries(properties.map(key => [key, node.style[key]]));
    restore.push(() => { Object.assign(node.style, original); });
    const finalFrame = frames[frames.length - 1];
    const settle = () => properties.forEach(key => {
      if (finalFrame[key] !== undefined) node.style[key] = String(finalFrame[key]);
    });
    if (reducedMotion || document.hidden || !node.animate) { settle(); return; }
    const animation = node.animate(frames, { duration, delay, easing, fill: "both" });
    animations.add(animation);
    await settleWithin(animation.finished, duration + delay + 160, signal);
    if (signal.aborted || serial !== generation) return;
    settle();
    animation.cancel();
    animations.delete(animation);
  };
  signal.addEventListener("abort", cancel, { once: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) finish(); }, { signal });
  window.addEventListener("resize", finish, { signal });
  return {
    cancel, finish, animate,
    async play(scene: HTMLElement, reverse = false) {
      cancel();
      const serial = generation;
      const bounds = getKisaraLocalRect(scene);
      const paper = scene.querySelector<HTMLElement>(".kisara-comic-paper");
      const x = bounds.width * .5;
      const y = bounds.height * .45;
      const spread = [0, .28, .68, 1].map((progress, index) => ({
        clipPath: `polygon(${comicSpreadPoints(bounds.width, bounds.height, x, y, progress).map(([px, py]) => `${px.toFixed(1)}px ${py.toFixed(1)}px`).join(",")})`,
        opacity: [0, .55, .95, 1][index],
      }));
      const reveal = [
        { opacity: 0, transform: "translate3d(0,8px,0)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
      ];
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      const ordered = (frames: Keyframe[]) => reverse ? [...frames].reverse() : frames;
      const jobs = [
        animate(paper, ordered(spread), reverse ? 300 : 400, reverse ? 160 : 0, reverse ? "cubic-bezier(.77,0,.175,1)" : undefined),
      ];
      const panels = [...scene.querySelectorAll<HTMLElement>(".kisara-comic-panel")];
      panels.forEach((panel, index) => {
        jobs.push(animate(panel, ordered(reveal), reverse ? 160 : 220, reverse ? (panels.length - 1 - index) * 25 : 80 + index * 35));
      });
      scene.querySelectorAll<HTMLElement>("[data-comic-caption]").forEach((caption, index) => {
        jobs.push(animate(caption, ordered(fade), reverse ? 140 : 180, reverse ? 0 : 160 + Math.min(index, 6) * 25));
      });
      await Promise.all(jobs);
      if (!reverse && paper && serial === generation && !signal.aborted) paper.style.clipPath = "none";
    },
  };
}

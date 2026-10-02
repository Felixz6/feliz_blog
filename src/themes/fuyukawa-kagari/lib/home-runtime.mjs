// Repeated mounts reuse this page's resources; the page owns Astro lifecycle wiring.
const mounts = new WeakMap();

/** Mount only the homepage clock and tag rain, with controllable browser dependencies. */
export function mountHomeRuntime({
  document = globalThis.document,
  window = globalThis.window,
  performance = window.performance,
  now = () => new Date(),
  random: randomSource = Math.random,
  IntersectionObserver = window.IntersectionObserver
} = {}) {
  const stage = document.querySelector("[data-tag-rain]");
  const canvas = document.querySelector("[data-tag-rain-canvas]");
  const previous = mounts.get(document);
  if (stage && canvas && previous?.stage === stage && previous?.canvas === canvas) return previous.cleanup;
  previous?.cleanup();
  if (!stage || !canvas) return () => {};

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let disposed = false;
  const cleanupTasks = [];

  const labels = (() => {
    try {
      const parsed = JSON.parse(stage.dataset.tags || "[]");
      return [...new Set(Array.isArray(parsed) ? parsed : [])];
    } catch {
      return [];
    }
  })();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const performanceProfile = document.documentElement.dataset.yuimiPerformance ?? "full";
  const mobilePerformance = performanceProfile !== "full";
  const litePerformance = performanceProfile === "lite";
  const dateTarget = document.querySelector("[data-home-date]");
  const timeTarget = document.querySelector("[data-home-time]");
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
  cleanupTasks.push(() => {
    if (clockTimer) window.clearTimeout(clockTimer);
    document.removeEventListener("visibilitychange", handleClockVisibility);
  });
  const palette = [
    { fill: "#fff5bf", stroke: "#f0c95a", ink: "#725d22" },
    { fill: "#ffddea", stroke: "#f2a8bd", ink: "#824759" },
    { fill: "#dff2ff", stroke: "#9fc8eb", ink: "#315a78" },
    { fill: "#dff5ea", stroke: "#9bd6b7", ink: "#315e49" },
    { fill: "#eee4ff", stroke: "#c9b8ef", ink: "#57467b" }
  ];

  const state = {
    bodies: [],
    queue: [],
    started: false,
    finishedDropping: false,
    fading: false,
    done: false,
    raf: 0,
    scrollFrame: 0,
    lastTime: 0,
    nextDrop: 0,
    lastDropAt: 0,
    width: 1,
    height: 1,
    stageHeight: 1,
    dpr: 1,
    fadeStart: 0,
    lastPaint: 0,
    visible: true
  };

  const random = (min, max) => min + randomSource() * (max - min);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const measureTag = (label) => {
    ctx.save();
    ctx.font = "850 18px 'Cascadia Code', 'Fira Code', Consolas, sans-serif";
    const width = clamp(ctx.measureText(label).width + 46, 96, Math.min(260, state.width * 0.76));
    ctx.restore();
    return { width, height: 44 };
  };

  const makeTag = (label, index) => {
    const size = measureTag(label);
    const color = palette[index % palette.length];
    const radius = Math.max(size.width, size.height) * 0.34;
    return {
      type: "tag",
      label,
      color,
      width: size.width,
      height: size.height,
      radius,
      x: random(radius + 12, state.width - radius - 12),
      y: -random(60, 260),
      vx: random(-1.2, 1.2),
      vy: random(0.5, 1.8),
      angle: random(-0.3, 0.3),
      spin: random(-0.018, 0.018),
      alpha: 1
    };
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const dprCeiling = litePerformance ? 1 : mobilePerformance ? 1.15 : 2;
    state.dpr = clamp(window.devicePixelRatio || 1, 1, dprCeiling);
    state.width = Math.max(1, Math.floor(rect.width));
    state.stageHeight = Math.max(1, Math.floor(rect.height));
    state.height = state.stageHeight + 80;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = state.width + "px";
    canvas.style.height = state.height + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  };

  const prepareQueue = () => {
    state.queue = labels.map(makeTag);
  };

  const startRain = () => {
    if (state.started || state.done || labels.length === 0) return;
    resize();
    prepareQueue();
    state.started = true;
    state.lastTime = performance.now();
    state.nextDrop = 0;
    stage.classList.add("is-raining");
    window.cancelAnimationFrame(state.raf);
    state.raf = window.requestAnimationFrame(tick);
  };

  const resetRain = () => {
    if (!state.started && !state.done && state.bodies.length === 0) return;
    window.cancelAnimationFrame(state.raf);
    state.bodies = [];
    state.queue = [];
    state.started = false;
    state.finishedDropping = false;
    state.fading = false;
    state.done = false;
    state.raf = 0;
    state.lastTime = performance.now();
    state.nextDrop = 0;
    state.lastDropAt = 0;
    state.fadeStart = 0;
    stage.classList.remove("is-raining", "is-fading");
    ctx.clearRect(0, 0, state.width, state.height);
  };

  const drawCapsule = (body) => {
    const r = body.height / 2;
    ctx.save();
    ctx.globalAlpha = body.alpha;
    ctx.translate(body.x, body.y);
    ctx.rotate(body.angle);
    ctx.beginPath();
    ctx.roundRect(-body.width / 2, -body.height / 2, body.width, body.height, r);
    ctx.fillStyle = body.color.fill;
    ctx.strokeStyle = body.color.stroke;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(98, 111, 133, 0.16)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    ctx.fillStyle = body.color.ink;
    ctx.font = "850 18px 'Cascadia Code', 'Fira Code', Consolas, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(body.label, 0, 1, body.width - 34);
    ctx.restore();
  };

  const collideBodies = () => {
    for (let i = 0; i < state.bodies.length; i += 1) {
      for (let j = i + 1; j < state.bodies.length; j += 1) {
        const a = state.bodies[i];
        const b = state.bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        const minDistance = a.radius + b.radius;
        if (distance >= minDistance) continue;

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minDistance - distance) * 0.52;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const impulse = (relVx * nx + relVy * ny) * 0.62;
        if (impulse < 0) {
          a.vx += impulse * nx;
          a.vy += impulse * ny;
          b.vx -= impulse * nx;
          b.vy -= impulse * ny;
          a.spin *= 0.58;
          b.spin *= 0.58;
        }
      }
    }
  };

  const stepBody = (body, dt) => {
    const floor = state.stageHeight - 24;
    body.vy += 0.055 * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.spin * dt;

    if (body.x - body.radius < 10) {
      body.x = body.radius + 10;
      body.vx = Math.abs(body.vx) * 0.52;
      body.spin *= 0.35;
    }
    if (body.x + body.radius > state.width - 10) {
      body.x = state.width - body.radius - 10;
      body.vx = -Math.abs(body.vx) * 0.52;
      body.spin *= 0.35;
    }
    if (body.y + body.radius > floor) {
      body.y = floor - body.radius;
      body.vy *= -0.16;
      body.vx *= 0.62;
      body.spin *= 0.18;
      if (Math.abs(body.vy) < 0.72) body.vy = 0;
      if (Math.abs(body.vx) < 0.16) body.vx = 0;
      if (Math.abs(body.spin) < 0.018) body.spin = 0;
    }

    if (Math.abs(body.vx) + Math.abs(body.vy) < 0.42) {
      body.spin *= 0.72;
      if (Math.abs(body.spin) < 0.02) body.spin = 0;
    }
  };

  const maybeFade = (now) => {
    if (!state.finishedDropping || state.fading) return;
    const calm = state.bodies.every((body) => Math.abs(body.vx) + Math.abs(body.vy) < 1.15);
    if (calm || now - state.lastDropAt > 4800) {
      state.fading = true;
      state.fadeStart = now;
      stage.classList.add("is-fading");
    }
  };

  const tick = (now) => {
    if (disposed) return;
    if (!state.visible) {
      state.raf = 0;
      return;
    }

    const minimumFrameInterval = litePerformance
      ? 1000 / 24
      : mobilePerformance
        ? 1000 / 30
        : 0;
    if (minimumFrameInterval && state.lastPaint && now - state.lastPaint < minimumFrameInterval) {
      state.raf = window.requestAnimationFrame(tick);
      return;
    }
    state.lastPaint = now;

    const dt = clamp((now - state.lastTime) / 16.67, 0.4, 2.1);
    state.lastTime = now;
    ctx.clearRect(0, 0, state.width, state.height);

    if (!state.finishedDropping && now >= state.nextDrop) {
      const next = state.queue.shift();
      if (next) {
        state.bodies.push(next);
        state.lastDropAt = now;
        state.nextDrop = now + random(120, 220);
      } else {
        state.finishedDropping = true;
        state.lastDropAt = now;
      }
    }

    state.bodies.forEach((body) => stepBody(body, dt));
    for (let i = 0; i < (mobilePerformance ? 2 : 3); i += 1) collideBodies();

    if (state.fading) {
      const fade = clamp((now - state.fadeStart) / 5200, 0, 1);
      state.bodies.forEach((body) => {
        body.alpha = 1 - fade;
        body.y += fade * 0.05 * dt;
      });
      if (fade >= 1) {
        state.done = true;
        stage.classList.remove("is-raining", "is-fading");
        ctx.clearRect(0, 0, state.width, state.height);
        window.cancelAnimationFrame(state.raf);
        return;
      }
    }

    state.bodies.forEach(drawCapsule);

    maybeFade(now);
    state.raf = window.requestAnimationFrame(tick);
  };

  const shouldStart = () => {
    const rect = stage.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    return rect.top <= viewport * 0.46 && rect.bottom >= viewport * 0.34;
  };

  const isAtPageTop = () => {
    const top = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    return top <= 4;
  };

  const onScroll = () => {
    if (disposed) return;
    if (state.scrollFrame) return;
    state.scrollFrame = window.requestAnimationFrame(() => {
      if (disposed) return;
      state.scrollFrame = 0;
      if (isAtPageTop()) {
        resetRain();
        return;
      }
      if (shouldStart()) startRain();
    });
  };

  resize();
  if (reduceMotion.matches) {
    stage.classList.add("is-reduced-motion");
  } else {
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
        if (disposed) return;
        if (entries.some((entry) => entry.isIntersecting)) {
          startRain();
          observer.disconnect();
        }
      }, { rootMargin: "-34% 0px -42% 0px", threshold: 0.02 })
      : null;
    observer?.observe(stage);
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanupTasks.push(() => {
      observer?.disconnect();
      window.cancelAnimationFrame(state.scrollFrame);
      window.removeEventListener("scroll", onScroll);
    });
    onScroll();
  }
  const onResize = () => {
    if (disposed) return;
    resize();
    state.bodies.forEach((body) => {
      body.x = clamp(body.x, body.radius + 10, state.width - body.radius - 10);
      body.y = Math.min(body.y, state.stageHeight - 24 - body.radius);
    });
  };
  const onVisibilityChange = () => {
    if (disposed) return;
    state.visible = document.visibilityState === "visible";
    state.lastTime = performance.now();
    if (!state.visible) {
      window.cancelAnimationFrame(state.raf);
      state.raf = 0;
    } else if (state.started && !state.done && !state.raf) {
      state.raf = window.requestAnimationFrame(tick);
    }
  };
  const onPageHide = () => {
    if (disposed) return;
    window.cancelAnimationFrame(state.raf);
    state.raf = 0;
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  cleanupTasks.push(() => {
    window.cancelAnimationFrame(state.raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  });
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanupTasks.splice(0).forEach((stop) => stop());
    if (mounts.get(document)?.cleanup === cleanup) mounts.delete(document);
  };
  mounts.set(document, { stage, canvas, cleanup });
  return cleanup;
}

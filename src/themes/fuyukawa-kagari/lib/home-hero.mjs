export function mountHomeHero({
  document = globalThis.document,
  window = globalThis.window,
  now: nowSource = () => Date.now()
} = {}) {
    window.__yuimiHeroCleanup?.();
    const heroCleanupTasks = [];
    window.__yuimiHeroCleanup = () => {
      heroCleanupTasks.splice(0).forEach((cleanup) => cleanup());
    };

    const stage = document.querySelector("[data-hero-stage]");
    const hero = stage?.querySelector(".hero");
    const typingTarget = document.querySelector("[data-terminal-typing]");
    const nameTarget = document.querySelector("[data-name-typing]");

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const pullDistance = 260;
    const dockThreshold = 0.56;
    const resetDelay = 260;
    const releaseDelay = 120;
    const terminalLines = [
      "pin --dev-notes --anime-diary",
      "collect \"blue moments\" && write",
      "npm run scrapbook",
      "echo \"做自己想做，想自己所想\""
    ];
    const nameLines = JSON.parse(nameTarget?.dataset.nameLines || "[]").filter(Boolean);

    let pull = 0;
    let state = "idle";
    let resetTimer = 0;
    let releaseTimer = 0;
    let heroScrollFrame = 0;
    let progressFrame = 0;
    let pendingProgress = 0;
    let pokePointerFrame = 0;
    let pokeClientX = 0;
    const typingTimers = new Set();
    const typingLoops = [];
    let typingActive = false;
    const heroRect = hero?.getBoundingClientRect();
    let heroIsVisible = Boolean(heroRect && heroRect.bottom > 0 && heroRect.top < (window.innerHeight || 0));
    let heroVisibilityObserver;

    const setTypingTimer = (callback, delay) => {
      if (!typingActive) return;
      const timer = window.setTimeout(() => {
        typingTimers.delete(timer);
        if (!typingActive) return;
        callback();
      }, delay);
      typingTimers.add(timer);
    };

    const syncTypingActivity = () => {
      const shouldRun = heroIsVisible && document.visibilityState === "visible";
      if (typingActive === shouldRun) return;
      typingActive = shouldRun;
      if (!typingActive) {
        typingTimers.forEach((timer) => window.clearTimeout(timer));
        typingTimers.clear();
        return;
      }
      typingLoops.forEach((tick) => tick());
    };

    const runTypingLoop = (target, lines, writeDelay = 58, eraseDelay = 32, holdDelay = 1250) => {
      if (!target || lines.length === 0) return;

      let lineIndex = 0;
      let charIndex = 0;
      let deleting = false;
      let nextDelay = 0;

      const scheduleTick = (delay) => {
        nextDelay = delay;
        setTypingTimer(tick, delay);
      };

      const tick = () => {
        if (!typingActive) return;
        const line = lines[lineIndex];
        target.textContent = line.slice(0, charIndex);

        if (!deleting && charIndex < line.length) {
          charIndex += 1;
          scheduleTick(writeDelay);
          return;
        }

        if (!deleting && charIndex === line.length) {
          deleting = true;
          scheduleTick(holdDelay);
          return;
        }

        if (deleting && charIndex > 0) {
          charIndex -= 1;
          scheduleTick(eraseDelay);
          return;
        }

        deleting = false;
        lineIndex = (lineIndex + 1) % lines.length;
        scheduleTick(360);
      };

      typingLoops.push(() => scheduleTick(nextDelay));
    };

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const initialScrollFrame = !window.location.hash
      ? window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }))
      : 0;
    heroCleanupTasks.push(() => window.cancelAnimationFrame(initialScrollFrame));

    const setProgress = (progress) => {
      if (!hero) return;

      const value = clamp(progress);
      hero.style.setProperty("--avatar-y", `${(1 - value) * 56}vh`);
      hero.style.setProperty("--avatar-scale", `${0.78 + value * 0.22}`);
      hero.style.setProperty("--profile-opacity", `${clamp((value - 0.08) / 0.48)}`);
      hero.style.setProperty("--copy-opacity", `${1 - clamp((value - 0.12) / 0.42)}`);
      hero.style.setProperty("--cue-opacity", `${1 - clamp(value / 0.48)}`);
    };

    const scheduleProgress = (progress) => {
      pendingProgress = progress;
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(() => {
        progressFrame = 0;
        setProgress(pendingProgress);
      });
    };

    const resetPull = () => {
      if (state === "passed") return;
      window.clearTimeout(resetTimer);
      window.clearTimeout(releaseTimer);
      pull = 0;
      state = "idle";
      hero?.classList.remove("is-docked", "is-pulling");
      scheduleProgress(0);
    };

    const settlePull = () => {
      if (state !== "pulling") return;

      if (pull / pullDistance >= dockThreshold) {
        dockProfile();
      } else {
        resetPull();
      }
    };

    const schedulePullSettle = () => {
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(settlePull, resetDelay);
    };

    const dockProfile = () => {
      pull = pullDistance;
      state = "docked";
      hero?.classList.remove("is-pulling");
      hero?.classList.add("is-docked");
      scheduleProgress(1);

      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        state = "passed";
      }, releaseDelay);
    };

    const handleHeroWheel = (event) => {
      if (!stage || !hero) return;

      const atHeroTop = window.scrollY <= 2 && stage.getBoundingClientRect().top >= -2;
      if (!atHeroTop) {
        state = "passed";
        return;
      }

      if (event.deltaY < 0) {
        event.preventDefault();
        window.clearTimeout(releaseTimer);

        if (state === "passed" || state === "docked") {
          pull = 0;
          state = "idle";
          hero.classList.remove("is-docked", "is-pulling");
          scheduleProgress(0);
          return;
        }

        pull = clamp(pull + event.deltaY * 0.82, 0, pullDistance);
        state = pull > 0 ? "pulling" : "idle";
        hero.classList.toggle("is-pulling", state === "pulling");
        hero.classList.remove("is-docked");
        scheduleProgress(pull / pullDistance);
        if (state === "pulling") {
          schedulePullSettle();
        } else {
          window.clearTimeout(resetTimer);
        }
        return;
      }

      if (state === "passed") return;
      if (state === "docked") {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      window.clearTimeout(releaseTimer);

      const resistance = 1 - clamp(pull / pullDistance) * 0.5;
      pull = clamp(pull + event.deltaY * resistance, 0, pullDistance);
      const progress = pull / pullDistance;

      hero.classList.add("is-pulling");
      hero.classList.remove("is-docked");
      state = "pulling";
      scheduleProgress(progress);
      schedulePullSettle();
    };

    const updateHeroScroll = () => {
      if (!stage || !hero) return;

      const nativeProgress = clamp(-stage.getBoundingClientRect().top / (window.innerHeight || 1));
      hero.style.setProperty("--hero-dim", `${0.12 + clamp((nativeProgress - 1.05) / 0.25) * 0.12}`);

      if (!heroVisibilityObserver) {
        const rect = hero.getBoundingClientRect();
        const isVisible = rect.bottom > 0 && rect.top < (window.innerHeight || 0);
        if (isVisible !== heroIsVisible) {
          heroIsVisible = isVisible;
          syncTypingActivity();
        }
      }

      if (window.scrollY <= 2 && state === "passed") {
        pull = pullDistance;
        hero.classList.remove("is-pulling");
        hero.classList.add("is-docked");
        scheduleProgress(1);
      }
    };

    const handleHeroScroll = () => {
      if (heroScrollFrame) return;
      heroScrollFrame = window.requestAnimationFrame(() => {
        heroScrollFrame = 0;
        updateHeroScroll();
      });
    };

    runTypingLoop(typingTarget, terminalLines);
    runTypingLoop(nameTarget, nameLines, 96, 46, 1500);

    if (hero && typeof window.IntersectionObserver === "function") {
      heroVisibilityObserver = new window.IntersectionObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === hero) ?? entries[0];
        if (!entry) return;
        heroIsVisible = entry.isIntersecting;
        syncTypingActivity();
      });
      heroVisibilityObserver.observe(hero);
    }
    document.addEventListener("visibilitychange", syncTypingActivity);
    syncTypingActivity();
    heroCleanupTasks.push(() => {
      heroVisibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncTypingActivity);
    });

    const pokeAvatar = document.querySelector("[data-poke-avatar]");
    const pokeBubble = document.querySelector("[data-poke-bubble]");
    let lastPokeAt = 0;
    let bubbleTimer = 0;
    let pokeTimer = 0;

    const showPokeBubble = (text) => {
      if (!pokeBubble) return;
      pokeBubble.textContent = text;
      pokeBubble.classList.add("is-visible");
      window.clearTimeout(bubbleTimer);
      bubbleTimer = window.setTimeout(() => {
        pokeBubble.classList.remove("is-visible");
      }, 1700);
    };

    const handlePokeMove = (event) => {
      pokeClientX = event.clientX;
      if (pokePointerFrame) return;
      pokePointerFrame = window.requestAnimationFrame(() => {
        pokePointerFrame = 0;
        const rect = pokeAvatar.getBoundingClientRect();
        const offset = ((pokeClientX - rect.left) / rect.width - 0.5) * 2;
        pokeAvatar.style.setProperty("--flower-sway", `${offset * 9}deg`);
      });
    };

    const handlePokeLeave = () => {
      window.cancelAnimationFrame(pokePointerFrame);
      pokePointerFrame = 0;
      pokeAvatar.style.setProperty("--flower-sway", "0deg");
    };

    const handlePokeDoubleClick = (event) => {
      event.preventDefault();
      const now = nowSource();
      if (now - lastPokeAt < 10000) {
        showPokeBubble("\u64cd\u4f5c\u592a\u5feb\u5566\uff0c\u4f11\u606f\u4e00\u4e0b\u5427");
        return;
      }

      lastPokeAt = now;
      pokeAvatar.classList.remove("is-poked");
      void pokeAvatar.offsetWidth;
      pokeAvatar.classList.add("is-poked");
      showPokeBubble("\u6233\u5230\u4e86~");
      window.clearTimeout(pokeTimer);
      pokeTimer = window.setTimeout(() => pokeAvatar.classList.remove("is-poked"), 720);
    };

    pokeAvatar?.addEventListener("pointermove", handlePokeMove);
    pokeAvatar?.addEventListener("pointerleave", handlePokeLeave);
    pokeAvatar?.addEventListener("dblclick", handlePokeDoubleClick);
    heroCleanupTasks.push(() => {
      pokeAvatar?.removeEventListener("pointermove", handlePokeMove);
      pokeAvatar?.removeEventListener("pointerleave", handlePokeLeave);
      pokeAvatar?.removeEventListener("dblclick", handlePokeDoubleClick);
    });

    setProgress(0);
    handleHeroScroll();
    window.addEventListener("wheel", handleHeroWheel, { passive: false });
    window.addEventListener("scroll", handleHeroScroll, { passive: true });
    window.addEventListener("resize", handleHeroScroll);
    window.addEventListener("pageshow", handleHeroScroll);
    heroCleanupTasks.push(() => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(releaseTimer);
      window.clearTimeout(bubbleTimer);
      window.clearTimeout(pokeTimer);
      window.cancelAnimationFrame(heroScrollFrame);
      window.cancelAnimationFrame(progressFrame);
      window.cancelAnimationFrame(pokePointerFrame);
      typingTimers.forEach((timer) => window.clearTimeout(timer));
      typingTimers.clear();
      window.removeEventListener("wheel", handleHeroWheel);
      window.removeEventListener("scroll", handleHeroScroll);
      window.removeEventListener("resize", handleHeroScroll);
      window.removeEventListener("pageshow", handleHeroScroll);
    });

    return window.__yuimiHeroCleanup;
}

const playersByDocument = new WeakMap();

const createRadioPlayer = (document, window) => {
  const musicCacheKey = "yuimi-radio-state-v1";
  const musicAutoplayKey = "yuimi-radio-autoplay-v1";
  const musicSessionAutoplayKey = "yuimi-radio-session-autoplay-v1";
  const musicProgressPersistInterval = 5000;
  const createMusicPlayer = () => {
    const audio = new Audio();
    audio.preload = "none";
    const player = {
      audio,
      tracks: [],
      index: 0,
      seeking: false,
      initialized: false,
      initializing: null,
      restoreTime: 0,
      restoreAutoplay: false,
      pendingAutoplay: false,
      playbackRequested: false,
      metadataRequest: null,
      elements: {},
      controlAbort: null,
      audioAbort: null,
      unlockAbort: null
    };
    let lastMusicProgressSavedAt = null;

    const formatAudioTime = (seconds) => {
      if (!Number.isFinite(seconds)) return "00:00";
      const minute = Math.floor(seconds / 60);
      const second = Math.floor(seconds % 60);
      return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
    };

    const getMusicState = () => {
      try {
        return JSON.parse(localStorage.getItem(musicCacheKey) ?? "{}");
      } catch {
        return {};
      }
    };

    const isMusicAutoplayEnabled = () => localStorage.getItem(musicAutoplayKey) === "1";
    const isMusicSessionAutoplayEnabled = () => sessionStorage.getItem(musicSessionAutoplayKey) === "1";
    const shouldRestoreAutoplay = () => {
      const cached = getMusicState();
      return cached.paused === false && (isMusicAutoplayEnabled() || isMusicSessionAutoplayEnabled());
    };
    const setMusicSessionAutoplayEnabled = (enabled) => {
      sessionStorage.setItem(musicSessionAutoplayKey, enabled ? "1" : "0");
    };

    const setMusicAutoplayEnabled = (enabled) => {
      localStorage.setItem(musicAutoplayKey, enabled ? "1" : "0");
      window.dispatchEvent(new CustomEvent("yuimi:music-autoplay-change", { detail: { enabled } }));
    };

    const clampVolume = (value, fallback = 0.28) => {
      const volume = Number(value);
      if (!Number.isFinite(volume)) return fallback;
      return Math.min(1, Math.max(0, volume));
    };

    const musicTrackSource = (track) => {
      const url = new URL(track.src, window.location.origin);
      url.pathname = decodeURIComponent(url.pathname);
      return url.href;
    };

    const saveMusicState = () => {
      const currentTrack = player.tracks[player.index];
      if (!currentTrack) return;
      const savedAt = Date.now();
      localStorage.setItem(
        musicCacheKey,
        JSON.stringify({
          trackId: currentTrack.id,
          currentTime: player.restoreTime > 0 ? player.restoreTime : audio.currentTime || 0,
          volume: audio.volume,
          paused: player.playbackRequested || player.pendingAutoplay ? false : audio.paused,
          updatedAt: savedAt
        })
      );
      lastMusicProgressSavedAt = savedAt;
    };

    const saveMusicProgress = () => {
      const now = Date.now();
      if (lastMusicProgressSavedAt !== null && now - lastMusicProgressSavedAt < musicProgressPersistInterval) return;
      saveMusicState();
    };

    const queryElements = () => {
      player.elements = {
        toggle: document.querySelector("[data-music-toggle]"),
        prev: document.querySelector("[data-music-prev]"),
        next: document.querySelector("[data-music-next]"),
        volume: document.querySelector("[data-music-volume]"),
        seek: document.querySelector("[data-music-seek]"),
        track: document.querySelector(".music-track"),
        current: document.querySelector("[data-music-current]"),
        duration: document.querySelector("[data-music-duration]"),
        note: document.querySelector("[data-music-note]"),
        status: document.querySelector("[data-music-status]"),
        volumeLabel: document.querySelector("[data-music-volume-label]")
      };
    };

    const updateMusicProgressUi = () => {
      const { seek, current, duration } = player.elements;
      if (current) current.textContent = formatAudioTime(audio.currentTime);
      if (duration) duration.textContent = formatAudioTime(audio.duration);
      if (seek && !player.seeking) {
        const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        seek.value = String(progress || 0);
      }
      if (seek) seek.style.setProperty("--range-fill", `${seek.value}%`);
    };

    const updateMusicUi = () => {
      queryElements();
      const { toggle, volume, track, note, status, volumeLabel } = player.elements;
      const currentTrack = player.tracks[player.index];
      if (track) track.textContent = currentTrack?.title ?? "Music";
      updateMusicProgressUi();
      if (volume) {
        volume.value = String(audio.volume);
        volume.style.setProperty("--range-fill", `${audio.volume * 100}%`);
      }
      if (volumeLabel) volumeLabel.textContent = `${Math.round(audio.volume * 100)}%`;
      if (status) status.textContent = audio.paused ? "已暂停" : "播放中";
      if (toggle) {
        toggle.setAttribute("aria-label", audio.paused ? "播放音乐" : "暂停音乐");
        toggle.setAttribute("title", audio.paused ? "播放音乐" : "暂停音乐");
        toggle.setAttribute("aria-pressed", String(!audio.paused));
      }
      if (note && player.tracks.length) note.textContent = `${player.index + 1} / ${player.tracks.length}`;
      document.body.classList.toggle("is-music-playing", !audio.paused);
    };

    const loadMusicTrack = (index, { keepTime = 0, autoplay = false, persist = true } = {}) => {
      if (!player.tracks.length) return;
      player.metadataRequest?.controller.abort();
      const metadataRequest = { controller: new AbortController(), autoplay, handled: false };
      player.metadataRequest = metadataRequest;
      player.index = (index + player.tracks.length) % player.tracks.length;
      player.restoreTime = keepTime;
      const track = player.tracks[player.index];
      const nextSrc = musicTrackSource(track);
      const cached = getMusicState();
      audio.volume = Number.isFinite(cached.volume)
        ? clampVolume(cached.volume)
        : clampVolume(player.elements.volume?.value, audio.volume || 0.28);
      const onMetadata = async () => {
        if (player.metadataRequest !== metadataRequest || metadataRequest.handled) return;
        if (audio.currentSrc !== nextSrc || audio.readyState < 1) return;
        metadataRequest.handled = true;
        metadataRequest.controller.abort();
        if (keepTime > 0 && keepTime < audio.duration - 1) audio.currentTime = keepTime;
        player.restoreTime = 0;
        updateMusicUi();
        if (!metadataRequest.autoplay || !player.playbackRequested) return;
        try {
          await audio.play();
          if (player.metadataRequest !== metadataRequest || !metadataRequest.autoplay || !player.playbackRequested) return;
          player.pendingAutoplay = false;
          metadataRequest.autoplay = false;
        } catch {
          if (player.metadataRequest !== metadataRequest || !metadataRequest.autoplay || !player.playbackRequested) return;
          player.playbackRequested = false;
          metadataRequest.autoplay = false;
          player.pendingAutoplay = true;
          if (player.elements.note) player.elements.note.textContent = "浏览器需要你点一下播放。";
        }
        updateMusicUi();
      };
      audio.addEventListener("loadedmetadata", onMetadata, { signal: metadataRequest.controller.signal });
      if (audio.src !== nextSrc) {
        audio.src = nextSrc;
        audio.load();
      }
      if (audio.currentSrc === nextSrc && audio.readyState >= 1) void onMetadata();
      updateMusicUi();
      if (persist) saveMusicState();
    };

    const initMusicPlayer = () => {
      queryElements();
      if (player.initialized) {
        updateMusicUi();
        return Promise.resolve(true);
      }
      if (player.initializing) return player.initializing;

      player.initializing = (async () => {
        try {
          const response = await fetch("/themes/fuyukawa-kagari/music/manifest.json", { cache: "no-cache" });
          const tracks = await response.json();
          player.tracks = Array.isArray(tracks) ? tracks : [];
        } catch {
          player.tracks = [];
          if (player.elements.note) player.elements.note.textContent = "歌单读取失败，请稍后重试。";
          return false;
        }

        player.initialized = true;
        if (!player.tracks.length) {
          updateMusicUi();
          if (player.elements.track) player.elements.track.textContent = "暂无歌曲";
          if (player.elements.note) player.elements.note.textContent = "请把 MP3 放入 MUSIC 文件夹。";
          return true;
        }

        const cached = getMusicState();
        const cachedIndex = player.tracks.findIndex((track) => track.id === cached.trackId);
        player.index = cachedIndex >= 0 ? cachedIndex : 0;
        player.restoreTime = Number(cached.currentTime ?? 0);
        audio.volume = Number.isFinite(cached.volume) ? clampVolume(cached.volume) : clampVolume(player.elements.volume?.value);
        player.restoreAutoplay = shouldRestoreAutoplay();
        player.pendingAutoplay = player.restoreAutoplay;
        player.playbackRequested = player.restoreAutoplay;
        if (player.restoreAutoplay && player.elements.note) {
          player.elements.note.textContent = "已恢复进度，点击页面继续。";
        }
        updateMusicUi();
        return true;
      })().finally(() => {
        player.initializing = null;
      });
      return player.initializing;
    };

    const ensureCurrentTrackSource = () => {
      const track = player.tracks[player.index];
      if (!track) return false;
      const nextSrc = musicTrackSource(track);
      if (audio.src !== nextSrc) {
        loadMusicTrack(player.index, { keepTime: player.restoreTime, autoplay: false, persist: false });
      }
      return true;
    };

    player.bind = () => {
      queryElements();
      player.controlAbort?.abort();
      player.controlAbort = new AbortController();
      const listenerOptions = { signal: player.controlAbort.signal };

      player.elements.toggle?.addEventListener("click", async () => {
        await player.init();
        if (!player.tracks.length) return;
        if (audio.paused && !player.metadataRequest?.autoplay) {
          player.playbackRequested = true;
          ensureCurrentTrackSource();
          const request = player.metadataRequest;
          try {
            await audio.play();
            if (request !== player.metadataRequest || !player.playbackRequested) return;
            setMusicSessionAutoplayEnabled(true);
            player.pendingAutoplay = false;
          } catch {
            if (request !== player.metadataRequest || !player.playbackRequested) return;
            player.playbackRequested = false;
            player.pendingAutoplay = true;
            if (player.elements.note) player.elements.note.textContent = "浏览器拦截了自动播放，请再点一次。";
          }
        } else {
          player.playbackRequested = false;
          if (player.metadataRequest) player.metadataRequest.autoplay = false;
          audio.pause();
          setMusicSessionAutoplayEnabled(false);
          player.pendingAutoplay = false;
        }
        updateMusicUi();
        saveMusicState();
      }, listenerOptions);

      player.elements.prev?.addEventListener("click", async () => {
        await player.init();
        if (!player.tracks.length) return;
        loadMusicTrack(player.index - 1, { autoplay: player.playbackRequested });
      }, listenerOptions);

      player.elements.next?.addEventListener("click", async () => {
        await player.init();
        if (!player.tracks.length) return;
        loadMusicTrack(player.index + 1, { autoplay: player.playbackRequested });
      }, listenerOptions);

      player.elements.volume?.addEventListener("input", () => {
        audio.volume = Number(player.elements.volume.value);
        saveMusicState();
        updateMusicUi();
      }, listenerOptions);

      player.elements.seek?.addEventListener("input", () => {
        player.seeking = true;
        player.elements.seek.style.setProperty("--range-fill", `${player.elements.seek.value}%`);
        if (!audio.duration) return;
        const target = (Number(player.elements.seek.value) / 100) * audio.duration;
        if (player.elements.current) player.elements.current.textContent = formatAudioTime(target);
      }, listenerOptions);

      player.elements.seek?.addEventListener("change", () => {
        if (audio.duration) {
          audio.currentTime = (Number(player.elements.seek.value) / 100) * audio.duration;
        }
        player.seeking = false;
        updateMusicUi();
        saveMusicState();
      }, listenerOptions);

      player.audioAbort?.abort();
      player.audioAbort = new AbortController();
      const audioListenerOptions = { signal: player.audioAbort.signal };

      const tryResumeAfterRefresh = async () => {
        if (!player.pendingAutoplay || !audio.paused || !player.tracks.length) return;
        player.playbackRequested = true;
        ensureCurrentTrackSource();
        const request = player.metadataRequest;
        try {
          await audio.play();
          if (request !== player.metadataRequest || !player.playbackRequested) return;
          setMusicSessionAutoplayEnabled(true);
          player.pendingAutoplay = false;
          player.unlockAbort?.abort();
          updateMusicUi();
          saveMusicState();
        } catch {
          if (request !== player.metadataRequest || !player.playbackRequested) return;
          player.playbackRequested = false;
          if (player.elements.note) player.elements.note.textContent = "浏览器需要一次交互后才能续播。";
        }
      };

      player.unlockAbort?.abort();
      player.unlockAbort = new AbortController();
      const unlockOptions = { signal: player.unlockAbort.signal, passive: true };
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((eventName) => {
        window.addEventListener(eventName, tryResumeAfterRefresh, unlockOptions);
      });

      audio.addEventListener("timeupdate", () => {
        updateMusicProgressUi();
        saveMusicProgress();
      }, audioListenerOptions);
      audio.addEventListener("play", () => {
        setMusicSessionAutoplayEnabled(true);
        player.pendingAutoplay = false;
        updateMusicUi();
        saveMusicState();
      }, audioListenerOptions);
      audio.addEventListener("pause", () => {
        if (!player.playbackRequested && !player.pendingAutoplay) setMusicSessionAutoplayEnabled(false);
        updateMusicUi();
        saveMusicState();
      }, audioListenerOptions);
      audio.addEventListener("ended", () => {
        player.playbackRequested = true;
        loadMusicTrack(player.index + 1, { autoplay: true });
      }, audioListenerOptions);
      window.addEventListener("pagehide", saveMusicState, listenerOptions);
      updateMusicUi();
      if (shouldRestoreAutoplay()) void player.init();
    };

    player.init = initMusicPlayer;
    player.update = updateMusicUi;
    player.isAutoplayEnabled = isMusicAutoplayEnabled;
    player.setAutoplayEnabled = setMusicAutoplayEnabled;
    player.shouldRestoreAutoplay = shouldRestoreAutoplay;
    return player;
  };
  return createMusicPlayer();
};

const installDockBehavior = (player, document, window) => {
  let toyDockCloseTimer = 0;
  const getToyDock = () => document.querySelector(".toy-dock");
  const syncToyDock = () => {
    const toyDock = getToyDock();
    if (!toyDock) return;
    const open = !toyDock.classList.contains("is-dismissed")
      && (toyDock.classList.contains("is-pinned") || toyDock.matches(":hover, :focus-within"));
    const handle = toyDock.querySelector(".toy-dock-handle");
    handle?.setAttribute("aria-expanded", String(open));
    handle?.setAttribute("aria-label", open ? "收起音乐工具" : "打开音乐工具");
  };
  const dismissToyDock = () => {
    const toyDock = getToyDock();
    if (!toyDock) return;
    toyDock.classList.remove("is-pinned");
    toyDock.classList.add("is-dismissed");
    toyDock.querySelector(":focus")?.blur();
    syncToyDock();
  };
  const isInsideToyDock = (target) => {
    const toyDock = getToyDock();
    return Boolean(toyDock && target instanceof Node && toyDock.contains(target));
  };
  document.addEventListener("click", (event) => {
    const handle = event.target instanceof Element ? event.target.closest(".toy-dock-handle") : null;
    if (!handle) return;
    const toyDock = getToyDock();
    if (!toyDock) return;
    const pinned = toyDock.classList.toggle("is-pinned");
    toyDock.classList.toggle("is-dismissed", !pinned);
    if (!pinned) handle.blur();
    syncToyDock();
    if (pinned) void player?.init();
  });
  document.addEventListener("pointerover", (event) => {
    if (!isInsideToyDock(event.target) || isInsideToyDock(event.relatedTarget)) return;
    window.clearTimeout(toyDockCloseTimer);
    getToyDock()?.classList.remove("is-dismissed");
    syncToyDock();
    void player?.init();
  });
  document.addEventListener("pointerout", (event) => {
    if (!isInsideToyDock(event.target) || isInsideToyDock(event.relatedTarget)) return;
    const toyDock = getToyDock();
    if (!toyDock) return;
    if (toyDock.classList.contains("is-pinned")) return;
    toyDockCloseTimer = window.setTimeout(() => {
      toyDock.querySelector(":focus")?.blur();
      syncToyDock();
    }, 180);
  });
  document.addEventListener("focusin", (event) => {
    if (!isInsideToyDock(event.target)) return;
    getToyDock()?.classList.remove("is-dismissed");
    syncToyDock();
    void player?.init();
  });
  document.addEventListener("focusout", () => queueMicrotask(syncToyDock));
  window.addEventListener("pointerdown", (event) => {
    const toyDock = getToyDock();
    if (!toyDock || toyDock.contains(event.target)) return;
    dismissToyDock();
  });
  window.addEventListener("keydown", (event) => {
    const toyDock = getToyDock();
    if (event.key !== "Escape" || !toyDock) return;
    dismissToyDock();
  });
  document.addEventListener("astro:before-swap", dismissToyDock);
  document.addEventListener("astro:page-load", syncToyDock);
};

export function installMusicPlayer(documentRef = document, windowRef = window) {
  let player = playersByDocument.get(documentRef);
  if (player) {
    player.bind();
    return player;
  }

  player = createRadioPlayer(documentRef, windowRef);
  playersByDocument.set(documentRef, player);
  installDockBehavior(player, documentRef, windowRef);
  documentRef.addEventListener("astro:page-load", () => player.bind());
  player.bind();
  return player;
}

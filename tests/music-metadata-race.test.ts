import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const layout = readFileSync(fileURLToPath(new URL('../src/themes/fuyukawa-kagari/layouts/BaseLayout.astro', import.meta.url)), 'utf8');
const musicScript = layout.slice(layout.indexOf('const musicCacheKey ='), layout.indexOf('const getContextMenu ='));

class MockElement {
  events = new Map();
  attributes = {};
  value = '0';
  textContent = '';
  style = { setProperty() {} };
  classList = { toggle() {} };

  addEventListener(name, handler, options = {}) {
    const listeners = this.events.get(name) ?? new Set();
    const record = { handler, once: Boolean(options.once) };
    listeners.add(record);
    this.events.set(name, listeners);
    options.signal?.addEventListener('abort', () => listeners.delete(record), { once: true });
  }

  listenerCount(name) { return this.events.get(name)?.size ?? 0; }

  async dispatch(name, event = {}) {
    const results = [];
    for (const record of [...(this.events.get(name) ?? [])]) {
      if (record.once) this.events.get(name).delete(record);
      results.push(record.handler(event));
    }
    await Promise.all(results);
  }

  setAttribute(name, value) { this.attributes[name] = value; }
}

const tracks = [
  { id: 'a', title: 'Track A', src: '/a.mp3' },
  { id: 'b', title: 'Track B', src: '/b.mp3' },
  { id: 'c', title: 'Track C', src: '/c.mp3' }
];

function fixture({ rejectPlay = false, deferPlay = false, instantMetadata = false, initiallyPaused = true } = {}) {
  const nodes = new Map();
  for (const name of ['toggle', 'prev', 'next', 'volume', 'seek', 'current', 'duration', 'note', 'status', 'volume-label']) {
    nodes.set(`[data-music-${name}]`, new MockElement());
  }
  nodes.set('.music-track', new MockElement());
  const document = new MockElement();
  document.body = new MockElement();
  document.querySelector = (selector) => nodes.get(selector);
  const window = new MockElement();
  window.location = { origin: 'https://example.test' };
  const storage = (data = new Map()) => ({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  });
  const cached = new Map([['yuimi-radio-state-v1', JSON.stringify({ trackId: 'c', paused: true })]]);
  const sessionStorage = storage();
  const pendingPlays = [];

  class MockAudio extends MockElement {
    _src = '';
    paused = initiallyPaused;
    volume = 0.28;
    currentTime = 0;
    duration = 120;
    readyState = 0;
    HAVE_METADATA = 1;
    playCount = 0;
    loadCount = 0;
    rejectPlay = rejectPlay;
    deferPlay = deferPlay;

    get src() { return this._src; }
    get currentSrc() { return this._src; }
    set src(value) { this._src = new URL(value, window.location.origin).href; this.readyState = 0; }
    load() {
      this.loadCount += 1;
      this.paused = true;
      void this.dispatch('pause'); // Changing source/loading pauses real HTMLAudioElement.
      if (instantMetadata) this.readyState = this.HAVE_METADATA;
    }
    async dispatch(name, event = {}) {
      if (name === 'loadedmetadata') this.readyState = this.HAVE_METADATA;
      await super.dispatch(name, event);
    }
    async play() {
      this.playCount += 1;
      if (this.deferPlay) return new Promise((resolve, reject) => pendingPlays.push({ resolve, reject }));
      if (this.rejectPlay) throw new Error('autoplay blocked');
      this.paused = false;
      await this.dispatch('play');
    }
    pause() {
      this.paused = true;
      void this.dispatch('pause');
    }
  }

  vm.runInNewContext(musicScript, {
    document, window, Audio: MockAudio, URL, AbortController,
    localStorage: storage(cached), sessionStorage,
    fetch: async () => ({ json: async () => tracks.map((track) => ({ ...track })) })
  });
  return { player: window.__yuimiRadio, document, nodes, pendingPlays, sessionStorage };
}

async function next(nodes) { await nodes.get('[data-music-next]').dispatch('click'); }
async function startPlaying({ player, nodes }) {
  await player.init();
  await nodes.get('[data-music-toggle]').dispatch('click');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.paused, false);
  player.audio.playCount = 0;
}

test('single track switch plays once when metadata arrives and releases its listener', async () => {
  const { player, nodes } = fixture();
  await startPlaying({ player, nodes });
  await next(nodes); // C -> A
  assert.equal(player.audio.src, 'https://example.test/a.mp3');
  assert.equal(player.audio.listenerCount('loadedmetadata'), 1);
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
});

test('A -> B -> C before metadata permits only C to play and update the current UI', async () => {
  const { player, nodes } = fixture();
  await startPlaying({ player, nodes });
  await next(nodes); // A
  await next(nodes); // B
  await next(nodes); // C
  assert.equal(player.index, 2);
  assert.equal(player.audio.src, 'https://example.test/c.mp3');
  const pendingListeners = player.audio.listenerCount('loadedmetadata');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1, 'only the final track may autoplay');
  assert.equal(pendingListeners, 1, 'earlier track listeners must be cancelled');
  assert.equal(nodes.get('.music-track').textContent, 'Track C');
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
});

test('ten rapid next clicks retain autoplay intent across programmatic load pauses and wrap', async () => {
  const { player, nodes } = fixture();
  await startPlaying({ player, nodes });
  for (let index = 0; index < 10; index += 1) await next(nodes);
  assert.equal(player.index, 0); // Starting on C, ten clicks wrap to A.
  assert.equal(player.audio.listenerCount('loadedmetadata'), 1);
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
  assert.equal(player.audio.paused, false);
});

test('load-generated pause does not clear the session playback intent', async () => {
  const { player, nodes, sessionStorage } = fixture();
  await startPlaying({ player, nodes });
  assert.equal(sessionStorage.getItem('yuimi-radio-session-autoplay-v1'), '1');
  await next(nodes);
  assert.equal(player.audio.paused, true);
  assert.equal(sessionStorage.getItem('yuimi-radio-session-autoplay-v1'), '1');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.paused, false);
});

test('manual pause before metadata prevents the pending track from autoplaying', async () => {
  const { player, nodes, sessionStorage } = fixture();
  await startPlaying({ player, nodes });
  await next(nodes);
  await nodes.get('[data-music-toggle]').dispatch('click');
  assert.equal(player.audio.paused, true);
  assert.equal(sessionStorage.getItem('yuimi-radio-session-autoplay-v1'), '0');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 0);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
  assert.equal(nodes.get('[data-music-status]').textContent, '已暂停');
});

test('skipping while already paused stays paused', async () => {
  const { player, nodes } = fixture({ initiallyPaused: true });
  await player.init();
  await next(nodes);
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 0);
  assert.equal(player.audio.paused, true);
});

test('cached metadata ready during load does not strand the selected track', async () => {
  const { player, nodes } = fixture({ instantMetadata: true });
  await startPlaying({ player, nodes });
  await next(nodes);
  assert.equal(player.audio.playCount, 1);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
});

test('encoded punctuation in manifest URLs resolves to playable path punctuation', async () => {
  const { player, nodes } = fixture();
  await startPlaying({ player, nodes });
  player.tracks[0].src = '/music/My%20Soul%2C%20Your%20Beats!.mp3';
  player.tracks[1].src = '/music/MYTH%20%26%20ROID.mp3';
  player.tracks[2].src = '/music/A%23B%3FC.mp3';
  await next(nodes);
  assert.equal(player.audio.src, 'https://example.test/music/My%20Soul,%20Your%20Beats!.mp3');
  await next(nodes);
  assert.equal(player.audio.src, 'https://example.test/music/MYTH%20&%20ROID.mp3');
  await next(nodes);
  assert.equal(player.audio.src, 'https://example.test/music/A%23B%3FC.mp3');
});

test('rejected autoplay is handled without leaving a metadata listener', async () => {
  const { player, nodes } = fixture();
  await startPlaying({ player, nodes });
  player.audio.rejectPlay = true;
  await next(nodes);
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
  assert.equal(player.pendingAutoplay, true);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
});

test('a superseded play rejection cannot change the new track state', async () => {
  const { player, nodes, pendingPlays } = fixture();
  await startPlaying({ player, nodes });
  player.audio.deferPlay = true;
  await next(nodes); // A
  const oldMetadata = player.audio.dispatch('loadedmetadata');
  assert.equal(pendingPlays.length, 1);
  await next(nodes); // B replaces A while play() is pending
  pendingPlays[0].reject(new Error('old play was interrupted'));
  await oldMetadata;
  assert.equal(player.index, 1);
  assert.equal(player.pendingAutoplay, false);
  assert.equal(nodes.get('[data-music-note]').textContent, '2 / 3');
  assert.equal(player.audio.listenerCount('loadedmetadata'), 1);
});

test('a superseded play resolution cannot clear a newer autoplay request', async () => {
  const { player, nodes, pendingPlays } = fixture();
  await startPlaying({ player, nodes });
  player.audio.deferPlay = true;
  await next(nodes); // A
  const oldMetadata = player.audio.dispatch('loadedmetadata');
  await next(nodes); // B
  player.pendingAutoplay = true;
  pendingPlays[0].resolve();
  await oldMetadata;
  assert.equal(player.pendingAutoplay, true);
  assert.equal(player.metadataRequest.autoplay, true);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 1);
});

test('repeated ClientRouter page loads do not duplicate controls or metadata callbacks', async () => {
  const { player, nodes, document } = fixture();
  await startPlaying({ player, nodes });
  await document.dispatch('astro:page-load'); // HOME -> BLOG
  await document.dispatch('astro:page-load'); // BLOG -> HOME
  assert.equal(nodes.get('[data-music-next]').listenerCount('click'), 1);
  assert.equal(player.audio.listenerCount('ended'), 1);
  await next(nodes);
  await next(nodes);
  await next(nodes);
  const pendingListeners = player.audio.listenerCount('loadedmetadata');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
  assert.equal(pendingListeners, 1);
  assert.equal(player.audio.listenerCount('loadedmetadata'), 0);
});

test('ended still advances and plays the next track after metadata', async () => {
  const { player } = fixture();
  await player.init();
  await player.audio.dispatch('ended'); // C -> A
  assert.equal(player.index, 0);
  assert.equal(player.audio.src, 'https://example.test/a.mp3');
  await player.audio.dispatch('loadedmetadata');
  assert.equal(player.audio.playCount, 1);
});

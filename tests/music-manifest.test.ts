import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

type Track = { id: string; file: string; src: string; title: string };

const musicDir = (root: string) => join(root, 'public/themes/fuyukawa-kagari/music');

async function scaffold(root: string) {
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(musicDir(root), { recursive: true });
  await copyFile(new URL('../scripts/generate-assets.mjs', import.meta.url), join(root, 'scripts/generate-assets.mjs'));
}

function generate(root: string): Promise<Track[]> {
  execFileSync(process.execPath, [join(root, 'scripts/generate-assets.mjs')]);
  return readFile(join(musicDir(root), 'manifest.json'), 'utf8').then((text) => JSON.parse(text) as Track[]);
}

test('generated track IDs depend on the filename, not playlist position', async () => {
  const root = await mkdtemp(join(tmpdir(), 'music-manifest-'));
  try {
    await scaffold(root);
    for (const file of ['A.mp3', 'B.mp3', 'B.flac', '雪 音.mp3', 'notes.txt', 'cover.png']) {
      await writeFile(join(musicDir(root), file), 'fixture');
    }
    const before = await generate(root);
    await writeFile(join(musicDir(root), '0.mp3'), 'fixture');
    const after = await generate(root);
    for (const track of before) {
      assert.equal(after.find((item) => item.file === track.file)?.id, track.id);
    }
    assert.equal(new Set(after.map((track) => track.id)).size, after.length);
    assert.equal(after.find((track) => track.file === '雪 音.mp3')?.src,
      '/themes/fuyukawa-kagari/music/%E9%9B%AA%20%E9%9F%B3.mp3');
    assert.deepEqual(after.map((track) => track.file), ['0.mp3', 'A.mp3', 'B.flac', 'B.mp3', '雪 音.mp3'].map((name) => name.normalize('NFD')).sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' })));
    assert.ok(after.every((track) => !track.file.endsWith('.txt') && !track.file.endsWith('.png')));
    assert.equal(after.find((track) => track.file === 'A.mp3')?.title, 'A');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an empty or missing music directory rewrites an empty manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'music-manifest-empty-'));
  try {
    await scaffold(root);
    await rm(musicDir(root), { recursive: true, force: true });
    execFileSync(process.execPath, [join(root, 'scripts/generate-assets.mjs')]);
    assert.equal(await readFile(join(musicDir(root), 'manifest.json'), 'utf8'), '[]\n');

    await writeFile(join(musicDir(root), 'notes.txt'), 'not audio');
    execFileSync(process.execPath, [join(root, 'scripts/generate-assets.mjs')]);
    assert.equal(await readFile(join(musicDir(root), 'manifest.json'), 'utf8'), '[]\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

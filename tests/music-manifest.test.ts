import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

type Track = { id: string; file: string; src: string };

test('generated track IDs depend on the filename, not playlist position', async () => {
  const root = await mkdtemp(join(tmpdir(), 'music-manifest-'));
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'MUSIC'));
    await copyFile(new URL('../scripts/generate-assets.mjs', import.meta.url), join(root, 'scripts/generate-assets.mjs'));
    for (const file of ['A.mp3', 'B.mp3', 'B.flac', '雪 音.mp3']) {
      await writeFile(join(root, 'MUSIC', file), 'fixture audio');
    }
    const generate = async (): Promise<Track[]> => {
      execFileSync(process.execPath, [join(root, 'scripts/generate-assets.mjs')]);
      return JSON.parse(await readFile(join(root, 'public/themes/fuyukawa-kagari/music/manifest.json'), 'utf8'));
    };
    const before = await generate();
    await writeFile(join(root, 'MUSIC/0.mp3'), 'fixture audio');
    const after = await generate();
    for (const track of before) {
      assert.equal(after.find((item) => item.file === track.file)?.id, track.id);
    }
    assert.equal(new Set(after.map((track) => track.id)).size, after.length);
    assert.equal(after.find((track) => track.file === '雪 音.mp3')?.src,
      '/themes/fuyukawa-kagari/music/%E9%9B%AA%20%E9%9F%B3.mp3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Run the actual build-hook body with a fake Pagefind service, without spawning its binary.
const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
const source = config.slice(config.indexOf('const pagefindIntegration ='), config.indexOf('export default defineConfig'));
const integration = new Function('pagefind', 'fileURLToPath', `${source}; return pagefindIntegration();`);

function fixture({ stage = '', throws = false, warning = false } = {}) {
  const calls: [string, unknown?][] = [];
  const warnings: string[] = [];
  const messages: string[] = [];
  const response = <T, F>(name: string, success: T, failure: F) => async (options: unknown) => {
    calls.push([name, options]);
    if (stage === name) {
      if (throws) throw new Error(`fixture ${name} rejection`);
      return failure;
    }
    return success;
  };
  const index = {
    addDirectory: response('add', { page_count: 2, errors: warning ? ['fixture content warning'] : [] },
      { errors: ['fixture directory failure'] }),
    writeFiles: response('write', { errors: [], outputPath: '/tmp/pagefind' }, { errors: ['fixture write failure'] })
  };
  const pagefind = {
    createIndex: response('create', { index, errors: [] }, { errors: ['fixture index failure'] }),
    close: async () => { calls.push(['close']); }
  };
  const logger = { warn: (value: string) => warnings.push(value), info: (value: string) => messages.push(value) };
  const run = () => integration(pagefind, fileURLToPath).hooks['astro:build:done']({ dir: new URL('file:///tmp/dist/'), logger });
  return { run, calls, warnings, messages };
}

for (const stage of ['create', 'add', 'write']) {
  for (const throws of [false, true]) {
    test(`Pagefind ${stage} ${throws ? 'rejection' : 'error response'} fails the build and closes the service`, async () => {
      const { run, calls } = fixture({ stage, throws });
      await assert.rejects(run, /fixture/);
      assert.equal(calls.at(-1)?.[0], 'close');
      assert.equal(calls.filter(([name]) => name === 'close').length, 1);
      if (stage !== 'write') assert.ok(!calls.some(([name]) => name === 'write'));
    });
  }
}

test('Pagefind content warnings allow a nonempty index to be written', async () => {
  const { run, calls, warnings, messages } = fixture({ warning: true });
  await run();
  assert.deepEqual(calls.map(([name]) => name), ['create', 'add', 'write', 'close']);
  assert.match(warnings[0], /fixture content warning/);
  assert.equal(messages[0], 'Pagefind indexed 2 pages.');
  assert.deepEqual(calls[1][1], { path: '/tmp/dist/', glob: '**/*.html' });
  assert.deepEqual(calls[2][1], { outputPath: '/tmp/dist/pagefind' });
});

test('an empty Pagefind index fails before publication', async () => {
  let closed = false;
  const pagefind = {
    createIndex: async () => ({ errors: [], index: {
      addDirectory: async () => ({ errors: [], page_count: 0 }),
      writeFiles: async () => assert.fail('must not publish an empty index')
    } }),
    close: async () => { closed = true; }
  };
  await assert.rejects(() => integration(pagefind, fileURLToPath).hooks['astro:build:done']({
    dir: new URL('file:///tmp/dist/'), logger: { warn() {}, info() {} }
  }), /Pagefind/);
  assert.equal(closed, true);
});

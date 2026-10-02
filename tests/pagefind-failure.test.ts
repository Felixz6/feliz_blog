import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pagefindIntegration } from '../scripts/lib/pagefind-integration.mjs';

// Exercise the imported build integration with a fake Pagefind service.
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
  const run = () => pagefindIntegration(pagefind).hooks['astro:build:done']({ dir: new URL('file:///tmp/dist/'), logger });
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
  await assert.rejects(() => pagefindIntegration(pagefind).hooks['astro:build:done']({
    dir: new URL('file:///tmp/dist/'), logger: { warn() {}, info() {} }
  }), /Pagefind/);
  assert.equal(closed, true);
});

test('Astro only imports and registers the Pagefind integration after the existing integrations', () => {
  const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /import \{ pagefindIntegration \} from "\.\/scripts\/lib\/pagefind-integration\.mjs";/);
  assert.doesNotMatch(config, /pagefind\.createIndex|fileURLToPath|const pagefindIntegration/);
  assert.ok(config.indexOf('expressiveCode(expressiveCodeOptions)') < config.indexOf('sitemap({'));
  assert.ok(config.indexOf('sitemap({') < config.indexOf('icon({'));
  assert.match(config, /\n    pagefindIntegration\(\)\n  \],/);
  assert.equal(pagefindIntegration().name, 'site-pagefind');
  assert.deepEqual(Object.keys(pagefindIntegration().hooks), ['astro:build:done']);
});

test('injected service preserves method receivers, options, logs and real encoded URL conversion', async () => {
  const calls: string[] = [];
  const index = {
    async addDirectory(options: unknown) {
      assert.equal(this, index); calls.push('add');
      assert.deepEqual(options, { path: '/tmp/Pagefind 测试/', glob: '**/*.html' });
      return { page_count: 2, errors: ['content warning'] };
    },
    async writeFiles(options: unknown) {
      assert.equal(this, index); calls.push('write');
      assert.deepEqual(options, { outputPath: '/tmp/Pagefind 测试/pagefind' });
      return { errors: [] };
    }
  };
  const service = {
    async createIndex(options: unknown) {
      assert.equal(this, service); calls.push('create');
      assert.deepEqual(options, { forceLanguage: 'zh', includeCharacters: '_-:' });
      return { index, errors: [] };
    },
    async close() { assert.equal(this, service); calls.push('close'); }
  };
  await pagefindIntegration(service).hooks['astro:build:done']({
    dir: new URL('file:///tmp/Pagefind%20%E6%B5%8B%E8%AF%95/'),
    logger: {
      warn: (message: string) => { assert.equal(message, 'Pagefind indexing warnings: content warning'); calls.push('warn'); },
      info: (message: string) => { assert.equal(message, 'Pagefind indexed 2 pages.'); calls.push('info'); }
    }
  });
  assert.deepEqual(calls, ['create', 'add', 'warn', 'write', 'info', 'close']);
});

test('missing index, creation errors and nonfinite or negative page counts still prevent publication', async () => {
  for (const scenario of ['missing', 'creation-errors', 'negative', 'NaN', 'Infinity', 'undefined']) {
    const calls: string[] = [];
    const index = {
      async addDirectory() { calls.push('add'); return { errors: [], page_count: ({ negative: -1, NaN, Infinity } as Record<string, number>)[scenario] }; },
      async writeFiles() { assert.fail('must not publish an invalid index'); }
    };
    const service = {
      async createIndex() { calls.push('create'); return { index: scenario === 'missing' ? undefined : index, errors: scenario === 'creation-errors' ? ['creation warning'] : [] }; },
      async close() { calls.push('close'); }
    };
    await assert.rejects(() => pagefindIntegration(service).hooks['astro:build:done']({
      dir: new URL('file:///tmp/dist/'), logger: { warn() { assert.fail('must fail before warning'); }, info() { assert.fail('must not report success'); } }
    }), /Pagefind/);
    assert.deepEqual(calls, ['create', ...(['missing', 'creation-errors'].includes(scenario) ? [] : ['add']), 'close']);
  }
});

for (const stage of ['', 'create', 'add', 'write']) {
  test(`Pagefind close rejection propagates unchanged after ${stage || 'success'}`, async () => {
    const closeError = new Error('fixture close rejection'); const calls: string[] = [];
    const index = {
      async addDirectory() { calls.push('add'); if (stage === 'add') throw new Error('add rejection'); return { page_count: 2, errors: [] }; },
      async writeFiles() { calls.push('write'); if (stage === 'write') throw new Error('write rejection'); return { errors: [] }; }
    };
    const service = {
      async createIndex() { calls.push('create'); if (stage === 'create') throw new Error('create rejection'); return { index, errors: [] }; },
      async close() { calls.push('close'); throw closeError; }
    };
    await assert.rejects(() => pagefindIntegration(service).hooks['astro:build:done']({
      dir: new URL('file:///tmp/dist/'), logger: { warn() {}, info() {} }
    }), (error: unknown) => error === closeError);
    assert.equal(calls.at(-1), 'close'); assert.equal(calls.filter(value => value === 'close').length, 1);
  });
}

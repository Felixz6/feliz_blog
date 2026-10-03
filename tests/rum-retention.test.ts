import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { quote } from '../scripts/rum-cloud.mjs';
import { receiveRum, RETENTION_MS } from '../server/rum.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'config/rum.cloud.json'), 'utf8'));
const wrapper = join(root, 'scripts/rum-retention.mjs');
const now = Date.UTC(2026, 8, 1), cutoff = now - RETENTION_MS;
function fixture(environment = 'preview') {
  const dir = mkdtempSync(join(tmpdir(), 'feliz-rum-retention-'));
  const file = join(dir, 'synthetic.sqlite'), queries = join(dir, 'queries.txt');
  writeFileSync(queries, '');
  const db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL');
  for (const name of ['0001_rum.sql', '0002_cloud_admin.sql']) db.exec(readFileSync(join(root, 'migrations/rum', name), 'utf8'));
  const id = manifest.environments[environment].databaseId;
  db.exec(`INSERT INTO rum_admin_identity VALUES(1,${quote(manifest.accountId)},${quote(id)},${quote(environment)})`);
  const args = ['--authorize-cloud', `--account=${manifest.accountId}`, `--database=${id}`, `--environment=${environment}`, `--now=${new Date(now).toISOString()}`];
  // Discard all inherited Cloudflare credentials and optional real Wrangler paths.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLOUDFLARE_|RUM_|CI$)/.test(key))) as Record<string, string>;
  Object.assign(env, { RUM_RETENTION_ENABLED: 'true', CLOUDFLARE_ACCOUNT_ID: manifest.accountId, CLOUDFLARE_API_TOKEN: 'fake-isolated-token',
    RUM_WRANGLER_CLI: join(root, 'tests/fixtures/rum-retention-wrangler.mjs'), RUM_TEST_DB: file, RUM_TEST_QUERIES: queries,
    RUM_TEST_WRAPPER: wrapper, RUM_TEST_ARGS: JSON.stringify(args) });
  const report = (navigationId: string, started: number, revision = 1) => ({ schema: 'yuimi-web-vitals/v2', navigationId, documentId: 'synthetic-doc', revision,
    path: '/', measurementScope: 'document', navigationStartedAt: new Date(started).toISOString(), navigationStartTime: 0,
    softNavigationSupported: false, deviceClass: 'mobile', viewportWidth: 390, network: '4g', saveData: false, sampledAt: new Date(now).toISOString(), metrics: {} });
  const seed = (nav: string, started: number, conflict = false) => {
    db.exec(`INSERT INTO rum_navigations VALUES(${quote(environment)},${quote(nav)},'[]',${started},${Number(conflict)},${now})`);
    for (const rev of [1, 2]) db.exec(`INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) VALUES(${quote(environment)},${quote(nav)},${rev},'{}',${quote(JSON.stringify(report(nav, started, rev)))},${now})`);
    if (conflict) db.exec(`INSERT INTO rum_conflicts(environment,navigation_id,revision,reason,content_json,payload_json,received_at) VALUES(${quote(environment)},${quote(nav)},1,'revision','{}','{}',${now})`);
  };
  const run = (extra: Record<string, string> = {}, argv = args) => spawnSync(process.execPath, [wrapper, ...argv], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' });
  const ids = () => db.prepare('SELECT navigation_id FROM rum_navigations ORDER BY navigation_id').all().map(r => r.navigation_id);
  const close = () => { db.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, db, env, args, queries, run, seed, ids, close, report };
}
for (const environment of ['production', 'preview']) test(`isolated ${environment}: exact 35-day boundary, late revisions, cascades and idempotency`, () => {
  const f = fixture(environment); try {
    f.seed('old', cutoff - 1, true); f.seed('boundary', cutoff); f.seed('recent', cutoff + 1); f.seed('new', now); f.seed('recent-conflict', cutoff+1, true);
    if (environment === 'preview') {
      f.db.exec(`INSERT INTO rum_synthetic_navigations VALUES('preview','old',${cutoff-1}),('preview','boundary',${cutoff-1}),('preview','recent-marker',${now})`);
    }
    const r = f.run(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /removed=1;/); assert.match(r.stdout, /rum-retention.succeeded/);
    assert.deepEqual(f.ids(), ['boundary', 'new', 'recent', 'recent-conflict']);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM rum_revisions').get()?.n, 8);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM rum_conflicts').get()?.n, 1);
    if (environment === 'preview') assert.deepEqual(f.db.prepare('SELECT navigation_id FROM rum_synthetic_navigations ORDER BY navigation_id').all().map(r => r.navigation_id), ['boundary', 'recent-marker']);
    const again = f.run(); assert.equal(again.status, 0); assert.match(again.stdout, /removed=0;/); assert.deepEqual(f.ids(), ['boundary', 'new', 'recent', 'recent-conflict']);
    console.log(`PASS ISOLATED ${environment}: old=deleted; boundary/recent/new=retained; revisions=8; conflicts=1; repeat removed=0.`);
  } finally { f.close(); }
});
test('expired late report remains 410 and performs no database write', async () => {
  const f = fixture(); try {
    let writes = 0;
    const req = new Request('https://synthetic.invalid/api/rum', { method: 'POST', headers: { Origin: 'https://synthetic.invalid', 'Content-Type': 'text/plain' }, body: JSON.stringify(f.report('late', cutoff-1)) });
    const result = await receiveRum(req, { RUM_ENVIRONMENT: 'preview', RUM_DB: { prepare: () => { writes++; throw new Error('unexpected write'); }, batch: async () => [] } }, now);
    assert.equal(result.status, 410); assert.equal(writes, 0); assert.deepEqual(f.ids(), []);
  } finally { f.close(); }
});
test('activation, credentials and target mismatches exit 1 before transport, not success', () => {
  const f = fixture(); try {
    f.seed('old', cutoff-1);
    const replace = (prefix: string, value: string) => f.args.map(a => a.startsWith(prefix) ? prefix+value : a);
    for (const [extra, args] of [
      [{ RUM_RETENTION_ENABLED: '' }, f.args], [{ CLOUDFLARE_API_TOKEN: '' }, f.args], [{ CLOUDFLARE_API_TOKEN: '  ' }, f.args],
      [{ CLOUDFLARE_ACCOUNT_ID: '' }, f.args], [{ CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }, f.args], [{ CLOUDFLARE_API_KEY: 'fake' }, f.args],
      [{}, replace('--environment=', 'production')], [{}, replace('--database=', manifest.environments.production.databaseId)],
      [{}, replace('--account=', 'a'.repeat(32))], [{}, [...f.args, '--remote']], [{}, [...f.args, '--now=2099-01-01T00:00:00Z']],
    ] as [Record<string, string>, string[]][]) {
      const r = f.run(extra, args); assert.equal(r.status, 1); assert.match(r.stdout, /rum-retention.failed/); assert.doesNotMatch(r.stdout, /succeeded|PASS/);
    }
    assert.equal(readFileSync(f.queries, 'utf8'), ''); assert.deepEqual(f.ids(), ['old']);
  } finally { f.close(); }
});
test('stored account/database/environment mismatch fails before any DELETE', () => {
  for (const [field, value] of [['account_id', 'a'.repeat(32)], ['database_id', manifest.environments.production.databaseId], ['environment', 'production']]) {
    const f = fixture(); try {
      f.seed('old', cutoff-1); f.db.exec(`UPDATE rum_admin_identity SET ${field}=${quote(value)}`);
      const r = f.run(); assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /succeeded|PASS/);
      assert.doesNotMatch(readFileSync(f.queries, 'utf8'), /DELETE/); assert.deepEqual(f.ids(), ['old']);
    } finally { f.close(); }
  }
});
test('database errors and invalid/empty/nonprimary responses exit 1 without leaking raw errors', () => {
  for (const extra of [{ RUM_TEST_FAIL: 'SELECT account_id' }, { RUM_TEST_FAIL: 'DELETE FROM rum_navigations' },
    ...['not-json', '[]', '[null]', '[{"success":false,"results":[]}]', '[{"success":true}]', '[{"success":true,"results":[],"meta":{"served_by_primary":false}}]'].map(RUM_TEST_RESPONSE => ({ RUM_TEST_RESPONSE, RUM_TEST_RESPONSE_ON: 'DELETE FROM rum_navigations' }))]) {
    const f = fixture(); try {
      f.seed('old', cutoff-1); const r = f.run(extra); assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /succeeded|PASS/);
      assert.doesNotMatch(r.stdout+r.stderr, /fake-isolated-token|secret-that-must-not-leak/); assert.deepEqual(f.ids(), ['old']);
    } finally { f.close(); }
  }
});
test('second cleanup statement failure is failed, even after the navigation deletion commits', () => {
  const f = fixture(); try {
    f.seed('old', cutoff-1); const r = f.run({ RUM_TEST_FAIL: 'DELETE FROM rum_synthetic_navigations' });
    assert.equal(r.status, 1); assert.match(r.stdout, /rum-retention.failed/); assert.doesNotMatch(r.stdout, /succeeded|PASS/); assert.deepEqual(f.ids(), []);
    const retry = f.run(); assert.equal(retry.status, 0); assert.match(retry.stdout, /removed=0;/);
  } finally { f.close(); }
});
test('cleanup interleaved with real CLI export discards stale pages and publishes only stable survivors', () => {
  const f = fixture(); try {
    f.seed('old', cutoff-1); f.seed('boundary', cutoff); f.seed('recent', cutoff+1);
    const out = join(f.dir, 'synthetic-export.json');
    const args = ['export', ...f.args.filter(a => !a.startsWith('--now=')), `--from=${new Date(cutoff-2).toISOString()}`, `--to=${new Date(now+1).toISOString()}`, '--page-size=1', `--out=${out}`];
    const r = spawnSync(process.execPath, [join(root, 'scripts/rum-cloud.mjs'), ...args], { cwd: root, env: { ...f.env, RUM_TEST_RACE: join(f.dir, 'raced') }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.ok(existsSync(out));
    const data = JSON.parse(readFileSync(out, 'utf8')); assert.equal(data.export.attempts, 2);
    assert.deepEqual(data.reports.map((r: any) => r.navigationId), ['boundary', 'boundary', 'recent', 'recent']);
    assert.deepEqual(f.ids(), ['boundary', 'recent']);
    console.log('PASS ISOLATED CONCURRENCY: attempts=2; stale old revisions discarded; boundary/recent revisions=4; no partial export.');
  } finally { f.close(); }
});
test('failed CLI export during cleanup leaves the existing output untouched', () => {
  const f = fixture(); try {
    f.seed('old', cutoff-1); f.seed('recent', cutoff+1);
    const out = join(f.dir, 'existing-export.json'); writeFileSync(out, 'existing-output');
    const args = ['export', ...f.args.filter(a => !a.startsWith('--now=')), `--from=${new Date(cutoff-2).toISOString()}`, `--to=${new Date(now+1).toISOString()}`, '--page-size=1', `--out=${out}`];
    // Cleanup commits after the first page; a subsequent page fails.
    const r = spawnSync(process.execPath, [join(root, 'scripts/rum-cloud.mjs'), ...args], { cwd: root, env: { ...f.env, RUM_TEST_RACE: join(f.dir, 'raced'), RUM_TEST_FAIL_AFTER_RACE: 'true' }, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.equal(readFileSync(out, 'utf8'), 'existing-output'); assert.deepEqual(f.ids(), ['recent']);
  } finally { f.close(); }
});
test('workflow is inert, production-only, serialized, guarded and uses the existing CLI without SQL/deploy', () => {
  const file = readFileSync(join(root, 'config/automation/rum-retention.yml.disabled'), 'utf8');
  assert.ok(!existsSync(join(root, '.github/workflows/rum-retention.yml')));
  for (const text of ["cron: '17 19 * * *'", 'cancel-in-progress: false', 'contents: read', 'persist-credentials: false', 'timeout-minutes: 10', 'test "$ENABLED" = true', 'test "$REF" = refs/heads/main', '--environment=production', 'npm run rum:retention', 'if: failure()']) assert.ok(file.includes(text), text);
  assert.doesNotMatch(file, /continue-on-error|\bon:\s*\n\s*(push|pull_request)|DELETE FROM|wrangler deploy|pages deploy/);
  const code = readFileSync(wrapper, 'utf8'); assert.doesNotMatch(code, /DELETE FROM|35\s*\*|RETENTION_MS/); assert.match(code, /await cloudMain/);
});

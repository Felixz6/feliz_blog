import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
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
test('workflow is delivered, production-only, serialized, guarded and uses the existing CLI without SQL/deploy', () => {
  const file = readFileSync(join(root, '.github/workflows/rum-retention.yml'), 'utf8');
  assert.ok(existsSync(join(root, '.github/workflows/rum-retention.yml')));
  assert.ok(!existsSync(join(root, 'config/automation/rum-retention.yml.disabled')));
  for (const text of ["cron: '17 19 * * *'", 'cancel-in-progress: false', 'contents: read', 'persist-credentials: false', 'timeout-minutes: 10', 'test "$ENABLED" = true', 'test "$REF" = refs/heads/main', '--environment=production', 'npm run rum:retention', 'if: failure()']) assert.ok(file.includes(text), text);
  assert.doesNotMatch(file, /continue-on-error|\bon:\s*\n\s*(push|pull_request)|DELETE FROM|wrangler deploy|pages deploy/);
  const code = readFileSync(wrapper, 'utf8'); assert.doesNotMatch(code, /DELETE FROM|35\s*\*|RETENTION_MS/); assert.match(code, /await cloudMain/);
});

// Exercise the workflow's actual conditions and shell blocks, not a second CLI.
// This is a narrow expression model + isolated commands, not a GitHub runner.
function workflowJob(name: string) {
  const file = readFileSync(join(root, '.github/workflows/rum-retention.yml'), 'utf8');
  const section = file.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]+:\\n|(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(section, name);
  const condition = section.match(/^    if: >-\n((?:      .*\n)+)/m)?.[1];
  assert.ok(condition, `${name} job condition`);
  const expression = condition.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/([a-z_]+\.[a-z_A-Z]+)\s*==\s*('[^']*')/g, 'equal($1, $2)');
  const scripts = [...section.matchAll(/^        run: \|\n((?:          .*(?:\n|$))+)/gm)]
    .map(match => match[1].split('\n').map(line => line.slice(10)).join('\n'));
  assert.equal(scripts.length, 2, `${name}: guard and existing CLI only`);
  return { file, section, expression, scripts };
}
function runWorkflow(f: ReturnType<typeof fixture>, event: string, operation: string | undefined, enabled: string,
  extra: Record<string, string> = {}, repository = 'Felixz6/feliz_blog', ref = 'refs/heads/main') {
  const file = readFileSync(join(root, '.github/workflows/rum-retention.yml'), 'utf8');
  const selected = operation ?? (event === 'workflow_dispatch' ? file.match(/^        default: '([^']+)'$/m)?.[1] : '');
  const context = { github: { event_name: event, repository, ref }, inputs: { operation: selected },
    vars: { RUM_RETENTION_ENABLED: enabled },
    // GitHub compares strings case-insensitively; exact shell/CLI gates still apply.
    equal: (left: string, right: string) => left.toLowerCase() === right.toLowerCase() };
  const eligible = ['preflight', 'cleanup'].filter(name => runInNewContext(workflowJob(name).expression, context));
  assert.ok(eligible.length <= 1, 'paths must be mutually exclusive');
  if (!eligible.length) return { job: 'skipped', status: 0, signal: null, stdout: '', stderr: '' };
  const job = eligible[0];
  const env = { ...f.env, ENABLED: enabled, RUM_RETENTION_ENABLED: enabled, REPOSITORY: repository, REF: ref,
    CLOUDFLARE_ACCOUNT_ID: manifest.accountId, RUM_DATABASE_ID: manifest.environments.production.databaseId,
    CI: 'true', WRANGLER_SEND_METRICS: 'false', ...extra };
  // The inherited real credentials are already removed by fixture(); this
  // transport points only to the local synthetic database and fake token.
  const r = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', workflowJob(job).scripts.join('\n')],
    { cwd: root, env, encoding: 'utf8' });
  return { job, status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr };
}
test('workflow structure: default read-only choice, fixed production credentials, independent job gates', () => {
  const p = workflowJob('preflight'), c = workflowJob('cleanup');
  assert.match(p.file, /operation:\n        description:.*\n        required: true\n        type: choice\n        default: '只读预检'\n        options:\n          - '只读预检'\n          - '清理'/);
  assert.deepEqual([...p.file.matchAll(/^      ([a-z_]+):$/gm)].map(x => x[1]), ['operation']);
  assert.doesNotMatch(p.section, /RUM_RETENTION_ENABLED|npm run rum:retention|cleanup --|succeeded/);
  assert.match(p.scripts[1], /npm run rum:cloud -- status --authorize-cloud/);
  assert.match(c.scripts[1], /npm run rum:retention -- --authorize-cloud/);
  for (const job of [p, c]) {
    for (const text of ['secrets.RUM_RETENTION_API_TOKEN', 'vars.RUM_RETENTION_ACCOUNT_ID', 'vars.RUM_RETENTION_PRODUCTION_DB_ID',
      '--environment=production', 'timeout-minutes: 10', 'persist-credentials: false', "node-version: '24.21.0'", "CI: 'true'", "WRANGLER_SEND_METRICS: 'false'"])
      assert.ok(job.section.includes(text), text);
    assert.doesNotMatch(job.scripts.join('\n'), /\$\{\{\s*inputs\.|\beval\b|\$@|--command|--environment=preview|set -x/);
  }
  for (const guard of ['CLOUDFLARE_API_TOKEN//[[:space:]]/', 'test -n "$CLOUDFLARE_ACCOUNT_ID"', 'test -n "$RUM_DATABASE_ID"',
    'test -z "${CLOUDFLARE_API_KEY:-}"', 'test -z "${CLOUDFLARE_EMAIL:-}"']) {
    assert.ok(p.scripts[1].indexOf(guard) >= 0 && p.scripts[1].indexOf(guard) < p.scripts[1].indexOf('npm run'));
  }
});
test('isolated manual default/preflight uses only identity SELECT + status SELECT, even when disabled', () => {
  for (const enabled of ['false', 'true']) {
    const f = fixture('production'); try {
      f.seed('old', cutoff-1, true); f.seed('recent', now);
      const before = f.db.prepare('SELECT * FROM rum_export_epoch ORDER BY environment').all();
      const r = runWorkflow(f, 'workflow_dispatch', undefined, enabled);
      assert.equal(r.job, 'preflight'); assert.equal(r.status, 0, r.stderr);
      assert.equal(r.signal, null); assert.doesNotMatch(r.stdout+r.stderr, /cleanup|succeeded|fake-isolated-token/);
      const sql = readFileSync(f.queries, 'utf8').trim().split('\n'); assert.equal(sql.length, 2);
      assert.match(sql[0], /^SELECT account_id,database_id,environment FROM rum_admin_identity/);
      assert.match(sql[1], /^SELECT .* AS navigations/);
      assert.ok(sql.every(q => q.startsWith('SELECT '))); assert.doesNotMatch(sql.join('\n'), /\b(DELETE|INSERT|UPDATE|CREATE|DROP)\b/);
      assert.deepEqual(f.ids(), ['old', 'recent']);
      assert.deepEqual(f.db.prepare('SELECT * FROM rum_export_epoch ORDER BY environment').all(), before);
      console.log(`PASS WORKFLOW ISOLATED default: enabled=${enabled}; job=preflight; queries=2 SELECT; generation unchanged.`);
    } finally { f.close(); }
  }
});
test('disabled manual/scheduled cleanup is skipped, not failed or reported as success', () => {
  const f = fixture('production'); try {
    f.seed('old', cutoff-1);
    for (const enabled of ['false', '', 'FALSE', ' false ']) for (const event of ['workflow_dispatch', 'schedule']) {
      const r = runWorkflow(f, event, '清理', enabled); assert.equal(r.job, 'skipped'); assert.equal(r.status, 0);
      assert.equal(r.stdout+r.stderr, '');
    }
    assert.equal(readFileSync(f.queries, 'utf8'), ''); assert.deepEqual(f.ids(), ['old']);
    console.log('PASS WORKFLOW ISOLATED disabled: manual/schedule skipped; queries=0; no cleanup success/failure output.');
  } finally { f.close(); }
});
test('enabled scheduled or explicit manual cleanup alone reaches unchanged retention CLI', () => {
  for (const event of ['workflow_dispatch', 'schedule']) {
    const f = fixture('production'); try {
      f.seed('old', Date.now()-RETENTION_MS-86400000, true); f.seed('recent', Date.now());
      // A schedule cannot enter preflight even if it carries that input.
      const r = runWorkflow(f, event, event === 'schedule' ? '只读预检' : '清理', 'true');
      assert.equal(r.job, 'cleanup'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /removed=1;/);
      assert.match(r.stdout, /rum-retention.succeeded/); assert.deepEqual(f.ids(), ['recent']);
      const sql = readFileSync(f.queries, 'utf8'); assert.match(sql, /DELETE FROM rum_navigations/);
      assert.match(sql, /DELETE FROM rum_synthetic_navigations/); assert.doesNotMatch(sql, / AS navigations/);
      console.log(`PASS WORKFLOW ISOLATED ${event}: enabled=true; job=cleanup; original CLI removed=1.`);
    } finally { f.close(); }
  }
});
test('unknown event/input/repository/ref cannot select a path; uppercase TRUE fails exact cleanup guard', () => {
  const f = fixture('production'); try {
    f.seed('old', cutoff-1);
    for (const [event, operation, repository, ref] of [
      ['push', '清理', 'Felixz6/feliz_blog', 'refs/heads/main'],
      ['workflow_dispatch', 'arbitrary SQL', 'Felixz6/feliz_blog', 'refs/heads/main'],
      ['workflow_dispatch', '只读预检', 'other/repo', 'refs/heads/main'],
      ['workflow_dispatch', '清理', 'Felixz6/feliz_blog', 'refs/heads/preview'],
    ]) assert.equal(runWorkflow(f, event, operation, 'true', {}, repository, ref).job, 'skipped');
    const r = runWorkflow(f, 'workflow_dispatch', '清理', 'TRUE');
    assert.equal(r.job, 'cleanup'); assert.equal(r.status, 1); assert.doesNotMatch(r.stdout+r.stderr, /succeeded|fake-isolated-token/);
    assert.equal(readFileSync(f.queries, 'utf8'), ''); assert.deepEqual(f.ids(), ['old']);
  } finally { f.close(); }
});
test('preflight rejects missing/ambiguous credentials and incorrect configured targets before transport', () => {
  const f = fixture('production'); try {
    for (const extra of [{ CLOUDFLARE_API_TOKEN: '' }, { CLOUDFLARE_API_TOKEN: ' \t\n ' }, { CLOUDFLARE_ACCOUNT_ID: '' },
      { RUM_DATABASE_ID: '' }, { CLOUDFLARE_API_KEY: 'fake-global-key' }, { CLOUDFLARE_EMAIL: 'fake@example.invalid' },
      { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }, { RUM_DATABASE_ID: manifest.environments.preview.databaseId }] as Record<string, string>[]) {
      const r = runWorkflow(f, 'workflow_dispatch', '只读预检', 'false', extra);
      assert.equal(r.job, 'preflight'); assert.equal(r.status, 1); assert.doesNotMatch(r.stdout+r.stderr, /fake-isolated-token|fake-global-key|succeeded/);
    }
    assert.equal(readFileSync(f.queries, 'utf8'), '');
  } finally { f.close(); }
});
test('preflight stored identity or query failure stops after identity SELECT without credential leakage', () => {
  for (const [field, value] of [['account_id', 'a'.repeat(32)], ['database_id', manifest.environments.preview.databaseId], ['environment', 'preview'], ['', '']]) {
    const f = fixture('production'); try {
      f.seed('old', cutoff-1);
      if (field) f.db.exec(`UPDATE rum_admin_identity SET ${field}=${quote(value)}`);
      const r = runWorkflow(f, 'workflow_dispatch', '只读预检', 'false', field ? {} : { RUM_TEST_FAIL: 'SELECT account_id' });
      assert.equal(r.status, 1); assert.doesNotMatch(r.stdout+r.stderr, /fake-isolated-token|secret-that-must-not-leak|SIMULATED_DATABASE_FAILURE|succeeded/);
      const sql = readFileSync(f.queries, 'utf8').trim().split('\n'); assert.equal(sql.length, 1);
      assert.match(sql[0], /^SELECT account_id/); assert.doesNotMatch(sql[0], /DELETE|INSERT|UPDATE/); assert.deepEqual(f.ids(), ['old']);
    } finally { f.close(); }
  }
});

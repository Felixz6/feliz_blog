// Transport-only fixture: every SQL statement comes from the actual cloud CLI.
// This process never opens a network connection or reads real credentials.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
assert.deepEqual(args.slice(0, 3), ['d1', 'execute', 'RUM_DB']);
assert.ok(args.includes('--remote') && args.includes('--json'));
const config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'));
const sql = args[args.indexOf('--command') + 1];
assert.equal(config.account_id, process.env.CLOUDFLARE_ACCOUNT_ID);
assert.ok(process.env.RUM_TEST_DB?.startsWith('/'));
appendFileSync(process.env.RUM_TEST_QUERIES, sql + '\n');
if (process.env.RUM_TEST_FAIL && sql.startsWith(process.env.RUM_TEST_FAIL)) {
  console.error('SIMULATED_DATABASE_FAILURE secret-that-must-not-leak'); process.exit(9);
}
if (process.env.RUM_TEST_RESPONSE && (!process.env.RUM_TEST_RESPONSE_ON || sql.startsWith(process.env.RUM_TEST_RESPONSE_ON))) {
  console.log(process.env.RUM_TEST_RESPONSE); process.exit(0);
}
if (process.env.RUM_TEST_FAIL_AFTER_RACE === 'true' && process.env.RUM_TEST_RACE && existsSync(process.env.RUM_TEST_RACE) && sql.startsWith('SELECT r.row_id')) process.exit(9);
const db = new DatabaseSync(process.env.RUM_TEST_DB);
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const identity = db.prepare('SELECT * FROM rum_admin_identity').get();
assert.equal(identity.database_id, config.d1_databases[0].database_id);
const results = db.prepare(sql).all();
db.close();
// Deterministic interleaving: cleanup commits between export's first page and
// ending generation check. A marker allows only one cleanup across all pages.
if (process.env.RUM_TEST_RACE && sql.startsWith('SELECT r.row_id') && !existsSync(process.env.RUM_TEST_RACE)) {
  writeFileSync(process.env.RUM_TEST_RACE, 'interleaved');
  const env = { ...process.env }; delete env.RUM_TEST_RACE;
  const cleanup = spawnSync(process.execPath, [process.env.RUM_TEST_WRAPPER, ...JSON.parse(process.env.RUM_TEST_ARGS)], { env, encoding: 'utf8' });
  assert.equal(cleanup.status, 0, cleanup.stderr);
}
console.log(JSON.stringify([{ success: true, results, meta: { served_by_primary: true } }]));

import { instant } from '../server/rum.ts';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const WRANGLER_VERSION = '4.145.0';
const config = resolve(root, 'config/rum.local.json');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(root, '.wrangler/cli-logs') };
// Optional path is an operator-installed Wrangler CLI, not an arbitrary command string.
const cli = process.env.RUM_WRANGLER_CLI;
function invocation(args) {
  return cli ? [process.execPath, [resolve(cli), ...args]]
    : ['npm', ['exec', '--yes', `--package=wrangler@${WRANGLER_VERSION}`, '--', 'wrangler', ...args]];
}
export function runWrangler(args) {
  const [command, commandArgs] = invocation(args);
  const result = spawnSync(command, commandArgs, { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Local Wrangler command failed. Inspect the local CLI output: ' + (result.stderr || result.stdout).slice(-3000));
  return result.stdout;
}
export function queryLocal(state, sql) {
  const output = runWrangler(['d1', 'execute', 'RUM_DB', '--local', '--config', config, '--persist-to', state, '--command', sql, '--json']);
  const rows = JSON.parse(output);
  if (!Array.isArray(rows) || rows.some(row => row.success !== true)) throw new Error('Local D1 query did not succeed.');
  return rows.flatMap(row => row.results || []);
}
function iso(value) {
  const timestamp = instant(value);
  if (!Number.isFinite(timestamp)) throw new Error('Use valid timezone-qualified ISO timestamps.');
  return timestamp;
}
export function parseOptions(argv) {
  const [action, ...flags] = argv;
  if (!['init','dev','export','cleanup'].includes(action)) throw new Error('Use init, dev, export or cleanup.');
  const options = {};
  for (const flag of flags) {
    const match = /^--(authorize-local|state|out|from|to|page-size|port|now)(?:=(.*))?$/.exec(flag);
    if (!match || Object.hasOwn(options, match[1])) throw new Error('Unknown or duplicate local option.');
    if (match[1] !== 'authorize-local' && (match[2] === undefined || !match[2])) throw new Error('Option requires a value.');
    options[match[1]] = match[2] ?? true;
  }
  if (options['authorize-local'] !== true) throw new Error('Local database operation requires --authorize-local and OS access to its state directory.');
  const allowed = { init: ['state'], dev: ['state','port'], export: ['state','out','from','to','page-size'], cleanup: ['state','now'] }[action];
  if (Object.keys(options).some(key => key !== 'authorize-local' && !allowed.includes(key))) throw new Error('Option does not apply to this action.');
  const state = resolve(root, options.state || '.wrangler/rum');
  const port = options.port === undefined ? 8788 : Number(options.port);
  const pageSize = options['page-size'] === undefined ? 100 : Number(options['page-size']);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('Invalid port or page size.');
  if (action === 'export' && (typeof options.out !== 'string' || !options.out || typeof options.from !== 'string' || typeof options.to !== 'string' || iso(options.from) >= iso(options.to))) throw new Error('Export requires --out, --from and --to with start < end.');
  if (options.now !== undefined && (typeof options.now !== 'string' || iso(options.now) > Date.now())) throw new Error('Cleanup --now must not be in the future.');
  return { action, state, options, port, pageSize };
}
export async function localMain(argv) {
  const { action, state, options, port, pageSize } = parseOptions(argv);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const lock = resolve(state, '.rum-local-operation.lock');
  try { await mkdir(lock, { mode: 0o700 }); }
  catch { throw new Error('Local operation already active: stop Pages dev/export/cleanup first. Never remove an active lock.'); }
  try {
    if (action === 'init') {
      runWrangler(['d1','execute','RUM_DB','--local','--config',config,'--persist-to',state,'--file',resolve(root,'migrations/rum/0001_rum.sql'),'--json']);
      console.log('PASS local D1 schema initialized.');
    } else if (action === 'dev') {
      const [command, args] = invocation(['pages','dev',resolve(root,'dist'),'--d1','RUM_DB=00000000-0000-0000-0000-000000000001','--binding','RUM_ENVIRONMENT=local','--compatibility-date','2026-09-24','--persist-to',state,'--ip','127.0.0.1','--port',String(port)]);
      const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
      const stop = () => child.kill('SIGTERM');
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      try { await new Promise((res, rej) => { child.on('error',rej); child.on('exit',(code,signal) => code === 0 || signal ? res() : rej(new Error('Local Pages exited with failure.'))); }); }
      finally { process.off('SIGINT',stop); process.off('SIGTERM',stop); }
    } else if (action === 'cleanup') {
      const now = options.now === undefined ? Date.now() : iso(options.now);
      const cutoff = now - 35 * 86400000;
      const before = queryLocal(state, `SELECT count(*) AS count FROM rum_navigations WHERE environment='local' AND navigation_started_at < ${cutoff}`)[0].count;
      queryLocal(state, `DELETE FROM rum_navigations WHERE environment='local' AND navigation_started_at < ${cutoff}`);
      console.log(`PASS local cleanup: expired navigations removed=${before}; retention=35 days; cutoff exclusive.`);
    } else {
      // Offline, serialized with local dev/cleanup. Keyset pages keep all revisions,
      // not only the newest one; selection is on immutable navigation start.
      const from = iso(options.from), to = iso(options.to);
      const max = queryLocal(state, `SELECT coalesce(max(row_id),0) AS high FROM rum_revisions`)[0].high;
      let cursor = 0, pages = 0; const reports = [];
      while (true) {
        const rows = queryLocal(state, `SELECT r.row_id,r.payload_json FROM rum_revisions r JOIN rum_navigations n ON n.environment=r.environment AND n.navigation_id=r.navigation_id WHERE n.environment='local' AND n.quarantined=0 AND n.navigation_started_at>=${from} AND n.navigation_started_at<${to} AND r.row_id>${cursor} AND r.row_id<=${max} ORDER BY r.row_id LIMIT ${pageSize}`);
        if (!rows.length) break;
        reports.push(...rows.map(row => JSON.parse(row.payload_json))); cursor = rows.at(-1).row_id; pages++;
      }
      const out = resolve(root, options.out); await mkdir(dirname(out), { recursive: true, mode: 0o700 });
      // Exclusive temporary file, mode 0600; rename only after every page succeeds.
      const tmp = out + `.${process.pid}.tmp`;
      try { await writeFile(tmp, JSON.stringify({ reports }, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(tmp,out); }
      finally { await rm(tmp, { force: true }); }
      console.log(`PASS local export: revisions=${reports.length}; pages=${pages}; quarantined excluded; window=[from,to).`);
    }
  } finally { await rm(lock, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await localMain(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

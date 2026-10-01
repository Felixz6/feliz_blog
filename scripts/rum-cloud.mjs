import { instant, validateReport } from '../server/rum.ts';
import { WRANGLER_VERSION } from './rum-local.mjs';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
export const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const timestamp = value => {
  const ms = instant(value);
  if (!Number.isFinite(ms)) throw new Error('Use a valid timezone-qualified ISO timestamp.');
  return ms;
};
export function parseCloudOptions(argv) {
  const [action, ...args] = argv;
  const actions = { status: [], export: ['from','to','out','page-size','cohort'], cleanup: ['now'], 'register-synthetic': ['ids'] };
  if (!Object.hasOwn(actions, action)) throw new Error('Use status, export, cleanup or register-synthetic.');
  const options = {};
  for (const arg of args) {
    const match = /^--(authorize-cloud|account|database|environment|from|to|out|page-size|cohort|now|ids)(?:=(.*))?$/.exec(arg);
    if (!match || Object.hasOwn(options, match[1])) throw new Error('Unknown or duplicate cloud option.');
    const [,key,value] = match;
    if (key==='authorize-cloud' ? value!==undefined : !value) throw new Error('Invalid cloud option value.');
    options[key] = value ?? true;
  }
  if (options['authorize-cloud']!==true || !/^[a-f0-9]{32}$/.test(options.account || '') || !/^[a-f0-9-]{36}$/.test(options.database || '') || !['production','preview'].includes(options.environment)) throw new Error('Explicit cloud authorization, account, database UUID and environment required.');
  if (Object.keys(options).some(k => !['authorize-cloud','account','database','environment',...actions[action]].includes(k))) throw new Error('Option does not apply to this action.');
  const pageSize = options['page-size']===undefined ? 100 : Number(options['page-size']);
  if (!Number.isInteger(pageSize) || pageSize<1 || pageSize>500) throw new Error('Page size must be 1..500.');
  const cohort = options.cohort || 'natural';
  if (!['natural','synthetic'].includes(cohort) || (cohort==='synthetic' && options.environment!=='preview')) throw new Error('Synthetic export is preview-only.');
  if (action==='register-synthetic' && (options.environment!=='preview' || !options.ids)) throw new Error('Synthetic registration requires a preview ID file.');
  if (action==='export' && (!options.out || timestamp(options.from)>=timestamp(options.to))) throw new Error('Export requires output and start < end.');
  if (options.now!==undefined && timestamp(options.now)>Date.now()) throw new Error('Cleanup time must not be in the future.');
  return {action,options,pageSize,cohort};
}
export function validateBinding(manifest, options) {
  if (manifest.accountId!==options.account || manifest.projectName!=='feliz-blog') throw new Error('Account or project mismatch.');
  const p=manifest.environments?.production, v=manifest.environments?.preview;
  if (!p || !v || p.databaseId===v.databaseId || ![p,v].every(x => /^[a-f0-9-]{36}$/.test(x.databaseId) && typeof x.databaseName==='string')) throw new Error('Distinct production and preview database bindings required.');
  if (manifest.environments[options.environment].databaseId!==options.database) throw new Error('Database does not match the selected environment.');
  return manifest.environments[options.environment];
}
export async function createRemoteQuery(options) {
  const manifest=JSON.parse(await readFile(resolve(root,'config/rum.cloud.json'),'utf8'));
  const binding=validateBinding(manifest,options);
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID!==options.account) throw new Error('Credential account selector mismatch.');
  // This file is for D1 administration, not a Pages deployment configuration.
  const dir=resolve(root,'.wrangler/rum-cloud'); await mkdir(dir,{recursive:true,mode:0o700});
  const config=resolve(dir,`${randomUUID()}.json`);
  await writeFile(config,JSON.stringify({name:'feliz-rum-admin',account_id:options.account,compatibility_date:'2026-09-24',d1_databases:[{binding:'RUM_DB',database_name:binding.databaseName,database_id:options.database}]}),{mode:0o600,flag:'wx'});
  const query=async sql => {
    const cli=process.env.RUM_WRANGLER_CLI;
    const args=['d1','execute','RUM_DB','--remote','--config',config,'--command',sql,'--json'];
    const command=cli ? process.execPath : 'npm';
    const commandArgs=cli ? [resolve(cli),...args] : ['exec','--yes',`--package=wrangler@${WRANGLER_VERSION}`,'--','wrangler',...args];
    const result=spawnSync(command,commandArgs,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:options.account,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(root,'.wrangler/cli-logs')}});
    // Never echo raw remote error text, SQL, telemetry payloads or credentials.
    if (result.status!==0) throw new Error('Authorized cloud D1 command failed; no export published.');
    let batches; try { batches=JSON.parse(result.stdout); } catch { throw new Error('Invalid cloud D1 response.'); }
    if (!Array.isArray(batches) || batches.some(x => x.success!==true || x.meta?.served_by_primary===false)) throw new Error('Cloud D1 query must succeed on the primary.');
    return batches.flatMap(x=>x.results || []);
  };
  return {query,close:()=>rm(config,{force:true})};
}
export async function assertDatabaseIdentity(query,options) {
  const rows=await query('SELECT account_id,database_id,environment FROM rum_admin_identity WHERE singleton=1');
  if (rows.length!==1 || rows[0].account_id!==options.account || rows[0].database_id!==options.database || rows[0].environment!==options.environment) throw new Error('Stored database identity does not match explicit cloud target.');
}
export async function exportConsistent(query,{environment,from,to,pageSize=100,cohort='natural',maxAttempts=3}) {
  const e=quote(environment), start=timestamp(from), end=timestamp(to);
  if (!['production','preview'].includes(environment) || !['natural','synthetic'].includes(cohort) || (cohort==='synthetic' && environment!=='preview') || start>=end || !Number.isInteger(pageSize) || pageSize<1 || pageSize>500 || !Number.isInteger(maxAttempts) || maxAttempts<1 || maxAttempts>3) throw new Error('Invalid export selection.');
  // All REST queries hit the primary. Triggers increment the monotonic epoch for
  // every revision, conflict/quarantine, deletion and synthetic classification.
  // A stable begin/end epoch proves every keyset page came from the same state.
  // Concurrent changes discard the entire attempt, never publish partial JSON.
  for (let attempt=1;attempt<=maxAttempts;attempt++) {
    const before=(await query(`SELECT generation,(SELECT coalesce(max(row_id),0) FROM rum_revisions WHERE environment=${e}) AS high FROM rum_export_epoch WHERE environment=${e}`))[0];
    if (!before || !Number.isSafeInteger(before.generation) || !Number.isSafeInteger(before.high)) throw new Error('Missing export generation.');
    const classification=`EXISTS(SELECT 1 FROM rum_synthetic_navigations s WHERE s.environment=n.environment AND s.navigation_id=n.navigation_id)`;
    const reports=[];let cursor=0,pages=0;
    while (true) {
      const rows=await query(`SELECT r.row_id,r.payload_json FROM rum_revisions r JOIN rum_navigations n ON n.environment=r.environment AND n.navigation_id=r.navigation_id WHERE n.environment=${e} AND n.quarantined=0 AND n.navigation_started_at>=${start} AND n.navigation_started_at<${end} AND ${cohort==='natural'?'NOT ':''}${classification} AND r.row_id>${cursor} AND r.row_id<=${before.high} ORDER BY r.row_id LIMIT ${pageSize}`);
      if (!rows.length) break;
      for (const row of rows) {
        if (!Number.isSafeInteger(row.row_id) || row.row_id<=cursor || row.row_id>before.high) throw new Error('Invalid export cursor.');
        const data=validateReport(JSON.parse(row.payload_json));
        reports.push(data.report);cursor=row.row_id;
      }
      pages++;
    }
    const after=(await query(`SELECT generation FROM rum_export_epoch WHERE environment=${e}`))[0];
    if (after?.generation===before.generation) return {reports,export:{environment,cohort,windowStart:new Date(start).toISOString(),windowEnd:new Date(end).toISOString(),generation:before.generation,highWater:before.high,pages,attempts:attempt,completedAt:new Date().toISOString()}};
  }
  throw new Error('Concurrent D1 changes prevented a consistent export after 3 attempts; retry later. No output published.');
}
export async function cloudMain(argv) {
  const {action,options,pageSize,cohort}=parseCloudOptions(argv);
  const connection=await createRemoteQuery(options), query=connection.query;
  try {
    await assertDatabaseIdentity(query,options);
    const e=quote(options.environment);
    if (action==='status') {
      const counts=await query(`SELECT (SELECT count(*) FROM rum_navigations WHERE environment=${e}) AS navigations,(SELECT count(*) FROM rum_revisions WHERE environment=${e}) AS revisions,(SELECT count(*) FROM rum_conflicts WHERE environment=${e}) AS conflicts,(SELECT count(*) FROM rum_navigations WHERE environment=${e} AND quarantined=1) AS quarantined,(SELECT count(*) FROM rum_navigations WHERE environment<>${e}) AS otherEnvironmentNavigations`);
      console.log(JSON.stringify({environment:options.environment,database:options.database,...counts[0]}));
    } else if (action==='register-synthetic') {
      const ids=JSON.parse(await readFile(resolve(options.ids),'utf8'));
      if (!Array.isArray(ids) || !ids.length || ids.length>1000 || new Set(ids).size!==ids.length || ids.some(id=>typeof id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('ID file must contain 1..1000 unique navigation IDs.');
      // Marker survives RUM cleanup; its own 35-day expiry is cleared explicitly.
      await query(`INSERT OR IGNORE INTO rum_synthetic_navigations(environment,navigation_id,registered_at) VALUES ${ids.map(id=>`(${e},${quote(id)},${Date.now()})`).join(',')}`);
      console.log(`PASS preview synthetic registry: ids=${ids.length}.`);
    } else if (action==='cleanup') {
      const cutoff=(options.now===undefined?Date.now():timestamp(options.now))-35*86400000;
      // One DELETE selects immutable starts atomically; cascades handle concurrent
      // revisions. Late requests for expired navigation starts are rejected 410.
      const removed=await query(`DELETE FROM rum_navigations WHERE environment=${e} AND navigation_started_at<${cutoff} RETURNING navigation_id`);
      await query(`DELETE FROM rum_synthetic_navigations WHERE environment=${e} AND registered_at<${cutoff} AND NOT EXISTS(SELECT 1 FROM rum_navigations n WHERE n.environment=rum_synthetic_navigations.environment AND n.navigation_id=rum_synthetic_navigations.navigation_id)`);
      console.log(`PASS cloud cleanup: environment=${options.environment}; removed=${removed.length}; retention=35 days; cutoff=${new Date(cutoff).toISOString()}; exclusive.`);
    } else {
      const data=await exportConsistent(query,{environment:options.environment,from:options.from,to:options.to,pageSize,cohort});
      const out=resolve(options.out);await mkdir(dirname(out),{recursive:true,mode:0o700});
      const tmp=out+`.${randomUUID()}.tmp`;
      try { await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,out); }
      finally { await rm(tmp,{force:true}); }
      console.log(`PASS cloud export: environment=${options.environment}; cohort=${cohort}; revisions=${data.reports.length}; pages=${data.export.pages}; attempts=${data.export.attempts}; generation=${data.export.generation}; window=[from,to).`);
    }
  } finally {await connection.close();}
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {await cloudMain(process.argv.slice(2));} catch(error) {console.error(error.message);process.exitCode=1;}
}

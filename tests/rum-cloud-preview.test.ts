import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRemoteQuery, assertDatabaseIdentity, cloudMain, exportConsistent, quote } from '../scripts/rum-cloud.mjs';
import { evaluateMobileReports } from '../scripts/check-vitals-report.mjs';
const enabled=process.env.RUM_CLOUD_E2E==='1';
test('authorized preview: actual cloud D1 persistence, concurrent export, synthetic exclusion and production isolation',{skip:!enabled,timeout:600000},async()=>{
 const manifest=JSON.parse(await readFile(new URL('../config/rum.cloud.json',import.meta.url),'utf8'));
 const origin=process.env.RUM_PREVIEW_URL || '';
 assert.match(origin,/^https:\/\/[a-f0-9]{8}\.feliz-blog\.pages\.dev$/);
 const artifact=resolve(process.env.RUM_CLOUD_ARTIFACT_DIR || '.codex-artifacts/rum-cloud-preview-20261001/cloud');await mkdir(artifact,{recursive:true,mode:0o700});
 const options={account:manifest.accountId,database:manifest.environments.preview.databaseId,environment:'preview'};
 const prodOptions={...options,database:manifest.environments.production.databaseId,environment:'production'};
 const preview=await createRemoteQuery(options),production=await createRemoteQuery(prodOptions);
 const privateJSON=async(name:string,data:unknown)=>writeFile(resolve(artifact,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
 const counts=async(q:any)=>q('SELECT (SELECT count(*) FROM rum_navigations) AS navigations,(SELECT count(*) FROM rum_revisions) AS revisions,(SELECT count(*) FROM rum_conflicts) AS conflicts');
 const base=['--authorize-cloud',`--account=${options.account}`,`--database=${options.database}`,'--environment=preview'];
 const run=randomUUID().replaceAll('-','');const names=['ordered','zero','missing','start','before','end','identity','tie','soft','repeatA','repeatB','concurrent'];
 const ids=Object.fromEntries(names.map(x=>[x,`synthetic-${run}-${x}`]));
 const from=Date.now()-86400000,to=from+3600000;
 const iso=(ms:number)=>new Date(ms).toISOString();
 const fixture=(name:string,start=from+1000,path=`/rum-synthetic/${name}/`,revision=1)=>({schema:'yuimi-web-vitals/v2',navigationId:ids[name],documentId:`doc-${name}`,revision,path,measurementScope:'document',navigationStartedAt:iso(start),navigationStartTime:0,softNavigationSupported:false,deviceClass:'mobile',viewportWidth:390,network:'4g',saveData:false,sampledAt:iso(Date.now()),metrics:{} as Record<string,any>});
 const metric=(name:string,value:number,path:string)=>({value,unit:name==='CLS'?'score':'ms',target:name==='CLS'?0.1:name==='LCP'?2500:200,rating:'good',metricId:`metric-${name}`,navigationType:'navigate',navigationPath:path,navigationStartTime:0});
 const post=async(data:any,status=204)=>{
  const r=await fetch(origin+'/api/rum',{method:'POST',redirect:'manual',headers:{origin,'content-type':'text/plain;charset=UTF-8'},body:JSON.stringify(data)});
  assert.equal(r.status,status);assert.equal(await r.text(),'');
 };
 try {
  await assertDatabaseIdentity(preview.query,options);await assertDatabaseIdentity(production.query,prodOptions);
  const prodBefore=await counts(production.query);assert.deepEqual(prodBefore,[{navigations:0,revisions:0,conflicts:0}]);
  await privateJSON('synthetic-ids.json',Object.values(ids));
  await cloudMain(['register-synthetic',...base,`--ids=${resolve(artifact,'synthetic-ids.json')}`]);
  const first=fixture('ordered');first.metrics.LCP=metric('LCP',1000,first.path);await post(first);
  const high={...first,revision:3,metrics:{LCP:metric('LCP',5000,first.path)}};
  await post(high);await post({...first,revision:2,metrics:{LCP:metric('LCP',2000,first.path)}});
  await Promise.all([post(high),post({...high,sampledAt:iso(Date.now()+1000)})]);
  const zero=fixture('zero');zero.metrics.CLS=metric('CLS',0,zero.path);await post(zero);
  await post(fixture('missing'));await post(fixture('start',from));await post(fixture('before',from-1));await post(fixture('end',to));
  const identity=fixture('identity');await post(identity);await post({...identity,revision:2,path:'/rum-synthetic/changed/',navigationStartedAt:iso(from+2000)},409);
  const tie=fixture('tie');tie.metrics.LCP=metric('LCP',900,tie.path);await post(tie);await post({...tie,metrics:{LCP:metric('LCP',901,tie.path)}},409);
  const soft:any={...fixture('soft'),measurementScope:'soft-navigation',softNavigationSupported:true,browserNavigationId:4,navigationStartTime:100};
  soft.metrics.CLS={...metric('CLS',0,soft.path),navigationType:'soft-navigation',browserNavigationId:4,navigationStartTime:100};await post(soft);
  await post(fixture('repeatA',from+1000,'/rum-synthetic/same/'));await post(fixture('repeatB',from+2000,'/rum-synthetic/same/'));
  const concurrent=fixture('concurrent');await post(concurrent);
  const list=Object.values(ids).map(quote).join(',');
  const stored=await preview.query(`SELECT r.navigation_id,r.revision,r.payload_json,n.quarantined,n.navigation_started_at,n.identity_json FROM rum_revisions r JOIN rum_navigations n ON n.environment=r.environment AND n.navigation_id=r.navigation_id WHERE r.environment='preview' AND r.navigation_id IN (${list}) ORDER BY r.row_id`);
  assert.deepEqual(stored.filter((x:any)=>x.navigation_id===ids.ordered).map((x:any)=>x.revision).sort(),[1,2,3]);
  assert.equal(stored.filter((x:any)=>x.navigation_id===ids.zero).length,1);
  const preserved=stored.find((x:any)=>x.navigation_id===ids.identity)!;assert.equal(preserved.navigation_started_at,from+1000);assert.equal(JSON.parse(preserved.identity_json)[1],identity.path);
  const conflicts=await preview.query(`SELECT reason FROM rum_conflicts WHERE environment='preview' AND navigation_id IN (${list})`);assert.equal(conflicts.length,2);
  assert.equal(stored.filter((x:any)=>x.quarantined===1).length,2);
  // Write a real late revision after the first export page. The complete first
  // attempt must be discarded even when its high-water would miss this row.
  let changed=false;
  const racingQuery=async(sql:string)=>{
   const rows=await preview.query(sql);
   if(!changed&&sql.startsWith('SELECT r.row_id')){changed=true;await post({...concurrent,revision:3});}
   return rows;
  };
  const data=await exportConsistent(racingQuery,{environment:'preview',from:iso(from),to:iso(to),pageSize:2,cohort:'synthetic'});assert.equal(data.export.attempts,2);
  await privateJSON('concurrent-export.json',data);
  const out=resolve(artifact,'synthetic-export.json');
  await cloudMain(['export',...base,`--from=${iso(from)}`,`--to=${iso(to)}`,'--page-size=2','--cohort=synthetic',`--out=${out}`]);
  const exported=JSON.parse(await readFile(out,'utf8'));
  // This dedicated window is also safe on re-runs: restrict acceptance checks to
  // this run; the exporter still includes every registered synthetic revision.
  const ours=exported.reports.filter((r:any)=>Object.values(ids).includes(r.navigationId));
  assert.equal(ours.length,11);assert.equal(ours.filter((r:any)=>r.navigationId===ids.ordered).length,3);
  assert.ok(ours.every((r:any)=>![ids.identity,ids.tie,ids.before,ids.end].includes(r.navigationId)));
  const stats=evaluateMobileReports(ours,{windowStart:iso(from),windowEnd:iso(to)});assert.equal(stats.mobileVisits,8);
  assert.equal(stats.results.find((r:any)=>r.path===first.path&&r.name==='LCP')?.p75,5000);
  assert.equal(stats.results.find((r:any)=>r.path===zero.path&&r.name==='CLS')?.p75,0);
  assert.equal(stats.results.find((r:any)=>r.path===zero.path&&r.name==='INP')?.p75,null);
  assert.ok(stats.results.filter((r:any)=>r.path==='/rum-synthetic/missing/').every((r:any)=>r.count===0&&r.p75===null));
  assert.ok(stats.results.some((r:any)=>r.measurementScope==='soft-navigation'));await privateJSON('statistics.json',stats);
  const cli=spawnSync(process.execPath,['scripts/check-vitals-report.mjs',out,'--min-samples=30',`--from=${iso(from)}`,`--to=${iso(to)}`],{encoding:'utf8'});assert.equal(cli.status,2);await writeFile(resolve(artifact,'statistics-cli.txt'),cli.stdout+cli.stderr,{mode:0o600});
  const natural=resolve(artifact,'natural-export.json');await cloudMain(['export',...base,`--from=${iso(from)}`,`--to=${iso(to)}`,'--page-size=2',`--out=${natural}`]);assert.deepEqual(JSON.parse(await readFile(natural,'utf8')).reports,[]);
  const home=await fetch(origin+'/',{redirect:'manual'});assert.equal(home.status,200);const html=await home.text();assert.ok(html.includes('<html'));
  const staticPath=html.match(/(?:src|href)="(\/_astro\/[^"\s]+\.(?:js|css))"/)?.[1];assert.ok(staticPath);assert.equal((await fetch(origin+staticPath,{redirect:'manual'})).status,200);
  const routes=await readFile(new URL('../dist/_routes.json',import.meta.url),'utf8');assert.deepEqual(JSON.parse(routes),{version:1,include:['/api/rum'],exclude:[]});
  assert.equal((await fetch(origin+'/api/rum',{redirect:'manual'})).status,405);
  const prodAfter=await counts(production.query);assert.deepEqual(prodAfter,prodBefore);
  assert.deepEqual(await preview.query("SELECT count(*) AS count FROM rum_navigations WHERE environment<>'preview'"),[{count:0}]);
  await cloudMain(['cleanup',...base]);
  const revisionCount=await preview.query(`SELECT count(*) AS count FROM rum_revisions WHERE environment='preview' AND navigation_id IN (${list})`);
  const evidence={deploymentUrl:origin,environment:'preview',productionBefore:prodBefore,productionAfter:prodAfter,otherEnvironmentNavigations:0,registeredSyntheticIds:names.length,storedRevisions:revisionCount[0].count,conflicts:2,quarantined:2,exportedRevisions:ours.length,mobileVisits:stats.mobileVisits,concurrentExportAttempts:data.export.attempts,pages:exported.export.pages,statisticsExit:cli.status,zeroCLS:0,missingINP:null,windowStart:iso(from),windowEnd:iso(to),staticRouteManifest:JSON.parse(routes),staticRequests:{home:200,resource:200},naturalExportedRevisions:0};
  await privateJSON('CLOUD-READBACK.json',evidence);
  console.log('PASS CLOUD_PREVIEW: persisted revisions; idempotency; identity/content quarantine; zero/missing; start/end window; repeated path identity; concurrent export retried; natural export empty; production RUM rows=0.');
 } finally{await preview.close();await production.close();}
});

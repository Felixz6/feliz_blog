import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { localMain, queryLocal } from '../scripts/rum-local.mjs';
import { installWebVitals } from '../src/core/web-vitals.mjs';
import { evaluateMobileReports } from '../scripts/check-vitals-report.mjs';

const enabled = process.env.RUM_D1_E2E === '1';
const root = fileURLToPath(new URL('../',import.meta.url));
const fixture = (id: string, start: number, path='/', revision=1) => ({
  schema:'yuimi-web-vitals/v2',navigationId:id,documentId:'document-e2e',revision,path,measurementScope:'document',
  navigationStartedAt:new Date(start).toISOString(),navigationStartTime:0,softNavigationSupported:false,
  deviceClass:'mobile',viewportWidth:390,network:'4g',saveData:false,sampledAt:new Date().toISOString(),metrics:{} as Record<string,any>
});
const metric = (name:string,value:number,path='/') => ({value,unit:name==='CLS'?'score':'ms',target:name==='CLS'?0.1:name==='LCP'?2500:200,
  rating:'good',metricId:`v5-${name}`,navigationType:'navigate',navigationPath:path,navigationStartTime:0});

test('real local Pages + D1: write, durable readback, paginated export, p75 and retention', {skip:!enabled,timeout:420000}, async () => {
  const artifact=process.env.RUM_E2E_ARTIFACT_DIR || mkdtempSync(join(tmpdir(),'feliz-rum-d1-'));
  mkdirSync(artifact,{recursive:true}); const state=join(artifact,'state'); const out=join(artifact,'export.json');
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const address=socket.address();assert.ok(address&&typeof address!=='string');const port=address.port;
  await new Promise<void>(resolve=>socket.close(()=>resolve()));
  const origin=`http://127.0.0.1:${port}`;let child:ReturnType<typeof spawn>|undefined;let logs='';
  const start=async()=>{
    child=spawn(process.execPath,['scripts/rum-local.mjs','dev','--authorize-local',`--state=${state}`,`--port=${port}`],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
    child.stdout?.on('data',data=>{logs+=data;});child.stderr?.on('data',data=>{logs+=data;});
    for(let i=0;i<160;i++){
      if(child.exitCode!==null) throw new Error('Local Pages exited before startup: '+logs.slice(-4000));
      try { const response=await fetch(origin+'/api/rum');if(response.status===405)return; } catch {}
      await delay(250);
    }
    throw new Error('Local Pages startup timed out: '+logs.slice(-4000));
  };
  const stop=async()=>{
    if(!child)return; const current=child;child=undefined;
    if(current.exitCode!==null)return;
    const exited=new Promise<void>(resolve=>current.once('exit',()=>resolve()));current.kill('SIGTERM');await exited;
  };
  const post=async(row:unknown,expected=204,headers:Record<string,string>={})=>{
    const r=await fetch(origin+'/api/rum',{method:'POST',headers:{origin,'content-type':'text/plain;charset=UTF-8',...headers},body:typeof row==='string'?row:JSON.stringify(row)});
    assert.equal(r.status,expected);assert.equal(await r.text(),'');
  };
  const from=Date.now()-86400000,to=from+3600000;
  try {
    // An actual missing D1 table must not produce an HTTP success.
    await start();await post(fixture('before-init',from),503);await stop();
    await localMain(['init','--authorize-local',`--state=${state}`]);
    await start();
    const initial=fixture('ordered',from+1000);initial.metrics.LCP=metric('LCP',1000);
    await post(initial);
    const high={...initial,revision:3,sampledAt:new Date().toISOString(),metrics:{LCP:metric('LCP',5000)}};
    await post(high);await post({...initial,revision:2,metrics:{LCP:metric('LCP',2000)}});
    await post({...high,sampledAt:new Date(Date.now()+1000).toISOString()});
    await Promise.all([post(high),post({...high,sampledAt:new Date(Date.now()+2000).toISOString()})]);
    const zero=fixture('zero',from+2000,'/zero/');zero.metrics.CLS=metric('CLS',0,'/zero/');await post(zero);
    await post(fixture('missing',from+3000,'/missing/'));
    await post(fixture('start-boundary',from,'/start/'));
    await post(fixture('before-boundary',from-1,'/before/'));
    await post(fixture('end-boundary',to,'/end/'));
    const conflict=fixture('identity-conflict',from+4000);await post(conflict);
    await post({...conflict,revision:2,path:'/changed/'},409);
    await post({...conflict,revision:3},409);
    const tie=fixture('revision-conflict',from+5000);tie.metrics.LCP=metric('LCP',900);await post(tie);
    await post({...tie,metrics:{LCP:metric('LCP',901)}},409);
    await post({...tie,metrics:{LCP:metric('LCP',901)}},409);
    // Old conflicting lower revisions also quarantine, not just current maximum.
    const lower=fixture('lower-conflict',from+6000);lower.metrics.LCP=metric('LCP',800);await post(lower);
    await post({...lower,revision:3},204);await post({...lower,metrics:{LCP:metric('LCP',801)}},409);
    const soft:any={...fixture('soft',from+7000,'/soft/'),measurementScope:'soft-navigation',softNavigationSupported:true,browserNavigationId:4,navigationStartTime:100};
    soft.metrics.CLS={...metric('CLS',0,'/soft/'),navigationType:'soft-navigation',browserNavigationId:4,navigationStartTime:100};await post(soft);
    await post({...initial,documentId:undefined},400);await post(initial,403,{origin:'https://wrong.example'});
    await post('x'.repeat(16385),413);
    // The real bf3a4da collector also sends an empty revision and a late zero.
    const deliveries:Promise<void>[]=[]; const callbacks:Record<string,any>={}; const listeners:Record<string,any>={};
    const doc:any={visibilityState:'visible',addEventListener:(name:string,fn:any)=>{listeners[name]=fn;},removeEventListener:()=>{}};
    const win:any={location:{pathname:'/collector/',href:origin+'/collector/'},innerWidth:390,matchMedia:()=>({matches:true}),
      performance:{timeOrigin:to+1000,now:()=>0},navigator:{connection:{effectiveType:'4g'},sendBeacon:(url:string,body:string)=>{deliveries.push(post(JSON.parse(body)));return true;}},
      addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},CustomEvent:class {type:string;options:any;constructor(type:string,options:any){this.type=type;this.options=options;}}};
    const registrars:any=Object.fromEntries(['CLS','INP','LCP'].map(name=>['on'+name,(callback:any)=>{callbacks[name]=callback;}]));
    const dispose=installWebVitals({window:win,document:doc,endpoint:'/api/rum',webVitals:registrars});
    doc.visibilityState='hidden';listeners.visibilitychange();
    callbacks.CLS({name:'CLS',value:0,id:'v5-collector-cls',rating:'good',navigationType:'navigate',navigationURL:origin+'/collector/',navigationId:1,navigationStartTime:0,entries:[]});
    await Promise.all(deliveries);assert.equal(deliveries.length,2);dispose();
    const page=await fetch(origin+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('<html'));
    // Local administrative export rejects access while dev owns the lock.
    await assert.rejects(localMain(['export','--authorize-local',`--state=${state}`,`--out=${out}`,`--from=${new Date(from).toISOString()}`,`--to=${new Date(to).toISOString()}`]),/already active/);
    await stop();
    const rows=queryLocal(state,"SELECT navigation_id,revision,payload_json FROM rum_revisions WHERE environment='local' ORDER BY row_id");
    assert.deepEqual(rows.filter((r:any)=>r.navigation_id==='ordered').map((r:any)=>r.revision).sort(),[1,2,3]);
    assert.equal(rows.filter((r:any)=>r.navigation_id==='zero').length,1);
    const collected=rows.map((r:any)=>JSON.parse(r.payload_json)).filter((r:any)=>r.path==='/collector/');
    assert.equal(collected.length,2);assert.deepEqual(collected[0].metrics,{});assert.equal(collected[1].metrics.CLS.value,0);
    const navs=queryLocal(state,"SELECT navigation_id,quarantined,identity_json,navigation_started_at FROM rum_navigations WHERE environment='local'");
    assert.equal(navs.filter((n:any)=>n.quarantined===1).length,3);
    const conflictNav=navs.find((n:any)=>n.navigation_id==='identity-conflict');assert.ok(conflictNav);
    assert.equal(JSON.parse(conflictNav.identity_json)[1],'/');assert.equal(conflictNav.navigation_started_at,from+4000);
    const preservedTie=rows.find((r:any)=>r.navigation_id==='revision-conflict');assert.ok(preservedTie);
    assert.equal(JSON.parse(preservedTie.payload_json).metrics.LCP.value,900);
    const conflicts=queryLocal(state,"SELECT reason FROM rum_conflicts");assert.equal(conflicts.length,3);
    assert.equal(conflicts.filter((c:any)=>c.reason==='identity').length,1);
    await localMain(['export','--authorize-local',`--state=${state}`,`--out=${out}`,`--from=${new Date(from).toISOString()}`,`--to=${new Date(to).toISOString()}`,'--page-size=2']);
    const exported=JSON.parse(readFileSync(out,'utf8')).reports;
    assert.equal(exported.length,7);assert.equal(exported.filter((r:any)=>r.navigationId==='ordered').length,3);
    assert.ok(exported.every((r:any)=>!r.navigationId.includes('conflict')&&r.navigationId!=='end-boundary'&&r.navigationId!=='before-boundary'));
    assert.ok(exported.every((r:any)=>Date.parse(r.sampledAt)>to));
    const stats=evaluateMobileReports(exported,{windowStart:new Date(from).toISOString(),windowEnd:new Date(to).toISOString()});
    const lcp=stats.results.find((r:any)=>r.path==='/'&&r.name==='LCP');assert.ok(lcp);assert.equal(lcp.count,1);assert.equal(lcp.p75,5000);assert.equal(lcp.status,'INCONCLUSIVE');
    const cls=stats.results.find((r:any)=>r.path==='/zero/'&&r.name==='CLS');assert.ok(cls);assert.equal(cls.count,1);assert.equal(cls.p75,0);
    const inp=stats.results.find((r:any)=>r.path==='/zero/'&&r.name==='INP');assert.ok(inp);assert.equal(inp.count,0);assert.equal(inp.p75,null);
    assert.ok(stats.results.filter((r:any)=>r.path==='/missing/').every((r:any)=>r.count===0&&r.p75===null));
    assert.equal(stats.mobileVisits,5);assert.ok(stats.results.some((r:any)=>r.measurementScope==='soft-navigation'));
    writeFileSync(join(artifact,'statistics.json'),JSON.stringify(stats,null,2));
    // Durable restart uses the same D1 state, not an in-memory mock.
    await start();await post(high);await stop();
    assert.equal(queryLocal(state,"SELECT count(*) AS count FROM rum_revisions WHERE navigation_id='ordered'")[0].count,3);
    // Explicit retention cleanup, including cascading revisions/conflict records.
    const now=Date.now(),cutoff=now-35*86400000;
    const seed=(name:string,start:number,environment='local')=>queryLocal(state,`INSERT INTO rum_navigations(environment,navigation_id,identity_json,navigation_started_at,created_at) VALUES('${environment}','${name}','[]',${start},${now}); INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) VALUES('${environment}','${name}',1,'{}','{}',${now});`);
    seed('expired',cutoff-1);seed('retention-boundary',cutoff);seed('preview-expired',cutoff-1,'preview');
    queryLocal(state,`INSERT INTO rum_conflicts(environment,navigation_id,revision,reason,content_json,payload_json,received_at) VALUES('local','expired',1,'identity','{}','{}',${now})`);
    await localMain(['cleanup','--authorize-local',`--state=${state}`,`--now=${new Date(now).toISOString()}`]);
    assert.equal(queryLocal(state,"SELECT count(*) AS count FROM rum_navigations WHERE navigation_id='expired'")[0].count,0);
    assert.equal(queryLocal(state,"SELECT count(*) AS count FROM rum_revisions WHERE navigation_id='expired'")[0].count,0);
    assert.equal(queryLocal(state,"SELECT count(*) AS count FROM rum_conflicts WHERE navigation_id='expired'")[0].count,0);
    assert.equal(queryLocal(state,"SELECT count(*) AS count FROM rum_navigations WHERE navigation_id IN ('retention-boundary','preview-expired')")[0].count,2);
    const dbFiles=queryLocal(state,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'rum_%'");assert.equal(dbFiles.length,3);
    writeFileSync(join(artifact,'D1-READBACK.json'),JSON.stringify({revisions:rows.length,quarantined:3,conflicts:conflicts.length,exportedRevisions:exported.length,mobileVisits:stats.mobileVisits,zeroCLS:cls.p75,missingINP:inp.p75},null,2));
    console.log('PASS REAL_D1: revisions retained; duplicate idempotent; 3 quarantined; export=7 revisions/5 visits; CLS=0; missing INP=null; start inclusive/end exclusive; restart durable; cleanup cascades and isolates preview.');
  } finally {await stop();writeFileSync(join(artifact,'pages-dev.log'),logs);}
});

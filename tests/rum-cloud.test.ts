import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseCloudOptions, validateBinding, assertDatabaseIdentity, exportConsistent, quote } from '../scripts/rum-cloud.mjs';
const account='a'.repeat(32),production='00000000-0000-0000-0000-000000000002',preview='00000000-0000-0000-0000-000000000003';
const auth=['--authorize-cloud',`--account=${account}`,`--database=${preview}`,'--environment=preview'];
const manifest={accountId:account,projectName:'feliz-blog',environments:{production:{databaseId:production,databaseName:'prod'},preview:{databaseId:preview,databaseName:'prev'}}};
const start=Date.now()-86400000,from=new Date(start).toISOString(),to=new Date(start+3600000).toISOString();
const report=(id:string,revision=1)=>({schema:'yuimi-web-vitals/v2',navigationId:id,documentId:'doc',revision,path:'/',measurementScope:'document',navigationStartedAt:from,navigationStartTime:0,softNavigationSupported:false,deviceClass:'mobile',viewportWidth:390,network:'4g',saveData:false,sampledAt:new Date().toISOString(),metrics:{}});
function database() {
 const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
 for(const path of ['0001_rum.sql','0002_cloud_admin.sql'])db.exec(readFileSync(new URL('../migrations/rum/'+path,import.meta.url),'utf8'));
 const query=async(sql:string)=>db.prepare(sql).all();
 const seed=(id:string,synthetic=false)=>{
  db.exec(`INSERT INTO rum_navigations VALUES('preview',${quote(id)},'[]',${start},0,${start})`);
  db.exec(`INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) VALUES('preview',${quote(id)},1,'{}',${quote(JSON.stringify(report(id)))},${start})`);
  if(synthetic)db.exec(`INSERT INTO rum_synthetic_navigations VALUES('preview',${quote(id)},${start})`);
 };
 return {db,query,seed};
}
test('cloud authorization binds explicit account/database/environment and rejects local/remote ambiguity',()=>{
 const parsed=parseCloudOptions(['status',...auth]);assert.equal(validateBinding(manifest,parsed.options).databaseId,preview);
 for(const args of [[],['status'],['status',...auth,'--remote'],['status',...auth,'--state=x'],['status',...auth,'--authorize-cloud=true'],['cleanup',...auth,`--now=${new Date(Date.now()+100000).toISOString()}`]])assert.throws(()=>parseCloudOptions(args));
 assert.throws(()=>validateBinding(manifest,{...parsed.options,database:production}));
 assert.throws(()=>validateBinding({...manifest,environments:{production:manifest.environments.preview,preview:manifest.environments.preview}},parsed.options));
 assert.throws(()=>parseCloudOptions(['export',...auth,`--from=${from}`,`--to=${from}`,'--out=x']));
 assert.throws(()=>parseCloudOptions(['register-synthetic',...auth.filter(x=>!x.startsWith('--environment')),'--environment=production','--ids=x']));
});
test('additive migration is repeatable; database guard and stored identity prevent cross-environment writes',async()=>{
 const {db,query}=database();try{
 db.exec(readFileSync(new URL('../migrations/rum/0002_cloud_admin.sql',import.meta.url),'utf8'));
 db.exec(`INSERT INTO rum_admin_identity VALUES(1,${quote(account)},${quote(preview)},'preview')`);
 await assertDatabaseIdentity(query,{account,database:preview,environment:'preview'});
 await assert.rejects(assertDatabaseIdentity(query,{account,database:production,environment:'production'}));
 assert.throws(()=>db.exec(`INSERT INTO rum_navigations VALUES('production','wrong','[]',${start},0,${start})`),/mismatch/);
 }finally{db.close();}
});
test('cloud keyset export keeps all revisions, excludes synthetic by default and preserves zero/missing',async()=>{
 const {db,query,seed}=database();try{
 seed('natural');seed('synthetic',true);
 const zero={...report('natural',3),metrics:{CLS:{value:0,unit:'score',target:0.1,rating:'good',metricId:'cls',navigationType:'navigate',navigationPath:'/',navigationStartTime:0}}};
 db.exec(`INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) VALUES('preview','natural',3,'{}',${quote(JSON.stringify(zero))},${start})`);
 const data=await exportConsistent(query,{environment:'preview',from,to,pageSize:1});assert.equal(data.reports.length,2);assert.equal(data.export.pages,2);assert.deepEqual(data.reports[0].metrics,{});assert.equal((data.reports[1].metrics as any).CLS.value,0);
 const synthetic=await exportConsistent(query,{environment:'preview',from,to,pageSize:1,cohort:'synthetic'});assert.equal(synthetic.reports.length,1);assert.equal(synthetic.reports[0].navigationId,'synthetic');
 }finally{db.close();}
});
for(const mutation of ['revision','quarantine','delete','classification'])test(`concurrent ${mutation} between cloud pages discards attempt and retries`,async()=>{
 const {db,query,seed}=database();try{
 seed('first');seed('second');let changed=false;
 const racingQuery=async(sql:string)=>{
  const rows=await query(sql);
  if(!changed&&sql.startsWith('SELECT r.row_id')){
   changed=true;
   if(mutation==='revision')db.exec(`INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) VALUES('preview','second',3,'{}',${quote(JSON.stringify(report('second',3)))},${start})`);
   if(mutation==='quarantine')db.exec("UPDATE rum_navigations SET quarantined=1 WHERE navigation_id='first'");
   if(mutation==='delete')db.exec("DELETE FROM rum_navigations WHERE navigation_id='first'");
   if(mutation==='classification')db.exec(`INSERT INTO rum_synthetic_navigations VALUES('preview','first',${start})`);
  }
  return rows;
 };
 const data=await exportConsistent(racingQuery,{environment:'preview',from,to,pageSize:1});assert.equal(data.export.attempts,2);
 if(mutation==='revision')assert.deepEqual(data.reports.map((x:any)=>x.revision),[1,1,3]);
 else assert.deepEqual(data.reports.map((x:any)=>x.navigationId),['second']);
 }finally{db.close();}
});
test('continuous cloud writes fail closed after bounded retries, not a local stop-server lock',async()=>{
 const {db,query,seed}=database();try{
 seed('first');
 const racing=async(sql:string)=>{const rows=await query(sql);if(sql.startsWith('SELECT r.row_id'))db.exec("UPDATE rum_navigations SET created_at=created_at+1 WHERE navigation_id='first'");return rows;};
 await assert.rejects(exportConsistent(racing,{environment:'preview',from,to,pageSize:1}),/3 attempts/);
 }finally{db.close();}
});

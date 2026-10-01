import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { receiveRum, validateReport, canonical, MAX_BODY_BYTES, RETENTION_MS } from '../server/rum.ts';
import { parseOptions } from '../scripts/rum-local.mjs';

const fixture = (id = 'visit-a', started = new Date(Date.now() - 60000).toISOString(), revision = 1) => ({
  schema: 'yuimi-web-vitals/v2', navigationId: id, documentId: 'document-a', revision, path: '/', measurementScope: 'document',
  navigationStartedAt: started, navigationStartTime: 0, softNavigationSupported: false,
  deviceClass: 'mobile', viewportWidth: 390, network: '4g', saveData: false, sampledAt: new Date().toISOString(), metrics: {} as Record<string, any>
});
const request = (body: unknown, headers: Record<string,string> = {}, url = 'https://example.com/api/rum') => new Request(url, {
  method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'text/plain;charset=UTF-8', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body)
});
const mockDb = (quarantined = 0, fail = false) => {
  const calls: { sql: string; args: unknown[] }[] = [];
  return { calls, prepare(sql: string) { return { bind(...args: unknown[]) { const value = { sql, args }; calls.push(value); return value; } }; },
    async batch(statements: unknown[]) { assert.equal(statements.length,5); if (fail) throw new Error('private DB error'); return statements.map((_, index) => ({ success: true, results: index === 4 ? [{ quarantined }] : [] })); } };
};
test('RUM schema preserves empty metrics and callback zero', () => {
  const row = fixture(); assert.deepEqual(validateReport(row).report.metrics, {});
  row.metrics.CLS = { value: 0, unit: 'score', target: 0.1, rating: 'good', metricId: 'v5-cls', navigationType: 'navigate', navigationPath: '/', navigationStartTime: 0 };
  assert.equal((validateReport(row).report.metrics as any).CLS.value,0);
});
test('RUM strict fields reject unknown, missing, null, wrong type and invalid identities', () => {
  for (const transform of [
    (r: any) => { r.extra = 'no'; }, (r: any) => { delete r.documentId; }, (r: any) => { r.revision = '1'; },
    (r: any) => { r.metrics = null; }, (r: any) => { r.path = '/?private=value'; }, (r: any) => { r.navigationId = '../bad'; },
    (r: any) => { r.navigationStartedAt = '2026-02-30T00:00:00Z'; }, (r: any) => { r.saveData = 'false'; },
    (r: any) => { r.deviceClass = null; }, (r: any) => { r.viewportWidth = -1; }, (r: any) => { r.softNavigationSupported = 1; }
  ]) { const row = fixture(); transform(row); assert.throws(() => validateReport(row)); }
});
test('RUM metrics reject placeholders, unknown metric fields and wrong attribution', () => {
  const base = { value: 0, unit: 'score', target: 0.1, rating: 'good', metricId: 'v5-cls', navigationType: 'navigate', navigationPath: '/', navigationStartTime: 0 };
  for (const bad of [{...base,value:null},{...base,value:'0'},{...base,metricId:''},{...base,navigationPath:'/blog/'},{...base,navigationType:'soft-navigation'},{...base,secret:'x'},{...base,target:1}]) {
    const row = fixture(); row.metrics.CLS = bad; assert.throws(() => validateReport(row));
  }
});
test('RUM genuine soft navigation requires browser identity and matching metric identity', () => {
  const row: any = { ...fixture(), measurementScope: 'soft-navigation', softNavigationSupported: true, browserNavigationId: 7, navigationStartTime: 10 };
  assert.doesNotThrow(() => validateReport(row));
  row.metrics.INP = { value: 100,unit:'ms',target:200,rating:'good',metricId:'v5-inp',navigationType:'soft-navigation',navigationPath:'/',navigationStartTime:10,browserNavigationId:8 };
  assert.throws(() => validateReport(row)); row.metrics.INP.browserNavigationId=7; assert.doesNotThrow(() => validateReport(row));
  delete row.browserNavigationId; assert.throws(() => validateReport(row));
});
test('RUM canonical duplicate equality ignores arrival timestamp but includes metric contents', () => {
  const a = fixture(); const b = { ...a, sampledAt: new Date(Date.now()+1000).toISOString() };
  assert.equal(validateReport(a).content,validateReport(b).content);
  assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));
  const c = { ...a, network: '3g' }; assert.notEqual(validateReport(a).identity,validateReport(c).identity);
});
test('RUM document browser identity can be filled later without changing navigation identity', () => {
  const a=fixture(); assert.equal(validateReport(a).identity,validateReport({...a,browserNavigationId:3}).identity);
});
test('RUM accepts only the exact POST route and same-origin text/plain', async () => {
  assert.equal((await receiveRum(new Request('https://example.com/api/rum'),{})).status,405);
  assert.equal((await receiveRum(request(fixture(),{},'https://example.com/api/rum/'),{})).status,404);
  for (const headers of [{origin:'https://other.example'},{origin:'null'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]) assert.equal((await receiveRum(request(fixture(),headers as any),{})).status,403);
  const noOrigin=request(fixture());noOrigin.headers.delete('origin');assert.equal((await receiveRum(noOrigin,{})).status,403);
  assert.equal((await receiveRum(request(fixture(),{'content-type':'application/json'}),{})).status,415);
});
test('RUM bounds declared and actual streamed body bytes, JSON and UTF-8', async () => {
  assert.equal((await receiveRum(request('x'.repeat(MAX_BODY_BYTES+1)),{})).status,413);
  assert.equal((await receiveRum(request('{}',{'content-length':String(MAX_BODY_BYTES+1)}),{})).status,413);
  assert.equal((await receiveRum(request('{'),{})).status,400);
  const bad=new Request('https://example.com/api/rum',{method:'POST',headers:{origin:'https://example.com','content-type':'text/plain'},body:new Uint8Array([0xff])});
  assert.equal((await receiveRum(bad,{})).status,400);
});
test('RUM success follows atomic D1 batch completion; failure is not success', async () => {
  const db=mockDb(); const promise=receiveRum(request(fixture()),{RUM_DB:db as any,RUM_ENVIRONMENT:'local'});
  assert.equal((await promise).status,204); assert.equal(db.calls.length,5);
  assert.equal((await receiveRum(request(fixture()),{RUM_DB:mockDb(0,true) as any,RUM_ENVIRONMENT:'local'})).status,503);
  assert.equal((await receiveRum(request(fixture()),{RUM_DB:mockDb(1) as any,RUM_ENVIRONMENT:'local'})).status,409);
  assert.equal((await receiveRum(request(fixture()),{})).status,503);
});
test('RUM age cutoff is 35 days, exclusive; expired samples do not resurrect', async () => {
  const now=Date.now(); const db=mockDb();
  const boundary=fixture('boundary',new Date(now-RETENTION_MS).toISOString());
  assert.equal((await receiveRum(request(boundary),{RUM_DB:db as any,RUM_ENVIRONMENT:'local'},now)).status,204);
  assert.equal((await receiveRum(request({...boundary,navigationStartedAt:new Date(now-RETENTION_MS-1).toISOString()}),{RUM_DB:db as any,RUM_ENVIRONMENT:'local'},now)).status,410);
});
test('RUM local admin requires explicit local authorization and rejects remote options', () => {
  assert.throws(()=>parseOptions(['export','--out=x','--from=2026-09-01T00:00:00Z','--to=2026-10-01T00:00:00Z']));
  assert.throws(()=>parseOptions(['cleanup','--authorize-local','--remote']));
  assert.throws(()=>parseOptions(['export','--authorize-local','--page-size']));
  assert.throws(()=>parseOptions(['export','--authorize-local','--out=x','--from=2026-02-30T00:00:00Z','--to=2026-03-02T00:00:00Z']));
  assert.throws(()=>parseOptions(['cleanup','--authorize-local','--now=2099-01-01T00:00:00Z']));
  assert.throws(()=>parseOptions(['export','--authorize-local','--out=x','--from=2026-10-01T00:00:00Z','--to=2026-10-01T00:00:00Z']));
});
test('RUM routes whitelist only /api/rum, with no public export endpoint', () => {
  const routes=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url),'utf8'));
  assert.deepEqual(routes,{version:1,include:['/api/rum'],exclude:[]});
  const config=JSON.parse(readFileSync(new URL('../config/rum.local.json',import.meta.url),'utf8'));
  assert.equal(config.vars.RUM_ENVIRONMENT,'local'); assert.equal(config.d1_databases[0].database_id,'00000000-0000-0000-0000-000000000001');
});

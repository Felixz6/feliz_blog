/** Minimal Pages/D1 subset; no runtime framework or dependency. */
export interface D1Result { success: boolean; results?: Record<string, unknown>[] }
export interface D1Statement { bind(...values: unknown[]): D1Statement }
export interface RumDatabase { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result[]> }
export interface RumEnvironment { RUM_DB?: RumDatabase; RUM_ENVIRONMENT?: string }
export const MAX_BODY_BYTES = 16 * 1024;
export const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;
const targets = { LCP: 2500, INP: 200, CLS: 0.1 } as const;
const documentTypes = new Set(['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore']);
class InvalidReport extends Error { status: number; constructor(status: number) { super('Invalid RUM request'); this.status = status; } }
function check(condition: unknown, status = 400): asserts condition { if (!condition) throw new InvalidReport(status); }
function object(value: unknown): asserts value is Record<string, unknown> { check(value !== null && typeof value === 'object' && !Array.isArray(value)); }
function keys(value: Record<string, unknown>, allowed: string[]) { check(Object.keys(value).every(key => allowed.includes(key))); }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER; }
function id(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function path(value: unknown): value is string { return typeof value === 'string' && value.length <= 1024 && /^\/(?!\/)/.test(value) && !/[?#\x00-\x20\x7f]/.test(value); }
export function instant(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return NaN;
  const [year, month, day] = match.slice(1).map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) return NaN;
  return Date.parse(value);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return '{' + Object.keys(row).sort().map(key => JSON.stringify(key) + ':' + canonical(row[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export function validateReport(value: unknown) {
  object(value);
  keys(value, ['schema','navigationId','documentId','revision','path','measurementScope','navigationStartedAt','navigationStartTime','browserNavigationId','softNavigationSupported','deviceClass','viewportWidth','network','saveData','sampledAt','metrics']);
  check(value.schema === 'yuimi-web-vitals/v2' && id(value.navigationId) && id(value.documentId));
  check(Number.isSafeInteger(value.revision) && number(value.revision));
  check(path(value.path) && ['document','soft-navigation'].includes(String(value.measurementScope)));
  check(number(value.navigationStartTime) && Number.isFinite(instant(value.navigationStartedAt)) && Number.isFinite(instant(value.sampledAt)));
  check(instant(value.sampledAt) >= instant(value.navigationStartedAt));
  check(typeof value.softNavigationSupported === 'boolean' && typeof value.saveData === 'boolean');
  check(['mobile','desktop'].includes(String(value.deviceClass)) && Number.isSafeInteger(value.viewportWidth) && number(value.viewportWidth) && value.viewportWidth <= 32768);
  check(['unknown','slow-2g','2g','3g','4g'].includes(String(value.network)));
  if ('browserNavigationId' in value) check(Number.isSafeInteger(value.browserNavigationId) && number(value.browserNavigationId));
  if (value.measurementScope === 'soft-navigation') check(value.softNavigationSupported === true && 'browserNavigationId' in value);
  object(value.metrics); keys(value.metrics, ['LCP','INP','CLS']);
  for (const [name, metric] of Object.entries(value.metrics)) {
    object(metric); keys(metric, ['value','unit','rating','target','metricId','navigationType','navigationPath','reportedNavigationPath','browserNavigationId','navigationStartTime']);
    check(number(metric.value) && id(metric.metricId) && metric.unit === (name === 'CLS' ? 'score' : 'ms'));
    check(metric.target === targets[name as keyof typeof targets] && ['good','needs-improvement','poor'].includes(String(metric.rating)));
    check(metric.navigationPath === value.path && metric.navigationStartTime === value.navigationStartTime);
    check(value.measurementScope === 'document' ? documentTypes.has(String(metric.navigationType)) : metric.navigationType === 'soft-navigation');
    if ('reportedNavigationPath' in metric) check(path(metric.reportedNavigationPath));
    if ('browserNavigationId' in metric) check(Number.isSafeInteger(metric.browserNavigationId) && number(metric.browserNavigationId));
    if (value.measurementScope === 'soft-navigation') check(metric.browserNavigationId === value.browserNavigationId);
  }
  // Store normalized timestamps; retain absent metrics and optional fields, never synthesize values.
  const report: Record<string, unknown> = { ...value, navigationStartedAt: new Date(instant(value.navigationStartedAt)).toISOString(), sampledAt: new Date(instant(value.sampledAt)).toISOString() };
  const identity = canonical([report.documentId, report.path, report.measurementScope, report.navigationStartedAt, report.navigationStartTime,
    report.measurementScope === 'soft-navigation' ? report.browserNavigationId : null, report.deviceClass, report.viewportWidth, report.network, report.saveData, report.softNavigationSupported]);
  const { sampledAt: _sampledAt, ...content } = report;
  return { report, identity, content: canonical(content), payload: canonical(report) };
}
async function readBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared !== null) check(/^\d+$/.test(declared) && Number(declared) <= MAX_BODY_BYTES, 413);
  check(request.body); const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new InvalidReport(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InvalidReport(400); }
}
const response = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) } });
export async function receiveRum(request: Request, env: RumEnvironment, now = Date.now()): Promise<Response> {
  if (new URL(request.url).pathname !== '/api/rum') return response(404);
  if (request.method !== 'POST') return response(405);
  if (request.headers.get('origin') !== new URL(request.url).origin || !['same-origin','none',null].includes(request.headers.get('sec-fetch-site'))) return response(403);
  if (!/^text\/plain(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('content-type') || '')) return response(415);
  try {
    const data = validateReport(await readBody(request));
    const { report, identity, content, payload } = data;
    const startedAt = instant(report.navigationStartedAt);
    if (startedAt < now - RETENTION_MS) return response(410);
    check(startedAt <= now + 5 * 60 * 1000);
    const db = env.RUM_DB; const scope = env.RUM_ENVIRONMENT;
    if (!db || !['local','preview','production'].includes(scope || '')) return response(503);
    const nav = report.navigationId; const revision = report.revision;
    // D1 batch is one atomic transaction. SQL predicates perform conflict checks
    // inside it, so concurrent requests cannot race a JavaScript read/then/write.
    const mismatch = `(n.identity_json <> ? OR EXISTS (SELECT 1 FROM rum_revisions r WHERE r.environment=n.environment AND r.navigation_id=n.navigation_id AND r.revision=? AND r.content_json<>?))`;
    const result = await db.batch([
      db.prepare(`INSERT INTO rum_navigations(environment,navigation_id,identity_json,navigation_started_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(scope,nav,identity,startedAt,now),
      db.prepare(`INSERT INTO rum_conflicts(environment,navigation_id,revision,reason,content_json,payload_json,received_at) SELECT ?,?,?,CASE WHEN n.identity_json<>? THEN 'identity' ELSE 'revision' END,?,?,? FROM rum_navigations n WHERE n.environment=? AND n.navigation_id=? AND ${mismatch} ON CONFLICT DO NOTHING`).bind(scope,nav,revision,identity,content,payload,now,scope,nav,identity,revision,content),
      db.prepare(`UPDATE rum_navigations AS n SET quarantined=1 WHERE n.environment=? AND n.navigation_id=? AND ${mismatch}`).bind(scope,nav,identity,revision,content),
      db.prepare(`INSERT INTO rum_revisions(environment,navigation_id,revision,content_json,payload_json,received_at) SELECT ?,?,?,?,?,? FROM rum_navigations n WHERE n.environment=? AND n.navigation_id=? AND n.identity_json=? ON CONFLICT DO NOTHING`).bind(scope,nav,revision,content,payload,now,scope,nav,identity),
      db.prepare(`SELECT quarantined FROM rum_navigations WHERE environment=? AND navigation_id=?`).bind(scope,nav)
    ]);
    if (result.length !== 5 || result.some(row => !row.success) || result[4]?.results?.length !== 1) return response(503);
    return response(result[4].results[0]?.quarantined === 1 ? 409 : 204);
  } catch (error) { return response(error instanceof InvalidReport ? error.status : 503); }
}

// shortcut: cap request bodies at 16 MiB; raise if combined attachment payloads need more.
const MAX_BODY_BYTES = 16 * 1024 * 1024;
class InvalidRequest extends Error { readonly status: number; constructor(status: number) { super(); this.status = status; } }
const response = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), {
  status,
  headers: { 'Cache-Control': 'no-store', ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...(status === 405 ? { Allow: 'POST' } : {}) }
});

async function readBody(request: Request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new InvalidRequest(413);
  if (!request.body) throw new InvalidRequest(400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new InvalidRequest(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const payload: unknown = JSON.parse(text);
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    return text;
  } catch { throw new InvalidRequest(400); }
}

export async function sendResend(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/send') return response(404);
  if (request.method !== 'POST') return response(405);
  if (request.headers.get('origin') !== url.origin || !['same-origin', 'none', null].includes(request.headers.get('sec-fetch-site'))) return response(403);
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return response(415);
  const key = request.headers.get('x-api-key') || '';
  if (!key || key.length > 512 || /[\u0000-\u001f\u007f]/.test(key)) return response(401, { message: 'A valid API Key is required' });
  try {
    const body = await readBody(request);
    const upstream = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, redirect: 'error'
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'Cache-Control': 'no-store', 'Content-Type': upstream.headers.get('content-type') || 'application/json' } });
  } catch (error) {
    return response(error instanceof InvalidRequest ? error.status : 502, error instanceof InvalidRequest ? undefined : { message: 'Resend API unavailable' });
  }
}

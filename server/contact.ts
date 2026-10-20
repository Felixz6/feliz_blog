export interface ContactEnvironment {
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
}

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }
});
class InvalidRequest extends Error { readonly status: number; constructor(status: number) { super(); this.status = status; } }

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) throw new InvalidRequest(413);
  if (!request.body) throw new InvalidRequest(400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new InvalidRequest(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new InvalidRequest(400); }
}

function isEmail(value: string) { return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value); }
function decodedBase64Bytes(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return -1;
  return value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

export async function sendContactMessage(request: Request, env: ContactEnvironment, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/message') return response(404, { message: 'Not found' });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { 'Cache-Control': 'no-store', Allow: 'POST' } });
  if (request.headers.get('origin') !== url.origin || !['same-origin', 'none', null].includes(request.headers.get('sec-fetch-site'))) return response(403, { message: 'Forbidden' });
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return response(415, { message: 'JSON required' });
  try {
    const payload = await readPayload(request);
    if (typeof payload.website === 'string' && payload.website.trim()) return response(200, { ok: true });
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body : '';
    const mode = payload.mode;
    if (!subject || subject.length > 120 || /[\u0000-\u001f\u007f]/.test(subject) || !body.trim() || body.length > 10000 || !['html', 'text'].includes(String(mode))) return response(400, { message: '请检查主题和正文内容' });
    const rawAttachments = payload.attachments === undefined ? [] : payload.attachments;
    if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS) return response(400, { message: '附件格式无效' });
    const attachments: { filename: string; content: string }[] = []; let totalAttachmentBytes = 0;
    for (const item of rawAttachments) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return response(400, { message: '附件格式无效' });
      const filename = typeof item.filename === 'string' ? item.filename : '';
      const content = typeof item.content === 'string' ? item.content : '';
      const bytes = decodedBase64Bytes(content);
      if (!filename || filename.length > 128 || /[\u0000-\u001f\u007f]/.test(filename) || bytes < 0) return response(400, { message: '附件格式无效' });
      totalAttachmentBytes += bytes;
      if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) return response(413, { message: '附件总大小不能超过 3 MB' });
      attachments.push({ filename: filename.replace(/[\\/]/g, '_'), content });
    }
    const apiKey = env.RESEND_API_KEY || '';
    const to = env.CONTACT_TO_EMAIL || '';
    const from = env.CONTACT_FROM_EMAIL || '';
    if (!apiKey || apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey) || !isEmail(to) || !isEmail(from)) return response(503, { message: '留言服务尚未配置' });
    const email = { from, to: [to], subject, [mode === 'html' ? 'html' : 'text']: body, ...(attachments.length ? { attachments } : {}) };
    // shortcut: origin checks and a honeypot are the current spam controls; add an edge rate limit if abuse appears.
    const upstream = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(email), redirect: 'error'
    });
    return upstream.ok ? response(200, { ok: true }) : response(502, { message: '邮件服务暂不可用，请稍后重试' });
  } catch (error) {
    return response(error instanceof InvalidRequest ? error.status : 502, { message: error instanceof InvalidRequest ? '请求格式无效' : '邮件服务暂不可用，请稍后重试' });
  }
}

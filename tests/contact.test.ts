import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendContactMessage } from '../server/contact.ts';

const url = 'https://example.com/api/message';
const env = { RESEND_API_KEY: 're_test_server_key', CONTACT_TO_EMAIL: 'owner@example.com', CONTACT_FROM_EMAIL: 'contact@example.com' };
const payload = { subject: '来信', body: '你好，博客！', mode: 'text' };
const request = (value: unknown = payload, headers: Record<string, string> = {}) => new Request(url, {
  method: 'POST', headers: { origin: 'https://example.com', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers }, body: JSON.stringify(value)
});

test('contact endpoint checks route, method, origin, JSON, and configuration', async () => {
  assert.equal((await sendContactMessage(new Request(url), env)).status, 405);
  assert.equal((await sendContactMessage(new Request('https://example.com/api/message/'), env)).status, 404);
  assert.equal((await sendContactMessage(request(payload, { origin: 'https://elsewhere.example' }), env)).status, 403);
  assert.equal((await sendContactMessage(request(payload, { 'content-type': 'text/plain' }), env)).status, 415);
  assert.equal((await sendContactMessage(request(payload), {})).status, 503);
  assert.equal((await sendContactMessage(request('not an object'), env)).status, 400);
});

test('contact endpoint sends only the fixed recipient and sender with the server key', async () => {
  let called = false;
  const response = await sendContactMessage(request({ ...payload, from: 'attacker@example.com', to: ['attacker@example.com'], apiKey: 'browser-secret' }), env, async (input, init) => {
    called = true;
    assert.equal(input, 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'manual');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer re_test_server_key');
    assert.equal(new Headers(init?.headers).get('x-api-key'), null);
    assert.deepEqual(JSON.parse(String(init?.body)), { from: 'contact@example.com', to: ['owner@example.com'], subject: '来信', text: '你好，博客！' });
    return new Response('{"id":"email_123"}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(called, true);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('contact endpoint surfaces only the Resend status and error type when rejected', async () => {
  const response = await sendContactMessage(request(), env, async () => new Response(JSON.stringify({ name: 'restricted_api_key', message: 'private provider detail' }), { status: 403 }));
  assert.equal(response.status, 502);
  const result = await response.json() as { message: string };
  assert.match(result.message, /HTTP 403（restricted_api_key）/);
  assert.doesNotMatch(result.message, /private provider detail|owner@example.com|contact@example.com/);
});

test('contact endpoint distinguishes a Resend network failure', async () => {
  const response = await sendContactMessage(request(), env, async () => { throw new TypeError('network unavailable'); });
  assert.equal(response.status, 502);
  assert.match((await response.json() as { message: string }).message, /连接 Resend 失败/);
});

test('contact endpoint rejects upstream redirects without following them', async () => {
  let calls = 0;
  let redirect: RequestRedirect | undefined;
  const response = await sendContactMessage(request(), env, async (_input, init) => {
    calls++;
    redirect = init?.redirect;
    return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/' } });
  });
  assert.equal(calls, 1);
  assert.equal(redirect, 'manual');
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  assert.doesNotMatch(await response.text(), /unexpected\.example|re_test_server_key/);
});

test('contact endpoint accepts bounded attachments and silently drops the honeypot', async () => {
  let calls = 0;
  const attachmentResponse = await sendContactMessage(request({ ...payload, attachments: [{ filename: '../note.txt', content: 'aGVsbG8=' }] }), env, async (_input, init) => {
    calls++;
    const sent = JSON.parse(String(init?.body));
    assert.deepEqual(sent.attachments, [{ filename: '.._note.txt', content: 'aGVsbG8=' }]);
    return new Response(null, { status: 200 });
  });
  assert.equal(attachmentResponse.status, 200);
  const trapResponse = await sendContactMessage(request({ ...payload, website: 'bot-filled' }), env, async () => { calls++; return new Response(null, { status: 200 }); });
  assert.equal(trapResponse.status, 200);
  assert.equal(calls, 1);
  assert.equal((await sendContactMessage(request({ ...payload, attachments: [{ filename: 'bad.txt', content: 'not-base64' }] }), env)).status, 400);
  assert.equal((await sendContactMessage(request({ ...payload, body: ' ' }), env)).status, 400);
  assert.equal((await sendContactMessage(request({ ...payload, body: 'x'.repeat(10001) }), env)).status, 400);
  assert.equal((await sendContactMessage(request({ ...payload, attachments: [{ filename: 'large.bin', content: 'A'.repeat(4_194_308) }] }), env)).status, 413);
});

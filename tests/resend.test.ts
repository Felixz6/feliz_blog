import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendResend } from '../server/resend.ts';

const url = 'https://example.com/api/send';
const makeRequest = (headers: Record<string, string> = {}, body = '{"from":"me@example.com","to":["you@example.com"]}') => new Request(url, {
  method: 'POST',
  headers: { origin: 'https://example.com', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-api-key': 're_test_key', ...headers },
  body
});

test('mail endpoint enforces route, method, same origin, JSON, and an API key', async () => {
  assert.equal((await sendResend(new Request(url))).status, 405);
  assert.equal((await sendResend(new Request('https://example.com/api/send/'))).status, 404);
  assert.equal((await sendResend(makeRequest({ origin: 'https://other.example' }))).status, 403);
  assert.equal((await sendResend(makeRequest({ 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await sendResend(makeRequest({ 'x-api-key': '' }))).status, 401);
  assert.equal((await sendResend(makeRequest({}, 'not json'))).status, 400);
});

test('mail endpoint forwards only the visitor key and payload to Resend', async () => {
  const payload = '{"from":"me@example.com","to":["you@example.com"]}'; let called = false;
  const response = await sendResend(makeRequest({}, payload), async (input, init) => {
    called = true; assert.equal(input, 'https://api.resend.com/emails'); assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer re_test_key');
    assert.equal(new Headers(init?.headers).get('x-api-key'), null); assert.equal(init?.body, payload); assert.equal(init?.redirect, 'manual');
    return new Response('{"id":"email_123"}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(called, true); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '{"id":"email_123"}');
});

test('mail endpoint bounds streaming body size and does not expose upstream failures', async () => {
  const tooLarge = makeRequest({ 'content-length': String(16 * 1024 * 1024 + 1) }, 'x');
  assert.equal((await sendResend(tooLarge)).status, 413);
  const untrustedLength = makeRequest({}, 'x'.repeat(16 * 1024 * 1024 + 1));
  assert.equal((await sendResend(untrustedLength)).status, 413);
  const failure = await sendResend(makeRequest(), async () => { throw new Error('re_test_key must not leak'); });
  assert.equal(failure.status, 502); assert.equal(await failure.text(), '{"message":"Resend API unavailable"}');
});

test('mail endpoint rejects upstream redirects without forwarding their location', async () => {
  let calls = 0;
  let redirect: RequestRedirect | undefined;
  const response = await sendResend(makeRequest(), async (_input, init) => {
    calls++;
    redirect = init?.redirect;
    return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/' } });
  });
  assert.equal(calls, 1);
  assert.equal(redirect, 'manual');
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), '{"message":"Resend API unavailable"}');
});

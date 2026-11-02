import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { allowedRoute, createGateway } from './gateway.mjs';

const origin = 'https://hub.example';
const token = 'tc9_shared_test_hub_account_token_with_32_characters';
let gateway;
let base;
let cookie;
let csrf;
const seen = [];
let upstreamStatus = 200;

before(async () => {
  gateway = createGateway({
    env: {
      TC9_UPSTREAM_URL: 'https://tc9.example',
      TC9_PUBLIC_ORIGIN: origin,
      TC9_COOKIE_PATH: '/test-hub/tc9-api/',
      TC9_API_TOKEN: token,
    },
    fetch: async (url, options) => {
      seen.push({ url, ...options });
      if (upstreamStatus !== 200) {
        return Response.json({ error: 'scope or authentication failure' }, { status: upstreamStatus, headers: { 'Retry-After': '19' } });
      }
      if (url.endsWith('/download')) {
        return new Response('archive-chunk', {
          status: 206,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename=core.zip',
            'Content-Range': 'bytes 0-12/100',
            'Content-Length': '13',
          },
        });
      }
      return Response.json(url.endsWith('/status') ? { available: true } : { id: 'build-1', status: 'queued' }, {
        status: options.method === 'POST' ? 202 : 200,
        headers: { 'Retry-After': '5' },
      });
    },
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  base = `http://127.0.0.1:${gateway.address().port}`;
});
after(async () => {
  gateway.close();
  gateway.closeAllConnections();
  await once(gateway, 'close');
});
function call(path, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

test('public configuration discloses only the shared account availability, never its credential', async () => {
  const config = await call('/config');
  assert.deepEqual(await config.json(), { upstream: 'https://tc9.example', sharedAccount: true });
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal((await call('/v1/status')).status, 401);
});
test('any visitor connects automatically, with no login or personal token', async () => {
  const response = await call('/connection');
  assert.equal(response.status, 200);
  const data = await response.json();
  csrf = data.csrf;
  cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal(data.connected, true);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  assert.match(response.headers.get('set-cookie'), /Path=\/test-hub\/tc9-api\//);
  assert.ok(!JSON.stringify(data).includes(token));
  assert.ok(!cookie.includes(token));
  assert.equal(seen.length, 0);
  assert.equal((await (await call('/connection')).json()).csrf, csrf);
});
test('proxy confines paths, methods and queries to the developer API', async () => {
  for (const path of [
    '/internal/workers',
    '/v1/status?token=secret',
    '/v1/realms/abc/download?url=https://evil.example',
    '/v1/account/tokens',
    '/v1/builds/abc/start',
  ]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal((await call('/v1/status', { method: 'DELETE' })).status, 404);
  const response = await call('/v1/status', { headers: { Authorization: 'Bearer attacker' } });
  assert.equal(response.status, 200);
  assert.equal(seen.at(-1).headers.Authorization, `Bearer ${token}`);
  assert.equal(seen.at(-1).url, 'https://tc9.example/api/v1/status');
  assert.equal(seen.at(-1).redirect, 'error');
});
test('mutations require both same origin and CSRF, and preserve idempotency', async () => {
  const count = seen.length;
  assert.equal((await call('/v1/builds', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: '{}' })).status, 403);
  assert.equal((await call('/v1/builds', { method: 'POST', headers: { 'X-CSRF-Token': 'wrong' }, body: '{}' })).status, 403);
  assert.equal(seen.length, count);
  const input = { repository: 'azerothcore/azerothcore-wotlk', pr_number: 42, modules: [], characters: [] };
  const response = await call('/v1/builds', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'stable-intent-42' },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(seen.at(-1).headers['Idempotency-Key'], 'stable-intent-42');
  assert.equal(seen.at(-1).headers['X-TC9-Reuse-Active'], 'true');
  assert.deepEqual(JSON.parse(seen.at(-1).body), input);
  assert.equal((await call('/v1/builds', { method: 'POST', body: JSON.stringify({ input: 'x'.repeat(65536) }) })).status, 400);
});
test('archive download streams authenticated range responses with no credential in the URL', async () => {
  const response = await call('/v1/builds/build-1/download', { headers: { Range: 'bytes=0-12' } });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'archive-chunk');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename=core.zip');
  assert.equal(response.headers.get('content-range'), 'bytes 0-12/100');
  assert.equal(seen.at(-1).headers.Range, 'bytes=0-12');
  assert.ok(!seen.at(-1).url.includes(token));
});
test('upstream authentication, scope, rate and maintenance errors preserve their status and retry guidance', async () => {
  for (const status of [401, 403, 429, 503]) {
    upstreamStatus = status;
    const response = await call('/v1/status');
    assert.equal(response.status, status);
    assert.equal(response.headers.get('retry-after'), '19');
  }
  upstreamStatus = 200;
});
test('all browsers use the same operator token and see the same account resources', async () => {
  const response = await call('/connection', { headers: { Cookie: '' } });
  const otherCookie = response.headers.get('set-cookie').split(';')[0];
  await call('/v1/builds', { headers: { Cookie: otherCookie, Authorization: 'Bearer personal-token' } });
  assert.equal(seen.at(-1).headers.Authorization, `Bearer ${token}`);
  await call('/v1/builds');
  assert.equal(seen.at(-1).headers.Authorization, `Bearer ${token}`);
  assert.equal((await call('/connection', { method: 'POST', body: JSON.stringify({ token: 'personal-token' }) })).status, 404);
});
test('tampered cookies cannot authorize API calls', async () => {
  const replacement = cookie.endsWith('a') ? 'b' : 'a';
  assert.equal((await call('/v1/status', { headers: { Cookie: cookie.slice(0, -1) + replacement } })).status, 401);
  assert.equal((await call('/v1/status', { headers: { Cookie: '__Secure-tc9-hub=invalid' } })).status, 401);
});
test('allowlist covers lifecycle routes and rejects arbitrary operations', () => {
  for (const [method, path] of [
    ['POST', '/v1/realms/realm-1/start'],
    ['POST', '/v1/realms/realm-1/stop'],
    ['POST', '/v1/realms/realm-1/recompile'],
    ['GET', '/v1/realms/realm-1/recompile'],
    ['POST', '/v1/builds/id/artifact'],
    ['DELETE', '/v1/realms/id'],
  ]) {
    assert.equal(allowedRoute(method, new URL(path, base)), true);
  }
  assert.equal(allowedRoute('POST', new URL('/v1/builds/id/recompile', base)), false);
  assert.throws(() => createGateway({ env: { TC9_UPSTREAM_URL: 'http://10.0.0.1' } }), /HTTPS/);
  assert.throws(() => createGateway({ env: { TC9_UPSTREAM_URL: 'https://example.com/private' } }), /origin/);
});
test('missing shared token disables API operations with an actionable configuration error', async () => {
  const empty = createGateway({ env: { TC9_PUBLIC_ORIGIN: origin } });
  empty.listen(0, '127.0.0.1');
  await once(empty, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${empty.address().port}/connection`);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
  } finally {
    empty.close();
    empty.closeAllConnections();
  }
});

test('game accounts use separate private visitor keys while API authentication remains shared', async () => {
  const first = await call('/connection', { headers: { Cookie: '' } });
  const firstCookies = first.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const firstCSRF = (await first.json()).csrf;
  const second = await call('/connection', { headers: { Cookie: '' } });
  const secondCookies = second.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const secondCSRF = (await second.json()).csrf;
  assert.match(firstCookies, /__Secure-tc9-player=/);
  assert.equal(
    (await call('/v1/realms/realm-1/account', { headers: { Cookie: firstCookies, 'X-TC9-Account-Key': 'attacker-key' } })).status,
    200,
  );
  const keyA = seen.at(-1).headers['X-TC9-Account-Key'];
  assert.match(keyA, /^[a-f0-9]{64}$/);
  await call('/v1/realms/realm-1/account', { method: 'POST', body: '{}', headers: { Cookie: firstCookies, 'X-CSRF-Token': firstCSRF } });
  assert.equal(seen.at(-1).headers['X-TC9-Account-Key'], keyA);
  await call('/v1/realms/realm-1/account', { method: 'POST', body: '{}', headers: { Cookie: secondCookies, 'X-CSRF-Token': secondCSRF } });
  assert.notEqual(seen.at(-1).headers['X-TC9-Account-Key'], keyA);
  assert.equal(seen.at(-1).headers.Authorization, `Bearer ${token}`);
  await call('/v1/realms/realm-2/account', { headers: { Cookie: firstCookies } });
  assert.notEqual(seen.at(-1).headers['X-TC9-Account-Key'], keyA);
  await call('/v1/realms/realm-1/account', { headers: { Cookie: firstCookies } });
  assert.equal(seen.at(-1).headers['X-TC9-Account-Key'], keyA);
  assert.equal((await call('/v1/realms/realm-1/account', { headers: { Cookie: cookie } })).status, 401);
  assert.equal(allowedRoute('GET', new URL('/v1/builds/build-1/account', base)), false);
});

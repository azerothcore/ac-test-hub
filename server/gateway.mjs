import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const TTL = 8 * 60 * 60 * 1000;
const ID = '[A-Za-z0-9_-]{1,128}';
const route = new RegExp(
  `^/v1/(?:status|repositories|modules|pull-requests|builds|realms|(?:builds|realms)/${ID}(?:/(?:artifact|download|start|stop|recompile))?)$`,
);

export function allowedRoute(method, url) {
  if (!route.test(url.pathname)) {
    return false;
  }
  const [resource, id, action] = url.pathname.split('/').slice(2);
  const queries = resource === 'builds' && !id ? ['limit', 'offset'] : resource === 'pull-requests' ? ['repository'] : [];
  if ([...url.searchParams.keys()].some((key) => !queries.includes(key))) {
    return false;
  }
  if (method === 'GET') {
    return !action || (['artifact', 'download', 'recompile'].includes(action) && (action !== 'recompile' || resource === 'realms'));
  }
  if (method === 'DELETE') {
    return !!id && !action && ['builds', 'realms'].includes(resource);
  }
  if (method !== 'POST') {
    return false;
  }
  return (
    (resource === 'builds' && !id) ||
    (!!id && (action === 'artifact' || (resource === 'realms' && ['start', 'stop', 'recompile'].includes(action))))
  );
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new Error('Expected application/json');
  }
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 65536) {
      throw new Error('Request exceeds 64 KiB');
    }
  }
  const value = data ? JSON.parse(data) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object');
  }
  return value;
}

/** All visitors share the operator-configured account. Cookies protect CSRF, not user identity. */
export function createGateway(options = {}) {
  const env = options.env ?? process.env;
  const upstream = new URL(env.TC9_UPSTREAM_URL ?? 'https://test.expanded.space');
  const publicOrigin = new URL(env.TC9_PUBLIC_ORIGIN ?? 'https://expanded.space').origin;
  const secure = publicOrigin.startsWith('https:');
  if (upstream.protocol !== 'https:' && !(options.allowInsecure && upstream.hostname === '127.0.0.1')) {
    throw new Error('HTTPS upstream required');
  }
  if (upstream.pathname !== '/' || upstream.search || upstream.hash || upstream.username || upstream.password) {
    throw new Error('Upstream must be an origin');
  }
  const cookiePath = env.TC9_COOKIE_PATH ?? '/test-hub/tc9-api/';
  if (!/^\/[A-Za-z0-9/_-]*\/$/.test(cookiePath)) {
    throw new Error('Invalid cookie path');
  }
  const cookieName = secure ? '__Secure-tc9-hub' : 'tc9-hub-dev';
  const token = env.TC9_API_TOKEN ?? '';
  const configured = /^tc9_[A-Za-z0-9_]{20,256}$/.test(token);
  const signingKey = randomBytes(32);
  const fetcher = options.fetch ?? fetch;
  function signature(value) {
    return createHmac('sha256', signingKey).update(value).digest('hex');
  }
  function readCookie(header) {
    const value = header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || !/^[a-f0-9]{48}\.\d{13}\.[a-f0-9]{64}$/.test(value)) {
      return null;
    }
    const [nonce, expires, mac] = value.split('.');
    if (Number(expires) <= Date.now() || !timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(`${nonce}.${expires}`), 'hex'))) {
      return null;
    }
    return { csrf: nonce, expiresAt: Number(expires) };
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://gateway.invalid');
      const method = req.method;
      const connection = readCookie(req.headers.cookie);
      if (method !== 'GET' && req.headers.origin !== publicOrigin) {
        json(res, 403, { error: 'Invalid request origin' });
        return;
      }
      if (url.pathname === '/config' && method === 'GET') {
        json(res, 200, { upstream: upstream.origin, sharedAccount: configured });
        return;
      }
      if (!configured) {
        json(res, 503, { error: 'The shared Test Hub API connection is not configured. Contact the site operator.' });
        return;
      }
      if (url.pathname === '/connection' && method === 'GET') {
        if (connection) {
          json(res, 200, { connected: true, ...connection });
          return;
        }
        const csrf = randomBytes(24).toString('hex');
        const expiresAt = Date.now() + TTL;
        const value = `${csrf}.${expiresAt}`;
        json(
          res,
          200,
          { connected: true, csrf, expiresAt },
          {
            'Set-Cookie': `${cookieName}=${value}.${signature(value)}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1000}${secure ? '; Secure' : ''}`,
          },
        );
        return;
      }
      if (!connection) {
        json(res, 401, { error: 'Refresh the Test Hub connection and try again.' });
        return;
      }
      if (method !== 'GET' && req.headers['x-csrf-token'] !== connection.csrf) {
        json(res, 403, { error: 'Invalid browser session. Refresh the Test Hub connection.' });
        return;
      }
      if (!allowedRoute(method, url)) {
        json(res, 404, { error: 'Unknown API route' });
        return;
      }
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      let payload;
      if (method === 'POST') {
        payload = JSON.stringify(await body(req));
        headers['Content-Type'] = 'application/json';
      }
      const key = req.headers['idempotency-key'];
      if (key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
          json(res, 400, { error: 'Invalid idempotency key' });
          return;
        }
        headers['Idempotency-Key'] = key;
      }
      if (req.headers.range && url.pathname.endsWith('/download')) {
        headers.Range = req.headers.range;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), url.pathname.endsWith('/download') ? 30 * 60 * 1000 : 60000);
      res.on('close', () => controller.abort());
      try {
        const response = await fetcher(`${upstream.origin}/api${url.pathname}${url.search}`, {
          method,
          headers,
          body: payload,
          redirect: 'error',
          signal: controller.signal,
        });
        const responseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        for (const name of ['content-type', 'content-disposition', 'content-length', 'content-range', 'accept-ranges', 'retry-after']) {
          if (response.headers.has(name)) {
            responseHeaders[name] = response.headers.get(name);
          }
        }
        if (response.headers.has('content-encoding')) {
          delete responseHeaders['content-length'];
        }
        res.writeHead(response.status, responseHeaders);
        if (response.body) {
          await pipeline(Readable.fromWeb(response.body), res);
        } else {
          res.end();
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (!res.headersSent) {
        json(res, error instanceof SyntaxError || error.message?.startsWith('Expected') || error.message?.includes('64 KiB') ? 400 : 502, {
          error: 'Request failed. Check your input or retry when the provisioning service is available.',
        });
      } else {
        res.destroy();
      }
    }
  });
  server.requestTimeout = 30000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createGateway();
  server.listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () => {
    process.stdout.write('TC9 shared-account gateway listening on loopback\n');
  });
  process.on('SIGTERM', () => {
    server.close();
    server.closeIdleConnections();
  });
}

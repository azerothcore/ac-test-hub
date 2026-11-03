import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const TTL = 8 * 60 * 60 * 1000;
const ID = '[A-Za-z0-9_-]{1,128}';
const route = new RegExp(
  `^/v1/(?:status|repositories|modules|pull-requests|builds|realms|(?:builds|realms)/${ID}(?:/(?:artifact|download|start|stop|recompile|account))?)$`,
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
    return (
      !action ||
      (['artifact', 'download', 'recompile', 'account'].includes(action) &&
        (!['recompile', 'account'].includes(action) || resource === 'realms'))
    );
  }
  if (method === 'DELETE') {
    return !!id && !action && ['builds', 'realms'].includes(resource);
  }
  if (method !== 'POST') {
    return false;
  }
  return (
    (resource === 'builds' && !id) ||
    (!!id && (action === 'artifact' || (resource === 'realms' && ['start', 'stop', 'recompile', 'account'].includes(action))))
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
class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'Expected application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) {
      throw new RequestError(413, 'Request exceeds 64 KiB');
    }
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(400, 'Expected a JSON object');
  }
  return value;
}
function origin(value, name, allowLocal = false) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error(`${name}: HTTPS required (HTTP is allowed only for loopback development)`);
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be an origin without credentials, path, query or fragment`);
  }
  return url;
}
function flag(env, name) {
  if (env[name] && !['true', 'false'].includes(env[name])) {
    throw new Error(`${name} must be true or false`);
  }
  return env[name] === 'true';
}

/** All visitors share the operator-configured account. Cookies protect CSRF, not user identity. */
export function createGateway(options = {}) {
  const env = options.env ?? process.env;
  const upstream = env.TC9_UPSTREAM_URL ? origin(env.TC9_UPSTREAM_URL, 'TC9_UPSTREAM_URL', options.allowInsecure) : null;
  const publicOrigin = env.TC9_PUBLIC_ORIGIN ? origin(env.TC9_PUBLIC_ORIGIN, 'TC9_PUBLIC_ORIGIN', true).origin : null;
  const secure = publicOrigin?.startsWith('https:');
  const cookiePath = env.TC9_COOKIE_PATH || '/tc9-api/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(cookiePath)) {
    throw new Error('Invalid cookie path');
  }
  const token = env.TC9_API_TOKEN ?? '';
  if (token && !/^tc9_[A-Za-z0-9_]{20,256}$/.test(token)) {
    throw new Error('Invalid TC9_API_TOKEN');
  }
  if (token && (!upstream || !publicOrigin)) {
    throw new Error('TC9_UPSTREAM_URL and TC9_PUBLIC_ORIGIN are required with TC9_API_TOKEN');
  }
  const configured = !!token;
  const capabilities = {
    management: flag(env, 'TC9_ALLOW_MANAGEMENT'),
    personalAccounts: flag(env, 'TC9_PERSONAL_ACCOUNTS'),
  };
  const visitorKey = env.TC9_VISITOR_SECRET;
  if (capabilities.personalAccounts && !/^[a-fA-F0-9]{64,}$/.test(visitorKey ?? '')) {
    throw new Error('TC9_VISITOR_SECRET must contain at least 32 random bytes in hex for personal accounts');
  }
  // Stable across token rotation; different providers or website paths never reuse stored requests.
  const instance = createHash('sha256').update(`${publicOrigin}|${cookiePath}|${upstream?.origin}`).digest('hex').slice(0, 24);
  const cookieName = secure ? '__Secure-tc9-hub' : 'tc9-hub-dev';
  const signingKey = randomBytes(32);
  const visitorCookieName = secure ? '__Secure-tc9-player' : 'tc9-player-dev';
  function visitorSignature(value) {
    return createHmac('sha256', visitorKey).update(value).digest('hex');
  }
  function readVisitor(header) {
    const value = header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${visitorCookieName}=`))
      ?.slice(visitorCookieName.length + 1);
    if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) {
      return null;
    }
    const [id, mac] = value.split('.');
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(visitorSignature(id), 'hex')) ? id : null;
  }
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
        json(res, 200, { upstream: upstream?.origin ?? '', sharedAccount: configured, instance, capabilities });
        return;
      }
      if (!configured) {
        json(res, 503, { error: 'The shared Test Hub API connection is not configured. Contact the site operator.' });
        return;
      }
      if (url.pathname === '/connection' && method === 'GET') {
        const cookies = [];
        const csrf = connection?.csrf ?? randomBytes(24).toString('hex');
        const expiresAt = connection?.expiresAt ?? Date.now() + TTL;
        if (!connection) {
          const value = `${csrf}.${expiresAt}`;
          cookies.push(
            `${cookieName}=${value}.${signature(value)}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1000}${secure ? '; Secure' : ''}`,
          );
        }
        if (capabilities.personalAccounts && !readVisitor(req.headers.cookie)) {
          const visitor = randomBytes(32).toString('hex');
          cookies.push(
            `${visitorCookieName}=${visitor}.${visitorSignature(visitor)}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=15552000${secure ? '; Secure' : ''}`,
          );
        }
        json(res, 200, { connected: true, csrf, expiresAt }, cookies.length ? { 'Set-Cookie': cookies } : {});
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
      const accountRoute = url.pathname.endsWith('/account');
      const managementRoute = method === 'DELETE' || /\/(?:start|stop|recompile)$/.test(url.pathname);
      if ((accountRoute && !capabilities.personalAccounts) || (managementRoute && !capabilities.management)) {
        json(res, 403, { error: 'This operation is disabled by the site operator.' });
        return;
      }
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'identity' };
      if (method === 'POST' && url.pathname === '/v1/builds') {
        headers['X-TC9-Reuse-Active'] = 'true';
      }
      if (accountRoute) {
        const visitor = readVisitor(req.headers.cookie);
        if (!visitor) {
          json(res, 401, { error: 'Reload the Test Hub to recover your personal game account.' });
          return;
        }
        headers['X-TC9-Account-Key'] = createHmac('sha256', visitorKey).update(`${url.pathname}:${visitor}`).digest('hex');
      }
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
        const download = url.pathname.endsWith('/download') && response.ok;
        if (download) {
          // Upstream cannot serve active HTML/SVG under the hub's origin or inject a filename.
          if (response.headers.has('content-encoding')) {
            throw new Error('Encoded archive responses cannot be streamed with byte ranges');
          }
          responseHeaders['content-type'] = 'application/octet-stream';
          responseHeaders['content-disposition'] = 'attachment; filename="core.zip"';
        } else if (
          response.status !== 204 &&
          !/^application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')
        ) {
          throw new Error('Expected a JSON API response');
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
        json(res, error instanceof RequestError ? error.status : 502, {
          error:
            error instanceof RequestError
              ? error.message
              : 'The provisioning service is unavailable or returned an invalid response. Try again later.',
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

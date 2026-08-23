import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTER_NAME,
  allowedOrigins,
  handleVisitorRequest,
  rateLimitKey,
  responseHeaders
} from './visitor-counter-policy.mjs';

const productionOrigin = 'https://jason133728-debug.github.io';

function makeRequest(method, {
  origin = '',
  path = '/api/visits',
  ip = ''
} = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (origin) headers.set('Origin', origin);
  if (ip) headers.set('CF-Connecting-IP', ip);
  return new Request('https://worker.example' + path, { method, headers });
}

function makeEnvironment({
  count = 7,
  incrementedCount = 8,
  limiterAvailable = true,
  limiterSuccess = true,
  counterError = false
} = {}) {
  const calls = {
    getCount: 0,
    increment: 0,
    limiterKeys: []
  };

  const counter = {
    async getCount() {
      calls.getCount += 1;
      if (counterError) throw new Error('test counter error');
      return count;
    },
    async increment() {
      calls.increment += 1;
      if (counterError) throw new Error('test counter error');
      return incrementedCount;
    }
  };

  const env = {
    ALLOWED_ORIGINS: productionOrigin,
    VISITOR_COUNTER: {
      getByName(name) {
        assert.equal(name, COUNTER_NAME);
        return counter;
      }
    }
  };

  if (limiterAvailable) {
    env.VISITOR_RATE_LIMITER = {
      async limit({ key }) {
        calls.limiterKeys.push(key);
        return { success: limiterSuccess };
      }
    };
  }

  return { calls, env };
}

async function body(response) {
  return response.json();
}

test('origin allowlist uses the production origin by default and trims configured values', () => {
  assert.deepEqual([...allowedOrigins({})], [productionOrigin]);
  assert.deepEqual(
    [...allowedOrigins({ ALLOWED_ORIGINS: ' https://one.example,https://two.example ' })],
    ['https://one.example', 'https://two.example']
  );
});

test('response headers expose CORS only to an allowed origin', () => {
  const allowed = responseHeaders(productionOrigin, true);
  assert.equal(allowed.get('access-control-allow-origin'), productionOrigin);
  assert.equal(allowed.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(allowed.get('cache-control'), 'no-store');
  assert.equal(allowed.get('referrer-policy'), 'no-referrer');
  assert.equal(allowed.get('x-content-type-options'), 'nosniff');
  assert.equal(allowed.get('x-frame-options'), 'DENY');
  assert.equal(allowed.get('x-robots-tag'), 'noindex');
  assert.equal(allowed.get('vary'), 'Origin');

  const blocked = responseHeaders('http://localhost:4173', false);
  assert.equal(blocked.has('access-control-allow-origin'), false);
});

test('rate-limit keys are deterministic hashes and never expose the client IP', async () => {
  const request = makeRequest('POST', { ip: '203.0.113.7' });
  const first = await rateLimitKey(request, new Date('2026-08-23T00:00:00Z'));
  const second = await rateLimitKey(request, new Date('2026-08-23T23:59:59Z'));
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first.includes('203.0.113.7'), false);
  assert.equal(await rateLimitKey(makeRequest('POST')), null);
});

test('preflight allows the production origin and blocks localhost', async () => {
  const { env } = makeEnvironment();
  const allowed = await handleVisitorRequest(
    makeRequest('OPTIONS', { origin: productionOrigin }),
    env
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), productionOrigin);

  const blocked = await handleVisitorRequest(
    makeRequest('OPTIONS', { origin: 'http://localhost:4173' }),
    env
  );
  assert.equal(blocked.status, 403);
  assert.deepEqual(await body(blocked), { error: 'Origin not allowed' });
  assert.equal(blocked.headers.has('access-control-allow-origin'), false);
});

test('GET remains read-only and returns the current count', async () => {
  const { calls, env } = makeEnvironment({ count: 42 });
  const response = await handleVisitorRequest(
    makeRequest('GET', { origin: productionOrigin }),
    env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { count: 42 });
  assert.equal(calls.getCount, 1);
  assert.equal(calls.increment, 0);
});

test('POST rejects a disallowed origin before touching the counter', async () => {
  const { calls, env } = makeEnvironment();
  const response = await handleVisitorRequest(
    makeRequest('POST', {
      origin: 'http://127.0.0.1:4173',
      ip: '203.0.113.7'
    }),
    env
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await body(response), { error: 'Origin not allowed' });
  assert.equal(calls.increment, 0);
  assert.equal(calls.limiterKeys.length, 0);
});

test('POST fails closed when the limiter or client address is unavailable', async () => {
  const missingLimiter = makeEnvironment({ limiterAvailable: false });
  const limiterResponse = await handleVisitorRequest(
    makeRequest('POST', { origin: productionOrigin, ip: '203.0.113.7' }),
    missingLimiter.env
  );
  assert.equal(limiterResponse.status, 503);
  assert.deepEqual(await body(limiterResponse), { error: 'Rate limiter unavailable' });

  const missingIp = makeEnvironment();
  const ipResponse = await handleVisitorRequest(
    makeRequest('POST', { origin: productionOrigin }),
    missingIp.env
  );
  assert.equal(ipResponse.status, 503);
  assert.deepEqual(await body(ipResponse), { error: 'Client address unavailable' });
  assert.equal(missingIp.calls.increment, 0);
});

test('POST rate limiting and successful increments use a hashed key', async () => {
  const limited = makeEnvironment({ limiterSuccess: false });
  const limitedResponse = await handleVisitorRequest(
    makeRequest('POST', { origin: productionOrigin, ip: '203.0.113.7' }),
    limited.env
  );
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get('retry-after'), '60');
  assert.deepEqual(await body(limitedResponse), { error: 'Too many requests' });
  assert.equal(limited.calls.increment, 0);

  const allowed = makeEnvironment({ incrementedCount: 9 });
  const allowedResponse = await handleVisitorRequest(
    makeRequest('POST', { origin: productionOrigin, ip: '203.0.113.7' }),
    allowed.env
  );
  assert.equal(allowedResponse.status, 200);
  assert.deepEqual(await body(allowedResponse), { count: 9 });
  assert.equal(allowed.calls.increment, 1);
  assert.equal(allowed.calls.limiterKeys.length, 1);
  assert.match(allowed.calls.limiterKeys[0], /^[0-9a-f]{64}$/);
});

test('unknown paths, unsupported methods, and counter failures are safe', async () => {
  const normal = makeEnvironment();
  const missing = await handleVisitorRequest(
    makeRequest('GET', { path: '/missing' }),
    normal.env
  );
  assert.equal(missing.status, 404);

  const method = await handleVisitorRequest(makeRequest('PUT'), normal.env);
  assert.equal(method.status, 405);

  const failing = makeEnvironment({ counterError: true });
  const failed = await handleVisitorRequest(makeRequest('GET'), failing.env);
  assert.equal(failed.status, 500);
  assert.deepEqual(await body(failed), { error: 'Counter unavailable' });
});

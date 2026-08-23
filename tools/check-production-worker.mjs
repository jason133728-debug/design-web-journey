const endpoint = 'https://design-web-journey-visitor-counter.design-web-journey-worker-deploy-20260823-121852.workers.dev/api/visits';
const productionOrigin = 'https://jason133728-debug.github.io';
const blockedOrigins = ['http://localhost:4173', 'http://127.0.0.1:4173'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCommonHeaders(response, label) {
  assert(response.headers.get('cache-control') === 'no-store', `${label}: Cache-Control must be no-store`);
  assert(response.headers.get('referrer-policy') === 'no-referrer', `${label}: Referrer-Policy must be no-referrer`);
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${label}: X-Content-Type-Options must be nosniff`);
  assert(response.headers.get('x-frame-options') === 'DENY', `${label}: X-Frame-Options must be DENY`);
  assert(response.headers.get('x-robots-tag') === 'noindex', `${label}: X-Robots-Tag must be noindex`);
  assert((response.headers.get('vary') || '').split(',').map(value => value.trim().toLowerCase()).includes('origin'), `${label}: Vary must include Origin`);
}

async function request(method, origin) {
  return fetch(endpoint, {
    method,
    headers: {
      Accept: 'application/json',
      Origin: origin
    },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  });
}

const preflight = await request('OPTIONS', productionOrigin);
assert(preflight.status === 204, `production preflight: expected 204, got ${preflight.status}`);
assertCommonHeaders(preflight, 'production preflight');
assert(preflight.headers.get('access-control-allow-origin') === productionOrigin, 'production preflight: exact allowed origin is missing');
assert(preflight.headers.get('access-control-allow-methods') === 'GET, POST, OPTIONS', 'production preflight: allowed methods changed');

const readResponse = await request('GET', productionOrigin);
assert(readResponse.status === 200, `production GET: expected 200, got ${readResponse.status}`);
assertCommonHeaders(readResponse, 'production GET');
assert(readResponse.headers.get('access-control-allow-origin') === productionOrigin, 'production GET: exact allowed origin is missing');
const body = await readResponse.json();
assert(Number.isSafeInteger(body.count) && body.count >= 0, 'production GET: count must be a non-negative safe integer');

for (const origin of blockedOrigins) {
  const response = await request('OPTIONS', origin);
  assert(response.status === 403, `${origin}: expected 403, got ${response.status}`);
  assertCommonHeaders(response, origin);
  assert(!response.headers.has('access-control-allow-origin'), `${origin}: blocked origin received Access-Control-Allow-Origin`);
}

console.log('Production Worker security checks passed: production origin allowed; localhost origins blocked; GET remained read-only.');

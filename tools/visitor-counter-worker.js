import { DurableObject } from 'cloudflare:workers';

const DEFAULT_ALLOWED_ORIGIN = 'https://jason133728-debug.github.io';
const COUNTER_NAME = 'design-web-journey';

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN)
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  );
}

function responseHeaders(origin, isAllowed) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin'
  });

  if (origin && isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }

  return headers;
}

function json(data, status, origin, isAllowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(origin, isAllowed)
  });
}

export class VisitorCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0)
      )
    `);
  }

  getCount(name = COUNTER_NAME) {
    const rows = this.ctx.storage.sql
      .exec('SELECT value FROM counters WHERE name = ?', name)
      .toArray();
    return rows[0]?.value ?? 0;
  }

  increment(name = COUNTER_NAME) {
    this.ctx.storage.sql.exec(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1`,
      name
    );
    return this.getCount(name);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const isAllowed = !origin || allowedOrigins(env).has(origin);

    if (url.pathname !== '/api/visits') {
      return json({ error: 'Not found' }, 404, origin, isAllowed);
    }

    if (request.method === 'OPTIONS') {
      return isAllowed
        ? new Response(null, { status: 204, headers: responseHeaders(origin, true) })
        : json({ error: 'Origin not allowed' }, 403, origin, false);
    }

    if (!isAllowed) {
      return json({ error: 'Origin not allowed' }, 403, origin, false);
    }

    const counter = env.VISITOR_COUNTER.getByName(COUNTER_NAME);

    try {
      if (request.method === 'GET') {
        return json({ count: await counter.getCount() }, 200, origin, true);
      }

      if (request.method === 'POST') {
        return json({ count: await counter.increment() }, 200, origin, true);
      }

      return json({ error: 'Method not allowed' }, 405, origin, true);
    } catch {
      return json({ error: 'Counter unavailable' }, 500, origin, true);
    }
  }
};

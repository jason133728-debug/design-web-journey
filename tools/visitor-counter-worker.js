import { DurableObject } from 'cloudflare:workers';
import {
  COUNTER_NAME,
  handleVisitorRequest
} from './visitor-counter-policy.mjs';

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
  fetch: handleVisitorRequest
};

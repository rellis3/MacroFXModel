/**
 * /api/state route — fake KV, fake OANDA, no network (local self-calls fail and are reported).
 * Run: node --test js/stateRoutes.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStateRoutes } from './stateRoutes.js';

const days = (n, f) => { const out = []; const d = new Date('2026-10-30T00:00:00Z'); while (out.length < n) { if (![0, 6].includes(d.getUTCDay())) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); } return out.map((date, i) => f(date, i)); };

test('builds a document from KV FRED + OANDA bars, reports what failed, and caches', async () => {
  process.env.OANDA_KEY = process.env.OANDA_KEY || 'test';
  const kvStore = { fredhistory_series_us10y: JSON.stringify(days(90, (date, i) => ({ date, value: 4 + i * 0.002 }))),
                    fredhistory_series_hy: JSON.stringify(days(90, (date, i) => ({ date, value: 3 + (i > 80 ? 0.3 : 0) }))) };
  const kv = { get: async k => kvStore[k] ?? null };
  let calls = 0;
  const fetchD1 = async sym => { calls++; if (sym === 'BTC_USD') throw new Error('not offered'); return days(400, (date, i) => ({ date, close: 100 + i * 0.05 })); };
  const routes = createStateRoutes({ kv, port: 1, fetchD1, log: { error() {} } });
  const doc = await routes.get();
  assert.equal(doc.version, 1);
  assert.ok(doc.tiers.find(t => t.id === 'rates').readings.find(r => r.key === 'us10y' && !r.missing));
  assert.match(doc.tiers.find(t => t.id === 'credit').state.headline, /widening/);
  assert.ok(doc.errors.some(e => e.source === 'OANDA BTC_USD'));
  assert.ok(doc.errors.some(e => e.source === 'chain-extra'));
  assert.equal(doc.sources.spx, 'OANDA SPX500_USD (NY-close daily)');
  const again = await routes.get();
  assert.equal(again.cached, true);
  assert.equal(calls, 11);                       // second call served from cache
  // mount registers GET /api/state
  const reg = []; routes.mount({ get: (p, h) => reg.push(p) });
  assert.deepEqual(reg, ['/api/state']);
});

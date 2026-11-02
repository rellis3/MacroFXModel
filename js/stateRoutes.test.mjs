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

test('readers feed the global banner, economies, layers and edges; a failing reader is reported, not fatal', async () => {
  process.env.OANDA_KEY = process.env.OANDA_KEY || 'test';
  const kv = { get: async k => (k === 'credit_quality_v1' ? JSON.stringify({ ok: true, quality: 1.2, latestDate: '2026-10-30' }) : null) };
  const routes = createStateRoutes({ kv, port: 1, fetchD1: async () => [], log: { error() {} }, readers: {
    globalRead: () => ({ ok: true, envLabel: 'risk-off · high volatility', meta: { asOf: '2026-10-31T09:00:00Z' } }),
    riskFlags: async () => ({ ok: true, level: 'RISK_OFF', active: 3, flags: [] }),
    volForecast: () => ({ session_date: '2026-11-02', instruments: { GOLD: { vol_annual: 18, vol_pct: 81 } } }),
    cotState: async () => { throw new Error('No COT data cached yet'); },
  } });
  const doc = await routes.get();
  assert.equal(doc.global.envLabel, 'risk-off · high volatility');
  assert.equal(doc.global.risk.level, 'RISK_OFF');
  assert.equal(doc.global.creditQuality.z, 1.2);
  assert.equal(doc.layers.vol.rows[0].sym, 'GOLD');
  assert.equal(doc.economies.rows.length, 8);
  assert.ok(doc.edges.length >= 5);
  assert.ok(doc.edges.every(e => e.active === null || typeof e.active === 'boolean'));
  assert.ok(doc.errors.some(e => e.source === 'cot-state' && /No COT/.test(e.error)));
  assert.ok(doc.errors.some(e => e.source === 'stress-shadow'));
});

test('deep FRED history from R2 replaces the 90-print KV copy when it is longer', async () => {
  process.env.OANDA_KEY = process.env.OANDA_KEY || 'test';
  const short = Array.from({ length: 90 }, (_, i) => ({ date: new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString().slice(0, 10), value: 4 }));
  const deep = Array.from({ length: 3000 }, (_, i) => ({ date: new Date(Date.UTC(2015, 0, 1) + i * 864e5).toISOString().slice(0, 10), value: 2 + i / 1000 }));
  const kv = { get: async k => (k === 'fredhistory_series_us10y' ? JSON.stringify(short) : null) };
  const routes = createStateRoutes({ kv, port: 1, fetchD1: async () => [], log: { error() {} }, readers: { deepFred: async k => (k === 'us10y' ? deep : null) } });
  const doc = await routes.get();
  assert.deepEqual(doc.deepHistory, ['us10y']);
  const r = doc.tiers[0].readings.find(x => x.key === 'us10y');
  assert.ok(r.pctile.spanDays > 1000, `span ${r.pctile.spanDays}`);
});

test('without KV or OANDA, keyless FRED and Yahoo fallbacks fill the tiers and every one is labelled', async () => {
  const saved = process.env.OANDA_KEY; delete process.env.OANDA_KEY;
  try {
    const series = days(120, (date, i) => ({ date, value: 4 + i * 0.01 }));
    let flaky = 0;
    const routes = createStateRoutes({ kv: { get: async () => null }, port: 1, fetchD1: async () => { throw new Error('should not be called'); }, log: { error() {} }, keylessPauseMs: 0, readers: {
      fredKeyless: async k => { if (k === 'us2y' && flaky++ === 0) throw new Error('HTTP 503'); return ['us10y', 'us2y', 'hy'].includes(k) ? series : null; },
      yahooDaily: async t => (t === '^GSPC' ? series : null),
    } });
    const doc = await routes.get();
    assert.match(doc.sources.us10y, /FRED public CSV/);
    assert.match(doc.sources.us2y, /FRED public CSV/);          // one 503, then retried
    assert.match(doc.sources.spx, /Yahoo \^GSPC \(fallback/);
    assert.ok(!doc.errors.some(e => /us2y/.test(e.source)));
    assert.ok(doc.errors.some(e => e.source === 'OANDA'));
    for (const t of doc.tiers) for (const r of t.readings.filter(r => !r.missing)) assert.ok(doc.sources[r.key], `${r.key} has a source`);
  } finally { if (saved !== undefined) process.env.OANDA_KEY = saved; }
});

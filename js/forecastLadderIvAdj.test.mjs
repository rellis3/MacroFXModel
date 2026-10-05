/**
 * Tests for the IV-adjusted daily ladder (js/forecastLadderIvAdj.js). About meaning:
 * the blend is neutral at the instrument's typical IV÷σ, widens when options price more,
 * crosses are built from their legs with the right sign, and anything without a usable
 * IV keeps the production block — never a guessed one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { crossImpliedVol, legCorrelation, buildIvAdjLadder, buildIvAdjInstruments, buildIvAdjExportText } from './forecastLadderIvAdj.js';
import { IVADJ_PARAMS } from './forecastLadderIvAdjParams.js';
import { forecastSigma } from './forecastSigma.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('cross IV: EURJPY = EURUSD(+) and USDJPY(−) adds the covariance; EURGBP (both +) subtracts it', () => {
  // σ² = a² + b² − 2·sA·sB·ρ·a·b
  assert.ok(near(crossImpliedVol(8, 10, +1, -1, 0.5), Math.sqrt(64 + 100 + 2 * 0.5 * 80)));
  assert.ok(near(crossImpliedVol(8, 10, +1, +1, 0.5), Math.sqrt(64 + 100 - 2 * 0.5 * 80)));
  assert.equal(crossImpliedVol(8, 10, +1, +1, NaN), null);
});

function bars(n = 400, vol = 0.006, seed = 7, base = 1.1) {
  let px = base;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: n }, (_, i) => {
    const open = px, close = px * (1 + rnd() * 2 * vol); px = close;
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86400_000).toISOString().slice(0, 10);
    return { time: d, open, high: Math.max(open, close) * (1 + vol / 3), low: Math.min(open, close) * (1 - vol / 3), close };
  });
}

test('leg correlation: a series with itself is 1, too little history is null', () => {
  const b = bars();
  assert.ok(near(legCorrelation(b, b), 1, 1e-12));
  assert.equal(legCorrelation(b.slice(0, 30), b.slice(0, 30)), null);
});

test('neutral at the typical IV÷σ, wider when options price more vol', () => {
  const b = bars(), p = IVADJ_PARAMS.pairs.EURUSD;
  const sig = forecastSigma(b, p.estimator) * Math.sqrt(252) * 100;
  const typical = sig * Math.exp(p.mu);
  const L0 = buildIvAdjLadder(b, { instrument: 'EURUSD', ivAnnualPct: typical });
  const Lhi = buildIvAdjLadder(b, { instrument: 'EURUSD', ivAnnualPct: typical * 1.5 });
  assert.ok(near(L0.iv_adjust, 1, 1e-3));
  assert.ok(Lhi.hl.p50 > L0.hl.p50 && Lhi.iv_adjust < 1.5, 'wider, but a blend (k < 1), not the full IV ratio');
  for (const q of ['hl', 'oc', 'oh', 'ol']) assert.ok(L0[q].p50 < L0[q].p75 && L0[q].p75 < L0[q].p90, q);
});

test('live wiring: legs build the cross, SPX500 aliases to SPX, NZD and stale captures stay on the plain ladder', () => {
  const now = Date.parse('2026-10-05T22:00:00Z');
  const names = ['EURUSD', 'USDJPY', 'EURJPY', 'SPX500', 'NZDUSD', 'GBPUSD'];
  const ohlc = Object.fromEntries(names.map((n, i) => [n, bars(400, 0.006, 11 + i)]));
  const latest = { session_label: 'TEST', instruments: Object.fromEntries(names.map(n => [n, { ladder: { event_tag: null, vol_annual: 9, hl: { p50: 1 } } }])) };
  const registry = [['EURUSD', 'EUR_USD'], ['USDJPY', 'USD_JPY'], ['EURJPY', 'EUR_JPY'], ['SPX500', 'SPX500_USD', 'index'],
                    ['NZDUSD', 'NZD_USD'], ['GBPUSD', 'GBP_USD']].map(([name, oandaInstrument, assetClass = 'fx']) => ({ name, oandaInstrument, assetClass }));
  const ts = iv => ({ points: [{ dte: 10, iv }, { dte: 40, iv }] });
  const oi = { 'EUR/USD': { ivTermStructure: ts(7), ivSavedAtMs: now - 3600_000 },
               'USD/JPY': { ivTermStructure: ts(10), ivSavedAtMs: now - 3600_000 },
               'GBP/USD': { ivTermStructure: ts(8), ivSavedAtMs: now - 100 * 3600_000 } };   // stale
  const cboe = { VIX: { date: '2026-10-05', value: 18 } };
  const { instruments, adjusted, skipped } = buildIvAdjInstruments(latest, ohlc, oi, registry, now, cboe);
  const adj = Object.fromEntries(adjusted.map(a => [a.name, a]));
  assert.ok(adj.EURUSD && adj.USDJPY && adj.EURJPY && adj.SPX500, JSON.stringify(skipped));
  assert.equal(adj.EURJPY.source, 'LEGS');
  assert.ok(Number.isFinite(adj.EURJPY.rho));
  const sk = Object.fromEntries(skipped.map(s => [s.name, s.reason]));
  assert.match(sk.NZDUSD, /no implied vol/);
  assert.match(sk.GBPUSD, /stale/);
  assert.equal(instruments.NZDUSD, latest.instruments.NZDUSD, 'plain block passed through untouched');
  assert.equal(instruments.EURJPY.ladder.params_source, 'fitted-ivadj');
});

test('export: own title, production row format, footer names no ticker (Pine switches blocks on tickers)', () => {
  const now = Date.parse('2026-10-05T22:00:00Z');
  const b = bars();
  const latest = { session_label: 'TEST', instruments: { EURUSD: { ladder: { event_tag: null } } } };
  const oi = { 'EUR/USD': { ivTermStructure: { points: [{ dte: 10, iv: 7 }, { dte: 40, iv: 7 }] }, ivSavedAtMs: now - 3600_000 } };
  const { text, adjusted } = buildIvAdjExportText(latest, { EURUSD: b }, oi, [{ name: 'EURUSD', oandaInstrument: 'EUR_USD', assetClass: 'fx' }], now);
  assert.equal(adjusted.length, 1);
  assert.match(text.split('\n')[0], /IV-ADJUSTED/);
  const footer = text.split('\n').at(-1);
  assert.doesNotMatch(footer.toUpperCase(), /EURUSD|GOLD|NQ|SPX|RANGE|MOVE|OPEN HIGH|OPEN LOW|DRIFT/);
});

import { usExtras, barsBefore } from './forecastLadderIvAdj.js';

test('barsBefore drops a partial bar dated on/after the session (mid-day Yahoo warm)', () => {
  const b = bars(10);
  const sess = b[8].time;                               // pretend bars 8 and 9 are "today" or later
  assert.equal(barsBefore(b, sess).length, 8);
  assert.equal(barsBefore(b, null).length, 10);
});

test('US extras: computed from CBOE closes + six indices, null if any input missing', () => {
  const names = ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];
  const down = n => { const b = bars(30, 0.004, 3); b.push({ ...b.at(-1), time: '2099-01-01', close: b.at(-1).close * 0.99 }); return b; };
  const cache = Object.fromEntries(names.map(n => [n, down(n)]));
  const cboe = { VIX: { value: 25 }, VIX3M: { value: 22 }, VIX9D: { value: 26 } };
  const e = usExtras(cboe, cache, null);
  assert.deepEqual([e.vix_inv, e.front_dear, e.front_calm, e.all_down], [1, 1, 0, 1]);
  assert.equal(usExtras({ VIX: { value: 25 } }, cache, null), null, 'missing VIX3M -> null, not a guess');
  assert.equal(usExtras(cboe, { NQ: cache.NQ }, null), null, 'missing indices -> null');
});

test('US index: joint form when extras present, IV-only fallback otherwise; non-US never uses extras', () => {
  const b = bars();
  const ext = { vix_inv: 1, front_dear: 1, front_calm: 0, all_down: 1, nq_dw: 1 };
  const J = buildIvAdjLadder(b, { instrument: 'SPX500', ivAnnualPct: 20, assetClass: 'index', extras: ext });
  const I = buildIvAdjLadder(b, { instrument: 'SPX500', ivAnnualPct: 20, assetClass: 'index', extras: null });
  assert.equal(J.form, 'iv+extras'); assert.equal(I.form, 'iv');
  assert.ok(J.hl.p75 > I.hl.p75, 'stress flags all on -> wider than IV alone');
  const D = buildIvAdjLadder(b, { instrument: 'DE30', ivAnnualPct: 20, assetClass: 'index', extras: ext });
  assert.equal(D.form, 'iv', 'DE30 has no confirmed extras');
});

/**
 * stateHistory — on the committed seeds (real data), no network.
 * Run: node --test js/stateHistory.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { contextOf, ratio, longContext, fxBoard, surpriseHistory, specShare, cotBoard } from './stateHistory.js';
import { loadSeed } from './marketHistory.js';
import { loadCotCsv } from './stateHistorySources.js';

const flat = (n, v = 1) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), value: v + i }));

test('contextOf: rising series sits at the 100th percentile; extremes and 20d change are prior-only', () => {
  const c = contextOf(flat(400));
  assert.equal(c.pctAll, 100);
  assert.equal(c.high.value, 399);
  assert.equal(c.chg20, 20);
  assert.equal(contextOf(flat(10)), null);
});

test('long context on the real seeds: VIX since 1990, MOVE since 2002, the 10Y since 1970', () => {
  const s = {}; for (const id of ['VIX', 'VIX3M', 'VVIX', 'SKEW']) s[id] = loadSeed('cboe', id);
  for (const id of ['MOVE', 'TNX', 'HYG', 'IEF']) s[id] = loadSeed('yahoo', id);
  const rows = Object.fromEntries(longContext(s).map(r => [r.id, r.ctx]));
  assert.equal(rows.VIX.since, '1990-01-02');
  assert.ok(rows.TNX.since <= '1970-01-31');
  assert.ok(rows.TNX.high.value > 15 && rows.TNX.high.date.startsWith('1981'));   // the 1981 peak
  assert.ok(rows.VIX_TERM && rows.CREDIT_RATIO);
  for (const r of Object.values(rows)) assert.ok(r.pctAll >= 0 && r.pctAll <= 100);
});

test('FX board: currency strength vs USD with EM stress count', () => {
  const s = {}; for (const c of ['EURUSD', 'JPY', 'BRL', 'MXN', 'TRY', 'INR']) s[`FX_${c}`] = loadSeed('yahoo', `FX_${c}`);
  const b = fxBoard(s);
  assert.ok(b.rows.length >= 6);
  assert.ok(b.emStress.of >= 4);
  for (const r of b.rows) assert.ok(Number.isFinite(r.chg20) && r.pctMove >= 0 && r.pctMove <= 100);
  // USD/xxx quotes are inverted: a rising USD/TRY is a weaker lira
  const t = [{ date: '2020-01-01', value: 10 }];
  const fake = { FX_TRY: Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), value: 5 + i * 0.01 })) };
  assert.ok(fxBoard(fake).rows[0].chg20 < 0, t.length > 0);
});

test('surprise history from the 26,403-release backfill: 8 economies, monthly, no lookahead scaling', () => {
  const bf = JSON.parse(readFileSync(new URL('../backfill/surprise_backfill.json', import.meta.url), 'utf8'));
  const h = surpriseHistory(bf);
  assert.deepEqual(Object.keys(h).sort(), ['AU', 'CA', 'CH', 'EU', 'GB', 'JP', 'NZ', 'US']);
  assert.ok(h.US.length > 150);
  assert.ok(h.US[0].date >= '2007-01-01');
  for (const p of h.US) assert.ok(Math.abs(p.value) <= 4);
});

test('COT board from the committed CSV, back in raw futures terms; spec share from TFF or Disaggregated fields', () => {
  assert.equal(specShare({ lev_money_positions_long: 60, lev_money_positions_short: 40, open_interest_all: 100 }), 0.2);
  assert.equal(specShare({ m_money_positions_long_all: 10, m_money_positions_short_all: 30, open_interest_all: 100 }), -0.2);
  const csv = loadCotCsv(new URL('..', import.meta.url).pathname);
  const b = cotBoard(csv);
  assert.ok(b.length >= 20);
  // 2024: specs heavily SHORT the yen futures (the carry trade) — raw terms must show a negative share mid-2024
  const jpy = csv.JPY.rows.find(r => r.date >= '2024-06-01');
  assert.ok(specShare(jpy) < 0, `JPY spec share ${specShare(jpy)}`);
});

// js/terminal/gold.test.mjs: the Gold board core and HTML on synthetic series with known answers. node --test js/terminal/gold.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { realisedVol, ols2, goldFit, positioning, etfFlows, goldBoard } from './goldCore.js';
import { goldHtml } from './goldView.js';

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
const rnd = seed => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; }; };
const path = (moves, start = 100) => { let p = start; return moves.map(m => (p *= 1 + m)); };

test('realisedVol: zero for a flat series, about the daily step times root 252 for a steady one, null when short', () => {
  assert.equal(realisedVol(new Array(40).fill(100), 20), 0); assert.equal(realisedVol([1, 2, 3], 20), null);
  const r = rnd(5), v = realisedVol(path(Array.from({ length: 80 }, () => r() * 0.02)), 20); assert.ok(v > 3 && v < 12, `vol ${v}`);
});
test('ols2 recovers known coefficients and a high R squared on a noiseless relationship; null on too few rows', () => {
  const r1 = rnd(1), r2 = rnd(2), x1 = Array.from({ length: 200 }, () => r1()), x2 = Array.from({ length: 200 }, () => r2()), y = x1.map((a, i) => 0.5 + 2 * a - 3 * x2[i]);
  const f = ols2(y, x1, x2); assert.ok(Math.abs(f.a - 0.5) < 1e-9 && Math.abs(f.b[0] - 2) < 1e-9 && Math.abs(f.b[1] + 3) < 1e-9); assert.ok(f.r2 > 0.999999);
  assert.equal(ols2(y.slice(0, 30), x1.slice(0, 30), x2.slice(0, 30)), null);
  assert.equal(ols2(y, x1, x1.map(a => a * 2)), null, 'collinear regressors are refused');
});
function bundle(n = 400) {
  const rd = rnd(11), rt = rnd(12), rg = rnd(13), dxM = Array.from({ length: n }, () => rd() * 0.01), tipsM = Array.from({ length: n }, () => rt() * 0.1);
  const goldM = dxM.map((d, i) => -1.5 * d - 0.03 * tipsM[i] + rg() * 0.004);
  const tips = [2]; for (let i = 1; i < n; i++) tips.push(tips[i - 1] + tipsM[i]);
  return { ok: true, dates: dates(n), to: dates(n)[n - 1], series: { gold: path(goldM, 2000), dxy: path(dxM, 100), tips, gvz: path(Array.from({ length: n }, () => rg() * 0.05), 18) } };
}
test('goldFit: the dollar and real yield explain gold in a built relationship, with the expected signs, and the window is out of sample', () => {
  const g = goldFit(bundle()); assert.ok(g && g.fit.r2 > 0.6, `r2 ${g?.fit.r2}`); assert.ok(g.perDollarPct < -1 && g.perTenBp < 0); assert.equal(g.window, 20);
  assert.ok(Math.abs(g.actualPct - g.fittedPct - g.unexplainedPct) < 1e-9); assert.equal(goldFit({ series: { gold: [1, 2] } }), null);
});
test('positioning: a stale report is flagged by age; a missing gold entry gives null', () => {
  const cot = { ok: true, reportDate: '2026-11-03', instruments: { GOLD: { pct: 32, zone: 'neutral', label: 'Neutral', line: 'Positioning is mid-range.', reportDate: '2026-11-03' } } };
  const p = positioning(cot, Date.parse('2026-11-15T23:00:00Z')); assert.equal(p.ageDays, 12); assert.equal(p.stale, true); assert.equal(positioning(cot, Date.parse('2026-11-08T00:00:00Z')).stale, false);
  assert.equal(positioning({ ok: true, instruments: {} }, 0), null); assert.equal(positioning(null, 0), null);
});
test('etfFlows: empty history is said plainly, one day is not a change, several days give the raw change and the change with the gold move taken out', () => {
  assert.equal(etfFlows({ ok: true, series: [] }).state, 'empty'); assert.match(etfFlows({ ok: true, series: [] }).note, /No history held yet/);
  assert.equal(etfFlows({ ok: true, series: [{ date: '2026-11-13', value: 1e11 }] }).state, 'one'); assert.equal(etfFlows({ ok: false, error: 'x' }).state, 'error');
  const s = [{ date: '2026-11-10', value: 100 }, { date: '2026-11-11', value: 105 }], gold = { '2026-11-10': 2000, '2026-11-11': 2060 };
  const e = etfFlows({ ok: true, series: s }, gold); assert.equal(e.days, 2); assert.ok(Math.abs(e.deltas[1].raw - 5) < 1e-9); assert.ok(Math.abs(e.deltas[1].flow - 2) < 1e-9, 'a 5% rise in assets minus gold 3% is 2% not explained by price'); assert.equal(e.deltas[5], undefined);
});
test('the page: four cards, the fit, positioning and ETF cards, the staleness and empty-history words, no trade wording, no hard-coded colours, a failed feed does not hide the rest', () => {
  const cot = { ok: true, reportDate: '2026-11-03', instruments: { GOLD: { pct: 32, zone: 'neutral', label: 'Neutral', line: 'Positioning is mid-range.', reportDate: '2026-11-03' } } };
  const b = goldBoard(bundle(), cot, { ok: true, series: [] }, { now: Date.parse('2026-11-15T23:00:00Z') }), h = goldHtml(b);
  assert.equal((h.match(/class="in-gcard"/g) ?? []).length + (h.match(/class="in-gcard wide"/g) ?? []).length, 7); assert.match(h, /How much the dollar and real yields explain/); assert.match(h, /a week behind/); assert.match(h, /No history held yet/);
  assert.match(h, /it does not forecast/); assert.match(h, /None of it is a forecast or a trade/); assert.ok(!/#[0-9a-f]{6}\b/i.test(h)); assert.ok(!/\b(buy|sell|go long|go short|stop loss|take profit)\b/i.test(h.replace(/<[^>]+>/g, ' ')));
  const b2 = goldBoard(bundle(), null, null, { now: 0 }); const h2 = goldHtml(b2); assert.match(h2, /Not available/); assert.match(h2, /feed is not available/);
  assert.match(goldHtml(goldBoard({ ok: true, dates: ['2026-11-13'], series: {} }, null, null)), /cannot be drawn/);
});

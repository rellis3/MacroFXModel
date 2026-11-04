// Tests for js/systemReview.js.   node js/systemReview.test.mjs
import assert from 'node:assert/strict';
import { mulberry32 } from './statsCore.js';
import { normaliseTrades, liveVsExpected } from './systemExports.js';
import { reviewSystem, reviewText, exitGrid, bh, validatePostmortem } from './systemReview.js';
import { validateProposals } from './researchPod.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const rng = mulberry32(5), g = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// 800 trades: EURUSD loses, GBPUSD wins, in both halves; Friday is noise; a feature 'atr' high = better; losers often 1R up first
const raw = [];
for (let i = 0; i < 800; i++) {
  const inst = i % 2 ? 'EURUSD' : 'GBPUSD', atr = rng(), edge = (inst === 'GBPUSD' ? 0.35 : -0.35) + (atr > 0.66 ? 0.2 : 0);
  const R = Math.max(-1, Math.min(3, edge + g())), mfe = R < 0 ? (rng() < 0.6 ? 1.2 : 0.3) : R + 0.2, mae = R > 0 ? -0.3 : -1;
  raw.push({ instrument: inst, direction: i % 3 ? 'Long' : 'Short', entryMs: Date.parse('2020-01-06T09:00:00Z') + i * 864e5 * 2, exitMs: Date.parse('2020-01-06T13:00:00Z') + i * 864e5 * 2, R, maeR: mae, mfeR: mfe, features: { atr }, tags: [...(i % 5 ? [] : ['news']), `exit:${R > 0 ? 'win' : 'stop'}`] });
}
const { trades } = normaliseTrades(raw);
t('decay, exits and the exit grid', () => {
  const rv = reviewSystem(trades); assert.ok(rv.ok); assert.equal(rv.trades, 800); assert.equal(rv.decay.first.n + rv.decay.second.n, 800);
  assert.ok(rv.exits.losersThatWereUp1R > 0.5 && rv.exits.losersThatWereUp1R < 0.7);
  assert.ok(rv.exits.grid.ok); assert.equal(rv.exits.grid.rows.length, 15);
  const eg = exitGrid([{ R: -1, maeR: -1, mfeR: 1.2 }, ...Array(40).fill({ R: 2, maeR: -0.2, mfeR: 2 })]); const row = eg.rows.find(r => r.stop === 1 && r.target === 1); assert.equal(row.n, 41); assert.equal(row.meanR, +(((41 - 1) * 1 - 1) / 41).toFixed(3));
});
t('slices chosen on the first half and scored on the second; the real ones survive FDR, the filtered system improves', () => {
  const rv = reviewSystem(trades);
  const s = Object.fromEntries(rv.survivors.map(x => [x.slice, x.direction]));
  assert.equal(s['instrument = EURUSD'], 'drop'); assert.equal(s['instrument = GBPUSD'], 'keep');
  assert.ok(rv.slices.some(x => x.slice === 'feature:atr = high'));
  assert.ok(!rv.survivors.some(x => /weekday/.test(x.slice)), 'weekday is noise and should not survive');
  assert.ok(!rv.slices.some(x => /exit:/.test(x.slice)), 'outcome tags are look-ahead and never sliced');
  assert.ok(rv.filtered.dropped.includes('instrument = EURUSD')); assert.ok(rv.filtered.secondFiltered.meanR > rv.filtered.secondUnfiltered.meanR);
  assert.ok(rv.equityCurve.length === 3); assert.match(reviewText('x', { model: 'X' }, rv), /Survivors after FDR: .*drop instrument = EURUSD/);
  assert.equal(reviewSystem(trades.slice(0, 20)).ok, false);
  assert.deepEqual(bh([0.001, 0.5, NaN, 0.02], 0.1), [true, false, false, true]);
});
t('live against the backtest: a broken live run sits low', () => {
  const live = normaliseTrades(Array.from({ length: 40 }, (_, i) => ({ instrument: 'GBPUSD', direction: 'Long', exitMs: Date.parse('2026-01-05') + i * 864e5, R: -0.6, riskPct: 0.5 }))).trades;
  const lv = liveVsExpected(trades, live, { paths: 800 }); assert.ok(lv.ok && lv.live); assert.equal(lv.window, 40);
  assert.ok(lv.metrics.expectancy.percentile < 0.02); assert.equal(lv.metrics.expectancy.realised, -0.3);
});
t('post-mortem replies: revival ideas in the proposal shape', () => {
  assert.equal(validatePostmortem({ verdict: 'dead' }, 'quant', validateProposals).ok, false);
  const v = validatePostmortem({ verdict: 'revivable', headline: 'EURUSD drags', whatWentWrong: [{ issue: 'EURUSD loses in both halves', evidence: '-0.35R' }],
    revival: [{ title: 'GBP only', thesis: 'drop EURUSD', mechanism: 'GBP trends', sources: [{ title: 'slice table' }], inputs: [{ what: 'trades', status: 'have' }], test: { benchmark: 'unfiltered on a fresh holdout' } }, { title: 'bad' }] }, 'quant', validateProposals);
  assert.ok(v.ok); assert.equal(v.value.revival.length, 1); assert.equal(v.value.revival[0].id, 'quant-gbp-only');
});
console.log(`systemReview: ${n} tests passed`);

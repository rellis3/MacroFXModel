// Tests for js/dayForecast.js.   node js/dayForecast.test.mjs
import assert from 'node:assert/strict';
import { realisedShape, validateDayForecast, scoreDayForecast, dayForecastRecord, DAY_MARKETS } from './dayForecast.js';
import { londonMs } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const L = { open: 100, up: { p50: 101, p75: 101.6 }, down: { p50: 99, p75: 98.4 } };   // p50 span 2, p75 span 3.2
const day = '2026-11-04', s0 = londonMs(day, 8) / 1000;
const path = f => Array.from({ length: 780 }, (_, i) => { const p = f(i); return { time: s0 + i * 60, open: p, high: p + 0.05, low: p - 0.05, close: p }; });

t('a quiet range day, extremes split across the sessions', () => {
  const r = realisedShape(path(i => 100 + 0.6 * Math.sin(i / 120)), L, day);
  assert.equal(r.range, 'narrow'); assert.equal(r.type, 'range');
});
t('a wide trend day with both extremes in New York hours', () => {
  const r = realisedShape(path(i => (i < 300 ? 100 : 100 - (i - 300) * 0.008)), L, day);   // flat in London, falls 3.84 after 13:00
  assert.equal(r.range, 'wide'); assert.equal(r.type, 'trend'); assert.equal(r.extremes, 'split');
  const ny = realisedShape(path(i => (i < 300 ? 100 : i < 500 ? 100 + (i - 300) * 0.01 : 102 - (i - 500) * 0.01)), L, day);
  assert.equal(ny.extremes, 'ny');
  assert.equal(realisedShape(path(() => 100).slice(0, 10), L, day), null);
});
t('validation keeps known values and needs half the markets', () => {
  const ok = validateDayForecast({ headline: 'h', markets: Object.fromEntries(DAY_MARKETS.slice(0, 7).map(m => [m, { range: 'wide', type: 'trend', extremes: 'odd', confidence: 'x' }])) });
  assert.ok(ok.ok); assert.equal(ok.value.markets.EURUSD.extremes, null); assert.equal(ok.value.markets.EURUSD.confidence, 'low');
  assert.equal(validateDayForecast({ markets: { EURUSD: { range: 'wide' } } }).ok, false);
});
t('score and record against chance and the most common outcome', () => {
  const sc = scoreDayForecast({ markets: { EURUSD: { range: 'wide', type: 'trend' }, GOLD: { range: 'narrow', type: 'trend' } } }, { EURUSD: { range: 'wide', type: 'range', extremes: 'ny' }, GOLD: { range: 'normal', type: 'trend', extremes: 'ny' } });
  assert.deepEqual(sc.hits.range, { hit: 1, of: 2, share: 0.5 }); assert.equal(sc.hits.type.hit, 1); assert.equal(sc.hits.extremes.of, 0);
  const rec = dayForecastRecord([{ score: sc, realised: { EURUSD: { range: 'wide', type: 'range', extremes: 'ny' }, GOLD: { range: 'normal', type: 'trend', extremes: 'ny' } } }]);
  assert.equal(rec.range.share, 0.5); assert.equal(rec.type.chance, 0.5); assert.deepEqual(rec.extremes.mostCommon, { outcome: 'ny', share: 1 });
});
console.log(`dayForecast: ${n} tests passed`);

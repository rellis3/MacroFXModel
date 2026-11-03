// Tests for js/deskAttribution.js (synthetic bars only).   node js/deskAttribution.test.mjs
import assert from 'node:assert/strict';
import { dayMovesU, layerViews, attribution, attributionRecord } from './deskAttribution.js';
import { londonMs } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const L = { open: 100, up: { p50: 101 }, down: { p50: 99 } };
const D = '2026-11-04';
const path = (a, b) => { const s = londonMs(D, 8) / 1000; return Array.from({ length: 780 }, (_, i) => { const p = a + (b - a) * i / 779; return { time: s + i * 60, open: p, high: p, low: p, close: p }; }); };

// EUR/USD falls 1 u, gold falls 1 u, Nasdaq falls 2 u, USD/JPY rises 0.5 u
const run = {
  head: { ok: true, book: { global: { tone: 'risk_off' }, instruments: {
    EURUSD: { rating: 'SHORT', size: 1, levels: L }, GOLD: { rating: 'LONG', size: 1, levels: L }, NQ: { rating: 'SHORT', size: 0.5, levels: L }, USDJPY: { rating: 'FLAT', size: 0, levels: L } } } },
  debate: {
    global: { view: { tone: 'risk_off' } },
    currency: { view: { currencies: { USD: { bias: 1 }, EUR: { bias: -1 }, JPY: { bias: 2 } } } },
    assets: { fx_majors: { view: { instruments: { EURUSD: { rating: 'SHORT' }, USDJPY: { rating: 'SHORT' } } } }, metals: { view: { instruments: { GOLD: { rating: 'SHORT' } } } }, indices: { view: { instruments: { NQ: { rating: 'SHORT' } } } } },
  },
};
const bars = { EURUSD: path(100, 99), GOLD: path(100, 99), NQ: path(100, 98), USDJPY: path(100, 100.5) };

t('moves in u for every market with levels and bars', () => {
  assert.deepEqual(dayMovesU(run.head.book.instruments, bars, D), { EURUSD: -1, GOLD: -1, NQ: -2, USDJPY: 0.5 });
});

t('each layer takes its own side: tone on risk assets, the currency gap on pairs, minus the dollar on USD-priced markets', () => {
  const v = layerViews(run);
  assert.equal(v.global.NQ, -1); assert.equal(v.global.EURUSD, 0);
  assert.equal(v.currency.EURUSD, -1); assert.equal(v.currency.USDJPY, -1); assert.equal(v.currency.GOLD, -1); assert.equal(v.currency.NQ, 0);
  assert.equal(v.desks.GOLD, -1); assert.equal(v.head.GOLD, 1); assert.equal(v.head.USDJPY, 0);
});

t('attribution: each layer scored on the same moves, and what each step added', () => {
  const a = attribution(run, bars, D, 0.4);
  assert.deepEqual(a.layers.global, { n: 1, score: 2 });              // short NQ, NQ -2 u
  assert.deepEqual(a.layers.currency, { n: 3, score: 0.5 });          // EURUSD +1, USDJPY -0.5, GOLD +1
  assert.deepEqual(a.layers.desks, { n: 4, score: 0.875 });           // EURUSD +1, USDJPY -0.5, GOLD +1, NQ +2
  assert.deepEqual(a.layers.head, { n: 3, score: 0.667 });            // EURUSD +1, GOLD -1 (flipped long), NQ +2
  assert.equal(a.added.desksOverCurrency, 0.375); assert.equal(a.added.headOverDesks, -0.208); assert.equal(a.added.sizingOverHead, -0.267);
  assert.equal(a.headChanges.n, 2, 'gold flipped and USD/JPY dropped');
  assert.match(a.label, /descriptive/);
});

t('the running record averages counted days only', () => {
  const a = attribution(run, bars, D, 0.4);
  const rec = attributionRecord([{ eligible: true, attribution: a }, { eligible: false, attribution: a }, { eligible: true }]);
  assert.equal(rec.days, 1); assert.deepEqual(rec.layers.global, { days: 1, mean: 2, positive: 1 }); assert.equal(rec.added.headOverDesks.mean, -0.208);
});

console.log(`deskAttribution: ${n} tests passed`);

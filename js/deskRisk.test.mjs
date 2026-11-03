// Tests for js/deskRisk.js on synthetic series.   node js/deskRisk.test.mjs
import assert from 'node:assert/strict';
import { standardise, bookRisk } from './deskRisk.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
// a seeded generator so the series are fixed
let s0 = 7; const rnd = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647 - 0.5; };
const dates = Array.from({ length: 61 }, (_, i) => `2026-08-${String(1 + (i % 28)).padStart(2, '0')}-${i}`);
const series = shocks => { let p = 100; return dates.map((d, i) => { if (i) p *= Math.exp(shocks[i - 1] * 0.01); return { date: d, close: p }; }); };
const usd = Array.from({ length: 60 }, rnd), other = Array.from({ length: 60 }, rnd), noise = () => Array.from({ length: 60 }, () => rnd() * 0.2);
// USD/JPY and USD/CHF both follow the dollar; EUR/USD is its mirror; GOLD is unrelated
const add = (a, b) => a.map((x, i) => x + b[i]);
const closes = { USDJPY: series(add(usd, noise())), USDCHF: series(add(usd, noise())), EURUSD: series(add(usd.map(x => -x), noise())), GOLD: series(other) };

t('standardised returns on common dates, sd 1', () => {
  const s = standardise(closes);
  assert.equal(s.names.length, 4); assert.equal(s.dates.length, 60);
  const z = s.z.USDJPY, m = z.reduce((a, b) => a + b, 0) / z.length, v = z.reduce((a, b) => a + (b - m) ** 2, 0) / (z.length - 1);
  assert.ok(Math.abs(v - 1) < 1e-9);
});

t('three long-dollar cards are one bet: effective bets near 1 plus gold; the dollar scenario hits them together', () => {
  const r = bookRisk({ USDJPY: { rating: 'LONG', size: 1 }, USDCHF: { rating: 'LONG', size: 1 }, EURUSD: { rating: 'SHORT', size: 1 }, GOLD: { rating: 'LONG', size: 1 } }, closes);
  assert.ok(r.ok);
  assert.ok(r.effectiveBets > 1.3 && r.effectiveBets < 2.3, `effective bets ${r.effectiveBets}`);
  assert.deepEqual(r.bets[0].cards.sort(), ['EURUSD', 'USDCHF', 'USDJPY']);
  const usdS = r.scenarios.find(x => x.name === 'USD +1σ');
  assert.ok(usdS.pnl > 2.5, `USD +1σ should gain ~3 card-σ, got ${usdS.pnl}`);
  assert.ok(Math.abs(r.contributions.reduce((a, c) => a + c.share, 0) - 1) < 0.05, 'shares sum to 1');
  assert.ok(r.history.worst.pnl < r.history.p05 || r.history.worst.pnl === r.history.p05);
});

t('a hedged book: long USD/JPY against short USD/CHF has little risk', () => {
  const r = bookRisk({ USDJPY: { rating: 'LONG', size: 1 }, USDCHF: { rating: 'SHORT', size: 1 } }, closes);
  assert.ok(r.bookSigma < 0.6, `book σ ${r.bookSigma}`);
});

t('too little: not ok, with the reason; a card with no history is listed', () => {
  const r = bookRisk({ USDJPY: { rating: 'LONG', size: 1 }, NQ: { rating: 'SHORT', size: 1 } }, closes);
  assert.equal(r.ok, false); assert.deepEqual(r.missing, ['NQ']);
});

console.log(`deskRisk: ${n} tests passed`);

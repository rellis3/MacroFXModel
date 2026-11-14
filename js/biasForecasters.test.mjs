// node js/biasForecasters.test.mjs   (forge/BIAS_SCOREBOARD_PREREG.md §3.3-3.4)
import assert from 'node:assert/strict';
import { h4Slope, h4Trend, deskRating, deskCcy, maxSignals, maxWindow, surpriseRule, releaseZ, tier1Of, fundabias, FUNDABIAS_ENABLED, maxInst } from './biasForecasters.js';
import { londonMs } from './directionLedger.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };
const D = '2026-11-13';   // Friday
const by = (vs, inst) => vs.find(v => v.inst === inst);

ok('desk-rating: conviction map, STRONG adds 0.02, cap 0.08, FLAT / REVIEW / missing = no view, missing conviction = medium', () => {
  const book = { instruments: {
    EURUSD: { rating: 'LONG', conviction: 'low' }, GBPUSD: { rating: 'SHORT', conviction: 'high' }, USDJPY: { rating: 'STRONG_SHORT', conviction: 'high' },
    NQ: { rating: 'STRONG_LONG', conviction: 'medium', size: 0 }, SPX500: { rating: 'FLAT', conviction: 'high' }, GOLD: { rating: 'REVIEW' }, US30: { rating: 'LONG' } } };
  const v = deskRating(book, { knowableMs: 1 });
  assert.deepEqual([by(v, 'eurusd').side, by(v, 'eurusd').shift], [1, 0.02]);
  assert.deepEqual([by(v, 'gbpusd').side, by(v, 'gbpusd').shift], [-1, 0.06]);
  assert.equal(by(v, 'usdjpy').shift, 0.08);
  assert.equal(by(v, 'nq').shift, 0.06); assert.equal(by(v, 'nq').speaks, true); assert.equal(by(v, 'nq').inputs.size, 0);
  assert.equal(by(v, 'us30').shift, 0.04);
  for (const i of ['es', 'gold', 'audusd']) assert.equal(by(v, i).speaks, false);
  assert.ok(v.every(x => x.model_id === 'desk-rating' && x.knowable_ms === 1));
});

ok('desk-ccy: score = bias[base] - bias[quote], 0.015 per point, cap 0.06, FX pairs only', () => {
  const v = deskCcy({ currencies: { EUR: { bias: 1 }, USD: { bias: -2 }, JPY: { bias: 2 }, GBP: { bias: -2 }, AUD: { bias: -2 }, CAD: { bias: -2 } } });
  assert.deepEqual([by(v, 'eurusd').side, by(v, 'eurusd').shift], [1, 0.045]);
  assert.deepEqual([by(v, 'usdjpy').side, by(v, 'usdjpy').shift], [-1, 0.06]);
  assert.equal(by(v, 'gbpjpy').shift, 0.06);
  assert.equal(by(v, 'audusd').speaks, false);          // -2 - -2 = 0
  assert.equal(by(v, 'usdcad').speaks, false);
  assert.equal(by(v, 'usdchf').speaks, false);          // CHF missing
  assert.ok(!v.some(x => ['nq', 'es', 'gold', 'us30'].includes(x.inst)));
});

ok('max-signals: first signal in [prev weekday 22:00 UK, 16:00 London], aliases, conflict flag, only inst/side/time/style stored', () => {
  const { fromMs, toMs } = maxWindow(D);
  assert.equal(new Date(fromMs).toISOString(), '2026-11-12T22:00:00.000Z');
  assert.equal(new Date(maxWindow('2026-11-16').fromMs).toISOString(), '2026-11-13T22:00:00.000Z');   // Monday's window opens Friday 22:00
  const s = sec => sec / 1000;
  const recs = [
    { id: 'secret-id', symbol: 'XAUUSD', side: 'SELL', order: 'limit', style: 'day', posted_ts: s(londonMs(D, 9)), entry: 4321.5, sl: 4333.7, tp: 4299.1, text: 'paid text' },
    { id: 'b', symbol: 'GOLD', side: 'BUY', order: 'market', style: 'day', posted_ts: s(londonMs(D, 10)), entry: 4321.9, sl: 4310.3 },
    { id: 'c', symbol: 'US100', side: 'buy', order: 'market', style: 'swing', posted_ts: s(fromMs - 60_000) },     // before the window
    { id: 'd', symbol: 'DJI30', side: 'BUY', order: 'market', style: 'swing', posted_ts: s(fromMs + 60_000) },
    { id: 'e', symbol: 'EURUSD', side: 'SELL', order: 'market', style: 'single', posted_ts: s(toMs + 60_000) },   // after 16:00
    { id: 'f', symbol: 'BTCUSD', side: 'BUY', order: 'market', posted_ts: s(londonMs(D, 9)) },
  ];
  const v = maxSignals(recs, D);
  const g = by(v, 'gold');
  assert.deepEqual([g.speaks, g.side, g.shift, g.knowable_ms, g.flags], [true, -1, 0.05, londonMs(D, 9), ['conflict']]);
  assert.deepEqual(Object.keys(g.inputs).sort(), ['posted_ts', 'side', 'style']);
  const blob = JSON.stringify(v);
  for (const banned of ['secret-id', 'paid text', '4333.7', '4299.1', '4321.5', '4310.3', 'entry', '"sl"', '"tp"', 'order']) assert.ok(!blob.includes(banned), banned);
  assert.equal(by(v, 'us30').side, 1); assert.equal(by(v, 'us30').inputs.style, 'swing');
  assert.equal(by(v, 'nq').speaks, false);
  assert.equal(by(v, 'eurusd').speaks, false);
  assert.equal(maxInst('SPX500'), 'es'); assert.equal(maxInst('ETHUSD'), null);
});

// surprise store: 8 earlier NFP prints with surprises alternating +/-10K, then one big beat
const nfp = (d, actual, estimate) => ({ country: 'US', event: 'Non-Farm Employment Change', ms: londonMs(d, 13, 30), actual, estimate });
const hist = ['2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05', '2026-07-03', '2026-08-07', '2026-09-04', '2026-10-02'].map((d, i) => nfp(d, `${100 + (i % 2 ? 10 : -10)}K`, '100K'));
const store = [...hist, nfp('2026-11-06', '150K', '100K')];

ok('surprise: tier-1 matcher, z against the series own history, polarity applied', () => {
  assert.equal(tier1Of({ country: 'US', event: 'Core CPI m/m' }).core, true);
  assert.equal(tier1Of({ country: 'US', event: 'CPI y/y' }), null);
  assert.equal(tier1Of({ country: 'GB', event: 'CPI m/m' }), null);
  const z = releaseZ(store, store.at(-1));
  assert.ok(z > 4);
  assert.equal(releaseZ(store.slice(5), store.at(-1)), null);   // fewer than 6 earlier surprises
});

ok('surprise: carried after the release with the USD sign map; indices and JPY crosses silent', () => {
  const v = surpriseRule(store, [], '2026-11-12');
  assert.deepEqual([by(v, 'usdjpy').side, by(v, 'usdjpy').shift], [1, 0.05]);
  assert.equal(by(v, 'eurusd').side, -1); assert.equal(by(v, 'gold').side, -1);
  assert.ok(!v.some(x => ['nq', 'es', 'us30', 'gbpjpy', 'eurjpy'].includes(x.inst)));
  assert.ok(v.every(x => x.event_key && x.knowable_ms === londonMs('2026-11-12', 7)));
});

ok('surprise: flat on a release day (calendar), silent when in line or z unknown, core print wins', () => {
  const cal = [{ country: 'US', event: 'CPI m/m', ms: londonMs('2026-11-12', 13, 30), actual: null, estimate: '0.3%' }];
  assert.ok(surpriseRule(store, cal, '2026-11-12').every(x => !x.speaks));
  const inLine = [...hist, nfp('2026-11-06', '101K', '100K')];
  assert.ok(surpriseRule(inLine, [], '2026-11-10').every(x => !x.speaks && x.inputs.state === 'in line'));
  const cpiHist = hist.map(h => ({ ...h, event: 'Core CPI m/m', actual: h.actual === '110K' ? '0.4%' : '0.2%', estimate: '0.3%' }));
  const both = [...store, ...cpiHist, { country: 'US', event: 'CPI m/m', ms: londonMs('2026-11-10', 13, 30), actual: '0.9%', estimate: '0.3%' },
    { country: 'US', event: 'Core CPI m/m', ms: londonMs('2026-11-10', 13, 30), actual: '0.1%', estimate: '0.3%' }];
  const v = surpriseRule(both, [], '2026-11-11');
  assert.equal(by(v, 'usdjpy').side, -1);   // core miss, not the headline beat
  assert.equal(by(v, 'usdjpy').inputs.release, 'Core CPI m/m');
  const fed = [...store, { country: 'US', event: 'Federal Funds Rate', ms: londonMs('2026-11-10', 19), actual: '3.75%', estimate: '3.75%' }];
  assert.ok(surpriseRule(fed, [], '2026-11-11').every(x => !x.speaks));
});

ok('h4-trend: EMA20 slope of 4h closes from closed H1 bars only; +-0.04; silent with too little history', () => {
  const T = londonMs(D, 7) / 1000, t0 = T - 200 * 3600;
  const up = Array.from({ length: 200 }, (_, i) => ({ t: t0 + i * 3600, c: 100 + i * 0.1 }));
  assert.equal(h4Slope(up, T), 1);
  const down = up.map((b, i) => ({ ...b, c: 200 - i * 0.1 }));
  assert.equal(h4Slope(down, T), -1);
  // a bar still open at T is ignored: a huge spike in the bar that opens at T changes nothing
  assert.equal(h4Slope([...down, { t: T - 1800, c: 1e6 }], T), -1);
  assert.equal(h4Slope(up.slice(-40), T), null);
  const v = h4Trend({ eurusd: up, gold: down }, D);
  assert.deepEqual([by(v, 'eurusd').side, by(v, 'eurusd').shift, by(v, 'eurusd').knowable_ms], [1, 0.04, londonMs(D, 7)]);
  assert.equal(by(v, 'gold').side, -1);
  assert.equal(by(v, 'nq').speaks, false);
  assert.equal(v.length, 13);
});

ok('fundabias: disabled, writes nothing', () => {
  assert.equal(FUNDABIAS_ENABLED, false); assert.deepEqual(fundabias(), []);
});

console.log(`\n${passed} passed`);

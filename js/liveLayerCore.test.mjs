// The live layer's maths: EM / index / yield overlays, range used, intraday correlation regime, the price read.
//   node js/liveLayerCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePricing, quotesClosed, overlayEm, overlayIndices, overlayYields, rangeState, corrRegime, priceRead, pricingList, MAJORS, pct } from './liveLayerCore.js';

const NOW = Date.parse('2026-11-12T14:37:00Z');
const quote = (instrument, mid, o = {}) => ({ instrument, time: new Date(NOW).toISOString(), status: 'tradeable', tradeable: true, bids: [{ price: String(mid - 0.0001) }], asks: [{ price: String(mid + 0.0001) }], ...o });

test('parsePricing: mid of bid and ask, tradeable flag, bad rows skipped', () => {
  const px = parsePricing({ prices: [quote('USD_MXN', 18.5), { instrument: 'USD_ZAR' }, quote('USD_TRY', 42, { tradeable: false })] });
  assert.ok(Math.abs(px.USD_MXN.mid - 18.5) < 1e-9);
  assert.equal(px.USD_ZAR, undefined);
  assert.equal(px.USD_TRY.tradeable, false);
  assert.equal(px.USD_MXN.at, NOW);
});

test('quotesClosed: all non-tradeable, or the newest quote is stale', () => {
  const open = parsePricing({ prices: [quote('A_B', 1)] }), shut = parsePricing({ prices: [quote('A_B', 1, { tradeable: false })] });
  assert.equal(quotesClosed(open, NOW), false);
  assert.equal(quotesClosed(shut, NOW), true);
  assert.equal(quotesClosed(open, NOW + 3 * 3600e3), true);
  assert.equal(quotesClosed({}, NOW), null);
});

test('overlayEm: live against the last close and the close five sessions back', () => {
  const spark = [10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6]; // ends at last = 10.6; five back = spark[len-6] = 10.1
  const em = { pairs: { USDMXN: { ok: true, last: 10.6, date: '2026-11-11', spark }, USDZAR: { ok: false } } };
  const px = parsePricing({ prices: [quote('USD_MXN', 10.812), quote('USD_ZAR', 18)] });
  const o = overlayEm(em, px);
  assert.equal(o.ok, true);
  assert.equal(Object.keys(o.pairs).length, 1, 'a pair the board could not build is not overlaid');
  assert.ok(Math.abs(o.pairs.USDMXN.chgLive - 2.0) < 0.01);
  assert.ok(Math.abs(o.pairs.USDMXN.chg5dLive - pct(10.1, 10.812)) < 0.01);
  assert.equal(overlayEm(null, px).ok, false);
});

test('overlayIndices: moves against the last close, small-vs-big and tech-vs-broad in words', () => {
  const refs = { NQ: { close: 100 }, SPX: { close: 100 }, DOW: { close: 100 }, RUT: { close: 100 } };
  const px = parsePricing({ prices: [quote('NAS100_USD', 100.9), quote('SPX500_USD', 100.5), quote('US30_USD', 100.3), quote('US2000_USD', 100.1)] });
  const o = overlayIndices({ refs, px });
  assert.equal(o.ok, true);
  assert.ok(Math.abs(o.rows.NQ.chgPct - 0.9) < 0.01);
  assert.ok(Math.abs(o.smallVsBig - (-0.4)) < 0.011);
  assert.ok(Math.abs(o.techVsBroad - 0.4) < 0.011);
  assert.match(o.line, /small caps are lagging the S&P by 0\.40pp/);
  assert.match(o.line, /Nasdaq is leading by 0\.40pp/);
  const flat = overlayIndices({ refs, px: parsePricing({ prices: [quote('NAS100_USD', 100.5), quote('SPX500_USD', 100.5), quote('US2000_USD', 100.45)] }) });
  assert.match(flat.line, /keeping pace/);
  assert.equal(overlayIndices({ refs: {}, px }).ok, false);
});

test('overlayYields: implied beside official, slopes, Bund gap, shape in words', () => {
  const mv = (now, ref, D = 5) => ({ now, ref, deltaBp: (now - ref) * 100, asOf: '2026-11-12T14:30:00Z', closed: false, D });
  const mvs = { Y_US2: mv(4.00, 4.10), Y_US5: mv(4.10, 4.15), Y_US10: mv(4.35, 4.40), Y_US30: mv(4.70, 4.72), Y_DE10: mv(2.70, 2.72) };
  const official = { Y_US2: { date: '2026-11-11', value: 4.08 }, Y_US10: { date: '2026-11-11', value: 4.41 } };
  const o = overlayYields({ mvs, official });
  assert.equal(o.ok, true);
  assert.equal(o.rows.length, 5);
  const us2 = o.rows.find(r => r.key === 'us2y');
  assert.equal(us2.deltaBp, -10);
  assert.equal(us2.vsOfficialBp, -8);
  assert.equal(us2.official.value, 4.08, 'the official print is shown, never replaced');
  assert.equal(o.slopes.find(s => s.key === '2s10s').nowBp, 35);
  assert.equal(o.slopes.find(s => s.key === '2s10s').deltaBp, 5);
  assert.equal(o.bundGap.nowBp, -165);
  assert.equal(o.shape.key, 'bullsteep');
  assert.match(o.line, /bull steepener/);
  assert.equal(overlayYields({ mvs: {} }).ok, false);
});

const session = (rows) => ({ instruments: Object.fromEntries(Object.entries(rows).map(([k, [hl, med, bars]]) => [k, { hl, forecast: { hl_median: med }, bar_count: bars }])) });
test('rangeState: pace against the square root of the day gone; early hours not judged; errors skipped', () => {
  const s = session({ EURUSD: [0.60, 0.60, 12], GBPUSD: [0.15, 0.60, 12], USDJPY: [0.45, 0.60, 12], AUDUSD: [0.2, 0.5, 1] });
  s.instruments.NZDUSD = { error: 'No bars since midnight' };
  const o = rangeState(s), by = Object.fromEntries(o.rows.map(r => [r.name, r]));
  assert.equal(by.EURUSD.state, 'active');          // used 1.0 over half the day: pace 1.41
  assert.equal(by.GBPUSD.state, 'quiet');           // used 0.25: pace 0.35
  assert.equal(by.USDJPY.state, 'normal');          // used 0.75: pace 1.06
  assert.equal(by.AUDUSD.state, 'early');
  assert.equal(by.AUDUSD.pace, null);
  assert.equal(by.NZDUSD, undefined);
  assert.equal(o.counts.active, 1); assert.equal(o.counts.quiet, 1);
  assert.equal(o.market, 'mixed');
  assert.match(o.line, /A mix/);
  assert.equal(rangeState(session({ EURUSD: [0.2, 0.6, 1] })).market, null);
  assert.match(rangeState(session({ EURUSD: [0.2, 0.6, 1] })).line, /Too early/);
  assert.equal(rangeState(null).ok, false);
  const quiet = rangeState(session({ A: [0.1, 0.6, 12], B: [0.2, 0.6, 12], C: [0.9, 0.6, 12] }));
  assert.equal(quiet.market, 'quiet'); assert.match(quiet.line, /not that there is no direction/);
});

// deterministic hourly bars for the majors: a shared factor plus own noise; `shared` sets how much of each pair is the common move
function hourly(shared, { hours = 700, seed = 1 } = {}) {
  let x = seed; const rnd = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296 - 0.5; };
  const out = Object.fromEntries(MAJORS.map(p => [p, []])), lv = Object.fromEntries(MAJORS.map(p => [p, 1])), t0 = NOW - hours * 3600e3;
  for (let h = 0; h < hours; h++) {
    const f = rnd(), k = h > hours - 120 ? shared.recent : shared.before;                       // the last five days use `recent`
    for (const p of MAJORS) { const sign = p.startsWith('USD_') ? -1 : 1; lv[p] *= Math.exp(0.001 * (sign * k * f * 2 + (1 - k) * rnd() * 2)); out[p].push({ t: t0 + h * 3600e3, c: lv[p] }); }
  }
  return out;
}
test('corrRegime: HIGH when the last five days are far more correlated than before, LOW for the reverse, NORMAL when steady', () => {
  const high = corrRegime(hourly({ recent: 0.95, before: 0.4 }));
  assert.equal(high.ok, true); assert.equal(high.state, 'HIGH'); assert.ok(high.pctile >= 80); assert.equal(high.pairs, 21);
  const low = corrRegime(hourly({ recent: 0.05, before: 0.6 }));
  assert.equal(low.state, 'LOW');
  const steady = corrRegime(hourly({ recent: 0.5, before: 0.5 }, { seed: 7 }));
  assert.equal(steady.state, 'NORMAL');
  assert.match(high.basis, /not the daily regime/);
  assert.equal(corrRegime({}).ok, false);
  assert.equal(corrRegime({ EUR_USD: [{ t: 1, c: 1 }] }).ok, false);
});

const strength = (h4, d1) => ({ ok: true, horizons: Object.fromEntries([['4H', h4], ['1D', d1]].map(([k, sc]) => [k, { available: true, scores: Object.entries(sc).map(([ccy, score]) => ({ ccy, score })).sort((a, b) => b.score - a.score) }])) });
test('priceRead: firm / soft / mixed from 4H and 1D, compared with the dawn read by sign only', () => {
  const s = strength({ USD: -0.8, EUR: 0.9, JPY: 0.6, GBP: 0.1 }, { USD: -0.6, EUR: 0.7, JPY: -0.9, GBP: 0.2 });
  const o = priceRead({ strength: s, analyst: { USD: { bias: 2 }, EUR: { bias: 1 }, JPY: { bias: -1 }, GBP: { bias: 1 } } });
  const by = Object.fromEntries(o.rows.map(r => [r.ccy, r]));
  assert.equal(by.USD.read, 'soft'); assert.equal(by.USD.state, 'disagree');
  assert.equal(by.EUR.read, 'firm'); assert.equal(by.EUR.state, 'agree');
  assert.equal(by.JPY.read, 'mixed'); assert.equal(by.JPY.state, 'open');
  assert.equal(by.GBP.read, 'mixed');
  assert.deepEqual(o.disagree, ['USD']);
  assert.match(o.line, /USD: the dawn read leans firm, but in prices it has been soft/);
  assert.doesNotMatch(o.line, /buy|sell|long|short|trade/i, 'descriptive wording only');
  const none = priceRead({ strength: s, analyst: {} });
  assert.equal(none.rows[0].state, 'no-analyst'); assert.match(none.line, /No currency where/);
  assert.equal(priceRead({ strength: { ok: true, horizons: { '4H': { available: false } } } }).ok, false);
  assert.equal(priceRead({ strength: null }).ok, false);
  // one window missing: say which and why, and read from the other alone
  const only4 = priceRead({ strength: { ...s, horizons: { '4H': s.horizons['4H'], '1D': { available: false, reason: 'only 0 of 28 pairs had prices and a normal move for 1D' } } }, analyst: { USD: { bias: 2 }, EUR: { bias: 1 } } });
  assert.equal(only4.ok, true); assert.match(only4.partial, /1D window is missing \(only 0 of 28 pairs/); assert.match(only4.partial, /4H window alone/);
  const u = only4.rows.find(r => r.ccy === 'USD'); assert.equal(u.s1d, null); assert.equal(u.read, 'soft'); assert.equal(u.state, 'disagree'); assert.match(only4.line, /USD: the dawn read leans firm, but in prices it has been soft \(4H −0\.8σ\)/);
  const only1 = priceRead({ strength: { ...s, horizons: { '1D': s.horizons['1D'], '4H': { available: false, reason: 'no hourly prices yet' } } }, analyst: {} });
  assert.equal(only1.ok, true); assert.match(only1.partial, /4H window is missing \(no hourly prices yet\).*1D window alone/);
  assert.equal(priceRead({ strength: s }).partial, null, 'both windows: no note');
  const both = priceRead({ strength: { ok: true, horizons: { '4H': { available: false, reason: 'a' }, '1D': { available: false, reason: 'b' } } } });
  assert.equal(both.ok, false); assert.match(both.error, /neither the 4H nor the 1D window has prices yet \(4H: a; 1D: b\)/);
});

test('pricingList: every instrument the overlay needs, in one call', () => {
  const l = pricingList();
  assert.ok(l.includes('USD_MXN') && l.includes('NAS100_USD') && l.includes('US2000_USD'));
  assert.equal(new Set(l).size, l.length);
});

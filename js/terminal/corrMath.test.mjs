// The Correlations & hedges tab: its maths (corrMath.js), its Evidence Book chips (corrEvidence.js) and the HTML
// builders of corrView.js / hedgeView.js on a synthetic panel.   node js/terminal/corrMath.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './corrMath.js';
import { chipFor, chipsFor, VIEW_EVIDENCE } from './corrEvidence.js';
import { heatmapSvg, changesHtml, corrColor, asOfHtml, regimeTableHtml } from './corrView.js';
import { rowHtml, bookCards, carryOf, bookHedgeHtml, html as hedgeHtml } from './hedgeView.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

// a seeded generator so the synthetic markets are the same every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** n days of closes for EURUSD (driver), GBPUSD (+ with EUR), USDCHF (− with EUR), GOLD (flips sign half way), SPX500
 *  (independent), and the other USD legs; regime trend on every day. */
function panel(n = 400) {
  const g = gauss(rng(7)), dates = [], c = { EURUSD: [1.1], GBPUSD: [1.3], USDCHF: [0.9], XAUUSD: [2000], SPX500_USD: [5000], USDJPY: [150], AUDUSD: [0.65], NZDUSD: [0.6], USDCAD: [1.35], WTICO_USD: [70] };
  const d0 = Date.UTC(2024, 0, 1);
  for (let i = 0, k = 0; dates.length < n; k++) { const d = new Date(d0 + k * 864e5); if (d.getUTCDay() % 6 === 0) continue; dates.push(d.toISOString().slice(0, 10)); i++; }
  for (let i = 1; i < n; i++) {
    const e = g() * 0.005, z = () => g() * 0.005;
    const step = (k, r) => c[k].push(c[k].at(-1) * Math.exp(r));
    step('EURUSD', e); step('GBPUSD', 0.9 * e + 0.3 * z()); step('USDCHF', -0.8 * e + 0.4 * z());
    step('XAUUSD', (i < n / 2 ? 0.8 : -0.8) * e + 0.4 * z()); step('SPX500_USD', z());
    for (const k of ['USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'WTICO_USD']) step(k, z());
  }
  c.SPX500_USD[10] = null;   // a holiday
  return { generated: '2026-11-06T10:00:00Z', syms: Object.keys(c), dates, closes: c, trend: dates.map((_, i) => (i % 3 === 0 ? 'BULL' : i % 3 === 1 ? 'RANGE' : 'BEAR')), to: dates.at(-1) };
}
const P = panel(), S = M.series(P);

test('series: terminal ids, log returns with nulls around a missing close', () => {
  assert.ok(S.ids.includes('GOLD') && S.ids.includes('SPX500') && S.ids.includes('WTI') && S.ids.includes('EURUSD'));
  assert.equal(S.ret.EURUSD[0], null);
  assert.equal(S.ret.SPX500[10], null); assert.equal(S.ret.SPX500[11], null);
  assert.ok(Math.abs(S.ret.EURUSD[5] - Math.log(P.closes.EURUSD[5] / P.closes.EURUSD[4])) < 1e-12);
  assert.deepEqual(M.toReturns([1, null, 2, 4]).map(v => v == null ? null : +v.toFixed(4)), [null, null, null, 0.6931]);
});

test('corrWin: pairwise-complete Pearson, null when thin', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], y = x.map(v => -2 * v + 1);
  assert.equal(+M.corrWin(x, y, 9, 10).toFixed(6), -1);
  assert.equal(M.corrWin(x, y, 9, 10, 11), null);
  assert.equal(M.corrWin(x, x.map(() => 3), 9, 10), null);   // no variance
  const yn = [...y]; yn[2] = null; assert.equal(+M.corrWin(x, yn, 9, 10, 8).toFixed(6), -1);
});

test('retOf: crosses from USD legs, currency baskets, the dollar index', () => {
  const eurchf = M.retOf(S, 'EURCHF'), i = 50;
  assert.ok(Math.abs(eurchf[i] - (S.ret.EURUSD[i] + S.ret.USDCHF[i])) < 1e-12);   // EUR/CHF = EUR/USD x USD/CHF
  assert.equal(M.retOf(S, 'EURSEK'), null);     // no SEK leg
  assert.equal(M.retOf(S, 'XYZ*'), null);
  const usd = M.retOf(S, 'USD*'), eur = M.retOf(S, 'EUR*');
  const sum = M.CCY8.reduce((s, c) => s + M.retOf(S, `${c}*`)[i], 0);
  assert.ok(Math.abs(sum) < 1e-12, 'the eight baskets sum to zero');
  assert.ok(usd[i] != null && eur[i] != null);
  assert.ok(M.corrAt(S, 'DXY', 'EURUSD', 120) < -0.8, 'the dollar index moves against EUR/USD');
  assert.equal(M.retOf(S, 'EURCHF'), eurchf, 'cached');
});

test('matrix: symmetric, unit diagonal, signs as built', () => {
  const mx = M.matrix(S, ['EURUSD', 'GBPUSD', 'USDCHF', 'SPX500'], 60);
  assert.equal(mx.m[0][0], 1); assert.equal(mx.m[0][1], mx.m[1][0]);
  assert.ok(mx.m[0][1] > 0.7); assert.ok(mx.m[0][2] < -0.6); assert.ok(Math.abs(mx.m[0][3]) < 0.35);
  assert.equal(M.matrix(S, ['EURUSD', 'NOPE'], 60).m[0][1], null);
});

test('changes vs 120d: gold flipped against the euro is the biggest change and is labelled', () => {
  assert.equal(M.changeLabel(0.6, -0.5), 'flipped');
  assert.equal(M.changeLabel(0.7, 0.4), 'strengthening');
  assert.equal(M.changeLabel(-0.2, -0.5), 'weakening');
  assert.equal(M.changeLabel(0.3, 0.25), 'steady');
  assert.equal(M.changeLabel(null, 0.2), 'n/a');
  // half way through gold turns from +0.8 to -0.8 against the euro: 25 days after the turn the 20d is negative, the 120d still positive
  const end = Math.floor(P.dates.length / 2) + 25;
  const ch = M.changes(S, ['EURUSD', 'GBPUSD', 'GOLD'], { w: 20, end, top: 3 });
  assert.ok(ch[0].b === 'GOLD' || ch[0].a === 'GOLD');
  assert.equal(ch[0].label, 'flipped'); assert.ok(ch[0].now < 0 && ch[0].base > 0);
});

test('rolling + stability: the sign-held share and its band', () => {
  const r = M.rolling(S, 'EURUSD', 'GBPUSD', 60, { from: 100 });
  assert.equal(r.at(-1).i, S.n - 1); assert.ok(r.every(p => p.v > 0.5));
  const st = M.stability(S, 'EURUSD', 'GBPUSD', 60);
  assert.equal(st.share, 1); assert.ok(st.p10 <= st.p90 && st.p10 > 0.5);
  const g = M.stability(S, 'EURUSD', 'GOLD', 60, { end: Math.floor(S.n / 2) + 80, lookback: 250 });
  assert.ok(g.share > 0.2 && g.share < 0.8, `gold's sign held ${g.share}`);
  assert.equal(M.stabilityOf([1, 2], [2, 1], 60, { end: 1 }).share, null);
});

test('hedgeScore and rankHedges: |corr| x stability, the offsetting side and the min-variance ratio', () => {
  assert.equal(M.hedgeScore(-0.8, 0.5), 0.4); assert.equal(M.hedgeScore(null, 1), 0);
  const rows = M.rankHedges(S, 'EURUSD', S.ids, { w: 60 });
  assert.equal(rows[0].id, 'GBPUSD'); assert.equal(rows[0].side, 'short');
  const chf = rows.find(r => r.id === 'USDCHF'); assert.equal(chf.side, 'long');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
  const sdT = M.sdWin(S.ret.EURUSD, S.n - 1, 60), sdC = M.sdWin(S.ret.GBPUSD, S.n - 1, 60);
  assert.ok(Math.abs(rows[0].ratio - Math.abs(rows[0].rho) * sdT / sdC) < 1e-12);
  assert.ok(Math.abs(rows[0].varCut - rows[0].rho ** 2) < 1e-12);
  assert.ok(!rows.some(r => r.id === 'EURUSD'));
  assert.ok(M.rankHedges(S, 'EURUSD', S.ids, { w: 60, inverseOnly: true }).every(r => r.rho < 0));
});

test('book hedge: biggest net exposure, pairs containing that currency left out', () => {
  assert.deepEqual(M.biggestExposure({ after: { USD: 4, EUR: -3.6, NOK: 9 } }), { ccy: 'USD', net: 4 });
  assert.deepEqual(M.biggestExposure({ after: { EUR: -3.6, GBP: 1 } }), { ccy: 'EUR', net: -3.6 });
  assert.equal(M.biggestExposure({ after: { USD: 0 } }), null);
  const bh = M.bookHedges(S, { after: { USD: 4 } }, S.ids, { w: 60 });
  assert.equal(bh.ccy, 'USD');
  assert.ok(bh.rows.every(r => !/USD/.test(r.id) || !/^[A-Z]{6}$/.test(r.id)), 'no USD pair');
  assert.ok(bh.rows.some(r => r.id === 'GOLD' || r.id === 'SPX500' || r.id === 'WTI'), 'dollar-priced markets stay in');
  assert.deepEqual(M.legsOf('EURUSD'), ['EUR', 'USD']); assert.deepEqual(M.legsOf('GOLD'), ['USD']); assert.deepEqual(M.legsOf('USD*'), ['USD']);
});

test('factors: betas, the dominant factor and r² shares', () => {
  const [eur, spx] = M.factorBoard(S, ['EURUSD', 'SPX500'], { w: 120 });
  assert.equal(eur.dom, 'DXY'); assert.ok(eur.f.DXY.beta < 0);
  assert.ok(Math.abs(Object.values(eur.shares).reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.equal(spx.f.RISK.self, true); assert.equal(spx.shares.RISK, undefined);
  const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], x = y.map(v => v / 2);
  assert.ok(Math.abs(M.betaWin(y, x, 9, 10).beta - 2) < 1e-9);
  const bs = M.betaSeries(S, 'EURUSD', M.FACTORS[0], 60, { from: S.n - 100, step: 7 });
  assert.equal(bs.at(-1).i, S.n - 1);
});

test('regimes: point-in-time vol terciles, runs, conditional correlation', () => {
  const vr = M.volRegime(S, { minLook: 60, look: 120 });
  assert.equal(vr.length, S.n); assert.equal(vr[30], null);
  assert.ok(vr.filter(Boolean).every(v => ['LOW', 'MID', 'HIGH'].includes(v)));
  // point-in-time: changing a later return does not change an earlier label
  const S2 = M.series(P); S2.ret.SPX500 = [...S2.ret.SPX500]; S2.ret.SPX500[S.n - 1] = 0.5; S2.cache.clear();
  assert.deepEqual(M.volRegime(S2, { minLook: 60, look: 120 }).slice(0, S.n - 1), vr.slice(0, S.n - 1));
  assert.deepEqual(M.regimeRuns(['A', 'A', null, 'B', 'B', 'A']), [{ from: 0, to: 1, label: 'A' }, { from: 3, to: 4, label: 'B' }, { from: 5, to: 5, label: 'A' }]);
  const c = M.condCorr(S, 'EURUSD', 'GBPUSD', S.trend, ['BULL', 'RANGE', 'BEAR']);
  assert.ok(c.BULL.r > 0.6 && c.BULL.n > 100);
  const tbl = M.regimeTable(S, [['EURUSD', 'GBPUSD'], ['EURUSD', 'GOLD']], S.trend, ['BULL', 'RANGE', 'BEAR']);
  assert.equal(tbl.length, 2); assert.ok(tbl[0].spread >= tbl[1].spread);
});

test('evidence chips: real entries, verdict words, UNTESTED for the hedges', () => {
  for (const v of Object.values(VIEW_EVIDENCE)) for (const [id] of v.ids ?? []) assert.ok(DESK_EVIDENCE.some(e => e.id === id), `${id} is in the Evidence Book`);
  assert.match(chipsFor('hedges'), /UNTESTED/);
  assert.equal(chipsFor('signals'), '');   // the hedge-signals card was retired on 2026-11-06
  assert.match(chipFor('fx-dollar-funding-exposure-hit'), /TESTED: NULL/);
  assert.match(chipFor('rule-a-portfolio-budget'), /UNDERPOWERED/);
  assert.equal(chipFor('no-such-entry'), '');
  assert.doesNotMatch(chipsFor('hedges'), /VALIDATED/);
});

test('views: escaped, no raw input reaches the HTML', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const mx = { ids: ['EURUSD', bad], m: [[1, 0.5], [0.5, 1]], w: 60 };
  const svg = heatmapSvg(mx, { marks: { [`EURUSD|${bad}`]: 'flipped' } });
  assert.doesNotMatch(svg, /<img/); assert.match(svg, /&lt;img/); assert.match(svg, /⇄/);
  assert.doesNotMatch(changesHtml([{ a: bad, b: 'GOLD', now: 0.5, base: -0.4, label: bad }], 20), /<img/);
  assert.doesNotMatch(rowHtml({ id: bad, rho: -0.5, side: 'long', share: 0.8, p10: -0.7, p90: -0.2, ratio: 1.2, varCut: 0.25 }), /<img/);
  assert.doesNotMatch(asOfHtml({ ok: true, refreshEveryH: bad, panel: { generated: bad, to: bad, syms: [], dates: [] } }), /<img/);
  assert.doesNotMatch(regimeTableHtml([{ a: bad, b: 'X', c: { LOW: { r: 0.1, n: 3 } }, spread: 0.1 }], { labels: ['LOW'] }, { LOW: 3 }), /<img/);
  const hv = hedgeHtml(S, { win: 60 });   // the hedges sub-view keeps the finder and the book hedge, not the retired signals card
  assert.match(hv, /Hedge finder/); assert.match(hv, /Book hedge/);
  assert.doesNotMatch(hv, /hedge-signals|hedge-backtest|ct-sig/);
  assert.match(corrColor(0.9), /^rgb\(/); assert.equal(corrColor(null), '#111833');
});

test('hedge view helpers: book cards, carry sign, book hedge text', () => {
  const D = { cards: { EURUSD: { rating: 'SHORT', size: 0.25 }, EURGBP: { rating: 'SHORT', size: 1 }, GBPUSD: { rating: 'FLAT' }, EURAUD: { rating: 'LONG', size: 0.4 } } };
  assert.deepEqual(bookCards(D).map(c => `${c.id}${c.side}`), ['EURGBP-1', 'EURAUD1', 'EURUSD-1']);
  const cv = { rates: { USD: 4, JPY: 1.2 } };
  assert.ok(Math.abs(carryOf('USDJPY', 1, cv) - 2.8) < 1e-9); assert.ok(Math.abs(carryOf('USDJPY', -1, cv) + 2.8) < 1e-9);
  assert.equal(carryOf('GOLD', 1, cv), null);
  assert.match(bookHedgeHtml({ ccy: 'USD', net: 4, rows: [] }, { cap: 4, before: { USD: 8 }, after: { USD: 4 } }, 60), /long USD \+4\.0.*before the ±4 cap/s);
  assert.match(bookHedgeHtml(null, null, 60), /No desk book/);
});

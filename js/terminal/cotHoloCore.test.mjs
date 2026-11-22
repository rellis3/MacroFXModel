// node js/terminal/cotHoloCore.test.mjs: the POSITIONING TERRAIN core (parse the real /api/desk-cot-history shape, the cot-extremes percentile, scaling, layout, the SHOW line).
import assert from 'node:assert/strict';
import { parseCot, pctRank, ordinal, sg, fmtDate, releaseOf, scaleOf, heightOf, windowRanks, toneOf, layoutX, extremes, cardOf, cotScript, cotFigure, placeBox, MIN_HISTORY } from './cotHoloCore.js';

let n = 0; const t = (name, f) => { f(); n++; };
const weeks = k => { const out = [], t0 = Date.parse('2026-11-17T00:00:00Z'); for (let i = k - 1; i >= 0; i--) out.push(new Date(t0 - i * 7 * 864e5).toISOString().slice(0, 10)); return out; };
const W = weeks(156);
const ser = (f, d = W) => ({ dates: d, specShare: d.map((_, i) => f(i)) });

t('pctRank follows _worker.js: share of PRIOR values strictly below, rounded; null under 52 weeks', () => {
  const prior = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(pctRank(prior, 50), 50); assert.equal(pctRank(prior, 1000), 100); assert.equal(pctRank(prior, -1), 0);
  assert.equal(pctRank(prior.slice(0, MIN_HISTORY - 2), 5), null);           // 50 prior + current = 51 < 52
  assert.equal(pctRank(prior.slice(0, MIN_HISTORY - 1), 5), 10);             // 51 + 1 = 52: ranked
  assert.equal(pctRank([1, NaN, null, 2, ...prior], null), null);
});

t('parse: the real route shape, sorted by group, current / percentile / 4-week change in points', () => {
  const resp = { ok: true, error: null, series: {
    GOLD: { label: 'GOLD', ...ser(i => 10 + i * 0.2) },                 // rising: today is the top -> 100th
    EUR: { label: 'EUR', ...ser(i => 20 - i * 0.2) },                   // falling: today is the bottom -> 0th
    JPY: { label: 'JPY', ...ser(i => (i % 2 ? 5 : -5)) },
    ZZZ: { label: 'MYSTERY', ...ser(() => 1) },
  } };
  const M = parseCot(resp);
  assert.equal(M.error, null); assert.equal(M.weeks.length, 156); assert.equal(M.report, '2026-11-17');
  assert.deepEqual(M.markets.map(m => m.sym), ['EUR', 'JPY', 'GOLD', 'ZZZ']);
  const g = M.markets.find(m => m.sym === 'GOLD'), e = M.markets.find(m => m.sym === 'EUR'), j = M.markets.find(m => m.sym === 'JPY');
  assert.equal(g.pct, 100); assert.equal(g.ext, 'long'); assert.ok(Math.abs(g.chg4 - 0.8) < 1e-9);
  assert.equal(e.pct, 0); assert.equal(e.ext, 'short'); assert.ok(Math.abs(e.chg4 + 0.8) < 1e-9);
  assert.equal(j.flip, true); assert.equal(j.name, 'USD/JPY');
  assert.equal(M.markets.at(-1).group, 'other'); assert.equal(M.hasAm, false);
});

t('parse: missing fields, junk values, empty, error passthrough; never throws', () => {
  assert.equal(parseCot(null).markets.length, 0); assert.ok(parseCot(null).error);
  assert.equal(parseCot({ ok: false, series: {}, error: 'no COT series cached yet' }).error, 'no COT series cached yet');
  const M = parseCot({ series: { EUR: { dates: ['2026-11-10', 'bad', '2026-11-17'], specShare: ['3.5', 'x', null] }, GBP: { label: 'GBP' }, CAD: { dates: ['2026-11-17'], specShare: [NaN] } } });
  assert.deepEqual(M.markets.map(m => m.sym), ['EUR']); assert.equal(M.markets[0].cur, 3.5); assert.equal(M.markets[0].pct, null); assert.equal(M.markets[0].chg4, null);
  assert.equal(M.markets[0].stale, false); assert.equal(M.report, '2026-11-10');   // the null week is not a report
});

t('parse: a carried (older) market is marked stale; amShare is read when present', () => {
  const short = W.slice(0, -2);
  const M = parseCot({ series: { EUR: { label: 'EUR', ...ser(i => i), amShare: W.map(() => -20) }, CAD: { label: 'CAD', ...ser(i => i, short) } } });
  const cad = M.markets.find(m => m.sym === 'CAD'), eur = M.markets.find(m => m.sym === 'EUR');
  assert.equal(cad.stale, true); assert.equal(cad.spec.at(-1), null); assert.equal(eur.stale, false);
  assert.equal(M.hasAm, true); assert.equal(eur.amCur, -20); assert.equal(eur.amPct, 0);
  assert.ok(cardOf(M, 'EUR').lines.some(([, s]) => /opposite side/.test(s)));
});

t('scale and heights: quantile scale, linear heights, capped values marked', () => {
  const ms = [{ spec: [1, 2, 3, 100] }, { spec: [-4, null, NaN] }];
  assert.equal(scaleOf(ms, 0.5), 5); assert.equal(scaleOf([]), 5); assert.equal(scaleOf(ms, 1), 100);
  assert.deepEqual(heightOf(10, 20), { h: 0.5, capped: false }); assert.deepEqual(heightOf(-40, 20), { h: -1, capped: true }); assert.deepEqual(heightOf(null, 20), { h: 0, capped: false });
});

t('window ranks and tones are smooth and bounded', () => {
  const r = windowRanks([3, 1, 2, null, 5]).map(v => (v == null ? v : Math.round(v * 100) / 100)); assert.deepEqual(r, [66.67, 0, 33.33, null, 100]);
  assert.deepEqual(windowRanks([1]), [null]);
  assert.equal(toneOf(50).gold, 0); assert.equal(toneOf(90).gold, 1); assert.equal(toneOf(10).gold, 1); assert.equal(toneOf(0).bright, 1);
  let prev = 0; for (let p = 50; p <= 100; p += 1) { const g = toneOf(p).gold; assert.ok(g >= prev && g - prev < 0.25); prev = g; }   // no jumps
  assert.equal(toneOf(null).gold, 0);
});

t('layout: groups separated, centred, labelled', () => {
  const L = layoutX([{ group: 'fx' }, { group: 'fx' }, { group: 'metals' }], 8, 1);
  assert.equal(L.x[0], -4); assert.equal(L.x[2], 4); assert.ok(L.x[2] - L.x[1] > L.x[1] - L.x[0]);
  assert.deepEqual(L.groups.map(g => g.name), ['FX', 'METALS']);
  assert.deepEqual(layoutX([]).x, []);
});

t('dates, ordinals, signs', () => {
  assert.equal(ordinal(1), '1st'); assert.equal(ordinal(12), '12th'); assert.equal(ordinal(93), '93rd'); assert.equal(ordinal(null), '–');
  assert.equal(sg(-4), '−4.0'); assert.equal(sg(2.25, 1), '+2.3'); assert.equal(fmtDate('2026-11-17'), '17 Nov 2026'); assert.equal(fmtDate('junk'), '–');
  assert.equal(releaseOf('2026-11-17'), '2026-11-20'); assert.equal(releaseOf('x'), null);
});

t('extremes, card, SHOW line and figure', () => {
  const M = parseCot({ series: { GOLD: ser(i => 10 + i * 0.2), EUR: ser(i => 20 - i * 0.2), WTI: ser(i => (i > 153 ? -10 : 5 + Math.sin(i))), ES: ser(i => Math.sin(i / 7) * 2) } });
  const E = extremes(M.markets); assert.equal(E.topLong.sym, 'GOLD'); assert.equal(E.topShort.sym, 'EUR'); assert.equal(E.shift.sym, 'WTI');
  const s = cotScript(M); assert.match(s, /Tuesday 17 November, released on Friday 20 November/); assert.match(s, /gold, at the top of its own range/); assert.match(s, /the euro, at the bottom of its own range/); assert.match(s, /crude oil/);
  assert.match(s, /description only, not a forecast/); assert.doesNotMatch(s, /\bwill\b|expect|target/i);
  assert.deepEqual(cotFigure(M).value, '100th');
  assert.equal(cotScript(parseCot(null)), null); assert.equal(cotFigure(null), null); assert.equal(cardOf(M, 'NOPE'), null);
  assert.ok(cardOf(M, 'GOLD').lines[1][1].includes('100th percentile'));
});

t('placeBox avoids overlaps and bounds', () => {
  const taken = [{ x: 0, y: 0, w: 50, h: 20 }];
  assert.equal(placeBox([{ x: 10, y: 5, w: 20, h: 10 }], taken), null);
  assert.deepEqual(placeBox([{ x: 10, y: 5, w: 20, h: 10 }, { x: 100, y: 5, w: 20, h: 10 }], taken), { x: 100, y: 5, w: 20, h: 10 });
  assert.equal(placeBox([{ x: 500, y: 5, w: 20, h: 10 }], taken, { x0: 0, y0: 0, x1: 300, y1: 300 }), null);
});

console.log(`cotHoloCore: ${n} tests passed`);

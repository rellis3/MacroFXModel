// js/terminal/jarvisVolCore.test.mjs: the VOL terrain is point-in-time, clipped, weekday-only and fails soft; the script speaks only the real numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTerrain, dailyRanges, rangePct, vixCurve, volScript, VOL_MARKETS, CLIP } from './jarvisVolCore.js';

const day = i => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ date: day(i), r: f(i) }));
const data = (k, n, f) => Object.fromEntries(VOL_MARKETS.slice(0, k).map(m => [m.key, series(n, f)]));

test('rangePct is the high-low range over the mid, null on junk', () => {
  assert.equal(rangePct({ high: '102', low: '98' }), 4);
  assert.equal(rangePct({ high: 'x', low: 1 }), null);
  assert.equal(rangePct({ high: 1, low: 2 }), null);
});
test('dailyRanges drops weekends and the session in progress, sorted', () => {
  const vals = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'].reverse().map(d => ({ datetime: d + ' 00:00:00', high: 11, low: 10 }));
  assert.deepEqual(dailyRanges({ values: vals }, '2026-11-17').map(x => x.date), ['2026-11-13', '2026-11-16']);
  assert.deepEqual(dailyRanges(null), []);
});
test('a day is measured against the PREVIOUS days only and clipped at CLIP', () => {
  const T = buildTerrain(data(4, 40, i => (i === 35 ? 50 : 1)), { sessions: 30 });
  assert.equal(T.ns, 30); assert.equal(T.nm, 4);
  const j = T.dates.indexOf(day(35));
  assert.equal(T.Z[j * T.nm], CLIP);
  assert.equal(T.Z[(j + 1) * T.nm], 1);
  assert.equal(T.peaks[0].v, CLIP); assert.equal(T.peaks[0].date, day(35));
  assert.equal(T.stretched, 0);
});
test('too little data fails soft', () => {
  assert.equal(buildTerrain({}), null);
  assert.equal(buildTerrain(data(2, 40, () => 1)), null);
  assert.equal(volScript(null), null);
});
test('the script uses the real numbers and the VIX inversion', () => {
  const T = buildTerrain(data(5, 40, i => (i === 39 ? 2 : 1)), { sessions: 30 });
  assert.equal(T.stretched, 5);
  const txt = volScript(T, vixCurve({ vix: [{ date: 'd', value: 25 }], vix3m: [{ date: 'd', value: 24 }] }));
  assert.match(txt, /5 of 5 markets/); assert.match(txt, /inverted/); assert.match(txt, /not a forecast/);
  assert.match(volScript(T, vixCurve({ vix: [{ date: 'd', value: 15 }], vix3m: [{ date: 'd', value: 18 }] })), /sloping upward/);
  assert.equal(vixCurve({}), null);
});
test('volShowAct runs sweep -> rise -> over, and groupColumns puts a ravine between asset classes', async () => {
  const { volShowAct, groupColumns } = await import('./jarvisVolCore.js');
  assert.equal(volShowAct(0).act, 'sweep'); assert.equal(volShowAct(0).k, 0); assert.equal(volShowAct(0.25).act, 'sweep'); assert.equal(volShowAct(0.6).act, 'rise'); assert.equal(volShowAct(1).act, 'over'); assert.equal(volShowAct(1).k, 1); assert.equal(volShowAct('x').act, 'sweep');
  const g = groupColumns([{ group: 'a' }, { group: 'a' }, { group: 'b' }]); assert.deepEqual(g.cols, [0, 1, -1, 2]); assert.deepEqual(g.at, [0, 1, 3]); assert.deepEqual(groupColumns(null).cols, []);
});

test('the BRIEF read: our markets running hot or quiet over five sessions, described, with no stop or size advice', async () => {
  const { volBrief, recentRange } = await import('./jarvisVolCore.js');
  const markets = [{ key: 'GOLD' }, { key: 'NQ' }, { key: 'USDJPY' }, { key: 'WTI' }], nm = 4, ns = 6, Z = new Float32Array(nm * ns).fill(1);
  for (let j = 1; j < ns; j++) { Z[j * nm] = 2; Z[j * nm + 2] = 0.6; }
  const T = { markets, nm, ns, Z };
  assert.deepEqual(recentRange(T).map(x => x.key), ['GOLD', 'NQ', 'USDJPY']);
  const t = volBrief(T, { ratio: 1.05, inverted: true });
  assert.match(t, /gold at 2\.0 times has run above its normal range/); assert.match(t, /Quiet: Dollar Yen at 0\.6 times/); assert.match(t, /VIX curve is inverted/);
  assert.doesNotMatch(t, /stops?\b|size\b|breakout|on edge|allow for/i, 'Helix review 0.2: description, never advice');
  assert.equal(volBrief(null), null);
});
test('the VIX inversion: the validated wider-week fact is said on the first day only', async () => {
  const { vixLine } = await import('./jarvisVolCore.js');
  const s = (vs, ms) => ({ vix: vs.map((v, i) => ({ date: day(i), value: v })), vix3m: ms.map((v, i) => ({ date: day(i), value: v })) });
  const d1 = vixCurve(s([18, 19, 25], [20, 20, 24])); assert.equal(d1.runDays, 1); assert.equal(d1.firstDay, true);
  assert.match(vixLine(d1), /inverted today.*first day of an inversion has been followed by a wider week.*range, not direction/);
  const d3 = vixCurve(s([25, 26, 27], [24, 24, 24])); assert.equal(d3.runDays, 3); assert.equal(d3.firstDay, false);
  assert.match(vixLine(d3), /for 3 sessions now.*first day of an inversion only/); assert.doesNotMatch(vixLine(d3), /has been followed/);
  assert.equal(vixLine(vixCurve(s([15], [18]))), 'The VIX curve slopes upward, the calm shape.');
  assert.equal(vixLine(null), null);
});

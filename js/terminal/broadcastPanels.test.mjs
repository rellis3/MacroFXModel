// Tests for js/terminal/broadcastPanels.js: the wide broadcast's market-wide panels (tone, wire, curve, bias board, bias against the day).
import test from 'node:test';
import assert from 'node:assert/strict';
import { toneData, toneText, wireItems, wireText, curveText, biasCalls, biasText, biasDay, biasDayText } from './broadcastPanels.js';

test('market tone: the tape, the flags that are on, strongest and weakest currency', () => {
  const ml = { tape: { label: 'risk-off', score: -0.27, legs: { havens: 0.62 } }, ccy: [{ ccy: 'USD', score: -1.07 }, { ccy: 'CHF', score: 1.79 }, { ccy: 'EUR', score: 0.1 }, { ccy: 'AUD', score: -0.9 }] };
  const fl = { total: 6, flags: [{ label: 'VIX elevated', on: true, detail: 'VIX 26.4' }, { label: 'Credit wide', on: false }] };
  const d = toneData(ml, fl, { level: 143.6, z: -0.38, trend: 'falling', asOfDate: '2026-11-23' });
  assert.equal(d.ccy[0].ccy, 'CHF');
  assert.equal(toneText(d), 'Market tone: risk-off. One of six stress flags is on: VIX elevated. The strongest currency today is the Swiss franc, the weakest the US dollar.');
  assert.equal(toneData(null, null, null), null);
});

test('news wire: tier 1-2 since the cut-off, tier first then newest, no repeats; spoken as the why lines', () => {
  const news = { items: [
    { t: '2026-11-25T18:59:00Z', source: 'Y', title: 'Equities down after hot CPI', tier: 2, why: 'Hot inflation pushes equities lower and lifts the dollar.', impact: { EQUITIES: -1, USD: 1 } },
    { t: '2026-11-25T12:00:00Z', source: 'R', title: 'Fed speaker', tier: 1, why: 'A hawkish Fed speaker.', impact: {} },
    { t: '2026-11-25T11:00:00Z', source: 'R', title: 'Dup', tier: 1, why: 'A hawkish Fed speaker.', impact: {} },
    { t: '2026-11-25T10:00:00Z', source: 'R', title: 'Minor', tier: 3, why: 'x' },
    { t: '2026-11-24T10:00:00Z', source: 'R', title: 'Old', tier: 1, why: 'old' }] };
  const it = wireItems(news, Date.parse('2026-11-25T06:00:00Z'));
  assert.deepEqual(it.map(x => x.title), ['Fed speaker', 'Equities down after hot CPI']);
  assert.deepEqual(it[1].impact, [['EQUITIES', -1], ['USD', 1]]);
  assert.equal(wireText(it), 'What drove it, from the news wire. A hawkish Fed speaker. Hot inflation pushes equities lower and lifts the dollar.');
  assert.equal(wireText([]), '');
});

test('the curve: spread, weekly change, percentile and the 2-year; an old print says its day', () => {
  const rb = { tenors: [{ k: '2y', level: 4.63, chg5d: -17 }], slopes: [{ k: '2s10s', bp: 29, asOf: '2026-11-23', ageDays: 2, chg5d: 2, pct1y: 8 }] };
  assert.equal(curveText(rb), "The Treasury curve as of Monday's close: the two-to-ten year spread is 29 basis points, steeper by 2 over the week. That is the 8th percentile of the past year. The two-year yield is 4.63 percent, down 17 basis points on the week.");
  assert.equal(curveText({}), '');
});

test('the bias: only markets with a lean, strongest first, said as the engine\'s unproven lean', () => {
  const bev2 = { variants: { v2: { markets: {
    GOLD: { dir: 'BEARISH', strength: 4, score: -0.7, drivers: [{ label: 'Real yield', contrib: -0.3 }, { label: 'Dollar', contrib: 0.1 }] },
    USDCAD: { dir: 'BULLISH', strength: 5, score: 0.8, drivers: [] },
    EURGBP: { dir: 'NEUTRAL', strength: 2, score: 0.1 } } } } };
  const c = biasCalls(bev2);
  assert.deepEqual(c.map(x => [x.key, x.dir, x.driver]), [['USDCAD', 'up', ''], ['GOLD', 'dn', 'Real yield']]);
  const t = biasText(c);
  assert.match(t, /^The bias engine\. This is its lean, not a forecast we stand behind: it is unproven, and it is scored every night\./);
  assert.match(t, /leans lower on gold\./); assert.match(t, /Two markets have a lean; the rest are neutral\.$/);
  assert.equal(biasText([]), '');
});

test('the bias against the day: from 07:00, judged against a quarter of the usual move, changes listed', () => {
  const from = Date.parse('2026-11-25T07:00:00Z'), bar = (k, o, c) => ({ t: from + k * 9e5, o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c });
  const bars = [{ t: from - 9e5, o: 9, h: 9, l: 9, c: 9 }, bar(0, 100, 100.5), bar(1, 100.5, 99), bar(2, 99, 98)];
  const call = { key: 'GOLD', dir: 'dn', strength: 4 };
  const d = biasDay(call, bars, 2, { calls: { v2: [['issue', 'BEARISH'], ['07:00', 'BEARISH'], ['12:00', 'NEUTRAL'], ['15:00', 'BEARISH']] } }, from);
  assert.equal(d.open, 100); assert.equal(d.last, 98); assert.equal(d.moveU, -1); assert.equal(d.verdict, 'with');
  assert.deepEqual(d.changes, [['12:00', 'flat'], ['15:00', 'dn']]);
  const e = biasDay({ key: 'USDJPY', dir: 'up' }, bars, 2, null, from); assert.equal(e.verdict, 'against');
  const f = biasDay({ key: 'EURUSD', dir: 'up' }, [bar(0, 100, 100.1), bar(1, 100.1, 100.2), bar(2, 100.2, 100.3)], 2, null, from); assert.equal(f.verdict, 'flat');
  assert.equal(biasDay(call, bars.slice(0, 2), 2, null, from), null, 'too few bars since 07:00');
  const t = biasDayText([d, e, f]);
  assert.match(t, /^The bias engine against the day, from seven this morning\. Of three calls, one went the called way, one went against it, and one barely moved\./);
  assert.match(t, /Best: gold, called lower, fell 1\.0 times its usual move\./);
  assert.match(t, /One of the calls changed during the day\./);
});

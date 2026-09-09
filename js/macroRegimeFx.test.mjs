// js/macroRegimeFx.test.mjs — synthetic series only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignSeries, classifyRegimes, describeRegime, buildRegimeStudy, currentRegime,
  businessDayIndex, buildCalendarStudy, buildEventStudy, eventsForPair, DEFAULTS,
} from './macroRegimeFx.js';

// N business-ish days starting 2020-01-01, skipping weekends so month indexing is real.
function busDays(n, start = '2020-01-01') {
  const out = [];
  const d = new Date(start + 'T00:00:00Z');
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const ser = (dates, fn) => dates.map((date, i) => ({ date, value: fn(i) }));

test('macroRegimeFx', async t => {
  await t.test('alignSeries keeps only dates present in every input', () => {
    const a = alignSeries({
      x: [{ date: '2020-01-01', value: 1 }, { date: '2020-01-02', value: 2 }],
      y: [{ date: '2020-01-02', value: 9 }],
    });
    assert.deepEqual(a.dates, ['2020-01-02']);
    assert.deepEqual(a.cols.x, [2]);
  });

  await t.test('non-finite points are dropped, not coerced to zero', () => {
    const a = alignSeries({ x: [{ date: 'd1', value: null }, { date: 'd2', value: 3 }], y: [{ date: 'd1', value: 1 }, { date: 'd2', value: 1 }] });
    assert.deepEqual(a.dates, ['d2']);
  });

  await t.test('a day without a full lookback gets no label — no forward leak from a short window', () => {
    const dates = busDays(40);
    const { labels } = classifyRegimes({
      real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3),
      ten: ser(dates, () => 4), two: ser(dates, () => 3),
    }, { lookback: 20 });
    assert.equal(labels.slice(0, 20).every(x => x === null), true);
    assert.ok(labels[25]);
  });

  await t.test('the three axes read off the right inputs', () => {
    const dates = busDays(60);
    const r = classifyRegimes({
      real: ser(dates, i => 1 + i * 0.01),      // rising
      credit: ser(dates, i => 5 - i * 0.01),    // tightening
      ten: ser(dates, () => 3), two: ser(dates, () => 4),   // inverted
    }, { lookback: 20 });
    assert.equal(r.labels[50], 'realUp|creditTighter|curveInverted');
  });

  await t.test('describeRegime says it in words, not codes', () => {
    const txt = describeRegime('realUp|creditWider|curveInverted');
    assert.match(txt, /real yields rising/);
    assert.match(txt, /widening/);
    assert.match(txt, /inverted/);
  });

  await t.test('a regime below minObs reports counts but no read', () => {
    const dates = busDays(120);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    const fx = { EURUSD: ser(dates, i => 1.1 + i * 0.0001) };
    const st = buildRegimeStudy(macro, fx, { minObs: 500 });
    const row = Object.values(st.regimes)[0].EURUSD[5];
    assert.equal(row.all.enough, false);
    assert.ok(row.all.n > 0, 'the count is still reported');
  });

  await t.test('nEffective divides by the horizon — overlapping windows are not independent', () => {
    const dates = busDays(400);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    const fx = { EURUSD: ser(dates, i => 1.1 + i * 0.0001) };
    const st = buildRegimeStudy(macro, fx, { minObs: 10, horizons: [20] });
    const row = Object.values(st.regimes)[0].EURUSD[20];
    assert.ok(row.all.nEffective < row.all.n / 10, `${row.all.nEffective} vs ${row.all.n}`);
  });

  await t.test('a genuinely trending pair reads positive, and the split agrees', () => {
    const dates = busDays(600);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    const fx = { EURUSD: ser(dates, i => 1.1 * Math.exp(i * 0.0005)) };
    const st = buildRegimeStudy(macro, fx, { minObs: 10, horizons: [5] });
    const row = Object.values(st.regimes)[0].EURUSD[5];
    assert.ok(row.all.mean > 0);
    assert.equal(row.all.hitRate, 100);
    assert.equal(row.unstable, false, 'a monotone series must not read as unstable');
  });

  await t.test('a sign flip between the halves is flagged unstable', () => {
    const dates = busDays(600);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    // Up for the first 60%, down after — the pooled mean hides it, the flag does not.
    const half = Math.floor(dates.length * 0.6);
    const fx = { EURUSD: ser(dates, i => 1.1 * Math.exp((i < half ? i : half - (i - half)) * 0.0005)) };
    const st = buildRegimeStudy(macro, fx, { minObs: 10, horizons: [5] });
    const row = Object.values(st.regimes)[0].EURUSD[5];
    assert.equal(row.unstable, true);
  });

  await t.test('no forward leak — the last h days have no forward return', () => {
    const dates = busDays(300);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    const fx = { EURUSD: ser(dates, i => 1.1 + i * 0.0001) };
    const st = buildRegimeStudy(macro, fx, { minObs: 10, horizons: [20], lookback: 20 });
    const row = Object.values(st.regimes)[0].EURUSD[20];
    // labellable days = 300-20 = 280; of those the final 20 have no forward window.
    assert.ok(row.all.n <= 280 - 20 + 1, String(row.all.n));
  });

  await t.test('currentRegime reports the latest classifiable day, with its features', () => {
    const dates = busDays(80);
    const macro = { real: ser(dates, i => 1 + i * 0.01), credit: ser(dates, () => 3), ten: ser(dates, () => 4), two: ser(dates, () => 3) };
    const cur = currentRegime(macro, { lookback: 20 });
    assert.equal(cur.date, dates[dates.length - 1]);
    assert.match(cur.key, /^realUp\|/);
    assert.ok(cur.features.dReal > 0);
    assert.match(cur.describe, /real yields rising/);
  });

  await t.test('businessDayIndex counts from both ends of each month', () => {
    const dates = ['2020-01-30', '2020-01-31', '2020-02-03', '2020-02-04'];
    const { fromStart, fromEnd } = businessDayIndex(dates);
    assert.deepEqual(fromStart, [1, 2, 1, 2]);
    assert.deepEqual(fromEnd, [2, 1, 2, 1]);
  });

  await t.test('the calendar study reports the BASELINE next to the effect', () => {
    const dates = busDays(700);
    const fx = { EURUSD: ser(dates, i => 1.1 + Math.sin(i / 7) * 0.001) };
    const cal = buildCalendarStudy(fx, { window: 3, minObs: 10 });
    const t2 = cal.turnOfMonth.EURUSD;
    assert.ok(t2.turn.n > 0 && t2.rest.n > 0, 'both sides present');
    assert.equal(typeof t2.edgeBp, 'number', 'the difference is the result, not the level');
  });

  await t.test('day-of-week buckets cover Mon-Fri only', () => {
    const dates = busDays(700);
    const cal = buildCalendarStudy({ EURUSD: ser(dates, i => 1.1 + i * 0.00001) }, { minObs: 10 });
    assert.deepEqual(Object.keys(cal.dayOfWeek.EURUSD).sort(), ['1', '2', '3', '4', '5']);
  });

  await t.test('too-short series are skipped, not padded', () => {
    const st = buildRegimeStudy(
      { real: ser(busDays(60), i => i), credit: ser(busDays(60), () => 3), ten: ser(busDays(60), () => 4), two: ser(busDays(60), () => 3) },
      { SHORT: ser(busDays(10), i => i) }, {});
    assert.equal(st.pairs.includes('SHORT'), false);
  });

  await t.test('empty macro degrades honestly', () => {
    const st = buildRegimeStudy({}, {}, {});
    assert.equal(st.ok, false);
    assert.match(st.reason, /no aligned macro history/);
  });

  await t.test('defaults are sane', () => {
    assert.ok(DEFAULTS.isFrac > 0 && DEFAULTS.isFrac < 1);
    assert.ok(DEFAULTS.minObs >= 20);
    assert.ok(DEFAULTS.horizons.every(h => h > 0));
  });
});

test('buildEventStudy', async t => {
  const D = busDays(600);
  // A pair that moves 5x harder on the 1st of each month, when "NFP" prints.
  const evDates = D.filter(d => d.endsWith('-01'));
  const evSet = new Set(evDates);
  let v = 1.1;
  const px = D.map(d => { v *= (1 + (evSet.has(d) ? 0.02 : 0.004)); return { date: d, value: +v.toFixed(6) }; });
  const releases = evDates.map(d => ({
    country: 'US', event: 'Non-Farm Payrolls', ms: Date.parse(d + 'T13:30:00Z'), actual: '250K', estimate: '200K',
  }));
  const st = buildEventStudy({ EURUSD: px }, releases, { EURUSD: ['EUR', 'USD'] }, { minObs: 5 });
  const row = Object.values(st.pairs.EURUSD)[0];

  await t.test('detects that the release day moves harder than a normal day', () => {
    assert.ok(row.moveMultiple > 2, `expected a large multiple, got ${row.moveMultiple}`);
  });
  await t.test('reports the baseline alongside — the multiple is the comparison', () => {
    assert.ok(row.baselineAbsMovePct > 0 && row.avgAbsMovePct > row.baselineAbsMovePct);
  });
  await t.test('orients direction by which SIDE of the pair the currency is', () => {
    // USD is the QUOTE of EUR/USD, so a US beat should read as pair-DOWN. The price
    // rises on event days here, so hit rate must be low, not high.
    assert.ok(row.directionHitPct === 0, `USD is the quote leg; got ${row.directionHitPct}`);
    // Flip the pair so USD is the base: the same data must now read as hits.
    const st2 = buildEventStudy({ USDJPY: px }, releases, { USDJPY: ['USD', 'JPY'] }, { minObs: 5 });
    assert.equal(Object.values(st2.pairs.USDJPY)[0].directionHitPct, 100);
  });
  await t.test('a release that touches neither leg is skipped', () => {
    const st3 = buildEventStudy({ AUDNZD: px }, releases, { AUDNZD: ['AUD', 'NZD'] }, { minObs: 5 });
    assert.equal(st3.pairs.AUDNZD, undefined);
  });
  await t.test('too few observations means no row, not a shaky one', () => {
    const st4 = buildEventStudy({ EURUSD: px }, releases.slice(0, 3), { EURUSD: ['EUR', 'USD'] }, { minObs: 12 });
    assert.equal(st4.pairs.EURUSD, undefined);
  });
  await t.test('releases with no consensus are unusable and dropped', () => {
    const noEst = releases.map(r => ({ ...r, estimate: null }));
    const st5 = buildEventStudy({ EURUSD: px }, noEst, { EURUSD: ['EUR', 'USD'] }, { minObs: 5 });
    assert.equal(st5.seriesCount, 0);
  });
  await t.test('eventsForPair ranks by how much the release actually moves it', () => {
    const top = eventsForPair(st, 'EURUSD', 3);
    assert.ok(top.length >= 1);
    assert.ok(top[0].moveMultiple >= (top[1]?.moveMultiple ?? 0));
  });
});

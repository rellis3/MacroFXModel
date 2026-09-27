import assert from 'node:assert/strict';
import { mad, cadenceDays, receipt, receiptSentence, curveFactors, curveSentence } from './chapterEngine.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const S = vals => vals.map((v, i) => ({ date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`, value: v }));

// ── Robust scale: the reason this uses MAD and not standard deviation ────────
t('one extreme print does not rescale everything measured against it', () => {
  const calm = Array.from({ length: 60 }, (_, i) => 2 + (i % 5) * 0.1);
  const spiked = [...calm.slice(0, 59), 40];              // a 2022-style outlier
  const a = mad(calm), b = mad(spiked);
  assert.ok(a && b);
  assert.ok(b / a < 1.5, `MAD moved ${(b / a).toFixed(1)}x on one outlier — it should barely move`);
  // the same comparison on a standard deviation, to show what is being avoided
  const sd = v => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
  assert.ok(sd(spiked) / sd(calm) > 5, 'the fixture must actually contain an outlier to make the point');
});

t('mad needs a real sample, and ignores what is not a number', () => {
  assert.equal(mad([1, 2]), null, 'below the three-value minimum');
  assert.equal(mad([]), null);
  assert.equal(mad([null, NaN, undefined]), null, 'no finite values at all');
  // non-finite entries are DROPPED, not counted: three real numbers is a real sample
  assert.equal(mad([1, 2, 3, null, NaN]), mad([1, 2, 3]));
  assert.equal(mad([1, 2, null]), null, 'and dropping them can take it below the floor');
});

// ── Receipts ────────────────────────────────────────────────────────────────
t('a receipt places the latest value inside its own window', () => {
  const r = receipt(S(Array.from({ length: 100 }, (_, i) => i)));   // 0..99, latest is the top
  assert.equal(r.value, 99);
  assert.equal(r.pct, 100);
  assert.equal(r.lo, 0); assert.equal(r.hi, 99);
  assert.equal(r.median, 49.5);
  assert.equal(r.n, 100);
});

t('an explicit print window is still honoured, and takes the TAIL', () => {
  const r = receipt(S(Array.from({ length: 500 }, (_, i) => i)), { window: 240 });
  assert.equal(r.n, 240);
  assert.equal(r.lo, 260, 'the window must be the tail, not the head');
});

// THE FLAW THIS CLOSES, found by looking at the rendered page: a fixed print count gives
// a DAILY series about a year and a MONTHLY series twenty. Two percentiles computed over
// wildly different spans, sitting in one gauge, looking perfectly consistent.
t('the window is a span of TIME, so series of different cadence stay comparable', () => {
  const daily = [], monthly = [];
  for (let i = 0; i < 2000; i++) daily.push({ date: new Date(Date.UTC(2015, 0, 1 + i)).toISOString().slice(0, 10), value: i });
  for (let i = 0; i < 300; i++) monthly.push({ date: new Date(Date.UTC(2000, i, 1)).toISOString().slice(0, 10), value: i });
  const d = receipt(daily, { years: 5 }), m = receipt(monthly, { years: 5 });
  assert.ok(Math.abs(d.years - 5) < 0.6, `daily window came out at ${d.years} years`);
  assert.ok(Math.abs(m.years - 5) < 0.6, `monthly window came out at ${m.years} years`);
  assert.ok(d.n > m.n * 10, 'the daily series must use far more prints to cover the same span');
  assert.equal(cadenceDays(monthly) > 27 && cadenceDays(monthly) < 32, true);
});

t('the sentence states the span in years, which is what makes two receipts comparable', () => {
  const daily = [];
  for (let i = 0; i < 2000; i++) daily.push({ date: new Date(Date.UTC(2015, 0, 1 + i)).toISOString().slice(0, 10), value: i });
  assert.match(receiptSentence(receipt(daily), 'The 10-year'), /5-year range/);
});

t('the change is reported alongside the level, because they disagree', () => {
  // a series sitting LOW but rising fast
  const vals = [...Array.from({ length: 90 }, () => 50), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const r = receipt(S(vals));
  assert.ok(r.pct < 50, 'the level is low in its range');
  assert.ok(r.changePct > 50, 'while the change is high');
  assert.equal(r.change, 1);
});

t('the sentence says so out loud when level and change disagree', () => {
  const vals = [...Array.from({ length: 90 }, () => 50), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const s = receiptSentence(receipt(S(vals)), 'CPI growth');
  assert.match(s, /CPI growth sits at the \d+\w\w percentile/);
  assert.match(s, /where it IS and where it is GOING disagree/);
  // and stays quiet when they agree
  const flat = receiptSentence(receipt(S(Array.from({ length: 100 }, (_, i) => i))), 'X');
  assert.doesNotMatch(flat, /disagree/);
});

t('receipts refuse a series too short to place anything in', () => {
  assert.equal(receipt(S([1, 2, 3])), null);
  assert.equal(receipt([]), null);
  assert.equal(receipt(null), null);
  assert.equal(receiptSentence(null, 'X'), null);
});

t('ordinals read correctly, including the teens', () => {
  const at = p => receiptSentence({ pct: p, n: 10, median: 1, lo: 0, hi: 2, value: 1, changePct: p }, 'X');
  for (const [p, want] of [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [52, '52nd'], [100, '100th']])
    assert.match(at(p), new RegExp(`the ${want} percentile`), `${p} should read ${want}`);
});

// ── Curve factors ───────────────────────────────────────────────────────────
const C = (vals, prevs) => vals.map((v, i) => ({ key: ['1M', '2Y', '10Y', '30Y'][i], years: [1 / 12, 2, 10, 30][i], value: v, prev: prevs?.[i] }));

t('slope and inversion are read off the real ends', () => {
  const up = curveFactors(C([3, 3.5, 4, 4.5]));
  assert.ok(up.slope > 0); assert.equal(up.inverted, false);
  assert.equal(up.short.key, '1M'); assert.equal(up.long.key, '30Y');
  const inv = curveFactors(C([5, 4.5, 4, 3.5]));
  assert.equal(inv.inverted, true);
  assert.ok(inv.slope < 0);
});

t('tenors are sorted by maturity, not by the order they arrive', () => {
  const jumbled = [{ key: '30Y', years: 30, value: 4.5 }, { key: '1M', years: 1 / 12, value: 3 }, { key: '10Y', years: 10, value: 4 }];
  const cf = curveFactors(jumbled);
  assert.equal(cf.short.key, '1M');
  assert.equal(cf.long.key, '30Y');
});

t('a parallel shift attributes to LEVEL and nothing else', () => {
  const cf = curveFactors(C([3.2, 3.7, 4.2, 4.7], [3, 3.5, 4, 4.5]));   // everything +20bp
  assert.equal(cf.move.dominant, 'level');
  assert.ok(cf.move.share.level > 0.95, `level share was ${cf.move.share.level}`);
  assert.ok(cf.move.share.slope < 0.05);
});

t('a steepening attributes to SLOPE', () => {
  const cf = curveFactors(C([3, 3.5, 4.4, 5.1], [3, 3.5, 4, 4.5]));    // long end alone rises
  assert.equal(cf.move.dominant, 'slope');
});

t('the shares are proportions and sum to one', () => {
  for (const [now, was] of [[[3.1, 3.9, 4.1, 4.4], [3, 3.5, 4, 4.5]], [[5, 4, 3, 2], [3, 3.5, 4, 4.5]]]) {
    const m = curveFactors(C(now, was)).move;
    const sum = m.share.level + m.share.slope + m.share.curvature;
    // each share is rounded to 3dp for display, so three of them can sit up to 1.5e-3
    // off unity. Demanding exactness here would be testing the rounding, not the maths.
    assert.ok(Math.abs(sum - 1) < 2e-3, `shares summed to ${sum}`);
    for (const v of Object.values(m.share)) assert.ok(v >= 0 && v <= 1, `share ${v} is not a proportion`);
  }
});

t('no previous reading means no attribution, not a fabricated one', () => {
  const cf = curveFactors(C([3, 3.5, 4, 4.5]));
  assert.equal(cf.move, null);
  assert.doesNotMatch(curveSentence(cf), /latest move/);
});

t('an unchanged curve does not divide by zero', () => {
  const cf = curveFactors(C([3, 3.5, 4, 4.5], [3, 3.5, 4, 4.5]));
  assert.equal(cf.move.gross, 0);
  assert.equal(cf.move.share, null);
  assert.ok(curveSentence(cf));
});

t('fewer than three tenors is not a curve', () => {
  assert.equal(curveFactors([{ key: 'a', years: 1, value: 1 }, { key: 'b', years: 2, value: 2 }]), null);
  assert.equal(curveFactors([]), null);
  assert.equal(curveFactors(null), null);
  assert.equal(curveSentence(null), null);
});

t('the sentence names the dominant factor and what stayed still', () => {
  const s = curveSentence(curveFactors(C([3.2, 3.7, 4.2, 4.7], [3, 3.5, 4, 4.5])));
  assert.match(s, /\d+% level/);
  assert.match(s, /doing almost nothing/);
  assert.match(s, /1M/); assert.match(s, /30Y/);
});

t('nothing in the chapter prose makes a forward claim', () => {
  const s = [curveSentence(curveFactors(C([3.2, 3.7, 4.2, 4.7], [3, 3.5, 4, 4.5]))),
             receiptSentence(receipt(S(Array.from({ length: 100 }, (_, i) => i))), 'CPI')].join(' ');
  assert.doesNotMatch(s, /\b(will|expect|predict|buy|sell|target|signal|opportunity)\b/i);
});

console.log(`chapterEngine: ${n} groups, all passed`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { newsExhaustion } from './newsExhaustionEngine.js';

// Synthetic 1-min M1: day-varying amplitude; on "Major-news" days the move is BIG
// and continues (blow-through), on quiet days it's small and reverts.
function synthM1(nDays, majorDays) {
  const bars = []; const startSec = Math.floor(Date.UTC(2020, 0, 1, 22, 0, 0) / 1000);
  const perDay = 24 * 60; let px = 100;
  for (let d = 0; d < nDays; d++) {
    px *= 1 + (((d % 5) - 2) * 0.0005);
    const isMajor = majorDays.has(d);
    const amp = isMajor ? 0.028 : 0.006 + 0.004 * Math.abs(Math.sin(d));
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;
      const shape = isMajor ? frac : Math.sin(frac * Math.PI);   // major = trend all day; quiet = revert
      const mid = px * (1 + amp * shape);
      const o = mid, c = mid + px * 0.0002 * Math.sin(frac * 80);
      const hi = Math.max(o, c) + px * 0.0004, lo = Math.min(o, c) - px * 0.0004;
      bars.push({ time: startSec + (d * perDay + m) * 60, open: o, high: hi, low: lo, close: c });
    }
  }
  return bars;
}
// Build synthetic events: a Major USD event mid-session on each majorDay.
function synthEvents(nDays, majorDays) {
  const ev = []; const start = Date.UTC(2020, 0, 1, 22, 0, 0);
  for (let d = 0; d < nDays; d++) {
    if (majorDays.has(d)) ev.push({ ms: start + (d * 1440 + 720) * 60000, ccy: 'USD', rank: 3, event: 'CPI', surprise: 0.3 });
  }
  return ev.sort((a, b) => a.ms - b.ms);
}

test('newsExhaustion: buckets sessions by news and reports per-bucket stats', () => {
  const majors = new Set([...Array(60)].map((_, k) => k * 5));   // every 5th day is Major
  const r = newsExhaustion(synthM1(300, majors), synthEvents(300, majors), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(r.oos.major.n > 0 && r.oos.none.n > 0, 'both major and none buckets populated OOS');
  assert.ok(typeof r.oos.major.reached75Pct === 'number', 'reached75 pct present');
  assert.ok(typeof r.oos.major.reached50Pct === 'number', 'reached50 (median) pct present');
  assert.ok(r.oos.major.fade && r.oos.major.follow, '75th fade + follow stats present');
  assert.ok(r.oos.major.fade50 && r.oos.major.follow50, 'median fade + follow stats present');
  // the median is reached at least as often as the 75th (it's the inner band)
  assert.ok((r.is.major.reached50Pct ?? 0) >= (r.is.major.reached75Pct ?? 0), 'reached50 ≥ reached75');
});

test('newsExhaustion: Major-news sessions reach the 75th band more than quiet ones', () => {
  const majors = new Set([...Array(60)].map((_, k) => k * 5));
  const r = newsExhaustion(synthM1(300, majors), synthEvents(300, majors), { pair: 'EURUSD' });
  // by construction Major days are big trend days → higher reached75 than none
  assert.ok((r.is.major.reached75Pct ?? 0) > (r.is.none.reached75Pct ?? 0),
    `major reached75 ${r.is.major.reached75Pct} > none ${r.is.none.reached75Pct}`);
  assert.equal(typeof r.classifier.signalPresent, 'boolean', 'classifier verdict present');
});

test('newsExhaustion: no events ⇒ everything lands in the none bucket', () => {
  const r = newsExhaustion(synthM1(300, new Set()), [], { pair: 'EURUSD' });
  assert.equal(r.oos.major.n, 0, 'no major sessions');
  assert.ok(r.oos.none.n > 0, 'all sessions are none');
});

test('newsExhaustion: insufficient data flagged, not thrown', () => {
  assert.ok(newsExhaustion(synthM1(30, new Set()), [], { pair: 'EURUSD' }).insufficient);
});

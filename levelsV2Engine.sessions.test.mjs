/**
 * Live levels-v2 Asia/Monday windows match what the policy is learned on.
 * Run: node --test levelsV2Engine.sessions.test.mjs
 *
 * The learn route (server.js /api/levels-v2/learn → rangeLineAnalyser.touchesForPair) buckets sessions with
 * forecastAnalyser.bucketM1IntoSessions(packed, 22): Asia = first 6h of each session (22:00–04:00 UTC),
 * Monday = the Monday session. Before 2026-10-31 the live ladder used 00:00–06:00 UTC (REPO_REVIEW_2026-10-31).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asiaRange, mondayRange, sessionKeyUtc, LEARN_BOUNDARY_UTC } from './levelsV2Engine.js';
import { bucketM1IntoSessions } from './js/forecastAnalyser.js';

// 5-minute bars from Sun 2026-06-14 21:00 UTC to Tue 2026-06-16 06:00 UTC; the body sits at a level that
// encodes its UTC hour, so a range tells us exactly which hours went into it.
function bars(stepMin = 5) {
  const out = [];
  for (let t = Date.parse('2026-06-14T22:00:00Z') / 1000; t < Date.parse('2026-06-16T06:00:00Z') / 1000; t += stepMin * 60) {
    const h = new Date(t * 1000).getUTCHours(); const px = 1 + h / 100;
    out.push({ time: t, open: px, close: px, high: px + 0.001, low: px - 0.001 });
  }
  return out;
}

test('session keys agree with bucketM1IntoSessions(…, 22)', () => {
  const b = bars();
  const packed = { n: b.length, times: Int32Array.from(b.map(x => x.time)), opens: b.map(x => x.open), highs: b.map(x => x.high), lows: b.map(x => x.low), closes: b.map(x => x.close) };
  const learned = bucketM1IntoSessions(packed, LEARN_BOUNDARY_UTC);
  for (const [key, arr] of learned) for (const x of arr) assert.equal(sessionKeyUtc(x.time), key);
});

test('Asia = first 6h of the latest session: 22:00–04:00 UTC (bodies 1.22 … 1.03)', () => {
  const r = asiaRange(bars());                 // latest session is Tue 06-16 (from Mon 22:00)
  assert.deepEqual([+r.low.toFixed(2), +r.high.toFixed(2)], [1.00, 1.23]);   // hours 22,23 and 0..3
  // the old 00:00–06:00 window would have given [1.00, 1.05]
});

test('Monday = the Monday session (Sun 22:00 → Mon 22:00 UTC)', () => {
  const r = mondayRange(bars(30));
  assert.deepEqual([+r.low.toFixed(2), +r.high.toFixed(2)], [1.00, 1.23]);   // includes Sun 22:00–23:59
});

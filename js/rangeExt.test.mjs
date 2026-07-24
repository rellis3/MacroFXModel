/**
 * Unit tests for the range-extension strategy bricks — pure, synthetic, no
 * network. Covers sessionRanges (DST + session building + no-lookahead prev),
 * rangeExtConfidence (trendiness/direction, score monotonicity, selection), and
 * rangeExtEngine helpers (candidate zones/alignment, fade/follow geometry).
 *
 *   node --test js/rangeExt.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  londonOffsetHours, dayStartEpoch, dowOf, isoDate,
  buildAsiaSessions, prevSession,
} from './sessionRanges.js';
import {
  dayContext, scoreLevel, selectLevels, DEFAULT_WEIGHTS,
} from './rangeExtConfidence.js';
import { _test as ENG } from './rangeExtEngine.js';

// ── synthetic packed M1 builder ───────────────────────────────────────────────
// Two days of 1-minute bars, UTC. Asia window (00:00–06:00) oscillates in a tight
// band; the rest of the day drifts. Gives ≥10 Asia bars/day so a session forms.
function synthPacked(startDayEpoch = Date.UTC(2021, 5, 1) / 1000, days = 2) {
  const times = [], o = [], h = [], l = [], c = [];
  for (let d = 0; d < days; d++) {
    const base = startDayEpoch + d * 86400;
    for (let m = 0; m < 8 * 60; m++) {   // 8 hours of bars/day is enough
      const t = base + m * 60;
      const inAsia = m < 6 * 60;
      const mid = inAsia ? 1.10 + 0.001 * Math.sin(m / 20) : 1.10 + 0.003 * (m - 360) / 120;
      times.push(t); o.push(mid); h.push(mid + 0.0002); l.push(mid - 0.0002); c.push(mid);
    }
  }
  return {
    n: times.length,
    times: Int32Array.from(times),
    opens: Float32Array.from(o), highs: Float32Array.from(h),
    lows: Float32Array.from(l), closes: Float32Array.from(c),
  };
}

// ── sessionRanges ─────────────────────────────────────────────────────────────
test('londonOffsetHours: BST vs GMT boundaries', () => {
  assert.equal(londonOffsetHours(2021, 1, 15), 0);   // Jan → GMT
  assert.equal(londonOffsetHours(2021, 7, 15), 1);   // Jul → BST
  assert.equal(londonOffsetHours(2021, 3, 28), 1);   // last Sun Mar 2021 = 28th → BST
  assert.equal(londonOffsetHours(2021, 3, 27), 0);   // day before → GMT
  assert.equal(londonOffsetHours(2021, 10, 31), 0);  // last Sun Oct 2021 = 31st → GMT
});

test('dayStartEpoch: utc vs london offset', () => {
  const utc = dayStartEpoch('2021-07-15', 'utc');
  const lon = dayStartEpoch('2021-07-15', 'london');
  assert.equal(utc - lon, 3600);          // London midnight is 1h earlier in UTC in July
  assert.equal(utc, Date.UTC(2021, 6, 15) / 1000);
});

test('dowOf + isoDate round-trip', () => {
  assert.equal(dowOf('2021-06-07'), 1);   // Monday
  assert.equal(isoDate(Date.UTC(2021, 5, 7) / 1000), '2021-06-07');
});

test('buildAsiaSessions: one session/day, body range positive, sorted', () => {
  const packed = synthPacked();
  const s = buildAsiaSessions(packed, 'utc', 6, 5);
  assert.equal(s.length, 2);
  assert.ok(s[0].epoch < s[1].epoch);
  assert.ok(s[0].range > 0 && s[0].high > s[0].low);
});

test('prevSession: strictly earlier, no lookahead', () => {
  const packed = synthPacked();
  const s = buildAsiaSessions(packed, 'utc', 6, 5);
  assert.equal(prevSession(s, s[1].epoch), s[0]);      // day 2 sees day 1
  assert.equal(prevSession(s, s[0].epoch), null);      // day 1 sees nothing before
});

// ── rangeExtConfidence ────────────────────────────────────────────────────────
test('dayContext: low state → fade, high state → follow', () => {
  const calm = dayContext({ volRegimePct: 0.05, dayTypeT: 0, asiaRangeRatio: 0.7 });
  const hot = dayContext({ volRegimePct: 0.95, dayTypeT: 1.2, asiaRangeRatio: 1.8 });
  assert.equal(calm.direction, 'fade');
  assert.equal(hot.direction, 'follow');
  assert.ok(hot.trendiness > calm.trendiness);
});

test('scoreLevel: tight alignment beats none; near-range fade beats far', () => {
  const ctx = dayContext({ volRegimePct: 0.1, dayTypeT: 0, asiaRangeRatio: 0.8 }); // fade day
  const tight = scoreLevel({ mult: 1.5, alignment: 'tight', isKey: true }, ctx);
  const none = scoreLevel({ mult: 1.5, alignment: 'none', isKey: false }, ctx);
  assert.ok(tight.confidence > none.confidence);
  const near = scoreLevel({ mult: 1.5, alignment: 'strong' }, ctx);
  const far = scoreLevel({ mult: 9.5, alignment: 'strong' }, ctx);
  assert.ok(near.confidence > far.confidence);          // far fades discounted
  assert.equal(tight.direction, 'fade');
});

test('selectLevels: floor + top-N ranking (14 → few)', () => {
  const scored = Array.from({ length: 14 }, (_, i) => ({ id: i, confidence: i / 14 }));
  const sel = selectLevels(scored, { topN: 3, minConfidence: 0.5 });
  assert.equal(sel.length, 3);
  assert.ok(sel.every((s) => s.confidence >= 0.5));
  assert.deepEqual(sel.map((s) => s.id), [13, 12, 11]); // highest first
});

// ── rangeExtEngine helpers ────────────────────────────────────────────────────
const ASIA = { low: 1.1000, high: 1.1030, range: 0.0030 };   // 30-pip Asia range
const PIP = 0.0001;

test('buildLadder: extensions only, mult cap, zone + alignment + source tag', () => {
  const prev = { low: 1.0998, high: 1.1030, range: 0.0032 };  // prior Asia for alignment
  const cands = ENG.buildLadder(ASIA, prev, PIP, 'asia', { maxTradeMult: 4, alignTolPips: 2, tightPct: 10 });
  assert.ok(cands.length > 0);
  assert.ok(cands.every((c) => c.zone !== 'inside'));          // extensions only
  assert.ok(cands.every((c) => c.mult >= 0.25 && c.mult <= 4));// tradeable window
  // a level above the range is zone 'above'; below is 'below'
  assert.ok(cands.some((c) => c.zone === 'above') && cands.some((c) => c.zone === 'below'));
  assert.ok(cands.every((c) => ['tight', 'strong', 'none'].includes(c.alignment)));
  assert.ok(cands.every((c) => c.source === 'asia' && c.srcRange === ASIA.range));
});

test('buildCandidates: levelSource asia|monday|both tags sources, scales stop to own range', () => {
  const asia = ASIA, prevAsia = { low: 1.0998, high: 1.1030, range: 0.0032 };
  const monday = { low: 1.0900, high: 1.1100, range: 0.0200 };   // weekly range ≫ daily
  const prevMon = { low: 1.0880, high: 1.1090, range: 0.0210 };
  const both = ENG.buildCandidates({ asia, prevAsia, monday, prevMonday: prevMon }, PIP,
    { levelSource: 'both', maxTradeMult: 4, alignTolPips: 2, tightPct: 10 });
  assert.ok(both.some((c) => c.source === 'asia') && both.some((c) => c.source === 'monday'));
  // Monday-sourced levels carry the (much larger) weekly range for stop scaling
  assert.ok(both.filter((c) => c.source === 'monday').every((c) => c.srcRange === monday.range));
  // 'asia' only → no monday levels
  const asiaOnly = ENG.buildCandidates({ asia, prevAsia, monday, prevMonday: prevMon }, PIP,
    { levelSource: 'asia', maxTradeMult: 4, alignTolPips: 2, tightPct: 10 });
  assert.ok(asiaOnly.every((c) => c.source === 'asia'));
});

test('buildOrder: fade = limit toward range; follow = stop through level', () => {
  const ctx = { asia: ASIA, slDist: 0.0020, pip: PIP, tpMode: 'rr', tpR: 1.5, tpBufPix: 3 * PIP, ladderPrices: [] };
  const above = { price: 1.1060, zone: 'above', mult: 2 };
  const fade = ENG.buildOrder(above, 'fade', ctx);
  assert.equal(fade.side, 'SELL');            // fade an upper extension = short
  assert.equal(fade.entryType, 'limit');
  assert.ok(fade.sl > fade.entry && fade.tp < fade.entry);
  const follow = ENG.buildOrder(above, 'follow', ctx);
  assert.equal(follow.side, 'BUY');           // follow the up-break = long
  assert.equal(follow.entryType, 'stop');
  assert.ok(follow.sl < follow.entry && follow.tp > follow.entry);
});

test('buildDailyFeatures: no-lookahead (day i uses ≤ i-1)', () => {
  const daily = Array.from({ length: 300 }, (_, i) => ({
    date: isoDate(Date.UTC(2021, 0, 1) / 1000 + i * 86400),
    open: 1.1, high: 1.1 + 0.001 * (i % 3), low: 1.1 - 0.001, close: 1.1 + 0.0005 * Math.sin(i / 5),
  }));
  const feat = ENG.buildDailyFeatures(daily);
  // first day has no prior → neutral defaults
  assert.equal(feat.get(daily[0].date).volRegimePct, 0.5);
  assert.equal(feat.get(daily[0].date).dayTypeT, 0);
  // a warm day has a finite regime percentile rescaled to [0,1]
  const warm = feat.get(daily[290].date);
  assert.ok(warm.volRegimePct >= 0 && warm.volRegimePct <= 1);
  assert.notEqual(warm.volRegimePct, 0.5);   // actually computed, not the default
  // daily σ (for approach-velocity normalisation) is finite & non-negative once warm
  assert.ok(Number.isFinite(warm.dailySigma) && warm.dailySigma >= 0);
  assert.equal(feat.get(daily[0].date).dailySigma, 0);   // no history → 0
});

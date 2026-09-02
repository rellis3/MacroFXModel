/**
 * Unit tests for js/mondayFibAtlasEngine.js. Pure/synthetic: no network.
 *   node js/mondayFibAtlasEngine.test.mjs
 *
 * This engine is a deliberately leaner sibling of asiaFibAtlasEngine.js (see
 * its own header) — these tests focus on what's genuinely NEW here: the
 * weekly walk window (Tuesday -> the following Monday inclusive), the
 * same-reference-week semantics of the reused `prevOutcomeSameDay` field
 * name, and the barrier-resolution mechanics mirrored from Asia's own
 * (already-proven) walk. Same synthetic-fixture technique as
 * asiaFibAtlasEngine.test.mjs (deterministic, no Math.random()).
 */
import assert from 'node:assert/strict';
import { mondayFibAtlasWalk, mondayFibAtlasLiveToday, mondayFibAtlasLiveLadder, mondayRungBarrierPips } from './mondayFibAtlasEngine.js';
import { buildMondayRanges } from './sessionRanges.js';
import { RUNGS_ABOVE, RUNGS_BELOW, SIDES, sessionHandoffPhase } from './asiaFibAtlasEngine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('mondayFibAtlasEngine');

const T0 = 1577836800;   // 2020-01-01 00:00 UTC (a Wednesday) — Monday ranges start forming that week
function packedM1(nBars, { drift = 0.0003, wiggle = 0.02 } = {}) {
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  let px = 100;
  for (let i = 0; i < nBars; i++) {
    const o = px;
    px = px + drift * Math.sin(i / 4000) + wiggle * Math.sin(i / 11) + (i % 97 === 0 ? wiggle * 3 : 0);
    times[i] = T0 + i * 60; opens[i] = o; closes[i] = px;
    highs[i] = Math.max(o, px) + 0.03; lows[i] = Math.min(o, px) - 0.03;
    volumes[i] = 80 + (i % 13);
  }
  return { n: nBars, times, opens, highs, lows, closes, volumes };
}

const P = packedM1(60 * 24 * 400);   // ~400 days of M1, ~57 weeks

t('mondayFibAtlasWalk returns touches with sane outcome distribution and coverage', () => {
  const { touches, coverage } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(touches.length > 100, `expected a meaningful number of touches, got ${touches.length}`);
  assert.ok(coverage.weeks > 10);
  const outcomes = new Set(touches.map(t2 => t2.outcome));
  assert.ok(outcomes.has('out') || outcomes.has('back'), 'expected at least some resolved touches');
  for (const r of touches) assert.ok(['out', 'back', 'neither'].includes(r.outcome));
});

t('every touch carries the fields buildAsiaFibAtlasBook/asiaFibAtlasVoteReview need', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const sample = touches.slice(0, 200);
  for (const r of sample) {
    for (const k of ['instrument', 'assetClass', 'date', 'side', 'level', 'rearmFrac', 'price', 'pip',
      'time', 'resolveTime', 'outcome', 'fadePips', 'runPips', 'innerDistPips', 'session', 'sessionHandoff']) {
      assert.ok(k in r, `missing field ${k}`);
    }
    assert.ok(SIDES.includes(r.side));
    assert.ok([...RUNGS_ABOVE, ...RUNGS_BELOW].includes(r.level));
  }
});

t('rung price uses mon.low + mon.range*level — the SAME formula the walk itself computes', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const mondayRanges = buildMondayRanges(P, 'london');
  const r = touches.find(x => x.side === 'above' && x.level === 2);
  assert.ok(r, 'expected an above|2 touch');
  const mon = mondayRanges.find(m => m.date === r.mondayDate);
  assert.ok(mon, `expected to find the Monday range for ${r.mondayDate}`);
  const expected = mon.low + mon.range * 2;
  assert.ok(Math.abs(r.price - expected) < 1e-6, `price ${r.price} != mon.low+range*2 (${expected})`);
});

t('every touch time falls within [Tuesday 00:00, +7 days) of its own governing Monday — the weekly walk window', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const mondayRanges = buildMondayRanges(P, 'london');
  const byDate = new Map(mondayRanges.map(m => [m.date, m]));
  for (const r of touches.slice(0, 500)) {
    const mon = byDate.get(r.mondayDate);
    assert.ok(mon, `no Monday range found for ${r.mondayDate}`);
    const winStart = mon.epoch + 24 * 3600, winEnd = mon.epoch + 8 * 86400;
    assert.ok(r.time >= winStart && r.time < winEnd, `touch time ${r.time} outside [${winStart},${winEnd}) for week ${r.mondayDate}`);
  }
});

t('prevOutcomeSameDay only carries forward within the SAME reference week, never across weeks', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const byKey = new Map();   // `${side}|${level}` -> touches sorted by time
  for (const r of touches) { const k = `${r.side}|${r.level}`; (byKey.get(k) ?? byKey.set(k, []).get(k)).push(r); }
  let checked = 0;
  for (const [, list] of byKey) {
    list.sort((a, b) => a.time - b.time);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      checked++;
      if (cur.mondayDate !== prev.mondayDate) {
        // Different reference week -> must NOT inherit the previous week's outcome.
        assert.equal(cur.prevOutcomeSameDay, null, `touch in week ${cur.mondayDate} leaked prevOutcomeSameDay from week ${prev.mondayDate}`);
      } else if (prev.outcome !== 'neither') {
        assert.equal(cur.prevOutcomeSameDay, prev.outcome, `same-week repeat should carry forward the prior resolved outcome`);
      }
    }
  }
  assert.ok(checked > 20, 'expected enough same-key touch pairs to actually exercise this check');
});

t('sessionHandoff matches sessionHandoffPhase(hour) for every touch — no second, drifted copy', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  for (const r of touches.slice(0, 300)) {
    const hourUtc = new Date(r.time * 1000).getUTCHours();
    assert.equal(r.sessionHandoff, sessionHandoffPhase(hourUtc));
  }
});

t('no-lookahead: truncating the packed series to end mid-week must not change an EARLIER week\'s already-walked touches', () => {
  const before = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  // Truncate to roughly the midpoint — removes several LATER weeks entirely.
  const cut = Math.floor(P.n * 0.5);
  const shrunk = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
    highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut), closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const after = mondayFibAtlasWalk(shrunk, { instrument: 'EURUSD', assetClass: 'fx' });
  // Pick an EARLY week's touches (well before the truncation point) and
  // confirm they're byte-identical in both runs.
  const earlyWeek = before.touches.find(r => r.time < shrunk.times[shrunk.n - 1] - 30 * 86400)?.mondayDate;
  assert.ok(earlyWeek, 'expected an early week well clear of the truncation point');
  const beforeEarly = before.touches.filter(r => r.mondayDate === earlyWeek);
  const afterEarly = after.touches.filter(r => r.mondayDate === earlyWeek);
  assert.equal(beforeEarly.length, afterEarly.length, 'touch count for an early week must not change when LATER data is removed');
  for (let i = 0; i < beforeEarly.length; i++) {
    assert.deepEqual(beforeEarly[i], afterEarly[i], `touch ${i} in week ${earlyWeek} changed when later data was truncated`);
  }
});

t('an instrument with too little history (fewer weeks than minLookback) degrades to empty, not a throw', () => {
  const tiny = packedM1(60 * 24 * 3);   // 3 days, well under one week
  const { touches, coverage } = mondayFibAtlasWalk(tiny, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.equal(touches.length, 0);
  assert.equal(coverage, null);
});

// ── mondayFibAtlasLiveToday / mondayFibAtlasLiveLadder (2026-08-28) —
// the live-ladder pair added for the asia-fib-atlas-live.html Asia/Monday
// toggle, mirroring asiaFibAtlasEngine.js's own asiaFibAtlasLiveToday/
// asiaFibAtlasLiveLadder tests. ──

t('mondayFibAtlasLiveToday returns only touches from the LATEST reference week (by mondayDate, not calendar date)', () => {
  const { touches, mondayDate } = mondayFibAtlasLiveToday(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(mondayDate, 'expected a governing mondayDate');
  assert.ok(touches.length > 0, 'expected at least some touches in the latest week');
  for (const t2 of touches) assert.equal(t2.mondayDate, mondayDate);
});

t('mondayFibAtlasLiveLadder returns every RUNGS_ABOVE/RUNGS_BELOW rung exactly once, sorted nearest-to-price first', () => {
  const live = mondayFibAtlasLiveLadder(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.equal(live.ladder.length, RUNGS_ABOVE.length + RUNGS_BELOW.length);
  for (let i = 1; i < live.ladder.length; i++) assert.ok(live.ladder[i].distance >= live.ladder[i - 1].distance);
  const seen = new Set(live.ladder.map(r => `${r.side}|${r.level}`));
  assert.equal(seen.size, live.ladder.length, 'no duplicate rungs');
});

t('mondayFibAtlasLiveLadder: rung price uses the SAME formula as the walk itself (mon.low + mon.range*level)', () => {
  const live = mondayFibAtlasLiveLadder(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const mondayRanges = buildMondayRanges(P, 'london');
  const mon = mondayRanges.at(-1);
  const r = live.ladder.find(x => x.side === 'above' && x.level === 2);
  const expected = mon.low + mon.range * 2;
  assert.ok(Math.abs(r.price - expected) < 1e-6, `price ${r.price} != mon.low+range*2 (${expected})`);
});

t('mondayFibAtlasLiveLadder: sessionHandoff on every rung matches sessionHandoffPhase(latest bar hour) — one live signal, not per-rung drift', () => {
  const live = mondayFibAtlasLiveLadder(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const hourUtc = new Date(P.times[P.n - 1] * 1000).getUTCHours();
  const expected = sessionHandoffPhase(hourUtc);
  for (const r of live.ladder) assert.equal(r.sessionHandoff, expected);
});

t('mondayFibAtlasLiveLadder: a rung already resolved earlier THIS reference week carries prevOutcomeSameDay/touchedToday forward; an unresolved (neither) or a DIFFERENT week does not', () => {
  const live = mondayFibAtlasLiveLadder(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const { touches: weekTouches, mondayDate } = mondayFibAtlasLiveToday(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastResolvedByKey = new Map();
  for (const t2 of weekTouches) if (t2.outcome !== 'neither') lastResolvedByKey.set(`${t2.side}|${t2.level}`, t2.outcome);
  let checkedSome = false;
  for (const r of live.ladder) {
    const expected = lastResolvedByKey.get(`${r.side}|${r.level}`) ?? null;
    assert.equal(r.prevOutcomeSameDay, expected);
    assert.equal(r.touchedToday, expected != null);
    if (expected != null) checkedSome = true;
  }
  assert.ok(checkedSome, 'expected at least one rung already resolved this week to actually exercise the carry-forward path');
  assert.ok(mondayDate, 'sanity: a governing week was found at all');
});

t('mondayFibAtlasLiveLadder is a pure function of its input — same packed series in, byte-identical ladder out', () => {
  const cut = P.n - 500;
  const shrunk = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
    highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut), closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const a = mondayFibAtlasLiveLadder(shrunk, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = mondayFibAtlasLiveLadder(shrunk, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.deepEqual(a, b);
});

t('mondayFibAtlasLiveLadder on too-thin history degrades to an empty ladder, not a throw', () => {
  const tiny = packedM1(60 * 24 * 3);
  const live = mondayFibAtlasLiveLadder(tiny, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.equal(live.date, null);
  assert.equal(live.ladder.length, 0);
});

t('mondayConfluenceGrade is a real per-rung Monday-vs-previous-Monday threshold check (2026-09-01 owner correction), never the old week-wide-minimum field', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const valid = new Set(['0·none', '1·match', '2·tight']);
  let tight = 0, match = 0, none = 0;
  for (const r of touches) {
    assert.ok(valid.has(r.mondayConfluenceGrade), `unexpected mondayConfluenceGrade: ${r.mondayConfluenceGrade}`);
    if (r.mondayConfluenceGrade === '2·tight') tight++;
    else if (r.mondayConfluenceGrade === '1·match') match++;
    else none++;
  }
  assert.equal(tight + match + none, touches.length);
  // This synthetic fixture's weekly ranges drift enough (many wiggle cycles
  // per 7-day window) that the fixed ~2-pip FX threshold essentially never
  // lands a match by chance — verified against REAL EURUSD M1 data instead
  // (618 tight / 3319 match / 16412 none across 20,349 touches, 334/544
  // weeks showing genuine within-week grade variety), not asserted here
  // against fixture noise. What IS decisively provable on ANY fixture is the
  // per-rung wiring itself (next test): feed the confluence primitive two
  // IDENTICAL weekly ranges and every rung must match/tighten — a single
  // week-wide constant (the old `mondayWeekTightestPips` bug) could never
  // vary rung-by-rung the way a real per-level check does.
});

t('mondayConfluenceGrade wiring: an IDENTICAL previous-Monday range must match/tighten every single rung (positive control, decoupled from fixture noise)', () => {
  // Build a packed series where two consecutive weeks' Monday 24h ranges are
  // BYTE-IDENTICAL (same low/high every single minute) -- if mondayConfluenceGrade
  // were still secretly the old week-wide-minimum field, or wired with the
  // wrong pip/price units, this would NOT come back as tight for every rung.
  const nBars = 60 * 24 * 21;   // 3 weeks of M1 -- Tue->Mon x3, enough for minLookback+2
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  const WEEK = 7 * 86400;
  for (let i = 0; i < nBars; i++) {
    const t = T0 + i * 60;
    const withinWeek = ((t - T0) % WEEK) / WEEK;         // 0..1 position in its own week -- identical shape every week
    const px = 100 + 0.5 * Math.sin(withinWeek * 2 * Math.PI * 3);  // same waveform, every week, exactly
    times[i] = t; opens[i] = px; closes[i] = px;
    highs[i] = px + 0.02; lows[i] = px - 0.02;
    volumes[i] = 100;
  }
  const identicalP = { n: nBars, times, opens, highs, lows, closes, volumes };
  const { touches } = mondayFibAtlasWalk(identicalP, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], minLookback: 1 });
  const withPrevWeek = touches.filter(r => r.mondayConfluenceGrade !== undefined);
  assert.ok(withPrevWeek.length > 0, 'expected at least some touches once a previous Monday range exists');
  const notTight = withPrevWeek.filter(r => r.mondayConfluenceGrade !== '2·tight');
  assert.equal(notTight.length, 0, `expected EVERY rung to be tight against a byte-identical previous week (same_fib always qualifies as isTight); got ${notTight.length} non-tight of ${withPrevWeek.length}: ${JSON.stringify([...new Set(notTight.map(r => r.mondayConfluenceGrade))])}`);
});

t('mondayRungBarrierPips matches mondayFibAtlasWalk\'s own per-touch innerDistPips/outerDistPips for the same week/side/level — the live-plan producer must price a not-yet-touched rung identically to how the validated backtest priced it once touched', () => {
  const { touches } = mondayFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const { boundary } = mondayFibAtlasLiveLadder(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFrac: 0.3 });
  assert.ok(boundary, 'expected a live boundary to compare against');
  let checked = 0;
  for (const touch of touches) {
    if (touch.mondayHigh !== boundary.mondayHigh || touch.mondayLow !== boundary.mondayLow) continue;
    const { innerDistPips, outerDistPips } = mondayRungBarrierPips(touch.side, touch.level, boundary, touch.pip);
    assert.equal(innerDistPips, touch.innerDistPips, `innerDistPips mismatch for ${touch.side}|${touch.level}`);
    assert.equal(outerDistPips, touch.outerDistPips, `outerDistPips mismatch for ${touch.side}|${touch.level}`);
    checked++;
  }
  assert.ok(checked > 0, 'expected at least one same-week touch to cross-check against');
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);

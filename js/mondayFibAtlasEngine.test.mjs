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
import { mondayFibAtlasWalk } from './mondayFibAtlasEngine.js';
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

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);

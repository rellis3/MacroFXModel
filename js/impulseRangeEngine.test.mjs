// Unit tests for impulseRangeEngine.js — pure logic, no network.
// Run: node js/impulseRangeEngine.test.mjs
import assert from 'node:assert';
import {
  detectFVG, detectH4Impulses, impulseLevels, buildVwapContext, vwapAt,
  computeAsiaConfluence, classifyLtfReaction, scoreImpulse, runImpulseRangeScan,
  aggregateImpulseStats, londonHourOf, londonWeekdayOf,
} from './impulseRangeEngine.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

function mkBar(date, hh, mm, o, h, l, c, extra = {}) {
  const dt = `${date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  return { datetime: dt, time: Math.floor(new Date(dt.replace(' ', 'T') + 'Z').getTime() / 1000), open: o, high: h, low: l, close: c, ...extra };
}

console.log('impulseRangeEngine — pure logic tests');

// ── detectFVG ────────────────────────────────────────────────────────────────

t('detectFVG: bullish gap when bars[i-2].high < bars[i].low', () => {
  const bars = [
    { high: 101, low: 100 },
    { high: 103, low: 99 },
    { high: 106, low: 105 }, // low(105) > bars[0].high(101)
  ];
  const fvg = detectFVG(bars, 2);
  assert.equal(fvg.direction, 'up');
  assert.equal(fvg.bottom, 101);
  assert.equal(fvg.top, 105);
});

t('detectFVG: bearish gap when bars[i-2].low > bars[i].high', () => {
  const bars = [
    { high: 105, low: 104 },
    { high: 103, low: 99 },
    { high: 100, low: 98 }, // high(100) < bars[0].low(104)
  ];
  const fvg = detectFVG(bars, 2);
  assert.equal(fvg.direction, 'down');
});

t('detectFVG: no gap when ranges overlap, and null before i=2', () => {
  const bars = [{ high: 105, low: 100 }, { high: 106, low: 101 }, { high: 104, low: 102 }];
  assert.equal(detectFVG(bars, 2), null);
  assert.equal(detectFVG(bars, 1), null);
});

// ── detectH4Impulses ─────────────────────────────────────────────────────────

// 5 flat prior H4 bars (body 0.5, avgBody=0.5), then one candidate bar.
function mkH4Series(lastBar) {
  const bars = [];
  let t0 = 1_700_000_000;
  for (let i = 0; i < 5; i++) {
    bars.push({ time: t0, open: 100, high: 100.6, low: 99.9, close: 100.5 });
    t0 += 14400;
  }
  bars.push({ time: t0, ...lastBar });
  return bars;
}

t('detectH4Impulses: clean bullish impulse (high body%, close near high, 8x avg body) qualifies', () => {
  const bars = mkH4Series({ open: 100, high: 104.1, low: 99.9, close: 104 });
  const out = detectH4Impulses(bars, { bodyLookback: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0].direction, 'up');
  assert.ok(out[0].bodyToAvg > 7 && out[0].bodyToAvg < 9, `bodyToAvg was ${out[0].bodyToAvg}`);
});

t('detectH4Impulses: rejects a large-body candle with a heavy opposing wick (bodyPct too low)', () => {
  // body=4 (open100/close104), but low=94 (huge lower wick below open) -> range=104.1-94=10.1, bodyPct=4/10.1≈0.396 < 0.65
  const bars = mkH4Series({ open: 100, high: 104.1, low: 94, close: 104 });
  const out = detectH4Impulses(bars, { bodyLookback: 5 });
  assert.equal(out.length, 0);
});

t('detectH4Impulses: rejects a candle whose close sits far from its own extreme (rejection wick)', () => {
  // open=low=100 (no lower wick), close=104, high=106 -> bodyPct=4/6=0.667 (passes), but
  // closeFromExtremePct=(106-104)/6=0.333 > 0.20 (fails) — isolates the extreme-proximity check.
  const bars = mkH4Series({ open: 100, high: 106, low: 100, close: 104 });
  const out = detectH4Impulses(bars, { bodyLookback: 5 });
  assert.equal(out.length, 0);
});

t('detectH4Impulses: average-body window is strictly causal — a huge bar OUTSIDE the lookback does not inflate avgBody', () => {
  // Prepend one huge-body bar before the 5-bar flat lookback window; if it
  // leaked into avgBody, bodyToAvg would drop well below the 1.5x threshold
  // and the impulse would wrongly fail to qualify.
  const bars = [{ time: 1_699_985_600, open: 100, high: 150, low: 50, close: 149 }, ...mkH4Series({ open: 100, high: 104.1, low: 99.9, close: 104 })];
  const out = detectH4Impulses(bars, { bodyLookback: 5 });
  assert.equal(out.length, 1, 'impulse should still qualify — the huge outside-window bar must not dilute avgBody');
});

t('detectH4Impulses: bearish impulse detected symmetrically', () => {
  const bars = mkH4Series({ open: 104, high: 104.1, low: 99.9, close: 100 });
  const out = detectH4Impulses(bars, { bodyLookback: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0].direction, 'down');
});

// ── impulseLevels ────────────────────────────────────────────────────────────

t('impulseLevels: fib 0/1 map to low/high, extensions project beyond the range', () => {
  const imp = { open: 100.5, high: 104, low: 100, close: 103.8, range: 4 };
  const levels = impulseLevels(imp, { extensions: [0.25, 0.5] });
  const byFib = f => levels.find(l => Math.abs(l.fib - f) < 1e-9);
  assert.equal(byFib(0).price, 100);
  assert.equal(byFib(1).price, 104);
  assert.equal(byFib(0.5).price, 102);
  assert.equal(byFib(1.25).price, 105); // low + range*1.25 = 100 + 5 = 105
  assert.equal(byFib(-0.25).price, 99); // low - range*0.25 = 100 - 1 = 99
  assert.equal(byFib(1.5).price, 106);
  assert.equal(byFib(-0.5).price, 98);
});

// ── VWAP context ─────────────────────────────────────────────────────────────

t('buildVwapContext + vwapAt: resets per day, nearest-at-or-before lookup works', () => {
  const day1 = [
    mkBar('2026-01-05', 0, 0, 100, 101, 99, 100, { volume: 10 }),
    mkBar('2026-01-05', 0, 5, 100, 105, 100, 104, { volume: 10 }),
  ];
  const day2 = [
    mkBar('2026-01-06', 0, 0, 200, 201, 199, 200, { volume: 10 }),
  ];
  const ctx = buildVwapContext([...day1, ...day2]);
  const atLastDay1 = vwapAt(ctx, day1[1].time);
  assert.ok(atLastDay1.vwap > 100 && atLastDay1.vwap < 105);
  // Day 2's VWAP is anchored purely to its own (~200) prices, not dragged
  // toward day 1's (~100) cumulative volume — proves the daily reset.
  const atDay2 = vwapAt(ctx, day2[0].time);
  assert.ok(atDay2.vwap > 195, `day2 vwap should reset near 200, was ${atDay2.vwap}`);
  // A lookup between two known points returns the earlier (at-or-before) row.
  const between = vwapAt(ctx, day1[1].time + 1);
  assert.equal(between.idx, atLastDay1.idx);
});

// ── computeAsiaConfluence ────────────────────────────────────────────────────

t('computeAsiaConfluence: flags confluence when an impulse level lands within the FX pip threshold of an Asia level', () => {
  const impulseTime = Math.floor(Date.parse('2026-01-06T12:00:00Z') / 1000); // London = UTC in January
  const levelsArr = [{ fib: 1.25, price: 1.1051 }, { fib: 0, price: 1.0900 }];
  const asiaTimeline = [{ date: '2026-01-06', levels: [{ fib: 1, price: 1.1050 }, { fib: -2, price: 1.0500 }], confluences: [] }];
  const conf = computeAsiaConfluence(levelsArr, impulseTime, asiaTimeline, [], 'EUR/USD');
  assert.equal(conf.hasConfluence, true);
  assert.equal(conf.asia.length, 1);
});

t('computeAsiaConfluence: no confluence when nothing is close', () => {
  const impulseTime = Math.floor(Date.parse('2026-01-06T12:00:00Z') / 1000);
  const levelsArr = [{ fib: 1.25, price: 1.2000 }];
  const asiaTimeline = [{ date: '2026-01-06', levels: [{ fib: 1, price: 1.1050 }], confluences: [] }];
  const conf = computeAsiaConfluence(levelsArr, impulseTime, asiaTimeline, [], 'EUR/USD');
  assert.equal(conf.hasConfluence, false);
});

// ── classifyLtfReaction ──────────────────────────────────────────────────────
// Shared impulse: low=100, high=104, range=4, close=103.8 (near high, 'up').
// Defaults: contTarget=103.8+0.25*4=104.8, contStop=103.8-0.25*4=102.8,
// extLevelPrice=104+0.5*4=106.
function mkImpulse() {
  return { time: 1_700_000_000, direction: 'up', open: 100.2, high: 104, low: 100, close: 103.8, range: 4 };
}
function ltfBar(time, o, h, l, c) { return { time, open: o, high: h, low: l, close: c }; }

t('classifyLtfReaction: CONTINUATION — close beyond contTarget without ever reaching the (deeper) extension zone', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  const bars = [
    ltfBar(closeTime, 103.8, 104.5, 103.7, 104.3),
    ltfBar(closeTime + 300, 104.3, 105.0, 104.2, 104.9), // close 104.9 >= 104.8, high 105.0 < 106
  ];
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), {});
  assert.equal(r.outcome, 'CONTINUATION');
  assert.equal(round2(r.mfe), 1.2); // max(104.5-103.8, 105.0-103.8) = 1.2
  assert.equal(round2(r.mae), 0.1); // max(103.8-103.7, ...) = 0.1
  // The implied trade: long at entry(103.8), exit at the bar close that won
  // the contTarget race (104.9) — a realized, resolved exit, not open.
  assert.equal(r.entry, 103.8);
  assert.equal(r.dir, 'up');
  assert.equal(r.exitPrice, 104.9);
  assert.equal(round2(r.returnPrice), 1.1);
  assert.equal(r.open, false);
});

t('classifyLtfReaction: REVERSION — reaches the extension zone then closes back inside the impulse range', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  const bars = [
    ltfBar(closeTime, 103.8, 106.5, 103.7, 105.0),      // touches ext (106), close 105.0 still above impulse.high
    ltfBar(closeTime + 300, 105.0, 105.2, 103.5, 103.9), // close 103.9 <= impulse.high(104) -> reverted
  ];
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), {});
  assert.equal(r.outcome, 'REVERSION');
  // Exit is the close that actually came back inside the impulse range
  // (103.9), not the extension level it wicked through — a REVERSION trade
  // realizes a small gain here, not the loss a naive "faded the top" read
  // might expect, since entry was long at the impulse's own close.
  assert.equal(r.exitPrice, 103.9);
  assert.equal(round2(r.returnPrice), 0.1);
  assert.equal(r.open, false);
});

t('classifyLtfReaction: EXTENSION — reaches the extension zone and never returns within the horizon', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  const bars = [
    ltfBar(closeTime, 103.8, 106.5, 103.7, 105.5),
    ltfBar(closeTime + 300, 105.5, 107.0, 104.8, 106.5), // stays well above impulse.high the whole time
  ];
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), { horizonBars: 2 });
  assert.equal(r.outcome, 'EXTENSION');
  // Never resolved within the horizon — exit is a mark-to-last-close
  // snapshot, flagged open:true so callers don't read it as a realized fill.
  assert.equal(r.exitPrice, 106.5);
  assert.equal(r.open, true);
});

t('classifyLtfReaction: FAILED_IMPULSE — closes beyond contStop before ever reaching contTarget or the extension zone', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  const bars = [ltfBar(closeTime, 103.8, 104.0, 102.5, 102.7)]; // close 102.7 <= contStop(102.8)
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), {});
  assert.equal(r.outcome, 'FAILED_IMPULSE');
  assert.equal(r.exitPrice, 102.7);
  assert.equal(round2(r.returnPrice), -1.1); // a real loss on the implied long
  assert.equal(r.open, false);
});

t('classifyLtfReaction: NO_CLEAR_EDGE — chops inside the target/stop band for the whole horizon', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  const bars = [
    ltfBar(closeTime, 103.8, 104.0, 103.5, 103.9),
    ltfBar(closeTime + 300, 103.9, 104.1, 103.6, 103.8),
  ];
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), { horizonBars: 2 });
  assert.equal(r.outcome, 'NO_CLEAR_EDGE');
  assert.equal(r.exitPrice, 103.8); // mark-to-last-close, unresolved
  assert.equal(r.open, true);
});

t('classifyLtfReaction: displacement evidence fires on a single large-body bar in the impulse direction', () => {
  const imp = mkImpulse();
  const closeTime = imp.time + 4 * 3600;
  // Small bars to seed a small ATR, then one big-body bar (>=1.5x ATR) up.
  const bars = [
    ltfBar(closeTime, 103.8, 104.0, 103.7, 103.9),
    ltfBar(closeTime + 300, 103.9, 104.0, 103.8, 103.95),
    ltfBar(closeTime + 600, 103.95, 106.0, 103.9, 105.9), // big bullish body
  ];
  const r = classifyLtfReaction(bars, imp, impulseLevels(imp), { horizonBars: 3 });
  assert.equal(r.evidence.continuation.displacement, true);
});

function round2(x) { return Math.round(x * 100) / 100; }

// ── scoreImpulse ─────────────────────────────────────────────────────────────

t('scoreImpulse: sums weighted evidence and classifies edge only when the margin is met', () => {
  const evidence = {
    continuation: { displacement: true, fvgAligned: true, structureBreakAligned: false, pullbackThenContinuation: false, vwapAligned: false, vwapSlopeAligned: false, notExtendedFromVwap: false },
    fade: { extendedFromVwap: false, rejectedExtensionLevel: false, rejectionWick: false, breakoutFailedQuick: false, structureBreakAgainst: false, asiaConfluencePresent: false, vwapFlat: false },
  };
  const s = scoreImpulse(evidence);
  assert.equal(s.continuationScore, 35); // displacement(20) + fvgAligned(15)
  assert.equal(s.fadeScore, 0);
  assert.equal(s.edge, 'CONTINUATION');
});

t('scoreImpulse: close scores classify as NO_CLEAR_EDGE', () => {
  const evidence = {
    continuation: { displacement: false, fvgAligned: false, structureBreakAligned: false, pullbackThenContinuation: true, vwapAligned: false, vwapSlopeAligned: false, notExtendedFromVwap: false },
    fade: { extendedFromVwap: false, rejectedExtensionLevel: false, rejectionWick: true, breakoutFailedQuick: false, structureBreakAgainst: false, asiaConfluencePresent: false, vwapFlat: false },
  };
  const s = scoreImpulse(evidence); // cont=15, fade=15, diff=0 < margin(15)
  assert.equal(s.edge, 'NO_CLEAR_EDGE');
});

// ── aggregateImpulseStats ────────────────────────────────────────────────────

function mkEvent(outcome, session, symbol = 'EUR/USD') {
  return {
    direction: 'up', range: 4, bodyPct: 0.8, symbol,
    londonHour: session === 'asia' ? 2 : session === 'london' ? 9 : 15,
    londonWeekday: 'Tue',
    asiaConfluence: { hasConfluence: outcome === 'REVERSION' },
    scores: { edge: outcome === 'CONTINUATION' ? 'CONTINUATION' : 'NO_CLEAR_EDGE' },
    ltfGranularityMin: 3,
    reaction: { outcome, mfe: 1, mae: 0.5 },
  };
}

t('aggregateImpulseStats: overall counts, outcome%, and group breakdowns are consistent', () => {
  const events = [mkEvent('CONTINUATION', 'asia'), mkEvent('CONTINUATION', 'london'), mkEvent('REVERSION', 'ny'), mkEvent('NO_CLEAR_EDGE', 'ny')];
  const stats = aggregateImpulseStats(events);
  assert.equal(stats.overall.count, 4);
  assert.equal(stats.overall.outcomePct.CONTINUATION, 50);
  assert.equal(stats.overall.outcomePct.REVERSION, 25);
  const bySession = Object.fromEntries(stats.bySession.map(g => [g.key, g.count]));
  assert.deepEqual(bySession, { asia: 1, london: 1, ny: 2 });
  const byConf = Object.fromEntries(stats.byAsiaConfluence.map(g => [g.key, g.count]));
  assert.equal(byConf.confluent, 1);
  assert.equal(byConf.no_confluence, 3);
});

// ── londonHourOf / londonWeekdayOf ───────────────────────────────────────────

t('londonHourOf / londonWeekdayOf: parse epoch seconds via London calendar (no DST in January)', () => {
  const t0 = Math.floor(Date.parse('2026-01-06T14:00:00Z') / 1000); // Tuesday, London=UTC in Jan
  assert.equal(londonHourOf(t0), 14);
  assert.equal(londonWeekdayOf(t0), 'Tue');
});

// ── runImpulseRangeScan ──────────────────────────────────────────────────────
// End-to-end smoke test: real resampleToH4 + buildLevelTimeline wiring, a
// deliberately spaced-out synthetic feed (each "bar" is its own 4h bucket)
// so a single designed impulse candle survives resampling untouched.

function mkH4AsBars(specs) {
  let time = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000);
  return specs.map(s => { const b = { time, ...s }; time += 14400; return b; });
}
function mkFlatDay5m(date, price = 1.1000) {
  const bars = [];
  for (let m = 0; m < 24 * 60; m += 5) {
    const hh = Math.floor(m / 60), mm = m % 60;
    bars.push(mkBar(date, hh, mm, price, price + 0.0002, price - 0.0002, price));
  }
  return bars;
}

t('runImpulseRangeScan: runs end-to-end without throwing and produces well-formed events', () => {
  const flatBody = { open: 1.1000, high: 1.1006, low: 1.0999, close: 1.1005 };
  const specs = Array.from({ length: 20 }, () => flatBody);
  specs.push({ open: 1.1000, high: 1.1041, low: 1.0999, close: 1.1040 }); // impulse
  const h4SourceBars = mkH4AsBars(specs);
  const asiaSourceBars = [...mkFlatDay5m('2026-01-05'), ...mkFlatDay5m('2026-01-06')];
  const ltfBars = h4SourceBars.map((b, i) => ({ ...b, datetime: `2026-01-0${5 + Math.floor(i / 6)} 00:00:00` }));

  const events = runImpulseRangeScan({ h4SourceBars, asiaSourceBars, ltfBars, symbol: 'EUR/USD', opts: { bodyLookback: 20 } });
  assert.ok(Array.isArray(events));
  for (const e of events) {
    assert.ok(['up', 'down'].includes(e.direction));
    assert.ok(Array.isArray(e.levels) && e.levels.length > 0);
    assert.ok(e.reaction === null || typeof e.reaction.outcome === 'string');
    assert.ok(typeof e.scores.continuationScore === 'number');
  }
});

console.log(`\n${passed} passed`);

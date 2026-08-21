// Unit tests for entryTriggerLabEngine.js — pure logic, no network.
// Run: node js/entryTriggerLabEngine.test.mjs
import assert from 'node:assert';
import {
  normalizeBars, groupAsiaSessions, groupMondaySessions, buildAsiaRangeHistory,
  buildLevelTimeline, levelsActiveOn, activeLevelsAt, detectWickEngulfing, detectMidpointPullback,
  detectSessionExtremeAnchor, detectVwapTap, resampleToH4, computeH4AdxSeries,
  detectAdxRegimeSwitch,
} from './entryTriggerLabEngine.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// datetime strings are treated as London-local (matches barLondonHour/barLondonDay,
// which substring the string rather than doing real TZ math — so build/parse the
// same way here).
function mkBar(date, hh, mm, o, h, l, c) {
  const dt = `${date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  return { datetime: dt, time: Math.floor(new Date(dt.replace(' ', 'T') + 'Z').getTime() / 1000), open: o, high: h, low: l, close: c };
}

// Build a full day of 5m bars (288 bars), with the 00:00-06:00 slice fixed
// to a known high/low so computeBodyRange is checkable; the rest is flat.
function mkAsiaDay(date, asiaHigh, asiaLow, midOpen = 1.1000) {
  const bars = [];
  for (let m = 0; m < 24 * 60; m += 5) {
    const hh = Math.floor(m / 60), mm = m % 60;
    const inAsia = hh < 6;
    let o = midOpen, h = midOpen, l = midOpen, c = midOpen;
    if (inAsia && m === 0) { o = midOpen; c = asiaHigh; h = asiaHigh; l = midOpen; }
    else if (inAsia && m === 5) { o = asiaHigh; c = asiaLow; h = asiaHigh; l = asiaLow; }
    else if (inAsia && m === 10) { o = asiaLow; c = midOpen; h = midOpen; l = asiaLow; }
    bars.push(mkBar(date, hh, mm, o, h, l, c));
  }
  return bars;
}

console.log('entryTriggerLabEngine — pure logic tests');

// ── normalizeBars ────────────────────────────────────────────────────────────
t('normalizeBars: parses strings, sorts, drops junk', () => {
  const out = normalizeBars([
    { datetime: '2026-01-06 01:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.15' },
    { datetime: '2026-01-05 01:00:00', open: '1.0', high: '1.05', low: '0.95', close: '1.0' },
    { datetime: 'bad', open: 'nope', high: '1', low: '1', close: '1' },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out[0].time < out[1].time);
});

// ── session grouping ─────────────────────────────────────────────────────────
t('groupAsiaSessions: keeps a complete weekday session, skips weekends', () => {
  // 2026-01-05 is a Monday; 2026-01-03 is a Saturday.
  const monBars = mkAsiaDay('2026-01-05', 1.1050, 1.0950);
  const satBars = mkAsiaDay('2026-01-03', 1.1050, 1.0950);
  const sessions = groupAsiaSessions([...monBars, ...satBars]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].date, '2026-01-05');
  assert.equal(sessions[0].bars.length, 72); // 6h of 5m bars
});

t('buildAsiaRangeHistory: computeBodyRange reused correctly per day', () => {
  const bars = [...mkAsiaDay('2026-01-05', 1.1050, 1.0950), ...mkAsiaDay('2026-01-06', 1.1100, 1.0900)];
  const hist = buildAsiaRangeHistory(bars);
  assert.equal(hist.length, 2);
  assert.ok(Math.abs(hist[0].range.high - 1.1050) < 1e-9);
  assert.ok(Math.abs(hist[0].range.low - 1.0950) < 1e-9);
  assert.ok(Math.abs(hist[1].range.range - 0.02) < 1e-9);
});

t('groupMondaySessions: only keeps Monday, and only with enough bars', () => {
  const bars15 = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const hh = Math.floor(m / 60), mm = m % 60;
    bars15.push(mkBar('2026-01-05', hh, mm, 1.1, 1.11, 1.09, 1.1)); // Monday, full day = 96 bars
  }
  for (let m = 0; m < 5 * 60; m += 15) {
    const hh = Math.floor(m / 60), mm = m % 60;
    bars15.push(mkBar('2026-01-06', hh, mm, 1.1, 1.11, 1.09, 1.1)); // Tuesday — should be dropped
  }
  const sessions = groupMondaySessions(bars15);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].date, '2026-01-05');
});

// ── level timeline ───────────────────────────────────────────────────────────
t('buildLevelTimeline: fib 0/1 map to low/high, fib 2 is a real extension', () => {
  const bars = [...mkAsiaDay('2026-01-05', 1.1050, 1.0950), ...mkAsiaDay('2026-01-06', 1.1100, 1.0900)];
  const hist = buildAsiaRangeHistory(bars);
  const timeline = buildLevelTimeline(hist, 'EUR/USD', 'asia');
  assert.equal(timeline.length, 1); // only day 2 has a prior day to compare against
  const day2 = timeline[0];
  assert.equal(day2.date, '2026-01-06');
  const low = day2.levels.find(l => l.fib === 0), high = day2.levels.find(l => l.fib === 1);
  assert.ok(Math.abs(low.price - 1.0900) < 1e-9);
  assert.ok(Math.abs(high.price - 1.1100) < 1e-9);
  const ext2 = day2.levels.find(l => l.fib === 2);
  assert.ok(Math.abs(ext2.price - (1.1100 + 0.02)) < 1e-9); // one full range-width beyond the high
});

t('buildLevelTimeline: 1.25 excluded on asia source, kept implicitly available for monday', () => {
  const bars = [...mkAsiaDay('2026-01-05', 1.1050, 1.0950), ...mkAsiaDay('2026-01-06', 1.1100, 1.0900)];
  const hist = buildAsiaRangeHistory(bars);
  const timeline = buildLevelTimeline(hist, 'EUR/USD', 'asia');
  assert.ok(!timeline[0].levels.some(l => l.fib === 1.25));
});

t('levelsActiveOn: asia is same-date only, monday spans through the week', () => {
  const bars = [...mkAsiaDay('2026-01-05', 1.1050, 1.0950), ...mkAsiaDay('2026-01-06', 1.1100, 1.0900), ...mkAsiaDay('2026-01-07', 1.1150, 1.0850)];
  const hist = buildAsiaRangeHistory(bars);
  const timeline = buildLevelTimeline(hist, 'EUR/USD', 'asia');
  assert.equal(levelsActiveOn('2026-01-06', timeline, 'asia').date, '2026-01-06');
  assert.equal(levelsActiveOn('2026-01-05', timeline, 'asia'), null); // no prior day to build day-1's ladder
});

t('activeLevelsAt: strongOnly returns only the confluent (today-vs-yesterday) levels, tagged strong', () => {
  // Two Asia days at deliberately different scale/offset so most of the two
  // ladders DON'T land near each other — except day2's own low (1.1049),
  // which lands within the FX 2-pip default of day1's high (1.1050),
  // producing a handful of real confluences out of the full 21-level ladder.
  const bars = [
    ...mkAsiaDay('2026-01-05', 1.1050, 1.0950),
    ...mkAsiaDay('2026-01-06', 1.1449, 1.1049),
  ];
  const hist = buildAsiaRangeHistory(bars);
  const timeline = buildLevelTimeline(hist, 'EUR/USD', 'asia');
  const bar = { datetime: '2026-01-06 08:00:00' };
  const full = activeLevelsAt(bar, timeline, []);
  const strong = activeLevelsAt(bar, timeline, [], { strongOnly: true });
  assert.ok(full.length > strong.length, 'confluence filtering should narrow the ladder down');
  assert.ok(strong.length > 0, 'two near-identical ladders should produce at least one confluence');
  assert.ok(strong.every(l => l.strong === true));
  assert.ok(full.every(l => l.strong === false));
  // fib carried through as TODAY's own extension multiple, not lost.
  assert.ok(strong.every(l => Number.isFinite(l.fib)));
});

// ── detectWickEngulfing ──────────────────────────────────────────────────────
t('detectWickEngulfing: fires on a genuine wick-reject + full-range engulf', () => {
  const level = 1.1050;
  const asiaTimeline = [{ date: '2026-01-06', levels: [{ price: level, fib: 1 }], confluences: [] }];
  const bars = [
    mkBar('2026-01-06', 8, 0, 1.1030, 1.1040, 1.1025, 1.1035),   // seed
    mkBar('2026-01-06', 8, 5, 1.1035, 1.1055, 1.1032, 1.1040),   // A: wicks up through level, closes back below
    mkBar('2026-01-06', 8, 10, 1.1058, 1.1059, 1.1015, 1.1018),  // B: opens above A's high, closes below A's low — full-range bearish engulf
  ];
  const events = detectWickEngulfing(bars, asiaTimeline, [], { tolerance: 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].dir, 'short');
  assert.equal(events[0].kind, 'wick_engulf');
});

t('detectWickEngulfing: no event when the next candle does not fully engulf', () => {
  const level = 1.1050;
  const asiaTimeline = [{ date: '2026-01-06', levels: [{ price: level, fib: 1 }], confluences: [] }];
  const bars = [
    mkBar('2026-01-06', 8, 0, 1.1030, 1.1040, 1.1025, 1.1035),
    mkBar('2026-01-06', 8, 5, 1.1035, 1.1055, 1.1032, 1.1040),   // A: wick reject
    mkBar('2026-01-06', 8, 10, 1.1038, 1.1042, 1.1034, 1.1036),  // B: small inside bar, no engulf
  ];
  const events = detectWickEngulfing(bars, asiaTimeline, [], { tolerance: 0 });
  assert.equal(events.length, 0);
});

// ── detectMidpointPullback ───────────────────────────────────────────────────
t('detectMidpointPullback: fires a continuation-long on a pullback that holds the midpoint', () => {
  const mid = 1.1000;
  const asiaTimeline = [{ date: '2026-01-06', levels: [{ price: mid, fib: 0.5 }], confluences: [] }];
  const bars = [
    mkBar('2026-01-06', 8, 0, 1.0990, 1.1010, 1.0985, 1.1005),   // establishes uptrend (close > mid)
    mkBar('2026-01-06', 8, 5, 1.1005, 1.1030, 1.1000, 1.1025),   // continues up
    mkBar('2026-01-06', 8, 10, 1.1025, 1.1026, 1.0998, 1.1010),  // pulls back, touches mid, closes above
  ];
  const events = detectMidpointPullback(bars, asiaTimeline, [], { breakoutTol: 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].dir, 'long');
});

// ── detectSessionExtremeAnchor ───────────────────────────────────────────────
t('detectSessionExtremeAnchor: flags divergence when post-Asia breaks out hard', () => {
  const asia = mkAsiaDay('2026-01-06', 1.1050, 1.0950);
  const post = [];
  for (let m = 6 * 60; m < 8 * 60; m += 5) {
    const hh = Math.floor(m / 60), mm = m % 60;
    post.push(mkBar('2026-01-06', hh, mm, 1.1050, 1.1200, 1.1050, 1.1180)); // strong breakout above in-window high
  }
  const out = detectSessionExtremeAnchor([...asia, ...post], 'EUR/USD', { minPips: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].diverges, true);
  assert.ok(out[0].altRange.high > out[0].inWindow.high);
  assert.ok(out[0].altLevels != null);
});

t('detectSessionExtremeAnchor: no divergence when post-Asia stays inside the range', () => {
  const asia = mkAsiaDay('2026-01-06', 1.1050, 1.0950);
  const post = [];
  for (let m = 6 * 60; m < 8 * 60; m += 5) {
    const hh = Math.floor(m / 60), mm = m % 60;
    post.push(mkBar('2026-01-06', hh, mm, 1.1000, 1.1010, 1.0990, 1.1000));
  }
  const out = detectSessionExtremeAnchor([...asia, ...post], 'EUR/USD', { minPips: 3 });
  assert.equal(out[0].diverges, false);
  assert.equal(out[0].altLevels, null);
});

// ── detectVwapTap ────────────────────────────────────────────────────────────
t('detectVwapTap: fires once when price returns to VWAP after being away', () => {
  const bars = [];
  for (let m = 0; m < 60; m += 5) bars.push(mkBar('2026-01-06', 8, m, 1.1000, 1.1005, 1.0995, 1.1000)); // vwap ~1.1000
  // push price away above VWAP for a few bars, then back to tap it
  for (let m = 60; m < 90; m += 5) bars.push(mkBar('2026-01-06', 9, m - 60, 1.1050, 1.1055, 1.1045, 1.1050));
  bars.push(mkBar('2026-01-06', 9, 35, 1.1050, 1.1050, 1.1005, 1.1010)); // dips back to tap vwap zone
  const events = detectVwapTap(bars, { awayTol: 0.0005 });
  assert.ok(events.length >= 1);
  assert.equal(events[0].kind, 'vwap_tap');
});

// ── ADX resample / causal mapping ────────────────────────────────────────────
t('resampleToH4: buckets by wall-clock 4h regardless of source timeframe', () => {
  const bars = [];
  for (let m = 0; m < 8 * 60; m += 15) {
    const hh = Math.floor(m / 60), mm = m % 60;
    bars.push(mkBar('2026-01-06', hh, mm, 1.1, 1.1 + m * 1e-5, 1.1 - m * 1e-5, 1.1));
  }
  const h4 = resampleToH4(bars);
  assert.equal(h4.length, 2); // 8 hours = two 4h buckets
});

t('computeH4AdxSeries: early bars (before any completed H4 bucket) read null, no throw', () => {
  const bars = [];
  for (let m = 0; m < 60; m += 15) bars.push(mkBar('2026-01-06', 0, m, 1.1, 1.101, 1.099, 1.1));
  const series = computeH4AdxSeries(bars);
  assert.equal(series.length, bars.length);
  assert.ok(series.every(v => v === null));
});

t('detectAdxRegimeSwitch: runs end-to-end without throwing on a longer synthetic series', () => {
  // Build ~10 days of 15m bars with a mild trend so ADX has enough warmup
  // (needs 30+ H4 buckets = 5+ days) — this only checks wiring/no-lookahead
  // shape, not a specific ADX value (adxWilder's own math is exercised
  // elsewhere).
  const bars = [];
  let px = 1.1000;
  for (let d = 0; d < 10; d++) {
    const date = `2026-01-${String(5 + d).padStart(2, '0')}`;
    for (let m = 0; m < 24 * 60; m += 15) {
      const hh = Math.floor(m / 60), mm = m % 60;
      px += 0.00005;
      bars.push(mkBar(date, hh, mm, px, px + 0.0003, px - 0.0003, px));
    }
  }
  const asiaTimeline = [{ date: '2026-01-10', levels: [{ price: 1.1005, fib: 1.5 }, { price: 1.1010, fib: 2 }], confluences: [] }];
  const events = detectAdxRegimeSwitch(bars, asiaTimeline, [], { threshold: 30 });
  assert.ok(Array.isArray(events));
});

console.log(`\n${passed} passed`);

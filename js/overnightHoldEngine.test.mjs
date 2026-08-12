import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overlappingRange, buildTradingDates, priceAt, computeMAEPct,
  buildOvernightTrades, mirrorTest, applyCosts, buildBuyHoldBenchmark,
  correlationToBuyHold, computeMetricsTable, maxDrawdownWithDuration,
  toCsvReturns, toCsvRMultiples, toCsvCurrency, combineInstruments,
  runPropFirmRuleCheck, runOvernightHoldBacktest, addDays,
  resampleDailyFromPacked, costSensitivitySweep,
  yearlyDiversificationBreakdown, diversificationIsOosSplit,
  weekdayBreakdown,
} from './overnightHoldEngine.js';
import { dowOf } from './sessionRanges.js';

// ── Synthetic M1 data (no network) ──────────────────────────────────────────
// Continuous minute bars from `startIso` to `endIso` (UTC), EXCEPT a
// weekend gap (Fri 22:00 UTC → Sun 22:00 UTC) mimicking a real FX/CFD
// broker feed. Price is a smooth deterministic drift + wave so every number
// downstream is hand-checkable, plus a single manufactured "spike minute"
// so MAE has something real to find.
function buildSyntheticPacked(startIso, endIso, { basePrice = 2000, driftPerMin = 0.002, spikeAt = null, spikeDrop = -5 } = {}) {
  const startEpoch = Date.parse(startIso + 'T00:00:00Z') / 1000;
  const endEpoch = Date.parse(endIso + 'T00:00:00Z') / 1000;
  const times = [], opens = [], highs = [], lows = [], closes = [];
  let i = 0;
  for (let t = startEpoch; t < endEpoch; t += 60) {
    const d = new Date(t * 1000);
    const dow = d.getUTCDay(), hh = d.getUTCHours();
    // weekend closure: Fri >=22:00 UTC through Sun <22:00 UTC
    const closed = (dow === 6) || (dow === 5 && hh >= 22) || (dow === 0 && hh < 22);
    if (closed) continue;
    const wave = Math.sin(i / 500) * 3;
    let close = basePrice + driftPerMin * i + wave;
    let low = close - 0.05, high = close + 0.05;
    if (spikeAt !== null && t === spikeAt) { low = close + spikeDrop; }
    times.push(t); opens.push(close); highs.push(high); lows.push(low); closes.push(close);
    i++;
  }
  return {
    n: times.length,
    times: Int32Array.from(times),
    opens: Float32Array.from(opens),
    highs: Float32Array.from(highs),
    lows: Float32Array.from(lows),
    closes: Float32Array.from(closes),
  };
}

test('overlappingRange: trims to the intersection of two ranges', () => {
  const a = buildSyntheticPacked('2025-01-01', '2025-02-01');
  const b = buildSyntheticPacked('2025-01-10', '2025-02-15');
  const ov = overlappingRange(a, b);
  assert.ok(ov.start >= a.times[0] && ov.start >= b.times[0]);
  assert.ok(ov.end <= a.times[a.n - 1] && ov.end <= b.times[b.n - 1]);
  assert.equal(overlappingRange({ n: 0 }, b), null);
});

test('buildTradingDates: only Sun–Thu, never Fri/Sat, spans a DST transition cleanly', () => {
  // 2025-03-30 is the last Sunday of March (UK clocks go forward — BST starts).
  const dates = buildTradingDates(
    Date.parse('2025-03-24T00:00:00Z') / 1000,
    Date.parse('2025-04-07T00:00:00Z') / 1000,
  );
  for (const d of dates) {
    const dow = dowOf(d);
    assert.ok(dow >= 0 && dow <= 4, `${d} has dow ${dow}, expected Sun-Thu`);
  }
  // No Friday or Saturday dates present at all.
  assert.ok(!dates.some(d => dowOf(d) === 5 || dowOf(d) === 6));
});

test('priceAt: last-tick-at-or-before, null beyond tolerance (no fabricated fill)', () => {
  const packed = buildSyntheticPacked('2025-01-06', '2025-01-07'); // a Monday, no weekend gap inside
  const t0 = packed.times[0];
  const hit = priceAt(packed, t0 + 30, 1800);
  assert.ok(hit && hit.actualEpoch <= t0 + 30);
  const miss = priceAt(packed, t0 - 100000, 1800);
  assert.equal(miss, null);
});

test('computeMAEPct: always <= 0, and finds the manufactured spike', () => {
  const startIso = '2025-01-06', endIso = '2025-01-07';
  const startEpoch = Date.parse(startIso + 'T00:00:00Z') / 1000;
  const spikeAt = startEpoch + 3600; // 1h in
  const packed = buildSyntheticPacked(startIso, endIso, { spikeAt, spikeDrop: -5 });
  const entryEpoch = packed.times[0];
  const exitEpoch = packed.times[packed.n - 1];
  const entryPrice = packed.closes[0];
  const mae = computeMAEPct(packed, entryEpoch, exitEpoch, entryPrice);
  assert.ok(mae <= 0, 'MAE must never be positive');
  // The spike drops price by ~5 on a ~2000 base -> roughly -0.25%.
  assert.ok(mae < -0.15 && mae > -0.35, `MAE ${mae} should reflect the manufactured spike`);
});

test('buildOvernightTrades: produces trades for the full window and logs exceptions, never throws on gaps', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-02-01');
  const { trades, mirrors, exceptions, expectedTradingDays } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  assert.ok(trades.length > 15, `expected a good chunk of the ~4 weeks, got ${trades.length}`);
  assert.equal(trades.length + exceptions.filter(e => e.leg.startsWith('overnight')).length >= expectedTradingDays - 2, true);
  assert.ok(mirrors.length > 0);
  for (const t of trades) {
    assert.ok(t.exitEpoch > t.entryEpoch);
    assert.ok(t.maePct <= 0);
  }
});

test('buildOvernightTrades: opts.skipWeekdays excludes the rule as a real trade construction step, distinctly from data-gap exceptions', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-02-01'); // spans several Wednesdays
  const withoutRule = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  const withRule = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1], { skipWeekdays: [3] });

  // No trade EVER opens on a Wednesday once the rule is active.
  assert.ok(withRule.trades.every(t => dowOf(t.date) !== 3), 'no Wednesday entries should exist under the rule');
  const wedCountWithoutRule = withoutRule.trades.filter(t => dowOf(t.date) === 3).length;
  assert.ok(wedCountWithoutRule > 0, 'sanity: the unrestricted run actually has Wednesday trades to compare against');
  assert.equal(withRule.trades.length, withoutRule.trades.length - wedCountWithoutRule);

  // The skip shows up as a distinctly-labeled exception, not lumped in with
  // "no bar within tolerance" market-closed/data-gap exceptions.
  const ruleExceptions = withRule.exceptions.filter(e => e.reason.startsWith('skipped by rule'));
  assert.equal(ruleExceptions.length, wedCountWithoutRule);
  assert.ok(ruleExceptions.every(e => dowOf(e.date) === 3));
});

test('mirrorTest: overnight + mirror reconstructs buy&hold when coverage is full', () => {
  const packed = buildSyntheticPacked('2025-01-06', '2025-01-10'); // Mon-Thu, no weekend gap inside
  const { trades, mirrors } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  const recon = mirrorTest(trades, mirrors);
  assert.equal(recon.coveredDays, trades.length);
  // Direct buy&hold gross over the SAME window the chain actually covers:
  // the first mirror's 14:30 entry (not the first overnight's 20:00 entry —
  // the chain is mirror(D0) -> overnight(D0) -> mirror(D1) -> ..., so it
  // starts half a trading day earlier than the first overnight trade).
  const first = trades[0], last = trades[trades.length - 1];
  const firstMirrorEntryEpoch = first.entryEpoch - (5.5 * 3600); // 20:00 -> 14:30 same day
  const firstMirrorFill = priceAt(packed, firstMirrorEntryEpoch);
  const directGross = ((last.exitPrice / firstMirrorFill.price) - 1) * 100;
  assert.ok(Math.abs(recon.reconstructedGrossPct - directGross) < 0.01,
    `reconstructed ${recon.reconstructedGrossPct} vs direct ${directGross}`);
});

test('applyCosts: net = gross - spread - slip - financing, triple-swap multiplies financing x3', () => {
  const trades = [
    { date: '2025-01-08', exitDate: '2025-01-09', entryEpoch: 0, exitEpoch: 3600, entryPrice: 2000, exitPrice: 2010, grossPct: 0.5, maePct: -0.1 }, // Wed
    { date: '2025-01-06', exitDate: '2025-01-07', entryEpoch: 0, exitEpoch: 3600, entryPrice: 2000, exitPrice: 2010, grossPct: 0.5, maePct: -0.1 }, // Mon
  ];
  assert.equal(dowOf('2025-01-08'), 3); // sanity: Wednesday
  const net = applyCosts(trades, 'gold', { financingBpsPerNight: { gold: 1.5 }, tripleSwapDow: 3 });
  const wed = net.find(t => t.date === '2025-01-08');
  const mon = net.find(t => t.date === '2025-01-06');
  assert.ok(wed.tripleSwap === true && mon.tripleSwap === false);
  assert.ok(Math.abs(wed.financingCostPct - mon.financingCostPct * 3) < 1e-6,
    `Wed financing ${wed.financingCostPct} should be 3x Monday's ${mon.financingCostPct}`);
  assert.ok(wed.netPct < wed.grossPct, 'net must be below gross once costs apply');
});

test('CSV exports: exact 3-column schemas, MAE column never positive', () => {
  const netTrades = [
    { date: '2025-01-06', exitDate: '2025-01-07', netPct: 1.234, maePct: -0.5 },
    { date: '2025-01-07', exitDate: '2025-01-08', netPct: -0.876, maePct: -1.2 },
  ];
  const returns = toCsvReturns(netTrades);
  const lines = returns.split('\n');
  assert.equal(lines[0], 'Date,Return %,MAE %');
  for (const line of lines.slice(1)) {
    const [date, ret, mae] = line.split(',');
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(ret, /^-?\d+\.\d{2}$/);
    assert.match(mae, /^-?\d+\.\d{2}$/);
    assert.ok(parseFloat(mae) <= 0);
  }

  const rMult = toCsvRMultiples(netTrades);
  assert.equal(rMult.split('\n')[0], 'date,R,MAE (R)');

  const cur = toCsvCurrency(netTrades, 100000, 100000);
  assert.equal(cur.split('\n')[0], 'Trade Date,PnL ($),Risk ($)');
  const firstDataRow = cur.split('\n')[1].split(',');
  assert.ok(Math.abs(parseFloat(firstDataRow[1]) - (1.234 / 100) * 100000) < 0.01);
});

test('combineInstruments: equal-weight blend, one row per date present in either leg', () => {
  const gold = [{ date: '2025-01-06', netPct: 1.0, maePct: -0.2 }, { date: '2025-01-07', netPct: -1.0, maePct: -0.4 }];
  const nq   = [{ date: '2025-01-06', netPct: 3.0, maePct: -0.6 }];
  const combined = combineInstruments({ gold, nq });
  assert.equal(combined.length, 2);
  const day1 = combined.find(c => c.date === '2025-01-06');
  assert.ok(Math.abs(day1.netPct - 2.0) < 1e-9, 'equal-weight average of 1.0 and 3.0');
  const day2 = combined.find(c => c.date === '2025-01-07');
  assert.equal(day2.netPct, -1.0, 'only one leg traded -> that leg\'s own return, unweighted');
});

test('maxDrawdownWithDuration: finds the peak->trough->recovery and duration in days', () => {
  const curve = [
    { date: '2025-01-01', equity: 100 },
    { date: '2025-01-02', equity: 105 }, // new peak
    { date: '2025-01-03', equity: 95 },  // trough (-9.52% from 105)
    { date: '2025-01-04', equity: 90 },  // deeper trough (-14.29%)
    { date: '2025-01-08', equity: 106 }, // recovers past the peak
  ];
  const dd = maxDrawdownWithDuration(curve);
  assert.ok(Math.abs(dd.maxDDPct - (-14.29)) < 0.1, `got ${dd.maxDDPct}`);
  assert.equal(dd.start, '2025-01-02');
  assert.equal(dd.trough, '2025-01-04');
  assert.equal(dd.recovered, '2025-01-08');
  assert.equal(dd.durationDays, 6);
  assert.equal(dd.stillInDrawdown, false);
});

test('maxDrawdownWithDuration: unrecovered drawdown at series end is flagged, not hidden', () => {
  const curve = [{ date: '2025-01-01', equity: 100 }, { date: '2025-01-02', equity: 80 }];
  const dd = maxDrawdownWithDuration(curve);
  assert.equal(dd.stillInDrawdown, true);
  assert.equal(dd.recovered, null);
});

test('runPropFirmRuleCheck: catches a daily-loss breach, a profit target, and a consistency breach', () => {
  const mk = (date, exitDate, netPct) => ({ date, exitDate, netPct });
  // Day 1 alone blows a -5% daily loss cap; days 2-3 grind out the rest of an
  // 8% target almost entirely from day 2 (fails a 30% consistency cap).
  const netTrades = [
    mk('2025-01-05', '2025-01-06', -6),
    mk('2025-01-06', '2025-01-07', 15),
    mk('2025-01-07', '2025-01-08', 1),
  ];
  // equity: 100 -(-6%)-> 94 -(+15%)-> 108.1 (crosses the 8% target here) -(+1%)-> 109.18
  const rc = runPropFirmRuleCheck(netTrades, { dailyLossLimitPct: 5, maxDrawdownStaticPct: 20, maxDrawdownTrailingPct: 20, ddMode: 'trailing', profitTargetPct: 8, profitTargetDays: 30, consistencyCapPct: 30 });
  assert.ok(rc.dailyLossBreach, 'day 1 should breach the 5% daily loss cap');
  assert.equal(rc.profitTargetHitDate, '2025-01-07', 'should reach the 8% target on day 2');
  assert.ok(rc.consistency.breach, 'day 2 alone should exceed the 30% consistency cap');
  assert.equal(rc.verdict.wouldPassOnHistoricalData, false);
});

test('runPropFirmRuleCheck: a well-behaved series passes all four rules', () => {
  const mk = (date, exitDate, netPct) => ({ date, exitDate, netPct });
  const dates = [];
  let d = '2025-01-06';
  for (let i = 0; i < 20; i++) { dates.push(d); d = addDays(d, 1); }
  const netTrades = dates.map((dt, i) => mk(dt, addDays(dt, 1), 0.5)); // steady +0.5%/day, no single-day dominance
  const rc = runPropFirmRuleCheck(netTrades, { dailyLossLimitPct: 5, maxDrawdownStaticPct: 10, maxDrawdownTrailingPct: 10, ddMode: 'trailing', profitTargetPct: 8, profitTargetDays: 30, consistencyCapPct: 30 });
  assert.equal(rc.verdict.dailyLoss, true);
  assert.equal(rc.verdict.drawdown, true);
  assert.equal(rc.verdict.consistency, true);
});

test('runPropFirmRuleCheck: dailyLossBreachEvents logs EVERY breach day, not just the first', () => {
  const mk = (date, exitDate, netPct) => ({ date, exitDate, netPct });
  const netTrades = [
    mk('2025-02-03', '2025-02-04', -6), // breach #1
    mk('2025-02-04', '2025-02-05', 2),  // no breach
    mk('2025-02-05', '2025-02-06', -6), // breach #2
  ];
  const rc = runPropFirmRuleCheck(netTrades, { dailyLossLimitPct: 5, maxDrawdownStaticPct: 50, maxDrawdownTrailingPct: 50, ddMode: 'trailing', profitTargetPct: 999, profitTargetDays: 0, consistencyCapPct: 100 });
  assert.equal(rc.dailyLossBreachEvents.length, 2, 'both breach days should be logged, not just the first');
  assert.deepEqual(rc.dailyLossBreachEvents.map(e => e.day), ['2025-02-04', '2025-02-06']);
  assert.equal(rc.dailyLossBreach.day, '2025-02-04', 'the singular field stays the FIRST breach, for back-compat');
});

test('runPropFirmRuleCheck: drawdown breach episodes group contiguous breach days and reset at a new peak', () => {
  const mk = (date, exitDate, netPct) => ({ date, exitDate, netPct });
  // Equity path (trailing 10% cap): 100 -> 85 (breach) -> 84.15 (breach, still
  // in episode 1) -> 105.19 (new peak, episode 1 ends) -> 89.41 (breach,
  // episode 2 starts) -> 111.76 (new peak, episode 2 ends).
  const rets = [0, -15, -1, 25, -15, 25];
  const dates = [];
  let d = '2025-03-03';
  for (let i = 0; i < rets.length; i++) { dates.push(d); d = addDays(d, 1); }
  const netTrades = rets.map((r, i) => mk(dates[i], addDays(dates[i], 1), r));
  const rc = runPropFirmRuleCheck(netTrades, { dailyLossLimitPct: 100, maxDrawdownStaticPct: 90, maxDrawdownTrailingPct: 10, ddMode: 'trailing', profitTargetPct: 999, profitTargetDays: 0, consistencyCapPct: 100 });
  assert.equal(rc.trailingDrawdownEpisodes.length, 2, `expected 2 distinct episodes, got ${JSON.stringify(rc.trailingDrawdownEpisodes)}`);
  const [ep1, ep2] = rc.trailingDrawdownEpisodes;
  assert.equal(ep1.days, 2, 'episode 1 spans the two consecutive breach days');
  assert.ok(Math.abs(ep1.troughEquity - 84.15) < 0.01);
  assert.equal(ep2.days, 1, 'episode 2 is the single later breach day');
  assert.equal(rc.activeDrawdownEpisodes, rc.trailingDrawdownEpisodes, 'activeDrawdownEpisodes follows ddMode');
});

test('applyCosts: costScale=0 means net == gross exactly, per trade (zero-cost baseline)', () => {
  const trades = [{ date: '2025-01-06', exitDate: '2025-01-07', grossPct: 1.234 }];
  const net = applyCosts(trades, 'nq', { costScale: 0 });
  assert.equal(net[0].netPct, 1.234);
  assert.equal(net[0].spreadCostPct, 0);
  assert.equal(net[0].slipCostPct, 0);
  assert.equal(net[0].financingCostPct, 0);
});

test('costSensitivitySweep: costScale=0 point reproduces the pure compounded gross return', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-03-01');
  const { trades: gross } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  const sweep = costSensitivitySweep(gross, 'gold');
  const zeroPoint = sweep.points.find(p => p.costScale === 0);
  const grossTotalMult = gross.reduce((m, t) => m * (1 + t.grossPct / 100), 1);
  const grossTotalPct = (grossTotalMult - 1) * 100;
  assert.ok(Math.abs(zeroPoint.totalReturnPct - grossTotalPct) < 0.001,
    `costScale=0 total ${zeroPoint.totalReturnPct} should match pure gross ${grossTotalPct}`);
});

test('costSensitivitySweep: totalReturnPct is monotonically non-increasing as cost scale rises', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-03-01');
  const { trades: gross } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  const sweep = costSensitivitySweep(gross, 'nq');
  for (let i = 1; i < sweep.points.length; i++) {
    assert.ok(sweep.points[i].totalReturnPct <= sweep.points[i - 1].totalReturnPct + 1e-9,
      `costs only ever subtract — return should not rise from scale ${sweep.points[i - 1].costScale} to ${sweep.points[i].costScale}`);
  }
});

test('costSensitivitySweep: the interpolated breakeven scale self-consistently nets ~0%', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-06-01', { driftPerMin: 0.01 }); // strongly positive gross drift
  const { trades: gross } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  // Exaggerated financing so a breakeven definitely falls inside the scanned [0,2] range.
  const opts = { financingBpsPerNight: { gold: 40 } };
  const sweep = costSensitivitySweep(gross, 'gold', opts);
  assert.ok(sweep.breakevenScale !== null, 'expected a breakeven within the scanned range');
  const netAtBreakeven = applyCosts(gross, 'gold', { ...opts, costScale: sweep.breakevenScale });
  const totalMult = netAtBreakeven.reduce((m, t) => m * (1 + t.netPct / 100), 1);
  const totalPct = (totalMult - 1) * 100;
  assert.ok(Math.abs(totalPct) < 1, `expected ~0% net return at the interpolated breakeven scale, got ${totalPct}`);
});

test('costSensitivitySweep: reports no breakeven honestly when gross is already negative at zero cost', () => {
  const losingTrades = [
    { date: '2025-01-06', exitDate: '2025-01-07', grossPct: -5, maePct: -5 },
    { date: '2025-01-07', exitDate: '2025-01-08', grossPct: -3, maePct: -3 },
  ];
  const sweep = costSensitivitySweep(losingTrades, 'gold');
  assert.equal(sweep.breakevenScale, null);
  assert.match(sweep.note, /already negative at costScale=0/);
});

test('yearlyDiversificationBreakdown: correct per-year compounding, correlation and beat-the-leg flags', () => {
  const mk = (date, netPct) => ({ date, netPct, maePct: -0.1 });
  // 2025: gold +10%/-5% and nq -10%/+5% on the SAME two dates — perfectly
  // anti-correlated, so the equal-weight blend nets exactly 0% both days.
  const gold2025 = [mk('2025-01-06', 10), mk('2025-01-07', -5)];
  const nq2025 = [mk('2025-01-06', -10), mk('2025-01-07', 5)];
  const gold2026 = [mk('2026-01-05', 2)];
  const nq2026 = [mk('2026-01-05', 2)];

  const rows = yearlyDiversificationBreakdown([...gold2025, ...gold2026], [...nq2025, ...nq2026]);
  const y2025 = rows.find(r => r.year === '2025');
  const y2026 = rows.find(r => r.year === '2026');

  assert.ok(Math.abs(y2025.goldNetPct - 4.5) < 0.01, `gold 2025: ${y2025.goldNetPct}`);   // (1.10*0.95-1)*100
  assert.ok(Math.abs(y2025.nqNetPct - (-5.5)) < 0.01, `nq 2025: ${y2025.nqNetPct}`);       // (0.90*1.05-1)*100
  assert.ok(Math.abs(y2025.combinedNetPct - 0) < 0.01, `combined 2025: ${y2025.combinedNetPct}`);
  assert.equal(y2025.correlation, -1, 'perfectly anti-correlated per-day returns');
  assert.equal(y2025.beatBetterLeg, false, "combined 0% didn't beat gold's +4.5%");
  assert.equal(y2025.beatWorseLeg, true, "combined 0% did beat nq's -5.5%");

  assert.equal(y2026.goldTrades, 1);
  assert.equal(y2026.correlation, null, 'a single paired date has no defined correlation (n<2)');
});

test('diversificationIsOosSplit: one shared calendar split date, every trade conserved across IS+OOS', () => {
  const mk = (date, netPct) => ({ date, netPct, maePct: -0.1 });
  // 2021 and 2022 are both non-leap years (365 days each) so a 50/50 split
  // of a Jan-2021 -> Jan-2023 window lands on an exact calendar date, not a
  // fractional day — avoids leap-year rounding ambiguity in the assertion.
  const overlapWindow = { start: Date.parse('2021-01-01T00:00:00Z') / 1000, end: Date.parse('2023-01-01T00:00:00Z') / 1000 };
  const goldTrades = [mk('2021-06-01', 1), mk('2021-12-31', 1), mk('2022-01-01', 1), mk('2022-06-01', 1)];
  const nqTrades = [mk('2021-06-01', 2), mk('2022-01-01', 2)];

  const result = diversificationIsOosSplit(goldTrades, nqTrades, overlapWindow, 0.5);
  assert.equal(result.splitDate, '2022-01-01');
  assert.equal(result.inSample.goldTrades + result.outOfSample.goldTrades, goldTrades.length);
  assert.equal(result.inSample.nqTrades + result.outOfSample.nqTrades, nqTrades.length);
  assert.equal(result.inSample.goldTrades, 2, '2021-06-01 and 2021-12-31 are before the split');
  assert.equal(result.outOfSample.goldTrades, 2, '2022-01-01 and 2022-06-01 are on/after the split');
  assert.equal(result.inSample.nqTrades, 1);
  assert.equal(result.outOfSample.nqTrades, 1);
  // Only 1 nq trade per half -> summarizeTrades needs >=2, so Sharpe is
  // honestly null rather than a meaningless single-point statistic.
  assert.equal(result.inSample.nqSharpe, null);
  assert.equal(result.outOfSample.nqSharpe, null);
});

test('weekdayBreakdown: groups by entry weekday, compounds correctly, surfaces the triple-swap drag', () => {
  const mk = (date, grossPct, netPct, spreadCostPct, slipCostPct, financingCostPct, tripleSwap) =>
    ({ date, grossPct, netPct, spreadCostPct, slipCostPct, financingCostPct, tripleSwap });
  const trades = [
    mk('2025-01-06', 2.03, 2, 0.010, 0.005, 0.015, false),  // Monday
    mk('2025-01-13', -0.97, -1, 0.010, 0.005, 0.015, false), // Monday
    mk('2025-01-08', 1.06, 1, 0.010, 0.005, 0.045, true),   // Wednesday (triple swap)
    mk('2025-01-15', 1.06, 1, 0.010, 0.005, 0.045, true),   // Wednesday (triple swap)
  ];
  assert.equal(dowOf('2025-01-06'), 1); // sanity: Monday
  assert.equal(dowOf('2025-01-08'), 3); // sanity: Wednesday

  const rows = weekdayBreakdown(trades);
  const mon = rows.find(r => r.weekday === 'Mon');
  const wed = rows.find(r => r.weekday === 'Wed');

  assert.equal(mon.trades, 2);
  assert.ok(Math.abs(mon.avgNetPct - 0.5) < 1e-9);
  assert.ok(Math.abs(mon.compoundedTotalPct - 0.98) < 0.01); // (1.02*0.99-1)*100
  assert.equal(mon.winRatePct, 50);
  assert.equal(mon.tripleSwapNights, 0);

  assert.equal(wed.trades, 2);
  assert.ok(Math.abs(wed.avgFinancingCostPct - 0.045) < 1e-9, 'Wednesday should show the 3x financing cost');
  assert.equal(wed.tripleSwapNights, 2);
  assert.ok(wed.avgFinancingCostPct > mon.avgFinancingCostPct * 2.9, 'Wednesday financing should be roughly 3x a normal night');

  // Gross vs net decomposition — the whole point of this extension: separate
  // "the price action itself" from "what it costs to hold it".
  assert.ok(Math.abs(mon.avgGrossPct - 0.53) < 1e-9, 'Monday gross should be the pre-cost average');
  assert.ok(Math.abs(wed.avgGrossPct - 1.06) < 1e-9, 'Wednesday gross should be the pre-cost average');
  assert.ok(Math.abs(wed.avgSpreadCostPct - mon.avgSpreadCostPct) < 1e-9, 'spread cost is the SAME baseline every night in this fixture');
  assert.ok(Math.abs(wed.avgSlipCostPct - mon.avgSlipCostPct) < 1e-9, 'slip cost is the SAME baseline every night in this fixture');
  assert.ok(wed.compoundedGrossPct > wed.compoundedTotalPct, 'gross should sit above net once costs are subtracted');
});

test('resampleDailyFromPacked: aggregates M1 bars into correct UTC-day OHLC buckets', () => {
  // Two UTC days, hand-built minute bars (not the random synthetic generator)
  // so the expected open/high/low/close are known exactly.
  const day1 = Date.parse('2025-01-06T00:00:00Z') / 1000;
  const times = [day1, day1 + 60, day1 + 120, day1 + 86400, day1 + 86400 + 60];
  const opens  = [10, 11, 9,  20, 21];
  const highs  = [12, 13, 9.5, 22, 23];
  const lows   = [9,  10, 8,  19, 20];
  const closes = [11, 9,  9.2, 21, 22];
  const packed = { n: 5, times: Int32Array.from(times), opens: Float32Array.from(opens), highs: Float32Array.from(highs), lows: Float32Array.from(lows), closes: Float32Array.from(closes) };
  const daily = resampleDailyFromPacked(packed);
  assert.equal(daily.length, 2);
  assert.equal(daily[0].time, day1);
  assert.ok(Math.abs(daily[0].open - 10) < 1e-4, 'day1 open = first bar\'s open');
  assert.ok(Math.abs(daily[0].high - 13) < 1e-4, 'day1 high = max of all highs that day');
  assert.ok(Math.abs(daily[0].low - 8) < 1e-4, 'day1 low = min of all lows that day');
  assert.ok(Math.abs(daily[0].close - 9.2) < 1e-4, 'day1 close = LAST bar\'s close');
  assert.equal(daily[1].time, day1 + 86400);
  assert.ok(Math.abs(daily[1].close - 22) < 1e-4);
});

test('computeMetricsTable + correlationToBuyHold: end-to-end on synthetic data, no NaNs', () => {
  const packed = buildSyntheticPacked('2025-01-01', '2025-03-01');
  const { trades: gross } = buildOvernightTrades(packed, packed.times[0], packed.times[packed.n - 1]);
  const net = applyCosts(gross, 'gold');
  const benchmark = buildBuyHoldBenchmark(packed, gross);
  const metrics = computeMetricsTable(net, benchmark);
  assert.ok(metrics.trades > 20);
  for (const k of ['totalReturnPct', 'cagrPct', 'sharpe', 'sortino', 'calmar', 'stdDevPct']) {
    assert.ok(Number.isFinite(metrics[k]), `${k} should be a finite number, got ${metrics[k]}`);
  }
  const corr = correlationToBuyHold(net);
  assert.ok(corr.r === null || (corr.r >= -1 && corr.r <= 1));
});

test('runOvernightHoldBacktest: orchestrates two instruments + combined pass end-to-end', () => {
  const gold = buildSyntheticPacked('2025-01-01', '2025-02-01', { basePrice: 2000 });
  const nq = buildSyntheticPacked('2025-01-01', '2025-02-01', { basePrice: 20000, driftPerMin: 0.01 });
  const result = runOvernightHoldBacktest({ gold, nq });
  assert.ok(result.instruments.gold.metrics);
  assert.ok(result.instruments.nq.metrics);
  assert.ok(result.combined.trades.length > 0);
  assert.match(result.combined.csv.split('\n')[0], /^Date,Return %,MAE %$/);
});

test('missing instrument data degrades honestly (no throw, no fabricated result)', () => {
  const result = runOvernightHoldBacktest({ gold: { n: 0 }, nq: buildSyntheticPacked('2025-01-01', '2025-01-15') });
  assert.equal(result.instruments.gold.error, 'no M1 data available for this instrument');
  assert.ok(result.instruments.nq.metrics);
});

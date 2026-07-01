/**
 * Pivot Spike Backtest Engine
 *
 * Spike question: do Traditional daily pivot levels show positive mean-reversion
 * expectancy on M1 data after realistic costs?
 *
 * No WaveTrend, no macro filter, no confluence — just the raw level premise.
 * Use these results to decide whether the full Sniper-style system is worth building.
 *
 * Bricks used:
 *   loadM1ForPair  (volBacktestM1Engine)  — M1 parquet, R2 → local → Drive
 *   calcATR / groupByDate (barUtils)      — resample ATR, day bucketing
 *   summarizeTrades (metricsCore)         — honest Sharpe / DD / WR / PF
 */

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { calcATR, groupByDate } from './barUtils.js';
import { summarizeTrades } from './metricsCore.js';

// ── Traditional daily pivots from prior-day H/L/C ────────────────────────────
function computePivots(prevH, prevL, prevC) {
  const pp = (prevH + prevL + prevC) / 3;
  const r1 = 2 * pp - prevL;
  const s1 = 2 * pp - prevH;
  const r2 = pp + (prevH - prevL);
  const s2 = pp - (prevH - prevL);
  return { pp, r1, s1, r2, s2 };
}

// ── Walk M1 bars from entryIdx+1 until SL, TP, or maxBars elapsed ────────────
// Conservative fill: on a bar that covers both SL and TP, SL wins.
function walkToExit(bars, entryIdx, sl, tp, maxBars, side) {
  const last = Math.min(entryIdx + maxBars, bars.length - 1);
  for (let i = entryIdx + 1; i <= last; i++) {
    const b = bars[i];
    if (side === 'long') {
      if (b.low  <= sl) return { exit: sl, outcome: 'sl', barsHeld: i - entryIdx };
      if (b.high >= tp) return { exit: tp, outcome: 'tp', barsHeld: i - entryIdx };
    } else {
      if (b.high >= sl) return { exit: sl, outcome: 'sl', barsHeld: i - entryIdx };
      if (b.low  <= tp) return { exit: tp, outcome: 'tp', barsHeld: i - entryIdx };
    }
  }
  const exitBar = bars[last];
  return { exit: exitBar?.close ?? (sl + tp) / 2, outcome: 'time', barsHeld: last - entryIdx };
}

// ── Summarise a trade list → metrics ─────────────────────────────────────────
function sum(ts) {
  if (!ts.length) return null;
  return { n: ts.length, ...summarizeTrades(ts.map(t => t.pnl), ts.map(t => t.date)) };
}

// ── Build a per-day equity curve (cumulative PnL, unique dates) ───────────────
function buildCurve(ts) {
  const byDay = new Map();
  let cum = 0;
  for (const t of ts) {
    cum += t.pnl;
    byDay.set(t.date, cum);
  }
  return [...byDay.entries()].map(([date, cum]) => ({ date, cum }));
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function runPivotSpike(opts, onLog = () => {}) {
  const {
    pair        = 'eurusd',
    touchTolAtr = 0.5,    // level touch zone = ATR × this
    slAtr       = 1.0,    // stop = entry ± ATR × this
    maxBars     = 120,    // max M1 bars to hold (120 = 2 h)
    oosFrac     = 0.35,
    costPct     = 0.0002, // round-trip cost as fraction of price
    sessions    = null,   // null = all; or e.g. ['Asian'] ['Asian','NY']
    levels: levFilter = null, // null = all; or e.g. ['S1'] ['S1','S2']
    maxRR       = 0,      // 0 = off; cap structural R:R — replace TP with entry ± maxRR×slDist
    minRR       = 0,      // 0 = off; skip touch if structural R:R < this
  } = opts;

  const pairKey = pair.toLowerCase().replace('/', '');

  onLog(`Loading M1 data for ${pairKey.toUpperCase()}…`);
  const packed = await loadM1ForPair(pairKey);
  if (!packed?.n) throw new Error(`No M1 data available for ${pairKey}`);

  // Convert packed TypedArrays → flat row array for groupByDate
  const allBars = [];
  for (let i = 0; i < packed.n; i++) {
    allBars.push({
      time:  packed.times[i],
      open:  packed.opens[i],
      high:  packed.highs[i],
      low:   packed.lows[i],
      close: packed.closes[i],
    });
  }

  const byDate = groupByDate(allBars);
  const dates  = [...byDate.keys()].sort();

  onLog(`${allBars.length.toLocaleString()} M1 bars · ${dates.length} days · ${dates[0]} → ${dates.at(-1)}`);

  const oosFrom = dates[Math.floor(dates.length * (1 - oosFrac))];
  onLog(`IS: ${dates[0]} → ${oosFrom}   OOS: ${oosFrom} → ${dates.at(-1)}`);

  const trades = [];

  for (let di = 1; di < dates.length; di++) {
    const date      = dates[di];
    const prevDate  = dates[di - 1];
    const prevBars  = byDate.get(prevDate) ?? [];
    const todayBars = byDate.get(date)     ?? [];

    if (prevBars.length < 60 || todayBars.length < 30) continue;

    // Prior-day OHLC from M1 (no D1 fetch — keeps the engine self-contained)
    let prevH = -Infinity, prevL = Infinity;
    for (const b of prevBars) {
      if (b.high > prevH) prevH = b.high;
      if (b.low  < prevL) prevL = b.low;
    }
    const prevC = prevBars[prevBars.length - 1].close;

    // ATR from prior day (resample to 15-min, 14-period simple mean)
    const atr = calcATR(prevBars, 15, 14);
    if (!atr || atr < 1e-10) continue;

    const { pp, r1, s1, r2, s2 } = computePivots(prevH, prevL, prevC);
    const tol    = atr * touchTolAtr;
    const isOOS  = date >= oosFrom;
    const dayOpen = todayBars[0]?.open ?? pp;
    const dayBias = dayOpen >= pp ? 'bull' : 'bear';

    // Level definitions — support → long reversion, resistance → short reversion
    // TP = next level toward PP (structure-based, not arbitrary R-multiple)
    const allLevDefs = [
      { name: 'S2', price: s2, side: 'long',  tp: s1 },
      { name: 'S1', price: s1, side: 'long',  tp: pp },
      { name: 'R1', price: r1, side: 'short', tp: pp },
      { name: 'R2', price: r2, side: 'short', tp: r1 },
    ];
    const levDefs = levFilter ? allLevDefs.filter(l => levFilter.includes(l.name)) : allLevDefs;

    const firedToday = new Set(); // one trade per level per day

    for (let bi = 0; bi < todayBars.length; bi++) {
      const bar = todayBars[bi];

      // Compute session once per bar for session filtering
      const hour    = new Date(bar.time * 1000).getUTCHours();
      const session = hour >= 22 || hour < 7 ? 'Asian'
                    : hour < 12              ? 'London'
                    : hour < 17              ? 'NY'
                    :                          'Other';
      if (sessions && !sessions.includes(session)) continue;

      for (const lev of levDefs) {
        if (firedToday.has(lev.name)) continue;

        // Touch: bar range overlaps level ± tolerance
        if (bar.low > lev.price + tol || bar.high < lev.price - tol) continue;

        firedToday.add(lev.name);

        const entry  = lev.price;
        const slDist = atr * slAtr;
        const sl     = lev.side === 'long' ? entry - slDist : entry + slDist;

        // Structural R:R from level spacing
        const structuralRR = Math.abs(lev.tp - entry) / slDist;

        // Min R:R gate — skip low-reward setups
        if (minRR > 0 && structuralRR < minRR) continue;

        // Max R:R cap — replace TP when structural target is unreachably far
        let tp = lev.tp;
        let rr = structuralRR;
        if (maxRR > 0 && structuralRR > maxRR) {
          tp  = lev.side === 'long' ? entry + maxRR * slDist : entry - maxRR * slDist;
          rr  = maxRR;
        }

        const walked = walkToExit(todayBars, bi, sl, tp, maxBars, lev.side);

        const rawPnl = lev.side === 'long'
          ? (walked.exit - entry) / entry
          : (entry - walked.exit) / entry;
        const pnl = rawPnl - costPct; // costPct = full round-trip

        trades.push({
          date, isOOS,
          level: lev.name, side: lev.side,
          entry, sl, tp, ...walked,
          pnl, dayBias, session, rr,
        });
      }
    }

    if (di % 200 === 0) onLog(`  Processed day ${di}/${dates.length}…`);
  }

  onLog(`Simulation complete — ${trades.length} level touches logged`);

  const isTrades  = trades.filter(t => !t.isOOS);
  const oosTrades = trades.filter(t =>  t.isOOS);

  // Per-level breakdown
  const byLevel = {};
  for (const ln of ['S2', 'S1', 'R1', 'R2']) {
    byLevel[ln] = {
      is:  sum(isTrades.filter(t => t.level === ln)),
      oos: sum(oosTrades.filter(t => t.level === ln)),
    };
  }

  // Day bias & session splits (OOS only — these guide future filtering)
  const byBias = {
    bull: sum(oosTrades.filter(t => t.dayBias === 'bull')),
    bear: sum(oosTrades.filter(t => t.dayBias === 'bear')),
  };
  const bySess = {
    Asian:  sum(oosTrades.filter(t => t.session === 'Asian')),
    London: sum(oosTrades.filter(t => t.session === 'London')),
    NY:     sum(oosTrades.filter(t => t.session === 'NY')),
  };

  return {
    trades:   trades.slice(-300), // last 300 for the trade log
    is:       sum(isTrades),
    oos:      sum(oosTrades),
    byLevel,  byBias,  bySess,
    isCurve:  buildCurve(isTrades),
    oosCurve: buildCurve(oosTrades),
    meta: {
      pair: pairKey, oosFrom,
      totalBars: allBars.length, totalDays: dates.length,
      opts: { touchTolAtr, slAtr, maxBars, oosFrac, costPct, sessions, levFilter, maxRR, minRR },
    },
  };
}

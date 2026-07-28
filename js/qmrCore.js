// js/qmrCore.js — the QMR execution chassis (Tier-1 brick, extracted 2026-07-28)
//
// `LEGO_MODULES.md` §1p pre-authorised this extraction: "If a third consumer
// appears (or the QMR engine gets versioned out of server.js), extract
// _qmrWalkTrade/_qmrNetReturn/QMR_TIMING/QMR_COSTS into a proper js/qmrCore.js
// brick with a checked-in unit test." The third consumer has arrived —
// cogV3Engine.js puts COG's macro gates on this chassis — so here it is.
//
// WHAT THIS IS, and why it's worth its own file: on 2026-07-28 the control arm
// measured QMR's *signal* at exactly zero (direction alpha -0.006%/trade,
// t=-0.08; the day-selection flat across gate strictness). What survived that
// test was everything in THIS file — the execution frame:
//
//   entry at the 13:00 UTC bar (pre-NY-open) · stop scaled to the overnight
//   range · asymmetric target ~3.3R · exit by 20:00 UTC · costs charged BEFORE
//   leverage · leverage = riskPct / stopPct so realised risk equals stated risk
//
// which returned +0.18%/trade after costs across five years in EITHER
// direction. That is a validated chassis with a null signal in it. The point of
// extracting it is that the signal is now pluggable and the chassis is not
// re-litigated each time.
//
// Contrast `js/cogBacktestEngine.js`'s execution layer, which the first
// real-data run exposed as broken three ways: a 0.25x-daily-ATR stop (0.18% of
// price, inside the bar's own noise — 37 of 39 trades stopped out, 22 within
// one bar), whole-contract size flooring to zero at higher index levels (no
// trades at all after 2021), and realised risk ~20x smaller than the stated
// riskAmount. Use this chassis, not that one.
//
// Pure: no network, no KV, no DOM. Bars in, trade out.

import { sharpeStdError, minTrackRecordLength } from './metricsCore.js';

// Shared timing anchors. The backtest engine AND every live monitor must read
// these, never inline their own hours — the 2026-07 review found the live
// monitors had drifted to a 20:00-UTC/3-bar overnight window while the engine
// used 21:00/4: same rule name, different rule. All times are fixed UTC
// year-round; ET labels in alert copy are display-only.
export const QMR_TIMING = {
  overnightStartHour: 21, // overnight window: prev-day UTC hour >= this…
  overnightEndHour:   8,  // …through today UTC hour <= this
  minOvernightBars:   4,  // skip the day with fewer overnight H1 bars
  londonOpenHour:     7,  // London-open H1 bar label (UTC)
  gate1Hour:          9,  // Gate 1 decision time (UTC)
  gate2Hour:         12,  // Gate 2 decision time (UTC)
  entryHour:         13,  // entry H1 bar label (UTC; 14 fallback in winter)
  eodHour:           20,  // exit-by hour (UTC)
};

// Round-trip transaction cost and the extra slippage charged only on stop
// exits (a market order through a moving market). The engine and the live
// forward-validation resolver read these, so backtest and forward net
// identically. NOTE: the 2026-07-28 sensitivity sweep showed the QMR edge dies
// between 2bp and 4bp round-trip — at ~3.4x leverage and ~120 trades/yr, 1bp
// of extra cost is ~4 points of CAGR. These defaults are optimistic-but-
// plausible for OANDA NAS100 and have never been measured against the real
// spread at 13:00/20:00 UTC. Treat any result from them as cost-critical.
export const QMR_COSTS = { costPct: 0.008, stopSlipPct: 0.005 };

export const qmrHH = h => String(h).padStart(2, '0'); // hour → 2-digit bar label

// Per-trade exit walk. `bars` are the bars STRICTLY AFTER the entry bar, sorted
// ascending by time. Rule, in order, per bar: stop first (conservative — worst
// case within the bar, since intrabar path is unknown), then TP, then EOD close
// on the first bar labelled >= eodHour. If nothing triggers, exit at the last
// bar's close as EOD (truncated day). Returns null when `bars` is empty.
export function walkTrade(bars, dir, entry, stopPctEff, tpPct, timing = QMR_TIMING) {
  const stop = dir === 'LONG' ? entry * (1 - stopPctEff / 100) : entry * (1 + stopPctEff / 100);
  const tp   = tpPct > 0
    ? (dir === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100))
    : null;
  let exit = null, exitReason = 'EOD';
  for (const bar of bars) {
    if (dir === 'LONG'  && bar.l <= stop) { exit = stop; exitReason = 'STOP'; break; }
    if (dir === 'SHORT' && bar.h >= stop) { exit = stop; exitReason = 'STOP'; break; }
    if (tp !== null && dir === 'LONG'  && bar.h >= tp) { exit = tp; exitReason = 'TP'; break; }
    if (tp !== null && dir === 'SHORT' && bar.l <= tp) { exit = tp; exitReason = 'TP'; break; }
    if (parseInt(bar.t.substring(11, 13)) >= timing.eodHour) { exit = bar.c; exitReason = 'EOD'; break; }
  }
  if (exit === null) {
    const last = bars[bars.length - 1];
    if (!last) return null;
    exit = last.c; exitReason = 'EOD';
  }
  const movePct = dir === 'LONG'
    ? (exit - entry) / entry * 100
    : (entry - exit) / entry * 100;
  return { stop, tp, exit, exitReason, movePct };
}

// Cost netting: raw move − round-trip cost − stop slippage (stop exits only),
// THEN scaled by leverage. Costs come off BEFORE leverage because they are a
// property of the notional traded, not of the account. One formula everywhere.
export function netReturn(movePct, exitReason, leverage,
                          costPct = QMR_COSTS.costPct, stopSlipPct = QMR_COSTS.stopSlipPct) {
  return (movePct - costPct - (exitReason === 'STOP' ? stopSlipPct : 0)) * leverage;
}

// ONE Sharpe methodology: DAILY calendar returns x sqrt(252), flat weekdays
// counted as 0%. The per-trade sqrt(trades-per-year) annualisation this
// replaced scaled the SAME per-trade edge up or down with trade count, so any
// optimiser scoring on it rewarded trade frequency instead of edge. Flat-day
// zeros are computed in closed form from the traded-day moments, so this stays
// O(n). Emits the Sharpe-honesty pair too: `sharpeSE` (Lo 2002 error bar) and
// `minTrackYears` (Bailey-Lopez de Prado minimum track record for Sharpe > 0
// at 95%). Chassis systems take at most one trade per day, so traded-day
// returns ARE daily returns and the remaining weekdays are flat zeros.
export function qmrStats(trades, curve, equity) {
  const n    = trades.length;
  const wins = trades.filter(t => t.tradeReturn > 0).length;
  const rets = trades.map(t => t.tradeReturn / 100);
  let tradingDays = n;
  if (curve.length >= 2) {
    let cnt = 0;
    const d0 = new Date(curve[0].date + 'T00:00:00Z');
    const d1 = new Date(curve[curve.length - 1].date + 'T00:00:00Z');
    for (let t = d0.getTime(); t <= d1.getTime(); t += 864e5) {
      const dow = new Date(t).getUTCDay();
      if (dow !== 0 && dow !== 6) cnt++;
    }
    tradingDays = Math.max(cnt, n);
  }
  const N     = Math.max(tradingDays, 1);
  const sum   = rets.reduce((s, r) => s + r, 0);
  const sumsq = rets.reduce((s, r) => s + r * r, 0);
  const muD   = sum / N;
  const varD  = Math.max(sumsq / N - muD * muD, 0);
  const sigD  = Math.sqrt(varD);
  const sharpe = sigD > 0 ? (muD / sigD) * Math.sqrt(252) : 0;
  const downDev = Math.sqrt(rets.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / N);
  const sortino = downDev > 0 ? (muD / downDev) * Math.sqrt(252) : 0;
  const years = curve.length >= 2
    ? (new Date(curve[curve.length - 1].date) - new Date(curve[0].date)) / (365.25 * 864e5) : 1;
  const cagr = (Math.pow(equity, 1 / Math.max(years, 0.01)) - 1) * 100;
  let peak = 1, maxDD = 0;
  for (const { equity: eq } of curve) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  const se = sharpeStdError(sharpe, N);
  const mtrYears = minTrackRecordLength(sharpe);
  return { n, wins, winRate: n ? wins / n : 0, cagr: +cagr.toFixed(2),
           sharpe: +sharpe.toFixed(2), sortino: +sortino.toFixed(2),
           sharpeSE: Number.isFinite(se) ? +se.toFixed(2) : null,
           minTrackYears: Number.isFinite(mtrYears) ? +mtrYears.toFixed(1) : null,
           maxDD: +(maxDD * 100).toFixed(2),
           totalReturn: +((equity - 1) * 100).toFixed(2) };
}

// Joint walk of the BOTH-SIDES book: long and short opened together at half
// size each, so total notional (and therefore total cost) equals one full
// position. Walks the two legs through the SAME bars simultaneously and tracks
// the COMBINED mark bar by bar — which is the only honest way to get MAE/MFE
// here, because the combined path is nothing like either leg's own path. At
// entry the book is net flat; it only develops P&L once one leg closes.
//
// Geometry, for a stop s and target t (t > s): as price falls, the long stops
// at -s BEFORE the short reaches -t, so the losing leg is capped at -1R while
// the winner runs to +t. Both legs lose only on a whipsaw that takes out -s and
// +s in the same session. Returns combined percentages already halved, so
// `movePct` is directly comparable to a single full-size position's move.
export function bothSidesWalk(bars, entry, stopPct, tpPct, timing = QMR_TIMING) {
  if (!bars.length) return null;
  const lStop = entry * (1 - stopPct / 100), lTp = tpPct > 0 ? entry * (1 + tpPct / 100) : null;
  const sStop = entry * (1 + stopPct / 100), sTp = tpPct > 0 ? entry * (1 - tpPct / 100) : null;
  let lDone = null, sDone = null;   // realised leg move %, once closed
  let lStopped = false, sStopped = false;
  let mfe = 0, mae = 0, exitReason = 'EOD';

  const mark = px => {
    const l = lDone != null ? lDone : (px - entry) / entry * 100;
    const s = sDone != null ? sDone : (entry - px) / entry * 100;
    return (l + s) / 2;
  };

  for (const bar of bars) {
    // Stop before TP within a bar, on BOTH legs — intrabar path is unknown, so
    // the conservative assumption is mandatory (same rule as walkTrade).
    if (lDone == null && bar.l <= lStop) { lDone = -stopPct; lStopped = true; }
    if (sDone == null && bar.h >= sStop) { sDone = -stopPct; sStopped = true; }
    if (lDone == null && lTp !== null && bar.h >= lTp) lDone = tpPct;
    if (sDone == null && sTp !== null && bar.l <= sTp) sDone = tpPct;

    // Combined mark at this bar's extremes, with whichever legs are still open.
    for (const px of [bar.l, bar.h, bar.c]) {
      const m = mark(px);
      if (m > mfe) mfe = m;
      if (m < mae) mae = m;
    }
    if (lDone != null && sDone != null) { exitReason = 'BOTH_CLOSED'; break; }
    if (parseInt(bar.t.substring(11, 13)) >= timing.eodHour) {
      if (lDone == null) lDone = (bar.c - entry) / entry * 100;
      if (sDone == null) sDone = (entry - bar.c) / entry * 100;
      exitReason = 'EOD';
      break;
    }
  }
  const last = bars[bars.length - 1];
  if (lDone == null) lDone = (last.c - entry) / entry * 100;
  if (sDone == null) sDone = (entry - last.c) / entry * 100;

  return {
    movePct: (lDone + sDone) / 2,
    longMovePct: lDone, shortMovePct: sDone,
    stoppedLegs: (lStopped ? 1 : 0) + (sStopped ? 1 : 0),
    exitReason, mfePct: mfe, maePct: mae,
  };
}

// Group H1 bars by UTC date — the shared first step of every chassis consumer.
export function groupBarsByDate(bars) {
  const byDate = {};
  for (const b of bars) {
    const date = b.t.substring(0, 10);
    (byDate[date] ??= []).push(b);
  }
  return byDate;
}

// The overnight (Globex) range for `today`, spanning the prior day's late bars
// through this morning's. Returns null when coverage is too thin to trust.
// This is the chassis's volatility measure: the stop is scaled to it, which is
// what keeps the stop OUTSIDE the bar's own noise (the failure mode that made
// cogBacktestEngine's 0.25x-ATR stop hit on 37 of 39 trades).
export function overnightRange(byDate, prev, today, timing = QMR_TIMING) {
  const bars = [
    ...(byDate[prev]  || []).filter(b => parseInt(b.t.substring(11, 13)) >= timing.overnightStartHour),
    ...(byDate[today] || []).filter(b => parseInt(b.t.substring(11, 13)) <= timing.overnightEndHour),
  ];
  if (bars.length < timing.minOvernightBars) return null;
  const high = Math.max(...bars.map(b => b.h));
  const low  = Math.min(...bars.map(b => b.l));
  const mid  = (high + low) / 2;
  if (!mid) return null;
  return { high, low, mid, range: high - low, rangePct: (high - low) / mid * 100, bars };
}

// The entry bar for `today`: the entryHour bar, or the next hour in winter when
// the pre-NY-open slot shifts. Returns null when the day has neither.
export function entryBarFor(dayBars, timing = QMR_TIMING) {
  return dayBars.find(b => b.t.substring(11, 13) === qmrHH(timing.entryHour))
      ?? dayBars.find(b => b.t.substring(11, 13) === qmrHH(timing.entryHour + 1))
      ?? null;
}

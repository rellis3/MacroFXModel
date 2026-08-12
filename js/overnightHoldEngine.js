/**
 * Overnight-Hold vs Buy & Hold — engine.
 *
 * Implements the Colez Trades "Overnight Hold vs Buy & Hold" research task
 * (education/buy-and-hold-notes.md) as a real, runnable backtest: enter long
 * at 20:00 UK, exit 14:30 UK the following session, on NAS100 and XAUUSD,
 * compared against continuous buy & hold over the same window — then both
 * legs are run through a configurable prop-firm rule check.
 *
 * Lego baseplate: M1 packed-array helpers (barUtils), the DST-exact UK/US
 * timezone conversion (nasdaqSessions — Intl/IANA-based, not the ±1h
 * approximation in sessionRanges.londonOffsetHours), day-of-week (sessionRanges),
 * performance metrics (metricsCore), pip/asset-class (instrumentRegistry). The
 * only new logic here is the session-window trade construction, the cost/
 * financing model, the mirror-test integrity check, exposure/correlation, the
 * 3-schema CSV export and the prop-firm rule check.
 *
 * Pure core, IO at the edges (Lego Principle 5 — no lookahead, data passed
 * in): every function here takes already-loaded packed M1 data
 * ({ n, times, opens, highs, lows, closes } from loadM1ForPair) and opts, and
 * returns plain objects/strings. Network (loadM1ForPair itself) is the
 * caller's job — see runOvernightHoldBacktestForPairs() for the thin
 * convenience wrapper that does call it, for server-route use.
 *
 * ── Explicit, documented assumptions (read before trusting a number) ────────
 *   • Costs (spread+commission, slippage): reuse the SAME round-trip %-of-price
 *     defaults already in use for honestForecastEngine.js's honest harness
 *     (DEFAULT_COST_PCT / DEFAULT_SLIP_PCT below — restated here since that
 *     module doesn't export them; same numbers, same source). A configurable
 *     multiplier widens the gold entry leg (thin off-hours liquidity at 20:00
 *     UK) and the index exit leg (US cash-open volatility at 14:30 UK), per
 *     the task's stage-04 note — NOT fetched from a live spread feed.
 *   • Overnight financing/swap: no broker feed for this exists in the repo
 *     (rangeExtEngine.js flags the same gap for multi-day FX holds). Defaults
 *     below are ILLUSTRATIVE round-number bps/night — calibrate against the
 *     actual broker's published swap rate before trusting the net numbers.
 *     Triple-swap day defaults to Wednesday (the task's own framing); this is
 *     broker- and instrument-dependent (some CFD desks charge triple on
 *     Friday instead) — configurable, not fetched.
 *   • Prop-firm ruleset: the four rule categories the task names (daily loss,
 *     max drawdown static/trailing, profit target+time, consistency cap) are
 *     implemented generically with round illustrative defaults — NOT any
 *     single named firm's published rulebook. Replace with the real numbers
 *     of whichever firm is actually being targeted before drawing a pass/fail
 *     conclusion about that firm.
 *   • Correlation to buy & hold uses the overnight trade's return against
 *     buy & hold's own full-calendar-day return ending at the SAME entry mark
 *     (price(20:00,D) / price(20:00,D-1) − 1) — a distinct, overlapping-but-
 *     not-identical window, so the correlation isn't tautologically 1.0.
 *   • Combined-portfolio MAE is the equal-weight average of each leg's own
 *     MAE on days both trade — an approximation, not a joint intrabar walk of
 *     both instruments' M1 paths together (documented, not hidden).
 */

import { bisect, extractBars, resampleTo } from './barUtils.js';
import { zonedTimeToUtc, localDateString } from './nasdaqSessions.js';
import { dowOf } from './sessionRanges.js';
import { assetClass as lookupAssetClass } from './instrumentRegistry.js';
import { mean, stdev } from './statsCore.js';
import {
  summarizeTrades, calmar, sortinoRatio, sharpeRatio, winRate as winRateOf, profitFactor as profitFactorOf,
} from './metricsCore.js';

const UK_TZ = 'Europe/London';

// ── Cost defaults (restated from honestForecastEngine.js's DEFAULT_COST_PCT /
// DEFAULT_SLIP_PCT — same numbers, same convention: round-trip friction as a
// % of price, per asset class. Not exported there, so restated here.) ───────
export const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
export const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };

// Illustrative — NOT fetched from any broker. Annualised-financing-style
// bps/night, applied once per overnight hold (mirror/intraday legs pay none).
export const DEFAULT_FINANCING_BPS_PER_NIGHT = { nq: 2.0, gold: 1.5 };

// Widens the entry leg for gold (thin liquidity outside main COMEX/LBMA hours
// at 20:00 UK) and the exit leg for everything (14:30 UK sits in US cash-open
// volatility) — multipliers on top of the base cost/slip %, not new %'s.
export const DEFAULT_LEG_MULTIPLIERS = {
  goldEntrySpreadMult: 1.5,
  exitSlipMult: 1.5,
};

// Illustrative generic prop-firm-style limits — NOT a specific firm's rules.
export const DEFAULT_RULESET = {
  dailyLossLimitPct: 5,
  maxDrawdownStaticPct: 10,
  maxDrawdownTrailingPct: 10,
  ddMode: 'trailing',        // 'static' | 'trailing' — which one the rule-check verdict uses
  profitTargetPct: 8,
  profitTargetDays: 30,      // trading days; 0 = no time limit
  consistencyCapPct: 30,
};

export const DEFAULT_ACCOUNT_SIZE = 100_000;   // for the Currency P&L CSV export
export const DEFAULT_TRIPLE_SWAP_DOW = 3;      // 0=Sun..6=Sat; 3 = Wednesday

// ── Small date helpers (calendar-date strings, tz-agnostic) ─────────────────
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// ── Stage 01 — source: overlapping range + timezone sanity gate ─────────────

// Trim two packed M1 series to their common [start,end] epoch-second window.
// Returns null if there's no overlap at all.
export function overlappingRange(packedA, packedB) {
  if (!packedA?.n || !packedB?.n) return null;
  const start = Math.max(packedA.times[0], packedB.times[0]);
  const end   = Math.min(packedA.times[packedA.n - 1], packedB.times[packedB.n - 1]);
  return end > start ? { start, end } : null;
}

function firstFridaysInRange(startEpoch, endEpoch) {
  const fridays = [];
  let cursor = new Date(startEpoch * 1000);
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const endDate = new Date(endEpoch * 1000);
  while (cursor <= endDate) {
    const f = new Date(cursor);
    while (f.getUTCDay() !== 5) f.setUTCDate(f.getUTCDate() + 1);
    const fEpoch = f.getTime() / 1000;
    if (fEpoch >= startEpoch && fEpoch <= endEpoch) fridays.push(f.toISOString().slice(0, 10));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return fridays;
}

// Diagnostic, not a hard pass/fail: on each first-Friday-of-month (the NFP
// release day), find the UTC hour with the single largest 1-minute move
// inside 08:00–16:00 UTC and histogram it. NFP prints at 08:30 ET, i.e.
// 12:30 UTC in EDT (Mar–Nov) or 13:30 UTC in EST (Nov–Mar) — if the data's
// timestamps are honest, the peak should cluster there.
export function timezoneSanityCheck(packed) {
  if (!packed?.n) return { fridaysChecked: 0, note: 'no data supplied' };
  const fridays = firstFridaysInRange(packed.times[0], packed.times[packed.n - 1]);
  const hourCounts = new Array(24).fill(0);
  let counted = 0;
  for (const fri of fridays) {
    const dayStart = Date.parse(fri + 'T00:00:00Z') / 1000;
    const bars = extractBars(packed, dayStart + 8 * 3600, dayStart + 16 * 3600);
    if (bars.length < 2) continue;
    let bestIdx = 1, bestMove = -1;
    for (let i = 1; i < bars.length; i++) {
      const move = Math.abs(bars[i].close - bars[i - 1].close) / bars[i - 1].close;
      if (move > bestMove) { bestMove = move; bestIdx = i; }
    }
    hourCounts[new Date(bars[bestIdx].time * 1000).getUTCHours()]++;
    counted++;
  }
  const peakHour = counted ? hourCounts.indexOf(Math.max(...hourCounts)) : null;
  return {
    fridaysChecked: counted,
    peakVolatilityUtcHour: peakHour,
    hourHistogramUtc: hourCounts,
    expectedUtcWindow: '12:00–14:00 (NFP releases 08:30 ET = 12:30 UTC in EDT, 13:30 UTC in EST)',
    withinExpectedWindow: peakHour !== null ? (peakHour >= 12 && peakHour <= 14) : null,
    note: 'Diagnostic only — the timezone gate this feeds is a judgement call for whoever reads it, not an automated pass/fail.',
  };
}

// ── Stage 02 — prepare: fill rule + UK trading calendar ─────────────────────

// "Last tick at-or-before" fill: the most recent bar's close at or before
// targetEpochSec. Returns null (no fabricated fill) if the nearest prior bar
// is more than maxGapSec old — that's a market-closed/data-gap exception, not
// a price.
export function priceAt(packed, targetEpochSec, maxGapSec = 1800) {
  if (!packed?.n) return null;
  const idx = bisect(packed.times, Math.floor(targetEpochSec) + 1) - 1;
  if (idx < 0) return null;
  const gapSec = targetEpochSec - packed.times[idx];
  if (gapSec > maxGapSec) return null;
  return { price: packed.closes[idx], actualEpoch: packed.times[idx], gapSec };
}

// UK calendar dates in [startEpoch,endEpoch] on which an overnight entry can
// open — Sun..Thu (dow 0-4). Friday is excluded: 20:00 UK Friday has no
// following session before the Sunday reopen, per the task's own framing.
export function buildTradingDates(startEpoch, endEpoch) {
  const startDate = localDateString(new Date(startEpoch * 1000), UK_TZ);
  const endDate   = localDateString(new Date(endEpoch * 1000), UK_TZ);
  const dates = [];
  let cur = startDate;
  let guard = 0;
  while (cur <= endDate && guard++ < 20000) {
    const dow = dowOf(cur);
    if (dow >= 0 && dow <= 4) dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ── MAE (Maximum Adverse Excursion), bar-by-bar over the real M1 path ───────
// Long trade: furthest the LOW travelled below entry, as a % of entry (≤0).
export function computeMAEPct(packed, entryEpoch, exitEpoch, entryPrice) {
  const bars = extractBars(packed, entryEpoch, exitEpoch + 60);
  if (!bars.length || !(entryPrice > 0)) return 0;
  let minLow = Infinity;
  for (const b of bars) if (b.low < minLow) minLow = b.low;
  if (!isFinite(minLow)) return 0;
  return Math.min(0, +(((minLow - entryPrice) / entryPrice) * 100).toFixed(2));
}

// ── Stage 03 — build the overnight trades + the mirror (integrity) leg ──────
//
// Returns { trades, mirrors, exceptions, entryPriceByDate } where:
//   trades  = [{ date, exitDate, entryEpoch, exitEpoch, entryPrice, exitPrice,
//                grossPct, maePct }]   — one per valid Sun–Thu entry night
//   mirrors = [{ date, entryEpoch, exitEpoch, grossPct }]  — 14:30→20:00 same-day
//   exceptions = [{ date, leg, reason }]  — every skipped/gap-filled attempt,
//                logged rather than silently dropped (stage-02 gate).
export function buildOvernightTrades(packed, startEpoch, endEpoch, opts = {}) {
  const maxGapSec = opts.maxGapSec ?? 1800;
  const dates = buildTradingDates(startEpoch, endEpoch);
  const trades = [];
  const mirrors = [];
  const exceptions = [];
  const entryPriceByDate = new Map();

  for (const d of dates) {
    const exitDate = addDays(d, 1);
    const entryEpoch = zonedTimeToUtc(d, '20:00', UK_TZ).getTime() / 1000;
    const exitEpoch   = zonedTimeToUtc(exitDate, '14:30', UK_TZ).getTime() / 1000;
    if (entryEpoch < startEpoch || exitEpoch > endEpoch) continue; // outside the trimmed overlap window

    const entryFill = priceAt(packed, entryEpoch, maxGapSec);
    if (!entryFill) { exceptions.push({ date: d, leg: 'overnight-entry', reason: 'no bar within tolerance (market closed / data gap)' }); continue; }
    entryPriceByDate.set(d, entryFill.price);

    const exitFill = priceAt(packed, exitEpoch, maxGapSec);
    if (!exitFill) { exceptions.push({ date: d, leg: 'overnight-exit', reason: 'no bar within tolerance (market closed / data gap)' }); continue; }

    const grossPct = ((exitFill.price / entryFill.price) - 1) * 100;
    const maePct = computeMAEPct(packed, entryFill.actualEpoch, exitFill.actualEpoch, entryFill.price);

    trades.push({
      date: d, exitDate, entryEpoch: entryFill.actualEpoch, exitEpoch: exitFill.actualEpoch,
      entryPrice: entryFill.price, exitPrice: exitFill.price, grossPct, maePct,
    });

    // Mirror leg (14:30 → 20:00, SAME calendar date D) — integrity check only,
    // gross/no-cost, not a tradable claim.
    const mEntryEpoch = zonedTimeToUtc(d, '14:30', UK_TZ).getTime() / 1000;
    const mExitEpoch  = entryEpoch; // 20:00 same day — closes the loop back into the overnight entry
    if (mEntryEpoch >= startEpoch && mEntryEpoch <= endEpoch) {
      const mEntryFill = priceAt(packed, mEntryEpoch, maxGapSec);
      const mExitFill  = priceAt(packed, mExitEpoch, maxGapSec);
      if (mEntryFill && mExitFill) {
        mirrors.push({ date: d, grossPct: ((mExitFill.price / mEntryFill.price) - 1) * 100 });
      } else {
        exceptions.push({ date: d, leg: 'mirror', reason: 'no bar within tolerance for the 14:30→20:00 mirror leg' });
      }
    }
  }

  return { trades, mirrors, exceptions, entryPriceByDate, expectedTradingDays: dates.length };
}

// Mirror-test reconstruction: overnight(D) compounded with mirror(D) should
// roughly reconstruct the FULL calendar-day-to-calendar-day buy&hold move.
// Only computed over dates where BOTH legs exist (a skipped leg breaks the
// identity by construction — that's reported separately as coverage, not
// folded silently into "the pipeline is wrong").
export function mirrorTest(trades, mirrors) {
  const mirrorByDate = new Map(mirrors.map(m => [m.date, m.grossPct]));
  let coveredDays = 0, reconstructMult = 1, overnightMult = 1, mirrorMult = 1;
  for (const t of trades) {
    const m = mirrorByDate.get(t.date);
    if (m === undefined) continue;
    coveredDays++;
    overnightMult *= (1 + t.grossPct / 100);
    mirrorMult    *= (1 + m / 100);
    reconstructMult *= (1 + t.grossPct / 100) * (1 + m / 100);
  }
  return {
    coveredDays,
    totalDays: trades.length,
    overnightGrossPctCompounded: +((overnightMult - 1) * 100).toFixed(3),
    mirrorGrossPctCompounded: +((mirrorMult - 1) * 100).toFixed(3),
    reconstructedGrossPct: +((reconstructMult - 1) * 100).toFixed(3),
  };
}

// ── Stage 04 — costs ──────────────────────────────────────────────────────

export function applyCosts(trades, assetKey, opts = {}) {
  const cls = lookupAssetClass(assetKey);
  // costScale uniformly scales spread+slip+financing together (default 1 =
  // no change) — the single knob the cost-sensitivity sweep below turns.
  const costScale = opts.costScale ?? 1;
  const costPct = (opts.costPct?.[cls] ?? DEFAULT_COST_PCT[cls] ?? DEFAULT_COST_PCT.fx) * costScale;
  const slipPct = (opts.slipPct?.[cls] ?? DEFAULT_SLIP_PCT[cls] ?? DEFAULT_SLIP_PCT.fx) * costScale;
  const legMult = { ...DEFAULT_LEG_MULTIPLIERS, ...(opts.legMultipliers || {}) };
  const financingBpsPerNight = (opts.financingBpsPerNight?.[assetKey]
    ?? DEFAULT_FINANCING_BPS_PER_NIGHT[assetKey] ?? 2.0) * costScale;
  const tripleSwapDow = opts.tripleSwapDow ?? DEFAULT_TRIPLE_SWAP_DOW;

  return trades.map(t => {
    const entrySpreadMult = (assetKey === 'gold') ? legMult.goldEntrySpreadMult : 1;
    const effectiveSpreadPct = costPct * ((entrySpreadMult + 1) / 2); // half entry, half exit leg — entry leg widened for gold
    const effectiveSlipPct = slipPct * ((1 + legMult.exitSlipMult) / 2); // half entry, half exit leg — exit leg widened

    const isTripleSwapNight = dowOf(t.date) === tripleSwapDow;
    const financingPct = (financingBpsPerNight / 100) * (isTripleSwapNight ? 3 : 1); // bps → %

    const netPct = t.grossPct - effectiveSpreadPct - effectiveSlipPct - financingPct;
    return {
      ...t,
      spreadCostPct: +effectiveSpreadPct.toFixed(4),
      slipCostPct: +effectiveSlipPct.toFixed(4),
      financingCostPct: +financingPct.toFixed(4),
      tripleSwap: isTripleSwapNight,
      netPct: +netPct.toFixed(4),
    };
  });
}

// Default cost-scale grid for the sensitivity sweep: 0% (pure gross) through
// 200% of the assumed defaults, finer-grained near 100% where the breakeven
// is expected to sit for a strategy whose gross is strongly positive but
// whose net (at costScale=1) has already been shown to be roughly breakeven.
export const DEFAULT_COST_SCALES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

// ── Stage 04b — cost-sensitivity sweep ───────────────────────────────────────
//
// Re-applies costs at a grid of cost-scale multipliers (0x = free fills, 1x =
// the assumed defaults, 2x = double them) to the SAME already-built gross
// trades — no M1 rescanning, so this is cheap even at 2000+ trades. Answers
// "how far would spread/slip/financing have to fall (or rise) before net
// return crosses zero" — the natural follow-up once costs turn a strongly
// positive gross result negative net at the assumed defaults. Costs only ever
// subtract here, so totalReturnPct is non-increasing in costScale by
// construction; the breakeven is found by linear interpolation between the
// two grid points that bracket the sign change (none found = it doesn't
// cross anywhere in the scanned range, reported explicitly rather than
// guessed at).
export function costSensitivitySweep(grossTrades, assetKey, opts = {}) {
  if (!grossTrades.length) return null;
  const scales = opts.costScales || DEFAULT_COST_SCALES;
  const points = scales.map(costScale => {
    const netTrades = applyCosts(grossTrades, assetKey, { ...opts, costScale });
    const totalMult = netTrades.reduce((m, t) => m * (1 + t.netPct / 100), 1);
    const totalReturnPct = (totalMult - 1) * 100;
    const summ = summarizeTrades(netTrades.map(t => t.netPct), netTrades.map(t => t.date));
    return { costScale, totalReturnPct: +totalReturnPct.toFixed(3), sharpe: summ.sharpe, winRatePct: summ.winRate, profitFactor: summ.profitFactor };
  });

  let breakevenScale = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if ((a.totalReturnPct >= 0) !== (b.totalReturnPct >= 0)) {
      const frac = a.totalReturnPct / (a.totalReturnPct - b.totalReturnPct); // linear interpolation
      breakevenScale = +(a.costScale + frac * (b.costScale - a.costScale)).toFixed(3);
      break;
    }
  }
  const note = breakevenScale !== null ? null
    : (points[0].totalReturnPct < 0
        ? 'net return is already negative at costScale=0 (zero cost) — the gross effect itself is negative, not just cost-eroded'
        : `net return stays positive across the whole scanned range (0x–${scales[scales.length - 1]}x) — no breakeven found in this window`);

  return { points, breakevenScale, assumedScaleNote: 'costScale=1.0 is the engine\'s assumed default spread/slip/financing — see DEFAULT_COST_PCT/DEFAULT_SLIP_PCT/DEFAULT_FINANCING_BPS_PER_NIGHT', note };
}

// ── Buy & hold benchmark ─────────────────────────────────────────────────────

// Continuous hold from the first trade's entry to the last trade's exit, same
// fill convention (last-tick-at-or-before) applied at both endpoints.
export function buildBuyHoldBenchmark(packed, trades, maxGapSec = 1800) {
  if (!trades.length) return null;
  const first = trades[0], last = trades[trades.length - 1];
  const startFill = priceAt(packed, first.entryEpoch, maxGapSec);
  const endFill   = priceAt(packed, last.exitEpoch, maxGapSec);
  if (!startFill || !endFill) return null;
  const totalPct = ((endFill.price / startFill.price) - 1) * 100;
  const years = Math.max((last.exitEpoch - first.entryEpoch) / (365.25 * 86400), 1 / 365.25);
  const cagrPct = (Math.pow(endFill.price / startFill.price, 1 / years) - 1) * 100;
  return {
    startDate: first.date, endDate: last.exitDate,
    startPrice: startFill.price, endPrice: endFill.price,
    totalPct: +totalPct.toFixed(3), cagrPct: +cagrPct.toFixed(3), years: +years.toFixed(2),
  };
}

// Buy & hold's own full-calendar-day return series, marked at the SAME 20:00
// UK checkpoint the overnight trades already use: bh(D_i) = price(D_i,20:00) /
// price(D_{i-1},20:00) − 1, where D_{i-1} is the previous valid entry date
// (not necessarily 1 calendar day earlier if a day was skipped). Deliberately
// NOT the same window as any single overnight trade (that would just equal
// the overnight gross return by construction) — see module header.
export function buyHoldDailyReturns(trades) {
  const out = [];
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1], cur = trades[i];
    out.push({ date: cur.date, pct: ((cur.entryPrice / prev.entryPrice) - 1) * 100 });
  }
  return out;
}

export function correlationToBuyHold(trades) {
  const bh = buyHoldDailyReturns(trades);
  const bhByDate = new Map(bh.map(b => [b.date, b.pct]));
  const xs = [], ys = [];
  for (const t of trades) {
    const b = bhByDate.get(t.date);
    if (b === undefined) continue;
    xs.push(t.grossPct); ys.push(b);
  }
  if (xs.length < 2) return { n: xs.length, r: null };
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return { n: xs.length, r: den > 1e-12 ? +(num / den).toFixed(3) : 0 };
}

// ── Stage 05 — measure ───────────────────────────────────────────────────────

function longestLosingStreak(pnls) {
  let best = 0, cur = 0;
  for (const x of pnls) { if (x < 0) { cur++; best = Math.max(best, cur); } else cur = 0; }
  return best;
}

// Equity curve from compounding net-per-trade returns, one point per closed
// trade (keyed by exit date — when the P&L books).
export function buildEquityCurve(netTrades, startEquity = 100) {
  let equity = startEquity;
  const curve = [];
  for (const t of netTrades) {
    equity *= (1 + t.netPct / 100);
    curve.push({ date: t.exitDate, equity: +equity.toFixed(6) });
  }
  return curve;
}

// Worst peak→trough→recovery drawdown, WITH duration in calendar days
// (recovery = the equity curve first re-touching the pre-drawdown peak; null
// `recovered` means still in drawdown at the end of the series).
export function maxDrawdownWithDuration(curve) {
  if (!curve.length) return { maxDDPct: 0, start: null, trough: null, recovered: null, durationDays: 0, stillInDrawdown: false };
  let runPeak = curve[0].equity, runPeakDate = curve[0].date;
  let inDD = false, ddPeakDate = null, troughEquity = Infinity, troughDate = null;
  let worstDD = 0, worstStart = null, worstTrough = null, worstRecover = null;
  for (const pt of curve) {
    if (pt.equity >= runPeak) {
      if (inDD) {
        const dd = (troughEquity - runPeak) / runPeak;
        if (dd < worstDD) { worstDD = dd; worstStart = ddPeakDate; worstTrough = troughDate; worstRecover = pt.date; }
      }
      runPeak = pt.equity; runPeakDate = pt.date; inDD = false; troughEquity = Infinity;
    } else {
      if (!inDD) { inDD = true; ddPeakDate = runPeakDate; troughEquity = pt.equity; troughDate = pt.date; }
      else if (pt.equity < troughEquity) { troughEquity = pt.equity; troughDate = pt.date; }
    }
  }
  if (inDD) {
    const dd = (troughEquity - runPeak) / runPeak;
    if (dd < worstDD) { worstDD = dd; worstStart = ddPeakDate; worstTrough = troughDate; worstRecover = null; }
  }
  const durationDays = worstStart ? daysBetween(worstStart, worstRecover || worstTrough) : 0;
  return {
    maxDDPct: +(worstDD * 100).toFixed(2),
    start: worstStart, trough: worstTrough, recovered: worstRecover,
    durationDays, stillInDrawdown: !!worstStart && !worstRecover,
  };
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Per-entry-weekday breakdown of the net trade series — the direct,
// zero-new-infrastructure check of "is a specific night (e.g. triple-swap
// Wednesday) dragging the whole result down, and would skipping it help."
// Only Sun-Thu ever have trades by construction (buildTradingDates excludes
// Fri/Sat), so those are the only rows that can be non-empty.
export function weekdayBreakdown(netTrades) {
  const byDow = new Map();
  for (const t of netTrades) {
    const dow = dowOf(t.date);
    if (!byDow.has(dow)) byDow.set(dow, []);
    byDow.get(dow).push(t);
  }
  return [...byDow.keys()].sort().map(dow => {
    const rows = byDow.get(dow);
    const netPcts = rows.map(t => t.netPct);
    const compounded = compoundPct(netPcts);
    return {
      dow,
      weekday: WEEKDAY_NAMES[dow],
      trades: rows.length,
      avgNetPct: +mean(netPcts).toFixed(4),
      compoundedTotalPct: +compounded.toFixed(3),
      winRatePct: +(winRateOf(netPcts) * 100).toFixed(1),
      profitFactor: +profitFactorOf(netPcts).toFixed(3),
      avgFinancingCostPct: +mean(rows.map(t => t.financingCostPct ?? 0)).toFixed(4),
      tripleSwapNights: rows.filter(t => t.tripleSwap).length,
    };
  });
}

// One comparison table for an instrument: overnight (gross+net) metrics,
// alongside buy & hold, exposure and correlation — everything stage 05 asks for.
export function computeMetricsTable(netTrades, benchmark) {
  if (!netTrades.length) return null;
  const grossPcts = netTrades.map(t => t.grossPct);
  const netPcts   = netTrades.map(t => t.netPct);
  const dates     = netTrades.map(t => t.date);
  const equityCurve = buildEquityCurve(netTrades);
  const dd = maxDrawdownWithDuration(equityCurve);
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : 100;
  const first = netTrades[0], last = netTrades[netTrades.length - 1];
  const years = Math.max((last.exitEpoch - first.entryEpoch) / (365.25 * 86400), 1 / 365.25);
  const totalReturnPct = +((finalEquity / 100 - 1) * 100).toFixed(3);
  const cagrPct = +((Math.pow(finalEquity / 100, 1 / years) - 1) * 100).toFixed(3);

  const netSummary = summarizeTrades(netPcts, dates); // sharpe/sortino-adjacent, PF, win rate, VaR/CVaR, per-trade-Sharpe-annualised

  const heldSeconds = netTrades.reduce((s, t) => s + (t.exitEpoch - t.entryEpoch), 0);
  const elapsedSeconds = last.exitEpoch - first.entryEpoch;
  const exposureFraction = elapsedSeconds > 0 ? heldSeconds / elapsedSeconds : 0;
  // Naive linear "what if scaled to 100% time in market" — an approximation,
  // not a re-compounded figure. Labeled as such downstream.
  const returnPerUnitExposure = exposureFraction > 1e-9 ? +(totalReturnPct / exposureFraction).toFixed(3) : null;

  const corr = correlationToBuyHold(netTrades);

  // Buy & hold equity curve, date-aligned with the overnight curve above (for
  // the stage-05 gate: "plot both equity curves on one chart, drawdown under").
  // Built by compounding buyHoldDailyReturns from the same starting equity —
  // NOT the same window as any single overnight trade (see module header).
  let bhEquity = 100;
  const buyHoldEquityCurve = [{ date: first.date, equity: 100 }];
  for (const b of buyHoldDailyReturns(netTrades)) {
    bhEquity *= (1 + b.pct / 100);
    buyHoldEquityCurve.push({ date: b.date, equity: +bhEquity.toFixed(6) });
  }

  return {
    trades: netTrades.length,
    totalReturnPct, cagrPct,
    maxDrawdown: dd,
    sharpe: +sharpeRatio(netPcts, netSummary.tradesPerYr).toFixed(3),
    sortino: +sortinoRatio(netPcts, netSummary.tradesPerYr).toFixed(3),
    calmar: +calmar(cagrPct, dd.maxDDPct).toFixed(3),
    winRatePct: netSummary.winRate,
    profitFactor: netSummary.profitFactor,
    avgWinPct: +(mean(netPcts.filter(x => x > 0)) || 0).toFixed(3),
    avgLossPct: +(mean(netPcts.filter(x => x < 0)) || 0).toFixed(3),
    largestWinPct: +Math.max(...netPcts).toFixed(3),
    largestLossPct: +Math.min(...netPcts).toFixed(3),
    longestLosingStreak: longestLosingStreak(netPcts),
    stdDevPct: +stdev(netPcts, 0).toFixed(3),
    grossTotalReturnPct: +((grossPcts.reduce((mult, g) => mult * (1 + g / 100), 1) - 1) * 100).toFixed(3),
    exposure: {
      avgHoldHours: +(mean(netTrades.map(t => (t.exitEpoch - t.entryEpoch) / 3600))).toFixed(2),
      exposureFraction: +exposureFraction.toFixed(4),
      returnPerUnitExposurePct: returnPerUnitExposure,
      note: 'returnPerUnitExposure = totalReturnPct / exposureFraction — a naive linear scale-up, not re-compounded at higher exposure.',
    },
    correlationToBuyHold: corr,
    benchmark,
    equityCurve,
    buyHoldEquityCurve,
    detail: netSummary,
  };
}

// ── Stage 06 — CSV export (exact 3-column schemas, house convention) ────────

const csvNum = x => (Number.isFinite(x) ? x.toFixed(2) : '0.00');

// % Returns schema (the task's primary format): Date,Return %,MAE %
export function toCsvReturns(netTrades) {
  const lines = ['Date,Return %,MAE %'];
  for (const t of netTrades) lines.push(`${t.date},${csvNum(t.netPct)},${csvNum(t.maePct)}`);
  return lines.join('\n');
}

// R-Multiples schema: date,R,MAE (R). No native stop/risk concept exists in
// this strategy (fixed notional, no SL) — R-unit is DELIBERATELY defined as a
// fixed 1% of notional per trade, matching the account-size convention used
// for the Currency P&L export below. Per CLAUDE.md's degenerate-case note:
// because R-unit is a fixed % and the $ P&L export uses the SAME fixed % of
// the SAME notional, the R column is numerically redundant with % Return
// here — stated plainly rather than hidden.
export function toCsvRMultiples(netTrades, riskPctOfNotional = 1) {
  const lines = ['date,R,MAE (R)'];
  for (const t of netTrades) {
    const r = t.netPct / riskPctOfNotional;
    const maeR = t.maePct / riskPctOfNotional;
    lines.push(`${t.date},${r.toFixed(2)},${maeR.toFixed(2)}`);
  }
  return lines.join('\n');
}

// Currency P&L schema: Trade Date,PnL ($),Risk ($)
export function toCsvCurrency(netTrades, accountSize = DEFAULT_ACCOUNT_SIZE, notionalPerTrade = accountSize, riskPctOfNotional = 1) {
  const lines = ['Trade Date,PnL ($),Risk ($)'];
  for (const t of netTrades) {
    const pnl = (t.netPct / 100) * notionalPerTrade;
    const risk = (riskPctOfNotional / 100) * notionalPerTrade;
    lines.push(`${t.date},${pnl.toFixed(2)},${risk.toFixed(2)}`);
  }
  return lines.join('\n');
}

// Combined pass: blends N instruments' net-trade series into one equal-weight
// synthetic portfolio, one row per date present in ANY instrument. On a date
// only one instrument trades, that leg's own return/MAE is used unweighted
// (equivalent to holding cash on the other leg that night).
export function combineInstruments(byInstrument /* { key: netTrades[] } */) {
  const byDate = new Map();
  for (const [key, trades] of Object.entries(byInstrument)) {
    for (const t of trades) {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date).push({ key, netPct: t.netPct, maePct: t.maePct });
    }
  }
  const dates = [...byDate.keys()].sort();
  return dates.map(date => {
    const legs = byDate.get(date);
    return {
      date,
      netPct: +(mean(legs.map(l => l.netPct))).toFixed(4),
      maePct: +(mean(legs.map(l => l.maePct))).toFixed(2),
      legs: legs.map(l => l.key),
    };
  });
}

// ── Cross-instrument diversification analysis (walk-forward + IS/OOS) ──────
//
// The combined pass's headline number (equal-weight blend beats each single
// leg) is a single full-history statistic — exactly the kind of number
// Lego Principle 5 says isn't evidence on its own. This section asks two
// separate honesty questions of it:
//   1. Walk-forward: does the blend beat the stronger leg EVERY year, or is
//      the full-sample number carried by one or two unusual years (the
//      "yearly heatmap" concentration check)?
//   2. True IS/OOS: split the whole run at one calendar date (same boundary
//      for both legs, no leakage) and see whether the diversification effect
//      — and the gold/nq correlation that drives it — survives on data after
//      the split, not just across the full history that already includes it.

function compoundPct(pcts) {
  return (pcts.reduce((m, x) => m * (1 + x / 100), 1) - 1) * 100;
}

const yearOf = dateStr => dateStr.slice(0, 4);

// Pearson correlation between two date-keyed {date, pct} series — generic
// version of correlationToBuyHold's inline math, reused here for gold-vs-nq.
function pearsonByDate(seriesA, seriesB) {
  const bByDate = new Map(seriesB.map(s => [s.date, s.pct]));
  const xs = [], ys = [];
  for (const a of seriesA) {
    const b = bByDate.get(a.date);
    if (b === undefined) continue;
    xs.push(a.pct); ys.push(b);
  }
  if (xs.length < 2) return { n: xs.length, r: null };
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  const den = Math.sqrt(dx2 * dy2);
  return { n: xs.length, r: den > 1e-12 ? +(num / den).toFixed(3) : 0 };
}

// One row per calendar year present in either leg: gold/nq/combined net %,
// trade counts, the year's gold-nq correlation, and whether the blend beat
// the better leg / the worse leg that specific year (not the full-history
// average of those comparisons).
export function yearlyDiversificationBreakdown(goldTrades, nqTrades) {
  const years = [...new Set([...goldTrades.map(t => yearOf(t.date)), ...nqTrades.map(t => yearOf(t.date))])].sort();
  const goldByYear = new Map(), nqByYear = new Map();
  for (const t of goldTrades) { const y = yearOf(t.date); if (!goldByYear.has(y)) goldByYear.set(y, []); goldByYear.get(y).push(t); }
  for (const t of nqTrades) { const y = yearOf(t.date); if (!nqByYear.has(y)) nqByYear.set(y, []); nqByYear.get(y).push(t); }

  return years.map(y => {
    const g = goldByYear.get(y) || [], n = nqByYear.get(y) || [];
    const gPct = g.length ? compoundPct(g.map(t => t.netPct)) : null;
    const nPct = n.length ? compoundPct(n.map(t => t.netPct)) : null;
    const combined = combineInstruments({ gold: g, nq: n });
    const cPct = combined.length ? compoundPct(combined.map(c => c.netPct)) : null;
    const corr = pearsonByDate(
      g.map(t => ({ date: t.date, pct: t.netPct })),
      n.map(t => ({ date: t.date, pct: t.netPct })),
    );
    const legPcts = [gPct, nPct].filter(x => x !== null);
    const betterLeg = legPcts.length ? Math.max(...legPcts) : null;
    const worseLeg = legPcts.length ? Math.min(...legPcts) : null;
    return {
      year: y,
      goldNetPct: gPct !== null ? +gPct.toFixed(2) : null,
      nqNetPct: nPct !== null ? +nPct.toFixed(2) : null,
      combinedNetPct: cPct !== null ? +cPct.toFixed(2) : null,
      goldTrades: g.length, nqTrades: n.length,
      correlation: corr.r,
      beatBetterLeg: cPct !== null && betterLeg !== null ? cPct > betterLeg : null,
      beatWorseLeg: cPct !== null && worseLeg !== null ? cPct > worseLeg : null,
    };
  });
}

// True chronological in-sample / out-of-sample split (Lego Principle 5 — no
// number here is evidence without this). Splits at ONE calendar date derived
// from the shared overlap window (not per-leg trade count, so gold, nq and
// the combined blend all see the identical boundary — no leakage from one
// leg's density differing from the other's). oosFrac=0.4 matches
// honestForecastEngine.js's summarizeSplit default.
export function diversificationIsOosSplit(goldTrades, nqTrades, overlapWindow, oosFrac = 0.4) {
  const splitEpoch = overlapWindow.start + (1 - oosFrac) * (overlapWindow.end - overlapWindow.start);
  const splitDate = localDateString(new Date(splitEpoch * 1000), UK_TZ);
  const bucket = trades => ({ is: trades.filter(t => t.date < splitDate), oos: trades.filter(t => t.date >= splitDate) });
  const g = bucket(goldTrades), n = bucket(nqTrades);

  const summarizeHalf = (gSet, nSet) => {
    const gPct = gSet.length ? compoundPct(gSet.map(t => t.netPct)) : null;
    const nPct = nSet.length ? compoundPct(nSet.map(t => t.netPct)) : null;
    const combined = combineInstruments({ gold: gSet, nq: nSet });
    const cPct = combined.length ? compoundPct(combined.map(c => c.netPct)) : null;
    const sharpeOf = (rows, pctKey, dateKey) => rows.length >= 2 ? summarizeTrades(rows.map(r => r[pctKey]), rows.map(r => r[dateKey])).sharpe : null;
    const corr = pearsonByDate(
      gSet.map(t => ({ date: t.date, pct: t.netPct })),
      nSet.map(t => ({ date: t.date, pct: t.netPct })),
    );
    return {
      goldTrades: gSet.length, nqTrades: nSet.length, combinedRows: combined.length,
      goldNetPct: gPct !== null ? +gPct.toFixed(2) : null,
      nqNetPct: nPct !== null ? +nPct.toFixed(2) : null,
      combinedNetPct: cPct !== null ? +cPct.toFixed(2) : null,
      goldSharpe: sharpeOf(gSet, 'netPct', 'date'),
      nqSharpe: sharpeOf(nSet, 'netPct', 'date'),
      combinedSharpe: sharpeOf(combined, 'netPct', 'date'),
      correlation: corr.r,
    };
  };

  return { splitDate, oosFrac, inSample: summarizeHalf(g.is, n.is), outOfSample: summarizeHalf(g.oos, n.oos) };
}

// ── Stage 07 — prop-firm rule check ─────────────────────────────────────────

// Group a per-day equity series into contiguous breach episodes (start/end/
// trough), instead of only the single worst one — "when it failed the gate"
// needs the whole event log, not just the first or worst occurrence.
function breachEpisodes(series, isBreached) {
  const episodes = [];
  let cur = null;
  for (let i = 0; i < series.length; i++) {
    if (isBreached(series[i], i, series)) {
      if (!cur) cur = [];
      cur.push(series[i]);
    } else if (cur) {
      episodes.push(cur); cur = null;
    }
  }
  if (cur) episodes.push(cur);
  return episodes.map(days => {
    const trough = days.reduce((min, p) => (p.equity < min.equity ? p : min), days[0]);
    return {
      startDay: days[0].day, endDay: days[days.length - 1].day,
      days: days.length,
      troughDay: trough.day, troughEquity: +trough.equity.toFixed(2),
    };
  });
}

export function runPropFirmRuleCheck(netTrades, ruleset = DEFAULT_RULESET) {
  if (!netTrades.length) return null;
  const rs = { ...DEFAULT_RULESET, ...ruleset };
  const sorted = netTrades.slice().sort((a, b) => a.exitDate < b.exitDate ? -1 : 1);

  // Aggregate P&L by the day it CLOSES (exit date) — when it books.
  const byDay = new Map();
  for (const t of sorted) byDay.set(t.exitDate, (byDay.get(t.exitDate) || 0) + t.netPct);
  const dayDates = [...byDay.keys()].sort();

  let equity = 100, peak = 100;
  let dailyLossBreach = null, staticDDBreach = null, trailingDDBreach = null;
  let profitTargetHitDate = null, profitTargetTradingDays = null;
  const dailyEquityStart = new Map();
  const dailyLossBreachEvents = [];
  const equitySeries = []; // [{day, equity, peak}] — the full daily equity path, for episode grouping below

  for (let i = 0; i < dayDates.length; i++) {
    const day = dayDates[i];
    const startEquity = equity;
    dailyEquityStart.set(day, startEquity);
    equity *= (1 + byDay.get(day) / 100);
    const dayLossPct = ((equity - startEquity) / startEquity) * 100;
    if (dayLossPct <= -rs.dailyLossLimitPct) {
      const ev = { day, dayLossPct: +dayLossPct.toFixed(2) };
      dailyLossBreachEvents.push(ev);
      if (!dailyLossBreach) dailyLossBreach = ev;
    }

    if (!staticDDBreach && equity <= 100 * (1 - rs.maxDrawdownStaticPct / 100)) staticDDBreach = { day, equity: +equity.toFixed(2) };

    peak = Math.max(peak, equity);
    if (!trailingDDBreach && equity <= peak * (1 - rs.maxDrawdownTrailingPct / 100)) trailingDDBreach = { day, equity: +equity.toFixed(2), peak: +peak.toFixed(2) };
    equitySeries.push({ day, equity, peak });

    if (!profitTargetHitDate && equity >= 100 * (1 + rs.profitTargetPct / 100)) {
      profitTargetHitDate = day;
      profitTargetTradingDays = i + 1;
    }
  }

  // Full breach-event logs (not just the first/worst occurrence) — grouped
  // into contiguous episodes so a multi-year drawdown reads as one event,
  // not hundreds of daily rows.
  const staticDrawdownEpisodes = breachEpisodes(equitySeries, pt => pt.equity <= 100 * (1 - rs.maxDrawdownStaticPct / 100));
  const trailingDrawdownEpisodes = breachEpisodes(equitySeries, pt => pt.equity <= pt.peak * (1 - rs.maxDrawdownTrailingPct / 100));

  // Consistency: best single day's profit ÷ total profit, over the window up
  // to the target date (or the whole series if the target was never reached).
  const endIdx = profitTargetHitDate ? dayDates.indexOf(profitTargetHitDate) + 1 : dayDates.length;
  const windowDays = dayDates.slice(0, endIdx);
  const dayPnlPct = windowDays.map(day => byDay.get(day));
  const totalProfitPct = dayPnlPct.reduce((s, x) => s + Math.max(x, 0), 0);
  const bestDayPct = windowDays.length ? Math.max(...dayPnlPct) : 0;
  const consistencyRatio = totalProfitPct > 1e-9 ? (bestDayPct / totalProfitPct) * 100 : null;
  const consistencyBreach = consistencyRatio !== null && consistencyRatio > rs.consistencyCapPct;

  const ddBreach = rs.ddMode === 'static' ? staticDDBreach : trailingDDBreach;
  const timeExpired = rs.profitTargetDays > 0 && profitTargetTradingDays !== null && profitTargetTradingDays > rs.profitTargetDays;

  return {
    ruleset: rs,
    tradingDays: dayDates.length,
    finalEquity: +equity.toFixed(2),
    dailyLossBreach,
    dailyLossBreachEvents,          // EVERY day that breached, not just the first
    staticDrawdown: staticDDBreach,
    trailingDrawdown: trailingDDBreach,
    staticDrawdownEpisodes,         // EVERY contiguous static-DD breach episode
    trailingDrawdownEpisodes,       // EVERY contiguous trailing-DD breach episode
    activeDrawdownRule: rs.ddMode,
    activeDrawdownBreach: ddBreach,
    activeDrawdownEpisodes: rs.ddMode === 'static' ? staticDrawdownEpisodes : trailingDrawdownEpisodes,
    profitTargetHitDate,
    profitTargetTradingDays,
    profitTargetWithinTimeLimit: profitTargetHitDate ? !timeExpired : null,
    consistency: { bestDayPct: +bestDayPct.toFixed(2), totalProfitToTargetPct: +totalProfitPct.toFixed(2), ratioPct: consistencyRatio !== null ? +consistencyRatio.toFixed(1) : null, breach: consistencyBreach },
    verdict: {
      dailyLoss: !dailyLossBreach,
      drawdown: !ddBreach,
      profitTargetReachedInTime: profitTargetHitDate ? !timeExpired : false,
      consistency: !consistencyBreach,
      wouldPassOnHistoricalData: !dailyLossBreach && !ddBreach && !!profitTargetHitDate && !timeExpired && !consistencyBreach,
    },
  };
}

// D1 (UTC calendar day) OHLC resample directly off the packed typed arrays —
// for the overview chart. Deliberately NOT routed through barUtils.resampleTo
// (which materializes a bar-object array first): at 3.6M+ M1 rows over a full
// history, that intermediate array is the memory-heavy part this avoids.
export function resampleDailyFromPacked(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  if (!n) return [];
  const out = [];
  let bucketStart = times[0] - (times[0] % 86400);
  let o = opens[0], h = highs[0], l = lows[0], c = closes[0];
  for (let i = 1; i < n; i++) {
    const b = times[i] - (times[i] % 86400);
    if (b !== bucketStart) {
      out.push({ time: bucketStart, open: o, high: h, low: l, close: c });
      bucketStart = b; o = opens[i]; h = highs[i]; l = lows[i]; c = closes[i];
    } else {
      if (highs[i] > h) h = highs[i];
      if (lows[i] < l) l = lows[i];
      c = closes[i];
    }
  }
  out.push({ time: bucketStart, open: o, high: h, low: l, close: c });
  return out;
}

// ── Orchestrator (pure core; data passed in) ────────────────────────────────

export function runOvernightHoldForInstrument(assetKey, packed, otherPacked, opts = {}) {
  if (!packed?.n) return { assetKey, error: 'no M1 data available for this instrument' };
  const overlap = otherPacked?.n ? overlappingRange(packed, otherPacked) : { start: packed.times[0], end: packed.times[packed.n - 1] };
  if (!overlap) return { assetKey, error: 'no overlapping date range with the other instrument' };

  const tzGate = timezoneSanityCheck(packed);
  const { trades: grossTrades, mirrors, exceptions, expectedTradingDays } = buildOvernightTrades(packed, overlap.start, overlap.end, opts);
  const mirror = mirrorTest(grossTrades, mirrors);
  const netTrades = applyCosts(grossTrades, assetKey, opts);
  const benchmark = buildBuyHoldBenchmark(packed, grossTrades, opts.maxGapSec);
  const metrics = computeMetricsTable(netTrades, benchmark);
  const ruleCheck = metrics ? runPropFirmRuleCheck(netTrades, opts.ruleset) : null;
  const costSweep = opts.includeCostSweep === false ? null : costSensitivitySweep(grossTrades, assetKey, opts);
  const weekday = weekdayBreakdown(netTrades);

  return {
    assetKey,
    overlapWindow: { start: overlap.start, end: overlap.end, startDate: localDateString(new Date(overlap.start * 1000), UK_TZ), endDate: localDateString(new Date(overlap.end * 1000), UK_TZ) },
    timezoneGate: tzGate,
    expectedTradingDays,
    actualTrades: grossTrades.length,
    exceptions,
    mirrorTest: mirror,
    trades: netTrades,
    metrics,
    ruleCheck,
    costSweep,
    weekday,
    dailyBars: opts.includeDailyBars === false ? null : resampleDailyFromPacked(packed),
    csv: metrics ? { returns: toCsvReturns(netTrades), rMultiples: toCsvRMultiples(netTrades), currency: toCsvCurrency(netTrades, opts.accountSize, opts.notionalPerTrade) } : null,
  };
}

export function runOvernightHoldBacktest(m1ByInstrument /* { gold: packed, nq: packed } */, opts = {}) {
  const keys = Object.keys(m1ByInstrument);
  const results = {};
  for (const key of keys) {
    const other = keys.find(k => k !== key);
    results[key] = runOvernightHoldForInstrument(key, m1ByInstrument[key], other ? m1ByInstrument[other] : null, opts);
  }
  const netByInstrument = {};
  for (const key of keys) if (results[key]?.trades) netByInstrument[key] = results[key].trades;
  const combined = Object.keys(netByInstrument).length > 1 ? combineInstruments(netByInstrument) : null;

  // Diversification is only a meaningful two-leg question — gold vs nq
  // specifically, not generic to N instruments. Skip silently (not an
  // error) if either leg is missing or if a third instrument were ever added.
  let diversification = null;
  if (netByInstrument.gold && netByInstrument.nq) {
    diversification = {
      yearly: yearlyDiversificationBreakdown(netByInstrument.gold, netByInstrument.nq),
      isOosSplit: diversificationIsOosSplit(netByInstrument.gold, netByInstrument.nq, results.gold.overlapWindow, opts.diversificationOosFrac),
    };
  }
  let combinedSummary = null, combinedRuleCheck = null, combinedCsv = null;
  if (combined) {
    const asTrades = combined.map(c => ({ ...c, exitDate: c.date }));
    combinedRuleCheck = runPropFirmRuleCheck(asTrades, opts.ruleset);
    combinedCsv = toCsvReturns(combined.map(c => ({ date: c.date, netPct: c.netPct, maePct: c.maePct })));
    const curve = buildEquityCurve(asTrades);
    const dd = maxDrawdownWithDuration(curve);
    const netPcts = combined.map(c => c.netPct);
    const summ = summarizeTrades(netPcts, combined.map(c => c.date));
    const finalEquity = curve.length ? curve[curve.length - 1].equity : 100;
    combinedSummary = {
      trades: combined.length,
      totalReturnPct: +((finalEquity / 100 - 1) * 100).toFixed(3),
      maxDrawdown: dd,
      sharpe: summ.sharpe,
      winRatePct: summ.winRate,
      profitFactor: summ.profitFactor,
      equityCurve: curve,
    };
  }

  return {
    instruments: results,
    combined: combined ? { trades: combined, csv: combinedCsv, ruleCheck: combinedRuleCheck, summary: combinedSummary } : null,
    diversification,
  };
}

// Convenience wrapper that DOES do network IO (loadM1ForPair) — for server
// routes / CLI scripts. The pure core above stays testable on synthetic data
// with zero network.
export async function runOvernightHoldBacktestForPairs(pairKeys, opts = {}) {
  const { loadM1ForPair } = await import('./volBacktestM1Engine.js');
  const m1ByInstrument = {};
  for (const key of pairKeys) {
    m1ByInstrument[key] = await loadM1ForPair(key);
  }
  return runOvernightHoldBacktest(m1ByInstrument, opts);
}

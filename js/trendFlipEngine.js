/**
 * Trend-Flip Engine — HTF-bias-gated, discrete-flip trend entry with an
 * ATR stop + fixed-RR target, walked on real M1 path. New strategy family
 * (v1), not a re-port of the Pine "MTF Trend Dashboard" indicator that
 * inspired it — that script's EMA20/50/200 stack was already A/B tested here
 * (js/trendFollowEmaEngine.js) and came back NULL, so this engine reuses
 * dayTypeCore's drift/diffusion score for the HTF/LTF CONVICTION read instead
 * of re-importing the nulled EMA-stack idea.
 *
 * IMPORTANT — what classifyDayType's `signedT` actually is, and the bug that
 * caught it: `signedT` is a FADE-VS-FOLLOW lean (trend-day-ness re-centred on
 * zero), not a bullish/bearish direction — its two estimators
 * (efficiencyRatio, varianceRatio) both take `Math.abs()` of the price move,
 * so a clean down-trend and a clean up-trend score IDENTICALLY positive. An
 * earlier version of this file used `sign(signedT)` as the trade direction;
 * `trendFlipEngine.test.mjs` caught it immediately (a down-drift synthetic
 * market read HTF-bullish). Fixed here: DIRECTION comes from the sign of the
 * realized return over the same window; classifyDayType's T (unsigned,
 * [0,1] trend-day-ness) is used only as a CONVICTION multiplier on that sign
 * — "lean" = sign(return) × T. Still one brick, used for what it actually
 * measures.
 *
 * The Lego reuse:
 *   • The conviction read (T) for both HTF and LTF is `classifyDayType` —
 *     one classifier, two windows, no new indicator invented. Direction is
 *     `Math.sign` of the window's own return, not a second indicator.
 *   • The fill/exit walk is `walkBars` from forecastCore.js (the same fill
 *     walker every other engine uses) — passed a stop-type order at the LTF
 *     bar's open so it fills immediately and resolves SL/TP off the real M1
 *     path. No new bespoke walker.
 *   • Stats are `summarizeSplit`/`summarizeTrades` from honestForecastEngine
 *     / metricsCore — same IS/OOS + Sharpe/DD definitions as every other
 *     backtest card.
 *
 * No lookahead: `classifyDayType(ctx, idx, win)` only reads indices < idx
 * (dayTypeCore's own guarantee), and the direction sign is read off the same
 * < idx window. The HTF read for a given LTF bar uses the daily index of
 * that bar's calendar date, which itself only reads days strictly BEFORE
 * that date — so both signals are fully known before the LTF bar that acts
 * on them opens. Entry executes at the NEXT LTF bar's open after the flip is
 * confirmed on the signal bar's close.
 */

import { classifyDayType } from './dayTypeCore.js';
import { atrWilder } from './indicatorCore.js';
import { resampleTo, extractBars } from './barUtils.js';
import { walkBars } from './forecastCore.js';
import { summarizeSplit } from './honestForecastEngine.js';

// Same magnitude as forecastCore's DEFAULT_COST_PCT/DEFAULT_SLIP_PCT — kept
// local (not imported) because those are forecastCore-internal, not exported;
// the numbers are the house convention for round-trip friction by asset class.
export const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
export const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };

export const DEFAULTS = {
  htfWin: 20,        // daily bars the HTF classifyDayType reads
  htfThresh: 0.15,   // |signedT| the HTF must clear to count as a bias, not noise
  ltfMinutes: 240,   // LTF bar size in minutes (4H default)
  ltfWin: 12,        // LTF bars the LTF classifyDayType reads (~2 days at 4H)
  weakThresh: 0.3,   // LTF was "not yet aligned" if |prev signedT| below this
  ltfThresh: 0.3,    // LTF must clear this to count as "now aligned"
  atrPeriod: 14,
  atrMult: 1.5,
  rr: 1.0,           // single target = atrMult*rr*ATR from entry
  oosFrac: 0.4,
};

// ── HTF bias series: sign(return over the window) × classifyDayType conviction ──
// Returns a Map<'YYYY-MM-DD', lean> where lean for date D is computed from
// days strictly before D (both the return sign and classifyDayType's own
// no-lookahead guarantee) — so it's the bias KNOWN before day D's session
// starts, usable at any LTF bar timestamped on day D. lean > 0 = bullish
// trend, < 0 = bearish trend; magnitude = how trend-like (vs choppy) that
// move was, NOT a probability.
export function computeHtfBiasByDate(dailyBars, win = DEFAULTS.htfWin) {
  const closes = dailyBars.map(b => b.close);
  const byDate = new Map();
  const dates = [];
  for (let i = win + 1; i < dailyBars.length; i++) {
    const { T } = classifyDayType({ closes, idx: i, win }, {});
    const dir = Math.sign(closes[i - 1] - closes[i - 1 - win]);
    byDate.set(dailyBars[i].date, dir * T);
    dates.push(dailyBars[i].date);
  }
  return { byDate, dates };
}

// Most recent HTF date <= target (binary search on ascending ISO date strings).
function htfBiasForDate(htf, targetDate) {
  const { byDate, dates } = htf;
  if (!dates.length) return null;
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid] <= targetDate) lo = mid + 1; else hi = mid;
  }
  const i = lo - 1;
  return i >= 0 ? byDate.get(dates[i]) : null;
}

// ── LTF lean series aligned to LTF bars — same sign(return) × T construction ──
// series[k] = lean known BEFORE bar k opens (reads bars < k). series[j] is
// therefore "state going into bar j" (the pre-flip read); series[j+1] is
// "state after bar j closed" (the post-flip read) — the pair a flip check needs.
export function computeLtfLeanSeries(ltfBars, win = DEFAULTS.ltfWin) {
  const closes = ltfBars.map(b => b.close);
  const out = new Array(ltfBars.length).fill(null);
  for (let k = win + 1; k < ltfBars.length; k++) {
    const { T } = classifyDayType({ closes, idx: k, win }, {});
    const dir = Math.sign(closes[k - 1] - closes[k - 1 - win]);
    out[k] = dir * T;
  }
  return out;
}

// ── One instrument's trades ──────────────────────────────────────────────────
// dailyBars: [{date,open,high,low,close}] (fetchD1 shape).
// m1Packed: {n,times,opens,highs,lows,closes} (loadM1ForPair shape).
// Returns { trades, params }. trades[] are already net of cost+slippage.
export function runTrendFlip(dailyBars, m1Packed, assetClass, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const costPct = opts.costPct ?? DEFAULT_COST_PCT[assetClass] ?? DEFAULT_COST_PCT.fx;
  const slipPct = opts.slipPct ?? DEFAULT_SLIP_PCT[assetClass] ?? DEFAULT_SLIP_PCT.fx;

  // Full daily history feeds the HTF lookback regardless of dateFrom — only
  // the M1/LTF extraction window (which bars actually get evaluated for a
  // trade) is restricted, so the classifier's initial window isn't starved.
  const htf = computeHtfBiasByDate(dailyBars, p.htfWin);

  const fromEpoch = opts.dateFrom ? Math.floor(Date.parse(opts.dateFrom + 'T00:00:00Z') / 1000) : m1Packed.times[0];
  const toEpoch = opts.dateTo ? Math.floor(Date.parse(opts.dateTo + 'T23:59:59Z') / 1000) : m1Packed.times[m1Packed.n - 1] + 60;
  const m1Bars = extractBars(m1Packed, fromEpoch, toEpoch);
  const ltfBars = resampleTo(m1Bars, p.ltfMinutes);
  const ltfLean = computeLtfLeanSeries(ltfBars, p.ltfWin);
  const atr = atrWilder(ltfBars, p.atrPeriod);

  const trades = [];
  // j is the SIGNAL bar (its close confirms the flip); entry is at bar j+1's open.
  for (let j = p.ltfWin; j < ltfBars.length - 1; j++) {
    const prevLean = ltfLean[j];       // state going INTO bar j
    const curLean = ltfLean[j + 1];    // state AFTER bar j closed
    if (prevLean == null || curLean == null) continue;

    const entryBar = ltfBars[j + 1];
    const dateStr = new Date(entryBar.time * 1000).toISOString().slice(0, 10);
    const htfLean = htfBiasForDate(htf, dateStr);
    if (htfLean == null) continue;

    const htfBullish = htfLean > p.htfThresh;
    const htfBearish = htfLean < -p.htfThresh;
    const wasWeak = Math.abs(prevLean) < p.weakThresh;

    const flipUp = wasWeak && curLean > p.ltfThresh && htfBullish;
    const flipDown = wasWeak && curLean < -p.ltfThresh && htfBearish;
    if (!flipUp && !flipDown) continue;

    const isBuy = flipUp;
    const atrVal = atr[j];
    if (!(atrVal > 0)) continue;

    // Slippage on the stop-style entry (house convention: free fills aren't honest).
    const rawOpen = entryBar.open;
    const entry = isBuy ? rawOpen * (1 + slipPct / 100) : rawOpen * (1 - slipPct / 100);
    const slDist = atrVal * p.atrMult;
    const tpDist = slDist * p.rr;
    const sl = isBuy ? entry - slDist : entry + slDist;
    const tp = isBuy ? entry + tpDist : entry - tpDist;

    const window = extractBars(m1Packed, entryBar.time, entryBar.time + 30 * 86400);
    if (!window.length) continue;
    const res = walkBars(window, entry, tp, sl, isBuy, 'stop', entry);
    if (!res || !res.filled) continue;

    const mae = computeMae(window, res.fillTime, res.exitTime, entry, isBuy);
    const stopPct = (slDist / entry) * 100;
    const netPnlPct = res.pnlPct - costPct;

    trades.push({
      instrument: null,           // filled in by the caller (one engine call = one instrument)
      date: dateStr,
      side: isBuy ? 'BUY' : 'SELL',
      entry_ts: entryBar.time, entry_time: new Date(entryBar.time * 1000).toISOString(),
      exit_ts: res.exitTime, exit_time: res.exitTime ? new Date(res.exitTime * 1000).toISOString() : null,
      entry_price: entry, sl, tp,
      // Reconstruct the realized exit price from walkBars' gross pnlPct (it
      // reports pnl, not the exit level) — exact for win/loss (tp/sl) and the
      // only way to get it for 'open' (marked to the window's last close).
      exit_price: isBuy ? entry * (1 + res.pnlPct / 100) : entry * (1 - res.pnlPct / 100),
      outcome: res.outcome,       // 'win' | 'loss' | 'open'
      filled: true,
      pnl_pct: +netPnlPct.toFixed(4),
      mae_pct: +mae.toFixed(4),
      stop_pct: +stopPct.toFixed(4),
      R: stopPct > 1e-9 ? +(netPnlPct / stopPct).toFixed(4) : 0,
      mae_R: stopPct > 1e-9 ? +(mae / stopPct).toFixed(4) : 0,
      htf_lean: +htfLean.toFixed(4),
      ltf_lean: +curLean.toFixed(4),
      cost_pct: costPct,
    });
  }

  return { trades, params: { ...p, costPct, slipPct, assetClass } };
}

// MAE from the real M1 path between fill and exit — Low-vs-entry for longs,
// High-vs-entry for shorts, per CLAUDE.md's MAE discipline (never approximated
// from the close-to-close return).
function computeMae(bars, fillTime, exitTime, entry, isBuy) {
  let worst = 0;
  for (const b of bars) {
    if (b.time < fillTime) continue;
    if (exitTime != null && b.time > exitTime) break;
    const adverse = isBuy ? (entry - b.low) / entry * 100 : (b.high - entry) / entry * 100;
    if (adverse > worst) worst = adverse;
  }
  return worst;
}

// ── Public: run + IS/OOS summarize for one instrument ────────────────────────
export function runTrendFlipSummarized(instrumentKey, dailyBars, m1Packed, assetClass, opts = {}) {
  const { trades, params } = runTrendFlip(dailyBars, m1Packed, assetClass, opts);
  for (const t of trades) t.instrument = instrumentKey;
  const split = summarizeSplit(trades, params.oosFrac);
  return { instrument: instrumentKey, trades, params, ...split };
}

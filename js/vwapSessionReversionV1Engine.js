/**
 * VWAP Session-Transition Reversion Engine (v1) — tests a specific, repeated
 * personal pattern described across two independent transcripts in
 * `education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md` ("VWAP
 * session-transition reversion (London -> New York)"):
 *
 *   "After a decent directional move during the London session, look for
 *   price to move back toward VWAP as the market transitions into the first
 *   3-4 hours of New York."
 *
 * This is a DIFFERENT hypothesis from the already-tested-and-null VWAP ± 2σ
 * band_fade/vwap_bounce/band_follow family in `js/vwapReversionEngine.js`
 * (`MD files/VWAP_REVERSION_FINDINGS.md`): that engine fades a STRETCH TO A
 * SIGMA BAND, at any time of day. This engine fades a SESSION HANDOFF —
 * whatever London did, bet on reversion toward the day's VWAP specifically
 * as NY opens — no σ-band touch is required or checked. Reuses that
 * engine's `computeSessionVwap` (session-anchored, tick-volume-weighted
 * VWAP) rather than re-deriving VWAP a second way (Lego Principle 1).
 *
 * Every discretionary judgment below is a PINNED call, stated here so a
 * different pin can be tried later without re-deriving the whole engine:
 *
 *   - Session windows (UTC, fixed — no DST adjustment, stated limitation):
 *     London = 07:00-13:00, NY-transition entry window = 13:00-17:00 (the
 *     stated "first 3-4 hours of New York"). This deliberately does NOT
 *     reuse `volBacktestM1Engine.js`'s `classifySession` NY bucket
 *     (16:00-22:00 there) — that label is this repo's own, unrelated
 *     "pure NY, post-overlap" slice. Husky's own wording ("as the market
 *     transitions into New York") describes the London/NY overlap and NY
 *     open, i.e. 13:00 UTC onward, which is what's modelled here.
 *   - "Decent directional move" = the signed % change from the day's open
 *     to the close of the last bar before 13:00 UTC. BASELINE is the
 *     minimal-DOF version: any nonzero move qualifies, no threshold
 *     (`MD files/CLAUDE.md`'s "start with the minimal-DOF version of the
 *     signal" rule) — `cfg.minMovePct` adds an optional magnitude gate for
 *     the sensitivity sweep, not the default.
 *   - Direction = FADE the London move: London up -> short toward VWAP;
 *     London down -> long toward VWAP. This is the literal reading of
 *     "look for price to move back toward VWAP" — a reversion bet, not a
 *     continuation one.
 *   - Entry = a guaranteed fill at the 13:00 UTC bar's own OPEN (via
 *     `walkBars` with `entryType:'stop'`, entry price == that bar's open —
 *     same guaranteed-fill pattern as `atrBandEntryV1Engine.js`). The
 *     session transition itself is the trigger, not a level touch, so
 *     there is nothing to wait for a confirmation bar on.
 *   - Target = the session VWAP as of the entry bar, LAGGED one bar (the
 *     level as it stood at the close just before entry) — identical
 *     no-lookahead convention to `vwapReversionEngine.js`.
 *   - Stop = ATR(15m, 14) x 1.5 — the group's own stated stop convention,
 *     already logged repeatedly in the transcripts ("ATR-based initial
 *     stop-loss sizing"), reused here rather than inventing a second
 *     volatility unit. ATR is read causally from bars strictly before
 *     entry (previous `ctxLookbackDays` days + today up to 13:00).
 *   - Exit window cap = 17:00 UTC (end of the stated "first 3-4 hours").
 *     If neither TP nor SL is hit by then, `walkBars` marks the trade to
 *     that window's final bar's close (no assumption an unresolved trade
 *     would have hit its target later — mark-to-window-close discipline).
 *   - One trade per day, the only setup (this is inherently a once-daily
 *     session-handoff pattern, not a level-search).
 *
 * Contract (pure; no network, no DOM):
 *   runVwapSessionReversion(packed, cfg) -> { trades[], records[], meta }
 *     packed  = loadM1ForPair(...) shape { n, times, opens, highs, lows, closes, volumes }
 *     records = [{ filled, pnl_pct, date }]  — the shape summarizeSplit consumes
 *     trades  = rich per-trade log (entry/sl/tp/side/move/MAE/R) for CSV + charts
 *
 * No lookahead: the London move only reads bars strictly before 13:00 UTC;
 * the VWAP target is lag-one; the ATR stop is built from bars strictly
 * before the entry bar; the fill/exit walk never sees bars beyond 17:00 UTC.
 */

import { extractBars, resampleTo } from './barUtils.js';
import { atrWilder } from './indicatorCore.js';
import { walkBars } from './forecastCore.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { assetClass as assetClassOf } from './instrumentRegistry.js';

const DAY = 86400;
const HOUR = 3600;

// Round-trip friction as % of price, by asset class — identical figures to
// the sibling Jordan-derived engines (impulseEmaRangeV1Engine,
// atrBandEntryV1Engine, poiReactionV1Engine).
const COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };

export const DEFAULT_CFG = {
  londonEndUtcHour: 13,     // UTC hour: end of London / start of NY-transition window
  nyWindowEndUtcHour: 17,   // UTC hour: end of the "first 3-4 hours of NY" window
  minMovePct: 0,            // baseline: zero-DOF, any nonzero London move qualifies
  atrTfMin: 15,              // matches the group's stated "15-minute ATR" convention
  atrPeriod: 14,
  slAtrMult: 1.5,            // matches the group's stated 1.5x-ATR stop convention
  ctxLookbackDays: 2,        // prior-day context for ATR warmup
  warmupDays: 5,
  oosFrac: 0.4,
  account: 10000,
  riskPct: 1.0,
};

// Local M1-with-volume extractor for one UTC day — `barUtils.extractBars`
// deliberately drops volume, but `computeSessionVwap` needs tick volume for
// a genuine VWAP (not an unweighted average). Small local copy, same
// convention as the sibling engines' own local `buildDaily` helpers.
function extractM1WithVolume(packed, fromEpoch, toEpoch) {
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < fromEpoch) lo = m + 1; else hi = m; }
  const bars = [];
  for (let i = lo; i < n && times[i] < toEpoch; i++) {
    bars.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] });
  }
  return bars;
}

const isoDay = e => new Date(e * 1000).toISOString().substring(0, 10);

// MAE (maximum adverse excursion) read off the REAL M1 path between fill and
// exit — same discipline as the sibling engines' maeFromPath.
function maeFromPath(packed, fromEpoch, toEpoch, entry, isBuy) {
  const { n, times, highs, lows } = packed;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < fromEpoch) lo = m + 1; else hi = m; }
  let worst = 0;
  const end = toEpoch == null ? Infinity : toEpoch;
  for (let i = lo; i < n && times[i] <= end; i++) {
    const adverse = isBuy ? (entry - lows[i]) : (highs[i] - entry);
    if (adverse > worst) worst = adverse;
  }
  return worst / entry;
}

/**
 * Run the VWAP session-transition reversion backtest for one instrument's
 * packed M1 series.
 */
export function runVwapSessionReversion(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  const instrument = c.instrument;
  if (!instrument) throw new Error('runVwapSessionReversion: cfg.instrument required');
  const klass = c.assetClass ?? assetClassOf(instrument);
  const cost = c.costPct ?? (COST_PCT[klass] ?? COST_PCT.fx);
  const riskAmount = c.account * c.riskPct / 100;

  const { n, times } = packed;
  if (!n) return { trades: [], records: [], meta: { instrument, note: 'no data' } };

  const firstDayStart = times[0] - (times[0] % DAY);
  const lastDayStart = times[n - 1] - (times[n - 1] % DAY);
  const totalDays = Math.round((lastDayStart - firstDayStart) / DAY) + 1;
  if (totalDays < c.warmupDays + 2) {
    return { trades: [], records: [], meta: { instrument, days: totalDays, note: 'insufficient history' } };
  }

  const trades = [];
  const records = [];
  const equity = [];

  for (let di = c.warmupDays; di < totalDays; di++) {
    const dStart = firstDayStart + di * DAY;
    const dEnd = dStart + DAY;
    const londonEnd = dStart + c.londonEndUtcHour * HOUR;
    const nyEnd = dStart + c.nyWindowEndUtcHour * HOUR;

    const dayBars = extractM1WithVolume(packed, dStart, dEnd);
    if (dayBars.length < 60) continue;   // need real coverage through the NY window

    const dayOpen = dayBars[0].open;

    // Last bar strictly before 13:00 UTC -> the London-move read.
    let londonIdx = -1;
    for (let i = 0; i < dayBars.length; i++) {
      if (dayBars[i].time >= londonEnd) break;
      londonIdx = i;
    }
    if (londonIdx < 0) continue;
    const londonClose = dayBars[londonIdx].close;
    const londonMovePct = (londonClose - dayOpen) / dayOpen * 100;
    if (londonMovePct === 0) continue;
    if (Math.abs(londonMovePct) < c.minMovePct) continue;

    // First bar at/after 13:00 UTC -> the entry bar.
    const entryIdx = dayBars.findIndex(b => b.time >= londonEnd);
    if (entryIdx < 0 || entryIdx === 0) continue;
    const entryBar = dayBars[entryIdx];
    const entry = entryBar.open;

    // Fade the London move: London up -> sell toward VWAP; London down -> buy.
    const isBuy = londonMovePct < 0;

    // Session VWAP, lag-one (level as it stood at the close just before entry).
    const { vwap } = computeSessionVwap(dayBars);
    const tp = vwap[entryIdx - 1];
    if (!(tp > 0)) continue;
    if ((isBuy && tp <= entry) || (!isBuy && tp >= entry)) continue;   // no room left to VWAP

    // Causal ATR(15m,14) stop, built from bars strictly before entry
    // (previous ctxLookbackDays days + today up to 13:00 UTC).
    const ctxStart = dStart - c.ctxLookbackDays * DAY;
    const ctxBars = resampleTo(extractBars(packed, ctxStart, londonEnd), c.atrTfMin);
    if (ctxBars.length < c.atrPeriod + 2) continue;
    const atrSeries = atrWilder(ctxBars, c.atrPeriod);
    const atr = atrSeries[atrSeries.length - 1];
    if (!(atr > 0)) continue;
    const sl = isBuy ? entry - c.slAtrMult * atr : entry + c.slAtrMult * atr;
    const stopDist = Math.abs(entry - sl);
    if (!(stopDist > 0)) continue;

    // Walk the fill/exit over the M1 path, capped at the NY-window end —
    // guaranteed fill at this bar's own open (entryType:'stop', entry ==
    // bar.open), same pattern as atrBandEntryV1Engine.js.
    const windowBars = dayBars.slice(entryIdx).filter(b => b.time < nyEnd);
    if (!windowBars.length) continue;
    const r = walkBars(windowBars, entry, tp, sl, isBuy, 'stop', dayOpen);
    if (!r || !r.filled) continue;

    const grossPct = r.pnlPct;
    const netPct = +(grossPct - cost).toFixed(5);
    const riskPctPrice = stopDist / entry * 100;
    const rMult = +(netPct / riskPctPrice).toFixed(4);
    const maeFrac = maeFromPath(packed, r.fillTime ?? entryBar.time, r.exitTime, entry, isBuy);
    const maePct = +(maeFrac * 100).toFixed(5);
    const maeR = +(maeFrac * 100 / riskPctPrice).toFixed(4);

    const date = isoDay(dStart);
    records.push({ filled: true, pnl_pct: netPct, date });
    const cum = (equity.length ? equity[equity.length - 1] : 0) + rMult;
    equity.push(cum);
    trades.push({
      date, instrument, side: isBuy ? 'BUY' : 'SELL',
      entry: +entry.toFixed(6), sl: +sl.toFixed(6), tp: +tp.toFixed(6),
      londonMovePct: +londonMovePct.toFixed(4), atr15: +atr.toFixed(6),
      outcome: r.outcome, grossPct: +grossPct.toFixed(5), netPct, rMult,
      maePct, maeR, riskAmount: +riskAmount.toFixed(2),
      pnlCcy: +(riskAmount * rMult).toFixed(2),
      fillTime: r.fillTime, exitTime: r.exitTime, cumR: +cum.toFixed(4),
    });
  }

  return {
    trades, records,
    meta: {
      instrument, days: totalDays,
      from: isoDay(firstDayStart), to: isoDay(lastDayStart),
      cost, cfg: c,
    },
  };
}

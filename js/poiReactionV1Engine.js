/**
 * POI-Reaction Engine (v1) — the mechanised ColezTrades strategy, built by
 * COMPOSING existing lego bricks (Lego Principle: import, don't rebuild).
 *
 * The idea (from docs/ColezTrades_Trading_Strategy.md, mechanised in
 * docs/ColezTrades_Backtest_Build_Plan.md):
 *   1. Mark high-timeframe levels — structure, POC/VAH/VAL, Fib golden pocket,
 *      pivots, prior H/L, round numbers  →  js/levelSources.js `collectLevels`.
 *   2. A Point of Interest (POI) is where several of those levels CLUSTER
 *      (confluence)  →  `clusterLevels`; a zone's `count` = confluence strength.
 *   3. When price reaches a POI, FADE it back toward the level (reversion at a
 *      level)  →  the shared fill primitive `walkBars` (js/forecastCore.js),
 *      with an honest intrabar SL-first / TP resolution and no lookahead.
 *
 * This is **Stage 1–2** of the build plan: the zero-parameter POI touch plus the
 * confluence selector (`minConfluence`). The VuManChu confirmation gate (Stage 3)
 * is deliberately NOT here yet — Stage 1 establishes the baseline the gate must
 * beat. Costs are ON by default.
 *
 * Contract (pure; no network, no DOM):
 *   runPoiReaction(packed, cfg) → { trades[], records[], meta }
 *     packed  = loadM1ForPair(...) shape { n, times, opens, highs, lows, closes, volumes }
 *     records = [{ filled, pnl_pct, date }]  — the shape summarizeSplit consumes
 *     trades  = rich per-trade log (entry/sl/tp/side/MAE/zone/R/…) for CSV + charts
 *
 * No lookahead: levels for day D use only D1 bars and intraday strictly BEFORE D;
 * the stop distance uses an ATR computed from completed prior days only.
 */

import { extractBars, resampleTo } from './barUtils.js';
import { collectLevels, clusterLevels } from './levelSources.js';
import { walkBars } from './forecastCore.js';
import { pipSize, assetClass as assetClassOf } from './instrumentRegistry.js';

const DAY = 86400;

// Round-trip friction as % of price, by asset class (matches forecastCore's
// DEFAULT_COST_PCT: spread + commission). A fade takes a limit entry, so the
// dominant cost is the spread crossed on exit + commission — modelled as a flat
// round-trip deduction from the gross % return.
const COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };

// Default level sources for a POI: the ColezTrades stack (structure, volume
// profile, fib golden pocket, pivots, prior H/L, round numbers). VWAP is left
// out of the default because its per-session anchor is noisy at a daily horizon;
// it can be switched on via cfg.sources.
export const DEFAULT_SOURCES = [
  'daily_open', 'prior_hilo', 'pivots', 'swing_sr', 'swing_fib',
  'volume_profile', 'round_number',
];

export const DEFAULT_CFG = {
  sources: DEFAULT_SOURCES,
  entryTfMin: 15,        // entry timeframe for touch detection + fills (M15)
  profileTfMin: 5,       // resample M1 → M5 for the volume-profile/intraday window
  profileLookbackDays: 5,
  tolerancePips: 8,      // cluster width: levels within this = one POI zone
  minConfluence: 2,      // a POI must be built from ≥ this many distinct levels
  slAtrMult: 0.5,        // stop distance = slAtrMult × D1 ATR(atrPeriod)
  atrPeriod: 14,
  rr: 1.0,               // Stage 1 fixed 1:1 reward:risk
  warmupDays: 70,        // history needed before the first trade (swing_fib lb=60)
  oosFrac: 0.4,          // last 40% of the timeline is out-of-sample
  account: 10000,        // £ account for the currency P&L export
  riskPct: 1.0,          // % of account risked per trade (the R unit)
};

// Resample packed→object bars for a window KEEPING summed volume (barUtils'
// resampleTo drops volume; the volume profile / VWAP sources need it).
function resampleVol(packed, fromEpoch, toEpoch, minutes) {
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  const secs = minutes * 60;
  const buckets = new Map();
  let i = lowerBound(times, fromEpoch);
  for (; i < n && times[i] < toEpoch; i++) {
    const b = times[i] - (times[i] % secs);
    let o = buckets.get(b);
    if (!o) { buckets.set(b, { time: b, open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] || 0 }); }
    else { o.high = Math.max(o.high, highs[i]); o.low = Math.min(o.low, lows[i]); o.close = closes[i]; o.volume += volumes[i] || 0; }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

// First index where times[i] >= target (local copy to walk packed arrays).
function lowerBound(times, target) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < target) lo = m + 1; else hi = m; }
  return lo;
}

// Build all completed D1 bars from packed M1 in one pass (UTC-day buckets).
function buildDaily(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  const days = [];
  let curKey = -1, cur = null;
  for (let i = 0; i < n; i++) {
    const key = times[i] - (times[i] % DAY);
    if (key !== curKey) {
      if (cur) days.push(cur);
      cur = { time: key, open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
      curKey = key;
    } else {
      if (highs[i] > cur.high) cur.high = highs[i];
      if (lows[i] < cur.low) cur.low = lows[i];
      cur.close = closes[i];
    }
  }
  if (cur) days.push(cur);
  return days;
}

// Simple ATR over the last `period` completed daily bars (mean true range).
function atrOf(dailyBars, period) {
  if (dailyBars.length < 2) return null;
  const trs = [];
  for (let i = 1; i < dailyBars.length; i++) {
    const b = dailyBars[i], p = dailyBars[i - 1];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
  }
  const slice = trs.slice(-Math.max(period, 1));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// MAE (maximum adverse excursion) read off the REAL M1 path between fill and
// exit — never approximated from the close (CLAUDE.md discipline). Returns the
// adverse move as a positive fraction of the entry price.
function maeFromPath(packed, fromEpoch, toEpoch, entry, isBuy) {
  const { n, times, highs, lows } = packed;
  let i = lowerBound(times, fromEpoch), worst = 0;
  const end = toEpoch == null ? Infinity : toEpoch;
  for (; i < n && times[i] <= end; i++) {
    const adverse = isBuy ? (entry - lows[i]) : (highs[i] - entry);
    if (adverse > worst) worst = adverse;
  }
  return worst / entry;   // fraction of price (≥ 0)
}

const isoDay = e => new Date(e * 1000).toISOString().substring(0, 10);

/**
 * Run the POI-reaction backtest for one instrument's packed M1 series.
 */
export function runPoiReaction(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  const instrument = c.instrument;
  if (!instrument) throw new Error('runPoiReaction: cfg.instrument required');
  const klass = c.assetClass ?? assetClassOf(instrument);
  const pip = pipSize(instrument);
  const cost = c.costPct ?? (COST_PCT[klass] ?? COST_PCT.fx);
  const riskAmount = c.account * c.riskPct / 100;

  const daily = buildDaily(packed);
  if (daily.length < c.warmupDays + 5) return { trades: [], records: [], meta: { instrument, days: daily.length, note: 'insufficient history' } };

  const trades = [];
  const records = [];
  const equity = [];   // running sum of R for a quick per-trade curve

  // Trade each completed day after warmup. Levels use ONLY prior days/intraday.
  for (let di = c.warmupDays; di < daily.length; di++) {
    const dStart = daily[di].time;
    const dEnd = dStart + DAY;

    // As-of level context (strictly before this day).
    const dailyAsof = daily.slice(0, di);
    const intraday = resampleVol(packed, dStart - c.profileLookbackDays * DAY, dStart, c.profileTfMin);
    const price = dailyAsof[dailyAsof.length - 1].close;

    const levels = collectLevels(
      { dailyBars: dailyAsof, intraday, instrument, price },
      c.sources,
    );
    const zones = clusterLevels(levels, c.tolerancePips, instrument)
      .filter(z => z.count >= c.minConfluence);
    if (!zones.length) continue;

    // The day's tradable bars (entry timeframe) + the vol-scaled stop distance.
    const dayM1 = extractBars(packed, dStart, dEnd);
    if (dayM1.length < 2) continue;
    const entryBars = resampleTo(dayM1, c.entryTfMin);
    if (entryBars.length < 2) continue;
    const dayOpen = entryBars[0].open;
    const atr = atrOf(dailyAsof, c.atrPeriod);
    if (!atr || atr <= 0) continue;
    const stopDist = c.slAtrMult * atr;
    if (stopDist <= 0) continue;

    // Pick the POI nearest to the day open (the level price is most likely to
    // reach), fade it back toward the level. Above open → sell; below → buy.
    let zone = null, best = Infinity;
    for (const z of zones) {
      const d = Math.abs(z.price - dayOpen);
      // Skip zones the open is already sitting inside the stop of (degenerate).
      if (d < stopDist * 0.25) continue;
      if (d < best) { best = d; zone = z; }
    }
    if (!zone) continue;

    const isBuy = zone.price < dayOpen;
    const entry = zone.price;
    const sl = isBuy ? entry - stopDist : entry + stopDist;
    const tp = isBuy ? entry + c.rr * stopDist : entry - c.rr * stopDist;

    const r = walkBars(entryBars, entry, tp, sl, isBuy, 'limit', dayOpen);
    if (!r || !r.filled) continue;

    const grossPct = r.pnlPct;
    const netPct = +(grossPct - cost).toFixed(5);
    const riskPctPrice = stopDist / entry * 100;         // the R unit, in %
    const rMult = +(netPct / riskPctPrice).toFixed(4);   // R-multiple
    const maeFrac = maeFromPath(packed, r.fillTime ?? dStart, r.exitTime, entry, isBuy);
    const maePct = +(maeFrac * 100).toFixed(5);
    const maeR = +(maeFrac * 100 / riskPctPrice).toFixed(4);

    const date = isoDay(dStart);
    records.push({ filled: true, pnl_pct: netPct, date });
    const cum = (equity.length ? equity[equity.length - 1] : 0) + rMult;
    equity.push(cum);
    trades.push({
      date, instrument, side: isBuy ? 'BUY' : 'SELL',
      entry: +entry.toFixed(6), sl: +sl.toFixed(6), tp: +tp.toFixed(6),
      outcome: r.outcome, grossPct: +grossPct.toFixed(5), netPct,
      riskPctPrice: +riskPctPrice.toFixed(5), R: rMult, maePct, maeR,
      pnlCcy: +(rMult * riskAmount).toFixed(2), riskCcy: +riskAmount.toFixed(2),
      fillTime: r.fillTime, exitTime: r.exitTime,
      zonePrice: +zone.price.toFixed(6), zoneCount: zone.count,
      zoneScore: +zone.score.toFixed(3), zoneSources: zone.sources,
      stopDist: +stopDist.toFixed(6), atr: +atr.toFixed(6), dayOpen: +dayOpen.toFixed(6),
      cumR: +cum.toFixed(4),
    });
  }

  return {
    trades, records,
    meta: {
      instrument, assetClass: klass, pip, cost,
      days: daily.length, from: isoDay(daily[0].time), to: isoDay(daily[daily.length - 1].time),
      nTrades: trades.length, cfg: c,
    },
  };
}

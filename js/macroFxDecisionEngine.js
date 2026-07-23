/**
 * MacroFX Decision Engine — the ASSEMBLED system (v2).
 *
 * The v1 zone backtester (macroFxZoneEngine.js) built only the SKELETON: levels
 * → Decision Zones, plus a crude 2-input selector that fired a trade at every
 * zone every day. The 20-doc spec is explicit that a level never triggers a
 * trade on its own — the zones say WHERE to look, and a monitored decision
 * process decides WHETHER, WHICH WAY, and HOW WELL to trade. This engine builds
 * that process on top of the same zones:
 *
 *   1. MARKET-STATE / DECISION ENGINE (Ch 6) — a richer read than v1's T:
 *      trend-strength (ADX) + trend-day-ness (dayTypeCore) + directional regime
 *      + vol regime → a continuous "trendiness" S∈[0,1] that DIRECTS each zone:
 *      S high → follow the break, S low → fade to fair value, S mid → STAND
 *      ASIDE. The stand-aside middle is the point — v1 had no "no-trade".
 *
 *   2. CONFIDENCE / PROBABILITY GATE (Ch 7) — per candidate trade, a score from
 *      zone quality (independent-evidence count) + state alignment + location.
 *      Only trades above `confThresh` fire, so the book becomes SELECTIVE
 *      (dozens/yr, not one/day). The score is recorded so calibration can be
 *      tested: do higher-confidence trades actually pay? (the Ch 7 requirement).
 *
 *   3. TRADE MANAGEMENT (Ch 15) — `manageTrade`: partial at +1R, stop to
 *      break-even, trail the runner, time-exit at session close. Aimed straight
 *      at the fat left tail (trend-day stop-outs) that sank the v1 fade book.
 *
 * A/B: the assembled book is compared head-to-head against the v1 naked
 * skeleton on the SAME split, so the question is explicit — do the decision +
 * confidence + management layers turn the skeleton's loss into something, or
 * not? No verdict is pre-loaded; the OOS card answers it.
 *
 * LEGO: everything load-bearing is imported. Zone construction is reused
 * wholesale from macroFxZoneEngine (buildZones, groupM1ByDate); indicators from
 * indicatorCore; regime/vol from forecastCore; metrics from the honest harness.
 * The only genuinely new brick here is `manageTrade` (partial+BE+trail+time),
 * which v1 did not have.
 */

import { buildZones, groupM1ByDate, asiaExtensionLevels, ASIA_EXT_RATIOS } from './macroFxZoneEngine.js';
import { runZoneMode } from './macroFxZoneEngine.js';
import {
  volSigmaSeries, classifyRegime, dayTypeScore,
  summarizeSplit, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT,
} from './forecastCore.js';
import { classifyDayType } from './dayTypeCore.js';
import { adxWilder } from './indicatorCore.js';
import { summarizeTrades } from './metricsCore.js';
import { backtestStats } from './backtestStats.js';
import { fetchD1, INSTRUMENTS } from './volBacktestEngine.js';

export { INSTRUMENTS as DECISION_INSTRUMENTS };

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const median = arr => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── 1) Market-state read for one session (no lookahead) ──────────────────────
// Blends trend-strength (ADX, prior bars only), trend-day-ness (dayTypeCore T),
// directional regime and vol regime into S∈[0,1]. Returns the state + the
// directed action. This REPLACES v1's fadeMax-only selector with the "engine
// monitored process" the spec describes.
export function readState(priorBars, closes, i, sigmaNow, sigmaMedian, cfg) {
  const { erWindow = 14, followMin = 0.55, fadeMax = 0.38, adxScale = 40 } = cfg;
  const T = dayTypeScore(closes, i, erWindow);                         // 0..1 trend-day-ness
  const adx = priorBars.length >= 30 ? (adxWilder(priorBars, 14).at(-1) ?? 0) : 0;
  const adxN = clamp01(adx / adxScale);                               // 0..1 trend strength
  const regime = classifyRegime(closes, i, 20, 5, cfg.slopeThresh ?? 0.002, 1.0);
  const directional = regime === 'RANGE' ? 0 : 1;
  const volRatio = sigmaMedian > 1e-12 ? sigmaNow / sigmaMedian : 1;   // >1 expansion, <1 compression
  // Trendiness: trend-day-ness + strength + a directional-regime bonus. Vol
  // expansion nudges toward follow (breakouts likelier), compression toward fade.
  let S = 0.42 * T + 0.33 * adxN + 0.25 * directional;
  S += 0.05 * clamp01((volRatio - 1));                                 // small expansion tilt
  S = clamp01(S);
  const dir = regime === 'BULL' ? 'up' : regime === 'BEAR' ? 'down' : 'both';
  let action, tradeable = true;
  if (S >= followMin && regime !== 'RANGE') action = 'follow';
  else if (S <= fadeMax) action = 'fade';
  else { action = 'none'; tradeable = false; }                        // low-conviction middle → stand aside
  return { S: +S.toFixed(4), T: +T.toFixed(4), adx: +adx.toFixed(2), regime, volRatio: +volRatio.toFixed(3), action, dir, tradeable };
}

// ── 2) Confidence score for one candidate zone-trade (Ch 7) ──────────────────
// [0,1] from independent-evidence count, state alignment, and location fit.
// Higher = the monitored process is more convinced. Gate on it → selective book.
export function confidenceFor({ action, S, zone, distFrac, reachFrac }) {
  const zoneQ = clamp01((zone.distinctSources - 1) / 3);              // 2 srcs .33 · 3 .67 · 4+ 1
  const stateAlign = action === 'follow' ? S : (1 - S);              // does the state back this action?
  // Location: a FADE is more trustworthy at a stretched extreme (far from open,
  // near the exhaustion band); a FOLLOW is more trustworthy taken EARLY (near
  // the open, room to run to the target).
  const near = clamp01(1 - distFrac / Math.max(reachFrac, 1e-6));
  const locAlign = action === 'follow' ? near : clamp01(distFrac / Math.max(reachFrac, 1e-6));
  const conf = 0.34 * zoneQ + 0.4 * stateAlign + 0.26 * locAlign;
  return +clamp01(conf).toFixed(4);
}

// ── 3) Trade management: partial + break-even + trail + time-exit (Ch 15) ─────
// Finds the fill (limit/stop, same causal rules as walkBars), then manages the
// remainder: take `partialFrac` off at +`beAtR`·R and move stop to break-even,
// then trail the runner by `trailR`·R behind the favourable extreme (lagged one
// bar — no lookahead), else exit at the window close. Returns net %/R pnl, the
// exit reason, and real-path MAE. This is the tail-control the v1 fixed exit
// lacked. Returns null on no fill.
export function manageTrade(bars, order, open, cfg) {
  const { entry, sl: sl0, isBuy, entryType } = order;
  const { partialFrac = 0.5, beAtR = 1.0, trailR = 1.0, costPct = 0.012, slipPct = 0.006 } = cfg;
  const R0 = Math.abs(entry - sl0);
  if (!(R0 > 0) || !bars.length) return null;
  const sgn = isBuy ? 1 : -1;

  let filled = false, fillTime = null, fillIdx = -1;
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    const hit = isBuy ? (entryType === 'stop' ? b.high >= entry : b.low <= entry)
                      : (entryType === 'stop' ? b.low <= entry : b.high >= entry);
    if (hit) { filled = true; fillTime = b.time ?? null; fillIdx = k; break; }
  }
  if (!filled) return null;

  // Management state.
  let stop = sl0;                                     // current protective stop (price)
  let partialTaken = false;
  let realizedPrice = 0;                              // Σ frac·(exit−entry)·sgn, in price
  let remaining = 1;
  let favExtremePrev = entry;                         // best favourable price through the PRIOR bar
  let worstAdverse = 0;                               // for MAE (price)
  let exitReason = 'time', exitTime = null;
  const beTarget = entry + sgn * beAtR * R0;          // +1R favourable level

  for (let k = fillIdx; k < bars.length; k++) {
    const b = bars[k];
    const isFillBar = k === fillIdx;
    // MAE off the real path.
    const adverse = isBuy ? (entry - b.low) : (b.high - entry);
    if (adverse > worstAdverse) worstAdverse = adverse;

    // (a) STOP first (conservative). Stop for this bar was set from data ≤ prior bar.
    const stopHit = isBuy ? b.low <= stop : b.high >= stop;
    if (stopHit) {
      realizedPrice += remaining * (stop - entry) * sgn;
      remaining = 0; exitReason = partialTaken ? 'trail_or_be' : 'stop'; exitTime = b.time ?? null;
      break;
    }
    // (b) PARTIAL at +beAtR·R and move to break-even. A limit (fade) entry's +1R
    // sits on the far side of the approach, so it is not resolvable on the fill
    // bar (same causality guard as walkBars); a stop entry's is.
    const partialKnowable = !isFillBar || entryType === 'stop';
    if (!partialTaken && partialKnowable) {
      const reached = isBuy ? b.high >= beTarget : b.low <= beTarget;
      if (reached) {
        realizedPrice += partialFrac * (beTarget - entry) * sgn;
        remaining -= partialFrac;
        stop = entry;                                 // break-even on the runner
        partialTaken = true;
      }
    }
    // (c) Trail the runner (only after the partial/BE), lagged one bar.
    if (partialTaken) {
      const trailed = isBuy ? favExtremePrev - trailR * R0 : favExtremePrev + trailR * R0;
      stop = isBuy ? Math.max(stop, trailed) : Math.min(stop, trailed);
    }
    // Update favourable extreme with THIS bar for the NEXT bar's stop (lag one).
    favExtremePrev = isBuy ? Math.max(favExtremePrev, b.high) : Math.min(favExtremePrev, b.low);
    exitTime = b.time ?? null;
  }

  // (d) Time exit: close any remainder at the window's last close.
  if (remaining > 0) {
    const last = bars[bars.length - 1];
    realizedPrice += remaining * ((last.close ?? entry) - entry) * sgn;
    remaining = 0; exitTime = last.time ?? exitTime;
  }

  // Costs: one round trip, plus the extra partial exit leg. Stop/breakout slip
  // is charged on the stop-entry fill and on stop exits.
  const legs = 1 + (partialTaken ? partialFrac : 0);
  const slip = (entryType === 'stop' ? slipPct : 0) + (exitReason === 'stop' ? slipPct : 0);
  // realizedPrice is already signed as profit (Σ frac·(exit−entry)·sgn), so
  // grossPct>0 = profit and pnlR = realizedPrice/R0 (profit in units of initial risk).
  const grossPct = realizedPrice / open * 100;
  const pnlPct = +(grossPct - costPct * legs - slip).toFixed(5);
  const stopPct = R0 / open * 100;
  return {
    filled: true, side: isBuy ? 'BUY' : 'SELL',
    pnlPct, pnlR: +(realizedPrice / R0).toFixed(4),
    maePct: open > 0 ? +(worstAdverse / open * 100).toFixed(5) : 0,
    stopPct: +stopPct.toFixed(5), exitReason, fillTime, exitTime, partialTaken,
  };
}

// ── 4) Walk-forward over one instrument (the assembled system) ───────────────
export function runDecision(d1Bars, m1ByDate, assetClass, name, opts = {}) {
  const {
    minLookback = 90, dateFrom = '', dateTo = '',
    costPct = DEFAULT_COST_PCT[assetClass] ?? 0.012,
    slipPct = DEFAULT_SLIP_PCT[assetClass] ?? 0.006,
    erWindow = 14, slopeThresh = 0.002,
    accountSize = 10000, riskPct = 1.0,
    asiaAnchor = false, asiaWindowH = 6, asiaResampleMin = 5,
    regrBands = true, regrLookback = 80,
    // decision + gate + management knobs
    followMin = 0.55, fadeMax = 0.38, confThresh = 0.5,
    minSources = 2, reachMult = 1.5, slMult = 1.5,
    partialFrac = 0.5, beAtR = 1.0, trailR = 1.0, volMedWin = 60,
  } = opts;
  const cfg = {
    clusterPips: opts.clusterPips ?? (assetClass === 'fx' ? 10 : 8),
    regrBands, regrLookback, asiaRatios: opts.asiaRatios ?? ASIA_EXT_RATIOS,
    erWindow, followMin, fadeMax, slopeThresh, minSources, reachMult, slMult,
  };
  const riskDollar = accountSize * riskPct / 100;
  const closes = d1Bars.map(b => b.close);
  const sigD = volSigmaSeries(d1Bars, assetClass);
  const timed = d1Bars.map(b => ({ ...b, time: Math.floor(Date.parse(b.date) / 1000) }));
  const manageCfg = { partialFrac, beAtR, trailR, costPct, slipPct };

  const records = [];
  for (let i = minLookback; i < d1Bars.length; i++) {
    const bar = d1Bars[i];
    if (dateFrom && bar.date < dateFrom) continue;
    if (dateTo   && bar.date > dateTo)   continue;
    const sigma = sigD[i];
    if (!sigma || sigma < 1e-8) continue;

    const dayEpoch = Math.floor(Date.parse(bar.date) / 1000);
    const dayM1 = m1ByDate?.get(bar.date) ?? null;

    // Session anchor + fill window (Asia-anchored or D1-open), same as v1.
    let open, win, extraLevels = [];
    if (asiaAnchor) {
      if (!dayM1?.length) continue;
      const asiaEnd = dayEpoch + asiaWindowH * 3600;
      const asiaBars = dayM1.filter(b => b.time >= dayEpoch && b.time < asiaEnd);
      const post = dayM1.filter(b => b.time >= asiaEnd);
      if (!post.length) continue;
      const asia = asiaExtensionLevels(asiaBars, asiaResampleMin, cfg.asiaRatios);
      if (!asia) continue;
      open = post[0].open; win = post; extraLevels = asia.levels;
    } else {
      open = bar.open;
      win = dayM1 ?? [{ time: dayEpoch, open: bar.open, high: bar.high, low: bar.low, close: bar.close }];
    }

    const priorBars = timed.slice(0, i);
    const { bands, zones } = buildZones(priorBars, open, sigma, assetClass, name, cfg, extraLevels);

    // Market-state read → directed action (or stand aside).
    const sigMed = median(Array.from(sigD.slice(Math.max(0, i - volMedWin), i)).filter(x => x > 1e-9));
    const st = readState(priorBars, closes, i, sigma, sigMed, cfg);
    if (!st.tradeable) continue;                       // stand-aside middle — the point of the engine

    // Candidate zones: nearest qualifying above/below within reach.
    const reach = open * bands.hl75 * reachMult;
    let above = null, below = null;
    for (const z of zones) {
      if (z.distinctSources < minSources) continue;
      const d = Math.abs(z.price - open);
      if (d > reach || d < 1e-9) continue;
      if (z.price > open) { if (!above || z.price < above.price) above = z; }
      else                { if (!below || z.price > below.price) below = z; }
    }

    // Build the directed order(s): fade → limit toward fair value; follow → stop
    // through the level in the regime direction. Management owns the exit.
    const slD = open * bands.hl50 * slMult;
    const slip = open * slipPct / 100;
    const orders = [];
    if (st.action === 'fade') {
      if (above) orders.push({ zone: above, order: { entry: above.price, sl: above.price + slD, isBuy: false, entryType: 'limit' } });
      if (below) orders.push({ zone: below, order: { entry: below.price, sl: below.price - slD, isBuy: true,  entryType: 'limit' } });
    } else { // follow
      const wantUp = st.dir === 'up' || st.dir === 'both';
      const wantDn = st.dir === 'down' || st.dir === 'both';
      if (above && wantUp) orders.push({ zone: above, order: { entry: above.price + slip, sl: above.price - slD, isBuy: true,  entryType: 'stop' } });
      if (below && wantDn) orders.push({ zone: below, order: { entry: below.price - slip, sl: below.price + slD, isBuy: false, entryType: 'stop' } });
    }
    if (!orders.length) continue;

    // Confidence gate + management. Take the highest-confidence qualifying order.
    let best = null;
    for (const cand of orders) {
      const distFrac = Math.abs(cand.order.entry - open) / open;
      const conf = confidenceFor({ action: st.action, S: st.S, zone: cand.zone, distFrac, reachFrac: bands.hl75 * reachMult });
      if (conf < confThresh) continue;
      if (!best || conf > best.conf) best = { ...cand, conf, distFrac };
    }
    if (!best) continue;                               // nothing cleared the confidence gate

    const res = manageTrade(win, best.order, open, manageCfg);
    if (!res) continue;                                // no fill

    const R = res.pnlR;
    records.push({
      date: bar.date, action: st.action, state: st.regime, S: st.S, confidence: best.conf,
      distinctSources: best.zone.distinctSources, sources: best.zone.sources.join('+'),
      side: res.side, exitReason: res.exitReason, partialTaken: res.partialTaken,
      filled: true, outcome: res.pnlPct > 0 ? 'win' : res.pnlPct < 0 ? 'loss' : 'flat',
      pnl_pct: res.pnlPct, mae_pct: res.maePct, stop_pct: res.stopPct,
      R: +R.toFixed(4), risk_dollar: +riskDollar.toFixed(2), pnl_dollar: +(R * riskDollar).toFixed(2),
    });
  }
  return records;
}

// ── 5) Confidence calibration (Ch 7): do higher-confidence trades pay? ───────
export function calibrationByConfidence(records, edges = [0.5, 0.6, 0.7, 0.8]) {
  const filled = records.filter(r => r.filled);
  const buckets = [];
  const bounds = [...edges, 1.0001];
  for (let b = 0; b < bounds.length - 1; b++) {
    const lo = bounds[b], hi = bounds[b + 1];
    const rs = filled.filter(r => r.confidence >= lo && r.confidence < hi);
    if (!rs.length) { buckets.push({ lo, hi, trades: 0, expectancy: 0, sharpe: 0, winRate: 0 }); continue; }
    const s = summarizeTrades(rs.map(r => r.pnl_pct), rs.map(r => r.date));
    buckets.push({ lo: +lo.toFixed(2), hi: +Math.min(hi, 1).toFixed(2), trades: s.trades, expectancy: s.expectancy, sharpe: s.sharpe, winRate: s.winRate });
  }
  return buckets;
}

// ── 6) A/B: assembled system vs the v1 naked skeleton, same split ────────────
export function compareDecision(d1Bars, m1ByDate, assetClass, name, opts = {}) {
  const managed = runDecision(d1Bars, m1ByDate, assetClass, name, opts);
  // Naked baseline = v1 zone mode (fade-everything skeleton) on the same data.
  const naked = runZoneMode(d1Bars, m1ByDate, assetClass, name, 'zone', opts);
  const oosFrac = opts.oosFrac ?? 0.4;
  const exitMix = {};
  for (const r of managed) exitMix[r.exitReason] = (exitMix[r.exitReason] ?? 0) + 1;
  return {
    managed: summarizeSplit(managed, oosFrac),
    naked: summarizeSplit(naked, oosFrac),
    calibration: calibrationByConfidence(managed),
    exitMix,
    trades: { managed, naked },
  };
}

// Group packed → date map + run the suite (D1 + M1 fills where available).
export async function runDecisionSuite(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const log = [], results = [];
  let loadM1ForPair = null;
  try { ({ loadM1ForPair } = await import('./volBacktestM1Engine.js')); } catch { /* M1 optional */ }
  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const d1 = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${d1.length} D1 bars (${d1[0]?.date} → ${d1.at(-1)?.date})`);
      let m1ByDate = null;
      try {
        const packed = loadM1ForPair ? await loadM1ForPair(cfg.name.toLowerCase()) : null;
        if (packed?.n) { m1ByDate = groupM1ByDate(packed); log.push(`  ${packed.n} M1 bars → ${m1ByDate.size} days (intraday fills)`); }
        else log.push('  no M1 — fills fall back to D1 mark-to-close');
      } catch { log.push('  M1 load failed — fills fall back to D1 mark-to-close'); }
      const cmp = compareDecision(d1, m1ByDate, cfg.assetClass, cfg.name, opts);
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, ...cmp });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts };
}

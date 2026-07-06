// Yield-Spread Z-Score Backtester — V2: confidence-scored, not gated
//
// WHAT CHANGED vs v1 (`js/zscoreSpreadEngine.js`)
// ------------------------------------------------
// v1 treats the yield-spread z-score as a HARD BINARY GATE: if |z| >= threshold,
// pick a direction from sign(z) and trade a fib extension on that one side; else
// do nothing. Real-FRED evidence showed win-rate DECAYS monotonically as |z| grows
// (the 2.0-2.5σ tier was the only profitable one) — the classic signature of a
// CONTEXTUAL factor misused as a STANDALONE trigger (see ZSCORE_CONFLUENCE_BUILD_BRIEF.md).
//
// V2 reframes per CLAUDE.md's selector discipline — the fib zone is the STRUCTURE,
// and z-score + approach-velocity + zone-depth form a COMPOSITE CONFIDENCE score
// in [0,1]. A trade fires when the composite clears a bar, not when |z| alone
// crosses a threshold. DIRECTION comes from FADE GEOMETRY (which side price
// extended out of the Asia range), and macro (the z-score) only CONFIRMS or VETOES
// that fade — it never places the trade by itself.
//
//   entry zone   = fib extension beyond the Asia range (BOTH sides scanned)
//   direction    = fade back into the range (down-side touch → LONG, up-side → SHORT)
//   confidence   = wZ·zAlign + wRisk·riskOff + wVel·approachVel + wStruct·fibDepth ∈ [0,1]
//   take/skip    = confidence >= confThreshold  (z is a factor, NOT a gate)
//   TP / SL      = TP = the near Asia edge; SL = level ± slFrac·range  (as v1)
//
// FACTORS ARE TIERED BY EVIDENCE, and each is independently ABLATABLE (set its
// weight to 0) so the A/B can INVALIDATE ideas one at a time on the OOS card:
//   • zAlign   — rate-differential/carry sets the directional lean; the fade must
//                AGREE with it. REPLICATED macro factor (interest-rate differential
//                is the direct short-term FX driver). Nominal spread, not real —
//                a documented limitation vs the literature's preference for real rates.
//   • riskOff  — VIX + HY-credit regime. REPLICATED: carry/mean-reversion crashes
//                exactly when vol spikes / spreads widen, so a stressed regime VETOES
//                (dampens) the carry-aligned fade. The literature's carry-crash gate.
//   • approachVel — fast spike into the line → fade. INTERNAL OOS-proven winner
//                (ENTRY_ZONE_CONFIDENCE.md, p<0.001). Microstructure, not macro.
//   • fibDepth — deeper extension = more stretched. FOLKLORE (range/S&R is a weak
//                practitioner heuristic per CLAUDE.md) — smallest weight, ablate first.
//
// This is Phase 1 of the "macro as confidence, not gate" build. It imports every
// piece of vol/FRED/session/fill math from v1 (no copies — Lego rule #1); the only
// NEW code is the pure confidence-scoring bricks below, unit-tested on synthetic
// data in js/zscoreSpreadV2Engine.test.mjs.
//
// HONEST STATUS: built + unit-tested for correctness. NOT yet validated for edge —
// the real A/B (does confidence beat the gate on OOS Sharpe?) needs a live FRED_KEY
// on Railway. Local synthetic FRED is unreliable for this exact change (the brief's
// hard-won lesson) and must NOT be read as a result.

import { loadM1ForPair } from './volBacktestM1Engine.js';
import {
  ZSCORE_PAIRS,
  fetchFredObservations,
  _shiftDate,
  buildRollingZSeries,
  buildDayIndex,
  analyzeDay,
  walkTrade,
  computeZScoreStats,
} from './zscoreSpreadEngine.js';
import {
  V2_DEFAULTS, RISKOFF_SERIES,
  zAlignScore, approachVelRangeScaled, velToScore, structScore,
  riskOffScore, compositeConfidence, confBucketOf,
  buildRiskOffByDate, computeConfBuckets, splitTradesByDate,
} from './zscoreConfidenceCore.js';

export { ZSCORE_PAIRS, V2_DEFAULTS, RISKOFF_SERIES };

// ── Per-day zone scan (both sides) ────────────────────────────────────────────────

function buildTwoSidedFibLevels(asia, mults) {
  const levels = [];
  for (const mult of mults) {
    // down-side extension → fade LONG back up into the range
    levels.push({ side: 'dn', mult, dir: 'LONG',  price: asia.lo - mult * asia.range, tp: asia.lo });
    // up-side extension → fade SHORT back down into the range
    levels.push({ side: 'up', mult, dir: 'SHORT', price: asia.hi + mult * asia.range, tp: asia.hi });
  }
  return levels;
}

function findDayTradesV2(packed, asia, winStart, winEnd, exitIdx, dayEnd, z, zTier, dateStr, cfg, meta, riskInfo) {
  const { times, opens, highs, lows, closes } = packed;
  const trades = [];
  const traded = new Set();
  const levels = buildTwoSidedFibLevels(asia, cfg.fibMults);
  const zApplies = Math.abs(z) >= cfg.zGateMin;   // optional soft floor (default 0)
  const vixZ = riskInfo?.vixZ ?? null;
  const hyZ  = riskInfo?.hyZ ?? null;
  const riskOff = riskOffScore(vixZ, hyZ);

  for (let i = winStart; i < winEnd; i++) {
    for (const lvl of levels) {
      const key = `${lvl.side}:${lvl.mult}`;
      if (traded.has(key)) continue;
      const touched = lows[i] <= lvl.price && highs[i] >= lvl.price;
      if (!touched) continue;
      traded.add(key);
      if (!zApplies) continue;

      const entry = lvl.price;
      const sl = lvl.dir === 'LONG' ? entry - cfg.slFrac * asia.range
                                    : entry + cfg.slFrac * asia.range;
      const tp = lvl.tp;
      const rewardPips = Math.abs(tp - entry) / meta.pip;
      const riskPips   = Math.abs(sl - entry) / meta.pip;
      if (riskPips <= 0 || rewardPips < riskPips * cfg.minRR) continue;

      // Confidence factors (all lookahead-safe: use bars up to & including the touch).
      const zAlign01 = zAlignScore(z, lvl.dir, { inverted: meta.inverted, zCap: cfg.zCap });
      const velRaw   = approachVelRangeScaled(closes, i, cfg.velWin, asia.range);
      const velScore = velToScore(velRaw, cfg.velRef);
      const struct   = structScore(lvl.mult);
      const confidence = compositeConfidence({ zAlign01, riskOff, velScore, struct }, cfg.weights);
      if (confidence < cfg.confThreshold) continue;

      const walk = walkTrade(times, highs, lows, opens, closes, i,
        exitIdx === dayEnd ? dayEnd : exitIdx, lvl.dir, entry, sl, tp);
      const pips = lvl.dir === 'LONG' ? (walk.exitPrice - entry) / meta.pip
                                      : (entry - walk.exitPrice) / meta.pip;

      trades.push({
        date: dateStr, pair: meta.pairKey.toUpperCase(), pairDisplay: meta.pairDisplay,
        dir: lvl.dir, side: lvl.side, fibLevel: lvl.mult,
        z: +z.toFixed(2), zTier,
        confidence: +confidence.toFixed(3), confBucket: confBucketOf(confidence),
        zAlign: +zAlign01.toFixed(3), riskOff: +riskOff.toFixed(3),
        velScore: +velScore.toFixed(3), structScore: +struct.toFixed(3),
        vixZ: vixZ != null ? +vixZ.toFixed(2) : null, hyZ: hyZ != null ? +hyZ.toFixed(2) : null,
        entry: +entry.toFixed(6), sl: +sl.toFixed(6), tp: +tp.toFixed(6),
        rr: +(rewardPips / riskPips).toFixed(2),
        asia_low: +asia.lo.toFixed(6), asia_high: +asia.hi.toFixed(6),
        result: walk.result, pips: +pips.toFixed(1),
        won: walk.result === 'TP', expired: walk.result === 'EXPIRED',
        fill_time: new Date(times[i] * 1000).toISOString(),
        exit_time: new Date(times[walk.exitIdx] * 1000).toISOString(),
      });
    }
  }
  return trades;
}

function statBlock(trades) {
  return { stats: computeZScoreStats(trades), confBuckets: computeConfBuckets(trades) };
}

// ── Per-pair / full runner ────────────────────────────────────────────────────────

export async function runZScoreV2Backtest(pairKey, opts = {}) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);

  const {
    dateFrom = '2018-01-01',
    dateTo = new Date().toISOString().substring(0, 10),
    zWindow = 90, entryWindow = 6,
    invert = {},
    fredKey = process.env.FRED_KEY,
  } = opts;
  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch yield data');

  const cf = {
    splitFrac:     opts.splitFrac     ?? V2_DEFAULTS.splitFrac,
    confThreshold: opts.confThreshold ?? V2_DEFAULTS.confThreshold,
    zGateMin:      opts.zGateMin      ?? V2_DEFAULTS.zGateMin,
    velWin:        opts.velWin        ?? V2_DEFAULTS.velWin,
    velRef:        opts.velRef        ?? V2_DEFAULTS.velRef,
    slFrac:        opts.slFrac        ?? V2_DEFAULTS.slFrac,
    minRR:         opts.minRR         ?? V2_DEFAULTS.minRR,
    zCap:          opts.zCap          ?? V2_DEFAULTS.zCap,
    weights:       opts.weights       ?? V2_DEFAULTS.weights,
    fibMults:      opts.fibMults      ?? V2_DEFAULTS.fibMults,
  };

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);

  const fredFrom = _shiftDate(dateFrom, -(zWindow + 14));
  const vixZWindow = opts.vixZWindow ?? V2_DEFAULTS.vixZWindow;
  const riskFrom = _shiftDate(dateFrom, -(vixZWindow + 14));
  const wantRisk = (cf.weights.riskOff ?? 0) > 0;
  const [usObs, otherObs, vixObs, hyObs] = await Promise.all([
    fetchFredObservations(cfg.baseSeries, fredFrom, fredKey),
    fetchFredObservations(cfg.quoteSeries, fredFrom, fredKey),
    wantRisk ? fetchFredObservations(RISKOFF_SERIES.vix, riskFrom, fredKey).catch(() => new Map()) : new Map(),
    wantRisk ? fetchFredObservations(RISKOFF_SERIES.hy,  riskFrom, fredKey).catch(() => new Map()) : new Map(),
  ]);
  const zByDate    = buildRollingZSeries(usObs, otherObs, zWindow, dateFrom, dateTo);
  const riskByDate = buildRiskOffByDate(vixObs, hyObs, vixZWindow, dateFrom, dateTo);

  const dayIndex = buildDayIndex(packed.times);
  const trades = [];
  let daysConsidered = 0, daysSkippedIncomplete = 0, daysNoZ = 0;
  const meta = { pip: cfg.pip, pairKey, pairDisplay: cfg.pairDisplay, inverted: !!invert[pairKey] };

  for (const [dateStr, { start, end }] of dayIndex) {
    if (dateStr < dateFrom || dateStr > dateTo) continue;
    const zInfo = zByDate.get(dateStr);
    if (zInfo == null) { daysNoZ++; continue; }
    daysConsidered++;

    const { asia, winStart, winEnd, exitIdx } = analyzeDay(
      packed.times, packed.opens, packed.highs, packed.lows, packed.closes, start, end, entryWindow);
    if (!asia.complete || winStart === -1) { daysSkippedIncomplete++; continue; }

    const zTier = Math.abs(zInfo.z) >= 3 ? '3.0+' : Math.abs(zInfo.z) >= 2.5 ? '2.5-3.0'
                : Math.abs(zInfo.z) >= 2 ? '2.0-2.5' : '<2.0';
    trades.push(...findDayTradesV2(packed, asia, winStart, winEnd, exitIdx, end,
      zInfo.z, zTier, dateStr, cf, meta, riskByDate.get(dateStr)));
  }

  const { splitDate, is, oos } = splitTradesByDate(trades, cf.splitFrac);
  return {
    trades,
    all: statBlock(trades),
    is:  statBlock(is),
    oos: statBlock(oos),
    splitDate,
    log: { pair: cfg.label, daysConsidered, daysSkippedIncomplete, daysNoZ, totalTrades: trades.length },
  };
}

export async function runFullZScoreV2Backtest(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const allTrades = [];
  const perPair = {};
  const log = [];
  for (const pairKey of pairKeys) {
    try {
      const r = await runZScoreV2Backtest(pairKey, opts);
      perPair[pairKey] = { all: r.all, is: r.is, oos: r.oos, splitDate: r.splitDate };
      allTrades.push(...r.trades);
      log.push(r.log);
    } catch (e) {
      log.push({ pair: pairKey, error: e?.message || String(e) });
    }
  }
  const splitFrac = opts.splitFrac ?? V2_DEFAULTS.splitFrac;
  const { splitDate, is, oos } = splitTradesByDate(allTrades, splitFrac);
  return {
    trades: allTrades,
    perPair,
    combined: { all: statBlock(allTrades), is: statBlock(is), oos: statBlock(oos), splitDate },
    log,
  };
}

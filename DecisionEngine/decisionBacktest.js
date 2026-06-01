// decisionBacktest.js — price-only decision engine for backtest tagging.
// No S.* deps, no DOM. Imported by backtest-worker.js.
// Uses the same runDecisionEngine() core but derives inputs from bar data.

import { runDecisionEngine } from './decisionEngine.js';

// ── Derive regime from 5m bar window ─────────────────────────────────────────
// Returns BULL | BEAR | RANGE | TRANSITION using DM ratio + direction.

export function backtestRegime(bar5mWin) {
  if (!bar5mWin || bar5mWin.length < 15) return 'TRANSITION';
  const w = bar5mWin.slice(0, 20).reverse(); // oldest→newest
  let pdm = 0, ndm = 0;
  for (let i = 1; i < w.length; i++) {
    pdm += Math.max(w[i].h - w[i-1].h, 0);
    ndm += Math.max(w[i-1].l - w[i].l,  0);
  }
  const tot = pdm + ndm;
  if (!tot) return 'RANGE';
  const ratio = Math.abs(pdm - ndm) / tot;
  if (ratio < 0.20) return 'RANGE';
  if (ratio < 0.30) return 'TRANSITION';
  return pdm > ndm ? 'BULL' : 'BEAR';
}

// ── Derive vol state from ATR and percentile ──────────────────────────────────

export function backtestVolState(atrPips, atrPercentile) {
  if (atrPercentile >= 90) return 'EXTREME';
  if (atrPercentile >= 70) return 'EXPANSION';
  if (atrPercentile <= 25) return 'COMPRESSION';
  return 'NORMAL';
}

// ── Derive session phase from London hour ────────────────────────────────────

export function backtestSessionPhase(lHour) {
  // Active window 08:00–21:00, split into thirds
  const elapsed = Math.max(0, lHour - 8) / 13;
  if (elapsed < 0.33) return 'EARLY';
  if (elapsed < 0.66) return 'MID';
  return 'LATE';
}

// ── Derive range utilisation from session progress ────────────────────────────

export function backtestRangeUtil(sessionHigh, sessionLow, atr) {
  if (!atr || sessionHigh == null || sessionLow == null) return 0.5;
  const used = sessionHigh - sessionLow;
  // atr ≈ one day's ATR; use 1.5× ATR as proxy for forecast median range
  const forecastMedian = atr * 1.5;
  return forecastMedian > 0 ? used / forecastMedian : 0.5;
}

// ── Confidence from DM ratio clarity ─────────────────────────────────────────

function backtestConfidence(bar5mWin) {
  if (!bar5mWin || bar5mWin.length < 15) return 0.45;
  const w = bar5mWin.slice(0, 20).reverse();
  let pdm = 0, ndm = 0;
  for (let i = 1; i < w.length; i++) {
    pdm += Math.max(w[i].h - w[i-1].h, 0);
    ndm += Math.max(w[i-1].l - w[i].l,  0);
  }
  const tot = pdm + ndm;
  if (!tot) return 0.45;
  const ratio = Math.abs(pdm - ndm) / tot;
  // 0 = coin-flip = 0.4 confidence; 0.5+ strong trend = 0.85 confidence
  return Math.min(0.85, 0.4 + ratio * 0.9);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a DecisionState for a single backtest bar.
 * All inputs are price-derivable — no FRED or macro data needed.
 *
 * @param {object} opts
 * @param {Array}  opts.bar5mWin     — 5m bar window, newest-first
 * @param {number} opts.atr          — current ATR in price units
 * @param {number} opts.atrPercentile — ATR percentile vs trailing 100 bars (0–100)
 * @param {number} opts.lHour        — London local hour (decimal)
 * @param {number} opts.sessionHigh  — highest price seen so far today
 * @param {number} opts.sessionLow   — lowest price seen so far today
 * @returns {import('./decisionEngine.js').DecisionState}
 */
export function getDecisionStateForBar({ bar5mWin, atr, atrPercentile, lHour, sessionHigh, sessionLow }) {
  const inputs = {
    regime:        backtestRegime(bar5mWin),
    volState:      backtestVolState(0, atrPercentile ?? 50),
    rangeUtil:     backtestRangeUtil(sessionHigh, sessionLow, atr),
    sessionPhase:  backtestSessionPhase(lHour),
    confidence:    backtestConfidence(bar5mWin),
    eventRisk:     null,  // not available in backtest
    cotPercentile: null,  // not available in backtest
  };
  return runDecisionEngine(inputs);
}

/**
 * Tag a trade object with decision engine state at entry.
 * Call this when building the openTrade object in backtest-worker.js.
 *
 * @param {object} opts — same shape as getDecisionStateForBar
 * @returns {{ decisionMode: string, decisionParticipation: string, decisionRiskMult: number,
 *             rangeUtilAtEntry: number, sessionPhaseAtEntry: string, volStateAtEntry: string }}
 */
export function tagTradeDecision(opts) {
  const state = getDecisionStateForBar(opts);
  return {
    decisionMode:          state.mode,
    decisionParticipation: state.participation,
    decisionRiskMult:      state.riskMult,
    rangeUtilAtEntry:      state.inputs.rangeUtil,
    sessionPhaseAtEntry:   state.inputs.sessionPhase,
    volStateAtEntry:       state.inputs.volState,
  };
}
